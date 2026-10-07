/**
 * Éléments du film « Jasmine » : le logo qui se plie, le fil d'or, la caméra virtuelle posée sur une prise de
 * l'application, la typographie cinétique calée sur les temps, l'onde de clic, la mention « données fictives ».
 */
import type React from "react";
import { staticFile, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import { COLOR, EASE, FONT, LAYOUT, NUMERIC, TYPE, VIDEO } from "../theme";
import { mix, prog } from "../lib/anim";
import { HEART, PETALS } from "./logo";

type P = [number, number];
const lerpP = (a: P, b: P, t: number): P => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
const pts = (a: P[]) => a.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");

// ------------------------------------------------------------------ le logo
/**
 * Le jasmin en origami. Pour chaque pétale : `fly` 0 → 1 (il arrive de loin en tournant), `fold` 0 → 1 (la face sombre
 * se déplie depuis l'arête centrale). `heart` 0 → 1 : le cœur s'allume.
 */
export const Mark: React.FC<{ size: number; fly: number[]; fold: number[]; heart: number; glow?: number; style?: React.CSSProperties }> = ({ size, fly, fold, heart, glow = 1, style }) => (
  <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: "visible", filter: `drop-shadow(0 0 ${size * 0.06 * glow}px rgba(220,179,109,${0.45 * glow}))`, ...style }}>
    {PETALS.map((p, i) => {
      const f = fly[i] ?? 1;
      const k = fold[i] ?? 1;
      if (f <= 0) return null;
      const tip = p.light[2];
      const dir: P = [tip[0] - 50, tip[1] - 50];
      const d = Math.hypot(dir[0], dir[1]) || 1;
      const dist = (1 - f) * 260;
      const dx = (dir[0] / d) * dist, dy = (dir[1] / d) * dist;
      const rot = (1 - f) * (i % 2 ? 140 : -140);
      // face pliée : ses deux sommets extérieurs partent de l'arête centrale (base → tip)
      const [b, mid, tp, right] = p.dark as P[];
      const dark: P[] = [b, mid, tp, lerpP(lerpP(b, tp, 0.55), right, k)];
      const light = p.light as P[];
      const lightOpen: P[] = [light[0], lerpP(lerpP(light[0], light[2], 0.5), light[1], Math.max(k, 0.35)), light[2], light[3]];
      return (
        <g key={i} transform={`translate(${dx.toFixed(2)} ${dy.toFixed(2)}) rotate(${rot.toFixed(2)} 50 50)`} opacity={Math.min(1, f * 1.6)}>
          <polygon points={pts(lightOpen)} fill="#e8c788" />
          <polygon points={pts(dark)} fill="#b0823c" />
        </g>
      );
    })}
    <polygon points={pts(HEART as P[])} fill="#fff3d6" opacity={heart} transform={`rotate(${(1 - heart) * 72} 50 50)`} />
  </svg>
);

/** Le logo complet, déplié (pour les écrans et la signature). */
export const MarkStatic: React.FC<{ size: number; glow?: number }> = ({ size, glow }) => (
  <Mark size={size} fly={[1, 1, 1, 1, 1]} fold={[1, 1, 1, 1, 1]} heart={1} glow={glow} />
);

// ------------------------------------------------------------------ le fil d'or
/** Filet d'or horizontal de x0 à x1 (px), plus lumineux au centre. */
export const Thread: React.FC<{ x0: number; x1: number; y: number; opacity?: number; thick?: number }> = ({ x0, x1, y, opacity = 1, thick = LAYOUT.hairline }) => {
  const w = Math.max(0, x1 - x0);
  if (w < 0.5 || opacity <= 0) return null;
  return (
    <div style={{
      position: "absolute", left: x0, width: w, top: y - thick / 2, height: thick, opacity,
      background: `linear-gradient(90deg, rgba(204,159,83,0.1), ${COLOR.gold} 25%, ${COLOR.goldGlow} 50%, ${COLOR.gold} 75%, rgba(204,159,83,0.1))`,
      boxShadow: "0 0 14px rgba(220,179,109,0.4)",
    }} />
  );
};

// ------------------------------------------------------------------ typographie cinétique
/**
 * Un mot qui « claque » sur un temps : il monte depuis un masque (dur. 7 images), reste, puis sort vers le haut.
 * `at` / `out` en images locales.
 */
