/**
 * Sankey 3D de la distribution — Three.js.
 * Trois colonnes : famille de gestion → domiciliation → pays d'enregistrement.
 * L'épaisseur d'un flux est proportionnelle au nombre d'enregistrements actifs (une part × un pays) ;
 * chaque famille circule dans son propre couloir de profondeur, ce qui sépare les familles sans croiser les flux.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import gsap from "gsap";

export type SkNode = { id: string; label: string; col: number; value: number; n_funds: number; n_shares: number; family?: string; iso?: string; other?: boolean };
export type SkLink = { source: number; target: number; value: number; family: string; n_funds: number; n_shares: number };
export type SkData = { nodes: SkNode[]; links: SkLink[] };
export type SkHover = { kind: "node"; node: SkNode } | { kind: "link"; link: SkLink; from: SkNode; to: SkNode };

export type SankeyOptions = {
  reduced: boolean;
  colors: Record<string, string>;
  familyOrder: string[];
  labelLayer: HTMLElement;
  onHover: (h: SkHover | null, x: number, y: number) => void;
  onSelect: (n: SkNode) => void;
  formatLabel: (n: SkNode) => { title: string; sub: string };
};

const X = [-38, 0, 38];
const NODE_W = 2.2;
const HT = 54;
const LANE = 3.1;
const RIBBON_D = 2.1;
const SEG = 64;

type LinkObj = { l: SkLink; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; em: number; cur: number };
type NodeObj = { n: SkNode; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; edge: THREE.LineSegments; label: HTMLDivElement; anchor: THREE.Vector3; cur: number; top: number; h: number };

class Tick {
  private last = performance.now();
  getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; return d; }
}

export class SankeyScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private world = new THREE.Group();
  private clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 60);
  private links: LinkObj[] = [];
  private nodes: NodeObj[] = [];
  private heads: { el: HTMLDivElement; pos: THREE.Vector3 }[] = [];
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-9, -9);
  private par = { x: 0, y: 0, tx: 0, ty: 0 };
  private hot: { kind: "node" | "link"; i: number } | null = null;
  private focusId: string | null = null;
  private raf = 0;
  private visible = true;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private clock = new Tick();
  private disposables: { dispose: () => void }[] = [];
  private data: SkData;
  private downAt: { x: number; y: number } | null = null;
  private dist = 100;

  constructor(private host: HTMLElement, data: SkData, private opts: SankeyOptions) {
    this.data = data;
    const w = host.clientWidth, h = host.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color("#070d18");
    this.scene.fog = new THREE.Fog("#070d18", 120, 260);
    this.camera = new THREE.PerspectiveCamera(30, w / h, 1, 1000);
    this.scene.add(this.world);
    this.lights();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.6, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.build(true);
    this.fit();

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

  // ---------------------------------------------------------------- monde
  private lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight("#8aa0cf", "#0a0f1a", 1.1));
    const key = new THREE.DirectionalLight("#fff1dc", 1.6);
    key.position.set(-40, 60, 80);
    s.add(key);
    const rim = new THREE.DirectionalLight("#6189d6", 0.9);
    rim.position.set(50, -10, -60);
    s.add(rim);
    // Sol : un quadrillage très discret qui ancre la scène
    const grid = new THREE.GridHelper(260, 52, "#1d2b44", "#121d30");
    grid.position.y = -HT / 2 - 7;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    s.add(grid);
    this.disposables.push(grid.geometry, grid.material as THREE.Material);
  }

  private clear() {
    this.links.forEach((o) => { o.mesh.geometry.dispose(); o.mat.dispose(); this.world.remove(o.mesh); });
    this.nodes.forEach((o) => { o.mesh.geometry.dispose(); o.mat.dispose(); o.edge.geometry.dispose(); (o.edge.material as THREE.Material).dispose(); this.world.remove(o.mesh, o.edge); o.label.remove(); });
    this.heads.forEach((h) => h.el.remove());
    this.links = []; this.nodes = []; this.heads = [];
    this.hot = null;
  }

  private build(first: boolean) {
    this.clear();
    const { nodes, links } = this.data;
    if (!nodes.length) return;
    const fams = this.opts.familyOrder.filter((f) => links.some((l) => l.family === f));
    const laneZ = (f: string) => (fams.indexOf(f) - (fams.length - 1) / 2) * LANE;
    const depth = fams.length * LANE + 1.2;
    const famRank = (n: SkNode) => (n.family ? this.opts.familyOrder.indexOf(n.family) : 0);

    // Ordre dans chaque colonne, puis échelle commune (les flux se conservent d'une colonne à l'autre)
    const cols = [0, 1, 2].map((c) => nodes.map((n, i) => ({ n, i })).filter((x) => x.n.col === c)
      .sort((a, b) => (c === 0 ? famRank(a.n) - famRank(b.n) : (a.n.other ? 1 : 0) - (b.n.other ? 1 : 0) || b.n.value - a.n.value)));
    const pad = (c: number) => (c === 2 ? 1.25 : 2.2);
    const k = Math.min(...cols.map((col, c) => (HT - pad(c) * (col.length - 1)) / Math.max(1, col.reduce((s, x) => s + x.n.value, 0))));
    const pos: { top: number; h: number }[] = [];
    cols.forEach((col, c) => {
      const tot = col.reduce((s, x) => s + x.n.value * k, 0) + pad(c) * (col.length - 1);
      let y = tot / 2;
      col.forEach((x) => { const h = x.n.value * k; pos[x.i] = { top: y, h }; y -= h + pad(c); });
    });

    // Piles de départ et d'arrivée : on range les flux pour limiter les croisements
    const outOff = new Map<number, number>(), inOff = new Map<number, number>();
    const order = links.map((l, i) => ({ l, i }));
    const srcSorted = [...order].sort((a, b) => a.l.source - b.l.source || pos[b.l.target].top - pos[a.l.target].top || laneZ(a.l.family) - laneZ(b.l.family));
    const tgtSorted = [...order].sort((a, b) => a.l.target - b.l.target || pos[b.l.source].top - pos[a.l.source].top || laneZ(a.l.family) - laneZ(b.l.family));
    const y0 = new Map<number, number>(), y1 = new Map<number, number>();
    srcSorted.forEach(({ l, i }) => { const o = outOff.get(l.source) ?? 0; y0.set(i, pos[l.source].top - o); outOff.set(l.source, o + l.value * k); });
    tgtSorted.forEach(({ l, i }) => { const o = inOff.get(l.target) ?? 0; y1.set(i, pos[l.target].top - o); inOff.set(l.target, o + l.value * k); });

    links.forEach((l, i) => {
      const t = l.value * k;
      const a = nodes[l.source], b = nodes[l.target];
      const xa = X[a.col] + NODE_W / 2, xb = X[b.col] - NODE_W / 2;
      const ya = y0.get(i)!, yb = y1.get(i)!;
      const shape = new THREE.Shape();
      const pts: [number, number][] = [];
      for (let s = 0; s <= SEG; s++) {
        const u = s / SEG, e = u * u * (3 - 2 * u);
        pts.push([xa + (xb - xa) * u, ya + (yb - ya) * e]);
      }
      shape.moveTo(pts[0][0], pts[0][1]);
      pts.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
      [...pts].reverse().forEach(([x, y]) => shape.lineTo(x, y - Math.max(t, 0.05)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: RIBBON_D, bevelEnabled: false, curveSegments: 1, steps: 1 });
      // Les segments de longueur nulle donnent des normales nulles, donc des NaN dans l'éclairage que le bloom étale à tout l'écran
      const nrm = geo.attributes.normal.array as Float32Array;
      for (let j = 0; j < nrm.length; j += 3) if (Math.hypot(nrm[j], nrm[j + 1], nrm[j + 2]) < 1e-6) { nrm[j] = 0; nrm[j + 1] = 0; nrm[j + 2] = 1; }
      geo.translate(0, 0, laneZ(l.family) - RIBBON_D / 2);
      const c = new THREE.Color(this.opts.colors[l.family] ?? "#8d929c");
      const em = l.family === "ao" || l.family === "fi" ? 0.16 : 0.3;
      const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: em, roughness: 0.38, metalness: 0.15,
        transparent: true, opacity: 0.8, clippingPlanes: [this.clip], side: THREE.DoubleSide, depthWrite: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { kind: "link", i };
      this.world.add(mesh);
      this.links.push({ l, mesh, mat, em, cur: 1 });
    });

    nodes.forEach((n, i) => {
      const { top, h } = pos[i];
      const geo = new THREE.BoxGeometry(NODE_W, Math.max(h, 0.2), depth);
      const fam = n.col === 0 && n.family ? new THREE.Color(this.opts.colors[n.family]) : null;
      const mat = new THREE.MeshStandardMaterial({ color: fam ? fam.clone().multiplyScalar(0.55) : new THREE.Color("#1a2a45"), metalness: 0.55, roughness: 0.28,
        emissive: fam ?? new THREE.Color("#cc9f53"), emissiveIntensity: fam ? 0.35 : 0.06, transparent: true, opacity: 0.94 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(X[n.col], top - h / 2, 0);
      mesh.userData = { kind: "node", i };
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: "#cc9f53", transparent: true, opacity: 0.55 }));
      edge.position.copy(mesh.position);
      this.world.add(mesh, edge);
      const label = document.createElement("div");
      label.className = `sk__lab sk__lab--c${n.col}${n.other ? " is-other" : ""}`;
      const f = this.opts.formatLabel(n);
      label.innerHTML = `<span class="sk__lab-t"></span><span class="sk__lab-s"></span>`;
      (label.firstChild as HTMLElement).textContent = f.title;
      (label.lastChild as HTMLElement).textContent = f.sub;
      this.opts.labelLayer.appendChild(label);
      const ax = n.col === 0 ? X[0] - NODE_W / 2 - 1.6 : n.col === 2 ? X[2] + NODE_W / 2 + 1.6 : X[1];
      // Ancré sur la face avant du nœud, pour ne jamais chevaucher le volume en perspective
      const anchor = new THREE.Vector3(ax, n.col === 1 ? top + 1.2 : top - h / 2, depth / 2);
      this.nodes.push({ n, mesh, mat, edge, label, anchor, cur: 1, top, h });
      if (!this.opts.reduced) {
        mesh.scale.y = edge.scale.y = 0.001;
        gsap.to([mesh.scale, edge.scale], { y: 1, duration: 1.1, ease: "expo.out", delay: (first ? 0.2 : 0) + n.col * 0.25 + (i % 7) * 0.02 });
      }
    });

    // Titres de colonnes
    const colTitles = ["Famille de gestion", "Domiciliation du fonds", "Pays d'enregistrement"];
    cols.forEach((col, c) => {
      const tot = col.reduce((s, x) => s + x.n.value * k, 0) + pad(c) * (col.length - 1);
      const el = document.createElement("div");
      el.className = `sk__head sk__head--c${c}`;
      el.textContent = colTitles[c];
      this.opts.labelLayer.appendChild(el);
      this.heads.push({ el, pos: new THREE.Vector3(X[c], tot / 2 + 5.5, 0) });
    });

    if (this.opts.reduced) this.clip.constant = 100;
    else {
      this.clip.constant = X[0];
      gsap.to(this.clip, { constant: X[2] + 6, duration: first ? 2.4 : 1.4, ease: "power2.inOut", delay: first ? 0.55 : 0.2 });
    }
    this.applyFocus();
  }

  // ---------------------------------------------------------------- API
  setData(d: SkData) {
    this.data = d;
    gsap.killTweensOf(this.clip);
    this.build(false);
  }

  /** Met en valeur un nœud (depuis la légende ou le clavier). */
  focus(id: string | null) {
    this.focusId = id;
    this.applyFocus();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    gsap.killTweensOf(this.clip);
    this.nodes.forEach((o) => gsap.killTweensOf([o.mesh.scale, o.edge.scale]));
    this.clear();
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
    this.opts.labelLayer.innerHTML = "";
  }

  // ---------------------------------------------------------------- mise en valeur
  /** Flux reliés à un nœud : pour une famille, tout son parcours ; pour un pays, les flux qui y mènent et leur amont. */
  private related(ni: number): Set<number> {
    const { nodes, links } = this.data;
    const n = nodes[ni];
    const out = new Set<number>();
    if (n.col === 0) links.forEach((l, i) => { if (l.family === n.family) out.add(i); });
    else if (n.col === 1) links.forEach((l, i) => { if (l.source === ni || l.target === ni) out.add(i); });
    else {
      const pairs = new Set<string>();
      links.forEach((l, i) => { if (l.target === ni) { out.add(i); pairs.add(`${l.family}|${l.source}`); } });
      links.forEach((l, i) => { if (nodes[l.source].col === 0 && pairs.has(`${l.family}|${l.target}`)) out.add(i); });
    }
    return out;
  }

  private applyFocus() {
    let on: Set<number> | null = null;
    let nodeOn: Set<number> | null = null;
    const fi = this.focusId ? this.data.nodes.findIndex((n) => n.id === this.focusId) : -1;
    const src = this.hot ?? (fi >= 0 ? { kind: "node" as const, i: fi } : null);
    if (src?.kind === "node") on = this.related(src.i);
    else if (src?.kind === "link") on = new Set([src.i]);
    if (on) {
      nodeOn = new Set<number>();
      on.forEach((i) => { nodeOn!.add(this.data.links[i].source); nodeOn!.add(this.data.links[i].target); });
      if (src?.kind === "node") nodeOn.add(src.i);
    }
    this.links.forEach((o, i) => { o.cur = on ? (on.has(i) ? 1.35 : 0.12) : 1; });
    this.nodes.forEach((o, i) => { o.cur = nodeOn ? (nodeOn.has(i) ? 1.3 : 0.35) : 1; });
  }

  // ---------------------------------------------------------------- boucle
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.visible || document.hidden) return;
    const k = this.opts.reduced ? 1 : 1 - Math.pow(0.002, dt);
    // Parallaxe douce au pointeur
    this.par.x += (this.par.tx - this.par.x) * k * 0.6;
    this.par.y += (this.par.ty - this.par.y) * k * 0.6;
    const az = 0.2 + this.par.x * 0.16, el = 0.1 + this.par.y * 0.06;
    this.camera.position.set(Math.sin(az) * this.dist * Math.cos(el), Math.sin(el) * this.dist + 2, Math.cos(az) * this.dist * Math.cos(el));
    this.camera.lookAt(0, 0, 0);
    for (const o of this.links) {
      const tOp = Math.min(0.94, 0.8 * o.cur), tEm = o.em * (o.cur > 1 ? 2.4 : o.cur);
      o.mat.opacity += (tOp - o.mat.opacity) * k;
      o.mat.emissiveIntensity += (tEm - o.mat.emissiveIntensity) * k;
    }
    for (const o of this.nodes) {
      const tOp = o.cur < 1 ? 0.45 : 0.94;
      o.mat.opacity += (tOp - o.mat.opacity) * k;
      (o.edge.material as THREE.LineBasicMaterial).opacity = 0.55 * Math.min(1.4, o.cur);
      o.label.style.opacity = String(Math.min(1, o.cur < 1 ? 0.35 : 1));
    }
    this.pick();
    this.composer.render();
    this.placeLabels();
  };

  private project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.host.clientWidth, y: (-p.y * 0.5 + 0.5) * this.host.clientHeight };
  }

  private placeLabels() {
    for (const o of this.nodes) {
      const p = this.project(o.anchor);
      o.label.style.transform = `translate(${p.x}px, ${p.y}px) ${o.n.col === 0 ? "translate(-100%, -50%)" : o.n.col === 2 ? "translate(0, -50%)" : "translate(-50%, -100%)"}`;
    }
    for (const h of this.heads) {
      const p = this.project(h.pos);
      h.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    }
    if (this.hot) {
      const { nodes, links } = this.data;
      if (this.hot.kind === "node") {
        const o = this.nodes[this.hot.i];
        const p = this.project(new THREE.Vector3(X[o.n.col], o.top, 0));
        this.opts.onHover({ kind: "node", node: o.n }, p.x, p.y);
      } else {
        const l = links[this.hot.i];
        const box = new THREE.Box3().setFromObject(this.links[this.hot.i].mesh);
        const c = box.getCenter(new THREE.Vector3());
        const p = this.project(new THREE.Vector3(c.x, box.max.y, c.z));
        this.opts.onHover({ kind: "link", link: l, from: nodes[l.source], to: nodes[l.target] }, p.x, p.y);
      }
    }
  }

  private pick() {
    if (this.pointer.x < -2) return;
    this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObjects([...this.nodes.map((o) => o.mesh), ...this.links.map((o) => o.mesh)], false)
      .filter((h) => h.object.userData.kind === "node" || h.point.x <= this.clip.constant);
    const u = hits[0]?.object.userData as { kind: "node" | "link"; i: number } | undefined;
    const next = u ? { kind: u.kind, i: u.i } : null;
    if (next?.kind !== this.hot?.kind || next?.i !== this.hot?.i) {
      this.hot = next;
      this.renderer.domElement.style.cursor = next?.kind === "node" ? "pointer" : "default";
      if (!next) this.opts.onHover(null, 0, 0);
      this.applyFocus();
    }
  }

  private fit() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const needW = (X[2] - X[0]) + (w < 700 ? 30 : 58), needH = HT + 22;
    this.dist = Math.max(needW / (2 * t * (w / Math.max(h, 1))), needH / (2 * t)) + 8;
  }

  private onMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (!this.opts.reduced) { this.par.tx = this.pointer.x; this.par.ty = this.pointer.y; }
  };
  private onLeave = () => { this.pointer.set(-9, -9); this.par.tx = this.par.ty = 0; if (this.hot) { this.hot = null; this.opts.onHover(null, 0, 0); this.applyFocus(); } };
  private onDown = (e: PointerEvent) => { this.downAt = { x: e.clientX, y: e.clientY }; };
  private onUp = (e: PointerEvent) => {
    if (!this.downAt) return;
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    this.downAt = null;
    if (moved < 5 && this.hot?.kind === "node") this.opts.onSelect(this.data.nodes[this.hot.i]);
  };

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.fit();
  }
}
