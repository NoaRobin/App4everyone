/**
 * Accueil — nuée de particules d'or qui raconte l'histoire de la société de gestion.
 *
 * Chaque chapitre donne une figure à la nuée : galaxie (ouverture), noyau (les fondations), anneaux empilés (les
 * générations de fonds datés), deux sphères qui se séparent ou s'unissent (scission, rapprochement), quatre amas (les
 * quatre marques), planète (investissement durable, expansion), barres montantes (années record), ou le chiffre du
 * chapitre écrit en particules (« 96 % », « 50 Md€ »…). Les particules volent d'une figure à l'autre en décalé, sur une
 * trajectoire courbe ; la nuée respire au repos et suit légèrement la souris.
 *
 * Un seul tirage de points (aucun post-traitement) : fluide sur un poste modeste ; cadence réduite au repos.
 */
import * as THREE from "three";
import gsap from "gsap";
import { Quality } from "./quality";

export type Formation =
  | { kind: "nebula" | "core" | "rings" | "split" | "union" | "four" | "globe" | "bars" | "constellation" | "ribbon" }
  | { kind: "text"; text: string };

type Opts = { reduced: boolean };

const VS = /* glsl */ `
  attribute vec3 aFrom; attribute vec3 aTo; attribute vec4 aRand; attribute vec3 aColor;
  uniform float uT; uniform float uTime; uniform float uPixel; uniform float uFly;
  varying vec3 vColor; varying float vAlpha;
  float ease(float x) { return x * x * (3.0 - 2.0 * x); }
  void main() {
    float t = ease(clamp((uT - aRand.x * 0.35) / 0.65, 0.0, 1.0));
    vec3 p = mix(aFrom, aTo, t);
    // trajectoire courbe pendant le vol (déterministe, reproduite côté CPU)
    p += sin(t * 3.14159) * uFly * aRand.w * vec3(sin(aRand.z * 6.2832), cos(aRand.z * 6.2832), sin(aRand.y * 6.2832));
    // respiration au repos
    p += 0.07 * vec3(sin(uTime * 0.8 + aRand.z * 40.0), cos(uTime * 0.6 + aRand.y * 40.0), sin(uTime * 0.7 + aRand.x * 40.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (1.0 + aRand.y * 2.2) * uPixel * (34.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vAlpha = 0.55 + 0.45 * sin(uTime * (0.6 + aRand.w) + aRand.z * 30.0);
  }`;
const FS = /* glsl */ `
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * (0.8 + 1.2 * core), core * (0.35 + 0.65 * core) * vAlpha);
  }`;

const PALETTE = ["#cc9f53", "#e3c27f", "#f3dcaa", "#b8865a", "#d9b8b0", "#8fa3c4"].map((c) => new THREE.Color(c));
const WEIGHTS = [0.32, 0.24, 0.16, 0.12, 0.1, 0.06];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Point uniforme dans une boule (rayon r), ou sur sa sphère si shell. */
function ball(r: () => number, radius: number, shell = false): [number, number, number] {
  const u = r() * 2 - 1, th = r() * Math.PI * 2;
  const rr = shell ? radius : radius * Math.cbrt(r());
  const s = Math.sqrt(1 - u * u);
  return [rr * s * Math.cos(th), rr * u, rr * s * Math.sin(th)];
}

