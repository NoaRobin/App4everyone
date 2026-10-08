/**
 * Acte II, ouverture — le manifeste : un anneau de rubriques en orbite.
 */
import type React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { GoldPoint, Grain } from "../components/Chrome";
import { mix, prog } from "../lib/anim";
import { COLOR, EASE, TYPE, VIDEO } from "../theme";
import { Night } from "./kit";
import { voAt } from "./vo";


// ------------------------------------------------------------------ manifeste
const WORDS = ["Revenus", "Distribution", "Passif", "Performance", "Portefeuilles", "Fiches", "Collecte", "Risques", "Contrôles", "Pays", "Parts"];

export const Manifesto: React.FC = () => {
  const frame = useCurrentFrame();
  const spin = frame * 0.42 - 40;
  const ringIn = prog(frame, 0, 40, EASE.premium);
  const t1 = prog(frame, voAt("manifesto", 0) + 14, 22), t2 = prog(frame, voAt("manifesto", 0) + 58, 22);
  const out = prog(frame, 222, 16, EASE.exit);
  const R = 980;
  return (
    <AbsoluteFill>
      <Night glow={1.1} />
      <div style={{ position: "absolute", inset: 0, perspective: 1800, perspectiveOrigin: "50% 40%" }}>
        <div style={{ position: "absolute", left: VIDEO.width / 2, top: 560, transformStyle: "preserve-3d", transform: `rotateX(-14deg) rotateY(${spin}deg) scale(${mix(0.6, 1, ringIn)})`, opacity: ringIn * (1 - out) }}>
          {WORDS.map((w, i) => {
            const a = (i / WORDS.length) * 360;
            const facing = Math.cos(((a + spin) * Math.PI) / 180);
            return (
              <div key={w} style={{ position: "absolute", left: 0, top: 0, transform: `rotateY(${a}deg) translateZ(${R}px) translate(-50%, -50%)`, backfaceVisibility: "hidden",
                ...TYPE.eyebrow, fontSize: 52, letterSpacing: "0.28em", whiteSpace: "nowrap", color: facing > 0.6 ? COLOR.goldInk : COLOR.ink3, opacity: 0.35 + 0.65 * Math.max(0, facing) }}>
                {w}
              </div>
            );
          })}
          {/* l'anneau lui-même : un filet d'or en carré, angles vifs */}
          <div style={{ position: "absolute", left: -R, top: -R, width: 2 * R, height: 2 * R, transform: "rotateX(90deg) translateZ(-60px)", border: `1.5px solid rgba(204,159,83,0.35)` }} />
        </div>
      </div>
      <GoldPoint x={VIDEO.width / 2} y={560} size={12} glow={1.4} style={{ opacity: 1 - t1 }} />
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 360, textAlign: "center", opacity: t1 * (1 - out), transform: `translateY(${(1 - t1) * 26}px)` }}>
        <div style={{ ...TYPE.display, fontSize: 140, color: COLOR.ink, textShadow: "0 8px 60px rgba(0,0,0,0.9)" }}>Toutes les informations métiers.</div>
      </div>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 540, textAlign: "center", opacity: t2 * (1 - out), transform: `translateY(${(1 - t2) * 26}px)` }}>
        <div style={{ ...TYPE.display, fontSize: 140, fontStyle: "italic", color: COLOR.goldInk, textShadow: "0 8px 60px rgba(0,0,0,0.9)" }}>Au même endroit.</div>
      </div>
      <Grain />
    </AbsoluteFill>
  );
};
