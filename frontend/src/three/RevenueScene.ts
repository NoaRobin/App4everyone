/**
 * Accueil — la cité des revenus (Three.js), langage institutionnel : monolithes d'obsidienne filetés d'or sur une
 * trame orthogonale. Aucune forme ronde.
 *
 * Une tour = un fonds. Hauteur proportionnelle (linéaire, comparable à l'œil) au revenu de gestion annuel estimé ;
 * emprise ∝ √encours. Quatre districts carrés autour d'un carrefour = les quatre familles de gestion, les plus gros
 * revenus au plus près du carrefour. Des traits de lumière montent des tours les plus rentables.
 *
 * Ouverture (≈ 3 s) : nuit totale, une onde carrée parcourt le sol, un plan de lumière balaie la ville, les tours
 * sortent de terre (les plus rentables d'abord) pendant que la caméra descend du zénith. Ensuite la page pilote les
 * plans au défilement (goTo) : vue d'ensemble, les trois fonds qui rapportent le plus, plan des districts.
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
  reduced: boolean;
  labelLayer: HTMLElement;
  onHover: (f: RevFund | null, x: number, y: number) => void;
  onSelect: (f: RevFund) => void;
  onIntroDone?: () => void;
};
export type Shot = { kind: "overview" } | { kind: "map" } | { kind: "fund"; i: number };

const H_MAX = 64;
const CELL = 10.5;
const AVENUE = 7;
/** Quadrant de chaque district (les fonds non classés rejoignent le district « autres expertises »). */
const QUAD: Record<string, [number, number, string]> = { ae: [1, -1, "ae"], aid: [-1, -1, "aid"], fi: [-1, 1, "fi"], ao: [1, 1, "ao"], nc: [1, 1, "ao"] };
const OVERVIEW = { pos: new THREE.Vector3(122, 78, 138), target: new THREE.Vector3(-6, 8, 0) };

type Tower = { f: RevFund; tall: THREE.Group; body: THREE.Mesh; mat: THREE.MeshStandardMaterial; edge: THREE.LineBasicMaterial;
  cap: THREE.Mesh; capMat: THREE.MeshBasicMaterial; baseMat: THREE.MeshBasicMaterial; h: number; w: number; x: number; z: number;
  k: number; hover: number; dim: number };

