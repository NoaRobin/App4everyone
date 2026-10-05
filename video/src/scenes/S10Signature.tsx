/**
 * 10 — Signature. Le filet de la scène 9 se raccourcit sous le nom, le point d'or du début revient au bout du filet,
 * dernier battement du halo, puis noir.
 */
import type React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Ambient, GoldPoint, Grain, Illustrative } from "../components/Chrome";
import { enter, mix, prog, tracking } from "../lib/anim";
import { FOLD_LINE } from "./S09App";
import { COLOR, EASE, TYPE, VIDEO } from "../theme";

const CY = VIDEO.height / 2;
const HALF = 300;

export const S10Signature: React.FC = () => {
  const frame = useCurrentFrame();
  const k = prog(frame, 0, 30, EASE.signature);
  const x0 = mix(FOLD_LINE.x0, VIDEO.width / 2 - HALF, k);
  const x1 = mix(FOLD_LINE.x1, VIDEO.width / 2 + HALF, k);
  const pt = prog(frame, 26, 20, EASE.premium);
  const black = prog(frame, 92, 26, EASE.premium);
  return (
    <AbsoluteFill>
      <Ambient glow={mix(1.2, 1.6, prog(frame, 40, 40))} />
      <div style={{ position: "absolute", left: x0, width: x1 - x0, top: CY - 1, height: 2, background: `linear-gradient(90deg, ${COLOR.gold}, ${COLOR.goldGlow})`, boxShadow: "0 0 14px rgba(220,179,109,0.5)" }} />
      <GoldPoint x={x1} y={CY} size={12 * pt} glow={pt} style={{ opacity: pt }} />
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: CY - 200, textAlign: "center", ...enter(frame, 14, { dur: 30, dist: 30 }) }}>
        <span style={{ ...TYPE.display, fontSize: 150, color: COLOR.ink }}>Rothschild &amp; Co</span>
      </div>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: CY + 44, textAlign: "center", ...TYPE.eyebrow, fontSize: 34, color: COLOR.goldInk,
        letterSpacing: tracking(frame, 24, 50, 0.7, 0.42), ...enter(frame, 24, { dur: 30, dist: 0 }) }}>
        Asset Management
      </div>
      <Illustrative from={20} to={100} />
      <Grain />
      <AbsoluteFill style={{ background: "#000", opacity: black }} />
    </AbsoluteFill>
  );
};
