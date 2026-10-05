/**
 * Accueil — le prisme des revenus (Three.js).
 *
 * Métaphore exacte du calcul : un faisceau d'encours entre dans un prisme (les frais de gestion) et en ressort en
 * revenus. Les revenus se séparent en quatre faisceaux, un par famille de gestion, d'épaisseur proportionnelle (linéaire)
 * à leurs revenus ; chaque famille se divise ensuite en faisceaux de fonds qui frappent un mur de classement, rangés du
 * fonds qui rapporte le plus (en haut, le plus épais, le plus lumineux) au dixième, puis « autres fonds ». La lumière se
 * conserve : la somme des épaisseurs est la même à chaque étape.
 *
 * Ouverture (≈ 4 s, sans défilement) : nuit, un trait de lumière file vers le prisme, éclair, les familles jaillissent,
 * les fonds frappent le mur, le n° 1 s'impose ; la caméra recule de la face du prisme au plan large. Ensuite la page
 * pilote les plans (goTo). Formes nettes (prisme triangulaire, rubans plats), aucune forme ronde.
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
export type PrismOptions = {
  funds: RevFund[];
  total: number;
  aum: number | null;
  colors: Record<string, string>;
  familyLabels: Record<string, string>;
  familyOrder: string[];
  reduced: boolean;
  labelLayer: HTMLElement;
  formatEur: (v: number) => string;
  formatPct: (v: number | null) => string;
  onHover: (f: RevFund | null, x: number, y: number) => void;
  onSelect: (f: RevFund) => void;
  onIntroDone?: () => void;
};
export type Shot = { kind: "overview" } | { kind: "families" } | { kind: "fund"; i: number } | { kind: "wall" };

const H = 20;            // épaisseur totale des revenus (unités monde)
const X_SRC = -96, X_PRISM = -24, X_SPLIT = 6, X_WALL = 38;
const GAP_SPLIT = 3.2, GAP_WALL = 1.05, TOP_N = 10;
const OVERVIEW = { pos: new THREE.Vector3(9, 14, 122), target: new THREE.Vector3(9, 11, 0) };

const BEAM_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// Ruban de lumière : cœur vif, bords plus doux, pulsations qui filent dans le sens de la lumière ; uOn = progression du tracé
const BEAM_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uOn; uniform float uTime; uniform float uDim; uniform float uLen; uniform float uGain;
  varying vec2 vUv;
  void main() {
    if (vUv.x > uOn) discard;
    float core = 1.0 - abs(vUv.y - 0.5) * 2.0;
    float glow = pow(max(core, 0.0), 0.55);
    float flow = 0.82 + 0.18 * sin(vUv.x * uLen * 0.35 - uTime * 3.2);
    float head = smoothstep(uOn - 0.04, uOn, vUv.x) * step(uOn, 0.999);
    vec3 c = uColor * (0.55 + 0.9 * glow) * flow + vec3(1.0, 0.95, 0.85) * head * 1.6;
    gl_FragColor = vec4(c * uGain, (0.22 + 0.7 * glow) * uDim);
  }`;

type Beam = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; fund?: RevFund; family?: string; rank?: number; kind: "src" | "fam" | "fund" | "rest";
  on: { v: number }; dim: number; target: number };

/** Ruban plat (deux triangles) d'une section a (x1, haut y1a, bas y1b) à une section b (x2, y2a, y2b). */
function ribbon(x1: number, y1a: number, y1b: number, x2: number, y2a: number, y2b: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([x1, y1a, z, x1, y1b, z, x2, y2a, z, x2, y2b, z], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 1, 1, 0], 2));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return g;
}

