/**
 * Couches communes à toutes les scènes : fond, halo d'or qui respire, vignette, grain ; repère de chapitre et mention
 * « Données illustratives ». Ces couches ne sont jamais au premier plan.
 */
import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { AMBIENT, COLOR, LAYOUT, TYPE } from "../theme";
import { enter } from "../lib/anim";

export const Ambient: React.FC<{ glow?: number }> = ({ glow = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const breath = 0.5 + 0.5 * Math.sin((frame / fps / AMBIENT.breathSeconds) * Math.PI * 2);
  const g = AMBIENT.glowOpacity * glow * (0.75 + 0.25 * breath);
  return (
    <AbsoluteFill style={{ backgroundColor: COLOR.paper }}>
      <AbsoluteFill style={{ background: `radial-gradient(70% 60% at 72% 28%, rgba(204,159,83,${g}), transparent 65%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(60% 50% at 20% 85%, rgba(28,53,94,${0.35 * glow}), transparent 70%)` }} />
      <AbsoluteFill style={{ background: "radial-gradient(120% 120% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};

/** Grain de film : un bruit SVG dont la graine change à chaque image (très léger). */
export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: AMBIENT.grainOpacity * 2.2, mixBlendMode: "overlay", pointerEvents: "none" }}>
      <svg width="100%" height="100%">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 30} stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.2 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};

/** Repère de chapitre (en haut à droite) : « 03 — L'encours ». */
export const ChapterMark: React.FC<{ n: number; label: string; out?: number }> = ({ n, label, out }) => {
  const frame = useCurrentFrame();
  const a = enter(frame, 8, { dur: 18, out, dist: 10 });
  return (
    <div style={{ position: "absolute", top: LAYOUT.safeY - 30, right: LAYOUT.safeX, display: "flex", gap: 18, alignItems: "center", ...a }}>
      <span style={{ ...TYPE.eyebrow, fontSize: 22, color: COLOR.goldInk }}>{String(n).padStart(2, "0")}</span>
      <span style={{ width: 40, height: LAYOUT.hairline, background: COLOR.line2 }} />
      <span style={{ ...TYPE.eyebrow, fontSize: 22, color: COLOR.ink3 }}>{label}</span>
    </div>
  );
};

/** Mention obligatoire sur les scènes chiffrées : les chiffres viennent du jeu fictif de l'application. */
export const Illustrative: React.FC<{ from: number; to: number }> = ({ from, to }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [from, from + 15, to - 15, to], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: LAYOUT.safeX, bottom: 52, opacity: o * 0.9, display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ width: 10, height: 10, border: `1.5px solid ${COLOR.ink3}` }} />
      <span style={{ ...TYPE.tick, fontSize: 22, color: COLOR.ink3, letterSpacing: "0.04em" }}>Données illustratives, issues d'un jeu fictif</span>
    </div>
  );
};

/** Le point d'or (carré, angles vifs) avec son halo. */
export const GoldPoint: React.FC<{ x: number; y: number; size?: number; glow?: number; style?: React.CSSProperties }> = ({ x, y, size = 12, glow = 1, style }) => (
  <div
    style={{
      position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, background: COLOR.goldGlow,
      boxShadow: `0 0 ${18 * glow}px ${4 * glow}px rgba(220,179,109,${0.55 * glow}), 0 0 ${60 * glow}px ${16 * glow}px rgba(204,159,83,${0.25 * glow})`,
      ...style,
    }}
  />
);
