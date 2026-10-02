/**
 * Accueil — la cité des revenus (Three.js), langage institutionnel : monolithes d'obsidienne filetés d'or sur une
 * trame orthogonale. Aucune forme ronde.
 *
 * Une tour = un fonds. Hauteur proportionnelle (linéaire, comparable à l'œil) au revenu de gestion annuel estimé ;
 * emprise ∝ √encours. Quatre rangées parallèles = les quatre familles de gestion, les fonds classés par revenu
 * décroissant depuis la tête de rangée. Des traits de lumière montent des tours les plus rentables.
 *
 * Ouverture (≈ 3 s) : une onde carrée parcourt le sol, un plan de lumière balaie la ville, les tours sortent de terre
 * (les plus rentables d'abord). Ensuite la page pilote les plans au défilement (goTo) : vue d'ensemble, les trois fonds
 * qui rapportent le plus, puis l'empilement : chaque tour quitte sa rangée et vient s'empiler sur celles de sa famille,
 * à la même échelle — la ville devient l'histogramme exact des revenus par famille.
 * Rendu suspendu hors écran, qualité adaptée au poste (quality.ts), pause globale des animations respectée.
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

export type RevFund = { id: string; name: string; family: string; revenue: number; aum: number; rate: number; share: number | null };
export type RevOptions = {
  funds: RevFund[];
  colors: Record<string, string>;
  familyLabels: Record<string, string>;
  familyShares: Record<string, number | null>;
  familyRevenue: Record<string, number>;
  formatEur: (v: number) => string;
  reduced: boolean;
  labelLayer: HTMLElement;
  onHover: (f: RevFund | null, x: number, y: number) => void;
  onSelect: (f: RevFund) => void;
  onIntroDone?: () => void;
};
export type Shot = { kind: "overview" } | { kind: "stack" } | { kind: "fund"; i: number };

const H_MAX = 64;
const CELL = 10.5;
const AVENUE = 9;
const LANES = ["aid", "ae", "fi", "ao"];
/** Rangée de chaque famille (les fonds non classés rejoignent la rangée « architecture ouverte »). */
const laneOf = (fam: string) => (LANES.includes(fam) ? fam : "ao");
const STACK_W = 13, STACK_H = 96, STACK_GAP = 0.7;

type Tower = { f: RevFund; tall: THREE.Group; body: THREE.Mesh; mat: THREE.MeshStandardMaterial; edge: THREE.LineBasicMaterial;
  cap: THREE.Mesh; capMat: THREE.MeshBasicMaterial; base: THREE.Mesh; baseMat: THREE.MeshBasicMaterial; h: number; w: number; x: number; z: number;
  /** Position dans la pile de sa famille : abscisse, profondeur, bas du bloc, hauteur du bloc */
  sx: number; sz: number; sy: number; sh: number;
  k: number; m: { v: number }; hover: number; dim: number; rank: number };