export class PrismScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.5, 2000);
  private controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private quality: Quality;
  private beams: Beam[] = [];
  private fundBeams: Beam[] = [];
  private prismMat!: THREE.MeshStandardMaterial;
  private prismEdge!: THREE.LineBasicMaterial;
  private slots: { el: HTMLDivElement; pos: THREE.Vector3; rank: number; fund?: RevFund; on: { v: number } }[] = [];
  private tags: { el: HTMLDivElement; pos: THREE.Vector3; on: { v: number }; anchor: "left" | "right" | "center" }[] = [];
  private impacts: { mat: THREE.MeshBasicMaterial; rank: number }[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-2, -2);
  private hovered: Beam | null = null;
  private focusFam: string | null = null;
  private focusRank: number | null = null;
  private raf = 0;
  private visible = true;
  private intro = { k: 0 };
  private flash = { v: 0 };
  private ro: ResizeObserver;
  private t0 = performance.now();
  private idle = true;
  private ranked: RevFund[] = [];

  constructor(private host: HTMLElement, private o: PrismOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x020409, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.quality = new Quality(() => this.applyQuality());
    this.scene.fog = new THREE.Fog(0x020409, 120, 420);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.4;
    this.controls.minPolarAngle = 1.05;
    this.controls.maxPolarAngle = 1.75;
    this.controls.minAzimuthAngle = -0.7;
    this.controls.maxAzimuthAngle = 0.7;
    this.controls.addEventListener("start", () => { this.idle = false; });
    this.build();
    this.applyQuality();
    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("click", this.onClick);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.playIntro();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- construction
  private beamMat(color: THREE.Color | string, len: number, gain = 1): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({ vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(color) }, uOn: { value: 0 }, uTime: { value: 0 }, uDim: { value: 1 },
        uLen: { value: len }, uGain: { value: gain } } });
  }

  private add(geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial, kind: Beam["kind"], extra: Partial<Beam> = {}): Beam {
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
    const b: Beam = { mesh, mat, kind, on: { v: 0 }, dim: 1, target: 1, ...extra };
    mesh.userData.beam = b;
    this.beams.push(b);
    return b;
  }

  private build() {
    const tot = this.o.total || 1;
    const k = H / tot;
    const funds = this.o.funds.filter((f) => f.revenue > 0).sort((a, b) => b.revenue - a.revenue);
    this.ranked = funds.slice(0, TOP_N);
    const rankOf = new Map(this.ranked.map((f, i) => [f.id, i]));
    const fams = this.o.familyOrder.filter((fa) => funds.some((f) => f.family === fa));
    const famRev = new Map(fams.map((fa) => [fa, funds.filter((f) => f.family === fa).reduce((s, f) => s + f.revenue, 0)]));

    // Sol de verre noir, ligne d'horizon dorée
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 600), new THREE.MeshStandardMaterial({ color: 0x03060c, roughness: 0.35, metalness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -H * 1.35;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(600, 120, 0x1c355e, 0x0e1a30);
    (grid.material as THREE.LineBasicMaterial).transparent = true;
    (grid.material as THREE.LineBasicMaterial).opacity = 0.22;
    grid.position.y = floor.position.y + 0.02;
    this.scene.add(grid);
    this.scene.add(new THREE.AmbientLight(0x6f84b0, 0.5));
    const key = new THREE.DirectionalLight(0xffe6bd, 1.4);
    key.position.set(-20, 60, 60);
    this.scene.add(key);

    // Faisceau d'encours, du bord gauche au prisme
    const srcH = H * 0.42;
    this.add(ribbon(X_SRC, srcH / 2, -srcH / 2, X_PRISM - 3.2, srcH / 2, -srcH / 2, 0), this.beamMat("#fff1d0", 40, 1.15), "src");
    // Le prisme : triangle équilatéral extrudé, pointe vers le haut
    const R = H * 0.62;
    const pgeo = new THREE.CylinderGeometry(R, R, 9, 3, 1, false);
    pgeo.rotateX(Math.PI / 2);
    pgeo.rotateZ(Math.PI);                      // pointe vers le haut
    this.prismMat = new THREE.MeshStandardMaterial({ color: 0x0c1830, emissive: new THREE.Color("#f3dcaa"), emissiveIntensity: 0.02, metalness: 0.2, roughness: 0.08,
      transparent: true, opacity: 0.55 });
    const prism = new THREE.Mesh(pgeo, this.prismMat);
    prism.position.set(X_PRISM, 0, 0);
    this.prismEdge = new THREE.LineBasicMaterial({ color: 0xf3dcaa, transparent: true, opacity: 0.25 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(pgeo), this.prismEdge);
    edges.position.copy(prism.position);
    this.scene.add(prism, edges);

    // Familles : empilées à la sortie du prisme, puis écartées jusqu'au plan de séparation
    const bands = new Map<string, { a0: number; a1: number; s0: number; s1: number }>();
    let a = H / 2;
    const spread = H + GAP_SPLIT * (fams.length - 1);
    let s = spread / 2;
    for (const fa of fams) {
      const t = (famRev.get(fa) ?? 0) * k;
      bands.set(fa, { a0: a, a1: a - t, s0: s, s1: s - t });
      this.add(ribbon(X_PRISM + 3.4, a, a - t, X_SPLIT, s, s - t, 0.01), this.beamMat(this.o.colors[fa] ?? "#8d929c", 34, 1.0), "fam", { family: fa });
      a -= t;
      s -= t + GAP_SPLIT;
    }

    // Mur de classement : dix fonds du haut (n° 1) vers le bas, puis « autres fonds »
    const slotT = this.ranked.map((f) => f.revenue * k);
    const restT = H - slotT.reduce((x, y) => x + y, 0);
    const wallH = H + GAP_WALL * TOP_N + 2;
    let w = wallH / 2;
    const slotY: { y0: number; y1: number }[] = [];
    slotT.forEach((t) => { slotY.push({ y0: w, y1: w - t }); w -= t + GAP_WALL; });
    w -= 1.4;
    const rest = { y0: w, y1: w - restT };
    // Panneau du mur
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(1.2, wallH + 10), new THREE.MeshStandardMaterial({ color: 0x0a1222, roughness: 0.6, metalness: 0.3 }));
    wall.position.set(X_WALL + 0.7, (slotY[0]?.y0 ?? 0) - (wallH + 10) / 2 + 5, -0.2);
    this.scene.add(wall);

    // Fonds : chaque famille se divise ; ses fonds classés vont à leur case, le reste à « autres fonds »
    let restCursor = rest.y0;
    for (const fa of fams) {
      const band = bands.get(fa)!;
      const mine = funds.filter((f) => f.family === fa);
      const top = mine.filter((f) => rankOf.has(f.id)).sort((x, y) => rankOf.get(x.id)! - rankOf.get(y.id)!);
      const others = mine.filter((f) => !rankOf.has(f.id));
      let y = band.s0;
      for (const f of top) {
        const t = f.revenue * k, r = rankOf.get(f.id)!;
        const col = new THREE.Color(this.o.colors[fa] ?? "#8d929c").lerp(new THREE.Color("#fff3d6"), r === 0 ? 0.35 : 0.08);
        const b = this.add(ribbon(X_SPLIT, y, y - t, X_WALL, slotY[r].y0, slotY[r].y1, 0.02 + r * 0.004), this.beamMat(col, 46, r === 0 ? 1.5 : 1.0), "fund",
          { fund: f, family: fa, rank: r });
        this.fundBeams.push(b);
        y -= t;
      }
      const rt = others.reduce((x, f) => x + f.revenue * k, 0);
      if (rt > 0.001) {
        this.add(ribbon(X_SPLIT, y, y - rt, X_WALL, restCursor, restCursor - rt, 0.015), this.beamMat(this.o.colors[fa] ?? "#8d929c", 46, 0.55), "rest", { family: fa });
        restCursor -= rt;
      }
    }

    // Impacts sur le mur et étiquettes de classement
    const fmt = this.o.formatEur, pct = this.o.formatPct;
    this.ranked.forEach((f, r) => {
      const { y0, y1 } = slotY[r];
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.o.colors[f.family] ?? "#cc9f53").lerp(new THREE.Color("#fff3d6"), 0.5),
        transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const imp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, Math.max(0.18, y0 - y1)), mat);
      imp.position.set(X_WALL + 0.05, (y0 + y1) / 2, 0.05);
      this.scene.add(imp);
      this.impacts.push({ mat, rank: r });
      const el = document.createElement("div");
      el.className = `prism__slot${r === 0 ? " is-first" : ""}`;
      el.dataset.r = String(r);
      const n = document.createElement("span"), nm = document.createElement("b"), v = document.createElement("em");
      n.className = "num"; n.textContent = String(r + 1).padStart(2, "0");
      nm.textContent = f.name;
      v.className = "num"; v.textContent = `${fmt(f.revenue)} · ${pct(f.share)}`;
      el.append(n, nm, v);
      if (r === 0) { const k0 = document.createElement("i"); k0.textContent = "Le fonds qui rapporte le plus"; el.prepend(k0); }
      el.addEventListener("click", () => this.o.onSelect(f));
      this.o.labelLayer.appendChild(el);
      this.slots.push({ el, pos: new THREE.Vector3(X_WALL + 2.2, (y0 + y1) / 2, 0), rank: r, fund: f, on: { v: 0 } });
    });
    if (restT > 0.01) {
      const el = document.createElement("div");
      el.className = "prism__slot is-rest";
      const n = document.createElement("span"), nm = document.createElement("b"), v = document.createElement("em");
      n.textContent = "+";
      nm.textContent = `${funds.length - this.ranked.length} autres fonds`;
      v.className = "num"; v.textContent = pct(restT / H);
      el.append(n, nm, v);
      this.o.labelLayer.appendChild(el);
      this.slots.push({ el, pos: new THREE.Vector3(X_WALL + 2.2, (rest.y0 + rest.y1) / 2, 0), rank: TOP_N, on: { v: 0 } });
    }
    // Repères : encours entrant, prisme des frais, familles
    const tag = (text: string, sub: string, pos: THREE.Vector3, anchor: "left" | "right" | "center", cls = "") => {
      const el = document.createElement("div");
      el.className = `prism__tag ${cls}`;
      const b = document.createElement("b"), sp = document.createElement("span");
      b.textContent = text; sp.textContent = sub;
      el.append(b, sp);
      this.o.labelLayer.appendChild(el);
      this.tags.push({ el, pos, on: { v: 0 }, anchor });
    };
    tag("Encours sous gestion", this.o.aum != null ? fmt(this.o.aum) : "", new THREE.Vector3(X_PRISM - 17, srcH / 2 + 2.6, 0), "center", "is-src");
    tag("× frais de gestion", "le prisme", new THREE.Vector3(X_PRISM, -R * 0.5 - 3.2, 0), "center", "is-prism");
    for (const fa of fams) {
      const b = bands.get(fa)!;
      tag(this.o.familyLabels[fa] ?? fa, `${fmt(famRev.get(fa) ?? 0)} · ${pct((famRev.get(fa) ?? 0) / tot)}`, new THREE.Vector3(X_SPLIT - 0.8, (b.s0 + b.s1) / 2, 0), "right", "is-fam");
    }
  }

  // ---------------------------------------------------------------- ouverture
  private playIntro() {
    const all = () => {
      this.beams.forEach((b) => { b.on.v = 1; });
      this.slots.forEach((s) => { s.on.v = 1; });
      this.tags.forEach((t) => { t.on.v = 1; });
      this.intro.k = 1;
    };
    if (this.o.reduced) {
      all();
      this.camera.position.copy(OVERVIEW.pos);
      this.controls.target.copy(OVERVIEW.target);
      this.o.onIntroDone?.();
      return;
    }
    // Départ : tout près de la face du prisme, en contre-plongée
    this.camera.position.set(X_PRISM - 26, -3, 22);
    this.controls.target.set(X_PRISM + 4, 1, 0);
    const tl = gsap.timeline({ onComplete: () => { this.o.onIntroDone?.(); } });
    const src = this.beams.filter((b) => b.kind === "src");
    const fam = this.beams.filter((b) => b.kind === "fam");
    const fund = this.beams.filter((b) => b.kind === "fund" || b.kind === "rest");
    tl.to(src.map((b) => b.on), { v: 1, duration: 0.85, ease: "power2.in" }, 0.25)
      .to(this.flash, { v: 1, duration: 0.12, ease: "power2.out" }, 1.08)
      .to(this.flash, { v: 0, duration: 1.1, ease: "power2.out" }, 1.2)
      .to(fam.map((b) => b.on), { v: 1, duration: 0.75, ease: "expo.out", stagger: 0.06 }, 1.12)
      .to(fund.sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99)).map((b) => b.on), { v: 1, duration: 0.9, ease: "power3.out", stagger: 0.05 }, 1.7)
      .to(this.tags.map((t) => t.on), { v: 1, duration: 0.6, stagger: 0.08 }, 1.4)
      .to([...this.slots].sort((x, y) => x.rank - y.rank).map((s) => s.on), { v: 1, duration: 0.5, stagger: 0.07 }, 2.3)
      .to(this.camera.position, { x: OVERVIEW.pos.x, y: OVERVIEW.pos.y, z: OVERVIEW.pos.z, duration: 3.6, ease: "power3.inOut" }, 0.15)
      .to(this.controls.target, { x: OVERVIEW.target.x, y: OVERVIEW.target.y, z: OVERVIEW.target.z, duration: 3.6, ease: "power3.inOut" }, 0.15)
      .to(this.intro, { k: 1, duration: 0.3 }, 3.6);
  }

  // ---------------------------------------------------------------- plans pilotés par la page
  goTo(shot: Shot, dur = 1.5) {
    const narrow = this.camera.aspect < 1;
    let pos: THREE.Vector3, target: THREE.Vector3;
    this.focusRank = null;
    if (shot.kind === "fund" && this.ranked[shot.i]) {
      const s = this.slots.find((x) => x.rank === shot.i)!;
      this.focusRank = shot.i;
      target = new THREE.Vector3(X_WALL + (narrow ? 10 : -12), s.pos.y + (narrow ? 10 : 0), 0);
      pos = new THREE.Vector3(X_WALL - (narrow ? 6 : 40), s.pos.y + (narrow ? 14 : 6), narrow ? 64 : 46);
    } else if (shot.kind === "families") {
      target = new THREE.Vector3(narrow ? X_SPLIT - 6 : X_SPLIT - 22, 0, 0);
      pos = new THREE.Vector3(X_PRISM + 6, 10, narrow ? 120 : 74);
    } else if (shot.kind === "wall") {
      target = new THREE.Vector3(narrow ? X_WALL + 14 : X_WALL - 6, narrow ? 6 : 0, 0);
      pos = new THREE.Vector3(narrow ? X_WALL + 8 : X_WALL - 30, narrow ? 8 : 4, narrow ? 104 : 62);
    } else {
      target = OVERVIEW.target.clone();
      pos = OVERVIEW.pos.clone();
      if (narrow) pos.z *= 1.9;
    }
    this.idle = shot.kind === "overview";
    const d = this.o.reduced ? 0 : dur;
    gsap.to(this.camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: d, ease: "power3.inOut", overwrite: true });
    gsap.to(this.controls.target, { x: target.x, y: target.y, z: target.z, duration: d, ease: "power3.inOut", overwrite: true });
  }

  nudge(deg: number) {
    this.idle = false;
    const p = this.camera.position, c = this.controls.target;
    const a0 = Math.atan2(p.x - c.x, p.z - c.z), r = Math.hypot(p.x - c.x, p.z - c.z);
    const o = { a: a0 };
    gsap.to(o, { a: Math.max(-0.7, Math.min(0.7, a0 + (deg * Math.PI) / 180)), duration: this.o.reduced ? 0 : 0.6, ease: "power2.out",
      onUpdate: () => { p.x = c.x + Math.sin(o.a) * r; p.z = c.z + Math.cos(o.a) * r; } });
  }

  resetView() { this.goTo({ kind: "overview" }, 0.9); }

  setFocus(fam: string | null) { this.focusFam = fam; }

  // ---------------------------------------------------------------- interaction
  private onMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.fundBeams.map((b) => b.mesh), false)[0];
    const b = hit ? (hit.object.userData.beam as Beam) : null;
    this.hovered = b;
    this.renderer.domElement.style.cursor = b ? "pointer" : "grab";
    this.o.onHover(b?.fund ?? null, e.clientX, e.clientY);
  };
  private onLeave = () => { this.hovered = null; this.o.onHover(null, 0, 0); };
  private onClick = () => { if (this.hovered?.fund) this.o.onSelect(this.hovered.fund); };

  // ---------------------------------------------------------------- rendu
  private applyQuality() {
    this.renderer.setPixelRatio(this.quality.pixelRatio());
    if (this.quality.bloom && !this.composer) {
      const size = new THREE.Vector2(this.host.clientWidth || 800, this.host.clientHeight || 600);
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(size, 0.9, 0.55, 0.12);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } else if (!this.quality.bloom && this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloom = null;
    }
    this.resize();
  }

  private resize() {
    const w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.fov = w < 700 ? 50 : 34;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    // Visibilité lue sur la position réelle : l'épinglage au défilement déplace la section dans le DOM, ce qui trompe
    // l'IntersectionObserver (la scène restait figée sur sa première image)
    const r = this.host.getBoundingClientRect();
    this.visible = r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    if (!this.visible) return;
    const busy = this.intro.k < 1 || gsap.isTweening(this.camera.position);
    if (!this.quality.gate(now, busy)) return;
    const still = motionPaused();
    const t = (now - this.t0) / 1000;
    if (this.idle && this.intro.k >= 1 && !still && !gsap.isTweening(this.camera.position)) {
      const p = this.camera.position, c = this.controls.target;
      const a = Math.sin(t * 0.12) * 0.0006;
      const x = p.x - c.x, z = p.z - c.z;
      p.x = c.x + x * Math.cos(a) - z * Math.sin(a);
      p.z = c.z + x * Math.sin(a) + z * Math.cos(a);
    }
    this.controls.update();
    for (const b of this.beams) {
      const hov = this.hovered === b;
      const famOff = this.focusFam && b.family && b.family !== this.focusFam && b.kind !== "src";
      const rankOff = this.focusRank != null && b.kind !== "src" && !(b.rank === this.focusRank || (b.kind === "fam" && b.family === this.ranked[this.focusRank]?.family));
      const hovOff = this.hovered && !hov && (b.kind === "fund" || b.kind === "rest");
      b.target = famOff || rankOff ? 0.12 : hovOff ? 0.35 : 1;
      b.dim += (b.target - b.dim) * 0.12;
      b.mat.uniforms.uOn.value = b.on.v;
      b.mat.uniforms.uDim.value = b.dim * (hov ? 1.35 : 1);
      if (!still) b.mat.uniforms.uTime.value = t;
    }
    // L'éclair d'entrée dans le prisme
    this.prismMat.emissiveIntensity = 0.03 + 1.6 * this.flash.v + 0.05 * this.intro.k;
    this.prismEdge.opacity = Math.min(1, 0.25 + 0.75 * Math.max(this.flash.v, this.beams[0]?.on.v ?? 0));
    if (this.bloom) this.bloom.strength = 0.85 + 1.4 * this.flash.v;
    this.impacts.forEach((im) => {
      const s = this.slots.find((x) => x.rank === im.rank);
      const off = this.focusRank != null && this.focusRank !== im.rank;
      im.mat.opacity = (s?.on.v ?? 0) * (off ? 0.15 : im.rank === 0 ? 1 : 0.65) * (1 + 0.15 * Math.sin(t * 2 + im.rank));
    });
    this.placeLabels();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  };

  private placeLabels() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const v = new THREE.Vector3();
    for (const s of this.slots) {
      v.copy(s.pos).project(this.camera);
      const off = this.focusRank != null && this.focusRank !== s.rank;
      s.el.style.opacity = (s.on.v * (off ? 0.25 : 1)).toFixed(3);
      s.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(0, -50%)`;
    }
    for (const tg of this.tags) {
      v.copy(tg.pos).project(this.camera);
      tg.el.style.opacity = (tg.on.v * (this.focusRank != null ? 0.3 : 1)).toFixed(3);
      const ax = tg.anchor === "right" ? "-100%" : tg.anchor === "left" ? "0" : "-50%";
      tg.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(${ax}, -50%)`;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    gsap.killTweensOf([this.camera.position, this.controls.target, this.intro, this.flash, ...this.beams.map((b) => b.on), ...this.slots.map((s) => s.on),
      ...this.tags.map((t) => t.on)]);
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("click", this.onClick);
    this.slots.forEach((s) => s.el.remove());
    this.tags.forEach((t) => t.el.remove());
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
