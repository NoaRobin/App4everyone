/**
 * Clavier 3D (AZERTY) qui s'anime au rythme de la frappe.
 * Chaque touche frappée s'enfonce et envoie une onde lumineuse sur le clavier,
 * dans la couleur de la famille du meilleur résultat de recherche.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import gsap from "gsap";

/** Horloge minimale (remplace THREE.Clock, dépréciée). */
class Tick {
  private last = performance.now();
  elapsedTime = 0;
  getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; this.elapsedTime += d; return d; }
}

type KeyDef = { code: string; label: string; sub?: string; w?: number; type?: string };
const R = (defs: (KeyDef | [string, string, string?, number?])[]) =>
  defs.map((d) => (Array.isArray(d) ? { code: d[0], label: d[1], sub: d[2], w: d[3] } : d));

export const LAYOUT: KeyDef[][] = [
  R([["Backquote", "²"], ["Digit1", "1", "&"], ["Digit2", "2", "é"], ["Digit3", "3", '"'], ["Digit4", "4", "'"], ["Digit5", "5", "("], ["Digit6", "6", "-"],
    ["Digit7", "7", "è"], ["Digit8", "8", "_"], ["Digit9", "9", "ç"], ["Digit0", "0", "à"], ["Minus", "°", ")"], ["Equal", "+", "="], ["Backspace", "⌫", undefined, 2]]),
  R([["Tab", "⇥", undefined, 1.5], ["KeyQ", "A"], ["KeyW", "Z"], ["KeyE", "E"], ["KeyR", "R"], ["KeyT", "T"], ["KeyY", "Y"], ["KeyU", "U"], ["KeyI", "I"],
    ["KeyO", "O"], ["KeyP", "P"], ["BracketLeft", "¨", "^"], ["BracketRight", "£", "$"], ["Enter", "↵", undefined, 1.5]]),
  R([["CapsLock", "⇪", undefined, 1.75], ["KeyA", "Q"], ["KeyS", "S"], ["KeyD", "D"], ["KeyF", "F"], ["KeyG", "G"], ["KeyH", "H"], ["KeyJ", "J"], ["KeyK", "K"],
    ["KeyL", "L"], ["Semicolon", "M"], ["Quote", "%", "ù"], ["Backslash", "µ", "*"], ["NumpadEnter", "", undefined, 1.25]]),
  R([["ShiftLeft", "⇧", undefined, 1.25], ["IntlBackslash", ">", "<"], ["KeyZ", "W"], ["KeyX", "X"], ["KeyC", "C"], ["KeyV", "V"], ["KeyB", "B"], ["KeyN", "N"],
    ["KeyM", "?", ","], ["Comma", ".", ";"], ["Period", "/", ":"], ["Slash", "§", "!"], ["ShiftRight", "⇧", undefined, 2.75]]),
  R([["ControlLeft", "ctrl", undefined, 1.5], ["AltLeft", "alt", undefined, 1.5], ["Space", "", undefined, 8.5], ["AltRight", "alt gr", undefined, 1.5], ["ControlRight", "ctrl", undefined, 2]]),
];

const U = 1.9;      // pas d'une touche
const GAP = 0.2;
const KEY_H = 0.62;

type Key = { def: KeyDef; group: THREE.Group; cap: THREE.Mesh; legendMat: THREE.MeshBasicMaterial; capMat: THREE.MeshStandardMaterial; x: number; z: number; glow: number };

