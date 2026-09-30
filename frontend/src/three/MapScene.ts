/**
 * Carte 3D de la distribution — Three.js + d3-geo (fonds de carte Natural Earth, domaine public, via world-atlas).
 * Chaque pays où nos parts sont autorisées se soulève : sa hauteur est proportionnelle au nombre de fonds
 * (ou de parts) enregistrés. Des arcs lumineux partent du pays de domiciliation des fonds (France, Luxembourg…)
 * vers chaque pays d'enregistrement ; leur épaisseur suit le nombre d'enregistrements.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { geoArea, geoCentroid, geoDistance, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Feature, Geometry, MultiPolygon, Polygon } from "geojson";
import type { Topology } from "topojson-specification";
import gsap from "gsap";

export type MapCountry = { country: string; iso: string; n_funds: number; n_shares: number; aum_registered: number };
export type MapRoute = { domicile: string; domicile_iso: string; country: string; iso: string; value: number; n_funds: number };
export type MapMetric = "n_funds" | "n_shares";
export type MapView = "europe" | "monde";
export type MapOptions = {
  reduced: boolean;
  labelLayer: HTMLElement;
  domColors: Record<string, string>;
  onHover: (c: MapCountry | null, x: number, y: number) => void;
  onSelect: (c: MapCountry) => void;
};

/** ISO 3166 alpha-2 → numérique (identifiants de world-atlas). */
const NUM: Record<string, string> = {
  FR: "250", LU: "442", BE: "056", DE: "276", AT: "040", IT: "380", ES: "724", PT: "620", NL: "528", CH: "756", GB: "826", SE: "752",
  FI: "246", DK: "208", NO: "578", IE: "372", SG: "702", CL: "152", MC: "492", LI: "438", MT: "470", CY: "196", GR: "300", PL: "616",
  CZ: "203", HU: "348", IS: "352", HK: "344", JP: "392", US: "840", CA: "124", BR: "076", MX: "484", PE: "604", CO: "170", UY: "858",
  AR: "032", AE: "784", SA: "682", QA: "634", KW: "414", BH: "048", IL: "376", ZA: "710", AU: "036", NZ: "554", TW: "158", KR: "410",
  CN: "156", IN: "356", MY: "458", TH: "764", SK: "703", SI: "705", HR: "191", RO: "642", BG: "100", EE: "233", LV: "428", LT: "440",
  TR: "792", MA: "504",
};
/** Points d'ancrage explicites (capitale financière) pour les pays dont le centroïde tombe mal. */
const HUB: Record<string, [number, number]> = { FR: [2.35, 48.86], LU: [6.13, 49.61], NO: [10.75, 59.91], US: [-74, 40.7], CL: [-70.65, -33.45], SG: [103.82, 1.35], HK: [114.17, 22.3] };

const H_MAX = 6.5;
const BASE = 0.25;

type CountryObj = { c: MapCountry; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; pillar?: THREE.Mesh; top: THREE.Vector3; label: HTMLDivElement; h: number; cur: number; hover: number };
type ArcObj = { r: MapRoute; mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; curve: THREE.QuadraticBezierCurve3; count: number; dots: THREE.InstancedMesh; n: number; phase: number };

class Tick {
  private last = performance.now();
  t = 0;
  getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; this.t += d; return d; }
}

function fixNormals(g: THREE.BufferGeometry) {
  const n = g.attributes.normal?.array as Float32Array | undefined;
  if (!n) return;
  for (let j = 0; j < n.length; j += 3) if (!(Math.hypot(n[j], n[j + 1], n[j + 2]) > 1e-6)) { n[j] = 0; n[j + 1] = 1; n[j + 2] = 0; }
}

