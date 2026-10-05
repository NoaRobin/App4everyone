/**
 * 05 — D'où vient la croissance. L'axe de la collecte (fin de la scène 4) devient la ligne de sol d'un pont proportionnel :
 * encours au 31/12 + collecte nette estimée + effet marché = encours du jour. Chaque terme arrive avec son segment ; une
 * accolade d'or prouve que la somme fait le total.
 */
import type React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { evolvePath } from "@remotion/paths";
import { Ambient, ChapterMark, Grain, Illustrative } from "../components/Chrome";
import { enter, prog } from "../lib/anim";
import { BOX4 } from "../lib/chart";
import { md, pct } from "../lib/format";
import { SAMPLE } from "../data/sample";
import { BRAND, COLOR, DIVERGING, EASE, FLOW, LAYOUT, NUMERIC, TYPE, VIDEO } from "../theme";

const BASE = BOX4.axis;
const BAR_H = 120;
const W = BOX4.x1 - BOX4.x0;
const Y = SAMPLE.ytd;
const OUT = 160;

type Term = { key: string; v: number; label: string; color: string; x: number; at: number; sign?: string; unit?: boolean };
const wStart = (Y.start / Y.end) * W, wFlows = (Y.flows / Y.end) * W, wMarket = (Y.market / Y.end) * W;
const SEG = [
  { x: BOX4.x0, w: wStart, color: BRAND.blue, line: COLOR.ink2, at: 20 },
  { x: BOX4.x0 + wStart, w: wFlows, color: FLOW.in, line: COLOR.goldGlow, at: 58 },
  { x: BOX4.x0 + wStart + wFlows, w: wMarket, color: DIVERGING.pos, line: "#9fb8ea", at: 88 },
];
const TERMS: Term[] = [
  { key: "start", v: Y.start, label: "Encours au 31/12", color: COLOR.ink, x: 144, at: 20 },
  { key: "flows", v: Y.flows, label: "Collecte nette estimée", color: COLOR.goldInk, x: 600, at: 58, sign: "+" },
  { key: "market", v: Y.market, label: "Effet marché", color: "#8fb0ee", x: 1000, at: 88, sign: "+" },
  { key: "end", v: Y.end, label: "Encours du jour", color: COLOR.ink, x: 1400, at: 114, sign: "=", unit: true },
];
const TERM_Y = 400;

export const S05Equation: React.FC = () => {
  const frame = useCurrentFrame();
  const out = 1 - prog(frame, OUT, 18, EASE.exit);
  const share = Y.flows / (Y.flows + Y.market);
  return (
    <AbsoluteFill>
      <Ambient />
      <ChapterMark n={4} label="La croissance" out={OUT} />
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 150, ...enter(frame, 4, { dur: 20, out: OUT }) }}>
        <div style={{ ...TYPE.eyebrow, color: COLOR.goldInk, marginBottom: 22 }}>Depuis le 1er janvier</div>
        <div style={{ ...TYPE.title, color: COLOR.ink }}>D'où vient la croissance.</div>
      </div>
      {/* l'équation */}
      {TERMS.map((t) => {
        const c = prog(frame, t.at, 26, EASE.count);
        const a = enter(frame, t.at, { dur: 18, out: OUT });
        return (
          <div key={t.key} style={{ position: "absolute", left: t.x, top: TERM_Y, ...a }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
              {t.sign && <span style={{ ...TYPE.title, color: COLOR.ink3, marginLeft: -76, width: 58, textAlign: "center" }}>{t.sign}</span>}
              <span style={{ ...TYPE.title, color: t.color, ...NUMERIC }}>{md(t.v * c, t.v < 1e10 ? 2 : 1)}</span>
              {t.unit && <span style={{ ...TYPE.lede, fontSize: 52, color: COLOR.goldInk }}>Md€</span>}
            </div>
            <div style={{ ...TYPE.eyebrow, fontSize: 20, color: COLOR.ink3, marginTop: 14 }}>{t.label}</div>
          </div>
        );
      })}
      <svg width={VIDEO.width} height={VIDEO.height} style={{ position: "absolute", inset: 0, opacity: out }}>
        {/* repères : chaque terme rejoint son segment */}
        {TERMS.slice(1, 3).map((t, k) => {
          const i = k + 1;
          const s = SEG[i];
          const cx = s.x + Math.max(s.w, 2) / 2;
          const d = `M ${t.x + 8} ${TERM_Y + 176} L ${t.x + 8} ${TERM_Y + 230} L ${cx} ${BASE - BAR_H - 44} L ${cx} ${BASE - BAR_H - 16}`;
          const ev = evolvePath(prog(frame, t.at + 10, 22, EASE.draw), d);
          return <path key={t.key} d={d} fill="none" stroke={i === 1 ? COLOR.gold : COLOR.line2} strokeWidth={LAYOUT.hairline} strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} />;
        })}
        {/* les segments, bord à bord */}
        {SEG.map((s, i) => {
          const k = prog(frame, s.at, 22, EASE.signature);
          const w = i === 0 ? s.w * k : s.w;
          const dx = i === 0 ? 0 : (1 - k) * -40;
          return (
            <g key={i} opacity={i === 0 ? 1 : k} transform={`translate(${dx} 0)`}>
              <rect x={s.x} y={BASE - BAR_H} width={Math.max(0, w)} height={BAR_H} fill={s.color} opacity={i === 0 ? 0.85 : 1} />
              <rect x={s.x} y={BASE - BAR_H} width={Math.max(0, w)} height={2} fill={s.line} />
            </g>
          );
        })}
        {/* cadre d'or : la somme des trois segments fait l'encours du jour */}
        {(() => {
          const x0 = BOX4.x0 - 8, x1 = BOX4.x1 + 8, y0 = BASE - BAR_H - 8, y1 = BASE + 8;
          const d = `M ${x0} ${y1} L ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} Z`;
          const ev = evolvePath(prog(frame, 116, 30, EASE.draw), d);
          return <path d={d} fill="none" stroke={COLOR.gold} strokeWidth={2} strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} opacity={prog(frame, 116, 4)} />;
        })()}
        <line x1={BOX4.x0} x2={BOX4.x1} y1={BASE} y2={BASE} stroke={COLOR.gold} strokeWidth={2} />
      </svg>
      {/* la lecture */}
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: BASE + 34, display: "flex", alignItems: "baseline", gap: 22, ...enter(frame, 134, { dur: 20, out: OUT }) }}>
        <span style={{ ...TYPE.title, fontSize: 72, color: COLOR.up, ...NUMERIC }}>+{pct(Y.pct)}&nbsp;%</span>
        <span style={{ ...TYPE.lede, fontSize: 40, color: COLOR.ink2 }}>
          depuis le 1er janvier, dont <b style={{ color: COLOR.goldInk, fontWeight: 500 }}>{Math.round(share * 100)}&nbsp;%</b> par la collecte.
        </span>
      </div>
      <Illustrative from={0} to={OUT + 14} />
      <Grain />
    </AbsoluteFill>
  );
};