export const Slam: React.FC<{ at: number; out?: number; children: React.ReactNode; style?: React.CSSProperties; dur?: number; outDur?: number; from?: "below" | "above" }> = ({ at, out, children, style, dur = 8, outDur = 6, from = "below" }) => {
  const frame = useCurrentFrame();
  if (frame < at - 1 || (out != null && frame > out + outDur + 1)) return null;
  const i = prog(frame, at, dur, EASE.signature);
  const o = out == null ? 0 : prog(frame, out, outDur, EASE.exit);
  const s = from === "below" ? 1 : -1;
  return (
    <div style={{ overflow: "hidden", display: "inline-block", verticalAlign: "bottom", paddingBottom: "0.08em", ...style }}>
      <div style={{ transform: `translate3d(0, ${s * (1 - i) * 105 - s * o * 105}%, 0)`, opacity: Math.min(1, i * 2) }}>{children}</div>
    </div>
  );
};

/** Lettres qui tombent une à une (tous les `every` images) — pour le nom « Jasmine ». */
export const Letters: React.FC<{ text: string; at: number; every?: number; style?: React.CSSProperties; gold?: number[] }> = ({ text, at, every = 4, style, gold = [] }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", ...style }}>
      {text.split("").map((c, i) => {
        const t = prog(frame, at + i * every, 14, EASE.signature);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: "0.06em" }}>
            <span style={{ display: "inline-block", transform: `translate3d(0, ${(1 - t) * 110}%, 0) rotate(${(1 - t) * 8}deg)`, color: gold.includes(i) ? COLOR.goldInk : undefined }}>{c === " " ? " " : c}</span>
          </span>
        );
      })}
    </div>
  );
};

/** Surtitre + titre, en bas à gauche, qui se coupent nets sur les temps. */
export const Caption: React.FC<{ eyebrow?: string; title: React.ReactNode; at: number; out?: number; x?: number; y?: number; size?: number; align?: "left" | "right" }> = ({ eyebrow, title, at, out, x = LAYOUT.safeX, y = 760, size = 96, align = "left" }) => (
  <div style={{ position: "absolute", left: align === "left" ? x : undefined, right: align === "right" ? x : undefined, top: y, textAlign: align }}>
    {eyebrow && <div><Slam at={at} out={out} style={{ ...TYPE.eyebrow, color: COLOR.goldInk, fontSize: 24, marginBottom: 18 }}>{eyebrow}</Slam></div>}
    <div><Slam at={at + 2} out={out} style={{ ...TYPE.title, fontSize: size, color: COLOR.ink, textShadow: "0 6px 50px rgba(0,0,0,0.9)" }}>{title}</Slam></div>
  </div>
);

// ------------------------------------------------------------------ la caméra virtuelle sur une prise
export type Crop = { x: number; y: number; w: number };
export type CamKey = { f: number; c: Crop; cut?: boolean };
/** Cadre de la prise à l'image f : interpolation douce entre deux clés, ou coupe nette si la clé est `cut`. */
export function cropAt(keys: CamKey[], f: number): Crop {
  if (f <= keys[0].f) return keys[0].c;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (f < b.f) {
      if (b.cut) return a.c;
      const t = prog(f, a.f, b.f - a.f, EASE.premium);
      return { x: mix(a.c.x, b.c.x, t), y: mix(a.c.y, b.c.y, t), w: mix(a.c.w, b.c.w, t) };
    }
  }
  return keys[keys.length - 1].c;
}

/**
 * Une prise de l'application vue par la caméra : `crop` (rectangle 16:9 de la prise, en px) remplit le panneau
 * (`w` × `h`, centré en `cx`, `cy`). `tilt` : transformation 3D du panneau. Filet d'or et ombre portée.
 */
export const AppCam: React.FC<{
  name: string; trim?: number; crop: Crop; w?: number; h?: number; cx?: number; cy?: number; tilt?: string; frameGlow?: number; opacity?: number; children?: React.ReactNode;
}> = ({ name, trim = 0, crop, w = VIDEO.width, h = VIDEO.height, cx = VIDEO.width / 2, cy = VIDEO.height / 2, tilt, frameGlow = 0, opacity = 1, children }) => {
  const s = w / crop.w;
  const full = w === VIDEO.width && h === VIDEO.height && !tilt;
  return (
    <div style={{ position: "absolute", left: cx - w / 2, top: cy - h / 2, width: w, height: h, transform: tilt, transformStyle: "preserve-3d", opacity }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: COLOR.paper,
        border: full ? undefined : `1.5px solid rgba(220,179,109,${0.3 + 0.5 * frameGlow})`,
        boxShadow: full ? undefined : `0 60px 140px -30px rgba(0,0,0,0.95), 0 0 ${70 * frameGlow}px rgba(204,159,83,${0.25 * frameGlow})` }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: VIDEO.width, height: VIDEO.height, transformOrigin: "0 0",
          transform: `scale(${s}) translate(${-crop.x}px, ${-crop.y}px)` }}>
          <Video src={staticFile(`rec/${name}.mp4`)} muted trimBefore={trim}
            style={{ width: VIDEO.width, height: VIDEO.height, display: "block" }} />
        </div>
        {children}
      </div>
    </div>
  );
};

