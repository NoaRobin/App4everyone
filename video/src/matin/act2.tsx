/**
 * Acte II — l'explosion (30 s), « Et plus encore. », puis les plus beaux plans 3D de l'application, une coupe tous
 * les deux temps.
 */
import type React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Ambient, Grain } from "../components/Chrome";
import { COLOR, EASE, FONT, TYPE, VIDEO } from "../theme";
import { mix, prog } from "../lib/anim";
import { AppCam, Crop, Flash, Letters, Mark, Note, Slam } from "../jasmine/kit";
import { BEAT, lb, len, pulse } from "./timeline";

const W = VIDEO.width, CX = W / 2, CY = VIDEO.height / 2;

// ================================================================== 5. L'explosion (temps 0 → 8)
export const Drop: React.FC = () => {
  const f = useCurrentFrame();
  const fly = [0, 1, 2, 3, 4].map((i) => prog(f, i, 7, EASE.signature));
  const fold = [0, 1, 2, 3, 4].map((i) => prog(f, 4 + i, 9, EASE.premium));
  const heart = prog(f, 8, 6, EASE.signature);
  const z = mix(1.6, 1, prog(f, 0, 30, EASE.signature));
  const rot = mix(-60, 0, prog(f, 0, 26, EASE.signature));
  const shake = Math.exp(-f / 6) * 10;
  const up = prog(f, lb("drop", 4), 14, EASE.signature);
  return (
    <AbsoluteFill style={{ transform: `translate(${Math.sin(f * 2.1) * shake}px, ${Math.cos(f * 1.7) * shake}px)` }}>
      <Ambient glow={1.6} />
      {/* rayons */}
      <AbsoluteFill style={{ background: `conic-gradient(from ${f * 0.6}deg at 50% ${mix(50, 40, up)}%, transparent 0deg, rgba(220,179,109,0.10) 8deg, transparent 18deg, transparent 60deg, rgba(220,179,109,0.08) 70deg, transparent 82deg, transparent 140deg, rgba(220,179,109,0.1) 150deg, transparent 162deg, transparent 230deg, rgba(220,179,109,0.07) 240deg, transparent 252deg, transparent 300deg, rgba(220,179,109,0.09) 310deg, transparent 322deg)`, opacity: Math.min(1, f / 6) }} />
      <div style={{ position: "absolute", left: CX - 230, top: mix(CY - 230, CY - 330, up), transform: `scale(${z * (1 + 0.035 * pulse(f, BEAT))}) rotate(${rot}deg)` }}>
        <Mark size={460} fly={fly} fold={fold} heart={heart} glow={1.4} />
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: mix(CY + 260, CY + 130, up), display: "flex", justifyContent: "center" }}>
        <Letters text="JASMINE" at={lb("drop", 2.5)} every={2} gold={[3]} style={{ fontFamily: FONT.serif, fontSize: 230, color: COLOR.ink, letterSpacing: "0.06em", lineHeight: 1 }} />
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: CY + 390, textAlign: "center" }}>
        <Slam at={lb("drop", 5)} style={{ ...TYPE.eyebrow, fontSize: 28, color: COLOR.goldInk, letterSpacing: "0.4em" }}>Toutes vos données · un seul endroit</Slam>
      </div>
      <Flash at={0} peak={1} dur={18} />
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 6. « Et plus encore. » (temps 8 → 12)
export const More: React.FC = () => {
  const f = useCurrentFrame();
  const z = mix(0.9, 1.12, prog(f, 0, len("more"), EASE.premium));
  return (
    <AbsoluteFill>
      <Ambient glow={1.2} />
      <AbsoluteFill style={{ transform: `scale(${z})` }}>
        <div style={{ position: "absolute", left: 0, width: W, top: CY - 150, textAlign: "center" }}>
          <Slam at={0} dur={6} style={{ ...TYPE.hero, fontSize: 250, color: COLOR.ink }}>Et plus</Slam>
        </div>
        <div style={{ position: "absolute", left: 0, width: W, top: CY + 60, textAlign: "center" }}>
          <Slam at={Math.round(BEAT)} dur={6} style={{ ...TYPE.hero, fontSize: 250, color: COLOR.goldInk, fontStyle: "italic" }}>encore.</Slam>
        </div>
      </AbsoluteFill>
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 7. Le montage 3D (temps 12 → 36)
type Shot = { name: string; trim: number; crop: Crop; label: string; tilt?: [number, number]; zoom?: number };
const FULL: Crop = { x: 0, y: 0, w: 1920 };
const SHOTS: Shot[] = [
  { name: "mcity", trim: 20, crop: { x: 120, y: 80, w: 1680 }, label: "Rothschild City", zoom: 1.12 },
  { name: "mville", trim: 10, crop: { x: 100, y: 70, w: 1720 }, label: "Les encours", tilt: [14, -6] },
  { name: "mcourbe", trim: 10, crop: FULL, label: "Jour après jour", zoom: 1.18 },
  { name: "mglobe", trim: 10, crop: { x: 240, y: 60, w: 1440 }, label: "Le monde", tilt: [-14, 5] },
  { name: "mpassif", trim: 10, crop: { x: 60, y: 40, w: 1800 }, label: "Le passif", zoom: 1.15 },
  { name: "mcomp", trim: 10, crop: { x: 80, y: 60, w: 1760 }, label: "La performance", tilt: [12, 6] },
  { name: "mclavier", trim: 4, crop: { x: 380, y: 300, w: 1160 }, label: "La recherche", zoom: 1.1 },
  { name: "mcity", trim: 80, crop: { x: 420, y: 220, w: 1080 }, label: "Les revenus", tilt: [-12, -5] },
  { name: "mville", trim: 70, crop: { x: 360, y: 200, w: 1200 }, label: "Fonds par fonds", zoom: 1.2 },
  { name: "mglobe", trim: 70, crop: { x: 480, y: 160, w: 960 }, label: "Pays par pays", tilt: [14, -4] },
  { name: "mcourbe", trim: 70, crop: { x: 300, y: 160, w: 1300 }, label: "Collecte", zoom: 1.15 },
  { name: "mcomp", trim: 70, crop: { x: 300, y: 160, w: 1300 }, label: "Côte à côte", tilt: [-12, 4] },
];

const ReelShot: React.FC<{ s: Shot; i: number; d: number }> = ({ s, i, d }) => {
  const f = useCurrentFrame();
  const t = f / d;
  const z = s.zoom ? mix(1, s.zoom, t) : 1.04;
  const tilt = s.tilt ? `perspective(2000px) rotateY(${s.tilt[0] * (1 - t * 0.6)}deg) rotateX(${s.tilt[1]}deg) scale(0.86)` : undefined;
  const lab = prog(f, 1, 6, EASE.signature);
  return (
    <AbsoluteFill style={{ background: COLOR.paper }}>
      {s.tilt && <Ambient glow={1.2} />}
      <AbsoluteFill style={{ transform: `scale(${z})` }}>
        <AppCam name={s.name} trim={s.trim} crop={s.crop} tilt={tilt} frameGlow={s.tilt ? 0.8 : 0} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 300, background: "linear-gradient(to top, rgba(4,7,14,0.9), transparent)" }} />
      <div style={{ position: "absolute", left: 144, bottom: 110, opacity: lab, transform: `translateX(${(1 - lab) * -40}px)` }}>
        <div style={{ ...TYPE.eyebrow, fontSize: 20, color: COLOR.goldInk, marginBottom: 10 }}>{String(i + 1).padStart(2, "0")} / {SHOTS.length}</div>
        <div style={{ ...TYPE.title, fontSize: 96, color: COLOR.ink, textShadow: "0 6px 40px rgba(0,0,0,0.9)" }}>{s.label}</div>
      </div>
      <Flash at={0} peak={0.35} dur={6} />
    </AbsoluteFill>
  );
};

export const Reel: React.FC = () => {
  const L = len("reel");
  return (
    <AbsoluteFill style={{ background: COLOR.paper }}>
      {SHOTS.map((s, i) => {
        const a = Math.round(i * 2 * BEAT), b = i === SHOTS.length - 1 ? L : Math.round((i + 1) * 2 * BEAT);
        return (
          <Sequence key={i} from={a} durationInFrames={b - a} layout="none">
            <ReelShot s={s} i={i} d={b - a} />
          </Sequence>
        );
      })}
      <Note />
      <Grain />
    </AbsoluteFill>
  );
};

