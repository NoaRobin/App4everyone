/**
 * Comparateur — « podium » 3D d'un indicateur.
 *
 * Une colonne par fonds, rangées de la meilleure à la moins bonne valeur (le sens « meilleur » dépend de l'indicateur).
 * Hauteur proportionnelle à la valeur, depuis un sol de verre (les valeurs négatives descendent sous le sol).
 * Changer d'indicateur : les colonnes changent de hauteur et de place (reclassement animé). Valeur, rang et nom en HTML.
 */
import * as THREE from "three";
import gsap from "gsap";
import { Quality } from "./quality";

export type PodiumBar = { id: string; name: string; color: string; slot: number; value: number | null; text: string };
export type PodiumOptions = {
  reduced: boolean;
  labelLayer: HTMLElement;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
};

const MAXH = 6.2;     // hauteur de la plus grande colonne
const PITCH = 2.7;    // pas entre deux colonnes
const BW = 1.15;      // largeur d'une colonne

type Col = {
  id: string; bar: PodiumBar;
  mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial;
  cap: THREE.Mesh; capMat: THREE.MeshBasicMaterial;
  ring: THREE.Mesh; ringMat: THREE.MeshBasicMaterial;
  st: { x: number; h: number; o: number };
  el: HTMLElement; vEl: HTMLElement; rEl: HTMLElement;
  dim: number;
};

export class ComparePodium {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private q = new Quality(() => this.applyQuality());
  private cols = new Map<string, Col>();
  private boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  private capGeo = new THREE.PlaneGeometry(1, 1);
  private ringGeo = new THREE.RingGeometry(0.62, 0.7, 48);
  private floor: THREE.Mesh;
  private disposables: { dispose: () => void }[] = [];
  private hovered: string | null = null;
  private external: string | null = null;
  private ray = new THREE.Raycaster();
  private ptr = new THREE.Vector2();
  private raf = 0;
  private t0 = performance.now();
  private visible = true;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private span = { lo: 0, hi: MAXH };
  private v = new THREE.Vector3();
  private n = 0;

  constructor(private host: HTMLElement, private opts: PodiumOptions) {
    const w = host.clientWidth || 700, h = host.clientHeight || 420;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.q.pixelRatio());
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(28, w / h, 1, 300);

    this.scene.add(new THREE.HemisphereLight("#c9d6f2", "#0a1322", 1.15));
    const key = new THREE.DirectionalLight("#fff1d6", 1.9);
    key.position.set(-8, 14, 12);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight("#6189d6", 0.9);
    rim.position.set(10, 4, -10);
    this.scene.add(rim);

