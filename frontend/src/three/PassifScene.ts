/**
 * Scènes 3D de la page « Passif » — Three.js.
 *
 * 1. HolderScene : qui détient l'encours. Une tour par teneur de compte (hauteur = part de l'encours, échelle linéaire),
 *    empilée par classification de compte (client actif, OPC, omnibus…), couleur = nature du compte.
 * 2. MatrixScene : la photo de l'encours en colonnes — desk × classe d'actifs, hauteur proportionnelle à la part de
 *    l'encours (en %, déjà calculée par l'API). Survol = infobulle ; la ligne et la colonne survolées restent seules vives.
 *
 * Les deux scènes partagent le gouverneur de qualité commun (Quality), se mettent en pause hors écran
 * (IntersectionObserver), suivent la taille de leur conteneur (ResizeObserver) et libèrent tout dans dispose().
 */
import { motionPaused } from "../lib/motion";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import gsap from "gsap";
import { Quality } from "./quality";

export type PTranche = { label: string; rank: number } | null;

// ===================================================================== socle commun
abstract class Stage {
  protected renderer: THREE.WebGLRenderer;
  protected scene = new THREE.Scene();
  protected camera: THREE.PerspectiveCamera;
  protected composer: EffectComposer;
  protected bloomPass: UnrealBloomPass;
  protected ray = new THREE.Raycaster();
  protected ptr = new THREE.Vector2(-9, -9);
  protected ptrClient = { x: 0, y: 0 };
  protected inside = false;
  protected visible = false;
  protected dirty = true;
  protected disposables: { dispose: () => void }[] = [];
  protected t0 = performance.now();
  private raf = 0;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  protected q: Quality;
  protected w = 1;
  protected h = 1;

  constructor(protected host: HTMLElement, protected reduced: boolean, bloom: [number, number, number], fov = 34) {
    this.w = Math.max(1, host.clientWidth); this.h = Math.max(1, host.clientHeight);
    this.q = new Quality(() => { this.renderer.setPixelRatio(this.q.pixelRatio()); this.composer.setPixelRatio(this.q.pixelRatio()); this.resize(); });
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.q.pixelRatio());
    this.renderer.setSize(this.w, this.h);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(fov, this.w / this.h, 0.5, 600);

    const rt = new THREE.WebGLRenderTarget(this.w, this.h, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.w, this.h), bloom[0], bloom[1], bloom[2]);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.dirty = true; });
    this.io.observe(host);
  }

  protected start() { this.resize(); this.loop(); }

  /** Une image : renvoie true si la scène bouge encore (cadence pleine). */
  protected abstract frame(t: number): boolean;
  protected abstract layout(w: number, h: number): void;
  protected abstract pick(): void;
  protected onClick(): void { /* facultatif */ }

  private downAt = { x: 0, y: 0, t: 0 };
  private onMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ptrClient = { x: e.clientX - r.left, y: e.clientY - r.top };
    this.inside = true;
    this.dirty = true;
    this.pick();
  };
  private onLeave = () => { this.inside = false; this.ptr.set(-9, -9); this.dirty = true; this.pick(); };
  private onDown = (e: PointerEvent) => { this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  private onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6 || performance.now() - this.downAt.t > 600) return;
    this.onClick();
  };

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible || document.hidden) return;
    const now = performance.now();
    // Animations réduites : on ne redessine que lorsqu'il se passe quelque chose (survol, redimensionnement)
    if ((this.reduced || motionPaused()) && !this.dirty) return;
    if (!this.q.gate(now, this.dirty)) return;
    const moving = this.frame((now - this.t0) / 1000);
    this.dirty = moving && !this.reduced && !motionPaused();
    if (this.q.bloom) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  };

  protected resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.w = w; this.h = h;
    this.camera.aspect = w / h;
    this.layout(w, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.setSize(w, h);
    this.dirty = true;
  }

  /** Projette un point du monde en pixels du conteneur. */
  protected toScreen(v: THREE.Vector3, out = { x: 0, y: 0, z: 0 }) {
    const p = v.clone().project(this.camera);
    out.x = (p.x * 0.5 + 0.5) * this.w; out.y = (-p.y * 0.5 + 0.5) * this.h; out.z = p.z;
    return out;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    this.disposables.forEach((d) => d.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    el.remove();
  }
}

