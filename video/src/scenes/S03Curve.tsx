/**
 * 03 — L'encours, en un trait. Le filet se rétracte jusqu'à la plume, qui dessine trois ans d'encours ; le compteur suit
 * la plume et se fige sur l'encours du jour. Puis la caméra plonge sur les douze derniers mois (raccord avec la scène 4).
 */
import type React from "react";
import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { evolvePath, getLength, getPointAtLength } from "@remotion/paths";
import { area, line } from "d3-shape";
import { Ambient, ChapterMark, GoldPoint, Grain, Illustrative } from "../components/Chrome";
import { mix, prog, sampleAt, enter } from "../lib/anim";
import { BOX3, S3_POINTS, x3, y3, Y3_TICKS, zoomMatrix } from "../lib/chart";
import { md, pct, tOf } from "../lib/format";
import { SAMPLE } from "../data/sample";
import { COLOR, EASE, LAYOUT, NUMERIC, TYPE, VIDEO } from "../theme";

const CY = VIDEO.height / 2;
const DRAW_AT = 26;
const DRAW_DUR = 124;
const ZOOM_AT = 194;

export const S03Curve: React.FC = () => {
  const frame = useCurrentFrame();
  const geo = useMemo(() => {
    const pts = S3_POINTS.map((p) => [x3(new Date(tOf(p.d))), y3(p.aum)] as [number, number]);
    const d = line()(pts)!;
    const a = area().y0(BOX3.y1)(pts)!;
    return { pts, d, a, len: getLength(d), xs: pts.map((p) => p[0]), vs: S3_POINTS.map((p) => p.aum) };
  }, []);
  const P0 = geo.pts[0];

  // A — le filet de la scène 2 se rétracte vers le point de départ de la courbe
  const k = prog(frame, 0, DRAW_AT, EASE.signature);
  // B — la plume dessine
  const p = prog(frame, DRAW_AT, DRAW_DUR, EASE.draw);
  const head = getPointAtLength(geo.d, Math.max(0.01, geo.len * p)) ?? { x: P0[0], y: P0[1] };
  const value = sampleAt(geo.xs, geo.vs, head.x);
  const ev = evolvePath(p, geo.d);
  // C — zoom vers les douze derniers mois
  const z = prog(frame, ZOOM_AT, 46, EASE.premium);
  const M = zoomMatrix();
  const mtx = `matrix(${mix(1, M.ax, z)} 0 0 ${mix(1, M.ay, z)} ${M.bx * z} ${M.by * z})`;
  const fadeZoom = 1 - prog(frame, ZOOM_AT, 22, EASE.exit);
  const years = [2024, 2025, 2026].map((y) => ({ y, x: x3(new Date(Date.UTC(y, 0, 1))) }));

  return (
    <AbsoluteFill>
      <Ambient />
      <svg width={VIDEO.width} height={VIDEO.height} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="s3area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR.gold} stopOpacity={0.32} />
            <stop offset="100%" stopColor={COLOR.gold} stopOpacity={0} />
          </linearGradient>
          <clipPath id="s3draw"><rect x={0} y={0} width={head.x} height={VIDEO.height} /></clipPath>
          <clipPath id="s3box"><rect x={BOX3.x0} y={0} width={BOX3.x1 - BOX3.x0} height={VIDEO.height} /></clipPath>
          <filter id="s3glow" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
        </defs>
        {/* graduations */}
        <g opacity={fadeZoom}>
          {Y3_TICKS.map((t, i) => {
            const o = prog(frame, 30 + i * 3, 18);
            return (
              <g key={t} opacity={o}>
                <line x1={BOX3.x0} x2={BOX3.x1} y1={y3(t)} y2={y3(t)} stroke={COLOR.line} strokeWidth={LAYOUT.hairline} />
                <text x={BOX3.x1 + 24} y={y3(t) + 8} textAnchor="start" style={{ ...TYPE.tick, fill: COLOR.ink3 }}>{md(t, 0)} Md€</text>
              </g>
            );
          })}
          {years.map((y, i) => (
            <text key={y.y} x={y.x} y={BOX3.y1 + 46} textAnchor="middle" opacity={prog(frame, 50 + i * 4, 18)} style={{ ...TYPE.tick, fill: COLOR.ink3 }}>{y.y}</text>
          ))}
        </g>
        {/* A : le filet qui se rétracte */}
        {k < 1 && (
          <line x1={mix(0, P0[0], k)} y1={mix(CY, P0[1], k)} x2={mix(VIDEO.width, P0[0], k)} y2={mix(CY, P0[1], k)}
            stroke={COLOR.gold} strokeWidth={LAYOUT.stroke} style={{ filter: "drop-shadow(0 0 10px rgba(220,179,109,0.6))" }} />
        )}
        {/* B : la courbe */}
        <g clipPath="url(#s3box)">
          <g transform={mtx}>
            <path d={geo.a} fill="url(#s3area)" clipPath="url(#s3draw)" opacity={fadeZoom} />
            <path d={geo.d} fill="none" stroke={COLOR.gold} strokeWidth={10} opacity={0.35 * p} filter="url(#s3glow)" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} vectorEffect="non-scaling-stroke" />
            <path d={geo.d} fill="none" stroke={COLOR.goldGlow} strokeWidth={LAYOUT.stroke} strokeLinejoin="miter" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} vectorEffect="non-scaling-stroke" opacity={frame >= DRAW_AT ? 1 : 0} />
          </g>
        </g>
      </svg>
      {/* la plume */}
      {frame >= DRAW_AT - 4 && <GoldPoint x={head.x} y={head.y} size={14} glow={1.2} style={{ opacity: fadeZoom }} />}
      {frame < DRAW_AT && <GoldPoint x={P0[0]} y={P0[1]} size={14 * k} glow={k} style={{ opacity: k }} />}

      <ChapterMark n={2} label="L'encours" out={ZOOM_AT} />
      {/* le compteur suit la plume */}
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 130, ...enter(frame, 16, { dur: 20, out: ZOOM_AT - 4 }) }}>
        <div style={{ ...TYPE.eyebrow, color: COLOR.goldInk, marginBottom: 6 }}>Encours sous gestion</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
          <span style={{ ...TYPE.hero, color: COLOR.ink, ...NUMERIC }}>{md(frame < DRAW_AT ? S3_POINTS[0].aum : value, 1)}</span>
          <span style={{ ...TYPE.title, color: COLOR.goldInk }}>Md€</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: LAYOUT.safeX + 6, top: 520, display: "flex", gap: 48, alignItems: "baseline" }}>
        <div style={enter(frame, DRAW_AT + DRAW_DUR + 4, { out: ZOOM_AT - 6 })}>
          <span style={{ ...TYPE.title, fontSize: 84, color: COLOR.up, ...NUMERIC }}>+{pct(SAMPLE.aum3y.pct)}&nbsp;%</span>
          <span style={{ ...TYPE.lede, fontSize: 40, color: COLOR.ink2, marginLeft: 18 }}>en trois ans</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: LAYOUT.safeX + 6, top: 620, display: "flex", gap: 36, ...TYPE.label, color: COLOR.ink2, ...enter(frame, DRAW_AT + DRAW_DUR + 14, { out: ZOOM_AT - 6 }) }}>
        <span><b style={{ color: COLOR.ink, fontWeight: 600 }}>{SAMPLE.nFunds}</b> fonds</span>
        <span style={{ color: COLOR.line2 }}>/</span>
        <span><b style={{ color: COLOR.ink, fontWeight: 600 }}>{SAMPLE.nShares}</b> parts</span>
      </div>
      <Illustrative from={20} to={ZOOM_AT + 10} />
      <Grain />
    </AbsoluteFill>
  );
};