    // Sol de verre : dégradé radial, filet d'or au niveau zéro
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(97,137,214,0.20)"); grd.addColorStop(0.55, "rgba(28,53,94,0.12)"); grd.addColorStop(1, "rgba(6,11,21,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const fGeo = new THREE.CircleGeometry(13, 64);
    const fMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.floor = new THREE.Mesh(fGeo, fMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.scale.set(1.25, 0.55, 1);
    this.scene.add(this.floor);
    const zl = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-11, 0.002, 1.3), new THREE.Vector3(11, 0.002, 1.3)]);
    const zm = new THREE.LineBasicMaterial({ color: "#cc9f53", transparent: true, opacity: 0.45 });
    this.scene.add(new THREE.Line(zl, zm));
    this.disposables.push(tex, fGeo, fMat, zl, zm, this.boxGeo, this.capGeo, this.ringGeo);

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("click", this.onClick);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }, { threshold: 0 });
    this.io.observe(host);
    this.resize();
    this.loop();
  }

  /** Barres déjà classées (meilleure d'abord). */
  setBars(bars: PodiumBar[], animate = true) {
    const anim = animate && !this.opts.reduced;
    const vals = bars.map((b) => b.value).filter((v): v is number => v != null && isFinite(v));
    const maxAbs = Math.max(1e-12, ...vals.map(Math.abs));
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    this.span = { lo: (lo / maxAbs) * MAXH, hi: (hi / maxAbs) * MAXH };
    this.n = bars.length;
    const seen = new Set<string>();
    bars.forEach((b, i) => {
      seen.add(b.id);
      let col = this.cols.get(b.id);
      const x = (i - (bars.length - 1) / 2) * PITCH;
      const h = b.value == null || !isFinite(b.value) ? 0 : (b.value / maxAbs) * MAXH;
      if (!col) col = this.addCol(b, x);
      col.bar = b;
      col.vEl.textContent = b.text;
      (col.rEl.firstChild as HTMLElement).textContent = b.value == null ? "—" : i === 0 ? "1er" : `${i + 1}e`;
      (col.rEl.lastChild as HTMLElement).textContent = `${String.fromCharCode(65 + b.slot)} · ${b.name}`;
      col.el.classList.toggle("is-null", b.value == null);
      // Valeur absente : la place reste marquée (rang « — »), la colonne s'efface
      const isNull = b.value == null || !isFinite(b.value);
      const to = { x, h: isNull ? 0.001 : Math.abs(h) < 0.03 ? (h < 0 ? -0.03 : 0.03) : h, o: isNull ? 0.35 : 1 };
      if (anim) gsap.to(col.st, { ...to, duration: 1.05, delay: i * 0.05, ease: "expo.out" });
      else Object.assign(col.st, to);
    });
    [...this.cols.keys()].filter((k) => !seen.has(k)).forEach((k) => this.removeCol(k));
    this.resize();
  }

  focus(id: string | null) { this.external = id; }

  private addCol(b: PodiumBar, x: number): Col {
    const color = new THREE.Color(b.color);
    const mat = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.8), roughness: 0.28, metalness: 0.2, emissive: color.clone().multiplyScalar(0.16), transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(this.boxGeo, mat);
    mesh.userData.id = b.id;
    const capMat = new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color("#ffffff"), 0.25).multiplyScalar(1.15), transparent: true, opacity: 0.95, side: THREE.DoubleSide });
    const cap = new THREE.Mesh(this.capGeo, capMat);
    cap.rotation.x = -Math.PI / 2;
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.scene.add(mesh, cap, ring);
    const el = document.createElement("div");
    el.className = "pod3d__lbl";
    const vEl = document.createElement("span"); vEl.className = "pod3d__v";
    el.appendChild(vEl);
    const rEl = document.createElement("div"); rEl.className = "pod3d__rank";
    const rNum = document.createElement("span"); rNum.className = "pod3d__r"; rNum.style.borderColor = b.color;
    const rName = document.createElement("span"); rName.className = "pod3d__n";
    rEl.append(rNum, rName);
    this.opts.labelLayer.append(el, rEl);
    const col: Col = { id: b.id, bar: b, mesh, mat, cap, capMat, ring, ringMat, st: { x, h: 0.001, o: 0 }, el, vEl, rEl, dim: 0 };
    this.cols.set(b.id, col);
    return col;
  }

  private removeCol(id: string) {
    const c = this.cols.get(id);
    if (!c) return;
    gsap.killTweensOf(c.st);
    this.scene.remove(c.mesh, c.cap, c.ring);
    c.mat.dispose(); c.capMat.dispose(); c.ringMat.dispose();
    c.el.remove(); c.rEl.remove();
    this.cols.delete(id);
  }

  private onMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ptr, this.camera);
    const hit = this.ray.intersectObjects([...this.cols.values()].map((c) => c.mesh), false)[0];
    // Cible plus large que la colonne : à défaut d'impact, la colonne la plus proche en x (à moins d'un demi-pas)
    let id = (hit?.object.userData.id as string | undefined) ?? null;
    if (!id) {
      const p = new THREE.Vector3();
      if (this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), p)) {
        let best: Col | null = null, d = PITCH / 2;
        this.cols.forEach((c) => { const dd = Math.abs(c.st.x - p.x); if (dd < d && p.y > Math.min(0, c.st.h) - 1 && p.y < Math.max(0, c.st.h) + 1.2) { d = dd; best = c; } });
        id = (best as Col | null)?.id ?? null;
      }
    }
    if (id !== this.hovered) {
      this.hovered = id;
      this.opts.onHover(id);
      this.renderer.domElement.style.cursor = id ? "pointer" : "";
    }
  };
  private onLeave = () => { if (this.hovered) { this.hovered = null; this.opts.onHover(null); } };
  private onClick = () => { if (this.hovered) this.opts.onSelect(this.hovered); };

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const busy = [...this.cols.values()].some((c) => gsap.isTweening(c.st)) || !!this.hovered;
    if (!this.visible || document.hidden || !this.q.gate(now, busy)) return;
    const t = (now - this.t0) / 1000;
    // Caméra : léger balancement
    const sway = this.opts.reduced ? 0 : Math.sin(t * 0.22) * 0.09;
    const mid = (this.span.lo + this.span.hi) / 2;
    const r = this.dist();
    this.camera.position.set(Math.sin(sway) * r * 0.32, mid + r * 0.3, Math.cos(sway) * r);
    this.camera.lookAt(0, mid - 0.2, 0);
    const focus = this.hovered ?? this.external;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.cols.forEach((c) => {
      c.dim += ((focus && focus !== c.id ? 1 : 0) - c.dim) * 0.15;
      const on = focus === c.id;
      c.mesh.position.x = c.st.x;
      c.mesh.scale.set(BW, c.st.h, BW);
      c.mat.opacity = (0.8 - 0.52 * c.dim) * c.st.o;
      c.mat.emissiveIntensity = on ? 1.8 : 1;
      c.cap.position.set(c.st.x, c.st.h + (c.st.h >= 0 ? 0.004 : -0.004), 0);
      c.cap.scale.set(BW, BW, 1);
      c.capMat.opacity = (0.95 - 0.6 * c.dim) * c.st.o;
      c.ring.position.x = c.st.x;
      const pulse = this.opts.reduced ? 1.2 : 1.15 + 0.12 * Math.sin(t * 3);
      c.ring.scale.setScalar(on ? pulse * 1.5 : 1.5);
      c.ringMat.opacity = on ? 0.8 : 0;
      // Valeur au sommet (ou sous la colonne si négative), rang et nom sur le sol, devant
      this.v.set(c.st.x, c.st.h >= 0 ? c.st.h : 0, 0).project(this.camera);
      const tx = (this.v.x * 0.5 + 0.5) * w, ty = (-this.v.y * 0.5 + 0.5) * h;
      c.el.style.transform = `translate(${tx}px, ${ty - 10}px) translate(-50%, -100%)`;
      c.el.style.opacity = String((1 - 0.6 * c.dim) * c.st.o);
      c.el.classList.toggle("is-on", on);
      this.v.set(c.st.x, Math.min(0, c.st.h), BW * 0.8).project(this.camera);
      c.rEl.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * w}px, ${(-this.v.y * 0.5 + 0.5) * h + 8}px) translate(-50%, 0)`;
      c.rEl.style.opacity = String((1 - 0.6 * c.dim) * c.st.o);
    });
    this.renderer.render(this.scene, this.camera);
  };

  private dist() {
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const width = Math.max(3, this.n) * PITCH + 1.2;
    const height = this.span.hi - this.span.lo + 3.2;
    return Math.max((width / 2) / Math.tan(hfov / 2), (height / 2) / Math.tan(vfov / 2)) * 1.08;
  }

  private applyQuality() { this.renderer.setPixelRatio(this.q.pixelRatio()); this.resize(); }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("click", this.onClick);
    [...this.cols.keys()].forEach((k) => this.removeCol(k));
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
    el.remove();
    this.opts.labelLayer.innerHTML = "";
  }
}