/** Onde de clic : un carré d'or qui s'ouvre et s'éteint (angles vifs). Coordonnées dans le panneau. */
export const ClickRing: React.FC<{ at: number; x: number; y: number; size?: number }> = ({ at, x, y, size = 90 }) => {
  const frame = useCurrentFrame();
  const t = prog(frame, at, 16, EASE.signature);
  if (frame < at || t >= 1) return null;
  const s = size * (0.3 + 0.9 * t);
  return (
    <div style={{ position: "absolute", left: x - s / 2, top: y - s / 2, width: s, height: s, border: `3px solid ${COLOR.goldGlow}`,
      transform: `rotate(${45 * t}deg)`, opacity: 1 - t, boxShadow: "0 0 30px rgba(220,179,109,0.6)" }} />
  );
};

/** Éclair d'or (écran) sur un temps fort. */
export const Flash: React.FC<{ at: number; peak?: number; dur?: number }> = ({ at, peak = 0.8, dur = 12 }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > dur) return null;
  const o = peak * (t < 2 ? t / 2 : 1 - (t - 2) / (dur - 2));
  return <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, #fff6e0 0%, #f0cf8a 45%, rgba(204,159,83,0.5) 100%)", opacity: o, mixBlendMode: "screen" }} />;
};

/** Balayage d'or vertical (coupe) : de `at` à `at + dur`, le filet traverse l'écran de gauche à droite. */
export const Sweep: React.FC<{ at: number; dur?: number }> = ({ at, dur = 10 }) => {
  const frame = useCurrentFrame();
  const t = prog(frame, at, dur, EASE.premium);
  if (frame < at || t >= 1) return null;
  return (
    <div style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${t * 100}% - 2px)`, width: 4, background: COLOR.goldGlow,
      boxShadow: "0 0 30px 8px rgba(220,179,109,0.5), 0 0 120px 30px rgba(204,159,83,0.2)" }} />
  );
};

/** Mention de source, en bas à gauche. */
export const NOTE = "Images de l'application · jeu de données fictif";
export const Note: React.FC<{ opacity?: number; children?: React.ReactNode }> = ({ opacity = 1, children = NOTE }) => (
  <div style={{ position: "absolute", left: LAYOUT.safeX, bottom: 46, display: "flex", alignItems: "center", gap: 12, opacity: 0.92 * opacity }}>
    <span style={{ width: 9, height: 9, border: `1.5px solid ${COLOR.ink3}` }} />
    <span style={{ ...TYPE.tick, fontSize: 20, color: COLOR.ink3, letterSpacing: "0.04em", textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}>{children}</span>
  </div>
);

/** Repère de chapitre en haut à gauche : « 01 — Chercher », avec le petit logo. */
export const Chapter: React.FC<{ n: string; label: string; at: number; out?: number }> = ({ n, label, at, out }) => {
  const frame = useCurrentFrame();
  const i = prog(frame, at, 10);
  const o = out == null ? 0 : prog(frame, out, 8, EASE.exit);
  return (
    <div style={{ position: "absolute", left: LAYOUT.safeX, top: 64, display: "flex", alignItems: "center", gap: 16, opacity: i * (1 - o) }}>
      <MarkStatic size={34} glow={0.4} />
      <span style={{ ...TYPE.eyebrow, fontSize: 21, color: COLOR.goldInk, ...NUMERIC }}>{n}</span>
      <span style={{ width: 36 * i, height: 1.5, background: COLOR.line2 }} />
      <span style={{ ...TYPE.eyebrow, fontSize: 21, color: COLOR.ink2 }}>{label}</span>
    </div>
  );
};

export const SERIF = FONT.serif;

/** Dégradé bas pour la lisibilité des légendes posées sur l'application. */
export const Shade: React.FC<{ on?: boolean; h?: number }> = ({ on = true, h = 380 }) => (on
  ? <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, background: "linear-gradient(to top, rgba(6,11,21,0.97), rgba(6,11,21,0.85) 45%, transparent)" }} />
  : null);