export class FlowScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  private group = new THREE.Group();
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private n: number;
  private from: Float32Array;
  private to: Float32Array;
  private rand: Float32Array;
  private raf = 0;
  private quality: Quality;
  private tween: gsap.core.Tween | null = null;
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private spin = { v: 0.05, target: 0.05 };
  private zoom = { z: 34, target: 34 };
  private visible = true;
  private ro: ResizeObserver;
  private current = "";
  private textCache = new Map<string, Float32Array>();

  constructor(private canvas: HTMLCanvasElement, private opts: Opts) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.quality = new Quality(() => this.resize());
    const narrow = window.innerWidth < 900;
    this.n = opts.reduced ? 3000 : narrow ? 4200 : this.quality.level === 2 ? 11000 : 7000;
    const n = this.n;
    this.from = new Float32Array(n * 3);
    this.to = new Float32Array(n * 3);
    this.rand = new Float32Array(n * 4);
    const color = new Float32Array(n * 3);
    const r = rng(1982);
    for (let i = 0; i < n; i++) {
      this.rand.set([r(), r(), r(), 0.4 + r()], i * 4);
      let x = r(), k = 0;
      while (k < WEIGHTS.length - 1 && x > WEIGHTS[k]) { x -= WEIGHTS[k]; k++; }
      const c = PALETTE[k];
      color.set([c.r, c.g, c.b], i * 3);
      const p = ball(r, 90, true);                                // départ : très loin, tout autour
      this.from.set(p, i * 3);
    }
    this.to.set(this.from);
    this.geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute("aFrom", new THREE.BufferAttribute(this.from, 3));
    this.geo.setAttribute("aTo", new THREE.BufferAttribute(this.to, 3));
    this.geo.setAttribute("aRand", new THREE.BufferAttribute(this.rand, 4));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 1 }, uTime: { value: 0 }, uPixel: { value: 1 }, uFly: { value: 3.2 } },
    });
    this.group.add(new THREE.Points(this.geo, this.mat));
    this.scene.add(this.group);
    this.camera.position.set(0, 0, this.zoom.z);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    this.resize();
    if (opts.reduced) this.render(0);
    else this.raf = requestAnimationFrame(this.loop);
  }

  /** Change de figure : chaque particule part de là où elle est (même en plein vol). */
  set(f: Formation, duration = 2.2, offsetX = 0) {
    const key = `${f.kind === "text" ? `text:${f.text}` : f.kind}@${offsetX}`;
    if (key === this.current) return;
    this.current = key;
    this.snapshot();
    this.to.set(this.build(f, offsetX));
    (this.geo.getAttribute("aFrom") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("aTo") as THREE.BufferAttribute).needsUpdate = true;
    this.spin.target = f.kind === "text" || f.kind === "bars" ? 0 : f.kind === "globe" || f.kind === "rings" ? 0.12 : 0.05;
    this.tween?.kill();
    if (this.opts.reduced) {
      this.mat.uniforms.uT.value = 1;
      this.render(0);
      return;
    }
    this.mat.uniforms.uT.value = 0;
    this.tween = gsap.to(this.mat.uniforms.uT, { value: 1, duration, ease: "power2.inOut" });
  }

  /** Recul ou approche de la caméra (ouverture : la nuée vient à nous). */
  setZoom(z: number) {
    if (!this.opts.reduced) this.zoom.target = z;
  }

  setVisible(v: boolean) {
    this.visible = v;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.tween?.kill();
    this.ro.disconnect();
    window.removeEventListener("pointermove", this.onPointer);
    this.geo.dispose();
    this.mat.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- interne
  private onPointer = (e: PointerEvent) => {
    this.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };

  /** Position courante de chaque particule (formule du shader, sans la respiration) → nouveau départ. */
  private snapshot() {
    const T = this.mat.uniforms.uT.value as number, fly = this.mat.uniforms.uFly.value as number;
    const f = this.from, t = this.to, r = this.rand;
    for (let i = 0; i < this.n; i++) {
      let k = Math.min(1, Math.max(0, (T - r[i * 4] * 0.35) / 0.65));
      k = k * k * (3 - 2 * k);
      const s = Math.sin(k * Math.PI) * fly * r[i * 4 + 3];
      const a = r[i * 4 + 2] * 6.2832, b = r[i * 4 + 1] * 6.2832;
      f[i * 3] = f[i * 3] + (t[i * 3] - f[i * 3]) * k + s * Math.sin(a);
      f[i * 3 + 1] = f[i * 3 + 1] + (t[i * 3 + 1] - f[i * 3 + 1]) * k + s * Math.cos(a);
      f[i * 3 + 2] = f[i * 3 + 2] + (t[i * 3 + 2] - f[i * 3 + 2]) * k + s * Math.sin(b);
    }
  }

  private build(f: Formation, ox: number): Float32Array {
    const n = this.n, out = new Float32Array(n * 3);
    const r = rng(f.kind.length * 7919 + (f.kind === "text" ? f.text.length * 31 : 0));
    const put = (i: number, x: number, y: number, z: number) => { out[i * 3] = x + ox; out[i * 3 + 1] = y; out[i * 3 + 2] = z; };
    switch (f.kind) {
      case "nebula": {                                             // galaxie spirale, inclinée
        for (let i = 0; i < n; i++) {
          const arm = i % 3, d = Math.pow(r(), 0.7) * 13, a = d * 0.42 + (arm * Math.PI * 2) / 3 + (r() - 0.5) * 0.7;
          const spread = 0.4 + d * 0.09;
          const x = Math.cos(a) * d + (r() - 0.5) * spread * 2, z = Math.sin(a) * d + (r() - 0.5) * spread * 2, y = (r() - 0.5) * (1.6 - d * 0.06);
          put(i, x, y * 0.9 + z * 0.28, z * 0.9 - y * 0.28);
        }
        break;
      }
      case "core": {                                               // noyau dense et son anneau
        for (let i = 0; i < n; i++) {
          if (i % 4 === 0) {
            const a = r() * Math.PI * 2, rr = 6.5 + (r() - 0.5) * 0.5;
            put(i, Math.cos(a) * rr, Math.sin(a) * rr * 0.28 + (r() - 0.5) * 0.15, Math.sin(a) * rr * 0.9);
          } else {
            const [x, y, z] = ball(r, 3.4 * Math.pow(r(), 0.8));
            put(i, x, y, z);
          }
        }
        break;
      }
      case "rings": {                                              // anneaux empilés : les générations de fonds datés
        const k = 8;
        for (let i = 0; i < n; i++) {
          const g = i % k, a = r() * Math.PI * 2, rr = 2.4 + g * 0.55 + (r() - 0.5) * 0.18;
          put(i, Math.cos(a) * rr, -6 + g * 1.7 + (r() - 0.5) * 0.12, Math.sin(a) * rr);
        }
        break;
      }
      case "split":
      case "union": {                                              // deux sphères : séparées, ou fondues en une
        const gap = f.kind === "split" ? 5.2 : 1.6;
        for (let i = 0; i < n; i++) {
          const side = i % 2 ? 1 : -1;
          const [x, y, z] = ball(r, 4.2, r() < 0.55);
          put(i, x + side * gap, y, z);
        }
        break;
      }
      case "four": {                                               // quatre amas : les quatre marques
        const c = [[-4.4, 3.4], [4.4, 3.4], [-4.4, -3.4], [4.4, -3.4]];
        for (let i = 0; i < n; i++) {
          const [cx, cy] = c[i % 4];
          const [x, y, z] = ball(r, 2.8 * Math.pow(r(), 0.6));
          put(i, cx + x, cy + y, z);
        }
        break;
      }
      case "globe": {                                              // planète en points, méridiens marqués
        for (let i = 0; i < n; i++) {
          if (i % 5 === 0) {
            const m = Math.floor(r() * 12) * (Math.PI / 6), v = r() * Math.PI;
            put(i, 6.6 * Math.sin(v) * Math.cos(m), 6.6 * Math.cos(v), 6.6 * Math.sin(v) * Math.sin(m));
          } else {
            const [x, y, z] = ball(r, 6.5 + (r() - 0.5) * 0.25, true);
            put(i, x, y, z);
          }
        }
        break;
      }
      case "bars": {                                               // encours 2023 → 2026 : 31, 38, 47, 50 Md€
        const h = [31, 38, 47, 50];
        for (let i = 0; i < n; i++) {
          const b = i % 4, H = (h[b] / 50) * 13;
          put(i, -6 + b * 4 + (r() - 0.5) * 2.4, -7 + r() * H, (r() - 0.5) * 2.4);
        }
        break;
      }
      case "constellation": {                                      // points reliés : les nouveaux chantiers
        const stars: [number, number, number][] = Array.from({ length: 14 }, () => ball(r, 8));
        for (let i = 0; i < n; i++) {
          const a = stars[i % stars.length], b = stars[(i * 7 + 3) % stars.length];
          const t = r() < 0.35 ? r() : 0, [jx, jy, jz] = ball(r, t ? 0.08 : 0.55 * Math.pow(r(), 2));
          put(i, a[0] + (b[0] - a[0]) * t + jx, a[1] + (b[1] - a[1]) * t + jy, a[2] + (b[2] - a[2]) * t + jz);
        }
        break;
      }
      case "ribbon": {                                             // ruban ondulant : le fil de l'histoire
        for (let i = 0; i < n; i++) {
          const u = r(), w = (r() - 0.5) * 2.2;
          const x = -13 + u * 26, y = Math.sin(u * 6.5) * 2.4 + w * 0.5, z = Math.cos(u * 4.2) * 2.2 + w;
          put(i, x, y, z);
        }
        break;
      }
      case "text": {
        const pts = this.textPoints(f.text);
        const m = pts.length / 2;
        for (let i = 0; i < n; i++) {
          if (!m) { put(i, 0, 0, 0); continue; }
          const k = Math.floor(r() * m);
          put(i, pts[k * 2] + (r() - 0.5) * 0.09, pts[k * 2 + 1] + (r() - 0.5) * 0.09, (r() - 0.5) * 0.8);
        }
        break;
      }
    }
    return out;
  }

  /** Échantillonne un texte rendu sur un canevas hors écran → coordonnées (largeur ≈ 15 unités). */
  private textPoints(text: string): Float32Array {
    const hit = this.textCache.get(text);
    if (hit) return hit;
    const W = 1200, H = 420;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return new Float32Array();
    const serif = getComputedStyle(document.documentElement).getPropertyValue("--serif").trim() || "Georgia, serif";
    let size = 300;
    ctx.font = `400 ${size}px ${serif}`;
    const w = ctx.measureText(text).width;
    if (w > W * 0.92) { size = Math.floor((size * W * 0.92) / w); ctx.font = `400 ${size}px ${serif}`; }
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, W / 2, H / 2);
    const data = ctx.getImageData(0, 0, W, H).data;
    const raw: number[] = [];
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    const step = 3;
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (data[(y * W + x) * 4 + 3] > 140) {
      raw.push(x, y);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    // Le texte occupe 15 unités de large (6,5 de haut au plus), centré
    const scale = Math.min(15 / Math.max(1, x1 - x0), 6.5 / Math.max(1, y1 - y0));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const arr = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i += 2) { arr[i] = (raw[i] - cx) * scale; arr[i + 1] = -(raw[i + 1] - cy) * scale; }
    this.textCache.set(text, arr);
    return arr;
  }

  private resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    const pr = this.quality.pixelRatio();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Écran étroit : la nuée recule pour tenir dans la largeur
    this.camera.fov = w < 700 ? 58 : 40;
    this.camera.updateProjectionMatrix();
    this.mat.uniforms.uPixel.value = pr * Math.min(1.4, Math.max(0.8, h / 900));
    if (this.opts.reduced) this.render(0);
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible) return;
    const busy = !!this.tween?.isActive();
    if (!this.quality.gate(now, busy)) return;
    this.render(now);
  };

  private render(now: number) {
    const t = now / 1000;
    this.mat.uniforms.uTime.value = t;
    const p = this.pointer;
    p.x += (p.tx - p.x) * 0.04;
    p.y += (p.ty - p.y) * 0.04;
    this.spin.v += (this.spin.target - this.spin.v) * 0.02;
    this.group.rotation.y += this.spin.v * 0.016;
    if (this.spin.target === 0) {                                           // texte : revient de face par le plus court
      const y = this.group.rotation.y;
      this.group.rotation.y = (((y + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      this.group.rotation.y *= 0.96;
    }
    this.group.rotation.x = p.y * 0.12;
    this.camera.position.x = p.x * 1.4;
    this.zoom.z += (this.zoom.target - this.zoom.z) * 0.06;
    this.camera.position.z = this.zoom.z;
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
