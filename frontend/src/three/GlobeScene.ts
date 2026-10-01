/**
 * Globe 3D de la distribution — Three.js + d3-geo (Natural Earth, domaine public, via world-atlas).
 *
 * Les terres sont dessinées en points ; les pays où nos parts sont autorisées s'allument en or, d'autant plus que
 * le pays compte de fonds (ou de parts) enregistrés, et portent une colonne de lumière. Des arcs partent des pays de
 * domiciliation (France, Luxembourg…) ; une impulsion lumineuse les parcourt. Le globe tourne lentement au repos ;
 * on le fait pivoter à la souris, on survole un pays pour ses chiffres, on clique pour le centrer et l'ouvrir.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { geoArea, geoBounds, geoCentroid, geoContains, geoDistance, geoGraticule10 } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, Geometry, MultiPolygon, Polygon } from "geojson";
import type { Topology } from "topojson-specification";
import gsap from "gsap";
import { Quality } from "./quality";
import { HUB, NUM, type MapCountry, type MapMetric, type MapRoute } from "./MapScene";

export type GlobeData = { countries: MapCountry[]; routes: MapRoute[] };
export type GlobeOptions = {
  reduced: boolean;
  labelLayer: HTMLElement;
  domColors: Record<string, string>;
  onHover: (c: MapCountry | null, x: number, y: number) => void;
  onSelect: (c: MapCountry | null) => void;
};

const R = 10;
const GOLD = new THREE.Color("#cc9f53");
const GOLD_HI = new THREE.Color("#f3dcaa");
const LAND = new THREE.Color("#2b3850");
const LAND_DIM = new THREE.Color("#1c2638");

type Country = { f: Feature<Geometry>; num: string; bbox: [[number, number], [number, number]]; dots: number[] };
type Pillar = { c: MapCountry; mesh: THREE.Mesh; ring: THREE.Mesh; mat: THREE.MeshBasicMaterial; dir: THREE.Vector3; h: number; cur: number; label: HTMLDivElement };
type Arc = { r: MapRoute; mesh: THREE.Mesh; mat: THREE.ShaderMaterial };

/** Latitude, longitude (degrés) → point de la sphère de rayon r. */
export function toVec(lon: number, lat: number, r = R): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

/** Point de la sphère → [longitude, latitude] (degrés). */
export function toLonLat(v: THREE.Vector3): [number, number] {
  const n = v.clone().normalize();
  const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, n.y))) * 180) / Math.PI;
  let lon = (Math.atan2(n.z, -n.x) * 180) / Math.PI - 180;
  if (lon < -180) lon += 360;
  return [lon, lat];
}