export class MapScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private proj = geoNaturalEarth1().scale(62).translate([0, 0]).precision(0.2);
  private features = new Map<string, Feature<Geometry>>();
  private shapeCache = new Map<string, THREE.Shape[]>();
  private countries: CountryObj[] = [];
  private arcs: ArcObj[] = [];
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-9, -9);
  private hot: CountryObj | null = null;
  private raf = 0;
  private visible = true;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private clock = new Tick();
  private disposables: { dispose: () => void }[] = [];
  private metric: MapMetric = "n_funds";
  private data: { countries: MapCountry[]; routes: MapRoute[] };
  private downAt: { x: number; y: number } | null = null;
  private dotGeo = new THREE.SphereGeometry(0.2, 8, 6);

  constructor(private host: HTMLElement, world: Topology, data: { countries: MapCountry[]; routes: MapRoute[] }, private opts: MapOptions) {
    this.data = data;
    const w = host.clientWidth, h = host.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color("#060b15");
    this.scene.fog = new THREE.Fog("#060b15", 260, 620);
    this.camera = new THREE.PerspectiveCamera(32, w / h, 1, 2000);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.12;
    this.controls.rotateSpeed = 0.45;
    // Au doigt, la page doit défiler : la rotation n'est offerte qu'à la souris
    this.controls.enableRotate = matchMedia("(pointer: fine)").matches;
    this.renderer.domElement.style.touchAction = "pan-y";

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.5, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const topo = world as Topology;
    const obj = topo.objects.countries;
    const fc = feature(topo, obj) as unknown as { features: Feature<Geometry>[] };
    fc.features.forEach((f) => this.features.set(String(f.id ?? "").padStart(3, "0"), f));
    this.lights();
    this.buildBase(topo);
    this.build(true);
    this.setView("europe", true);

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; });
    this.io.observe(host);
    this.loop();
  }

  // ---------------------------------------------------------------- géographie
  private xz(lonlat: [number, number]): THREE.Vector3 {
    const p = this.proj(lonlat) ?? [0, 0];
    return new THREE.Vector3(p[0], 0, p[1]);
  }

  /** Formes planes d'un pays (trou compris), en ne gardant que son territoire principal et ses voisins proches. */
  private shapesOf(f: Feature<Geometry>, mainOnly: boolean): THREE.Shape[] {
    const key = `${f.id}:${mainOnly}`;
    if (this.shapeCache.has(key)) return this.shapeCache.get(key)!;
    let g = f.geometry as Polygon | MultiPolygon;
    if (mainOnly && g.type === "MultiPolygon") {
      const polys = g.coordinates.map((c) => ({ c, a: geoArea({ type: "Polygon", coordinates: c }), m: geoCentroid({ type: "Polygon", coordinates: c }) }));
      const main = polys.reduce((a, b) => (b.a > a.a ? b : a));
      g = { type: "MultiPolygon", coordinates: polys.filter((p) => p === main || (p.a > main.a * 0.02 && geoDistance(p.m, main.m) < 0.16)).map((p) => p.c) };
    }
    const sp = new THREE.ShapePath();
    const ctx = { moveTo: (x: number, y: number) => sp.moveTo(x, y), lineTo: (x: number, y: number) => sp.lineTo(x, y), closePath: () => undefined, arc: () => undefined };
    geoPath(this.proj, ctx as never)({ type: "Feature", properties: {}, geometry: g });
    const shapes = sp.toShapes();
    this.shapeCache.set(key, shapes);
    return shapes;
  }

  private anchorOf(iso: string, f: Feature<Geometry> | undefined): [number, number] {
    if (HUB[iso]) return HUB[iso];
    if (!f) return [0, 0];
    const g = f.geometry as Polygon | MultiPolygon;
    if (g.type === "MultiPolygon") {
      const main = g.coordinates.reduce((a, b) => (geoArea({ type: "Polygon", coordinates: b }) > geoArea({ type: "Polygon", coordinates: a }) ? b : a));
      return geoCentroid({ type: "Polygon", coordinates: main }) as [number, number];
    }
    return geoCentroid(f) as [number, number];
  }

  private lights() {
    this.scene.add(new THREE.HemisphereLight("#9fb4de", "#070c16", 1.2));
    const key = new THREE.DirectionalLight("#fff2dc", 1.8);
    key.position.set(-120, 200, 160);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight("#6189d6", 0.8);
    rim.position.set(160, 80, -200);
    this.scene.add(rim);
  }

  /** Le fond : tous les pays à plat, frontières fines, et un halo d'océan. */
  private buildBase(topo: Topology) {
    const geos: THREE.BufferGeometry[] = [];
    this.features.forEach((f) => {
      const shapes = this.shapesOf(f, false);
      if (shapes.length) geos.push(new THREE.ShapeGeometry(shapes, 1));
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (merged) {
      merged.rotateX(Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ color: "#131f33", roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide });
      const land = new THREE.Mesh(merged, mat);
      land.position.y = 0.02;
      this.scene.add(land);
      this.disposables.push(merged, mat);
    }
    // Frontières
    const borders = mesh(topo, topo.objects.countries as never);
    const pts: number[] = [];
    const ctx = {
      last: null as [number, number] | null,
      moveTo(x: number, y: number) { this.last = [x, y]; },
      lineTo(x: number, y: number) { if (this.last) pts.push(this.last[0], 0.08, this.last[1], x, 0.08, y); this.last = [x, y]; },
      closePath() { this.last = null; }, arc() { /* sans objet */ },
    };
    geoPath(this.proj, ctx as never)(borders);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const bm = new THREE.LineBasicMaterial({ color: "#2c3d5c", transparent: true, opacity: 0.8 });
    this.scene.add(new THREE.LineSegments(bg, bm));
    this.disposables.push(bg, bm);
    // Graticule discret et océan
    const ocean = new THREE.Mesh(new THREE.CircleGeometry(420, 64), new THREE.MeshBasicMaterial({ color: "#081120" }));
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.05;
    this.scene.add(ocean);
    this.disposables.push(ocean.geometry, ocean.material as THREE.Material);
  }

  // ---------------------------------------------------------------- données
  private hFor(c: MapCountry) {
    const max = Math.max(1, ...this.data.countries.map((x) => x[this.metric]));
    return BASE + (H_MAX * c[this.metric]) / max;
  }

  private colorFor(c: MapCountry) {
    // Séquentiel, une seule teinte (bleu Rothschild) : du sombre au clair selon l'intensité
    const max = Math.max(1, ...this.data.countries.map((x) => x[this.metric]));
    const t = Math.sqrt(c[this.metric] / max);
    return new THREE.Color("#1f3a66").lerp(new THREE.Color("#7fa2e0"), t);
  }

  private clearData() {
    this.countries.forEach((o) => { this.scene.remove(o.mesh); o.mesh.geometry.dispose(); o.mat.dispose(); if (o.pillar) { this.scene.remove(o.pillar); o.pillar.geometry.dispose(); } o.label.remove(); gsap.killTweensOf(o); });
    this.arcs.forEach((a) => { this.scene.remove(a.mesh, a.dots); a.mesh.geometry.dispose(); a.mat.dispose(); (a.dots.material as THREE.Material).dispose(); gsap.killTweensOf(a); });
    this.countries = []; this.arcs = []; this.hot = null;
  }

  private build(first: boolean) {
    this.clearData();
    const byIso = new Map(this.data.countries.map((c) => [c.iso, c]));
    const order = [...this.data.countries].sort((a, b) => b[this.metric] - a[this.metric]);
    const paris = this.xz(HUB.FR);
    order.forEach((c, k) => {
      const f = this.features.get(NUM[c.iso] ?? "---");
      const anchor = this.xz(this.anchorOf(c.iso, f));
      const h = this.hFor(c);
      let geo: THREE.BufferGeometry;
      let small = true;
      if (f) {
        const shapes = this.shapesOf(f, true);
        const area = shapes.reduce((s, sh) => s + Math.abs(THREE.ShapeUtils.area(sh.getPoints())), 0);
        small = area < 1.2;
        geo = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false, curveSegments: 1 });
        geo.rotateX(Math.PI / 2);
        geo.translate(0, 1, 0);
        fixNormals(geo);
      } else geo = new THREE.CylinderGeometry(0.9, 0.9, 1, 20).translate(0, 0.5, 0);
      const mat = new THREE.MeshStandardMaterial({ color: this.colorFor(c), roughness: 0.35, metalness: 0.35, emissive: new THREE.Color("#2b4a86"), emissiveIntensity: 0.1 });
      const meshC = new THREE.Mesh(geo, mat);
      meshC.userData.k = k;
      this.scene.add(meshC);
      let pillar: THREE.Mesh | undefined;
      if (small && f) {
        // Les petits pays (Luxembourg, Monaco, Singapour…) reçoivent une colonne lisible
        pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 24).translate(0, 0.5, 0), mat);
        pillar.position.copy(anchor);
        pillar.userData.k = k;
        this.scene.add(pillar);
      }
      const label = document.createElement("div");
      label.className = "mp__lab";
      label.innerHTML = `<span class="mp__lab-t"></span><span class="mp__lab-v num"></span>`;
      (label.firstChild as HTMLElement).textContent = c.country;
      this.opts.labelLayer.appendChild(label);
      const o: CountryObj = { c, mesh: meshC, mat, pillar, top: anchor.clone(), label, h, cur: this.opts.reduced ? h : first ? 0.01 : h, hover: 0 };
      this.countries.push(o);
      this.applyH(o);
      if (!this.opts.reduced && first) gsap.to(o, { cur: h, duration: 1.4, ease: "expo.out", delay: 0.3 + Math.min(1.2, anchor.distanceTo(paris) / 160) });
    });

    // Arcs : du pays de domiciliation vers le pays d'enregistrement (hors même pays)
    const maxR = Math.max(1, ...this.data.routes.map((r) => r.value));
    this.data.routes.forEach((r, i) => {
      if (r.domicile_iso === r.iso || !byIso.has(r.iso)) return;
      const fromF = this.features.get(NUM[r.domicile_iso] ?? "---"), toF = this.features.get(NUM[r.iso] ?? "---");
      const a = this.xz(this.anchorOf(r.domicile_iso, fromF)), b = this.xz(this.anchorOf(r.iso, toF));
      const d = a.distanceTo(b);
      const fromC = byIso.get(r.domicile_iso), toC = byIso.get(r.iso)!;
      a.y = fromC ? this.hFor(fromC) : 1;
      b.y = this.hFor(toC);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y = Math.max(a.y, b.y) + 3 + Math.min(d * 0.28, 26);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const radius = 0.04 + 0.2 * Math.sqrt(r.value / maxR);
      const geo = new THREE.TubeGeometry(curve, 64, radius, 8, false);
      const color = new THREE.Color(this.opts.domColors[r.domicile_iso] ?? "#cc9f53");
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 });
      const meshA = new THREE.Mesh(geo, mat);
      const full = geo.index ? geo.index.count : 0;
      geo.setDrawRange(0, this.opts.reduced ? full : 0);
      this.scene.add(meshA);
      const n = this.opts.reduced ? 0 : Math.min(10, 2 + Math.round(8 * r.value / maxR));
      const dotMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.8), toneMapped: false, transparent: true, opacity: 0 });
      const dots = new THREE.InstancedMesh(this.dotGeo, dotMat, Math.max(n, 1));
      dots.count = n;
      this.scene.add(dots);
      const arc: ArcObj = { r, mesh: meshA, mat, curve, count: 0, dots, n, phase: (i * 0.137) % 1 };
      this.arcs.push(arc);
      if (!this.opts.reduced) {
        const draw = { v: 0 };
        gsap.to(draw, { v: full, duration: 1.3, ease: "power2.inOut", delay: (first ? 1.2 : 0.2) + (d / 400), onUpdate: () => geo.setDrawRange(0, Math.floor(draw.v / 3) * 3),
          onComplete: () => { gsap.to(dotMat, { opacity: 1, duration: 0.6 }); } });
      }
    });
  }

  private applyH(o: CountryObj) {
    const hh = Math.max(o.cur, 0.01);
    o.mesh.scale.y = hh;
    if (o.pillar) o.pillar.scale.y = hh;
    o.top.y = hh;
  }

  // ---------------------------------------------------------------- API
  setData(d: { countries: MapCountry[]; routes: MapRoute[] }) { this.data = d; this.build(false); }

  setMetric(m: MapMetric) {
    this.metric = m;
    this.countries.forEach((o) => {
      o.h = this.hFor(o.c);
      o.mat.color.copy(this.colorFor(o.c));
      if (this.opts.reduced) { o.cur = o.h; this.applyH(o); } else gsap.to(o, { cur: o.h, duration: 0.9, ease: "power3.inOut" });
    });
    // Les arcs repartent du sommet des colonnes
    this.build(false);
  }

  setView(v: MapView, instant = false) {
    const t = v === "europe" ? this.xz([11, 51.5]) : new THREE.Vector3(0, 0, 10);
    const off = v === "europe" ? new THREE.Vector3(4, 58, 64) : new THREE.Vector3(0, 210, 220);
    const aspect = this.host.clientWidth / Math.max(1, this.host.clientHeight);
    const k = aspect < 1 ? 1.9 : aspect < 1.4 ? 1.3 : 1;
    const pos = t.clone().add(off.multiplyScalar(k));
    if (instant || this.opts.reduced) {
      this.controls.target.copy(t); this.camera.position.copy(pos); this.controls.update(); return;
    }
    gsap.to(this.controls.target, { x: t.x, y: t.y, z: t.z, duration: 1.6, ease: "power3.inOut" });
    gsap.to(this.camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: 1.6, ease: "power3.inOut" });
  }

  highlight(iso: string | null) {
    this.hot = iso ? this.countries.find((o) => o.c.iso === iso) ?? null : null;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);
    this.clearData();
    this.ro.disconnect();
    this.io.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    this.controls.dispose();
    this.dotGeo.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    el.remove();
    this.opts.labelLayer.innerHTML = "";
  }

  // ---------------------------------------------------------------- boucle
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.visible || document.hidden) return;
    this.controls.update();
    const k = this.opts.reduced ? 1 : 1 - Math.pow(0.001, dt);
    for (const o of this.countries) {
      this.applyH(o);
      const t = this.hot === o ? 1 : 0;
      o.hover += (t - o.hover) * k;
      o.mat.emissiveIntensity = 0.1 + o.hover * 0.7;
    }
    // Particules le long des arcs : le sens de lecture (domicile → pays)
    const m = new THREE.Matrix4();
    for (const a of this.arcs) {
      if (!a.n) continue;
      const focus = !this.hot || this.hot.c.iso === a.r.iso || this.hot.c.iso === a.r.domicile_iso;
      a.mat.opacity += ((focus ? 0.7 : 0.08) - a.mat.opacity) * k;
      for (let i = 0; i < a.n; i++) {
        const u = (this.clock.t * 0.16 + a.phase + i / a.n) % 1;
        m.makeTranslation(a.curve.getPoint(u));
        a.dots.setMatrixAt(i, m);
      }
      a.dots.instanceMatrix.needsUpdate = true;
      (a.dots.material as THREE.MeshBasicMaterial).visible = focus;
    }
    this.pick();
    this.composer.render();
    this.placeLabels();
  };

  private project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.host.clientWidth, y: (-p.y * 0.5 + 0.5) * this.host.clientHeight, ok: p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 };
  }

  private placeLabels() {
    const placed: [number, number, number, number][] = [];
    for (const o of this.countries) {
      const v = (o.label.lastChild as HTMLElement);
      const val = String(o.c[this.metric]);
      if (v.textContent !== val) v.textContent = val;
      const p = this.project(o.top.clone().setY(o.top.y + 1.2));
      const w = o.label.offsetWidth || 80, h = 30;
      const r: [number, number, number, number] = [p.x - w / 2, p.y - h, p.x + w / 2, p.y];
      const clash = placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
      const show = p.ok && (!clash || this.hot === o) && o.cur > 0.3;
      if (show) placed.push(r);
      o.label.style.opacity = show ? (this.hot && this.hot !== o ? "0.35" : "1") : "0";
      o.label.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      o.label.classList.toggle("is-hot", this.hot === o);
    }
    if (this.hot) {
      const p = this.project(this.hot.top);
      this.opts.onHover(this.hot.c, p.x, p.y);
    }
  }

  private pick() {
    if (this.pointer.x < -2) return;
    this.ray.setFromCamera(this.pointer, this.camera);
    const objs: THREE.Object3D[] = [];
    this.countries.forEach((o) => { objs.push(o.mesh); if (o.pillar) objs.push(o.pillar); });
    const hit = this.ray.intersectObjects(objs, false)[0];
    const o = hit ? this.countries[hit.object.userData.k as number] : null;
    if (o !== this.hot) {
      this.hot = o;
      this.renderer.domElement.style.cursor = o ? "pointer" : "grab";
      if (!o) this.opts.onHover(null, 0, 0);
    }
  }

  private onMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  private onLeave = () => { this.pointer.set(-9, -9); if (this.hot) { this.hot = null; this.opts.onHover(null, 0, 0); } };
  private onDown = (e: PointerEvent) => { this.downAt = { x: e.clientX, y: e.clientY }; };
  private onUp = (e: PointerEvent) => {
    if (!this.downAt) return;
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    this.downAt = null;
    if (moved < 5 && this.hot) this.opts.onSelect(this.hot.c);
  };

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }
}
