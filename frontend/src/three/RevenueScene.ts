/**
 * Accueil — « Ce qui rapporte » : la cité des revenus, en Three.js.
 *
 * Une tour = un fonds. Hauteur proportionnelle (linéaire, comparable à l'œil) au revenu de gestion annuel estimé ;
 * emprise proportionnelle à √encours ; couronne d'autant plus lumineuse que le taux de frais est élevé. Quatre
 * secteurs autour d'une place centrale = les quatre familles de gestion, les plus gros revenus au plus près du centre.
 * Des traits de lumière montent des tours les plus rentables. Formes nettes : sol carré, repères carrés, aucune particule ronde.
 *
 * Ouverture (≈ 3 s) : nuit noire, une gerbe d'or jaillit du centre, les tours sortent de terre (les plus rentables
 * d'abord) pendant que la caméra plonge du zénith vers une vue rasante. Ensuite : survol = fiche, clic = fonds,
 * rotation lente au repos. Rendu suspendu hors écran, qualité adaptée au poste (quality.ts).
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
  reduced: boolean;
  labelLayer: HTMLElement;
  formatEur: (v: number) => string;
  onHover: (f: RevFund | null, x: number, y: number) => void;
  onSelect: (f: RevFund) => void;
  onIntroDone?: () => void;
  /** false : la cité attend play() (lancée quand elle entre à l'écran). */
  autoIntro?: boolean;
  /** false : pas de décalage de cadrage pour une colonne de texte. */
  offset?: boolean;
  /** Position de la caméra (mini-carte), environ dix fois par seconde. */
  onCamera?: (c: { x: number; z: number; tx: number; tz: number; yaw: number }) => void;
  /** Noms des quartiers (familles) posés au sol. */
  districtNames?: Record<string, string>;
};
export type DriveInput = { f: number; r: number; turn: number; zoom: number; boost: boolean };

const SECTORS = ["ae", "aid", "fi", "ao", "nc"];
const H_MAX = 46;
/** Cadrage d'arrivée : toute la cité tient dans le cadre, la plus haute tour comprise. */
const VIEW = { pos: [104, 74, 126] as const, target: [0, 15, 0] as const };

type Tower = { f: RevFund; mesh: THREE.Mesh; cap: THREE.Mesh; mat: THREE.MeshStandardMaterial; capMat: THREE.MeshStandardMaterial;
  ring: THREE.Mesh; ringMat: THREE.MeshBasicMaterial; ringBase: number; h: number; x: number; z: number; hover: number; dim: number; label?: HTMLDivElement;
  /** Couleur de famille d'origine, hauteur « revenus » d'origine, et valeur affichée (revenus, ou collecte d'une période). */
  base: THREE.Color; h0: number; val: number };

