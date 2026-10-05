/**
 * 06 — Ce qui rapporte. La cité des revenus en isométrie : une tour par fonds (hauteur = revenus de gestion estimés),
 * quatre quartiers de familles autour d'une place carrée, les plus gros fonds au centre. Les tours montent du plus gros au
 * plus petit ; puis seuls les 22 fonds qui font 80 % des revenus restent allumés. Lente orbite de 12°.
 */
import type React from "react";
import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Ambient, ChapterMark, Grain, Illustrative } from "../components/Chrome";
import { enter, hash, mix, prog } from "../lib/anim";
import { mn, pct } from "../lib/format";
import { SAMPLE } from "../data/sample";
import { COLOR, EASE, FAMILY, type FamilyKey, LAYOUT, NUMERIC, TYPE, VIDEO } from "../theme";

const CX = 1300, CY = 680, S = 52;
const COS = Math.cos(Math.PI / 6), SIN = Math.sin(Math.PI / 6);
const HMAX = 6.6, HALF = 0.31, PITCH = 1.02, PLAZA = 0.95;
const QUAD: Record<string, [number, number]> = { ae: [-1, -1], aid: [1, -1], fi: [-1, 1], ao: [1, 1], nc: [1, 1] };
const DIM_AT = 118, OUT = 206;

type Tower = { name: string; family: FamilyKey; revenue: number; x: number; y: number; h: number; rank: number; top: boolean };

function rgb(hex: string) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(hex: string, k: number, lift = 0) {
  const [r, g, b] = rgb(hex);
  const f = (c: number) => Math.round(Math.min(255, c * k + (255 - c * k) * lift));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function layout(): Tower[] {
  const funds = SAMPLE.revenue.funds;
  const max = funds[0].revenue;
  const cells: [number, number][] = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) cells.push([i, j]);
  cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || Math.abs(a[0] - a[1]) - Math.abs(b[0] - b[1]));
  const used: Record<string, number> = {};
  return funds.map((f, rank) => {
    const fam = (f.family in FAMILY ? f.family : "nc") as FamilyKey;
    const q = QUAD[fam];
    const c = cells[(used[fam] = (used[fam] ?? -1) + 1)];
    return { name: f.name, family: fam, revenue: f.revenue, rank, top: rank < SAMPLE.revenue.nFor80,
      x: q[0] * (PLAZA + c[0] * PITCH), y: q[1] * (PLAZA + c[1] * PITCH), h: Math.max(0.12, (f.revenue / max) * HMAX) };
  });
}