const STREAK_VS = /* glsl */ `
  attribute float aSeed; attribute vec3 aBase; attribute float aH;
  uniform float uTime; uniform float uPixel; uniform float uOn; uniform float uFade;
  varying float vA;
  void main() {
    float t = fract(uTime * (0.05 + aSeed * 0.08) + aSeed * 11.0);
    vec3 p = aBase + vec3((fract(aSeed * 37.0) - 0.5) * 3.0, aH + t * (26.0 + aSeed * 30.0), (fract(aSeed * 91.0) - 0.5) * 3.0);
    vA = (1.0 - t) * smoothstep(0.0, 0.12, t) * uOn * uFade;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (10.0 + aSeed * 16.0) * uPixel * (90.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
/** Trait vertical fin (pas de point rond) : la lumière monte, plus vive en tête. */
const STREAK_FS = /* glsl */ `
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord;
    if (abs(c.x - 0.5) > 0.04) discard;
    float head = smoothstep(1.0, 0.05, c.y);
    gl_FragColor = vec4(vec3(1.0, 0.84, 0.52) * (0.6 + head), head * vA * 0.9);
  }`;

const square = (s: number, y: number, cx = 0, cz = 0) =>
  [[-s, -s], [s, -s], [s, -s], [s, s], [s, s], [-s, s], [-s, s], [-s, -s]].map(([a, b]) => new THREE.Vector3(cx + a, y, cz + b));

export class RevenueScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.5, 3000);
  private controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private quality: Quality;
  private towers: Tower[] = [];
  private sorted: Tower[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-2, -2);
  private hovered: Tower | null = null;
  private focusId: string | null = null;
  private famFocus: string | null = null;
  private raf = 0;
  private visible = true;
  private streakMat: THREE.ShaderMaterial | null = null;
  private wave!: THREE.LineSegments;
  private waveMat!: THREE.LineBasicMaterial;
  private sweep!: THREE.Mesh;
  private sweepMat!: THREE.MeshBasicMaterial;
  private sweepX = -1e4;
  private districtLabels: HTMLDivElement[] = [];
  private frames: THREE.LineBasicMaterial[] = [];
  private stackK = { v: 0 };
  private overview = { pos: new THREE.Vector3(120, 80, 140), target: new THREE.Vector3(0, 8, 0) };
  private stackTop = 0;
  private stackGoal = 0;
  private extentZ = 60;
  private intro = { k: 0 };
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private t0 = performance.now();
  private idleSpin = true;
  private extent = 60;

  constructor(private host: HTMLElement, private o: RevOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x020409, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.quality = new Quality(() => this.applyQuality());
    this.scene.fog = new THREE.Fog(0x020409, 160, 560);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.02;
    this.controls.maxPolarAngle = 1.36;
    this.controls.rotateSpeed = 0.45;
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
    this.playIntro();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- construction
  private build() {
    const funds = this.o.funds.filter((f) => f.revenue > 0).sort((a, b) => b.revenue - a.revenue);
    const maxRev = funds[0]?.revenue || 1;
    const maxAum = Math.max(...funds.map((f) => f.aum), 1);
    this.scene.add(new THREE.AmbientLight(0x5a6f9a, 0.55));
    const key = new THREE.DirectionalLight(0xffe2b0, 1.8);
    key.position.set(90, 160, 40);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x4f74c4, 1.1);
    rim.position.set(-120, 50, -90);
    this.scene.add(rim);
    const gold = new THREE.Color("#f3dcaa");

    // Rangées : une par famille, deux à six tours de profondeur, les plus gros revenus en tête (à gauche)
    const byLane = new Map<string, RevFund[]>(LANES.map((k) => [k, []]));
    funds.forEach((f) => byLane.get(laneOf(f.family))!.push(f));
    const maxN = Math.max(...[...byLane.values()].map((l) => l.length), 1);
    const R = Math.max(2, Math.min(6, Math.ceil(Math.sqrt(maxN / 4))));
    const cols = Math.ceil(maxN / R);
    const laneD = R * CELL + AVENUE;
    const x0 = -(cols * CELL) / 2;
    const famTotal = new Map<string, number>();
    funds.forEach((f) => { const q = laneOf(f.family); famTotal.set(q, (famTotal.get(q) ?? 0) + f.revenue); });
    const kStack = STACK_H / ((Math.max(...famTotal.values(), 1) / maxRev) * H_MAX);
    let ext = 40;
    LANES.forEach((q, li) => {
      const list = byLane.get(q)!;
      if (!list.length) return;
      const zc = (li - (LANES.length - 1) / 2) * laneD;
      const stackX = x0 - CELL * 2.2;
      let acc = 0;
      list.forEach((f, i) => {
        const x = x0 + CELL * (Math.floor(i / R) + 0.5), z = zc + ((i % R) - (R - 1) / 2) * CELL;
        ext = Math.max(ext, Math.abs(x) + CELL, Math.abs(z) + CELL);
        const color = new THREE.Color(this.o.colors[f.family] ?? "#8d929c");
        const h = Math.max(1.6, (f.revenue / maxRev) * H_MAX);
        const w = 2.4 + 6.2 * Math.sqrt(f.aum / maxAum);
        const geo = new THREE.BoxGeometry(1, 1, 1);
        geo.translate(0, 0.5, 0);
        const mat = new THREE.MeshStandardMaterial({ color: 0x0a101c, emissive: color.clone().multiplyScalar(0.55 / Math.max(0.35, color.r * 0.3 + color.g * 0.59 + color.b * 0.11)),
          emissiveIntensity: 0.05, metalness: 0.92, roughness: 0.22, transparent: true, opacity: 1 });
        const body = new THREE.Mesh(geo, mat);
        body.userData.i = this.towers.length;
        const edge = new THREE.LineBasicMaterial({ color: color.clone().lerp(gold, 0.55), transparent: true, opacity: 0 });
        const tall = new THREE.Group();
        tall.add(body, new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge));
        const capMat = new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0, depthWrite: false });
        const cap = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), capMat);
        cap.rotation.x = -Math.PI / 2;
        const baseMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
        const base = new THREE.Mesh(new THREE.PlaneGeometry(w + 2.4, w + 2.4), baseMat);
        base.rotation.x = -Math.PI / 2;
        base.position.set(x, 0.03, z);
        this.scene.add(tall, cap, base);
        const sh = Math.max(0.35, h * kStack - STACK_GAP);
        this.towers.push({ f, tall, body, mat, edge, cap, capMat, base, baseMat, h, w, x, z, sx: stackX, sz: zc, sy: acc, sh,
          k: 0, m: { v: 0 }, hover: 0, dim: 1, rank: i });
        acc += sh + STACK_GAP;
      });
      this.stackTop = Math.max(this.stackTop, acc);
      // Cadre de la rangée et étiquette de la pile (visible quand les tours sont empilées)
      const len = Math.ceil(list.length / R) * CELL;
      const col = this.o.colors[q] ?? "#8d929c";
      const fm = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.5 });
      this.frames.push(fm);
      const hx = len / 2 + 1.5, hz = (R * CELL) / 2 + 1.5, cx = x0 + len / 2;
      this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(
        [[-hx, -hz], [hx, -hz], [hx, -hz], [hx, hz], [hx, hz], [-hx, hz], [-hx, hz], [-hx, -hz]].map(([a, b]) => new THREE.Vector3(cx + a, 0.06, zc + b))), fm));
      const lab = document.createElement("div");
      lab.className = "rev3d__district";
      const sw = document.createElement("i"), nm = document.createElement("b"), shr = document.createElement("span");
      sw.style.background = col;
      nm.textContent = this.o.familyLabels[q] ?? q;
      const share = this.o.familyShares[q], rev = this.o.familyRevenue[q];
      shr.textContent = [share != null ? `${Math.round(share * 100)} % des revenus` : "", rev != null ? this.o.formatEur(rev) : ""].filter(Boolean).join(" · ");
      lab.append(sw, nm, shr);
      lab.dataset.x = String(stackX);
      lab.dataset.y = "0";
      lab.dataset.z = String(zc);
      lab.style.opacity = "0";
      this.o.labelLayer.appendChild(lab);
      this.districtLabels.push(lab);
    });
    // Socle des piles : une ligne d'or, comme l'axe d'un histogramme
    const sX = x0 - CELL * 2.2, half = (LANES.length * laneD) / 2;
    const plinth = new THREE.LineBasicMaterial({ color: 0xf3dcaa, transparent: true, opacity: 0 });
    this.frames.push(plinth);
    plinth.userData.stack = true;
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(sX, 0.07, -half), new THREE.Vector3(sX, 0.07, half)]), plinth));
    const E = Math.max(ext, half);
    this.extentZ = half;
    this.overview = { pos: new THREE.Vector3(E * 1.25, E * 0.8, E * 1.45), target: new THREE.Vector3(-E * 0.08, 8, 0) };
    this.extent = E;
    this.sorted = [...this.towers].sort((a, b) => b.f.revenue - a.f.revenue);

    // Sol : dalle sombre, trame orthogonale fine et deux avenues dorées
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: 0x03060c, roughness: 0.92, metalness: 0.2 }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const size = Math.ceil((Math.max(ext, half) * 2 + 80) / CELL) * CELL;
    const grid = new THREE.GridHelper(size, Math.round(size / (CELL / 2)), 0x1c355e, 0x14243f);
    const gm = grid.material as THREE.LineBasicMaterial;
    gm.transparent = true;
    gm.opacity = 0.32;
    grid.position.y = 0.01;
    this.scene.add(grid);
    // Allées : filets d'or entre les rangées
    const lines: THREE.Vector3[] = [];
    for (let i = 0; i <= LANES.length; i++) {
      const z = (i - LANES.length / 2) * laneD;
      lines.push(new THREE.Vector3(x0 - CELL * 4, 0.05, z), new THREE.Vector3(-x0 + CELL * 1.5, 0.05, z));
    }
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0xcc9f53, transparent: true, opacity: 0.35 })));
    // Onde carrée d'ouverture
    this.waveMat = new THREE.LineBasicMaterial({ color: 0xf3dcaa, transparent: true, opacity: 0 });
    this.wave = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(square(1, 0.08)), this.waveMat);
    this.scene.add(this.wave);
    // Plan de lumière qui balaie la ville
    this.sweepMat = new THREE.MeshBasicMaterial({ color: 0xf3dcaa, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending });
    this.sweep = new THREE.Mesh(new THREE.BoxGeometry(0.6, 140, half * 2 + 40), this.sweepMat);
    this.sweep.position.set(-1e4, 70, 0);
    this.scene.add(this.sweep);

    // Traits de lumière au-dessus des douze tours les plus rentables
    const top = this.sorted.slice(0, 12);
    const n = this.o.reduced ? 0 : 900;
    if (n && top.length) {
      const base = new Float32Array(n * 3), seed = new Float32Array(n), hh = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = top[i % top.length];
        base.set([t.x, 0, t.z], i * 3);
        seed[i] = Math.random();
        hh[i] = t.h;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("aBase", new THREE.BufferAttribute(base, 3));
      g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
      g.setAttribute("aH", new THREE.BufferAttribute(hh, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 40, 0), 500);
      this.streakMat = new THREE.ShaderMaterial({ vertexShader: STREAK_VS, fragmentShader: STREAK_FS, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uPixel: { value: 1 }, uOn: { value: 0 }, uFade: { value: 1 } } });
      this.scene.add(new THREE.Points(g, this.streakMat));
    }
  }

  private playIntro() {
    if (this.o.reduced) {
      this.towers.forEach((t) => this.setHeight(t, 1));
      this.camera.position.copy(this.overview.pos);
      this.controls.target.copy(this.overview.target);
      this.intro.k = 1;
      if (this.streakMat) this.streakMat.uniforms.uOn.value = 1;
      this.o.onIntroDone?.();
      return;
    }
    const E = this.extent;
    this.camera.position.set(0.01, E * 4, 0.01);
    this.controls.target.set(0, 0, 0);
    const tl = gsap.timeline({ onComplete: () => this.o.onIntroDone?.() });
    const w = { s: 0.1 };
    tl.to(w, { s: E * 1.7, duration: 1.9, ease: "expo.out",
      onUpdate: () => { this.wave.scale.set(w.s, 1, w.s); this.waveMat.opacity = 0.95 * (1 - w.s / (E * 1.7)); } }, 0.2);
    const sw = { x: -E - 50 };
    tl.to(sw, { x: E + 50, duration: 2.1, ease: "power2.inOut",
      onStart: () => { this.sweepMat.opacity = 0.22; },
      onUpdate: () => { this.sweepX = sw.x; this.sweep.position.x = sw.x; },
      onComplete: () => { this.sweepMat.opacity = 0; this.sweepX = -1e4; } }, 0.5);
    this.sorted.forEach((t, i) => {
      const g = { k: 0 };
      tl.to(g, { k: 1, duration: 1.4, ease: "expo.out", onUpdate: () => this.setHeight(t, g.k) }, 0.55 + i * (1.3 / Math.max(this.sorted.length, 1)));
    });
    tl.to(this.camera.position, { x: this.overview.pos.x, y: this.overview.pos.y, z: this.overview.pos.z, duration: 3, ease: "power3.inOut" }, 0.1)
      .to(this.controls.target, { x: this.overview.target.x, y: this.overview.target.y, z: this.overview.target.z, duration: 3, ease: "power3.inOut" }, 0.1);
    if (this.streakMat) tl.to(this.streakMat.uniforms.uOn, { value: 1, duration: 1.2 }, 1.9);
    tl.to(this.intro, { k: 1, duration: 0.4 }, 2.7);
  }

  private setHeight(t: Tower, k: number) { t.k = k; }

  // ---------------------------------------------------------------- plans pilotés par la page
  /** Mouvement de caméra vers un plan : vue d'ensemble, fonds n° i (par revenu), empilement par famille. */
  goTo(shot: Shot, dur = 1.6) {
    this.idleSpin = shot.kind === "overview";
    let pos: THREE.Vector3, target: THREE.Vector3;
    const t = shot.kind === "fund" ? this.sorted[shot.i] : undefined;
    const narrow = this.camera.aspect < 1;
    if (t) {
      this.focusId = t.f.id;
      // Caméra hors de la ville, de biais, tour cadrée dans la moitié droite de l'écran
      const out = new THREE.Vector3(Math.sign(t.x) * 0.55 || 0.55, 0, Math.sign(t.z) || 1).normalize();
      const side = new THREE.Vector3(-out.z, 0, out.x);
      const d = Math.max(70, t.h * 1.55 + 34);
      pos = new THREE.Vector3(t.x, 0, t.z).addScaledVector(out, d).addScaledVector(side, d * 0.6);
      pos.y = t.h * 0.85 + 14;
      target = new THREE.Vector3(t.x, t.h * 0.5, t.z).addScaledVector(side, narrow ? 0 : d * 0.24);
    } else if (shot.kind === "stack") {
      this.focusId = null;
      // De face, dans l'axe des rangées : les quatre piles côte à côte, comme un histogramme
      const sX = this.towers[0]?.sx ?? 0, top = this.stackTop;
      const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), half = this.extentZ;
      if (narrow) {
        // Écran étroit : les piles occupent le tiers haut, la fiche le bas
        const d = Math.max((half * 1.15) / (this.camera.aspect * tanV), top / (0.66 * tanV));
        target = new THREE.Vector3(sX, top / 2 - 0.42 * d * tanV, 0);
        pos = new THREE.Vector3(sX - d, top * 0.5, d * 0.1);
      } else {
        const d = Math.max((half * 2.2) / (this.camera.aspect * tanV), (top * 0.72) / tanV);
        target = new THREE.Vector3(sX, top * 0.4, -half * 0.58);
        pos = new THREE.Vector3(sX - d, top * 0.46, target.z + d * 0.16);
      }
    } else {
      this.focusId = null;
      pos = this.overview.pos.clone();
      target = this.overview.target.clone();
    }
    const d = this.o.reduced ? 0 : dur;
    gsap.to(this.camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: d, ease: "power3.inOut", overwrite: true });
    gsap.to(this.controls.target, { x: target.x, y: target.y, z: target.z, duration: d, ease: "power3.inOut", overwrite: true });
    const stack = shot.kind === "stack" ? 1 : 0;
    if (stack !== this.stackGoal) {
      this.stackGoal = stack;
      gsap.to(this.stackK, { v: stack, duration: d * 0.9, delay: stack ? d * 0.35 : 0, overwrite: true });
      // Chaque tour quitte sa rangée et vient se poser sur la pile de sa famille (du bas vers le haut ; l'inverse au retour)
      const n = Math.max(...this.towers.map((x) => x.rank), 1);
      for (const tw of this.towers) {
        const order = stack ? tw.rank : n - tw.rank;
        gsap.to(tw.m, { v: stack, duration: d ? 1.25 : 0, delay: d ? order * (1.1 / n) : 0, ease: "power3.inOut", overwrite: true });
      }
    }
  }

  /** Rotation autour du point visé (boutons et flèches du clavier : alternative au glisser). */
  nudge(deg: number) {
    this.idleSpin = false;
    const p = this.camera.position, c = this.controls.target;
    const a0 = Math.atan2(p.z - c.z, p.x - c.x), r = Math.hypot(p.x - c.x, p.z - c.z);
    const o = { a: a0 };
    gsap.to(o, { a: a0 + (deg * Math.PI) / 180, duration: this.o.reduced ? 0 : 0.6, ease: "power2.out",
      onUpdate: () => { p.x = c.x + Math.cos(o.a) * r; p.z = c.z + Math.sin(o.a) * r; } });
  }

  resetView() { this.goTo({ kind: "overview" }, 0.9); }

  setFocus(fam: string | null) { this.famFocus = fam; }

  // ---------------------------------------------------------------- interaction
  private onMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.towers.map((t) => t.body), false)[0];
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
      this.composer.addPass(new UnrealBloomPass(size, 0.6, 0.45, 0.72));
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
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    if (this.streakMat) this.streakMat.uniforms.uPixel.value = this.renderer.getPixelRatio();
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible) return;
    const busy = this.intro.k < 1 || gsap.isTweening(this.camera.position) || gsap.isTweening(this.stackK) || this.towers.some((t) => gsap.isTweening(t.m));
    if (!this.quality.gate(now, busy)) return;
    const still = motionPaused();
    if (this.streakMat && !still) this.streakMat.uniforms.uTime.value = (now - this.t0) / 1000;
    if (this.idleSpin && this.intro.k >= 1 && !still && !gsap.isTweening(this.camera.position)) {
      const p = this.camera.position, c = this.controls.target, a = 0.0008;
      const x = p.x - c.x, z = p.z - c.z;
      p.x = c.x + x * Math.cos(a) - z * Math.sin(a);
      p.z = c.z + x * Math.sin(a) + z * Math.cos(a);
    }
    this.controls.update();
    for (const tw of this.towers) {
      const on = this.hovered === tw || this.focusId === tw.f.id ? 1 : 0;
      tw.hover += (on - tw.hover) * 0.12;
      const famOff = this.famFocus && laneOf(tw.f.family) !== laneOf(this.famFocus);
      const dimT = famOff ? 0.1 : this.focusId && this.focusId !== tw.f.id ? 0.28 : this.hovered && this.hovered !== tw ? 0.55 : 1;
      tw.dim += (dimT - tw.dim) * 0.1;
      const swept = this.sweepX > -1e3 ? Math.max(0, 1 - Math.abs(tw.x - this.sweepX) / 14) : 0;
      const grown = Math.min(1, tw.k * 2);
      // Interpolation ville → pile, avec un arc : le bloc se soulève, glisse, puis se pose
      const m = tw.m.v, hy = Math.max(0.001, tw.h * tw.k);
      const px = tw.x + (tw.sx - tw.x) * m, pz = tw.z + (tw.sz - tw.z) * m;
      const py = tw.sy * m + Math.sin(Math.PI * m) * (10 + tw.rank * 1.2);
      const sy = hy + (tw.sh - hy) * m, sxz = tw.w + (STACK_W - tw.w) * m;
      tw.tall.position.set(px, py, pz);
      tw.tall.scale.set(sxz, sy, sxz);
      tw.cap.position.set(px, py + sy + 0.03, pz);
      tw.cap.scale.set(sxz * 0.98, sxz * 0.98, 1);
      tw.mat.emissiveIntensity = 0.04 + 0.6 * swept + tw.hover * 0.4 + 0.1 * Math.sin(Math.PI * m);
      tw.mat.opacity = 0.18 + 0.82 * tw.dim;
      tw.edge.opacity = Math.min(1, (0.12 + 0.68 * tw.dim) * grown + swept * 0.4 + tw.hover * 0.35 + 0.15 * m);
      tw.capMat.opacity = Math.min(0.85, grown * (0.08 + 0.4 * (tw.h / H_MAX)) * (0.25 + 0.75 * tw.dim) * (1 - 0.7 * m) + tw.hover * 0.35 + swept * 0.5);
      tw.baseMat.opacity = (0.08 * tw.dim + tw.hover * 0.4) * grown * (1 - m);
    }
    const sk = this.stackK.v;
    for (const fm of this.frames) fm.opacity = fm.userData.stack ? 0.9 * sk : 0.5 * (1 - sk);
    if (this.streakMat) this.streakMat.uniforms.uFade.value = 1 - sk;
    this.placeLabels();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  };

  private placeLabels() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const v = new THREE.Vector3();
    for (const lab of this.districtLabels) {
      v.set(Number(lab.dataset.x), Number(lab.dataset.y), Number(lab.dataset.z)).project(this.camera);
      lab.style.opacity = Math.max(0, this.stackK.v * 1.6 - 0.6).toFixed(3);
      lab.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, 14px)`;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    gsap.killTweensOf([this.camera.position, this.controls.target, this.intro, this.stackK, ...this.towers.map((t) => t.m)]);
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("click", this.onClick);
    this.districtLabels.forEach((l) => l.remove());
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
