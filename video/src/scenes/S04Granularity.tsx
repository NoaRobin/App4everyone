/**
 * 04 — Du jour à l'année. Les douze derniers mois, un point par mois (raccord exact avec le zoom de la scène 3), puis par
 * trimestre, par année, par semaine et enfin par jour : à chaque cran, la courbe se reforme de gauche à droite et la
 * collecte nette estimée de chaque période repousse sous l'axe.
 */
import type React from "react";
import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Ambient, ChapterMark, Grain, Illustrative } from "../components/Chrome";
import { enter, mix, prog, sampleAt } from "../lib/anim";
import { BOX4, S4_SERIES, T4, x4, y4, Y4_TICKS } from "../lib/chart";
import { md, tOf } from "../lib/format";
import { COLOR, EASE, FLOW, LAYOUT, TYPE, VIDEO } from "../theme";

type F = "A" | "T" | "M" | "S" | "J";
const STEPS: { f: F; at: number }[] = [
  { f: "M", at: 0 }, { f: "T", at: 30 }, { f: "A", at: 56 }, { f: "S", at: 84 }, { f: "J", at: 112 },
];
const CHIPS: { f: F; l: string; unit: string }[] = [
  { f: "A", l: "Année", unit: "année" }, { f: "T", l: "Trimestre", unit: "trimestre" }, { f: "M", l: "Mois", unit: "mois" },
  { f: "S", l: "Semaine", unit: "semaine" }, { f: "J", l: "Jour", unit: "jour" },
];
const MORPH = 20;
const OUT = 150;
const CHIP_W = 176;
const CHIPS_X = BOX4.x1 - CHIP_W * CHIPS.length;