// ===================================================================== 1. les teneurs de compte, en volume
export type HolderBlock = { teneur: string; classification: string; label: string; pct: number; nature: string; tranche?: PTranche };
export type HolderOptions = {
  reduced: boolean;
  labelLayer: HTMLElement;
  teneurs: { teneur: string; pct: number }[];
  colors: Record<string, string>;
  natureOrder: string[];
  fmt: (pct: number) => string;
  onHover: (b: HolderBlock | null, x: number, y: number) => void;
};

const T_W = 5.2;          // emprise d'une tour (carrée)
const T_GAP = 3.6;        // allée entre deux tours
const T_H = 30;           // hauteur de la tour la plus haute
const SEAM = 0.22;        // joint entre deux blocs empilés

type TBlock = { b: HolderBlock; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; edge: THREE.LineSegments; edgeMat: THREE.LineBasicMaterial;
  y0: number; h: number; cur: number; ti: number; order: number; alpha: number };

/**
 * Une tour par teneur de compte, sa hauteur = sa part de l'encours (linéaire) ; chaque bloc empilé = une classification
 * de compte (client actif, OPC, omnibus…), coloré par sa nature. Ouverture : les blocs se posent un à un, du bas vers le
 * haut, tour après tour. Survol = infobulle, la nature survolée reste seule vive ; rotation lente bornée au repos.
 */
export class HolderScene extends Stage {
  private world = new THREE.Group();
  private blocks: TBlock[] = [];
  private controls: OrbitControls;
  private labels: { el: HTMLDivElement; pos: THREE.Vector3 }[] = [];
  private hovered: TBlock | null = null;
  private focusNature: string | null = null;
  private played = false;
  private idle = 0;
  private span = 30;

  constructor(host: HTMLElement, private data: HolderBlock[], private opts: HolderOptions) {
    super(host, opts.reduced, [0.42, 0.55, 0.8], 32);
    this.scene.add(this.world);
    this.scene.add(new THREE.AmbientLight(0x6f84b0, 0.6));
    const key = new THREE.DirectionalLight(0xffe6bd, 1.9);
    key.position.set(30, 60, 40);
    const rim = new THREE.DirectionalLight(0x5b7fd0, 1.2);
    rim.position.set(-40, 20, -30);
    this.scene.add(key, rim);
    this.build();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.5;
    this.controls.minPolarAngle = 0.6;
    this.controls.maxPolarAngle = 1.38;
    this.controls.minAzimuthAngle = -0.9;
    this.controls.maxAzimuthAngle = 0.9;
    this.controls.addEventListener("change", () => { this.dirty = true; });
    this.controls.addEventListener("start", () => { this.idle = -1; });
    this.controls.addEventListener("end", () => { this.idle = performance.now(); });
    this.start();
    if (opts.reduced) { this.blocks.forEach((b) => { b.cur = 1; }); this.played = true; }
  }

