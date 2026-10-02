/**
 * Comparateur — scène 3D des trajectoires base 100 (Three.js).
 *
 * Le temps court en x, la valeur base 100 en y, chaque fonds occupe son propre plan en profondeur (z). Chaque trajectoire
 * est un tube lumineux, doublé d'un voile translucide qui la relie au plan « 100 » (au‑dessus : gain, au‑dessous : perte).
 * Une nappe verticale suit la souris dans le temps et renvoie la valeur de chaque fonds à cette date (lecture en HTML).
 * « Vue de face » aplatit la profondeur et place la caméra dans l'axe : la scène devient un graphique 2D lisible.
 * Entrée : les courbes se dessinent ; changement de période ou de sélection : elles se replient sur le plan 100 puis
 * se redéploient. Rien de tout cela en mode « animations réduites » : tout est affiché d'emblée.
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

export type CmpPoint = { t: number; v: number };
export type CmpSeries = { id: string; name: string; color: string; slot: number; pts: CmpPoint[] };
/** Position du curseur : date retenue, indice du point de chaque série (null : pas de valeur), position écran. */
export type CmpCursor = { t: number; idx: (number | null)[]; x: number; y: number; w: number; h: number };
export type CmpOptions = {
  reduced: boolean;
  labelLayer: HTMLElement;
  onCursor: (c: CmpCursor | null) => void;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  fmtTick: (v: number) => string;
  fmtEnd: (v: number) => string;
  fmtTime: (t: number, span: number) => string;
};

const W = 44;          // étendue du temps (x)
const H = 18;          // étendue des valeurs (y)
const GAP = 3.6;       // écart entre deux plans de fonds (z)
const DAY = 86400000;
const GOLD = new THREE.Color("#cc9f53");
const GRID = new THREE.Color("#9aa3b5");

const AREA_VS = /* glsl */`
  attribute float aT;
  varying float vT;
  void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const AREA_FS = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vT;
  void main() { float a = uOpacity * (0.025 + 0.2 * pow(vT, 1.6)); gl_FragColor = vec4(uColor, a); }`;

type Lane = {
  s: CmpSeries;
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  line: THREE.Mesh; lineMat: THREE.MeshBasicMaterial;
  area: THREE.Mesh; areaMat: THREE.ShaderMaterial;
  hit: THREE.Mesh;
  head: THREE.Mesh; headMat: THREE.MeshBasicMaterial;
  dot: THREE.Mesh; dotMat: THREE.MeshBasicMaterial;
  seg: number; radial: number;
  xs: number[]; ys: number[]; ts: number[];
  draw: { v: number };
  dim: number; glow: number;
  label: HTMLElement;
  z: number;
};

type Frame = { group: THREE.Group; labels: { el: HTMLElement; p: THREE.Vector3; anchor: "l" | "b" | "r" }[]; disposables: { dispose: () => void }[] };

