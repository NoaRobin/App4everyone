/**
 * 08 — Qui détient nos fonds. La courbe de concentration du passif (part des comptes, du plus gros au plus petit, contre
 * part de l'encours) se dessine ; un repère carré glisse jusqu'à 10 % des comptes. Uniquement des parts, aucun nom.
 * Sortie : un filet vertical se trace au centre (raccord avec la scène 9).
 */
import type React from "react";
import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { evolvePath, getLength, getPointAtLength } from "@remotion/paths";
import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { Ambient, ChapterMark, GoldPoint, Grain, Illustrative } from "../components/Chrome";
import { enter, mix, prog, sampleAt } from "../lib/anim";
import { SAMPLE } from "../data/sample";
import { COLOR, EASE, LAYOUT, NUMERIC, TYPE, VIDEO } from "../theme";

const PX0 = 1190, PX1 = 1730, PY0 = 340, PY1 = 860;
const sx = scaleLinear().domain([0, 100]).range([PX0, PX1]);
const sy = scaleLinear().domain([0, 100]).range([PY1, PY0]);
const OUT = 124;
const PTS = SAMPLE.passif.concentration as readonly (readonly [number, number])[];
const SEGS = SAMPLE.passif.segments as readonly (readonly [string, number])[];

export const S08Holders: React.FC = () => {
  const frame = useCurrentFrame();
  const geo = useMemo(() => {
    const d = line().curve(curveMonotoneX)(PTS.map(([a, b]) => [sx(a), sy(b)]))!;
    return { d, len: getLength(d) };
  }, []);
  const draw = prog(frame, 12, 40, EASE.draw);
  const ev = evolvePath(draw, geo.d);
  // le repère glisse jusqu'à 10 % des comptes : on cherche la longueur dont le x vaut sx(10)
  const m = prog(frame, 54, 30, EASE.signature);
  const targetX = mix(PX0, sx(10), m);
  let lo = 0, hi = geo.len;
  for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if ((getPointAtLength(geo.d, mid)?.x ?? 0) < targetX) lo = mid; else hi = mid; }
  const mk = getPointAtLength(geo.d, lo) ?? { x: PX0, y: PY1 };
  const value = sampleAt(PTS.map((p) => p[0]), PTS.map((p) => p[1]), 10) * prog(frame, 54, 30, EASE.count);
  const out = 1 - prog(frame, OUT, 14, EASE.exit);
  const vline = prog(frame, OUT + 4, 22, EASE.draw);
  const max = Math.max(...SEGS.map((s) => s[1]));

  return (
    <AbsoluteFill>
      <Ambient />
      <ChapterMark n={7} label="Le passif" out={OUT} />
      <svg width={VIDEO.width} height={VIDEO.height} style={{ position: "absolute", inset: 0 }}>
        <g opacity={out * prog(frame, 0, 16)}>
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={PX0} x2={PX1} y1={sy(t)} y2={sy(t)} stroke={COLOR.line} strokeWidth={LAYOUT.hairline} />
              <text x={PX0 - 16} y={sy(t) + 8} textAnchor="end" style={{ ...TYPE.tick, fill: COLOR.ink3 }}>{t}&nbsp;%</text>
              <text x={sx(t)} y={PY1 + 40} textAnchor="middle" style={{ ...TYPE.tick, fill: COLOR.ink3 }}>{t}&nbsp;%</text>
            </g>
          ))}
          <line x1={sx(0)} y1={sy(0)} x2={sx(100)} y2={sy(100)} stroke={COLOR.ink3} strokeWidth={LAYOUT.hairline} strokeDasharray="6 8" opacity={0.6} />
          <text x={PX1} y={PY1 + 80} textAnchor="end" style={{ ...TYPE.eyebrow, fontSize: 18, fill: COLOR.ink3 }}>Part des comptes, du plus gros au plus petit</text>
          <text x={PX0} y={PY0 - 34} textAnchor="start" style={{ ...TYPE.eyebrow, fontSize: 18, fill: COLOR.ink3 }}>Part de l'encours</text>
          <path d={geo.d} fill="none" stroke={COLOR.goldGlow} strokeWidth={LAYOUT.stroke} strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} style={{ filter: "drop-shadow(0 0 8px rgba(220,179,109,0.55))" }} />
          {m > 0 && (
            <g opacity={prog(frame, 54, 8)}>
              <line x1={mk.x} y1={mk.y} x2={mk.x} y2={PY1} stroke={COLOR.gold} strokeWidth={LAYOUT.hairline} strokeDasharray="4 6" />
              <line x1={PX0} y1={mk.y} x2={mk.x} y2={mk.y} stroke={COLOR.gold} strokeWidth={LAYOUT.hairline} strokeDasharray="4 6" />
            </g>
          )}
        </g>
        {/* raccord : le filet vertical de la scène 9 */}
        <line x1={VIDEO.width / 2} x2={VIDEO.width / 2} y1={VIDEO.height / 2 - (VIDEO.height / 2) * vline} y2={VIDEO.height / 2 + (VIDEO.height / 2) * vline} stroke={COLOR.gold} strokeWidth={2} opacity={vline > 0 ? 1 : 0} />
      </svg>
      {m > 0 && <GoldPoint x={mk.x} y={mk.y} size={16} glow={1.2} style={{ opacity: out }} />}

      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 150, ...enter(frame, 4, { dur: 20, out: OUT }) }}>
        <div style={{ ...TYPE.eyebrow, color: COLOR.goldInk, marginBottom: 22 }}>Le passif · des parts, jamais de noms</div>
        <div style={{ ...TYPE.title, fontSize: 96, color: COLOR.ink }}>Qui détient nos fonds.</div>
      </div>
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 360, ...enter(frame, 52, { dur: 20, out: OUT }) }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ ...TYPE.hero, fontSize: 260, color: COLOR.ink, ...NUMERIC }}>{Math.round(value)}</span>
          <span style={{ ...TYPE.title, color: COLOR.goldInk }}>%</span>
        </div>
        <div style={{ ...TYPE.lede, fontSize: 40, color: COLOR.ink2, maxWidth: 760 }}>de l'encours est détenu par les <b style={{ color: COLOR.ink, fontWeight: 500 }}>10&nbsp;% de comptes</b> les plus importants.</div>
      </div>
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 760, width: 760 }}>
        {SEGS.slice(0, 4).map(([label, v], i) => {
          const a = enter(frame, 86 + i * 3, { dur: 16, out: OUT });
          return (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 16, height: 46, ...a }}>
              <span style={{ ...TYPE.tick, color: COLOR.ink2, width: 400 }}>{label}</span>
              <span style={{ height: 8, width: (v / max) * 260 * prog(frame, 90 + i * 3, 20), background: i === 0 ? COLOR.gold : COLOR.ink3 }} />
              <span style={{ ...TYPE.tick, color: i === 0 ? COLOR.goldInk : COLOR.ink2, ...NUMERIC }}>{v.toFixed(1).replace(".", ",")}&nbsp;%</span>
            </div>
          );
        })}
      </div>
      <Illustrative from={0} to={OUT + 12} />
      <Grain />
    </AbsoluteFill>
  );
};