const DOT_VS = /* glsl */ `
  attribute vec3 color; attribute float size;
  varying vec3 vColor; varying float vFacing;
  uniform float uPixel;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normalize(position));
    vFacing = clamp(dot(n, normalize(-mv.xyz)) * 1.6, 0.0, 1.0);
    gl_PointSize = size * uPixel * (34.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const DOT_FS = /* glsl */ `
  varying vec3 vColor; varying float vFacing;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.32, d) * (0.35 + 0.65 * vFacing);
    gl_FragColor = vec4(vColor, a);
  }`;
const ATMO_VS = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const ATMO_FS = /* glsl */ `
  varying vec3 vN; varying vec3 vV; uniform vec3 uColor;
  void main() { float f = 1.0 - clamp(dot(vN, vV), 0.0, 1.0); float i = pow(f, 4.0); gl_FragColor = vec4(uColor, i * 0.55); }`;
const ARC_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ARC_FS = /* glsl */ `
  varying vec2 vUv; uniform vec3 uColor; uniform float uTime; uniform float uDraw; uniform float uPhase; uniform float uDim;
  void main() {
    if (vUv.x > uDraw) discard;
    float p = fract(uTime * 0.22 + uPhase);
    float pulse = smoothstep(0.09, 0.0, abs(vUv.x - p));
    float a = (0.22 + 0.9 * pulse) * uDim;
    gl_FragColor = vec4(uColor * (1.0 + pulse * 1.4), a);
  }`;

export class GlobeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private q = new Quality(() => this.applyQuality());
  private world = new THREE.Group();
  private globe: THREE.Mesh;
  private dots?: THREE.Points;
  private dotColor?: Float32Array;
  private dotSize?: Float32Array;
  private dotCountry: Int16Array = new Int16Array(0);
  private countries: Country[] = [];
  private byNum = new Map<string, number>();
  private pillars: Pillar[] = [];
  private arcs: Arc[] = [];
  private data: GlobeData;
  private metric: MapMetric = "n_funds";
  private active = new Map<string, number>();     // iso → valeur (filtre client compris)
  private hovered: string | null = null;
  private selected: string | null = null;
  private ray = new THREE.Raycaster();
  private ptr = new THREE.Vector2(2, 2);
  private ptrClient = { x: 0, y: 0 };
  private downAt = { x: 0, y: 0, t: 0 };
  private raf = 0;
  private t0 = performance.now();
  private visible = true;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private disposables: { dispose: () => void }[] = [];

  constructor(private host: HTMLElement, topo: Topology, data: GlobeData, private opts: GlobeOptions) {
    this.data = data;
    const w = host.clientWidth || 800, h = host.clientHeight || 600;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.q.pixelRatio());
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.5, 400);
    if (w > 900) this.camera.setViewOffset(w, h, Math.min(190, w * 0.12), 0, w, h);
    const start = toVec(8, 28, 46);
    this.camera.position.copy(opts.reduced ? start : start.clone().multiplyScalar(1.5));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, { enablePan: false, enableDamping: true, dampingFactor: 0.07, rotateSpeed: 0.45, zoomSpeed: 0.6,
      minDistance: 18, maxDistance: 60, autoRotate: !opts.reduced, autoRotateSpeed: 0.35 });
    this.controls.addEventListener("start", () => { this.controls.autoRotate = false; });

    this.scene.add(new THREE.AmbientLight("#8ea2c8", 0.7));
    const key = new THREE.DirectionalLight("#fff4dc", 1.6);
    key.position.set(-30, 20, 30);
    this.scene.add(key);
    // Sphère : bleu nuit, légèrement satinée
    const sphere = new THREE.SphereGeometry(R * 0.995, 96, 64);
    const smat = new THREE.MeshStandardMaterial({ color: "#0a1426", roughness: 0.75, metalness: 0.25, emissive: "#050b16" });
    this.globe = new THREE.Mesh(sphere, smat);
    this.world.add(this.globe);
    // Atmosphère : halo bleu-or sur le limbe
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.035, 64, 48), new THREE.ShaderMaterial({
      vertexShader: ATMO_VS, fragmentShader: ATMO_FS, uniforms: { uColor: { value: new THREE.Color("#5f86d4").lerp(GOLD, 0.25) } },
      side: THREE.FrontSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.world.add(atmo);
    this.disposables.push(sphere, smat, atmo.geometry, atmo.material as THREE.Material);
    this.addGraticule();
    this.scene.add(this.world);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.55, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.loadCountries(topo);
    this.buildDots();
    this.setData(data);

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }, { threshold: 0 });
    this.io.observe(host);
    if (!opts.reduced) {
      gsap.to(this.camera.position, { x: start.x, y: start.y, z: start.z, duration: 2.6, ease: "power3.out" });
      this.world.scale.setScalar(0.82);
      gsap.to(this.world.scale, { x: 1, y: 1, z: 1, duration: 2.2, ease: "expo.out" });
    }
    this.loop();
  }

  // ---------------------------------------------------------------- géographie
  private loadCountries(topo: Topology) {
    const obj = (topo.objects as Record<string, unknown>).countries as never;
    const fc = feature(topo, obj) as unknown as { features: Feature<Geometry>[] };
    fc.features.forEach((f) => {
      const num = String(f.id ?? "").padStart(3, "0");
      this.byNum.set(num, this.countries.length);
      this.countries.push({ f, num, bbox: geoBounds(f) as [[number, number], [number, number]], dots: [] });
    });
  }

  /** Pays contenant le point (lon, lat), ou −1. Filtre par boîte englobante puis test exact. */
  private countryAt(lon: number, lat: number): number {
    for (let i = 0; i < this.countries.length; i++) {
      const [[x0, y0], [x1, y1]] = this.countries[i].bbox;
      if (lat < y0 || lat > y1) continue;
      if (x0 <= x1 ? lon < x0 || lon > x1 : lon < x0 && lon > x1) continue;
      if (geoContains(this.countries[i].f, [lon, lat])) return i;
    }
    return -1;
  }

  private buildDots() {
    const pos: number[] = [], who: number[] = [];
    const step = 1.25;
    for (let lat = -58; lat <= 80; lat += step) {
      const ring = Math.max(1, Math.round((360 * Math.cos((lat * Math.PI) / 180)) / step));
      for (let k = 0; k < ring; k++) {
        const lon = -180 + (k * 360) / ring + (lat % (2 * step) === 0 ? 0 : 180 / ring);
        const ci = this.countryAt(lon, lat);
        if (ci < 0) continue;
        const v = toVec(lon, lat, R * 1.002);
        pos.push(v.x, v.y, v.z);
        this.countries[ci].dots.push(who.length);
        who.push(ci);
      }
    }
    // Petits pays (Luxembourg, Monaco, Singapour…) : au moins un point, à leur point d'ancrage
    for (const [iso, num] of Object.entries(NUM)) {
      const ci = this.byNum.get(num);
      if (ci == null || this.countries[ci].dots.length) continue;
      const [lon, lat] = this.anchor(iso);
      const v = toVec(lon, lat, R * 1.002);
      pos.push(v.x, v.y, v.z);
      this.countries[ci].dots.push(who.length);
      who.push(ci);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    this.dotColor = new Float32Array(who.length * 3);
    this.dotSize = new Float32Array(who.length);
    g.setAttribute("color", new THREE.BufferAttribute(this.dotColor, 3));
    g.setAttribute("size", new THREE.BufferAttribute(this.dotSize, 1));
    this.dotCountry = Int16Array.from(who);
    const mat = new THREE.ShaderMaterial({ vertexShader: DOT_VS, fragmentShader: DOT_FS, transparent: true, depthWrite: false,
      uniforms: { uPixel: { value: this.renderer.getPixelRatio() } } });
    this.dots = new THREE.Points(g, mat);
    this.world.add(this.dots);
    this.disposables.push(g, mat);
  }

  private addGraticule() {
    const g = geoGraticule10();
    const pts: number[] = [];
    for (const line of g.coordinates) {
      for (let i = 1; i < line.length; i++) {
        const a = toVec(line[i - 1][0], line[i - 1][1], R * 1.001), b = toVec(line[i][0], line[i][1], R * 1.001);
        pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: "#cc9f53", transparent: true, opacity: 0.07, depthWrite: false });
    this.world.add(new THREE.LineSegments(geo, mat));
    this.disposables.push(geo, mat);
  }

  private anchor(iso: string): [number, number] {
    if (HUB[iso]) return HUB[iso];
    const ci = this.byNum.get(NUM[iso] ?? "");
    if (ci == null) return [0, 0];
    const f = this.countries[ci].f;
    const geom = f.geometry as Polygon | MultiPolygon;
    if (geom.type === "MultiPolygon") {
      const main = geom.coordinates.reduce((a, b) => (geoArea({ type: "Polygon", coordinates: b }) > geoArea({ type: "Polygon", coordinates: a }) ? b : a));
      return geoCentroid({ type: "Polygon", coordinates: main }) as [number, number];
    }
    return geoCentroid(f) as [number, number];
  }

  // ---------------------------------------------------------------- données
  setData(data: GlobeData, values?: Map<string, number>) {
    this.data = data;
    this.active = values ?? new Map(data.countries.map((c) => [c.iso, c[this.metric]]));
    this.buildPillars();
    this.buildArcs();
    this.paint();
  }

  setMetric(m: MapMetric) {
    this.metric = m;
    this.setData(this.data);
  }

  /** Filtre (par exemple une clientèle) : pays retenus et valeur affichée ; null = tous les pays. */
  setFilter(values: Map<string, number> | null) {
    this.setData(this.data, values ?? undefined);
  }

  private clearPillars() {
    this.pillars.forEach((p) => { this.world.remove(p.mesh, p.ring); p.mesh.geometry.dispose(); p.mat.dispose(); (p.ring.material as THREE.Material).dispose(); p.ring.geometry.dispose(); p.label.remove(); });
    this.pillars = [];
  }

  private buildPillars() {
    this.clearPillars();
    const vals = [...this.active.values()];
    const max = Math.max(1, ...vals);
    const ranked = [...this.active.entries()].sort((a, b) => b[1] - a[1]).map(([iso]) => iso);
    for (const c of this.data.countries) {
      const v = this.active.get(c.iso);
      if (!v) continue;
      const [lon, lat] = this.anchor(c.iso);
      const dir = toVec(lon, lat, 1).normalize();
      const h = 0.35 + 3.2 * Math.sqrt(v / max);
      const geo = new THREE.CylinderGeometry(0.045, 0.06, 1, 10, 1, true);
      geo.translate(0, 0.5, 0);
      const mat = new THREE.MeshBasicMaterial({ color: GOLD.clone().lerp(GOLD_HI, Math.sqrt(v / max) * 0.6), transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(dir.clone().multiplyScalar(R * 1.004));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      mesh.scale.y = this.opts.reduced ? h : 0.001;
      mesh.userData = { iso: c.iso };
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.2, 32), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
      ring.position.copy(dir.clone().multiplyScalar(R * 1.006));
      ring.lookAt(dir.clone().multiplyScalar(R * 2));
      this.world.add(mesh, ring);
      const label = document.createElement("div");
      label.className = "globe__lab";
      label.innerHTML = `<span class="globe__lab-n"></span><span class="globe__lab-v num"></span>`;
      (label.firstChild as HTMLElement).textContent = c.country;
      (label.lastChild as HTMLElement).textContent = String(v);
      label.dataset.rank = String(ranked.indexOf(c.iso));
      this.opts.labelLayer.appendChild(label);
      const p: Pillar = { c, mesh, ring, mat, dir, h, cur: this.opts.reduced ? 1 : 0, label };
      this.pillars.push(p);
      if (!this.opts.reduced) gsap.to(p, { cur: 1, duration: 1.4, delay: 0.4 + Math.min(1.2, ranked.indexOf(c.iso) * 0.05), ease: "expo.out" });
    }
  }

  private buildArcs() {
    this.arcs.forEach((a) => { this.world.remove(a.mesh); a.mesh.geometry.dispose(); a.mat.dispose(); });
    this.arcs = [];
    const routes = this.data.routes.filter((r) => r.domicile_iso !== r.iso && this.active.has(r.iso));
    const max = Math.max(1, ...routes.map((r) => r.value));
    routes.forEach((r, i) => {
      const [lo0, la0] = this.anchor(r.domicile_iso), [lo1, la1] = this.anchor(r.iso);
      const a = toVec(lo0, la0, R * 1.005), b = toVec(lo1, la1, R * 1.005);
      const d = geoDistance([lo0, la0], [lo1, la1]);
      const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R * (1.02 + d * 0.42));
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const geo = new THREE.TubeGeometry(curve, 64, 0.018 + 0.05 * Math.sqrt(r.value / max), 6, false);
      const color = new THREE.Color(this.opts.domColors[r.domicile_iso] ?? "#8d929c");
      const mat = new THREE.ShaderMaterial({ vertexShader: ARC_VS, fragmentShader: ARC_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: color }, uTime: { value: 0 }, uDraw: { value: this.opts.reduced ? 1 : 0 }, uPhase: { value: (i * 0.137) % 1 }, uDim: { value: 1 } } });
      const mesh = new THREE.Mesh(geo, mat);
      this.world.add(mesh);
      this.arcs.push({ r, mesh, mat });
      if (!this.opts.reduced) gsap.to(mat.uniforms.uDraw, { value: 1, duration: 1.6, delay: 0.8 + i * 0.03, ease: "power2.inOut" });
    });
  }

  /** Couleur des points : pays autorisés en or (intensité selon la valeur), survolé ou sélectionné en clair. */
  private paint() {
    if (!this.dots || !this.dotColor || !this.dotSize) return;
    const max = Math.max(1, ...this.active.values());
    const isoOf = new Map<number, string>();
    for (const c of this.data.countries) { const ci = this.byNum.get(NUM[c.iso] ?? ""); if (ci != null) isoOf.set(ci, c.iso); }
    const focus = this.selected ?? this.hovered;
    const tmp = new THREE.Color();
    for (let i = 0; i < this.dotCountry.length; i++) {
      const iso = isoOf.get(this.dotCountry[i]);
      const v = iso ? this.active.get(iso) : undefined;
      if (v) {
        tmp.copy(GOLD).lerp(GOLD_HI, Math.sqrt(v / max) * 0.7);
        if (focus && iso !== focus) tmp.lerp(LAND, 0.55);
        if (iso === focus) tmp.copy(GOLD_HI).multiplyScalar(1.25);
        this.dotSize[i] = iso === focus ? 4.4 : 3.4;
      } else {
        tmp.copy(focus ? LAND_DIM : LAND);
        this.dotSize[i] = 2.6;
      }
      this.dotColor[i * 3] = tmp.r; this.dotColor[i * 3 + 1] = tmp.g; this.dotColor[i * 3 + 2] = tmp.b;
    }
    (this.dots.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.dots.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    this.arcs.forEach((a) => { a.mat.uniforms.uDim.value = !focus || a.r.iso === focus ? 1 : 0.18; });
    this.pillars.forEach((p) => { p.mat.opacity = !focus || p.c.iso === focus ? 0.9 : 0.25; });
  }

  // ---------------------------------------------------------------- interaction
  /** Centre le globe sur un pays (ou relâche la sélection avec null). */
  select(iso: string | null) {
    this.selected = iso;
    this.paint();
    if (!iso) return;
    this.controls.autoRotate = false;
    const [lon, lat] = this.anchor(iso);
    const dist = Math.min(30, this.camera.position.length());
    const to = toVec(lon, lat, dist).applyQuaternion(this.world.quaternion);
    if (this.opts.reduced) { this.camera.position.copy(to); return; }
    const from = this.camera.position.clone();
    const o = { t: 0 };
    gsap.to(o, { t: 1, duration: 1.4, ease: "power3.inOut", onUpdate: () => {
      // Interpolation sphérique : la caméra glisse autour du globe sans le traverser
      const v = from.clone().normalize().lerp(to.clone().normalize(), o.t).normalize().multiplyScalar(from.length() + (dist - from.length()) * o.t);
      this.camera.position.copy(v);
    } });
  }

  private pick(): string | null {
    this.ray.setFromCamera(this.ptr, this.camera);
    const hit = this.ray.intersectObject(this.globe, false)[0];
    if (!hit) return null;
    const local = this.world.worldToLocal(hit.point.clone());
    const [lon, lat] = toLonLat(local);
    const ci = this.countryAt(lon, lat);
    if (ci < 0) return null;
    const num = this.countries[ci].num;
    const c = this.data.countries.find((x) => NUM[x.iso] === num && this.active.has(x.iso));
    return c ? c.iso : null;
  }

  private onMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ptrClient = { x: e.clientX - r.left, y: e.clientY - r.top };
    const iso = this.pick();
    if (iso !== this.hovered) {
      this.hovered = iso;
      this.paint();
      this.renderer.domElement.style.cursor = iso ? "pointer" : "grab";
    }
    const c = iso ? this.data.countries.find((x) => x.iso === iso) ?? null : null;
    this.opts.onHover(c, this.ptrClient.x, this.ptrClient.y);
  };
  private onLeave = () => { this.hovered = null; this.paint(); this.opts.onHover(null, 0, 0); };
  private onDown = (e: PointerEvent) => { this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  private onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6 || performance.now() - this.downAt.t > 600) return;
    const iso = this.pick();
    this.select(iso);
    this.opts.onSelect(iso ? this.data.countries.find((x) => x.iso === iso) ?? null : null);
  };

  // ---------------------------------------------------------------- rendu
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const busy = this.controls.autoRotate || gsap.isTweening(this.camera.position) || !!this.hovered;
    if (!this.visible || document.hidden || !this.q.gate(now, busy)) return;
    const t = (now - this.t0) / 1000;
    this.controls.update();
    this.arcs.forEach((a) => { a.mat.uniforms.uTime.value = this.opts.reduced ? 0.3 : t; });
    const camDir = this.camera.position.clone().normalize();
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const v = new THREE.Vector3();
    this.pillars.forEach((p) => {
      const s = Math.max(0.001, p.h * p.cur * (p.c.iso === (this.selected ?? this.hovered) ? 1.18 : 1));
      p.mesh.scale.y = s;
      const pulse = this.opts.reduced ? 1 : 1 + 0.35 * Math.sin(t * 2.2 + p.dir.x * 5);
      p.ring.scale.setScalar(pulse);
      // Étiquettes : les principaux pays et le pays survolé ou sélectionné, sur la face visible seulement
      const worldDir = p.dir.clone().applyQuaternion(this.world.quaternion);
      const facing = worldDir.dot(camDir);
      const focus = p.c.iso === (this.selected ?? this.hovered);
      const show = facing > 0.35 && (focus || Number(p.label.dataset.rank) < 4);
      p.label.style.opacity = show ? String(Math.min(1, (facing - 0.35) * 4)) : "0";
      p.label.classList.toggle("is-on", focus);
      if (show) {
        v.copy(p.dir).multiplyScalar(R * 1.004 + s).applyMatrix4(this.world.matrixWorld).project(this.camera);
        p.label.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -130%)`;
      }
    });
    if (this.q.bloom) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  };

  private applyQuality() {
    this.renderer.setPixelRatio(this.q.pixelRatio());
    this.composer.setPixelRatio(this.q.pixelRatio());
    const m = this.dots?.material as THREE.ShaderMaterial | undefined;
    if (m) m.uniforms.uPixel.value = this.renderer.getPixelRatio();
    this.resize();
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    // Le panneau occupe la droite : le globe est recentré dans l'espace restant
    if (w > 900) this.camera.setViewOffset(w, h, Math.min(190, w * 0.12), 0, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    gsap.killTweensOf(this.camera.position);
    this.ro.disconnect();
    this.io.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    this.clearPillars();
    this.arcs.forEach((a) => { a.mesh.geometry.dispose(); a.mat.dispose(); });
    this.controls.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    el.remove();
    this.opts.labelLayer.innerHTML = "";
  }
}
