/** 01 — Tout part d'un point. Un point d'or respire au centre, puis s'étire en un filet de bord à bord. */
import type React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Ambient, GoldPoint, Grain } from "../components/Chrome";
import { mix, prog, tracking } from "../lib/anim";
import { COLOR, EASE, LAYOUT, TYPE, VIDEO } from "../theme";

const CY = VIDEO.height / 2;

export const S01Point: React.FC = () => {
  const frame = useCurrentFrame();
  const pIn = prog(frame, 12, 30, EASE.premium);
  const breath = 1 + 0.12 * Math.sin(Math.max(0, frame - 12) / 7);
  const draw = prog(frame, 44, 46, EASE.draw);
  const half = (VIDEO.width / 2) * draw;
  const eyebrow = prog(frame, 58, 30, EASE.premium);
  const eyebrowOut = prog(frame, 100, 14, EASE.exit);
  return (
    <AbsoluteFill>
      <Ambient glow={mix(0.2, 1, pIn)} />
      {/* le filet : dégradé vers les bords, plus lumineux au centre */}
      <div
        style={{
          position: "absolute", left: VIDEO.width / 2 - half, width: half * 2, top: CY - LAYOUT.hairline / 2, height: LAYOUT.hairline,
          background: `linear-gradient(90deg, rgba(204,159,83,0.15), ${COLOR.gold} 30%, ${COLOR.goldGlow} 50%, ${COLOR.gold} 70%, rgba(204,159,83,0.15))`,
          boxShadow: "0 0 12px rgba(220,179,109,0.35)",
        }}
      />
      <GoldPoint x={VIDEO.width / 2} y={CY} size={12 * pIn * breath} glow={pIn} style={{ opacity: pIn }} />
      <div
        style={{
          position: "absolute", top: CY - 110, width: "100%", textAlign: "center", ...TYPE.eyebrow, fontSize: 30, color: COLOR.ink2,
          letterSpacing: tracking(frame, 58, 50, 0.6, 0.32), opacity: eyebrow * (1 - eyebrowOut),
          transform: `translateY(${(1 - eyebrow) * 16 - eyebrowOut * 10}px)`,
        }}
      >
        Rothschild &amp; Co Asset Management
      </div>
      <Grain />
    </AbsoluteFill>
  );
};
