/**
 * Calques 2D de la publicité : compteur d'extraction, ligne de saisie, commande tapée, sous-titres, éclair.
 */
import type React from "react";
import { useCurrentFrame } from "remotion";
import { COLOR, FONT, LAYOUT, NUMERIC, TYPE, VIDEO } from "../theme";
import { prog } from "../lib/anim";
import { BEAT, EXTRACT_S, extractElapsed, mmss, NO_SUBTITLE, VO } from "./timeline";

/** Le compteur de l'extraction qui tourne pendant tout le film. `big` 0 → 1 : du coin de l'écran au centre. */
export const ExtractHud: React.FC<{ frame: number; opacity?: number; big?: number }> = ({ frame, opacity = 1, big = 0 }) => {
  const s = extractElapsed(frame);
  const p = Math.min(1, s / EXTRACT_S);
  const blink = Math.floor(frame / 15) % 2 === 0;
  const scale = 1 + 1.35 * big;
  const w = 640;
  const x = (1 - big) * (VIDEO.width - LAYOUT.safeX - w) + big * (VIDEO.width / 2 - w / 2);
  const y = (1 - big) * (VIDEO.height - 44 - 46) + big * (VIDEO.height / 2 - 140);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, display: "flex", alignItems: "center", justifyContent: "space-between", opacity,
      padding: "10px 16px", background: "rgba(0,0,0,0.55)", border: `1px solid ${COLOR.line2}`, transform: `scale(${scale})`, transformOrigin: "50% 50%" }}>
      <span style={{ width: 10, height: 10, background: blink ? COLOR.down : "transparent", border: `1.5px solid ${COLOR.down}` }} />
      <span style={{ fontFamily: FONT.mono, fontSize: 20, color: COLOR.ink3, letterSpacing: "0.08em" }}>EXTRACTION JUMP</span>
      <span style={{ fontFamily: FONT.mono, fontSize: 22, color: COLOR.ink, ...NUMERIC }}>{mmss(s)} / 10:00</span>
      <span style={{ position: "relative", width: 120, height: 6, background: "rgba(214,209,202,0.14)" }}>
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${p * 100}%`, background: COLOR.ink2 }} />
      </span>
      <span style={{ fontFamily: FONT.mono, fontSize: 20, color: COLOR.ink3, ...NUMERIC, width: 48, textAlign: "right" }}>{Math.floor(p * 100)} %</span>
    </div>
  );
};

/** Ligne de saisie au-dessus du clavier : le texte tapé, un curseur d'or. */
export const TypeLine: React.FC<{ text: string; frame: number; opacity?: number; y?: number; size?: number }> = ({ text, frame, opacity = 1, y = 200, size = 92 }) => {
  const caret = Math.floor(frame / 14) % 2 === 0;
  return (
    <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: y, textAlign: "center", opacity }}>
      <span style={{ ...TYPE.display, fontSize: size, color: COLOR.ink }}>{text}</span>
      <span style={{ display: "inline-block", width: 4, height: size * 0.8, marginLeft: 10, verticalAlign: "-0.08em", background: COLOR.gold, opacity: caret ? 1 : 0.15 }} />
    </div>
  );
};

/** Commande tapée en haut à gauche, à chaque section de l'application. */
export const Command: React.FC<{ text: string; at: number; frame: number }> = ({ text, at, frame }) => {
  const n = Math.max(0, Math.min(text.length, Math.floor((frame - at) / 1.6)));
  const o = prog(frame, at, 6) * (1 - prog(frame, at + 70, 14));
  if (o <= 0) return null;
  return (
    <div style={{ position: "absolute", left: LAYOUT.safeX, top: 64, opacity: o, display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ fontFamily: FONT.mono, fontSize: 30, color: COLOR.goldInk }}>›</span>
      <span style={{ fontFamily: FONT.mono, fontSize: 30, color: COLOR.ink, letterSpacing: "0.02em" }}>{text.slice(0, n)}</span>
      {n >= text.length ? <span style={{ fontFamily: FONT.mono, fontSize: 26, color: COLOR.gold, padding: "2px 10px", border: `1px solid ${COLOR.gold}` }}>↵</span> : null}
    </div>
  );
};

/** Sous-titres sobres, centrés. */
export const Subtitles: React.FC<{ letterbox?: number }> = ({ letterbox = 0 }) => {
  const frame = useCurrentFrame();
  const l = VO.find((x) => !NO_SUBTITLE.has(x.id) && frame >= x.at - 2 && frame < x.at + x.frames + 8);
  if (!l) return null;
  const o = prog(frame, l.at - 2, 5) * (1 - prog(frame, l.at + l.frames + 3, 5));
  return (
    <div style={{ position: "absolute", left: 0, width: VIDEO.width, bottom: 112 + 40 * letterbox, display: "flex", justifyContent: "center", opacity: o }}>
      <span style={{ ...TYPE.label, fontSize: 34, fontWeight: 400, color: COLOR.ink, background: "rgba(0,0,0,0.62)", padding: "10px 22px", maxWidth: 1300, textAlign: "center", lineHeight: 1.35 }}>
        {l.text}
      </span>
    </div>
  );
};

/** Éclair d'or sur un temps fort. */
export const Flash: React.FC<{ at: number; frame: number; peak?: number; dur?: number }> = ({ at, frame, peak = 0.85, dur = 14 }) => {
  const t = frame - at;
  if (t < 0 || t > dur) return null;
  const o = peak * (t < 2 ? t / 2 : 1 - (t - 2) / (dur - 2));
  return <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 55%, #fff6e0 0%, #f0cf8a 45%, rgba(204,159,83,0.6) 100%)", opacity: o, mixBlendMode: "screen" }} />;
};

/** Petite impulsion d'échelle sur chaque temps (pour les plans de l'application). */
export const beatPunch = (frame: number, strength = 0.012) => 1 + strength * Math.exp(-(frame % (BEAT * 2)) / 5);
