/**
 * La ville des encours — Three.js.
 * Un immeuble = un fonds. Volume proportionnel à l'encours (hauteur ∝ √encours, emprise ∝ encours^¼).
 * Quatre quartiers = les quatre familles de gestion, chacune dans sa couleur.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import gsap from "gsap";

/** Horloge minimale (remplace THREE.Clock, dépréciée). */
class Tick {
  private last = performance.now();
  elapsedTime = 0;
  getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; this.elapsedTime += d; return d; }
}

export type CityFund = { id: string; name: string; family: string; series: number[]; aum: number };
export type CityOptions = {
  funds: CityFund[];
  monthIndex: number;
  reduced: boolean;
  colors: Record<string, { day: string; night: string }>;
  familyLabels: Record<string, string>;
  labelLayer: HTMLElement;
  onHover: (f: CityFund | null, x: number, y: number) => void;
  onSelect: (f: CityFund) => void;
  formatAum: (v: number) => string;
};

const H_MAX = 62;
const S_MAX = 8.6;
const GAP = 2.4;
const AVENUE = 9;
const QUAD: Record<string, [number, number]> = { aid: [-1, -1], ae: [1, -1], fi: [-1, 1], ao: [1, 1], nc: [0, 1.9] };

type Building = {
  f: CityFund; mesh: THREE.Mesh; crown: THREE.Mesh; mats: THREE.MeshStandardMaterial[]; crownMat: THREE.MeshStandardMaterial;
  tex: THREE.Texture[]; x: number; z: number; cur: number; target: number; grow: number; dim: number; dimTarget: number;
  base: THREE.Color; hover: number; label?: HTMLDivElement; labelW?: number;
};

function facadeCanvas(seed: number, tint: string): { color: HTMLCanvasElement; glow: HTMLCanvasElement } {
  const N = 8, C = 32, size = N * C;
  const color = document.createElement("canvas");
  const glow = document.createElement("canvas");
  color.width = color.height = glow.width = glow.height = size;
  const c = color.getContext("2d")!, g = glow.getContext("2d")!;
  c.fillStyle = "#c9ced6"; c.fillRect(0, 0, size, size);
  g.fillStyle = "#000"; g.fillRect(0, 0, size, size);
  g.globalAlpha = 0.2; g.fillStyle = tint; g.fillRect(0, 0, size, size); g.globalAlpha = 1;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = i * C + 5, y = j * C + 6, w = C - 10, h = C - 12;
    const lit = rnd();
    c.fillStyle = "#6b7890"; c.fillRect(x, y, w, h);
    if (lit > 0.55) {
      const k = 0.35 + 0.65 * rnd();
      const warm = rnd() > 0.2;
      g.fillStyle = warm ? `rgba(255, ${196 + Math.floor(40 * rnd())}, ${130 + Math.floor(60 * rnd())}, ${k})` : `rgba(190, 215, 255, ${k})`;
      g.fillRect(x, y, w, h);
      c.fillStyle = "#d9d2c0"; c.fillRect(x, y, w, h);
    }
  }
  // Filets verticaux (meneaux)
  c.fillStyle = "rgba(255,255,255,.14)";
  for (let i = 0; i < N; i++) c.fillRect(i * C, 0, 1, size);
  return { color, glow };
}