  private build() {
    const ten = this.opts.teneurs;
    const max = Math.max(0.1, ...ten.map((t) => this.data.filter((b) => b.teneur === t.teneur).reduce((s, b) => s + b.pct, 0)));
    const k = T_H / max;
    const n = ten.length;
    const x0 = -((n - 1) * (T_W + T_GAP)) / 2;
    const geo = new THREE.BoxGeometry(T_W, 1, T_W);
    geo.translate(0, 0.5, 0);
    const edges = new THREE.EdgesGeometry(geo);
    this.disposables.push(geo, edges);
    // Sol : dalle sombre, trame fine et filet d'or sous l'alignement des tours
    const W = n * (T_W + T_GAP) + 12;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W * 3, W * 3), new THREE.MeshStandardMaterial({ color: 0x050a14, roughness: 0.95, metalness: 0.1 }));
    ground.rotation.x = -Math.PI / 2;
    const grid = new THREE.GridHelper(W * 2, Math.round(W * 2 / 2.2), 0x1c355e, 0x111f38);
    (grid.material as THREE.LineBasicMaterial).transparent = true;
    (grid.material as THREE.LineBasicMaterial).opacity = 0.35;
    grid.position.y = 0.01;
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-W / 2, 0.03, T_W / 2 + 1.2), new THREE.Vector3(W / 2, 0.03, T_W / 2 + 1.2)]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xcc9f53, transparent: true, opacity: 0.7 });
    this.world.add(ground, grid, new THREE.Line(lineGeo, lineMat));
    this.disposables.push(ground.geometry, ground.material as THREE.Material, grid.geometry, grid.material as THREE.Material, lineGeo, lineMat);
    const rank = (nat: string) => { const i = this.opts.natureOrder.indexOf(nat); return i < 0 ? 99 : i; };
    let order = 0;
    ten.forEach((t, ti) => {
      const list = this.data.filter((b) => b.teneur === t.teneur).sort((a, b) => rank(a.nature) - rank(b.nature) || b.pct - a.pct);
      let y = 0;
      const x = x0 + ti * (T_W + T_GAP);
      for (const b of list) {
        const h = Math.max(0.15, b.pct * k - SEAM);
        const col = new THREE.Color(this.opts.colors[b.nature] ?? "#8d929c");
        const mat = new THREE.MeshStandardMaterial({ color: 0x0b111d, emissive: col, emissiveIntensity: 0.32, metalness: 0.85, roughness: 0.3, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, 0);
        const edgeMat = new THREE.LineBasicMaterial({ color: col.clone().lerp(new THREE.Color("#f3dcaa"), 0.35), transparent: true, opacity: 0.9 });
        const edge = new THREE.LineSegments(edges, edgeMat);
        edge.position.copy(mesh.position);
        this.world.add(mesh, edge);
        const tb: TBlock = { b, mesh, mat, edge, edgeMat, y0: y, h, cur: 0, ti, order: order++, alpha: 1 };
        mesh.userData.tb = tb;
        this.blocks.push(tb);
        y += h + SEAM;
      }
      // Étiquette au pied de la tour : teneur et part de l'encours
      const el = document.createElement("div");
      el.className = "pa-ten3";
      const nm = document.createElement("b"), v = document.createElement("span");
      nm.textContent = t.teneur;
      v.textContent = this.opts.fmt(t.pct);
      el.append(nm, v);
      this.opts.labelLayer.appendChild(el);
      this.labels.push({ el, pos: new THREE.Vector3(x, 0, T_W / 2 + 1.6) });
    });
    this.span = Math.max(W, T_H * 1.4);
  }

  /** Les blocs se posent un à un (appelé quand la scène devient visible). */
  play() {
    if (this.played) return;
    this.played = true;
    this.blocks.forEach((b) => {
      gsap.to(b, { cur: 1, duration: 0.9, delay: 0.15 + b.order * 0.07, ease: "expo.out", onUpdate: () => { this.dirty = true; } });
    });
  }

  protected layout(w: number, h: number) {
    const fov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const span = this.span * 0.62;
    const d = Math.max(span / (Math.tan(fov) * (w / h)), (T_H * 0.72) / Math.tan(fov));
    if (!this.placed) {
      const az = 0.38, pol = 1.12;
      this.camera.position.set(d * Math.sin(pol) * Math.sin(az), d * Math.cos(pol) + T_H * 0.25, d * Math.sin(pol) * Math.cos(az));
      this.placed = true;
    } else this.camera.position.setLength(d);
    this.camera.lookAt(0, T_H * 0.42, 0);
    this.controls?.target.set(0, T_H * 0.42, 0);
  }
  private placed = false;

  protected pick() {
    let tb: TBlock | null = null;
    if (this.inside) {
      this.ray.setFromCamera(this.ptr, this.camera);
      const hit = this.ray.intersectObjects(this.blocks.map((b) => b.mesh), false)[0];
      tb = (hit?.object.userData.tb as TBlock) ?? null;
    }
    if (tb !== this.hovered) {
      this.hovered = tb;
      this.renderer.domElement.style.cursor = tb ? "pointer" : "grab";
      this.paint();
    }
    if (tb) {
      const s = this.toScreen(new THREE.Vector3(tb.mesh.position.x, tb.y0 + tb.h * tb.cur, tb.mesh.position.z));
      this.opts.onHover(tb.b, s.x, s.y);
    } else this.opts.onHover(null, 0, 0);
  }

  /** Mise en avant d'une nature de compte depuis la légende. */
  highlight(nature: string | null) { this.focusNature = nature; this.paint(); }

  private paint() {
    const hb = this.hovered, fn = this.focusNature;
    for (const b of this.blocks) {
      const on = hb ? b === hb || (b.b.nature === hb.b.nature) : !fn || b.b.nature === fn;
      b.alpha = on ? 1 : 0.18;
      b.mat.emissiveIntensity = b === hb ? 0.9 : on ? 0.32 : 0.08;
      b.edgeMat.opacity = on ? 0.95 : 0.15;
    }
    this.dirty = true;
  }

  protected frame(t: number): boolean {
    let moving = false;
    if (!this.reduced && this.idle !== -1 && performance.now() - this.idle > 2500 && !this.inside) {
      const sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
      sph.theta = Math.max(-0.9, Math.min(0.9, sph.theta + Math.sin(t * 0.18) * 0.0011));
      this.camera.position.setFromSpherical(sph).add(this.controls.target);
      moving = true;
    }
    this.controls.update();
    for (const b of this.blocks) {
      // Le bloc descend d'au-dessus de la tour et se pose à sa place
      const drop = (1 - b.cur) * 14;
      const s = Math.max(0.001, b.h * Math.min(1, b.cur * 1.4));
      b.mesh.position.y = b.y0 + drop;
      b.mesh.scale.y = s;
      b.edge.position.y = b.mesh.position.y;
      b.edge.scale.y = s;
      b.mat.opacity = b.alpha * Math.min(1, b.cur * 2);
    }
    for (const a of this.labels) {
      const p = this.toScreen(a.pos);
      a.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, 0)`;
    }
    return moving || this.blocks.some((b) => b.cur < 1);
  }

  dispose() {
    this.blocks.forEach((b) => { gsap.killTweensOf(b); b.mat.dispose(); b.edgeMat.dispose(); });
    this.labels.forEach((a) => a.el.remove());
    this.controls.dispose();
    super.dispose();
    this.opts.labelLayer.innerHTML = "";
  }
}

// ===================================================================== 2. desk × classe d'actifs
export type MatrixCell = { desk: string; classe_actif: string; pct: number };
export type MatrixOptions = {
  reduced: boolean;
  labelLayer: HTMLElement;
  rows: string[];
  cols: string[];
  colLabel: (c: string) => string;
  fmt: (pct: number) => string;
  onHover: (c: MatrixCell | null, x: number, y: number) => void;
};

const STEP = 3.4;
const FOOT = 1.9;
const MAXH = 12;
const LOW = new THREE.Color("#2a2112");
const HIGH = new THREE.Color("#d9ae62");
const CAP = new THREE.Color("#f3dcaa");

type Bar = { c: MatrixCell; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; cap: THREE.Mesh; capMat: THREE.MeshBasicMaterial; h: number; cur: number; ri: number; ci: number; label: HTMLDivElement | null };

export class MatrixScene extends Stage {
  private world = new THREE.Group();
  private bars: Bar[] = [];
  private controls: OrbitControls;
  private axis: { el: HTMLDivElement; pos: THREE.Vector3 }[] = [];
  private hovered: Bar | null = null;
  private played = false;
  private idle = 0;

  constructor(host: HTMLElement, private cells: MatrixCell[], private opts: MatrixOptions) {
    super(host, opts.reduced, [0.32, 0.5, 0.86], 30);
    this.scene.add(this.world);
    this.lights();
    this.build();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.55;
    this.controls.minPolarAngle = 0.55;
    this.controls.maxPolarAngle = 1.32;
    this.controls.minAzimuthAngle = -1.15;
    this.controls.maxAzimuthAngle = 1.15;
    this.controls.addEventListener("change", () => { this.dirty = true; });
    this.controls.addEventListener("start", () => { this.idle = -1; });
    this.controls.addEventListener("end", () => { this.idle = performance.now(); });
    this.start();
    if (opts.reduced) { this.bars.forEach((b) => { b.cur = 1; }); this.played = true; }
  }

  play() {
    if (this.played) return;
    this.played = true;
    this.bars.forEach((b) => gsap.to(b, { cur: 1, duration: 1.3, delay: 0.1 + (b.ri + b.ci) * 0.07, ease: "expo.out", onUpdate: () => { this.dirty = true; } }));
  }

  private lights() {
    this.scene.add(new THREE.HemisphereLight("#9fb3dc", "#0a0f1a", 1.15));
    const key = new THREE.DirectionalLight("#fff1dc", 1.5);
    key.position.set(-30, 50, 40);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight("#6189d6", 0.9);
    rim.position.set(40, 10, -50);
    this.scene.add(rim);
  }

  private build() {
    const { rows, cols } = this.opts;
    const W = cols.length * STEP, D = rows.length * STEP;
    const x0 = -W / 2 + STEP / 2, z0 = -D / 2 + STEP / 2;
    const max = Math.max(0.1, ...this.cells.map((c) => c.pct));
    // Socle : un plateau sombre et le quadrillage des cases
    const baseGeo = new THREE.BoxGeometry(W + 1.2, 0.3, D + 1.2);
    const baseMat = new THREE.MeshStandardMaterial({ color: "#0c1626", roughness: 0.9, metalness: 0.1 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.16;
    this.world.add(base);
    const pts: number[] = [];
    for (let i = 0; i <= cols.length; i++) { const x = -W / 2 + i * STEP; pts.push(x, 0.01, -D / 2, x, 0.01, D / 2); }
    for (let j = 0; j <= rows.length; j++) { const z = -D / 2 + j * STEP; pts.push(-W / 2, 0.01, z, W / 2, 0.01, z); }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const gridMat = new THREE.LineBasicMaterial({ color: "#2a3a58", transparent: true, opacity: 0.7 });
    this.world.add(new THREE.LineSegments(gridGeo, gridMat));
    this.disposables.push(baseGeo, baseMat, gridGeo, gridMat);

    const ranked = [...this.cells].sort((a, b) => b.pct - a.pct);
    const boxGeo = new THREE.BoxGeometry(FOOT, 1, FOOT);
    boxGeo.translate(0, 0.5, 0);
    const capGeo = new THREE.PlaneGeometry(FOOT * 0.96, FOOT * 0.96);
    capGeo.rotateX(-Math.PI / 2);
    this.disposables.push(boxGeo, capGeo);
    for (const c of this.cells) {
      const ri = rows.indexOf(c.desk), ci = cols.indexOf(c.classe_actif);
      if (ri < 0 || ci < 0) continue;
      const k = c.pct / max;
      const color = LOW.clone().lerp(HIGH, Math.sqrt(k) * 0.8 + 0.2);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.45, emissive: color.clone().multiplyScalar(0.06), transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(x0 + ci * STEP, 0, z0 + ri * STEP);
      const capMat = new THREE.MeshBasicMaterial({ color: CAP.clone().multiplyScalar(0.35 + k * 0.75), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.copy(mesh.position);
      this.world.add(mesh, cap);
      const h = Math.max(0.08, (c.pct / max) * MAXH);
      let label: HTMLDivElement | null = null;
      if (ranked.indexOf(c) < 4) {
        label = document.createElement("div");
        label.className = "pa-bar3";
        label.textContent = this.opts.fmt(c.pct);
        this.opts.labelLayer.appendChild(label);
      }
      const bar: Bar = { c, mesh, mat, cap, capMat, h, cur: 0, ri, ci, label };
      mesh.userData.bar = bar;
      this.bars.push(bar);
    }
    // Axes : desks à gauche des rangées, classes d'actifs devant les colonnes
    rows.forEach((r, j) => this.axisLabel(r, new THREE.Vector3(-W / 2 - 0.9, 0, z0 + j * STEP), "pa-axis3 pa-axis3--row"));
    cols.forEach((c, i) => this.axisLabel(this.opts.colLabel(c), new THREE.Vector3(x0 + i * STEP, 0, D / 2 + 1.1), "pa-axis3 pa-axis3--col"));
    this.cornerFit = Math.max(W, D);
  }
  private cornerFit = 20;

  private axisLabel(text: string, pos: THREE.Vector3, cls: string) {
    const el = document.createElement("div");
    el.className = cls;
    el.textContent = text;
    this.opts.labelLayer.appendChild(el);
    this.axis.push({ el, pos });
  }

  protected layout(w: number, h: number) {
    const fov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const span = this.cornerFit * 0.85 + 5;
    const d = Math.max(span / (Math.tan(fov) * (w / h)), (span * 0.75) / Math.tan(fov));
    if (!this.placed) {
      const az = -0.5, pol = 0.96;
      this.camera.position.set(d * Math.sin(pol) * Math.sin(az), d * Math.cos(pol), d * Math.sin(pol) * Math.cos(az));
      this.placed = true;
    } else this.camera.position.setLength(d);
    this.camera.lookAt(0, 3.4, 0);
    this.controls?.target.set(0, 3.4, 0);
  }
  private placed = false;

  protected pick() {
    let bar: Bar | null = null;
    if (this.inside) {
      this.ray.setFromCamera(this.ptr, this.camera);
      const hit = this.ray.intersectObjects(this.bars.map((b) => b.mesh), false)[0];
      bar = (hit?.object.userData.bar as Bar) ?? null;
    }
    if (bar !== this.hovered) {
      this.hovered = bar;
      this.renderer.domElement.style.cursor = bar ? "pointer" : "grab";
      this.paint();
    }
    if (bar) {
      const top = bar.mesh.position.clone(); top.y = bar.h * bar.cur;
      const s = this.toScreen(top);
      this.opts.onHover(bar.c, s.x, s.y);
    } else this.opts.onHover(null, 0, 0);
  }

  /** Mise en avant depuis l'extérieur (tableau, clavier). */
  highlight(desk: string | null, classe: string | null) {
    this.focusRow = desk ? this.opts.rows.indexOf(desk) : -1;
    this.focusCol = classe ? this.opts.cols.indexOf(classe) : -1;
    this.paint();
  }
  private focusRow = -1;
  private focusCol = -1;

  private paint() {
    const hb = this.hovered;
    const fr = this.focusRow, fc = this.focusCol, ext = fr >= 0 || fc >= 0;
    for (const b of this.bars) {
      const on = hb ? b.ri === hb.ri || b.ci === hb.ci : !ext || ((fr < 0 || b.ri === fr) && (fc < 0 || b.ci === fc));
      b.mat.opacity = on ? 1 : 0.22;
      b.mat.emissiveIntensity = b === hb ? 5 : 1;
      b.capMat.opacity = on ? 0.9 : 0.15;
    }
    this.dirty = true;
  }

  protected frame(t: number): boolean {
    const v = new THREE.Vector3();
    let moving = false;
    // Balancement lent au repos (jamais pendant une manipulation, jamais en animations réduites)
    if (!this.reduced && this.idle !== -1 && performance.now() - this.idle > 2500 && !this.inside) {
      const sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
      sph.theta += Math.sin(t * 0.25) * 0.0009;
      this.camera.position.setFromSpherical(sph).add(this.controls.target);
      moving = true;
    }
    this.controls.update();
    for (const b of this.bars) {
      const hh = Math.max(0.001, b.h * b.cur);
      b.mesh.scale.y = hh;
      b.cap.position.y = hh + 0.01;
      if (b.label) {
        v.copy(b.mesh.position); v.y = hh + 0.5;
        const p = this.toScreen(v);
        b.label.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
        b.label.style.opacity = String(Math.min(1, b.cur * 2) * (!this.hovered || this.hovered === b ? 1 : 0.25));
      }
    }
    for (const a of this.axis) {
      const p = this.toScreen(a.pos);
      a.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(${a.el.classList.contains("pa-axis3--row") ? "-100%" : "-50%"}, -50%)`;
    }
    return moving || this.bars.some((b) => b.cur < 1);
  }

  dispose() {
    this.bars.forEach((b) => { gsap.killTweensOf(b); b.mat.dispose(); b.capMat.dispose(); b.label?.remove(); });
    this.axis.forEach((a) => a.el.remove());
    this.controls.dispose();
    super.dispose();
    this.opts.labelLayer.innerHTML = "";
  }
}
