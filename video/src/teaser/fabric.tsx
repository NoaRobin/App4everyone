/**
 * Comment ça marche — trois temps, synchronisés sur la voix off :
 *  01 Les outils d'aujourd'hui (Product Info, JUMP, Centaure, Doc Info, Adjuto), chacun avec sa part de l'information.
 *  02 Fabric : les données y sont réunies — des flux d'or convergent vers un cube, un seul endroit, mis à jour chaque jour.
 *  03 L'application : un faisceau unique, en lecture seule, vers l'écran ; elle relie, calcule, met en forme.
 */
import type React from "react";
import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { evolvePath, getLength, getPointAtLength } from "@remotion/paths";
import { Grain } from "../components/Chrome";
import { mix, prog } from "../lib/anim";
import { COLOR, EASE, FONT, LAYOUT, TYPE, VIDEO } from "../theme";
import { Night, Note, NOTE_APP, Screen3D } from "./kit";
import { voAt } from "./vo";

const TOOLS = ["Product Info", "JUMP", "Centaure", "Doc Info", "Adjuto"];
const CARD = { x: 250, w: 360, h: 92, y0: 250, gap: 118 };
const CUBE = { x: 1010, y: 500, s: 200 };
const SCREEN_X = 1720;   // centre de l'écran de l'application, avant le panoramique
const PAN = -200;

const Cube: React.FC<{ size: number; spin: number; glow: number }> = ({ size, spin, glow }) => {
  const h = size / 2;
  const face = (t: string) => (
    <div style={{ position: "absolute", width: size, height: size, left: -h, top: -h, transform: t, border: `1.5px solid rgba(220,179,109,${0.55 + 0.4 * glow})`,
      background: `rgba(204,159,83,${0.05 + 0.08 * glow})`, boxShadow: `inset 0 0 ${40 * glow}px rgba(204,159,83,${0.25 * glow})` }} />
  );
  return (
    <div style={{ position: "absolute", left: 0, top: 0, transformStyle: "preserve-3d", transform: `rotateX(-20deg) rotateY(${spin}deg)` }}>
      {face(`translateZ(${h}px)`)}{face(`rotateY(180deg) translateZ(${h}px)`)}{face(`rotateY(90deg) translateZ(${h}px)`)}
      {face(`rotateY(-90deg) translateZ(${h}px)`)}{face(`rotateX(90deg) translateZ(${h}px)`)}{face(`rotateX(-90deg) translateZ(${h}px)`)}
    </div>
  );
};