function legendTexture(label: string, sub: string | undefined, w: number): THREE.CanvasTexture {
  const px = 160;
  const c = document.createElement("canvas");
  c.width = Math.round(px * w); c.height = px;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = "#f3ead7";
  const long = label.length > 2;
  g.font = long ? `500 ${px * 0.22}px "Inter Tight Variable", "Inter Tight", sans-serif` : `400 ${px * 0.5}px "Instrument Serif", Georgia, serif`;
  g.textBaseline = "middle";
  if (sub) {
    g.textAlign = "left";
    g.fillText(label, px * 0.2, px * 0.34);
    g.globalAlpha = 0.6;
    g.font = `400 ${px * 0.3}px "Instrument Serif", Georgia, serif`;
    g.fillText(sub, px * 0.22, px * 0.72);
  } else {
    g.textAlign = long || w > 1.3 ? "left" : "center";
    g.fillText(label, long || w > 1.3 ? px * 0.2 : c.width / 2, px * (long ? 0.7 : 0.52));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class KeyboardScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private board = new THREE.Group();
  private keys = new Map<string, Key>();
  private list: Key[] = [];
  private raf = 0;
  private ro: ResizeObserver;
  private disposables: { dispose: () => void }[] = [];
  private accent = new THREE.Color("#c8a15a");
  private pointer = { x: 0, y: 0 };
  private tilt = { x: 0, y: 0 };
  private ray = new THREE.Raycaster();
  private clock = new Tick();
  private lastWave = 0;

  constructor(private host: HTMLElement, private opts: { reduced: boolean; onVirtualKey: (k: string) => void }) {
    const w = host.clientWidth, h = host.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(30, w / h, 1, 400);
    this.camera.position.set(0, 34, 30);
    this.camera.lookAt(0, -1.5, 1.5);

    this.scene.add(new THREE.HemisphereLight("#8fa2c8", "#05070c", 0.9));
    const key = new THREE.DirectionalLight("#fff3dd", 1.6);
    key.position.set(-12, 30, 18);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight("#6f8fd6", 0.9);
    rim.position.set(20, 10, -24);
    this.scene.add(rim);

    this.build();
    this.scene.add(this.board);
    this.fit();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.9, 0.5, 0.5);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    window.addEventListener("pointermove", this.onPointer);
    this.renderer.domElement.addEventListener("pointerdown", this.onClick);
    if (!opts.reduced) this.introAnim();
    this.loop();
  }

  private build() {
    const rows = LAYOUT;
    const rowW = (r: KeyDef[]) => r.reduce((s, k) => s + (k.w ?? 1), 0) * U;
    const maxW = Math.max(...rows.map(rowW));
    const depth = rows.length * U;
    // Châssis
    const chassisGeo = new RoundedBoxGeometry(maxW + 1.6, 0.9, depth + 1.6, 4, 0.55);
    const chassisMat = new THREE.MeshStandardMaterial({ color: "#0c1321", roughness: 0.35, metalness: 0.7 });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = -0.45;
    this.board.add(chassis);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(maxW + 1.62, 0.02, depth + 1.62)),
      new THREE.LineBasicMaterial({ color: "#b8955a", transparent: true, opacity: 0.55 }));
    edge.position.y = 0.01;
    this.board.add(edge);
    this.disposables.push(chassisGeo, chassisMat, edge.geometry, edge.material as THREE.Material);
    // Halo au sol
    const haloCanvas = document.createElement("canvas");
    haloCanvas.width = haloCanvas.height = 256;
    const hg = haloCanvas.getContext("2d")!;
    const grad = hg.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, "rgba(200,161,90,.16)"); grad.addColorStop(1, "rgba(200,161,90,0)");
    hg.fillStyle = grad; hg.fillRect(0, 0, 256, 256);
    const haloTex = new THREE.CanvasTexture(haloCanvas);
    const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(maxW * 1.35, depth * 1.9), haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.95;
    this.board.add(halo);
    this.disposables.push(haloTex, haloMat, halo.geometry);

    const geoCache = new Map<number, THREE.BufferGeometry>();
    rows.forEach((row, ri) => {
      let x = -rowW(row) / 2;
      const z = -depth / 2 + ri * U + U / 2;
      row.forEach((def) => {
        const w = (def.w ?? 1);
        const kw = w * U - GAP;
        let geo = geoCache.get(w);
        if (!geo) { geo = new RoundedBoxGeometry(kw, KEY_H, U - GAP, 3, 0.2); geoCache.set(w, geo); this.disposables.push(geo); }
        const capMat = new THREE.MeshStandardMaterial({ color: "#1b2536", roughness: 0.42, metalness: 0.35, emissive: new THREE.Color("#000000") });
        const cap = new THREE.Mesh(geo, capMat);
        cap.position.y = KEY_H / 2;
        const group = new THREE.Group();
        group.position.set(x + (w * U) / 2, 0, z);
        group.add(cap);
        let legendMat: THREE.MeshBasicMaterial;
        if (def.label) {
          const tex = legendTexture(def.label, def.sub, w);
          legendMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.82, depthWrite: false, toneMapped: false });
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(kw * 0.92, (U - GAP) * 0.92), legendMat);
          plane.rotation.x = -Math.PI / 2;
          plane.position.y = KEY_H + 0.012;
          group.add(plane);
          this.disposables.push(tex, plane.geometry);
        } else legendMat = new THREE.MeshBasicMaterial({ visible: false });
        this.disposables.push(capMat, legendMat);
        cap.userData.code = def.code;
        this.board.add(group);
        const k: Key = { def, group, cap, legendMat, capMat, x: group.position.x, z, glow: 0 };
        this.keys.set(def.code, k);
        this.list.push(k);
        x += w * U;
      });
    });
  }

  private fit() {
    // Cadre le clavier dans la largeur disponible
    const aspect = this.host.clientWidth / Math.max(1, this.host.clientHeight);
    const dist = aspect < 1 ? 58 : aspect < 1.5 ? 44 : 38;
    this.camera.position.set(0, dist * 0.82, dist * 0.62);
    this.camera.lookAt(0, -1, 1.2);
  }

  private introAnim() {
    this.list.forEach((k) => {
      k.group.position.y = 6;
      k.group.scale.setScalar(0.001);
      const d = Math.hypot(k.x, k.z);
      gsap.to(k.group.position, { y: 0, duration: 1.1, delay: 0.15 + d * 0.022, ease: "expo.out" });
      gsap.to(k.group.scale, { x: 1, y: 1, z: 1, duration: 0.9, delay: 0.15 + d * 0.022, ease: "expo.out" });
    });
  }

  setAccent(hex: string) {
    this.accent.set(hex);
  }

  /** Frappe d'une touche physique ou virtuelle. */
  press(code: string) {
    const k = this.keys.get(code) ?? (code === "NumpadEnter" ? this.keys.get("Enter") : undefined);
    if (!k) return;
    const now = performance.now();
    if (this.opts.reduced) {
      k.glow = 1;
      return;
    }
    gsap.killTweensOf(k.cap.position);
    gsap.fromTo(k.cap.position, { y: KEY_H / 2 - 0.34 }, { y: KEY_H / 2, duration: 0.55, ease: "elastic.out(1, 0.45)" });
    k.glow = 1.6;
    // Onde lumineuse depuis la touche frappée
    if (now - this.lastWave > 40) {
      this.lastWave = now;
      this.list.forEach((o) => {
        if (o === k) return;
        const d = Math.hypot(o.x - k.x, o.z - k.z);
        if (d > 16) return;
        gsap.delayedCall(d * 0.018, () => {
          o.glow = Math.max(o.glow, 0.55 * (1 - d / 16));
          gsap.fromTo(o.cap.position, { y: KEY_H / 2 - 0.08 * (1 - d / 16) }, { y: KEY_H / 2, duration: 0.45, ease: "sine.out", overwrite: false });
        });
      });
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener("pointermove", this.onPointer);
    this.renderer.domElement.removeEventListener("pointerdown", this.onClick);
    this.list.forEach((k) => { gsap.killTweensOf(k.cap.position); gsap.killTweensOf(k.group.position); gsap.killTweensOf(k.group.scale); });
    this.disposables.forEach((d) => d.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    if (!this.opts.reduced) {
      this.tilt.x += (this.pointer.y * 0.08 - this.tilt.x) * 0.06;
      this.tilt.y += (this.pointer.x * 0.12 - this.tilt.y) * 0.06;
      this.board.rotation.x = this.tilt.x;
      this.board.rotation.y = this.tilt.y;
    }
    const decay = Math.pow(0.02, dt);
    const base = new THREE.Color("#1b2536");
    this.list.forEach((k, i) => {
      // Respiration lumineuse au repos : une lente vague qui traverse le clavier
      const idle = this.opts.reduced ? 0 : 0.07 * Math.max(0, Math.sin(t * 0.9 - k.x * 0.16 - k.z * 0.05 + i * 0.0));
      k.glow *= decay;
      const g = Math.min(1.6, k.glow + idle);
      k.capMat.emissive.copy(this.accent).multiplyScalar(g * 0.9);
      k.capMat.color.copy(base).lerp(this.accent, Math.min(0.5, g * 0.35));
      k.legendMat.opacity = 0.78 + Math.min(0.22, g * 0.3);
    });
    this.composer.render();
  };

  private onPointer = (e: PointerEvent) => {
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };

  private onClick = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const hit = this.ray.intersectObjects(this.list.map((k) => k.cap), false)[0];
    if (!hit) return;
    e.preventDefault();
    const code = hit.object.userData.code as string;
    const k = this.keys.get(code)!;
    this.press(code);
    const d = k.def;
    if (code === "Backspace") this.opts.onVirtualKey("Backspace");
    else if (code === "Enter" || code === "NumpadEnter") this.opts.onVirtualKey("Enter");
    else if (code === "Space") this.opts.onVirtualKey(" ");
    else if (/^Key|^Semicolon$/.test(code)) this.opts.onVirtualKey(d.label.toLowerCase());
    else if (/^Digit/.test(code)) this.opts.onVirtualKey(d.label);
  };

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fit();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }
}
