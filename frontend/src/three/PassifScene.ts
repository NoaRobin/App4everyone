/**
 * Scènes 3D de la page « Passif » — Three.js.
 *
 * 1. ModelScene : la carte du modèle. Cinq nœuds (Clients → Comptes → Positions / Transactions → Fonds détenus) dont la
 *    taille suit le rang ordinal de leur tranche (jamais un nombre exact) ; des particules circulent le long des liens,
 *    lentement vers le stock (positions), vite vers le flux (transactions).
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

/** Petite tache lumineuse pour les particules (générée localement, aucun fichier externe). */
function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,.85)");
  grd.addColorStop(0.6, "rgba(255,255,255,.18)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const FRESNEL_VS = /* glsl */`
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const FRESNEL_FS = /* glsl */`
  uniform vec3 uColor; uniform float uGlow; uniform float uCore; uniform float uDim;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.4);
    vec3 col = uColor * (uCore + f * uGlow);
    float a = clamp(0.32 + f * 0.9, 0.0, 1.0);
    gl_FragColor = vec4(col * uDim, a * mix(0.35, 1.0, uDim));
  }`;

// ===================================================================== 1. carte du modèle
export type ModelKey = "clients" | "comptes" | "positions" | "operations" | "funds_held";
export type ModelNode = { key: ModelKey; title: string; unit: string; note: string; kind: "ref" | "stock" | "flux" | "fund"; tranche: PTranche };
export type ModelOptions = {
  reduced: boolean;
  labelLayer: HTMLElement;
  onHover: (n: ModelNode | null, x: number, y: number) => void;
};

const KIND_COLOR: Record<ModelNode["kind"], string> = { ref: "#e9e3d8", stock: "#cc9f53", flux: "#7fa3ea", fund: "#e8c9ba" };
const LINKS: [ModelKey, ModelKey, "ref" | "stock" | "flux"][] = [
  ["clients", "comptes", "ref"], ["comptes", "positions", "stock"], ["comptes", "operations", "flux"],
  ["positions", "funds_held", "stock"], ["operations", "funds_held", "flux"],
];

type MNode = {
  n: ModelNode; group: THREE.Group; core: THREE.Mesh; coreMat: THREE.ShaderMaterial; shell: THREE.LineSegments; shellMat: THREE.LineBasicMaterial;
  rings: THREE.Mesh[]; hit: THREE.Mesh; r: number; label: HTMLDivElement; grow: number; hot: number; phase: number;
};
type MLink = { a: ModelKey; b: ModelKey; kind: "ref" | "stock" | "flux"; curve: THREE.QuadraticBezierCurve3; tube: THREE.Mesh; tubeMat: THREE.MeshBasicMaterial;
  pts: THREE.Points; ptsMat: THREE.PointsMaterial; offs: Float32Array; speed: number; dim: number };

export class ModelScene extends Stage {
  private nodes: MNode[] = [];
  private links: MLink[] = [];
  private world = new THREE.Group();
  private dust!: THREE.Points;
  private tex = dotTexture();
  private hovered: ModelKey | null = null;
  private vertical = false;
  private par = { x: 0, y: 0 };
  private intro = { v: 0 };
  private played = false;

  constructor(host: HTMLElement, private data: ModelNode[], private opts: ModelOptions) {
    super(host, opts.reduced, [0.85, 0.7, 0.18], 32);
    this.disposables.push(this.tex);
    this.scene.add(this.world);
    this.scene.add(new THREE.AmbientLight("#9fb0d0", 0.6));
    this.buildDust();
    this.buildNodes();
    this.start();
    if (opts.reduced) { this.intro.v = 1; this.nodes.forEach((m) => { m.grow = 1; }); this.played = true; }
  }

  /** Révélation à l'arrivée à l'écran (appelée par la page). */
  play() {
    if (this.played) return;
    this.played = true;
    gsap.to(this.intro, { v: 1, duration: 2.2, ease: "power2.out" });
    this.nodes.forEach((m, i) => gsap.to(m, { grow: 1, duration: 1.4, delay: 0.15 + i * 0.16, ease: "back.out(1.6)" }));
  }

  private buildDust() {
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 140;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 2] = -10 - Math.random() * 60;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: 0.35, map: this.tex, color: "#8ea4cc", transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dust = new THREE.Points(g, m);
    this.scene.add(this.dust);
    this.disposables.push(g, m);
  }

  private radius(t: PTranche) { return t ? 0.95 + 0.5 * Math.min(8, Math.max(1, t.rank)) : 0.9; }

  private buildNodes() {
    this.data.forEach((n, i) => {
      const r = this.radius(n.tranche);
      const color = new THREE.Color(n.tranche ? KIND_COLOR[n.kind] : "#5c6475");
      const group = new THREE.Group();
      const coreGeo = new THREE.SphereGeometry(r, 48, 32);
      const coreMat = new THREE.ShaderMaterial({ vertexShader: FRESNEL_VS, fragmentShader: FRESNEL_FS, transparent: true, depthWrite: false,
        uniforms: { uColor: { value: color }, uGlow: { value: n.tranche ? 1.6 : 0.6 }, uCore: { value: 0.16 }, uDim: { value: 1 } } });
      const core = new THREE.Mesh(coreGeo, coreMat);
      // Noyau dense : un point de lumière au centre de chaque nœud
      const seedGeo = new THREE.SphereGeometry(r * 0.28, 24, 16);
      const seedMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(n.tranche ? 1.6 : 0.6) });
      core.add(new THREE.Mesh(seedGeo, seedMat));
      const shellGeo = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(r * 1.32, 1));
      const shellMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false });
      const shell = new THREE.LineSegments(shellGeo, shellMat);
      const rings: THREE.Mesh[] = [];
      const nRings = n.kind === "flux" ? 2 : 1;
      for (let k = 0; k < nRings; k++) {
        const rg = new THREE.TorusGeometry(r * (1.7 + k * 0.32), 0.022 + 0.01 * (1 - k), 8, 128);
        const rm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 - k * 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
        const ring = new THREE.Mesh(rg, rm);
        ring.rotation.set(1.15 + k * 0.5, 0.35 - k * 0.7, 0);
        rings.push(ring);
        group.add(ring);
        this.disposables.push(rg, rm);
      }
      const hitGeo = new THREE.SphereGeometry(r * 1.8, 12, 8);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.userData.key = n.key;
      group.add(core, shell, hit);
      this.world.add(group);
      this.disposables.push(coreGeo, coreMat, seedGeo, seedMat, shellGeo, shellMat, hitGeo, hitMat);

      const label = document.createElement("div");
      label.className = `pa-node pa-node--${n.kind}${n.tranche ? "" : " is-null"}`;
      const k = document.createElement("span"); k.className = "pa-node__k"; k.textContent = n.title;
      const v = document.createElement("span"); v.className = "pa-node__v"; v.textContent = n.tranche ? n.tranche.label : "non publié";
      const s = document.createElement("span"); s.className = "pa-node__s"; s.textContent = n.unit;
      label.append(k, v, s);
      this.opts.labelLayer.appendChild(label);
      this.nodes.push({ n, group, core, coreMat, shell, shellMat, rings, hit, r, label, grow: 0, hot: 0, phase: i * 1.37 });
    });
  }

  private positions(vertical: boolean): Record<ModelKey, THREE.Vector3> {
    if (vertical) return {
      clients: new THREE.Vector3(-5, 28, 0), comptes: new THREE.Vector3(-5, 13, 2),
      positions: new THREE.Vector3(-8, -3, 0), operations: new THREE.Vector3(8, -3, 0), funds_held: new THREE.Vector3(-3, -25, 1),
    };
    return {
      clients: new THREE.Vector3(-34, 1, 0), comptes: new THREE.Vector3(-15, -1, 2),
      positions: new THREE.Vector3(5, 8.5, 0), operations: new THREE.Vector3(5, -8.5, 1), funds_held: new THREE.Vector3(25, 0, 0),
    };
  }

  private buildLinks() {
    this.links.forEach((l) => { this.world.remove(l.tube, l.pts); l.tube.geometry.dispose(); l.tubeMat.dispose(); l.pts.geometry.dispose(); l.ptsMat.dispose(); });
    this.links = [];
    const P = this.positions(this.vertical);
    const byKey = new Map(this.nodes.map((m) => [m.n.key, m]));
    for (const [a, b, kind] of LINKS) {
      const A = P[a], B = P[b];
      const mid = A.clone().add(B).multiplyScalar(0.5);
      mid.z += 5;
      if (!this.vertical) mid.y += (B.y - A.y) * 0.25; else mid.x += (B.x - A.x) * 0.25;
      const curve = new THREE.QuadraticBezierCurve3(A.clone(), mid, B.clone());
      const color = new THREE.Color(KIND_COLOR[kind]);
      const tubeGeo = new THREE.TubeGeometry(curve, 80, 0.05, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      const target = byKey.get(b)?.n.tranche ?? byKey.get(a)?.n.tranche;
      const count = 14 + 7 * (target?.rank ?? 1);
      const offs = new Float32Array(count);
      for (let i = 0; i < count; i++) offs[i] = Math.random();
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      const ptsMat = new THREE.PointsMaterial({ size: kind === "flux" ? 0.75 : 0.95, map: this.tex, color, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
      const pts = new THREE.Points(g, ptsMat);
      this.world.add(tube, pts);
      // Le stock (positions) s'écoule lentement, le flux (transactions) circule vite
      const speed = kind === "flux" ? 0.2 : kind === "stock" ? 0.045 : 0.09;
      const l: MLink = { a, b, kind, curve, tube, tubeMat, pts, ptsMat, offs, speed, dim: 1 };
      this.links.push(l);
      this.placeParticles(l, this.reduced ? 0 : (performance.now() - this.t0) / 1000);
    }
    this.nodes.forEach((m) => m.group.position.copy(P[m.n.key]));
  }

  private placeParticles(l: MLink, t: number) {
    const arr = (l.pts.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const v = new THREE.Vector3();
    const reveal = this.intro.v;
    for (let i = 0; i < l.offs.length; i++) {
      let u = (l.offs[i] + t * l.speed * (0.8 + (i % 5) * 0.08)) % 1;
      if (u > reveal) u = u * reveal;
      l.curve.getPoint(u, v);
      const j = Math.sin(i * 12.9898) * 0.35;
      arr[i * 3] = v.x; arr[i * 3 + 1] = v.y + j * 0.6; arr[i * 3 + 2] = v.z + j;
    }
    (l.pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  protected layout(w: number, h: number) {
    const vertical = w / h < 0.95;
    if (vertical !== this.vertical || !this.links.length) { this.vertical = vertical; this.buildLinks(); }
    const fov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const halfW = vertical ? 15 : 41, halfH = vertical ? 37 : 20;
    const d = Math.max(halfW / (Math.tan(fov) * (w / h)), halfH / Math.tan(fov));
    this.camera.position.set(0, vertical ? 0 : -2, d);
    this.camera.lookAt(0, vertical ? 0.5 : -0.5, 0);
    this.base.copy(this.camera.position);
  }
  private base = new THREE.Vector3();

  protected pick() {
    let key: ModelKey | null = null;
    if (this.inside) {
      this.ray.setFromCamera(this.ptr, this.camera);
      const hit = this.ray.intersectObjects(this.nodes.map((m) => m.hit), false)[0];
      key = (hit?.object.userData.key as ModelKey) ?? null;
    }
    if (key !== this.hovered) {
      this.hovered = key;
      this.renderer.domElement.style.cursor = key ? "pointer" : "default";
    }
    const m = key ? this.nodes.find((x) => x.n.key === key) : null;
    if (m) {
      const s = this.toScreen(m.group.position);
      this.opts.onHover(m.n, s.x, s.y);
    } else this.opts.onHover(null, 0, 0);
  }

  /** Mise en avant depuis l'extérieur (légende au clavier). */
  focus(key: ModelKey | null) { this.hovered = key; this.dirty = true; }

  protected frame(t: number): boolean {
    const red = this.reduced;
    // Parallaxe douce à la souris
    const tx = this.inside ? this.ptr.x * 2.2 : 0, ty = this.inside ? this.ptr.y * 1.4 : 0;
    this.par.x += (tx - this.par.x) * 0.05; this.par.y += (ty - this.par.y) * 0.05;
    this.camera.position.set(this.base.x + this.par.x, this.base.y + this.par.y, this.base.z);
    this.camera.lookAt(0, this.vertical ? 0.5 : -0.5, 0);
    const conn = new Set<ModelKey>();
    if (this.hovered) { conn.add(this.hovered); this.links.forEach((l) => { if (l.a === this.hovered || l.b === this.hovered) { conn.add(l.a); conn.add(l.b); } }); }
    let moving = !red && (this.intro.v < 1 || this.inside || gsap.isTweening(this.intro));
    const tmp = new THREE.Vector3();
    for (const m of this.nodes) {
      const on = !this.hovered || conn.has(m.n.key);
      const hotT = this.hovered === m.n.key ? 1 : 0;
      m.hot += (hotT - m.hot) * (red ? 1 : 0.12);
      const breathe = red ? 1 : 1 + 0.035 * Math.sin(t * 1.25 + m.phase);
      const s = Math.max(0.001, m.grow) * breathe * (1 + m.hot * 0.12);
      m.group.scale.setScalar(s);
      const dim = on ? 1 : 0.32;
      m.coreMat.uniforms.uDim.value += (dim - m.coreMat.uniforms.uDim.value) * (red ? 1 : 0.15);
      m.shellMat.opacity = (0.16 + m.hot * 0.3) * (on ? 1 : 0.4);
      if (!red) {
        m.shell.rotation.y = t * 0.12 + m.phase; m.shell.rotation.x = t * 0.05;
        m.rings.forEach((r, k) => { r.rotation.z = t * (0.18 + k * 0.1) * (k % 2 ? -1 : 1) + m.phase; });
      }
      // Étiquette sous le nœud (au-dessus pour le stock en disposition horizontale : il surplombe le flux)
      // Vertical (mobile) : à droite des nœuds de la colonne, sous le stock et le flux
      const above = !this.vertical && m.n.key === "positions";
      const right = this.vertical && (m.n.key === "clients" || m.n.key === "comptes" || m.n.key === "funds_held");
      tmp.copy(m.group.position);
      if (right) tmp.x += m.r * 1.55 * Math.max(0.6, s); else tmp.y += (above ? 1 : -1) * m.r * 1.85 * Math.max(0.6, s);
      const p = this.toScreen(tmp);
      m.label.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(${right ? "0, -50%" : above ? "-50%, -100%" : "-50%, 0"})`;
      m.label.classList.toggle("is-right", right);
      m.label.style.opacity = String(Math.min(1, m.grow * 1.4) * (on ? 1 : 0.35));
      m.label.classList.toggle("is-on", this.hovered === m.n.key);
      if (Math.abs(hotT - m.hot) > 0.01) moving = true;
    }
    for (const l of this.links) {
      const on = !this.hovered || (conn.has(l.a) && conn.has(l.b) && (l.a === this.hovered || l.b === this.hovered));
      l.dim += ((on ? 1 : 0.15) - l.dim) * (red ? 1 : 0.15);
      l.tubeMat.opacity = 0.2 * l.dim * this.intro.v;
      l.ptsMat.opacity = 0.95 * l.dim * Math.min(1, this.intro.v * 1.5);
      if (!red) this.placeParticles(l, t);
    }
    if (!red) { this.dust.rotation.z = t * 0.004; this.dust.position.x = Math.sin(t * 0.05) * 2; moving = true; }
    return moving;
  }

  dispose() {
    gsap.killTweensOf(this.intro);
    this.nodes.forEach((m) => { gsap.killTweensOf(m); m.label.remove(); });
    this.links.forEach((l) => { l.tube.geometry.dispose(); l.tubeMat.dispose(); l.pts.geometry.dispose(); l.ptsMat.dispose(); });
    super.dispose();
    this.opts.labelLayer.innerHTML = "";
  }
}

// ===================================================================== 2. matrice desk × classe d'actifs
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