export const FabricShot: React.FC = () => {
  const f = useCurrentFrame();
  const tFabric = voAt("fabric", 1), tDaily = voAt("fabric", 2), tApp = voAt("fabric", 3), tShape = voAt("fabric", 4);
  const streams = useMemo(() => TOOLS.map((_, i) => {
    const y = CARD.y0 + i * CARD.gap + CARD.h / 2;
    const x0 = CARD.x + CARD.w + 10, x1 = CUBE.x - CUBE.s * 0.62;
    const d = `M ${x0} ${y} C ${x0 + 160} ${y}, ${x1 - 180} ${CUBE.y}, ${x1} ${CUBE.y}`;
    return { d, len: getLength(d) };
  }), []);
  const beam = useMemo(() => {
    const x0 = CUBE.x + CUBE.s * 0.62, x1 = SCREEN_X - 336;
    const d = `M ${x0} ${CUBE.y} L ${x1} ${CUBE.y}`;
    return { d, len: getLength(d) };
  }, []);
  const cubeIn = prog(f, tFabric - 10, 30, EASE.signature);
  const pulse = 0.5 + 0.5 * Math.sin(f / 8);
  const daily = prog(f, tDaily, 20);
  const pan = prog(f, tApp - 6, 54, EASE.premium);
  const beamDraw = prog(f, tApp + 30, 34, EASE.draw);
  const step = f < tFabric ? 0 : f < tApp ? 1 : 2;
  const STEPS = ["Les outils d'aujourd'hui", "Fabric réunit les données", "L'application les met en forme"];
  const shapeWords = ["relier", "calculer", "mettre en forme"];

  return (
    <AbsoluteFill>
      <Night glow={mix(0.6, 1.2, cubeIn)} />
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${PAN * pan}px)` }}>
        {/* 01 — les outils */}
        <div style={{ position: "absolute", inset: 0, perspective: 1400, perspectiveOrigin: "30% 50%" }}>
          {TOOLS.map((t, i) => {
            const a = prog(f, 8 + i * 6, 18, EASE.signature);
            const lit = prog(f, tFabric + 6 + i * 6, 16);
            return (
              <div key={t} style={{ position: "absolute", left: CARD.x, top: CARD.y0 + i * CARD.gap, width: CARD.w, height: CARD.h, opacity: a,
                transform: `translateX(${(1 - a) * -60}px) rotateY(16deg)`, transformOrigin: "100% 50%",
                background: "#0f1318", border: `1.5px solid ${lit > 0.5 ? COLOR.gold : "#2a313b"}`, display: "flex", alignItems: "center", gap: 18, padding: "0 26px",
                boxShadow: lit > 0.5 ? "0 0 30px rgba(204,159,83,0.18)" : "0 20px 50px -20px rgba(0,0,0,0.9)" }}>
                <span style={{ width: 16, height: 16, border: `2px solid ${lit > 0.5 ? COLOR.goldInk : "#5d6470"}` }} />
                <span style={{ fontFamily: FONT.mono, fontSize: 32, color: lit > 0.5 ? COLOR.ink : "#9aa1ad" }}>{t}</span>
              </div>
            );
          })}
        </div>
        {/* 02 — les flux vers Fabric */}
        <svg width={VIDEO.width - PAN} height={VIDEO.height} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          {streams.map((s, i) => {
            const p = prog(f, tFabric + i * 6, 34, EASE.draw);
            const ev = evolvePath(p, s.d);
            const dots = p >= 1 ? [0, 0.33, 0.66].map((o) => getPointAtLength(s.d, s.len * (((f - tFabric) / 70 + o + i * 0.13) % 1))) : [];
            return (
              <g key={i}>
                <path d={s.d} fill="none" stroke={COLOR.gold} strokeWidth={2} strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} opacity={0.85} />
                {dots.map((d, k) => d && <rect key={k} x={d.x - 4} y={d.y - 4} width={8} height={8} fill={COLOR.goldGlow} />)}
              </g>
            );
          })}
          {/* 03 — le faisceau unique, en lecture seule */}
          {beamDraw > 0 && (() => {
            const ev = evolvePath(beamDraw, beam.d);
            const tip = getPointAtLength(beam.d, beam.len * beamDraw);
            return (
              <g>
                <path d={beam.d} fill="none" stroke={COLOR.goldGlow} strokeWidth={4} strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} style={{ filter: "drop-shadow(0 0 10px rgba(220,179,109,0.7))" }} />
                {tip && <polygon points={`${tip.x},${tip.y} ${tip.x - 18},${tip.y - 11} ${tip.x - 18},${tip.y + 11}`} fill={COLOR.goldGlow} />}
              </g>
            );
          })()}
        </svg>
        <div style={{ position: "absolute", left: CUBE.x + CUBE.s * 0.62 + 14, top: CUBE.y + 16, opacity: beamDraw, ...TYPE.eyebrow, fontSize: 17, color: COLOR.goldInk }}>Lecture seule</div>
        {/* Fabric */}
        <div style={{ position: "absolute", left: CUBE.x, top: CUBE.y, perspective: 1200, transformStyle: "preserve-3d", opacity: cubeIn, transform: `scale(${mix(0.6, 1, cubeIn) * (1 + 0.04 * pulse * daily)})` }}>
          <Cube size={CUBE.s} spin={f * 0.7} glow={0.4 + 0.6 * cubeIn} />
        </div>
        <div style={{ position: "absolute", left: CUBE.x - 300, width: 600, top: CUBE.y + CUBE.s * 0.85, textAlign: "center", opacity: cubeIn }}>
          <div style={{ ...TYPE.title, fontSize: 76, color: COLOR.ink }}>Fabric</div>
          <div style={{ ...TYPE.eyebrow, fontSize: 20, color: COLOR.ink3, marginTop: 10 }}>la plateforme de données de Microsoft</div>
          <div style={{ ...TYPE.label, fontSize: 28, color: COLOR.goldInk, marginTop: 14, opacity: daily }}>Un seul endroit · mis à jour chaque jour</div>
        </div>
        {/* l'application */}
        <div style={{ position: "absolute", inset: 0, perspective: 1800, perspectiveOrigin: "70% 50%", opacity: prog(f, tApp, 24) }}>
          <Screen3D name="courbe" scale={0.34} reflection={false} transform={`translate3d(${SCREEN_X - VIDEO.width / 2}px, ${CUBE.y - VIDEO.height / 2}px, 0px) rotateY(${mix(-24, -10, pan)}deg)`} />
        </div>
        <div style={{ position: "absolute", left: SCREEN_X - 326, top: CUBE.y + 210, display: "flex", gap: 14 }}>
          {shapeWords.map((w, i) => {
            const a = prog(f, tShape + i * 16, 14, EASE.signature);
            return (
              <span key={w} style={{ ...TYPE.eyebrow, fontSize: 22, color: COLOR.ink, padding: "12px 18px", border: `1.5px solid ${COLOR.gold}`, background: COLOR.goldSoft, opacity: a, transform: `translateY(${(1 - a) * 14}px)` }}>{w}</span>
            );
          })}
        </div>
      </div>
      {/* fil pédagogique : les trois temps */}
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 112, opacity: prog(f, 4, 16) }}>
        <div style={{ ...TYPE.eyebrow, color: COLOR.goldInk, marginBottom: 18 }}>Comment ça marche</div>
        <div style={{ display: "flex", gap: 34 }}>
          {STEPS.map((s, i) => (
            <span key={s} style={{ display: "flex", alignItems: "baseline", gap: 12, ...TYPE.label, fontSize: 28, color: i === step ? COLOR.ink : COLOR.ink3, borderBottom: `2px solid ${i === step ? COLOR.gold : "transparent"}`, paddingBottom: 8 }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 22, color: i === step ? COLOR.goldInk : COLOR.ink3 }}>0{i + 1}</span>{s}
            </span>
          ))}
        </div>
      </div>
      {f > tApp && <Note>{NOTE_APP}</Note>}
      <Grain />
    </AbsoluteFill>
  );
};