export const S04Granularity: React.FC = () => {
  const frame = useCurrentFrame();
  const geo = useMemo(() => {
    const xs = T4.map((t) => x4(new Date(t)));
    const vals: Record<F, number[]> = {} as Record<F, number[]>;
    const bars: Record<F, { x: number; v: number }[]> = {} as Record<F, { x: number; v: number }[]>;
    (Object.keys(S4_SERIES) as F[]).forEach((f) => {
      const s = S4_SERIES[f];
      const sx = s.map((p) => tOf(p.d));
      vals[f] = T4.map((t) => sampleAt(sx, s.map((p) => p.aum), t));
      bars[f] = s.filter((p) => p.flows != null).map((p) => ({ x: x4(new Date(tOf(p.d))), v: p.flows as number }));
    });
    return { xs, vals, bars };
  }, []);

  // étape courante et valeurs interpolées (balayage de gauche à droite)
  let si = 0;
  STEPS.forEach((s, i) => { if (frame >= s.at) si = i; });
  const cur = STEPS[si], prev = STEPS[Math.max(0, si - 1)];
  const g = si === 0 ? 1 : prog(frame, cur.at, MORPH, EASE.premium);
  const n = geo.xs.length;
  const ys = geo.xs.map((_, i) => {
    const xn = i / (n - 1);
    const u = Math.min(1, Math.max(0, g * 1.4 - xn * 0.4));
    const e = u * u * (3 - 2 * u);
    return y4(mix(geo.vals[prev.f][i], geo.vals[cur.f][i], si === 0 ? 1 : e));
  });
  const d = "M" + geo.xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join("L");
  const lineOut = 1 - prog(frame, OUT, 16, EASE.exit);

  // repère du cran actif
  const chipX = (f: F) => CHIPS_X + CHIPS.findIndex((c) => c.f === f) * CHIP_W;
  const ux = mix(chipX(prev.f), chipX(cur.f), si === 0 ? 1 : prog(frame, cur.at, 14, EASE.signature));
  const unit = CHIPS.find((c) => c.f === cur.f)!.unit;
  const nPts = S4_SERIES[cur.f].length;

  return (
    <AbsoluteFill>
      <Ambient />
      <svg width={VIDEO.width} height={VIDEO.height} style={{ position: "absolute", inset: 0 }}>
        <defs><filter id="s4glow" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="6" /></filter></defs>
        <g opacity={lineOut}>
          {Y4_TICKS.map((t, i) => (
            <g key={t} opacity={prog(frame, 4 + i * 2, 16)}>
              <line x1={BOX4.x0} x2={BOX4.x1} y1={y4(t)} y2={y4(t)} stroke={COLOR.line} strokeWidth={LAYOUT.hairline} />
              <text x={BOX4.x1} y={y4(t) - 12} textAnchor="end" style={{ ...TYPE.tick, fill: COLOR.ink3 }}>{md(t, 0)} Md€</text>
            </g>
          ))}
          <path d={d} fill="none" stroke={COLOR.gold} strokeWidth={10} opacity={0.35} filter="url(#s4glow)" />
          <path d={d} fill="none" stroke={COLOR.goldGlow} strokeWidth={LAYOUT.stroke} strokeLinejoin="miter" />
        </g>
        {/* collecte nette estimée par période */}
        {STEPS.map((s, i) => {
          const next = STEPS[i + 1];
          const grow = prog(frame, s.at + (i === 0 ? 8 : 8), 14, EASE.signature);
          const shrink = prog(frame, next ? next.at : OUT - 4, 8, EASE.exit);
          const k = grow * (1 - shrink);
          if (k <= 0.001) return null;
          const bars = geo.bars[s.f];
          const maxAbs = Math.max(1, ...bars.map((b) => Math.abs(b.v)));
          const spacing = bars.length > 1 ? (BOX4.x1 - BOX4.x0) / (bars.length - 1) : 60;
          const w = Math.max(2, Math.min(44, spacing * 0.62));
          return (
            <g key={s.f}>
              {bars.map((b, j) => {
                const h = (Math.abs(b.v) / maxAbs) * BOX4.barMax * k;
                return <rect key={j} x={b.x - w / 2} y={b.v >= 0 ? BOX4.axis - h : BOX4.axis} width={w} height={h} fill={b.v >= 0 ? FLOW.in : FLOW.out} opacity={0.9} />;
              })}
            </g>
          );
        })}
        <line x1={BOX4.x0} x2={BOX4.x1} y1={BOX4.axis} y2={BOX4.axis} stroke={COLOR.gold} strokeWidth={mix(LAYOUT.hairline, 2, prog(frame, OUT, 20))} opacity={mix(0.55, 1, prog(frame, OUT, 20))} />
      </svg>
      <div style={{ position: "absolute", left: BOX4.x0, top: BOX4.axis + BOX4.barMax + 18, ...TYPE.eyebrow, fontSize: 20, color: COLOR.ink3, opacity: prog(frame, 10, 16) * lineOut }}>
        Collecte nette estimée par {unit}
      </div>

      <ChapterMark n={3} label="Du jour à l'année" out={OUT} />
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 150, ...enter(frame, 2, { dur: 20, out: OUT - 2 }) }}>
        <div style={{ ...TYPE.eyebrow, color: COLOR.goldInk, marginBottom: 22 }}>La courbe des encours · douze mois</div>
        <div style={{ ...TYPE.title, color: COLOR.ink }}>Du jour à l'année.</div>
        <div style={{ ...TYPE.lede, fontSize: 40, color: COLOR.ink2, marginTop: 18 }}>
          <b style={{ color: COLOR.ink, fontWeight: 500 }}>{nPts} {nPts > 1 ? "points" : "point"}</b>, un par {unit}, jamais une moyenne.
        </div>
      </div>
      {/* sélecteur à angles vifs */}
      <div style={{ position: "absolute", left: CHIPS_X, top: 132, width: CHIP_W * CHIPS.length, height: 64, ...enter(frame, 6, { dur: 18, out: OUT - 2 }) }}>
        <div style={{ position: "absolute", inset: 0, border: `${LAYOUT.hairline}px solid ${COLOR.line2}` }} />
        <div style={{ position: "absolute", left: ux - CHIPS_X, top: 0, width: CHIP_W, height: 64, background: COLOR.goldSoft, borderBottom: `3px solid ${COLOR.gold}` }} />
        {CHIPS.map((c, i) => (
          <div key={c.f} style={{ position: "absolute", left: i * CHIP_W, width: CHIP_W, top: 0, height: 64, display: "flex", alignItems: "center", justifyContent: "center", ...TYPE.eyebrow, fontSize: 22, color: c.f === cur.f ? COLOR.ink : COLOR.ink3 }}>
            {c.l}
          </div>
        ))}
      </div>
      <Illustrative from={0} to={OUT + 10} />
      <Grain />
    </AbsoluteFill>
  );
};
