/**
 * Démo — la cité de la collecte, en Three.js. Sobre : ni missions ni niveaux, une lecture.
 *
 * Une tour = un fonds, posée sur une dalle de verre. Les fonds qui collectent s'élèvent en or au-dessus de la dalle ;
 * ceux qui décollectent descendent, grenat, sous la dalle (on les voit par transparence). Hauteur linéaire (comparable
 * à l'œil) à la collecte nette estimée de la période ; emprise proportionnelle à √encours. Un quartier par famille de
 * gestion. Changer de période fait monter ou descendre chaque tour vers sa nouvelle valeur.
 * Interaction : glisser pour tourner, survol = infobulle, clic = fiche. Rendu suspendu hors écran (quality.ts).
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import gsap from "gsap";
import { motionPaused } from "../lib/motion";
import { Quality } from "./quality";

export type FlowFund = { id: string; name: string; family: string; aum: number };
export type FlowCityOptions = {
  funds: FlowFund[];
  colors: Record<string, string>;
  districtNames: Record<string, string>;
  reduced: boolean;
  labelLayer: HTMLElement;
  formatEur: (v: number, signed?: boolean) => string;
  onHover: (f: FlowFund | null, x: number, y: number) => void;
  onSelect: (f: FlowFund) => void;
};

const ORDER = ["aid", "ae", "fi", "ao", "nc"];
const H_MAX = 34;
const SPACING = 9.5;
const GOLD = new THREE.Color("#cc9f53"), GOLD_HI = new THREE.Color("#f1d9a6");
const GARNET = new THREE.Color("#a3284f"), GARNET_HI = new THREE.Color("#e47b98");
const NEUTRAL = new THREE.Color("#3a4254");
const VIEW = { pos: new THREE.Vector3(92, 58, 112), target: new THREE.Vector3(0, -2, 0) };

type Tower = {
  f: FlowFund; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; cap: THREE.Mesh; capMat: THREE.MeshStandardMaterial;
  foot: THREE.Mesh; footMat: THREE.MeshBasicMaterial; x: number; z: number; w: number;
  s: number; value: number | null; hover: number; dim: number; label?: HTMLDivElement;
};

export class FlowCityScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.5, 2000);
  private controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private quality: Quality;
  private towers: Tower[] = [];
  private byId = new Map<string, Tower>();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-2, -2);
  private hovered: Tower | null = null;
  private selected: Tower | null = null;
  private focus: string | null = null;
  private raf = 0;
  private visible = true;
  private idleSpin = true;
  private intro = { k: 0 };
  private played = false;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private districts: { el: HTMLDivElement; x: number; z: number }[] = [];
  private labelled: Tower[] = [];
  private pending: Map<string, number | null> | null = null;

  constructor(private host: HTMLElement, private o: FlowCityOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x040810, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.quality = new Quality(() => this.applyQuality());
    this.scene.fog = new THREE.FogExp2(0x040810, 0.0058);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = 1.62;          // on peut passer sous la dalle pour voir la décollecte
    this.controls.rotateSpeed = 0.5;
    this.controls.addEventListener("start", () => { this.idleSpin = false; });

    this.build();
    this.applyQuality();
    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("click", this.onClick);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; });
    this.io.observe(host);
    this.resize();
    this.camera.position.set(0.01, 210, 0.01);
    this.controls.target.set(0, 0, 0);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- construction
  private build() {
    this.scene.add(new THREE.AmbientLight(0x7086b4, 0.6));
    const key = new THREE.DirectionalLight(0xffe7bf, 1.3);
    key.position.set(70, 130, 50);
    this.scene.add(key);
    const under = new THREE.DirectionalLight(0x9a3a5c, 0.9);   // lumière basse : la décollecte sous la dalle
    under.position.set(-40, -90, 30);
    this.scene.add(under);
    const rim = new THREE.DirectionalLight(0x5f86d4, 0.7);
    rim.position.set(-90, 40, -70);
    this.scene.add(rim);

    // Dalle de verre, ligne d'horizon de la collecte nulle
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({
      color: 0x070d19, metalness: 0.35, roughness: 0.55, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    glass.rotation.x = -Math.PI / 2;
    this.scene.add(glass);

    // Quartiers : blocs en grille, deux par rangée, les plus gros flux au centre de chaque bloc
    const fams = ORDER.filter((k) => this.o.funds.some((f) => f.family === k));
    const maxAum = Math.max(1, ...this.o.funds.map((f) => f.aum));
    const blocks = fams.map((fam) => {
      const list = this.o.funds.filter((f) => f.family === fam).sort((a, b) => b.aum - a.aum);
      const cols = Math.max(2, Math.ceil(Math.sqrt(list.length)));
      const rows = Math.ceil(list.length / cols);
      return { fam, list, cols, rows, w: cols * SPACING, d: rows * SPACING };
    });
    const GAP = 16;
    const perRow = blocks.length <= 4 ? 2 : 3;
    const rowsOfBlocks: (typeof blocks)[] = [];
    for (let i = 0; i < blocks.length; i += perRow) rowsOfBlocks.push(blocks.slice(i, i + perRow));
    const totalD = rowsOfBlocks.reduce((s, r) => s + Math.max(...r.map((b) => b.d)), 0) + GAP * (rowsOfBlocks.length - 1);
    let z0 = -totalD / 2;
    const lineMat = new THREE.LineBasicMaterial({ color: 0xcc9f53, transparent: true, opacity: 0.22 });
    for (const row of rowsOfBlocks) {
      const rowD = Math.max(...row.map((b) => b.d));
      const rowW = row.reduce((s, b) => s + b.w, 0) + GAP * (row.length - 1);
      let x0 = -rowW / 2;
      for (const b of row) {
        // contour du quartier, à fleur de dalle
        const pad = 3;
        const pts = [[x0 - pad, z0 - pad], [x0 + b.w + pad, z0 - pad], [x0 + b.w + pad, z0 + b.d + pad], [x0 - pad, z0 + b.d + pad], [x0 - pad, z0 - pad]]
          .map(([a, c]) => new THREE.Vector3(a, 0.03, c));
        this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
        const name = document.createElement("div");
        name.className = "fc3d__district";
        name.textContent = this.o.districtNames[b.fam] ?? b.fam;
        name.style.setProperty("--c", this.o.colors[b.fam] ?? "#8d929c");
        this.o.labelLayer.appendChild(name);
        this.districts.push({ el: name, x: x0 + b.w / 2, z: z0 - pad - 2.5 });
        b.list.forEach((f, i) => {
          const cx = x0 + (i % b.cols) * SPACING + SPACING / 2;
          const cz = z0 + Math.floor(i / b.cols) * SPACING + SPACING / 2;
          this.addTower(f, cx, cz, 1.3 + 4.4 * Math.sqrt(f.aum / maxAum));
        });
        x0 += b.w + GAP;
      }
      z0 += rowD + GAP;
    }
  }

  private addTower(f: FlowFund, x: number, z: number, w: number) {
    const mat = new THREE.MeshStandardMaterial({ color: NEUTRAL.clone(), emissive: NEUTRAL.clone(), emissiveIntensity: 0.18, metalness: 0.25, roughness: 0.55,
      transparent: true, opacity: 0.97 });
    const geo = new THREE.BoxGeometry(w, 1, w);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0, z);
    mesh.scale.y = 0.001;
    mesh.userData.i = this.towers.length;
    const capMat = new THREE.MeshStandardMaterial({ color: 0xf6e7c6, emissive: 0xf1d9a6, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.3 });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.32, w * 1.04), capMat);
    cap.position.set(x, 0, z);
    const footMat = new THREE.MeshBasicMaterial({ color: 0xcc9f53, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false });
    const foot = new THREE.Mesh(new THREE.RingGeometry(w * 0.78, w * 0.98, 4, 1, Math.PI / 4), footMat);
    foot.rotation.x = -Math.PI / 2;
    foot.position.set(x, 0.05, z);
    this.scene.add(mesh, cap, foot);
    const t: Tower = { f, mesh, mat, cap, capMat, foot, footMat, x, z, w, s: 0, value: null, hover: 0, dim: 1 };
    this.towers.push(t);
    this.byId.set(f.id, t);
  }

  private apply(t: Tower) {
    const s = t.s, a = Math.abs(s);
    t.mesh.rotation.x = s < 0 ? Math.PI : 0;
    t.mesh.scale.y = Math.max(0.001, a);
    t.cap.position.y = s < 0 ? -a - 0.16 : a + 0.16;
    t.cap.visible = a > 0.05;
    const k = Math.min(1, a / (H_MAX * 0.6));
    const base = t.value == null ? NEUTRAL : s >= 0 ? GOLD.clone().lerp(GOLD_HI, k * 0.45) : GARNET.clone().lerp(GARNET_HI, k * 0.4);
    t.mat.color.copy(base).multiplyScalar(0.62);
    t.mat.emissive.copy(base);
    t.capMat.emissive.copy(s >= 0 ? GOLD_HI : GARNET_HI);
    t.capMat.color.copy(s >= 0 ? GOLD_HI : GARNET_HI);
    t.footMat.color.copy(s >= 0 ? GOLD : GARNET);
  }

  /** Nouvelle période : collecte nette de chaque fonds (null : non calculable). Les tours glissent vers leur valeur. */
  setValues(values: Map<string, number | null>) {
    if (!this.played) { this.pending = values; return; }
    const finite = [...values.values()].filter((v): v is number => v != null && isFinite(v));
    const max = Math.max(1, ...finite.map((v) => Math.abs(v)));
    const order = [...this.towers].sort((a, b) => Math.abs(values.get(b.f.id) ?? 0) - Math.abs(values.get(a.f.id) ?? 0));
    order.forEach((t, i) => {
      const v = values.get(t.f.id) ?? null;
      t.value = v;
      const target = v == null ? 0.001 : Math.sign(v) * Math.max(0.35, (Math.abs(v) / max) * H_MAX);
      gsap.killTweensOf(t);
      if (this.o.reduced) { t.s = target; this.apply(t); return; }
      gsap.to(t, { s: target, duration: 1.1, delay: Math.min(0.5, i * 0.012), ease: "expo.inOut", onUpdate: () => this.apply(t) });
      this.apply(t);
    });
    this.relabel(values);
  }

  private relabel(values: Map<string, number | null>) {
    this.labelled.forEach((t) => { t.label?.remove(); t.label = undefined; });
    const withV = this.towers.filter((t) => values.get(t.f.id) != null);
    const ups = withV.filter((t) => (values.get(t.f.id) ?? 0) > 0).sort((a, b) => (values.get(b.f.id) ?? 0) - (values.get(a.f.id) ?? 0)).slice(0, 3);
    const downs = withV.filter((t) => (values.get(t.f.id) ?? 0) < 0).sort((a, b) => (values.get(a.f.id) ?? 0) - (values.get(b.f.id) ?? 0)).slice(0, 2);
    this.labelled = [...ups, ...downs];
    for (const t of this.labelled) {
      const v = values.get(t.f.id) ?? 0;
      const d = document.createElement("div");
      d.className = `fc3d__label ${v >= 0 ? "is-up" : "is-down"}`;
      d.innerHTML = "<b></b><i></i>";
      (d.querySelector("b") as HTMLElement).textContent = t.f.name;
      (d.querySelector("i") as HTMLElement).textContent = this.o.formatEur(v, true);
      this.o.labelLayer.appendChild(d);
      t.label = d;
    }
  }

  /** Ouverture : la caméra descend du zénith pendant que les tours prennent leur valeur. */
  play() {
    if (this.played) return;
    this.played = true;
    const v = this.pending;
    this.pending = null;
    if (this.o.reduced) {
      this.camera.position.copy(VIEW.pos);
      this.controls.target.copy(VIEW.target);
      this.intro.k = 1;
    } else {
      gsap.to(this.camera.position, { x: VIEW.pos.x, y: VIEW.pos.y, z: VIEW.pos.z, duration: 2.6, ease: "power3.inOut" });
      gsap.to(this.controls.target, { x: VIEW.target.x, y: VIEW.target.y, z: VIEW.target.z, duration: 2.6, ease: "power3.inOut" });
      gsap.to(this.intro, { k: 1, duration: 1.2, delay: 1.4 });
    }
    if (v) this.setValues(v);
  }

  setFocus(fam: string | null) { this.focus = fam; }

  select(id: string | null) {
    this.selected = id ? this.byId.get(id) ?? null : null;
    if (!this.selected) return;
    this.idleSpin = false;
    const t = this.selected, d = this.o.reduced ? 0 : 1.1;
    const c = this.controls.target, p = this.camera.position;
    const dir = new THREE.Vector3(p.x - c.x, 0, p.z - c.z).normalize();
    const y = t.s * 0.5;
    gsap.to(this.controls.target, { x: t.x, y, z: t.z, duration: d, ease: "power3.inOut" });
    gsap.to(this.camera.position, { x: t.x + dir.x * 62, y: y + 30, z: t.z + dir.z * 62, duration: d, ease: "power3.inOut" });
  }

  resetView() {
    this.selected = null;
    this.idleSpin = !this.o.reduced;
    const d = this.o.reduced ? 0 : 0.9;
    gsap.to(this.camera.position, { x: VIEW.pos.x, y: VIEW.pos.y, z: VIEW.pos.z, duration: d, ease: "power3.inOut" });
    gsap.to(this.controls.target, { x: VIEW.target.x, y: VIEW.target.y, z: VIEW.target.z, duration: d, ease: "power3.inOut" });
  }

  /** Vue rasante sous la dalle (la décollecte) ou au-dessus (la collecte). */
  tilt(under: boolean) {
    this.idleSpin = false;
    const d = this.o.reduced ? 0 : 1.2;
    const c = this.controls.target, p = this.camera.position;
    const dir = new THREE.Vector3(p.x - c.x, 0, p.z - c.z).normalize();
    gsap.to(this.camera.position, { x: c.x + dir.x * 140, y: under ? -40 : 58, z: c.z + dir.z * 140, duration: d, ease: "power3.inOut" });
  }

  // ---------------------------------------------------------------- interaction
  private onMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.towers.map((t) => t.mesh), false)[0];
    const t = hit ? this.towers[hit.object.userData.i as number] : null;
    this.hovered = t;
    this.renderer.domElement.style.cursor = t ? "pointer" : "grab";
    this.o.onHover(t?.f ?? null, e.clientX, e.clientY);
  };
  private onLeave = () => { this.hovered = null; this.o.onHover(null, 0, 0); };
  private onClick = () => { if (this.hovered) this.o.onSelect(this.hovered.f); };

  // ---------------------------------------------------------------- rendu
  private applyQuality() {
    this.renderer.setPixelRatio(this.quality.pixelRatio());
    if (this.quality.bloom && !this.composer) {
      const size = new THREE.Vector2(this.host.clientWidth || 800, this.host.clientHeight || 600);
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(size, 0.55, 0.5, 0.74));
      this.composer.addPass(new OutputPass());
    } else if (!this.quality.bloom && this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    this.resize();
  }

  private resize() {
    const w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.fov = w < 700 ? 52 : 36;
    // sur grand écran, la cité se décale à droite du bloc de lecture (période, total)
    if (w >= 1000) this.camera.setViewOffset(w, h, -w * 0.12, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible) return;
    const busy = this.intro.k < 1 || gsap.isTweening(this.camera.position) || this.towers.some((t) => gsap.isTweening(t));
    if (!this.quality.gate(now, busy)) return;
    if (this.idleSpin && this.intro.k >= 1 && !motionPaused()) {
      const p = this.camera.position, c = this.controls.target, a = 0.0008;
      const x = p.x - c.x, z = p.z - c.z;
      p.x = c.x + x * Math.cos(a) - z * Math.sin(a);
      p.z = c.z + x * Math.sin(a) + z * Math.cos(a);
    }
    this.controls.update();
    for (const t of this.towers) {
      const on = this.hovered === t || this.selected === t ? 1 : 0;
      t.hover += (on - t.hover) * 0.15;
      const dimT = this.focus && t.f.family !== this.focus ? 0.15 : this.selected && this.selected !== t ? 0.4 : 1;
      t.dim += (dimT - t.dim) * 0.1;
      t.mat.opacity = 0.18 + 0.79 * t.dim;
      t.mat.emissiveIntensity = (0.16 + t.hover * 0.35) * (0.4 + 0.6 * t.dim);
      t.capMat.emissiveIntensity = (0.4 + t.hover * 0.6) * (0.3 + 0.7 * t.dim);
      t.footMat.opacity = (Math.abs(t.s) > 0.05 ? 0.35 : 0) * t.dim + t.hover * 0.4;
    }
    this.placeLabels();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  };

  private placeLabels() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const v = new THREE.Vector3();
    for (const d of this.districts) {
      v.set(d.x, 0.2, d.z).project(this.camera);
      d.el.style.opacity = v.z < 1 && this.intro.k > 0.3 ? String(Math.min(1, this.intro.k)) : "0";
      d.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
    }
    const placed: [number, number, number, number][] = [];
    for (const t of this.labelled) {
      const el = t.label;
      if (!el) continue;
      const up = t.s >= 0;
      v.set(t.x, up ? t.s + 2 : t.s - 2, t.z).project(this.camera);
      const bw = el.offsetWidth || 120, bh = el.offsetHeight || 36;
      const x = ((v.x + 1) / 2) * w;
      let y = ((1 - v.y) / 2) * h + (up ? 0 : bh);
      for (let moved = true, n = 0; moved && n < 8; n++) {
        moved = false;
        for (const [px, py, pw, ph] of placed) {
          if (Math.abs(x - px) < (bw + pw) / 2 + 4 && y > py - ph - 4 && y - bh < py + 4) { y = up ? py - ph - 6 : py + bh + 6; moved = true; }
        }
      }
      placed.push([x, y, bw, bh]);
      const vis = v.z < 1 && this.intro.k > 0.5 && t.dim > 0.5 && y - bh > 8 && y < h - 8;
      el.style.opacity = vis ? "1" : "0";
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    gsap.killTweensOf([this.camera.position, this.controls.target, this.intro, ...this.towers]);
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("click", this.onClick);
    this.labelled.forEach((t) => t.label?.remove());
    this.districts.forEach((d) => d.el.remove());
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    this.controls.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    el.remove();
  }
}
