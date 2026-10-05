/**
 * Encours — courbe 3D des encours par période (Three.js).
 *
 * Le temps court en x, l'encours en y. La courbe est un mur plein, d'une faible épaisseur, dont l'arête supérieure
 * (la ligne lue) est la plus lumineuse ; en vue « par famille », les familles s'empilent en bandes, la somme est le total.
 * Sous le graphique, sur le même axe du temps et avec sa propre échelle, la collecte nette estimée de chaque période :
 * au-dessus de son axe, des souscriptions nettes, au-dessous, des rachats nets. Un curseur vertical traverse les deux et
 * renvoie la période lue (lecture en HTML). « Vue de face » aplatit la profondeur : la scène devient un graphique 2D.
 * Changement de granularité ou de fenêtre : la nouvelle courbe se forme à partir de l'ancienne, de gauche à droite.
 * Formes nettes uniquement (murs, barres, repère carré) ; en mode « animations réduites », tout est affiché d'emblée.
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

export type AumLayer = { key: string; color: string; values: number[] };
export type AumData = { ts: number[]; flows: (number | null)[]; layers: AumLayer[]; stacked: boolean };
/** Point lu : indice de la période, position écran du haut de la courbe. */
export type AumCursor = { k: number; x: number; y: number; w: number; h: number };
export type AumOptions = {
  reduced: boolean;
  labelLayer: HTMLElement;
  onCursor: (c: AumCursor | null) => void;
  fmtValue: (v: number) => string;
  fmtFlow: (v: number) => string;
  fmtTime: (t: number, span: number) => string;
};

const H = 20;           // hauteur du graphique des encours (y)
const HC = 5.2;         // hauteur de la bande de collecte
const GAP_C = 3.4;      // écart entre le sol du graphique et le haut de la bande de collecte
const D = 2.2;          // épaisseur des murs (z)
const DAY = 86400000;
const GRID = new THREE.Color("#9aa3b5");
const GOLD = new THREE.Color("#cc9f53");
const UP = new THREE.Color("#cc9f53");
const DOWN = new THREE.Color("#c2476f");