const SPARK_VS = /* glsl */ `
  attribute float aSeed; attribute vec3 aBase; attribute float aH;
  uniform float uTime; uniform float uPixel; uniform float uIntro;
  varying float vA;
  void main() {
    float t = fract(uTime * (0.08 + aSeed * 0.12) + aSeed * 7.0);
    vec3 p = aBase + vec3(sin(aSeed * 40.0 + uTime) * 0.6, aH + t * (10.0 + aSeed * 18.0), cos(aSeed * 31.0 + uTime) * 0.6);
    vA = (1.0 - t) * smoothstep(0.0, 0.15, t) * uIntro;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (7.0 + aSeed * 9.0) * uPixel * (60.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const SPARK_FS = /* glsl */ `
  varying float vA;
  void main() {
    // Trait vertical fin (pas de point rond) : plus vif en tête
    vec2 c = gl_PointCoord;
    if (abs(c.x - 0.5) > 0.05) discard;
    float head = smoothstep(1.0, 0.1, c.y);
    gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * (0.6 + head), head * vA);
  }`;
const BURST_VS = /* glsl */ `
  attribute vec3 aDir; attribute float aSeed;
  uniform float uK; uniform float uPixel;
  varying float vA;
  void main() {
    float k = uK;
    vec3 p = aDir * (k * (30.0 + aSeed * 90.0)) + vec3(0.0, k * (8.0 + aSeed * 30.0) - k * k * 26.0, 0.0);
    vA = (1.0 - k) * smoothstep(0.0, 0.05, k);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (8.0 + aSeed * 10.0) * uPixel * (80.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

export class RevenueScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.5, 2000);
  private controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private quality: Quality;
  private towers: Tower[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-2, -2);
  private hovered: Tower | null = null;
  private raf = 0;
  private visible = true;
  private sparkMat: THREE.ShaderMaterial | null = null;
  private burstMat: THREE.ShaderMaterial | null = null;
  private intro = { k: 0 };
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private t0 = performance.now();
  private idleSpin = true;
  private focus: string | null = null;
  private played = false;
  private game = false;
  private input: DriveInput = { f: 0, r: 0, turn: 0, zoom: 0, boost: false };
  private selected: Tower | null = null;
  private beacon: THREE.Mesh | null = null;
  private beaconMat: THREE.MeshBasicMaterial | null = null;
  private districts: { el: HTMLDivElement; x: number; z: number }[] = [];
  private lastCam = 0;
  private lastT = performance.now();

  constructor(private host: HTMLElement, private o: RevOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x03060c, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.quality = new Quality(() => this.applyQuality());
    this.scene.fog = new THREE.FogExp2(0x03060c, 0.0065);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enableZoom = false;             // la molette fait défiler la page
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.36;
    this.controls.rotateSpeed = 0.5;
    this.controls.target.set(0, 8, 0);
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
    if (this.o.autoIntro !== false) this.play();
    else this.hideAll();
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Lance l'ouverture (une seule fois). */
  play() {
    if (this.played) return;
    this.played = true;
    this.playIntro();
  }

  private hideAll() {
    this.towers.forEach((t) => this.setHeight(t, 0));
    this.camera.position.set(0.01, 230, 0.01);
    this.controls.target.set(0, 0, 0);
  }

  // ---------------------------------------------------------------- construction
  private build() {
    const funds = [...this.o.funds].filter((f) => f.revenue > 0).sort((a, b) => b.revenue - a.revenue);
    const maxRev = funds[0]?.revenue || 1;
    const maxAum = Math.max(...funds.map((f) => f.aum), 1);
    // Lumières
    this.scene.add(new THREE.AmbientLight(0x6f86b8, 0.55));
    const key = new THREE.DirectionalLight(0xffe6b8, 1.6);
    key.position.set(60, 120, 40);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x5f86d4, 0.9);
    rim.position.set(-80, 40, -60);
    this.scene.add(rim);
    // Sol : dalle carrée sombre, repères carrés concentriques et avenues dorées entre secteurs
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshStandardMaterial({ color: 0x070d18, roughness: 0.95, metalness: 0.1 }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xcc9f53, transparent: true, opacity: 0.16 });
    for (const r of [14, 34, 58, 86, 118]) {
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => new THREE.Vector3(a * r, 0.02, b * r));
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    }
    const plaza = new THREE.Mesh(new THREE.RingGeometry(5.5, 6.2, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color: 0xcc9f53, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.04;
    this.scene.add(plaza);
    // Tours par secteur (famille) : angle du secteur, rang → rayon croissant
    const fams = SECTORS.filter((k) => funds.some((f) => f.family === k));
    const span = (Math.PI * 2) / Math.max(1, fams.length);
    fams.forEach((fam, si) => {
      const list = funds.filter((f) => f.family === fam);
      const a0 = si * span + span * 0.08, a1 = (si + 1) * span - span * 0.08;
      const avenue = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 240), new THREE.MeshBasicMaterial({ color: 0xcc9f53, transparent: true, opacity: 0.08 }));
      avenue.rotation.x = -Math.PI / 2;
      avenue.rotation.z = -(si * span) + Math.PI / 2;
      avenue.position.set(Math.cos(si * span) * 120, 0.03, Math.sin(si * span) * 120);
      this.scene.add(avenue);
      let ring = 0, inRing = 0, cap = 3;
      list.forEach((f, i) => {
        if (inRing >= cap) { ring++; inRing = 0; cap = 3 + ring * 2; }
        const r = 16 + ring * 15;
        const a = a0 + ((inRing + 0.5) / cap) * (a1 - a0) + (ring % 2 ? 0.04 : -0.04);
        inRing++;
        const color = new THREE.Color(this.o.colors[fam] ?? "#8d929c");
        const h = Math.max(2.6, (f.revenue / maxRev) * H_MAX);
        const w = 1.6 + 5.2 * Math.sqrt(f.aum / maxAum);
        const mat = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.55), emissive: color, emissiveIntensity: 0.22,
          metalness: 0.55, roughness: 0.35, transparent: true, opacity: 0.96 });
        const geo = new THREE.BoxGeometry(w, 1, w);
        geo.translate(0, 0.5, 0);
        const mesh = new THREE.Mesh(geo, mat);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        mesh.position.set(x, 0, z);
        mesh.rotation.y = -a;
        mesh.scale.y = 0.001;
        const capMat = new THREE.MeshStandardMaterial({ color: 0xf3dcaa, emissive: 0xf3c56b, emissiveIntensity: 0.35 + Math.min(2, f.rate) * 0.5, metalness: 0.3, roughness: 0.3 });
        const capMesh = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.35, w * 1.04), capMat);
        capMesh.position.set(x, 0, z);
        capMesh.rotation.y = -a;
        const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0, side: THREE.DoubleSide });
        // Repère carré au pied de la tour (aligné sur elle)
        const ringM = new THREE.Mesh(new THREE.RingGeometry(w * 0.82, w * 1.02, 4, 1, Math.PI / 4), ringMat);
        ringM.rotation.x = -Math.PI / 2;
        ringM.rotation.z = -a;
        ringM.position.set(x, 0.05, z);
        mesh.userData.i = this.towers.length;
        this.scene.add(mesh, capMesh, ringM);
        this.towers.push({ f, mesh, cap: capMesh, mat, capMat, ring: ringM, ringMat, ringBase: 0, h, x, z, hover: 0, dim: 1, base: color.clone(), h0: h, val: f.revenue });
        void i;
      });
    });
    // Balise de la tour sélectionnée : colonne de lumière carrée
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xf3c56b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const bg = new THREE.BoxGeometry(1, 1, 1); bg.translate(0, 0.5, 0);
    this.beacon = new THREE.Mesh(bg, this.beaconMat);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    // Noms des quartiers, au sol, sur l'avenue de chaque secteur
    if (this.o.districtNames) {
      fams.forEach((fam, si) => {
        const a = (si + 0.5) * span, d = document.createElement("div");
        d.className = "rev3d__district";
        d.textContent = this.o.districtNames![fam] ?? fam;
        d.style.setProperty("--c", this.o.colors[fam] ?? "#8d929c");
        this.o.labelLayer.appendChild(d);
        this.districts.push({ el: d, x: Math.cos(a) * 112, z: Math.sin(a) * 112 });
      });
    }
    // Étiquettes : les six revenus les plus élevés
    const sorted = [...this.towers].sort((a, b) => b.f.revenue - a.f.revenue);
    sorted.slice(0, 6).forEach((t, k) => {
      const d = document.createElement("div");
      d.className = "rev3d__label";
      d.innerHTML = `<span class="rev3d__rank">${k + 1}</span><b></b><i></i>`;
      (d.querySelector("b") as HTMLElement).textContent = t.f.name;
      (d.querySelector("i") as HTMLElement).textContent = `${this.o.formatEur(t.f.revenue)} / an`;
      this.o.labelLayer.appendChild(d);
      t.label = d;
    });
    // Particules qui montent des tours les plus rentables
    const top = sorted.slice(0, 12);
    const n = this.o.reduced ? 0 : 1400;
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
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 30, 0), 300);
      this.sparkMat = new THREE.ShaderMaterial({ vertexShader: SPARK_VS, fragmentShader: SPARK_FS, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uPixel: { value: 1 }, uIntro: { value: 0 } } });
      this.scene.add(new THREE.Points(g, this.sparkMat));
    }
    // Gerbe d'ouverture
    if (!this.o.reduced) {
      const m = 2600, dir = new Float32Array(m * 3), sd = new Float32Array(m);
      for (let i = 0; i < m; i++) {
        const a = Math.random() * Math.PI * 2, u = Math.random() * 0.9 + 0.1;
        dir.set([Math.cos(a) * u, 0, Math.sin(a) * u], i * 3);
        sd[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(m * 3), 3));
      g.setAttribute("aDir", new THREE.BufferAttribute(dir, 3));
      g.setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
      this.burstMat = new THREE.ShaderMaterial({ vertexShader: BURST_VS, fragmentShader: SPARK_FS.replace("vec3(1.0, 0.86, 0.55)", "vec3(1.0, 0.8, 0.45)"),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uK: { value: 0 }, uPixel: { value: 1 } } });
      this.scene.add(new THREE.Points(g, this.burstMat));
    }
  }

  private playIntro() {
    const end = { pos: new THREE.Vector3(...VIEW.pos), target: new THREE.Vector3(...VIEW.target) };
    if (this.o.reduced) {
      this.towers.forEach((t) => this.setHeight(t, 1));
      this.camera.position.copy(end.pos);
      this.controls.target.copy(end.target);
      this.intro.k = 1;
      if (this.sparkMat) this.sparkMat.uniforms.uIntro.value = 1;
      this.o.onIntroDone?.();
      return;
    }
    this.camera.position.set(0.01, 230, 0.01);
    this.controls.target.set(0, 0, 0);
    const tl = gsap.timeline({ onComplete: () => this.o.onIntroDone?.() });
    if (this.burstMat) tl.fromTo(this.burstMat.uniforms.uK, { value: 0 }, { value: 1, duration: 2.6, ease: "power2.out" }, 0.15);
    const order = [...this.towers].sort((a, b) => b.f.revenue - a.f.revenue);
    order.forEach((t, i) => {
      const g = { k: 0 };
      tl.to(g, { k: 1, duration: 1.4, ease: "expo.out", onUpdate: () => this.setHeight(t, g.k) }, 0.35 + i * (1.3 / Math.max(order.length, 1)));
    });
    tl.to(this.camera.position, { x: end.pos.x, y: end.pos.y, z: end.pos.z, duration: 2.7, ease: "power3.inOut" }, 0.1)
      .to(this.controls.target, { x: end.target.x, y: end.target.y, z: end.target.z, duration: 2.7, ease: "power3.inOut" }, 0.1);
    if (this.sparkMat) tl.to(this.sparkMat.uniforms.uIntro, { value: 1, duration: 1.2 }, 1.6);
    tl.to(this.intro, { k: 1, duration: 0.6 }, 2.2);
  }

  /**
   * Vue de période (collecte nette d'1 mois, YTD, 1, 3 ou 5 ans) : chaque tour monte ou descend vers sa nouvelle
   * hauteur (|valeur|, linéaire), la plus forte en premier, comme à l'ouverture ; une valeur négative passe en grenat.
   * null : retour aux revenus. Les six étiquettes suivent les six plus fortes valeurs absolues.
   */
  setValues(values: Map<string, number | null> | null, fmt: (v: number) => string) {
    const vals = this.towers.map((t) => (values ? values.get(t.f.id) ?? 0 : t.f.revenue));
    const max = Math.max(1e-9, ...vals.map((v) => Math.abs(v ?? 0)));
    const garnet = new THREE.Color("#6d1a35");
    this.towers.forEach((t, i) => {
      const v = vals[i] ?? 0;
      t.val = v;
      const target = values ? Math.max(0.6, (Math.abs(v) / max) * H_MAX) : t.h0;
      const c = values && v < 0 ? garnet : t.base;
      t.mat.color.copy(c).multiplyScalar(0.55);
      t.mat.emissive.copy(c);
      t.ringMat.color.copy(c);
      // couronne : or pour une valeur positive, rose grenat pour une décollecte (lisible quelle que soit la famille)
      const neg = !!values && v < 0;
      t.capMat.color.set(neg ? 0xf2a7b8 : 0xf3dcaa);
      t.capMat.emissive.set(neg ? 0xe0567c : 0xf3c56b);
      gsap.killTweensOf(t, "h");
      if (this.o.reduced || !this.played) { t.h = target; if (this.played) this.setHeight(t, 1); return; }
      gsap.to(t, { h: target, duration: 1.3, ease: "expo.out", delay: Math.min(0.9, (1 - Math.abs(v) / max) * 0.9), onUpdate: () => this.setHeight(t, 1) });
    });
    this.towers.forEach((t) => { t.label?.remove(); t.label = undefined; });
    [...this.towers].sort((a, b) => Math.abs(b.val) - Math.abs(a.val)).slice(0, 6).forEach((t, k) => {
      const d = document.createElement("div");
      d.className = `rev3d__label${values && t.val < 0 ? " is-neg" : ""}`;
      d.innerHTML = `<span class="rev3d__rank">${k + 1}</span><b></b><i></i>`;
      (d.querySelector("b") as HTMLElement).textContent = t.f.name;
      (d.querySelector("i") as HTMLElement).textContent = fmt(t.val);
      this.o.labelLayer.appendChild(d);
      t.label = d;
    });
  }

  private setHeight(t: Tower, k: number) {
    const h = Math.max(0.001, t.h * k);
    t.mesh.scale.y = h;
    t.cap.position.y = h + 0.17;
    t.ringBase = 0.35 * k;
  }

  /** Rotation autour de la place centrale (boutons et flèches du clavier : alternative au glisser). */
  nudge(deg: number) {
    this.idleSpin = false;
    const p = this.camera.position, c = this.controls.target;
    const a0 = Math.atan2(p.z - c.z, p.x - c.x), r = Math.hypot(p.x - c.x, p.z - c.z);
    const o = { a: a0 };
    gsap.to(o, { a: a0 + (deg * Math.PI) / 180, duration: this.o.reduced ? 0 : 0.6, ease: "power2.out",
      onUpdate: () => { p.x = c.x + Math.cos(o.a) * r; p.z = c.z + Math.sin(o.a) * r; } });
  }

  /** Revient au cadrage d'origine. */
  resetView() {
    this.idleSpin = !this.o.reduced;
    const d = this.o.reduced ? 0 : 0.9;
    const [x, y, z] = VIEW.pos, [tx, ty, tz] = VIEW.target;
    gsap.to(this.camera.position, { x, y, z, duration: d, ease: "power3.inOut" });
    gsap.to(this.controls.target, { x: tx, y: ty, z: tz, duration: d, ease: "power3.inOut" });
  }

  /** Mode exploration : zoom à la molette, déplacements au clavier, pas de rotation automatique. */
  setGame(on: boolean) {
    this.game = on;
    this.controls.enableZoom = on;
    this.controls.minDistance = 18;
    this.controls.maxDistance = 320;
    if (on) this.idleSpin = false;
  }

  /** Commandes de pilotage (maintenues tant que les touches sont enfoncées). */
  setInput(i: Partial<DriveInput>) { this.input = { ...this.input, ...i }; }

  /** Vole jusqu'à une tour et la marque d'une colonne de lumière (null : retire la marque). */
  select(id: string | null, fly = true) {
    const t = this.towers.find((x) => x.f.id === id) ?? null;
    this.selected = t;
    if (!this.beacon || !this.beaconMat) return;
    if (!t) { gsap.to(this.beaconMat, { opacity: 0, duration: 0.3, onComplete: () => { if (this.beacon && !this.selected) this.beacon.visible = false; } }); return; }
    const w = (t.mesh.geometry as THREE.BoxGeometry).parameters.width;
    this.beacon.visible = true;
    this.beacon.position.set(t.x, t.h, t.z);
    this.beacon.rotation.y = t.mesh.rotation.y;
    this.beacon.scale.set(w * 0.5, 160, w * 0.5);
    gsap.fromTo(this.beaconMat, { opacity: 0 }, { opacity: 0.28, duration: 0.6 });
    if (!fly) return;
    this.idleSpin = false;
    const d = this.o.reduced ? 0 : 1.2;
    const c = this.controls.target, p = this.camera.position;
    const dir = new THREE.Vector3(p.x - c.x, 0, p.z - c.z).normalize();
    const dist = 70 + t.h * 1.3;
    gsap.to(this.controls.target, { x: t.x, y: t.h * 0.55, z: t.z, duration: d, ease: "power3.inOut" });
    gsap.to(this.camera.position, { x: t.x + dir.x * dist, y: t.h * 0.5 + 34 + t.h * 0.5, z: t.z + dir.z * dist, duration: d, ease: "power3.inOut" });
  }

  /** Recentre la caméra sur un point du sol (clic sur la mini-carte). */
  goTo(x: number, z: number) {
    this.idleSpin = false;
    const c = this.controls.target, p = this.camera.position;
    const dx = x - c.x, dz = z - c.z, d = this.o.reduced ? 0 : 0.9;
    gsap.to(this.controls.target, { x, z, duration: d, ease: "power3.inOut" });
    gsap.to(this.camera.position, { x: p.x + dx, z: p.z + dz, duration: d, ease: "power3.inOut" });
  }

  /** Positions au sol des tours (mini-carte). */
  layout() { return this.towers.map((t) => ({ id: t.f.id, family: t.f.family, x: t.x, z: t.z, w: (t.mesh.geometry as THREE.BoxGeometry).parameters.width })); }

  /** Met en avant une famille (null : toutes). */
  setFocus(fam: string | null) {
    this.focus = fam;
  }

  highlight(id: string | null) {
    const t = this.towers.find((x) => x.f.id === id) ?? null;
    this.hovered = t;
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
      this.bloom = new UnrealBloomPass(size, 0.7, 0.55, 0.7);
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
    this.camera.fov = w < 700 ? 54 : 38;
    // sur grand écran, la cité se décale à droite de la colonne de texte au lieu de passer derrière
    if (w >= 1000 && this.o.offset !== false) this.camera.setViewOffset(w, h, -w * 0.17, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    const px = this.renderer.getPixelRatio();
    if (this.sparkMat) this.sparkMat.uniforms.uPixel.value = px;
    if (this.burstMat) this.burstMat.uniforms.uPixel.value = px;
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible) return;
    const inp = this.input;
    const busy = this.intro.k < 1 || gsap.isTweening(this.camera.position) || this.game || !!(inp.f || inp.r || inp.turn || inp.zoom);
    if (!this.quality.gate(now, busy)) return;
    const t = (now - this.t0) / 1000;
    if (this.sparkMat && !motionPaused()) this.sparkMat.uniforms.uTime.value = t;
    if (this.idleSpin && !this.game && this.intro.k >= 1 && !motionPaused()) {
      const p = this.camera.position, c = this.controls.target;
      const a = 0.0009;
      const x = p.x - c.x, z = p.z - c.z;
      p.x = c.x + x * Math.cos(a) - z * Math.sin(a);
      p.z = c.z + x * Math.sin(a) + z * Math.cos(a);
    }
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const i = this.input;
    if (i.f || i.r || i.turn || i.zoom) {
      const p = this.camera.position, c = this.controls.target;
      const fwd = new THREE.Vector3(c.x - p.x, 0, c.z - p.z).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const v = (i.boost ? 120 : 55) * dt;
      const mv = fwd.multiplyScalar(i.f * v).add(right.multiplyScalar(i.r * v));
      const lim = 150;
      const nx = Math.max(-lim, Math.min(lim, c.x + mv.x)), nz = Math.max(-lim, Math.min(lim, c.z + mv.z));
      p.x += nx - c.x; p.z += nz - c.z; c.x = nx; c.z = nz;
      if (i.turn) {
        const a = i.turn * 1.4 * dt, x = p.x - c.x, z = p.z - c.z;
        p.x = c.x + x * Math.cos(a) - z * Math.sin(a);
        p.z = c.z + x * Math.sin(a) + z * Math.cos(a);
      }
      if (i.zoom) {
        const off = new THREE.Vector3().subVectors(p, c);
        const len = Math.max(18, Math.min(320, off.length() * (1 + i.zoom * 1.2 * dt)));
        off.setLength(len); p.copy(c).add(off);
      }
      this.idleSpin = false;
    }
    if (this.beaconMat && this.selected) this.beaconMat.opacity = 0.2 + 0.1 * Math.sin(t * 3);
    if (this.o.onCamera && now - this.lastCam > 90) {
      this.lastCam = now;
      const p = this.camera.position, c = this.controls.target;
      this.o.onCamera({ x: p.x, z: p.z, tx: c.x, tz: c.z, yaw: Math.atan2(c.z - p.z, c.x - p.x) });
    }
    this.controls.update();
    for (const tw of this.towers) {
      const on = this.hovered === tw || this.selected === tw ? 1 : 0;
      tw.hover += (on - tw.hover) * 0.15;
      const dimT = this.focus && tw.f.family !== this.focus ? 0.18 : (this.hovered && this.hovered !== tw && this.selected !== tw) ? 0.55 : 1;
      tw.dim += (dimT - tw.dim) * 0.1;
      tw.mat.emissiveIntensity = 0.22 + tw.hover * 0.9;
      tw.mat.opacity = 0.25 + 0.71 * tw.dim;
      tw.capMat.emissiveIntensity = (0.35 + Math.min(2, tw.f.rate) * 0.5) * (0.3 + 0.7 * tw.dim) * (0.4 + 0.6 * tw.h / H_MAX) + tw.hover * 1.6;
      tw.ringMat.opacity = tw.ringBase * (0.4 + 0.6 * tw.dim) + tw.hover * 0.5;
    }
    this.placeLabels();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private labelBox = new WeakMap<HTMLElement, [number, number]>();

  /** Étiquettes du classement : la mieux classée garde sa place, les suivantes montent jusqu'à ne plus la recouvrir. */
  private placeLabels() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const v = new THREE.Vector3();
    for (const d of this.districts) {
      v.set(d.x, 0.5, d.z).project(this.camera);
      const vis = v.z < 1 && this.intro.k > 0.5;
      d.el.style.opacity = vis ? String(Math.min(1, (this.intro.k - 0.5) * 2)) : "0";
      d.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
    }
    const placed: [number, number, number, number][] = [];
    const ranked = this.towers.filter((t) => t.label).sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
    for (const t of ranked) {
      const el = t.label!;
      let box = this.labelBox.get(el);
      if (!box || !box[0]) { box = [el.offsetWidth, el.offsetHeight]; this.labelBox.set(el, box); }
      const [bw, bh] = box;
      v.set(t.x, t.mesh.scale.y + 2.2, t.z).project(this.camera);
      const vis = v.z < 1 && this.intro.k > 0.2 && t.dim > 0.4;
      const x = ((v.x + 1) / 2) * w;
      let y = ((1 - v.y) / 2) * h;                       // bas de l'étiquette
      if (vis) {
        for (let moved = true, n = 0; moved && n < 8; n++) {
          moved = false;
          for (const [px, py, pw, ph] of placed) {
            if (Math.abs(x - px) < (bw + pw) / 2 + 4 && y > py - ph - 4 && y - bh < py + 4) { y = py - ph - 6; moved = true; }
          }
        }
        placed.push([x, y, bw, bh]);
      }
      const shown = vis && y - bh > 64;                 // jamais sous la barre de navigation
      el.style.opacity = shown ? String(Math.min(1, this.intro.k * 1.4)) : "0";
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    gsap.killTweensOf([this.camera.position, this.controls.target, this.intro]);
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("click", this.onClick);
    this.towers.forEach((t) => t.label?.remove());
    this.districts.forEach((d) => d.el.remove());
    gsap.killTweensOf(this.beaconMat);
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