export const S06City: React.FC = () => {
  const frame = useCurrentFrame();
  const towers = useMemo(layout, []);
  const th = ((-9 + 12 * prog(frame, 0, 240, EASE.premium)) * Math.PI) / 180;
  const ct = Math.cos(th), st = Math.sin(th);
  const rot = (x: number, y: number) => [x * ct - y * st, x * st + y * ct] as const;
  const P = (x: number, y: number, z: number) => [CX + (x - y) * COS * S, CY + (x + y) * SIN * S - z * S] as const;
  const dim = prog(frame, DIM_AT, 22, EASE.premium);
  const sink = prog(frame, OUT, 26, EASE.exit);

  const ordered = towers.map((t) => { const [rx, ry] = rot(t.x, t.y); return { t, rx, ry }; }).sort((a, b) => a.rx + a.ry - (b.rx + b.ry));
  const polys: React.ReactNode[] = [];
  const streaks: React.ReactNode[] = [];
  let first: [number, number] | null = null;
  ordered.forEach(({ t, rx, ry }) => {
    const grow = prog(frame, 14 + t.rank * 1.15, 34, EASE.signature) * (1 - sink);
    const h = t.h * grow;
    if (h <= 0.002) return;
    const col = FAMILY[t.family].color;
    const op = t.top ? 1 : mix(1, 0.2, dim);
    const corners = [[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF]].map(([dx, dy]) => { const [a, b] = rot(t.x + dx, t.y + dy); return [a, b] as const; });
    const top = corners.map(([a, b]) => P(a, b, h));
    const bot = corners.map(([a, b]) => P(a, b, 0));
    // faces latérales tournées vers le spectateur (normale orientée vers +x+y)
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const nx = corners[j][1] - corners[i][1], ny = -(corners[j][0] - corners[i][0]);
      if (nx + ny <= 0) continue;
      const light = 0.42 + 0.3 * Math.max(0, (nx - ny) / Math.hypot(nx, ny));
      polys.push(<polygon key={`${t.rank}-${i}`} points={[bot[i], bot[j], top[j], top[i]].map((p) => p.join(",")).join(" ")} fill={shade(col, light)} opacity={op} />);
    }
    polys.push(<polygon key={`${t.rank}-t`} points={top.map((p) => p.join(",")).join(" ")} fill={shade(col, 1, 0.28)} stroke={COLOR.goldGlow} strokeWidth={t.top ? 1 : 0.5} strokeOpacity={0.6 * op} opacity={op} />);
    const c = P(rx, ry, h);
    if (t.rank === 0) first = [c[0], c[1]];
    if (t.top && grow > 0.95) {
      const flick = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(frame / 9 + hash(t.rank) * 6));
      const len = 50 + hash(t.rank + 3) * 90;
      streaks.push(<line key={`s${t.rank}`} x1={c[0]} y1={c[1] - 6} x2={c[0]} y2={c[1] - 6 - len} stroke="url(#streak)" strokeWidth={1.5} opacity={flick * (1 - sink)} />);
    }
  });
  // sol : place carrée et carrés concentriques
  const ring = (r: number) => [[-r, -r], [r, -r], [r, r], [-r, r]].map(([a, b]) => { const [x, y] = rot(a, b); return P(x, y, 0).join(","); }).join(" ");
  const ground = prog(frame, 0, 24) * (1 - sink * 0.6);
  const f1 = first as [number, number] | null;
  const lab = prog(frame, 150, 22, EASE.signature) * (1 - prog(frame, OUT - 6, 14, EASE.exit));

  return (
    <AbsoluteFill>
      <Ambient glow={1.2} />
      <svg width={VIDEO.width} height={VIDEO.height} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="streak" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor={COLOR.goldGlow} stopOpacity={1} /><stop offset="100%" stopColor={COLOR.goldGlow} stopOpacity={0} /></linearGradient>
        </defs>
        <g opacity={ground}>
          {[1.6, 3.2, 4.6, 5.8].map((r, i) => <polygon key={r} points={ring(r)} fill="none" stroke={COLOR.line2} strokeWidth={LAYOUT.hairline} opacity={0.9 - i * 0.18} />)}
          <polygon points={ring(0.55)} fill="none" stroke={COLOR.gold} strokeWidth={1.5} opacity={0.8} />
        </g>
        {polys}
        {streaks}
        {f1 && lab > 0 && (
          <g opacity={lab}>
            <path d={`M ${f1[0]} ${f1[1] - 4} L ${f1[0]} ${f1[1] - 60} L ${f1[0] + 70} ${f1[1] - 60}`} fill="none" stroke={COLOR.gold} strokeWidth={1.5} />
          </g>
        )}
      </svg>
      {f1 && (
        <div style={{ position: "absolute", left: f1[0] + 78, top: f1[1] - 98, opacity: lab, display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", background: "rgba(6,11,21,0.86)", border: `1px solid ${COLOR.line2}`, borderTop: `2px solid ${COLOR.gold}` }}>
          <span style={{ width: 34, height: 34, background: COLOR.gold, color: COLOR.paper, ...TYPE.label, fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>1</span>
          <span>
            <div style={{ ...TYPE.label, fontSize: 26, color: COLOR.ink }}>{SAMPLE.revenue.funds[0].name}</div>
            <div style={{ ...TYPE.label, fontSize: 22, color: COLOR.goldInk, ...NUMERIC }}>{mn(SAMPLE.revenue.funds[0].revenue, 1)} M€ / an</div>
          </span>
        </div>
      )}

      <ChapterMark n={5} label="Ce qui rapporte" out={OUT} />
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 150, ...enter(frame, 10, { dur: 22, out: OUT - 4 }) }}>
        <div style={{ ...TYPE.eyebrow, color: COLOR.goldInk, marginBottom: 6 }}>Revenus de gestion estimés</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
          <span style={{ ...TYPE.hero, fontSize: 300, color: COLOR.ink, ...NUMERIC }}>{mn(SAMPLE.revenue.total * prog(frame, 24, 46, EASE.count))}</span>
          <span style={{ ...TYPE.title, color: COLOR.goldInk }}>M€</span>
        </div>
        <div style={{ ...TYPE.lede, fontSize: 40, color: COLOR.ink2, marginTop: 6 }}>par an, sur les encours d'aujourd'hui.</div>
      </div>
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 640, maxWidth: 640, ...enter(frame, DIM_AT, { dur: 22, out: OUT - 4 }) }}>
        <div style={{ ...TYPE.title, fontSize: 72, color: COLOR.ink }}>
          <span style={{ color: COLOR.goldInk, ...NUMERIC }}>{SAMPLE.revenue.nFor80}</span> fonds font 80&nbsp;% des revenus.
        </div>
      </div>
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 852, display: "flex", flexWrap: "wrap", gap: "12px 28px", maxWidth: 760, ...enter(frame, 80, { dur: 18, out: OUT - 4 }) }}>
        {SAMPLE.revenue.families.map((f) => (
          <span key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, ...TYPE.tick, color: COLOR.ink2 }}>
            <i style={{ width: 12, height: 12, background: FAMILY[f.key as FamilyKey].color }} />
            {FAMILY[f.key as FamilyKey].short}
            <b style={{ color: COLOR.goldInk, fontWeight: 500, ...NUMERIC }}>{pct(f.share ?? 0, 0)}&nbsp;%</b>
          </span>
        ))}
      </div>
      <Illustrative from={6} to={OUT + 30} />
      <Grain />
    </AbsoluteFill>
  );
};