const WALL_VS = /* glsl */`
  attribute float aK;
  attribute float aTop;
  varying float vK;
  varying float vTop;
  void main() { vK = aK; vTop = aTop; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WALL_FS = /* glsl */`
  uniform vec3 uColor;
  uniform float uFill;
  uniform float uSolid;
  varying float vK;
  varying float vTop;
  void main() {
    vec3 top = mix(uColor, vec3(1.0), 0.28) * 1.35;
    float a = mix(mix(0.04 + 0.30 * pow(vK, 1.6), 0.46 + 0.3 * vK, uSolid) * uFill, 1.0, vTop);
    gl_FragColor = vec4(mix(uColor * (0.55 + 0.45 * vK), top, vTop), a);
  }`;

type Wall = {
  key: string;
  mesh: THREE.Mesh; geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial;
  edge: THREE.Line; edgeGeo: THREE.BufferGeometry; edgeMat: THREE.LineBasicMaterial;
  from0: Float32Array; from1: Float32Array; to0: Float32Array; to1: Float32Array; cur0: Float32Array; cur1: Float32Array;
};

function niceStep(range: number, target: number) {
  const raw = range / Math.max(1, target);
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** Valeur de la ligne brisée (xs croissants) en x ; hors de l'étendue : la valeur de l'extrémité. */
function sampleAt(xs: ArrayLike<number>, ys: ArrayLike<number>, x: number): number {
  const n = xs.length;
  if (!n) return 0;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  const u = (x - xs[lo]) / Math.max(1e-9, xs[hi] - xs[lo]);
  return ys[lo] + (ys[hi] - ys[lo]) * u;
}

export class AumScene {
  /** Étendue du temps (x) : plus courte sur écran étroit, pour que la courbe garde sa hauteur. */
  private W = 48;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private q = new Quality(() => this.applyQuality());
  private world = new THREE.Group();
  private frameG = new THREE.Group();
  private frameDisp: { dispose: () => void }[] = [];
  private ticks: { el: HTMLElement; p: THREE.Vector3; anchor: "l" | "b" | "r" }[] = [];
  private walls: Wall[] = [];
  private bars: THREE.InstancedMesh | null = null;
  private barsG = new THREE.Group();
  private barGeo = new THREE.BoxGeometry(1, 1, 1);
  private barMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  private cursorG = new THREE.Group();
  private cursorLine: THREE.Line;
  private marker: THREE.Mesh;
  private data: AumData = { ts: [], flows: [], layers: [], stacked: false };
  private xs = new Float32Array(0);
  private t0 = 0; private t1 = 1;
  private yLo = 0; private yHi = 1;
  private cMax = 1;
  private yFloor = -H / 2; private yTop = H / 2; private yC = -H / 2 - GAP_C - HC / 2;
  private morph = { g: 1 };
  private flat = { v: 0 };
  private isFlat = false;
  private view = { th: 0.17, ph: 1.43, r: 80 };
  private base = { th: 0.17, ph: 1.43 };
  private target = new THREE.Vector3(0, -3, 0);
  private touched = false;
  private tweening = false;
  private swayAmp = 0;
  private cursorK: number | null = null;
  private hiBar = -1;
  private ray = new THREE.Raycaster();
  private ptr = new THREE.Vector2();
  private ptrIn = false;
  private raf = 0;
  private clock0 = performance.now();
  private visible = true;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private v = new THREE.Vector3();
  private col = new THREE.Color();

  constructor(private host: HTMLElement, data: AumData, private opts: AumOptions) {
    const w = host.clientWidth || 900, h = host.clientHeight || 560;
    this.W = w / h < 1.3 ? 30 : 48;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.q.pixelRatio());
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(28, w / h, 1, 800);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, {
      enablePan: false, enableZoom: false, enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.5,
      minPolarAngle: 0.9, maxPolarAngle: Math.PI / 2 + 0.04, minAzimuthAngle: -0.9, maxAzimuthAngle: 0.9,
    });
    this.controls.addEventListener("start", () => { this.touched = true; });
    this.renderer.domElement.style.touchAction = "pan-y";

    // Curseur : un filet vertical sur le plan avant, de la bande de collecte au haut du graphique, et un repère carré
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]);
    this.cursorLine = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: "#f3dcaa", transparent: true, opacity: 0.75, depthTest: false }));
    this.marker = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, D + 0.3), new THREE.MeshBasicMaterial({ color: "#fff1d0", depthTest: false }));
    this.marker.renderOrder = 4; this.cursorLine.renderOrder = 3;
    this.cursorG.add(this.cursorLine, this.marker);
    this.cursorG.visible = false;

    this.world.add(this.frameG, this.barsG, this.cursorG);
    this.scene.add(this.world);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.3, 0.55);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }, { threshold: 0 });
    this.io.observe(host);

    this.apply(data, true);
    this.resize();
    if (!opts.reduced) {
      const end = { ...this.view };
      this.view.th = end.th - 0.55; this.view.ph = end.ph - 0.16; this.view.r = end.r * 1.2;
      this.applyView();
      this.tweening = true;
      gsap.to(this.view, { th: end.th, ph: end.ph, r: end.r, duration: 2.4, ease: "power3.out", onUpdate: () => this.applyView(), onComplete: () => { this.tweening = false; } });
    }
    this.loop();
  }

  // ---------------------------------------------------------------- échelles
  private x(t: number) { return ((t - this.t0) / Math.max(1, this.t1 - this.t0)) * this.W - this.W / 2; }
  private y(v: number) { return ((v - this.yLo) / Math.max(1e-9, this.yHi - this.yLo)) * H - H / 2; }

  private computeScales(d: AumData) {
    const n = d.ts.length;
    this.t0 = n ? d.ts[0] : Date.now() - 365 * DAY;
    this.t1 = n > 1 ? d.ts[n - 1] : this.t0 + DAY;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < n; k++) {
      let top = 0;
      if (d.stacked) for (const l of d.layers) top += l.values[k] ?? 0;
      else top = d.layers[0]?.values[k] ?? 0;
      lo = Math.min(lo, top); hi = Math.max(hi, top);
    }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (d.stacked) lo = 0;
    else { const pad = Math.max((hi - lo) * 0.12, Math.abs(hi) * 0.004); lo -= pad; hi += pad * 0.6; }
    if (hi - lo <= 0) hi = lo + Math.max(1, Math.abs(lo) * 0.01);
    const step = niceStep(hi - lo, 5);
    this.yLo = Math.max(0, Math.floor(lo / step) * step);
    this.yHi = Math.ceil(hi / step) * step;
    this.yFloor = -H / 2; this.yTop = this.y(this.yHi);
    this.yC = this.yFloor - GAP_C - HC / 2;
    this.cMax = Math.max(1, ...d.flows.map((f) => Math.abs(f ?? 0)));
    this.xs = Float32Array.from(d.ts, (t) => this.x(t));
    return step;
  }

  // ---------------------------------------------------------------- données
  /** Nouvelles données : les murs se reforment depuis la courbe actuelle (ou montent du sol), la collecte repousse. */
  setData(d: AumData) { this.apply(d, false); }

  private apply(d: AumData, first: boolean) {
    // Ancienne géométrie, en coordonnées du monde, pour faire naître la nouvelle courbe à partir de l'ancienne
    const oldXs = this.xs;
    const old = new Map(this.walls.map((w) => [w.key, w]));
    const oldTop = this.walls.length ? this.walls[this.walls.length - 1] : null;
    this.data = d;
    const step = this.computeScales(d);
    this.buildFrame(step);
    const n = d.ts.length;
    const keep: Wall[] = [];
    const cum = new Float64Array(n);
    d.layers.forEach((layer) => {
      const to0 = new Float32Array(n), to1 = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const base = d.stacked ? cum[k] : this.yLo;
        const top = d.stacked ? cum[k] + (layer.values[k] ?? 0) : (layer.values[k] ?? 0);
        to0[k] = this.y(base); to1[k] = this.y(top);
        if (d.stacked) cum[k] = top;
      }
      let w = old.get(layer.key);
      if (w && w.cur0.length !== n) { this.disposeWall(w); old.delete(layer.key); w = undefined; }
      if (!w) w = this.makeWall(layer.key, n);
      else old.delete(layer.key);
      w.mat.uniforms.uColor.value.set(layer.color);
      w.edgeMat.color.set(layer.color).lerp(new THREE.Color("#ffffff"), 0.35);
      w.mat.uniforms.uSolid.value = d.stacked ? 1 : 0;
      const src = this.walls.find((x) => x.key === layer.key) ?? null;
      for (let k = 0; k < n; k++) {
        const x = this.xs[k];
        if (first || this.opts.reduced) { w.from0[k] = to0[k]; w.from1[k] = first && !this.opts.reduced ? to0[k] : to1[k]; }
        else if (src && oldXs.length) { w.from0[k] = sampleAt(oldXs, src.cur0, x); w.from1[k] = sampleAt(oldXs, src.cur1, x); }
        else if (!d.stacked && oldTop && oldXs.length) { w.from0[k] = to0[k]; w.from1[k] = sampleAt(oldXs, oldTop.cur1, x); }
        else { w.from0[k] = to0[k]; w.from1[k] = to0[k]; }
      }
      w.to0 = to0; w.to1 = to1;
      keep.push(w);
    });
    old.forEach((w) => this.disposeWall(w));   // couches disparues (total ↔ familles)
    this.walls = keep;
    this.buildBars(d);
    this.morph.g = 0;
    gsap.killTweensOf(this.morph);
    gsap.killTweensOf(this.barsG.scale);
    if (this.opts.reduced) { this.morph.g = 1; this.barsG.scale.y = 1; }
    else {
      gsap.to(this.morph, { g: 1, duration: first ? 2.2 : 1.25, delay: first ? 0.35 : 0, ease: "power2.inOut" });
      this.barsG.scale.y = 0.001;
      gsap.to(this.barsG.scale, { y: 1, duration: 0.9, delay: first ? 1.4 : 0.35, ease: "expo.out" });
      gsap.fromTo(this.ticks.map((t) => t.el), { opacity: 0 }, { opacity: 1, duration: 0.6, delay: first ? 0.8 : 0.1, stagger: 0.012, clearProps: "opacity" });
    }
    this.updateWalls();
    if (this.cursorK != null) this.placeCursor(Math.min(this.cursorK, n - 1));
  }

  private makeWall(key: string, n: number): Wall {
    // 6 sommets par point : face avant (bas, haut), arête supérieure (avant, arrière), face arrière (haut, bas)
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 6 * 3), aK = new Float32Array(n * 6), aTop = new Float32Array(n * 6);
    for (let k = 0; k < n; k++) {
      aK.set([0, 1, 1, 1, 1, 0], k * 6);
      aTop.set([0, 0, 1, 1, 0, 0], k * 6);
    }
    const idx: number[] = [];
    for (let k = 0; k < n - 1; k++) {
      const a = k * 6, b = a + 6;
      idx.push(a, b, a + 1, b, b + 1, a + 1);               // avant
      idx.push(a + 2, b + 2, a + 3, b + 2, b + 3, a + 3);   // dessus
      idx.push(a + 4, b + 4, a + 5, b + 4, b + 5, a + 5);   // arrière
    }
    if (n > 1) {
      const e = (n - 1) * 6;
      idx.push(e, e + 1, e + 5, e + 1, e + 4, e + 5);       // flanc droit
      idx.push(0, 5, 1, 1, 5, 4);                            // flanc gauche
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aK", new THREE.BufferAttribute(aK, 1));
    geo.setAttribute("aTop", new THREE.BufferAttribute(aTop, 1));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ vertexShader: WALL_VS, fragmentShader: WALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(GOLD) }, uFill: { value: 1 }, uSolid: { value: 0 } } });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const edgeMat = new THREE.LineBasicMaterial({ color: "#f3dcaa", transparent: true, opacity: 0.95 });
    const edge = new THREE.Line(edgeGeo, edgeMat);
    edge.frustumCulled = false;
    this.world.add(mesh, edge);
    const z = () => new Float32Array(n);
    return { key, mesh, geo, mat, edge, edgeGeo, edgeMat, from0: z(), from1: z(), to0: z(), to1: z(), cur0: z(), cur1: z() };
  }

  private disposeWall(w: Wall) {
    this.world.remove(w.mesh, w.edge);
    w.geo.dispose(); w.mat.dispose(); w.edgeGeo.dispose(); w.edgeMat.dispose();
  }

  /** Positions des murs au temps de transition courant : balayage de gauche à droite. */
  private updateWalls() {
    const g = this.morph.g, zF = D / 2, zB = -D / 2;
    for (const w of this.walls) {
      const n = w.cur0.length;
      const pos = w.geo.getAttribute("position") as THREE.BufferAttribute;
      const ep = w.edgeGeo.getAttribute("position") as THREE.BufferAttribute;
      const P = pos.array as Float32Array, E = ep.array as Float32Array;
      for (let k = 0; k < n; k++) {
        const xn = n > 1 ? k / (n - 1) : 0;
        const u = Math.min(1, Math.max(0, (g * 1.35 - xn * 0.35)));
        const e = u * u * (3 - 2 * u);
        const y0 = w.from0[k] + (w.to0[k] - w.from0[k]) * e;
        const y1 = Math.max(y0 + 0.001, w.from1[k] + (w.to1[k] - w.from1[k]) * e);
        w.cur0[k] = y0; w.cur1[k] = y1;
        const x = this.xs[k], o = k * 18;
        P[o] = x; P[o + 1] = y0; P[o + 2] = zF;
        P[o + 3] = x; P[o + 4] = y1; P[o + 5] = zF;
        P[o + 6] = x; P[o + 7] = y1; P[o + 8] = zF;
        P[o + 9] = x; P[o + 10] = y1; P[o + 11] = zB;
        P[o + 12] = x; P[o + 13] = y1; P[o + 14] = zB;
        P[o + 15] = x; P[o + 16] = y0; P[o + 17] = zB;
        E[k * 3] = x; E[k * 3 + 1] = y1 + 0.02; E[k * 3 + 2] = zF + 0.01;
      }
      pos.needsUpdate = true; ep.needsUpdate = true;
    }
  }

  private buildBars(d: AumData) {
    if (this.bars) { this.barsG.remove(this.bars); this.bars.dispose(); this.bars = null; }
    const n = d.ts.length;
    if (!n) return;
    const spacing = n > 1 ? this.W / (n - 1) : this.W;
    const bw = Math.max(0.04, Math.min(spacing * 0.72, 1.6));
    const mesh = new THREE.InstancedMesh(this.barGeo, this.barMat, n);
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < n; k++) {
      const f = d.flows[k];
      const h = f == null ? 0.0001 : Math.max(0.03, (Math.abs(f) / this.cMax) * (HC / 2));
      const y = f == null ? 0 : f >= 0 ? h / 2 : -h / 2;
      m4.makeScale(bw, h, D * 0.8).setPosition(this.xs[k], y, 0);
      mesh.setMatrixAt(k, m4);
      mesh.setColorAt(k, (f ?? 0) >= 0 ? UP : DOWN);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    this.bars = mesh;
    this.hiBar = -1;
    this.barsG.position.y = this.yC;
    this.barsG.add(mesh);
  }

  private buildFrame(step: number) {
    this.world.remove(this.frameG);
    this.frameDisp.forEach((x) => x.dispose());
    this.frameDisp = [];
    this.ticks.forEach((t) => t.el.remove());
    this.ticks = [];
    this.frameG = new THREE.Group();
    const zB = -D / 2 - 0.6, zF = D / 2 + 0.6;
    const L = -this.W / 2, R = this.W / 2;
    const seg = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Color, o: number) => {
      const g = new THREE.BufferGeometry().setFromPoints([a, b]);
      const m = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false });
      this.frameG.add(new THREE.Line(g, m));
      this.frameDisp.push(g, m);
    };
    const tick = (text: string, p: THREE.Vector3, anchor: "l" | "b" | "r", cls = "") => {
      const el = document.createElement("div");
      el.className = `aum3d__tick ${cls}`;
      el.textContent = text;
      this.opts.labelLayer.appendChild(el);
      this.ticks.push({ el, p, anchor });
    };
    // Graduations d'encours : mur du fond et sol ; la plus basse dit clairement où l'axe commence
    for (let v = this.yLo; v <= this.yHi + step * 1e-6; v += step) {
      const y = this.y(v);
      seg(new THREE.Vector3(L, y, zB), new THREE.Vector3(R, y, zB), GRID, v === this.yLo ? 0.3 : 0.12);
      tick(this.opts.fmtValue(v), new THREE.Vector3(L - 0.8, y, zB), "l", v === this.yLo && v > 0 ? "is-base" : "");
    }
    seg(new THREE.Vector3(L, this.yFloor, zB), new THREE.Vector3(L, this.yTop, zB), GRID, 0.2);
    seg(new THREE.Vector3(L, this.yFloor, zF), new THREE.Vector3(R, this.yFloor, zF), GRID, 0.22);
    // Bande de collecte : axe zéro, bornes
    const c0 = this.yC, cH = HC / 2;
    seg(new THREE.Vector3(L, c0, zF), new THREE.Vector3(R, c0, zF), GOLD, 0.45);
    seg(new THREE.Vector3(L, c0 + cH, zB), new THREE.Vector3(R, c0 + cH, zB), GRID, 0.07);
    seg(new THREE.Vector3(L, c0 - cH, zB), new THREE.Vector3(R, c0 - cH, zB), GRID, 0.07);
    tick(this.opts.fmtFlow(this.cMax), new THREE.Vector3(L - 0.8, c0 + cH, zB), "l", "is-flow");
    tick("0", new THREE.Vector3(L - 0.8, c0, zF), "l", "is-flow");
    tick(this.opts.fmtFlow(-this.cMax), new THREE.Vector3(L - 0.8, c0 - cH, zB), "l", "is-flow");
    // Temps : filets verticaux sur le mur du fond, étiquettes sous la bande de collecte
    const span = this.t1 - this.t0;
    for (const t of this.timeTicks(span)) {
      const x = this.x(t);
      seg(new THREE.Vector3(x, this.yFloor, zB), new THREE.Vector3(x, this.yTop, zB), GRID, 0.07);
      seg(new THREE.Vector3(x, c0 - cH, zB), new THREE.Vector3(x, c0 + cH, zB), GRID, 0.05);
      tick(this.opts.fmtTime(t, span), new THREE.Vector3(x, c0 - cH - 0.6, zF), "b");
    }
    this.world.add(this.frameG);
  }

  private timeTicks(span: number): number[] {
    const out: number[] = [];
    if (span <= 0) return out;
    if (span < 62 * DAY) {
      // fenêtre courte : un repère par lundi (une semaine sur deux au-delà de 5 semaines)
      const every = span > 36 * DAY ? 14 : 7;
      const d = new Date(this.t0);
      const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
      for (let t = monday; t <= this.t1; t += every * DAY) if (t >= this.t0 + span * 0.02 && t <= this.t1 - span * 0.02) out.push(t);
      return out;
    }
    const d0 = new Date(this.t0), years = span / (365.25 * DAY);
    const stepM = years > 2.5 ? 12 : years > 1.2 ? 3 : years > 0.45 ? 1 : 1;
    let y = d0.getUTCFullYear(), m = Math.ceil((d0.getUTCMonth() + (d0.getUTCDate() > 1 ? 1 : 0)) / stepM) * stepM;
    for (let k = 0; k < 60; k++) {
      while (m >= 12) { m -= 12; y += 1; }
      const t = Date.UTC(y, m, 1);
      if (t > this.t1) break;
      if (t >= this.t0 + span * 0.02 && t <= this.t1 - span * 0.02) out.push(t);
      m += stepM;
    }
    return out;
  }

  // ---------------------------------------------------------------- vue
  /** Vue de face (graphique 2D) ou vue en relief. */
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
    const sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.target));
    Object.assign(this.view, { th: sph.theta, ph: sph.phi, r: sph.radius });
    this.tweening = true;
    gsap.to(this.flat, { v: flat ? 1 : 0, duration: 1.2, ease: "power3.inOut" });
    gsap.to(this.view, { ...to, duration: 1.2, ease: "power3.inOut", onUpdate: () => this.applyView(),
      onComplete: () => { this.tweening = false; this.controls.enabled = !flat; this.controls.update(); } });
  }

  private applyView() {
    const sp = new THREE.Spherical(this.view.r, this.view.ph, this.view.th);
    this.camera.position.setFromSpherical(sp).add(this.target);
    this.camera.lookAt(this.target);
  }

  private fitDistance(flat: boolean) {
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const fullH = H + GAP_C + HC + 2.4;
    const needW = (this.W / 2 + 5.5) / Math.tan(hfov / 2);
    const needH = (fullH / 2 + 3.2) / Math.tan(vfov / 2);   // place réservée en bas pour la clé et l'aide
    return Math.max(needW, needH) * (flat ? 1 : 1.1);
  }

  // ---------------------------------------------------------------- curseur
  /** Place le curseur sur une période (clavier, ou synchronisation avec un tableau) ; null : le masque. */
  cursorAt(k: number | null) {
    if (k == null || !this.data.ts.length) { this.hideCursor(); return; }
    this.placeCursor(Math.max(0, Math.min(this.data.ts.length - 1, k)));
  }

  private placeCursor(k: number) {
    this.cursorK = k;
    const x = this.xs[k];
    const top = this.walls.length ? this.walls[this.walls.length - 1].to1[k] : this.yFloor;
    this.cursorG.visible = true;
    const y0 = this.yC - HC / 2;
    this.cursorLine.position.set(x, y0, D / 2 + 0.05);
    this.cursorLine.scale.set(1, Math.max(0.01, this.yTop - y0), 1);
    this.marker.position.set(x, top, 0);
    if (this.bars) {
      if (this.hiBar >= 0) this.bars.setColorAt(this.hiBar, (this.data.flows[this.hiBar] ?? 0) >= 0 ? UP : DOWN);
      this.col.copy((this.data.flows[k] ?? 0) >= 0 ? UP : DOWN).lerp(new THREE.Color("#ffffff"), 0.55);
      this.bars.setColorAt(k, this.col);
      if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;
      this.hiBar = k;
    }
    this.world.updateMatrixWorld();
    this.v.set(x, top, 0).applyMatrix4(this.world.matrixWorld).project(this.camera);
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.opts.onCursor({ k, x: (this.v.x * 0.5 + 0.5) * w, y: (-this.v.y * 0.5 + 0.5) * h, w, h });
  }

  private hideCursor() {
    this.cursorK = null;
    this.cursorG.visible = false;
    if (this.bars && this.hiBar >= 0) {
      this.bars.setColorAt(this.hiBar, (this.data.flows[this.hiBar] ?? 0) >= 0 ? UP : DOWN);
      if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;
      this.hiBar = -1;
    }
    this.opts.onCursor(null);
  }

  private onMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ptrIn = true;
    this.ray.setFromCamera(this.ptr, this.camera);
    const p = new THREE.Vector3();
    const n = this.xs.length;
    if (n && this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -D / 2 * this.world.scale.z), p) && p.x > -this.W / 2 - 3 && p.x < this.W / 2 + 3) {
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.xs[m] < p.x) lo = m; else hi = m; }
      this.placeCursor(Math.abs(this.xs[lo] - p.x) <= Math.abs(this.xs[hi] - p.x) ? lo : hi);
    } else this.hideCursor();
  };

  private onLeave = () => { this.ptrIn = false; this.hideCursor(); };

  // ---------------------------------------------------------------- rendu
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const sway = !this.touched && !this.isFlat && !this.opts.reduced && !this.tweening && !motionPaused() && !this.ptrIn;
    if (!sway) this.swayAmp = 0;
    const morphing = this.morph.g < 1 || gsap.isTweening(this.morph);
    const busy = sway || this.tweening || morphing || gsap.isTweening(this.barsG.scale) || this.ptrIn;
    if (!this.visible || document.hidden || !this.q.gate(now, busy)) return;
    const t = (now - this.clock0) / 1000;
    if (sway) {
      this.swayAmp = Math.min(1, this.swayAmp + 0.004);
      const a = this.swayAmp * this.swayAmp * (3 - 2 * this.swayAmp);
      this.view.th = this.base.th + a * 0.1 * Math.sin(t * 0.15);
      this.applyView();
    } else if (this.controls.enabled && this.touched) this.controls.update();
    this.world.scale.z = 1 - 0.985 * this.flat.v;
    if (morphing) this.updateWalls();
    this.placeTicks();
    if (this.q.bloom) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  };

  private placeTicks() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.world.updateMatrixWorld();
    const m = this.world.matrixWorld;
    let lastBX = -Infinity;
    for (const l of this.ticks) {
      this.v.copy(l.p).applyMatrix4(m).project(this.camera);
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
      if (l.anchor === "b") {
        const hide = x - lastBX < 64;
        if (!hide) lastBX = x;
        l.el.style.visibility = hide ? "hidden" : "";
        l.el.style.transform = `translate(${x}px, ${y + 6}px) translate(-50%, 0)`;
      } else l.el.style.transform = `translate(${x}px, ${y}px) translate(-100%, -50%)`;
    }
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
    // Cadrage : graphique et bande de collecte, la place des graduations réservée à gauche
    this.target.set(-1.6, (this.yTop + this.yC - HC / 2) / 2 - 1.3, 0);
    this.controls.target.copy(this.target);
    if (!this.tweening) {
      if (this.isFlat) this.view = { th: 0, ph: Math.PI / 2, r: this.fitDistance(true) };
      else if (!this.touched) this.view.r = this.fitDistance(false);
      else {
        const sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.target));
        this.view = { th: sph.theta, ph: sph.phi, r: this.fitDistance(false) };
      }
      this.applyView();
    } else this.view.r = this.fitDistance(this.isFlat);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    gsap.killTweensOf([this.view, this.flat, this.morph, this.barsG.scale]);
    this.ro.disconnect();
    this.io.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    this.walls.forEach((w) => this.disposeWall(w));
    this.walls = [];
    if (this.bars) this.bars.dispose();
    this.barGeo.dispose(); this.barMat.dispose();
    this.frameDisp.forEach((x) => x.dispose());
    this.ticks.forEach((t) => t.el.remove());
    this.cursorLine.geometry.dispose(); (this.cursorLine.material as THREE.Material).dispose();
    this.marker.geometry.dispose(); (this.marker.material as THREE.Material).dispose();
    this.controls.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    el.remove();
  }
}