const STREAK_VS = /* glsl */ `
  attribute float aSeed; attribute vec3 aBase; attribute float aH;
  uniform float uTime; uniform float uPixel; uniform float uOn;
  varying float vA;
  void main() {
    float t = fract(uTime * (0.05 + aSeed * 0.08) + aSeed * 11.0);
    vec3 p = aBase + vec3((fract(aSeed * 37.0) - 0.5) * 3.0, aH + t * (26.0 + aSeed * 30.0), (fract(aSeed * 91.0) - 0.5) * 3.0);
    vA = (1.0 - t) * smoothstep(0.0, 0.12, t) * uOn;
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
  private mapK = { v: 0 };
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

    // Districts : grilles carrées remplies en équerre depuis le carrefour
    const byQuad = new Map<string, RevFund[]>();
    funds.forEach((f) => { const q = (QUAD[f.family] ?? QUAD.nc)[2]; byQuad.set(q, [...(byQuad.get(q) ?? []), f]); });
    let ext = 40;
    for (const [q, list] of byQuad) {
      const [sx, sz] = QUAD[q];
      list.forEach((f, i) => {
        const ring = Math.floor(Math.sqrt(i)), off = i - ring * ring;
        const gx = off <= ring ? ring : off - ring - 1, gz = off <= ring ? off : ring;
        const x = sx * (AVENUE + CELL * (gx + 0.5)), z = sz * (AVENUE + CELL * (gz + 0.5));
        ext = Math.max(ext, Math.abs(x) + CELL, Math.abs(z) + CELL);
        const color = new THREE.Color(this.o.colors[f.family] ?? "#8d929c");
        const h = Math.max(1.6, (f.revenue / maxRev) * H_MAX);
        const w = 2.4 + 6.2 * Math.sqrt(f.aum / maxAum);
        const geo = new THREE.BoxGeometry(w, 1, w);
        geo.translate(0, 0.5, 0);
        const mat = new THREE.MeshStandardMaterial({ color: 0x0a101c, emissive: color.clone().multiplyScalar(0.55 / Math.max(0.35, color.r * 0.3 + color.g * 0.59 + color.b * 0.11)), emissiveIntensity: 0.05, metalness: 0.92, roughness: 0.22,
          transparent: true, opacity: 1 });
        const body = new THREE.Mesh(geo, mat);
        body.userData.i = this.towers.length;
        const edge = new THREE.LineBasicMaterial({ color: color.clone().lerp(gold, 0.55), transparent: true, opacity: 0 });
        const tall = new THREE.Group();
        tall.add(body, new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge));
        tall.position.set(x, 0, z);
        tall.scale.y = 0.001;
        const capMat = new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0, depthWrite: false });
        const cap = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.98, w * 0.98), capMat);
        cap.rotation.x = -Math.PI / 2;
        cap.position.set(x, 0.02, z);
        const baseMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
        const base = new THREE.Mesh(new THREE.PlaneGeometry(w + 2.4, w + 2.4), baseMat);
        base.rotation.x = -Math.PI / 2;
        base.position.set(x, 0.03, z);
        this.scene.add(tall, cap, base);
        this.towers.push({ f, tall, body, mat, edge, cap, capMat, baseMat, h, w, x, z, k: 0, hover: 0, dim: 1 });
      });
      // Cadre du district et étiquette (visible sur le plan de dessus)
      const span = Math.ceil(Math.sqrt(list.length)) * CELL;
      const cx = sx * (AVENUE + span / 2), cz = sz * (AVENUE + span / 2);
      const col = this.o.colors[q] ?? "#8d929c";
      this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(square(span / 2 + 1.5, 0.06, cx, cz)),
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.5 })));
      const lab = document.createElement("div");
      lab.className = "rev3d__district";
      const sw = document.createElement("i"), nm = document.createElement("b"), sh = document.createElement("span");
      sw.style.background = col;
      nm.textContent = this.o.familyLabels[q] ?? q;
      const share = this.o.familyShares[q];
      sh.textContent = share != null ? `${Math.round(share * 100)} % des revenus` : "";
      lab.append(sw, nm, sh);
      lab.dataset.x = String(cx);
      lab.dataset.z = String(cz);
      lab.style.opacity = "0";
      this.o.labelLayer.appendChild(lab);
      this.districtLabels.push(lab);
    }
    this.extent = ext;
    this.sorted = [...this.towers].sort((a, b) => b.f.revenue - a.f.revenue);

    // Sol : dalle sombre, trame orthogonale fine et deux avenues dorées
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: 0x03060c, roughness: 0.92, metalness: 0.2 }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const size = Math.ceil((ext * 2 + 60) / CELL) * CELL;
    const grid = new THREE.GridHelper(size, Math.round(size / (CELL / 2)), 0x1c355e, 0x14243f);
    const gm = grid.material as THREE.LineBasicMaterial;
    gm.transparent = true;
    gm.opacity = 0.32;
    grid.position.y = 0.01;
    this.scene.add(grid);
    const L = ext + 40;
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-L, 0.05, 0), new THREE.Vector3(L, 0.05, 0), new THREE.Vector3(0, 0.05, -L), new THREE.Vector3(0, 0.05, L)]),
      new THREE.LineBasicMaterial({ color: 0xcc9f53, transparent: true, opacity: 0.6 })));
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(square(ext + 8, 0.05)),
      new THREE.LineBasicMaterial({ color: 0xcc9f53, transparent: true, opacity: 0.22 })));

    // Onde carrée d'ouverture
    this.waveMat = new THREE.LineBasicMaterial({ color: 0xf3dcaa, transparent: true, opacity: 0 });
    this.wave = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(square(1, 0.08)), this.waveMat);
    this.scene.add(this.wave);
    // Plan de lumière qui balaie la ville
    this.sweepMat = new THREE.MeshBasicMaterial({ color: 0xf3dcaa, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending });
    this.sweep = new THREE.Mesh(new THREE.BoxGeometry(0.6, 140, ext * 2 + 60), this.sweepMat);
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
        blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uPixel: { value: 1 }, uOn: { value: 0 } } });
      this.scene.add(new THREE.Points(g, this.streakMat));
    }
  }

  private playIntro() {
    if (this.o.reduced) {
      this.towers.forEach((t) => this.setHeight(t, 1));
      this.camera.position.copy(OVERVIEW.pos);
      this.controls.target.copy(OVERVIEW.target);
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
    tl.to(this.camera.position, { x: OVERVIEW.pos.x, y: OVERVIEW.pos.y, z: OVERVIEW.pos.z, duration: 3, ease: "power3.inOut" }, 0.1)
      .to(this.controls.target, { x: OVERVIEW.target.x, y: OVERVIEW.target.y, z: OVERVIEW.target.z, duration: 3, ease: "power3.inOut" }, 0.1);
    if (this.streakMat) tl.to(this.streakMat.uniforms.uOn, { value: 1, duration: 1.2 }, 1.9);
    tl.to(this.intro, { k: 1, duration: 0.4 }, 2.7);
  }

  private setHeight(t: Tower, k: number) {
    t.k = k;
    const h = Math.max(0.001, t.h * k);
    t.tall.scale.y = h;
    t.cap.position.y = h + 0.03;
  }

  // ---------------------------------------------------------------- plans pilotés par la page
  /** Mouvement de caméra vers un plan : vue d'ensemble, fonds n° i (par revenu), plan des districts. */
  goTo(shot: Shot, dur = 1.6) {
    this.idleSpin = shot.kind === "overview";
    let pos: THREE.Vector3, target: THREE.Vector3;
    const t = shot.kind === "fund" ? this.sorted[shot.i] : undefined;
    if (t) {
      this.focusId = t.f.id;
      const out = new THREE.Vector3(t.x, 0, t.z).normalize();
      const side = new THREE.Vector3(-out.z, 0, out.x);
      const d = Math.max(46, t.h * 1.15 + 26);
      // Caméra à l'extérieur de la ville, légèrement de biais, tour cadrée dans la moitié droite de l'écran
      pos = new THREE.Vector3(t.x, 0, t.z).addScaledVector(out, d).addScaledVector(side, d * 0.6);
      pos.y = Math.max(12, t.h * 0.62);
      target = new THREE.Vector3(t.x, t.h * 0.46, t.z).addScaledVector(side, this.camera.aspect < 1 ? 0 : d * 0.32);
    } else if (shot.kind === "map") {
      this.focusId = null;
      const narrow = this.camera.aspect < 1;
      target = new THREE.Vector3(narrow ? 0 : -this.extent * 0.55, 0, narrow ? -this.extent * 0.35 : 0);
      pos = target.clone().add(new THREE.Vector3(0.01, this.extent * (narrow ? 5.2 : 3.7), 0.02));
    } else {
      this.focusId = null;
      pos = OVERVIEW.pos.clone();
      target = OVERVIEW.target.clone();
    }
    const d = this.o.reduced ? 0 : dur;
    gsap.to(this.camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: d, ease: "power3.inOut", overwrite: true });
    gsap.to(this.controls.target, { x: target.x, y: target.y, z: target.z, duration: d, ease: "power3.inOut", overwrite: true });
    gsap.to(this.mapK, { v: shot.kind === "map" ? 1 : 0, duration: d * 0.8, overwrite: true });
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
    const busy = this.intro.k < 1 || gsap.isTweening(this.camera.position) || gsap.isTweening(this.mapK);
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
      const famOff = this.famFocus && (QUAD[tw.f.family] ?? QUAD.nc)[2] !== this.famFocus;
      const dimT = famOff ? 0.1 : this.focusId && this.focusId !== tw.f.id ? 0.28 : this.hovered && this.hovered !== tw ? 0.55 : 1;
      tw.dim += (dimT - tw.dim) * 0.1;
      const swept = this.sweepX > -1e3 ? Math.max(0, 1 - Math.abs(tw.x - this.sweepX) / 14) : 0;
      const grown = Math.min(1, tw.k * 2);
      tw.mat.emissiveIntensity = 0.04 + 0.6 * swept + tw.hover * 0.4;
      tw.mat.opacity = 0.18 + 0.82 * tw.dim;
      tw.edge.opacity = Math.min(1, (0.12 + 0.68 * tw.dim) * grown + swept * 0.4 + tw.hover * 0.35);
      tw.capMat.opacity = Math.min(0.85, grown * (0.08 + 0.4 * (tw.h / H_MAX)) * (0.25 + 0.75 * tw.dim) * (1 - 0.6 * this.mapK.v) + tw.hover * 0.35 + swept * 0.5);
      tw.baseMat.opacity = (0.08 * tw.dim + tw.hover * 0.4) * grown;
    }
    this.placeLabels();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  };

  private placeLabels() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const v = new THREE.Vector3();
    for (const lab of this.districtLabels) {
      v.set(Number(lab.dataset.x), 0, Number(lab.dataset.z)).project(this.camera);
      lab.style.opacity = this.mapK.v.toFixed(3);
      lab.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    gsap.killTweensOf([this.camera.position, this.controls.target, this.intro, this.mapK]);
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