export class CityScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private buildings: Building[] = [];
  private labelled: Building[] = [];
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-9, -9);
  private hovered: Building | null = null;
  private raf = 0;
  private visible = true;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private disposables: { dispose: () => void }[] = [];
  private traffic?: THREE.InstancedMesh;
  private cars: { axis: 0 | 1; lane: number; t: number; speed: number; dir: number; len: number }[] = [];
  private districtLabels: { el: HTMLDivElement; pos: THREE.Vector3; fam: string }[] = [];
  private idleSince = performance.now();
  private extentR = 60;
  private opts: CityOptions;
  private maxA: number;
  private clock = new Tick();
  private downAt: { x: number; y: number } | null = null;
  private introDone = false;

  constructor(private host: HTMLElement, opts: CityOptions) {
    this.opts = opts;
    this.maxA = Math.max(1, ...opts.funds.flatMap((f) => f.series));
    const w = host.clientWidth, h = host.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color("#08101d");
    this.scene.fog = new THREE.FogExp2("#08101d", 0.0042);
    this.camera = new THREE.PerspectiveCamera(34, w / h, 1, 2000);

    this.buildWorld();
    this.layout();
    this.applyOffset();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 70;
    this.controls.maxDistance = 520;
    this.controls.maxPolarAngle = 1.32;
    this.controls.minPolarAngle = 0.25;
    this.controls.target.set(0, 17, 0);
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.7;
    this.controls.addEventListener("start", () => { this.idleSince = Infinity; });
    this.controls.addEventListener("end", () => { this.idleSince = performance.now(); });

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.62, 0.5, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; });
    this.io.observe(host);
    document.addEventListener("visibilitychange", this.onVis);

    this.intro();
    this.loop();
  }

  // ---------------------------------------------------------------- monde
  private buildWorld() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight("#6a80ad", "#0a0f1a", 1.25));
    s.add(new THREE.AmbientLight("#2a3858", 0.6));
    const moon = new THREE.DirectionalLight("#dfe6ff", 1.35);
    moon.position.set(-90, 160, 70);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const sc = moon.shadow.camera as THREE.OrthographicCamera;
    sc.left = -130; sc.right = 130; sc.top = 130; sc.bottom = -130; sc.near = 10; sc.far = 420;
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.6;
    s.add(moon);
    const warm = new THREE.PointLight("#ffcf8f", 700, 260, 1.4);
    warm.position.set(0, 90, 30);
    s.add(warm);

    const gc = document.createElement("canvas");
    gc.width = gc.height = 512;
    const gx = gc.getContext("2d")!;
    gx.fillStyle = "#0b1524"; gx.fillRect(0, 0, 512, 512);
    gx.strokeStyle = "rgba(160, 180, 220, 0.09)"; gx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) { gx.beginPath(); gx.moveTo(i, 0); gx.lineTo(i, 512); gx.stroke(); gx.beginPath(); gx.moveTo(0, i); gx.lineTo(512, i); gx.stroke(); }
    const gtex = new THREE.CanvasTexture(gc);
    gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
    gtex.repeat.set(100, 100);
    gtex.anisotropy = 8;
    gtex.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(gtex);
    // Sol miroir sombre (reflets des tours), voilé par un calque mat quadrillé
    const w = Math.max(512, Math.floor(this.host.clientWidth * 0.5)), h = Math.max(512, Math.floor(this.host.clientHeight * 0.5));
    const mirror = new Reflector(new THREE.PlaneGeometry(1600, 1600), { textureWidth: w, textureHeight: h, color: new THREE.Color("#5a6475"), clipBias: 0.003 });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = -0.02;
    s.add(mirror);
    this.disposables.push(mirror.geometry, { dispose: () => mirror.dispose() });
    const groundMat = new THREE.MeshStandardMaterial({ color: "#ffffff", map: gtex, roughness: 0.7, metalness: 0.2, transparent: true, opacity: 0.82 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.01;
    ground.receiveShadow = true;
    s.add(ground);
    this.disposables.push(ground.geometry, groundMat);

    // Ciel étoilé discret
    const starGeo = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i < 900; i++) {
      const r = 700 + Math.random() * 200, th = Math.random() * Math.PI * 2, ph = Math.random() * 0.5 + 0.08;
      pts.push(r * Math.cos(th) * Math.cos(ph), r * Math.sin(ph), r * Math.sin(th) * Math.cos(ph));
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const starMat = new THREE.PointsMaterial({ color: "#c9d4ee", size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.55, fog: false });
    s.add(new THREE.Points(starGeo, starMat));
    this.disposables.push(starGeo, starMat);
  }

  private layout() {
    const byFam = new Map<string, CityFund[]>();
    this.opts.funds.forEach((f) => { const k = QUAD[f.family] ? f.family : "nc"; byFam.set(k, [...(byFam.get(k) ?? []), f]); });
    const unitGeo = new THREE.BoxGeometry(1, 1, 1);
    unitGeo.translate(0, 0.5, 0);
    const crownGeo = new THREE.BoxGeometry(1, 1, 1);
    crownGeo.translate(0, 0.5, 0);
    this.disposables.push(unitGeo, crownGeo);
    const facadeCache = new Map<string, ReturnType<typeof facadeCanvas>[]>();
    const facadesFor = (fam: string) => {
      if (!facadeCache.has(fam)) facadeCache.set(fam, [1, 2, 3].map((k) => facadeCanvas(k, this.opts.colors[fam]?.night ?? "#888")));
      return facadeCache.get(fam)!;
    };
    let extent = 0;
    const layer = this.opts.labelLayer;
    for (const [fam, list] of byFam) {
      const [qx, qz] = QUAD[fam];
      list.sort((a, b) => Math.max(...b.series) - Math.max(...a.series));
      const famMax = Math.max(...list.flatMap((f) => f.series));
      const cell = S_MAX * Math.pow(famMax / this.maxA, 0.25) + GAP;
      const cols = Math.ceil(Math.sqrt(list.length));
      // Cellules classées par distance au carrefour central : les plus grands fonds bordent l'avenue
      const cells: [number, number][] = [];
      for (let i = 0; i < cols; i++) for (let j = 0; j < cols; j++) cells.push([i, j]);
      cells.sort((a, b) => (a[0] ** 2 + a[1] ** 2) - (b[0] ** 2 + b[1] ** 2) || a[0] - b[0]);
      const plateSize = cols * cell;
      const ox = fam === "nc" ? -plateSize / 2 : qx * (AVENUE / 2);
      const oz = fam === "nc" ? qz * (AVENUE / 2 + plateSize * 1.05) : qz * (AVENUE / 2);
      const dirx = fam === "nc" ? 1 : qx, dirz = fam === "nc" ? 1 : qz;
      extent = Math.max(extent, AVENUE / 2 + plateSize);
      // Socle du quartier et liseré lumineux dans la couleur de la famille
      const px = ox + dirx * plateSize / 2, pz = oz + dirz * plateSize / 2;
      const plateMat = new THREE.MeshStandardMaterial({ color: "#0f1b2d", roughness: 0.8, metalness: 0.1 });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(plateSize + 1, 0.5, plateSize + 1), plateMat);
      plate.position.set(px, 0.25, pz);
      plate.receiveShadow = true;
      this.scene.add(plate);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(plateSize + 1.2, 0.52, plateSize + 1.2)),
        new THREE.LineBasicMaterial({ color: this.opts.colors[fam]?.night ?? "#888", transparent: true, opacity: 0.7 }));
      edge.position.copy(plate.position);
      this.scene.add(edge);
      this.disposables.push(plate.geometry, plateMat, edge.geometry, edge.material as THREE.Material);
      // Étiquette du quartier
      const lab = document.createElement("div");
      lab.className = "city__district";
      lab.innerHTML = `<span class="dot" style="background:${this.opts.colors[fam]?.night}"></span>${this.opts.familyLabels[fam] ?? fam}`;
      layer.appendChild(lab);
      this.districtLabels.push({ el: lab, fam, pos: fam === "aid" ? new THREE.Vector3(ox + dirx * (plateSize + 2), 0.6, oz + dirz * 1.5) : new THREE.Vector3(ox + dirx * (plateSize + 1.5), 0.6, oz + dirz * (plateSize + 1.5)) });

      list.forEach((f, idx) => {
        const [ci, cj] = cells[idx];
        const x = ox + dirx * (ci * cell + cell / 2);
        const z = oz + dirz * (cj * cell + cell / 2);
        const base = new THREE.Color(this.opts.colors[fam]?.night ?? "#777").lerp(new THREE.Color(this.opts.colors[fam]?.day ?? "#777"), 0.25);
        const night = new THREE.Color(this.opts.colors[fam]?.night ?? "#999");
        const facs = facadesFor(fam);
        const fac = facs[idx % facs.length];
        const tex: THREE.Texture[] = [];
        const mk = () => {
          const map = new THREE.CanvasTexture(fac.color);
          const em = new THREE.CanvasTexture(fac.glow);
          [map, em].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; });
          tex.push(map, em);
          return new THREE.MeshStandardMaterial({ color: night.clone().lerp(base, 0.25), map, emissiveMap: em, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 1.0, roughness: 0.3, metalness: 0.4 });
        };
        const side1 = mk(), side2 = mk();
        const top = new THREE.MeshStandardMaterial({ color: night.clone().multiplyScalar(0.7), roughness: 0.5, metalness: 0.3 });
        const mats = [side1, side1, top, top, side2, side2];
        const mesh = new THREE.Mesh(unitGeo, mats);
        mesh.position.set(x, 0.5, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.i = this.buildings.length;
        const crownMat = new THREE.MeshStandardMaterial({ color: night, emissive: night, emissiveIntensity: 1.6, roughness: 0.3 });
        const crown = new THREE.Mesh(crownGeo, crownMat);
        crown.position.set(x, 0.5, z);
        this.scene.add(mesh, crown);
        this.disposables.push(side1, side2, top, crownMat, ...tex);
        const a = f.series[this.opts.monthIndex] ?? f.aum;
        this.buildings.push({ f, mesh, crown, mats: [side1, side2, top], crownMat, tex, x, z, cur: this.opts.reduced ? a : 0, target: a,
          grow: this.opts.reduced ? 1 : 0, dim: 0, dimTarget: 0, base, hover: 0 });
      });
    }
    this.extentR = extent;
    this.addRoads(extent);
    this.addTraffic(extent);
    // Étiquettes des plus grands fonds
    this.labelled = [...this.buildings].sort((a, b) => b.target - a.target).slice(0, 10);
    this.labelled.forEach((b) => {
      const el = document.createElement("div");
      el.className = "city__label";
      el.textContent = b.f.name;
      layer.appendChild(el);
      b.label = el;
    });
    this.buildings.forEach((b) => this.applyScale(b));
  }

  private addRoads(extent: number) {
    const roadMat = new THREE.MeshStandardMaterial({ color: "#121d30", roughness: 0.4, metalness: 0.5 });
    const markMat = new THREE.MeshBasicMaterial({ color: "#c8a15a", transparent: true, opacity: 0.55 });
    const L = 2 * (extent + 10);
    const add = (w: number, d: number, x: number, z: number) => {
      const g = new THREE.BoxGeometry(w, 0.08, d);
      const m = new THREE.Mesh(g, roadMat);
      m.position.set(x, 0.04, z);
      m.receiveShadow = true;
      this.scene.add(m);
      this.disposables.push(g);
    };
    const ring = extent + 3.5;
    add(L, AVENUE - 1.4, 0, 0); add(AVENUE - 1.4, L, 0, 0);
    add(L, 4, 0, ring); add(L, 4, 0, -ring); add(4, L, ring, 0); add(4, L, -ring, 0);
    // Marquage central en pointillés
    const dash = new THREE.PlaneGeometry(1.4, 0.16);
    const n = Math.floor(L / 3.2);
    const im = new THREE.InstancedMesh(dash, markMat, n * 2);
    const m4 = new THREE.Matrix4();
    const rx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const rz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).multiply(rx);
    for (let i = 0; i < n; i++) {
      const t = -L / 2 + i * 3.2;
      m4.compose(new THREE.Vector3(t, 0.1, 0), rx, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(0, 0.1, t), rz, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(n + i, m4);
    }
    this.scene.add(im);
    this.disposables.push(roadMat, markMat, dash);
  }

  private addTraffic(extent: number) {
    const n = this.opts.reduced ? 0 : 140;
    if (!n) return;
    const geo = new THREE.BoxGeometry(0.35, 0.18, 1.3);
    const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
    const im = new THREE.InstancedMesh(geo, mat, n);
    const warm = new THREE.Color("#ffd49a").multiplyScalar(2.2), red = new THREE.Color("#ff5a4a").multiplyScalar(1.6), white = new THREE.Color("#dfe8ff").multiplyScalar(2);
    for (let i = 0; i < n; i++) {
      const axis = (i % 2) as 0 | 1;
      const dir = i % 4 < 2 ? 1 : -1;
      const ring = i % 5 === 0;
      const lane = ring ? (extent + 3.5) * (i % 3 === 0 ? 1 : -1) : dir * 1.6;
      this.cars.push({ axis, lane, t: Math.random() * 2 - 1, speed: 0.035 + Math.random() * 0.05, dir, len: extent + 6 });
      im.setColorAt(i, dir > 0 ? (i % 7 === 0 ? white : warm) : red);
    }
    this.traffic = im;
    this.scene.add(im);
    this.disposables.push(geo, mat);
  }

  private hFor(a: number) { return Math.max(0.6, H_MAX * Math.sqrt(Math.max(a, 0) / this.maxA)); }
  private sFor(a: number) { return Math.max(0.9, S_MAX * Math.pow(Math.max(a, 0) / this.maxA, 0.25)); }

  private applyScale(b: Building) {
    const a = b.cur;
    const h = this.hFor(a) * b.grow;
    const s = this.sFor(a) * (a > 0 ? 1 : 0.001);
    b.mesh.scale.set(s, Math.max(h, 0.01), s);
    b.mesh.visible = a > 0 && h > 0.02;
    b.crown.visible = b.mesh.visible;
    b.crown.scale.set(s * 1.015, Math.min(0.55, h * 0.04 + 0.12), s * 1.015);
    b.crown.position.y = h;
    b.mesh.position.y = 0.5;
    b.crown.position.y = h + 0.5;
    // Fenêtres à taille constante quel que soit le volume
    for (let k = 0; k < 2; k++) {
      const map = b.tex[k * 2], em = b.tex[k * 2 + 1];
      map.repeat.set(s / 7.2, Math.max(h, 0.1) / 9.6);
      em.repeat.copy(map.repeat);
    }
  }

  // ---------------------------------------------------------------- API
  setMonth(i: number) {
    this.buildings.forEach((b) => { b.target = b.f.series[i] ?? 0; if (this.opts.reduced) { b.cur = b.target; this.applyScale(b); } });
  }

  setFocus(fam: string | null) {
    this.buildings.forEach((b) => { b.dimTarget = fam && b.f.family !== fam ? 1 : 0; });
  }

  highlight(id: string | null) {
    const b = this.buildings.find((x) => x.f.id === id) ?? null;
    this.setHovered(b);
  }

  /** Vol de caméra vers un fonds (avant d'ouvrir sa fiche). */
  flyTo(id: string): Promise<void> {
    const b = this.buildings.find((x) => x.f.id === id);
    if (!b || this.opts.reduced) return Promise.resolve();
    const h = this.hFor(b.cur);
    return new Promise((res) => {
      this.idleSince = Infinity;
      const tl = gsap.timeline({ onComplete: () => res() });
      tl.to(this.controls.target, { x: b.x, y: h * 0.6, z: b.z, duration: 0.9, ease: "power3.inOut" }, 0);
      tl.to(this.camera.position, { x: b.x + 26, y: h + 18, z: b.z + 34, duration: 0.9, ease: "power3.inOut" }, 0);
    });
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);
    this.ro.disconnect();
    this.io.disconnect();
    document.removeEventListener("visibilitychange", this.onVis);
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    this.controls.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    el.remove();
    this.opts.labelLayer.innerHTML = "";
  }

  // ---------------------------------------------------------------- animation
  private intro() {
    const end = this.homeView();
    if (this.opts.reduced) {
      this.camera.position.copy(end);
      this.introDone = true;
      return;
    }
    const far = end.clone().multiplyScalar(1.9);
    this.camera.position.copy(far);
    gsap.to(this.camera.position, { x: end.x, y: end.y, z: end.z, duration: 3.4, ease: "power3.inOut", onComplete: () => { this.introDone = true; this.idleSince = performance.now(); } });
    const order = [...this.buildings].sort((a, b) => (a.x ** 2 + a.z ** 2) - (b.x ** 2 + b.z ** 2));
    order.forEach((b, i) => gsap.to(b, { grow: 1, duration: 1.6, delay: 0.5 + i * 0.035, ease: "expo.out" }));
  }

  /** Point de vue d'arrivée : cadre toute la ville selon la taille de l'écran. */
  private homeView(): THREE.Vector3 {
    const aspect = this.host.clientWidth / Math.max(1, this.host.clientHeight);
    const d = this.extentR * (aspect < 1 ? 6.1 : aspect < 1.4 ? 6.2 : 5.5);
    return new THREE.Vector3(d * 0.52, d * 0.5, d * 0.69);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.visible || document.hidden) return;
    const now = performance.now();
    if (this.introDone && !this.opts.reduced && now - this.idleSince > 6000) {
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 0.28;
    } else this.controls.autoRotate = false;
    this.controls.update();

    const k = this.opts.reduced ? 1 : 1 - Math.pow(0.001, dt);
    for (const b of this.buildings) {
      let changed = false;
      if (Math.abs(b.cur - b.target) > this.maxA * 1e-5) { b.cur += (b.target - b.cur) * Math.min(1, k * 1.2); changed = true; }
      if (b.grow < 1) changed = true;
      if (Math.abs(b.dim - b.dimTarget) > 0.001) {
        b.dim += (b.dimTarget - b.dim) * Math.min(1, k * 1.5);
        const [s1, s2, top] = b.mats;
        const c = b.base.clone().lerp(new THREE.Color("#1a2232"), b.dim * 0.85);
        s1.color.copy(c); s2.color.copy(c); top.color.copy(c.clone().multiplyScalar(0.7));
        s1.emissiveIntensity = s2.emissiveIntensity = 1.0 * (1 - b.dim * 0.8);
        b.crownMat.emissiveIntensity = 1.6 * (1 - b.dim * 0.85);
      }
      const hoverT = this.hovered === b ? 1 : 0;
      if (Math.abs(b.hover - hoverT) > 0.001) {
        b.hover += (hoverT - b.hover) * Math.min(1, k * 2.5);
        b.crownMat.emissiveIntensity = (1.6 + b.hover * 3.2) * (1 - b.dim * 0.85);
        const [s1, s2] = b.mats;
        s1.emissiveIntensity = s2.emissiveIntensity = (1.0 + b.hover * 1.2) * (1 - b.dim * 0.8);
      }
      if (changed) this.applyScale(b);
    }
    if (this.traffic) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      this.cars.forEach((c, i) => {
        c.t += c.speed * dt * c.dir;
        if (c.t > 1) c.t = -1; else if (c.t < -1) c.t = 1;
        const along = c.t * c.len;
        const pos = c.axis === 0 ? new THREE.Vector3(along, 0.35, c.lane) : new THREE.Vector3(c.lane, 0.35, along);
        q.setFromAxisAngle(up, c.axis === 0 ? Math.PI / 2 : 0);
        m.compose(pos, q, new THREE.Vector3(1, 1, 1));
        this.traffic!.setMatrixAt(i, m);
      });
      this.traffic.instanceMatrix.needsUpdate = true;
    }
    this.pick();
    this.composer.render();
    this.placeLabels();
  };

  private project(v: THREE.Vector3): { x: number; y: number; ok: boolean } {
    const p = v.clone().project(this.camera);
    const w = this.host.clientWidth, h = this.host.clientHeight;
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, ok: p.z < 1 };
  }

  private placeLabels() {
    const placed: [number, number, number, number][] = [];
    for (const d of this.districtLabels) {
      const p = this.project(d.pos);
      d.el.style.transform = `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`;
      const dw = d.el.offsetWidth || 200;
      placed.push([p.x - dw / 2 - 8, p.y - 18, p.x + dw / 2 + 8, p.y + 18]);
      const alive = this.buildings.some((b) => b.f.family === d.fam && b.cur > 0);
      d.el.style.opacity = p.ok && alive && p.y > 90 ? "1" : "0";
    }
    for (const b of this.labelled) {
      const el = b.label!;
      const h = this.hFor(b.cur) * b.grow;
      const p = this.project(new THREE.Vector3(b.x, h + 3.2, b.z));
      el.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y}px)`;
      const w = (b.labelW ||= el.offsetWidth || 120);
      const r: [number, number, number, number] = [p.x - w / 2 - 6, p.y - 30, p.x + w / 2 + 6, p.y + 2];
      const clash = placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
      const show = p.ok && p.y > 110 && !clash && b.grow > 0.9 && b.dim < 0.5 && this.hovered !== b && b.cur > 0;
      if (show) placed.push(r);
      el.style.opacity = show ? "1" : "0";
    }
    if (this.hovered) {
      const b = this.hovered;
      const p = this.project(new THREE.Vector3(b.x, this.hFor(b.cur) + 2, b.z));
      this.opts.onHover(b.f, p.x, p.y);
    }
  }

  private pick() {
    if (this.pointer.x < -2) return;
    this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObjects(this.buildings.filter((b) => b.mesh.visible).map((b) => b.mesh), false);
    const b = hits.length ? this.buildings[hits[0].object.userData.i as number] : null;
    if (b !== this.hovered) this.setHovered(b);
  }

  private setHovered(b: Building | null) {
    this.hovered = b;
    this.renderer.domElement.style.cursor = b ? "pointer" : "grab";
    if (!b) this.opts.onHover(null, 0, 0);
  }

  private onMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  private onLeave = () => { this.pointer.set(-9, -9); this.setHovered(null); };
  private onDown = (e: PointerEvent) => { this.downAt = { x: e.clientX, y: e.clientY }; };
  private onUp = (e: PointerEvent) => {
    if (!this.downAt) return;
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    this.downAt = null;
    if (moved < 5 && this.hovered) this.opts.onSelect(this.hovered.f);
  };
  private onVis = () => { this.clock.getDelta(); };

  private applyOffset() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const shift = w > 1000 ? -w * 0.14 : 0;
    this.camera.setViewOffset(w, h, shift, h * 0.02, w, h);
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.applyOffset();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }
}