function niceStep(range: number, target: number) {
  const raw = range / Math.max(1, target);
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

export class CompareScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private q = new Quality(() => this.applyQuality());
  private world = new THREE.Group();
  private plot = new THREE.Group();
  private cursorG = new THREE.Group();
  private sheet: THREE.Mesh;
  private sheetLine: THREE.Line;
  private lanes: Lane[] = [];
  private frame: Frame | null = null;
  private series: CmpSeries[] = [];
  private t0 = 0; private t1 = 1;
  private yLo = 90; private yHi = 110; private y100 = 0; private yFloor = -H / 2; private yTop = H / 2;
  private depthHalf = 1;
  private flat = { v: 0 };
  private isFlat = false;
  private view = { th: 0.5, ph: 1.2, r: 60 };
  private base = { th: 0.5, ph: 1.2 };
  private target = new THREE.Vector3(2.5, 0, 0);
  private touched = false;
  private tweening = false;
  private swayAmp = 0;
  private hovered: string | null = null;
  private external: string | null = null;
  private cursorT: number | null = null;
  private ray = new THREE.Raycaster();
  private ptr = new THREE.Vector2();
  private ptrIn = false;
  private downAt = { x: 0, y: 0, t: 0 };
  private raf = 0;
  private clock0 = performance.now();
  private visible = true;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private disposables: { dispose: () => void }[] = [];
  private pending: gsap.core.Timeline | null = null;
  private v = new THREE.Vector3();

  constructor(private host: HTMLElement, series: CmpSeries[], private opts: CmpOptions) {
    const w = host.clientWidth || 900, h = host.clientHeight || 560;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.q.pixelRatio());
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(30, w / h, 1, 600);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, {
      enablePan: false, enableZoom: false, enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.5,
      minPolarAngle: 0.78, maxPolarAngle: Math.PI / 2 + 0.06, minAzimuthAngle: -1.0, maxAzimuthAngle: 1.0,
    });
    this.controls.target.copy(this.target);
    this.controls.addEventListener("start", () => { this.touched = true; });
    // Défilement vertical de la page conservé sur écran tactile : seul le glissement horizontal fait pivoter
    this.renderer.domElement.style.touchAction = "pan-y";

    // Nappe du curseur (plan vertical YZ) et son filet sur le mur du fond
    const sheetGeo = new THREE.PlaneGeometry(1, 1);
    const sheetMat = new THREE.MeshBasicMaterial({ color: "#f3dcaa", transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.sheet = new THREE.Mesh(sheetGeo, sheetMat);
    this.sheet.rotation.y = Math.PI / 2;
    const slGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]);
    const slMat = new THREE.LineBasicMaterial({ color: "#dcb36d", transparent: true, opacity: 0.7 });
    this.sheetLine = new THREE.Line(slGeo, slMat);
    this.cursorG.add(this.sheet, this.sheetLine);
    this.cursorG.visible = false;
    this.disposables.push(sheetGeo, sheetMat, slGeo, slMat);

    this.world.add(this.plot, this.cursorG);
    this.scene.add(this.world);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.4, 0.22);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }, { threshold: 0 });
    this.io.observe(host);

    this.build(series);
    this.resize();
    if (!opts.reduced) {
      // Entrée : la caméra glisse depuis le côté, les courbes se dessinent l'une après l'autre
      const end = { ...this.view };
      this.view.th = end.th + 0.55; this.view.ph = end.ph - 0.12; this.view.r = end.r * 1.25;
      this.applyView();
      this.tweening = true;
      gsap.to(this.view, { th: end.th, ph: end.ph, r: end.r, duration: 2.6, ease: "power3.out", onUpdate: () => this.applyView(), onComplete: () => { this.tweening = false; } });
      this.drawIn(0.35);
    }
    this.loop();
  }

  // ---------------------------------------------------------------- échelles
  private x(t: number) { return ((t - this.t0) / Math.max(1, this.t1 - this.t0)) * W - W / 2; }
  private y(v: number) { return ((v - this.yLo) / Math.max(1e-6, this.yHi - this.yLo)) * H - H / 2; }
  private laneZ(i: number, n: number) { return ((n - 1) / 2 - i) * GAP; }

  private computeScales(series: CmpSeries[]) {
    let lo = 100, hi = 100, t0 = Infinity, t1 = -Infinity;
    series.forEach((s) => s.pts.forEach((p) => { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); t0 = Math.min(t0, p.t); t1 = Math.max(t1, p.t); }));
    if (!isFinite(t0)) { t0 = Date.now() - 365 * DAY; t1 = Date.now(); }
    if (hi - lo < 2) { lo -= 1; hi += 1; }
    const step = niceStep(hi - lo, 5);
    this.yLo = Math.floor(lo / step) * step;
    this.yHi = Math.ceil(hi / step) * step;
    this.t0 = t0; this.t1 = t1;
    this.y100 = this.y(100); this.yFloor = this.y(this.yLo); this.yTop = this.y(this.yHi);
    this.depthHalf = Math.max(1.6, ((series.length - 1) / 2) * GAP + 1.6);
    return step;
  }

  // ---------------------------------------------------------------- construction
  private build(series: CmpSeries[]) {
    this.series = series;
    const step = this.computeScales(series);
    this.buildFrame(step);
    this.plot.position.y = this.y100;
    const n = series.length;
    series.forEach((s, i) => this.lanes.push(this.buildLane(s, this.laneZ(i, n))));
    this.syncCursorGeometry();
  }

  private buildLane(s: CmpSeries, z: number): Lane {
    const group = new THREE.Group();
    group.position.z = z;
    const xs = s.pts.map((p) => this.x(p.t));
    const ys = s.pts.map((p) => this.y(p.v) - this.y100);
    const ts = s.pts.map((p) => p.t);
    const color = new THREE.Color(s.color);
    const pts3 = xs.map((x, k) => new THREE.Vector3(x, ys[k], 0));
    if (pts3.length === 1) pts3.push(pts3[0].clone().add(new THREE.Vector3(0.01, 0, 0)));
    const curve = new THREE.CatmullRomCurve3(pts3, false, "centripetal");
    const seg = Math.min(720, Math.max(64, pts3.length * 3)), radial = 8;
    const lineGeo = new THREE.TubeGeometry(curve, seg, 0.075, radial, false);
    const lineMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.35), transparent: true, opacity: 1 });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.userData.id = s.id;
    // Voile : du tracé jusqu'au plan 100
    const pos = new Float32Array(xs.length * 6), aT = new Float32Array(xs.length * 2);
    xs.forEach((x, k) => { pos.set([x, ys[k], 0, x, 0, 0], k * 6); aT[k * 2] = 1; aT[k * 2 + 1] = 0; });
    const idx: number[] = [];
    for (let k = 0; k < xs.length - 1; k++) { const a = k * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
    const areaGeo = new THREE.BufferGeometry();
    areaGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    areaGeo.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
    areaGeo.setIndex(idx);
    const areaMat = new THREE.ShaderMaterial({ vertexShader: AREA_VS, fragmentShader: AREA_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uColor: { value: color.clone() }, uOpacity: { value: 1 } } });
    const area = new THREE.Mesh(areaGeo, areaMat);
    area.userData.id = s.id;
    // Cible de survol plus large que le trait (jamais dessinée)
    const hitGeo = new THREE.TubeGeometry(curve, Math.max(16, pts3.length), 0.55, 4, false);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.userData.id = s.id;
    // Tête lumineuse (pendant le tracé) et point du curseur
    const sphere = new THREE.SphereGeometry(1, 20, 14);
    const headMat = new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color("#ffffff"), 0.45).multiplyScalar(1.6) });
    const head = new THREE.Mesh(sphere, headMat);
    head.scale.setScalar(0.24);
    const dotMat = new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color("#ffffff"), 0.15).multiplyScalar(1.3) });
    const dot = new THREE.Mesh(sphere, dotMat);
    dot.scale.setScalar(0.3);
    dot.visible = false;
    group.add(area, line, hit, head, dot);
    this.plot.add(group);

    const label = document.createElement("div");
    label.className = "cmp3d__end";
    const key = document.createElement("span"); key.className = "cmp3d__key"; key.style.background = s.color; key.textContent = String.fromCharCode(65 + s.slot);
    const name = document.createElement("span"); name.className = "cmp3d__name"; name.textContent = s.name;
    const val = document.createElement("span"); val.className = "cmp3d__val"; val.textContent = s.pts.length ? this.opts.fmtEnd(s.pts[s.pts.length - 1].v) : "—";
    label.append(key, name, val);
    this.opts.labelLayer.appendChild(label);

    return { s, group, curve, line, lineMat, area, areaMat, hit, head, headMat, dot, dotMat, seg, radial, xs, ys, ts, draw: { v: 1 }, dim: 0, glow: 0, label, z };
  }

  private buildFrame(step: number) {
    const group = new THREE.Group();
    const disposables: { dispose: () => void }[] = [];
    const labels: Frame["labels"] = [];
    const zB = -this.depthHalf, zF = this.depthHalf;
    const seg = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Color, o: number) => {
      const g = new THREE.BufferGeometry().setFromPoints([a, b]);
      const m = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false });
      group.add(new THREE.Line(g, m));
      disposables.push(g, m);
    };
    const label = (text: string, p: THREE.Vector3, anchor: "l" | "b" | "r", cls: string) => {
      const el = document.createElement("div");
      el.className = `cmp3d__tick ${cls}`;
      el.textContent = text;
      this.opts.labelLayer.appendChild(el);
      labels.push({ el, p, anchor });
    };
    const L = -W / 2, R = W / 2;
    // Graduations de valeur : mur du fond + retour sur le flanc gauche
    for (let v = this.yLo; v <= this.yHi + 1e-6; v += step) {
      const y = this.y(v), is100 = Math.abs(v - 100) < 1e-6;
      seg(new THREE.Vector3(L, y, zB), new THREE.Vector3(R, y, zB), is100 ? GOLD : GRID, is100 ? 0.75 : 0.13);
      seg(new THREE.Vector3(L, y, zB), new THREE.Vector3(L, y, zF), is100 ? GOLD : GRID, is100 ? 0.35 : 0.06);
      label(this.opts.fmtTick(v), new THREE.Vector3(L - 0.6, y, zB), "l", is100 ? "is-100" : "");
    }
    // Plan 100 : un voile d'or très léger sur toute la profondeur, et un filet par fonds
    const planeGeo = new THREE.PlaneGeometry(W, zF - zB);
    const planeMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = this.y100;
    group.add(plane);
    disposables.push(planeGeo, planeMat);
    const n = this.series.length;
    for (let i = 0; i < n; i++) {
      const z = this.laneZ(i, n);
      seg(new THREE.Vector3(L, this.y100, z), new THREE.Vector3(R, this.y100, z), GOLD, 0.32);
      seg(new THREE.Vector3(L, this.yFloor, z), new THREE.Vector3(R, this.yFloor, z), GRID, 0.1);
    }
    // Graduations de temps : sur le sol et le mur du fond
    const span = this.t1 - this.t0;
    this.timeTicks(span).forEach((t) => {
      const x = this.x(t);
      seg(new THREE.Vector3(x, this.yFloor, zB), new THREE.Vector3(x, this.yTop, zB), GRID, 0.07);
      seg(new THREE.Vector3(x, this.yFloor, zB), new THREE.Vector3(x, this.yFloor, zF), GRID, 0.08);
      label(this.opts.fmtTime(t, span), new THREE.Vector3(x, this.yFloor, zF + 0.4), "b", "");
    });
    seg(new THREE.Vector3(L, this.yFloor, zF), new THREE.Vector3(R, this.yFloor, zF), GRID, 0.22);
    seg(new THREE.Vector3(L, this.yFloor, zB), new THREE.Vector3(L, this.yTop, zB), GRID, 0.16);
    this.world.add(group);
    this.frame = { group, labels, disposables };
  }

  private timeTicks(span: number): number[] {
    const out: number[] = [];
    const d0 = new Date(this.t0), years = span / (365.25 * DAY);
    const stepM = years > 2.5 ? 12 : years > 1.2 ? 6 : years > 0.6 ? 3 : 1;
    let y = d0.getUTCFullYear(), m = Math.ceil((d0.getUTCMonth() + (d0.getUTCDate() > 1 ? 1 : 0)) / stepM) * stepM;
    for (let k = 0; k < 40; k++) {
      while (m >= 12) { m -= 12; y += 1; }
      const t = Date.UTC(y, m, 1);
      if (t > this.t1) break;
      if (t >= this.t0 + span * 0.03 && t <= this.t1 - span * 0.03) out.push(t);
      m += stepM;
    }
    return out;
  }

  private syncCursorGeometry() {
    const depth = this.depthHalf * 2, h = this.yTop - this.yFloor;
    this.sheet.scale.set(depth, h, 1);
    this.sheet.position.set(0, (this.yTop + this.yFloor) / 2, 0);
    this.sheetLine.position.set(0, this.yFloor, -this.depthHalf);
    this.sheetLine.scale.set(1, h, 1);
  }

  private clear() {
    this.lanes.forEach((l) => {
      this.plot.remove(l.group);
      l.line.geometry.dispose(); l.lineMat.dispose(); l.area.geometry.dispose(); l.areaMat.dispose();
      l.hit.geometry.dispose(); (l.hit.material as THREE.Material).dispose(); l.head.geometry.dispose(); l.headMat.dispose(); l.dotMat.dispose();
      l.label.remove();
    });
    this.lanes = [];
    if (this.frame) {
      this.world.remove(this.frame.group);
      this.frame.disposables.forEach((d) => d.dispose());
      this.frame.labels.forEach((l) => l.el.remove());
      this.frame = null;
    }
  }

  private drawIn(delay = 0) {
    this.lanes.forEach((l, i) => {
      l.draw.v = 0;
      gsap.to(l.draw, { v: 1, duration: 2.1, delay: delay + i * 0.16, ease: "power2.inOut" });
    });
    if (this.frame?.labels.length) {
      const els = this.frame.labels.map((l) => l.el);
      gsap.fromTo(els, { opacity: 0 }, { opacity: 1, duration: 0.8, delay, stagger: 0.02, clearProps: "opacity" });
    }
  }

  /** Nouvelles séries (période ou sélection) : repli sur le plan 100, reconstruction, redéploiement. */
  setData(series: CmpSeries[]) {
    this.pending?.kill();
    const rebuild = () => {
      this.clear();
      this.plot.scale.y = 1;
      this.build(series);
      this.resize();
      if (this.cursorT != null) this.placeCursor(this.cursorT);
    };
    if (this.opts.reduced || !this.lanes.length) { rebuild(); if (!this.opts.reduced) this.drawIn(); return; }
    const tl = gsap.timeline();
    tl.to(this.plot.scale, { y: 0.002, duration: 0.45, ease: "power3.in" });
    if (this.frame?.labels.length) tl.to(this.frame.labels.map((l) => l.el), { opacity: 0, duration: 0.3 }, 0);
    tl.add(() => {
      rebuild();
      this.plot.scale.y = 0.002;
      this.lanes.forEach((l) => { l.draw.v = 1; });
      gsap.to(this.plot.scale, { y: 1, duration: 1.1, ease: "expo.out" });
      if (this.frame?.labels.length) gsap.fromTo(this.frame.labels.map((l) => l.el), { opacity: 0 }, { opacity: 1, duration: 0.6, stagger: 0.015, clearProps: "opacity" });
    });
    this.pending = tl;
  }

  /** Vue de face (graphique 2D) ou vue en perspective. */
  setFlat(flat: boolean) {
    if (flat === this.isFlat) return;
    this.isFlat = flat;
    const to = flat ? { th: 0, ph: Math.PI / 2, r: this.fitDistance(true) } : { th: this.base.th, ph: this.base.ph, r: this.fitDistance(false) };
    this.controls.enabled = false;
    if (!flat) this.touched = false;
    if (this.opts.reduced) {
      this.flat.v = flat ? 1 : 0;
      Object.assign(this.view, to);
      this.applyView();
      this.controls.enabled = !flat;
      return;
    }
    // Point de départ : la position réelle de la caméra (l'utilisateur a pu la faire pivoter)
    const off = this.camera.position.clone().sub(this.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    Object.assign(this.view, { th: sph.theta, ph: sph.phi, r: sph.radius });
    this.tweening = true;
    gsap.to(this.flat, { v: flat ? 1 : 0, duration: 1.3, ease: "power3.inOut" });
    gsap.to(this.view, { ...to, duration: 1.3, ease: "power3.inOut", onUpdate: () => this.applyView(),
      onComplete: () => { this.tweening = false; this.controls.enabled = !flat; this.controls.update(); } });
  }

  /** Mise en avant pilotée de l'extérieur (légende, tableau). */
  focus(id: string | null) { this.external = id; }

  private applyView() {
    const sp = new THREE.Spherical(this.view.r, this.view.ph, this.view.th);
    this.camera.position.setFromSpherical(sp).add(this.target);
    this.camera.lookAt(this.target);
  }

  private fitDistance(flat: boolean) {
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const needW = (W / 2 + 7.5) / Math.tan(hfov / 2);
    const needH = (H / 2 + 2.6) / Math.tan(vfov / 2);
    return Math.max(needW, needH) * (flat ? 1 : 1.14) + (flat ? 0 : this.depthHalf * 0.6);
  }

  // ---------------------------------------------------------------- curseur et survol
  private placeCursor(t: number) {
    const ref = this.lanes.reduce<Lane | null>((a, l) => (!a || l.ts.length > a.ts.length ? l : a), null);
    if (!ref || !ref.ts.length) return;
    const k = nearest(ref.ts, t);
    const tt = ref.ts[k];
    this.cursorT = tt;
    const x = this.x(tt);
    this.cursorG.visible = true;
    this.cursorG.position.x = x;
    const idx = this.lanes.map((l) => {
      if (!l.ts.length || tt < l.ts[0] - 4 * DAY || tt > l.ts[l.ts.length - 1] + 4 * DAY) { l.dot.visible = false; return null; }
      const j = nearest(l.ts, tt);
      l.dot.visible = true;
      l.dot.position.set(l.xs[j], l.ys[j], 0);
      return j;
    });
    // Ancrage écran : le haut de la nappe, sur le plan avant
    this.v.set(x, this.yTop, this.depthHalf * this.world.scale.z).project(this.camera);
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.opts.onCursor({ t: tt, idx, x: (this.v.x * 0.5 + 0.5) * w, y: (-this.v.y * 0.5 + 0.5) * h, w, h });
  }

  private hideCursor() {
    this.cursorT = null;
    this.cursorG.visible = false;
    this.lanes.forEach((l) => { l.dot.visible = false; });
    this.opts.onCursor(null);
  }

  private onMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ptrIn = true;
    this.ray.setFromCamera(this.ptr, this.camera);
    // Le temps : intersection du rayon avec le plan médian z = 0
    const hitP = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hitP) && hitP.x > -W / 2 - 3 && hitP.x < W / 2 + 3) {
      const t = this.t0 + ((Math.min(W / 2, Math.max(-W / 2, hitP.x)) + W / 2) / W) * (this.t1 - this.t0);
      this.placeCursor(t);
    } else this.hideCursor();
    // Survol d'un ruban
    const hits = this.ray.intersectObjects(this.lanes.flatMap((l) => [l.hit, l.area]), false);
    const id = (hits[0]?.object.userData.id as string | undefined) ?? null;
    if (id !== this.hovered) {
      this.hovered = id;
      this.opts.onHover(id);
      this.renderer.domElement.style.cursor = id ? "pointer" : "";
    }
  };

  private onLeave = () => {
    this.ptrIn = false;
    this.hideCursor();
    if (this.hovered) { this.hovered = null; this.opts.onHover(null); }
  };

  private onDown = (e: PointerEvent) => { this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  private onUp = (e: PointerEvent) => {
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    if (moved < 5 && performance.now() - this.downAt.t < 450 && this.hovered) this.opts.onSelect(this.hovered);
  };

  // ---------------------------------------------------------------- rendu
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const sway = !this.touched && !this.isFlat && !this.opts.reduced && !this.tweening && !motionPaused();
    if (!sway) this.swayAmp = 0;
    const busy = sway || this.tweening || gsap.isTweening(this.plot.scale) || this.lanes.some((l) => l.draw.v < 1) || this.ptrIn;
    if (!this.visible || document.hidden || !this.q.gate(now, busy)) return;
    const t = (now - this.clock0) / 1000;
    if (sway) {
      // Balancement très lent, qui s'installe progressivement (aucun à-coup en sortie de transition)
      this.swayAmp = Math.min(1, this.swayAmp + 0.004);
      const a = this.swayAmp * this.swayAmp * (3 - 2 * this.swayAmp);
      this.view.th = this.base.th + a * 0.13 * Math.sin(t * 0.17);
      this.view.ph = this.base.ph + a * 0.035 * Math.sin(t * 0.12);
      this.applyView();
    } else if (this.controls.enabled && this.touched) this.controls.update();
    this.world.scale.z = 1 - 0.985 * this.flat.v;

    const focus = this.hovered ?? this.external;
    this.lanes.forEach((l) => {
      const dimT = focus && focus !== l.s.id ? 1 : 0, glowT = focus === l.s.id ? 1 : 0;
      l.dim += (dimT - l.dim) * 0.14;
      l.glow += (glowT - l.glow) * 0.14;
      l.lineMat.opacity = 1 - 0.78 * l.dim;
      l.areaMat.uniforms.uOpacity.value = (1 - 0.8 * l.dim) * (1 + 0.9 * l.glow) * (1 - 0.35 * this.flat.v);
      // Tracé progressif
      const d = l.draw.v;
      const full = d >= 0.999;
      const cnt = full ? Infinity : Math.floor(d * l.seg) * l.radial * 6;
      l.line.geometry.setDrawRange(0, cnt);
      const hp = l.curve.getPointAt(Math.min(1, Math.max(0, d)));
      const nA = full ? Infinity : Math.max(0, upperBound(l.xs, hp.x) - 1) * 6;
      l.area.geometry.setDrawRange(0, nA);
      l.head.position.copy(hp);
      l.head.visible = !full && d > 0.001;
    });
    this.placeLabels();
    if (this.q.bloom) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  };

  private placeLabels() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const proj = (p: THREE.Vector3, m: THREE.Matrix4) => { this.v.copy(p).applyMatrix4(m).project(this.camera); return { x: (this.v.x * 0.5 + 0.5) * w, y: (-this.v.y * 0.5 + 0.5) * h }; };
    this.world.updateMatrixWorld();
    if (this.frame) {
      const m = this.world.matrixWorld;
      let lastBX = -Infinity;
      this.frame.labels.forEach((l) => {
        const s = proj(l.p, m);
        if (l.anchor === "b") {
          const hide = s.x - lastBX < 56;
          if (!hide) lastBX = s.x;
          l.el.style.visibility = hide ? "hidden" : "";
          l.el.style.transform = `translate(${s.x}px, ${s.y + 8}px) translate(-50%, 0)`;
        } else l.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-100%, -50%)`;
      });
    }
    // Étiquettes de fin : au bout du tracé, sans chevauchement (la plus haute l'emporte, les autres restent en légende)
    const focus = this.hovered ?? this.external;
    const placed: { y: number }[] = [];
    const items = this.lanes.map((l) => {
      const last = l.xs.length - 1;
      const p = l.draw.v >= 0.999 && last >= 0 ? new THREE.Vector3(l.xs[last], l.ys[last], 0) : l.head.position.clone();
      return { l, s: proj(p, l.group.matrixWorld) };
    }).sort((a, b) => (a.l.s.id === focus ? -1 : b.l.s.id === focus ? 1 : a.s.y - b.s.y));
    items.forEach(({ l, s }) => {
      const clash = placed.some((p) => Math.abs(p.y - s.y) < 22);
      const show = l.xs.length > 0 && l.draw.v > 0.02 && (!clash || l.s.id === focus);
      if (show) placed.push({ y: s.y });
      l.label.style.opacity = show ? String(focus && focus !== l.s.id ? 0.35 : 1) : "0";
      l.label.style.transform = `translate(${s.x + 12}px, ${s.y}px) translate(0, -50%)`;
      l.label.classList.toggle("is-on", focus === l.s.id);
    });
  }

  private applyQuality() {
    this.renderer.setPixelRatio(this.q.pixelRatio());
    this.composer.setPixelRatio(this.q.pixelRatio());
    this.resize();
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    // Cadrage : le temps tient dans la largeur, la place des étiquettes de fin est réservée à droite
    this.target.set(3.2, (this.yTop + this.yFloor) / 2 + 0.6, 0);
    this.controls.target.copy(this.target);
    if (!this.tweening) {
      if (this.isFlat) this.view = { th: 0, ph: Math.PI / 2, r: this.fitDistance(true) };
      else if (!this.touched) this.view.r = this.fitDistance(false);
      else {
        const off = this.camera.position.clone().sub(this.target);
        const sph = new THREE.Spherical().setFromVector3(off);
        this.view = { th: sph.theta, ph: sph.phi, r: this.fitDistance(false) };
      }
      this.applyView();
    } else this.view.r = this.fitDistance(this.isFlat);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.pending?.kill();
    gsap.killTweensOf(this.view);
    gsap.killTweensOf(this.flat);
    gsap.killTweensOf(this.plot.scale);
    this.lanes.forEach((l) => gsap.killTweensOf(l.draw));
    this.ro.disconnect();
    this.io.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    this.clear();
    this.controls.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    el.remove();
    this.opts.labelLayer.innerHTML = "";
  }
}

/** Indice du point le plus proche de `t` dans un tableau trié. */
export function nearest(ts: number[], t: number): number {
  let lo = 0, hi = ts.length - 1;
  if (hi <= 0) return 0;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] < t) lo = m; else hi = m; }
  return Math.abs(ts[lo] - t) <= Math.abs(ts[hi] - t) ? lo : hi;
}

/** Nombre d'éléments ≤ x dans un tableau trié. */
function upperBound(a: number[], x: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= x) lo = m + 1; else hi = m; }
  return lo;
}
