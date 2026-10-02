/**
 * Comparateur — briques graphiques 2D et tableau des indicateurs.
 * (Graphique base 100 en SVG pour mobile / sans WebGL, lecture au curseur, carte risque / rendement,
 * classement en barres HTML, tableau comparatif.)
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { gsap } from "../lib/gsap";
import { date as fdate, eur, nav as fnav, num, pct, pctRaw } from "../lib/format";
import { FAMILY_SHORT, famVar } from "../lib/families";
import type { FamilyKey } from "../lib/types";
import { prefersReducedMotion } from "../lib/motion";

// ------------------------------------------------------------------ types
export type Ind = {
  perf_period: number | null; perf_ann: number | null; vol: number | null; mdd: number | null;
  ratio: number | null; sortino: number | null; calmar: number | null; pos_months: number | null;
  best_month: number | null; worst_month: number | null; perf_1M: number | null; perf_YTD: number | null;
  perf_1A: number | null; perf_3A: number | null; te: number | null; aum: number | null; flows_1A: number | null;
  ongoing: number | null; sri: string | null; revenue: number | null; fee_rate: number | null;
};
export type Share = { id: string; nav: number | null; nav_date: string | null; ccy: string | null; bench: string | null } | null;
export type Pt = { t: number; v: number };
export type CFund = {
  id: string; name: string; family: FamilyKey; slot: number; color: string; letter: string;
  pts: Pt[]; share: Share; ind: Partial<Ind>;
};

/**
 * Six teintes catégorielles pour le fond sombre (#060b15), ordre fixe, jamais recyclées.
 * Validées (bande de luminance, chroma, séparation daltonisme ≥ 8 entre voisines, contraste ≥ 3:1) ; l'identité est
 * doublée d'une lettre (A–F) partout où la couleur apparaît.
 */
export const SLOT_COLORS = ["#5f86d4", "#d95926", "#2fa89f", "#b58a45", "#d55181", "#9085e9"];
export const letterOf = (slot: number) => String.fromCharCode(65 + slot);

// ------------------------------------------------------------------ échelles
export function niceStep(range: number, target: number) {
  const raw = range / Math.max(1, target);
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
export function niceTicks(lo: number, hi: number, target = 5): { lo: number; hi: number; ticks: number[] } {
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo, target);
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = a; v <= b + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step);
  return { lo: a, hi: b, ticks };
}
const DAY = 86400000;
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export function timeTicks(t0: number, t1: number, max = 8): number[] {
  const span = t1 - t0, years = span / (365.25 * DAY);
  const steps = [1, 3, 6, 12, 24];
  let stepM = years > 2.5 ? 12 : years > 1.2 ? 6 : years > 0.6 ? 3 : 1;
  const count = () => (span / (stepM * 30.4 * DAY));
  while (count() > max && stepM < 24) stepM = steps[steps.indexOf(stepM) + 1];
  const out: number[] = [];
  const d0 = new Date(t0);
  let y = d0.getUTCFullYear(), m = Math.ceil((d0.getUTCMonth() + (d0.getUTCDate() > 1 ? 1 : 0)) / Math.min(12, stepM)) * Math.min(12, stepM);
  for (let k = 0; k < 60; k++) {
    while (m >= 12) { m -= 12; y += 1; }
    const t = Date.UTC(y, m, 1);
    if (t > t1) break;
    if (t >= t0 + span * 0.03 && t <= t1 - span * 0.03) out.push(t);
    m += stepM;
  }
  return out;
}
export function fmtTime(t: number, span: number): string {
  const d = new Date(t);
  const years = span / (365.25 * DAY);
  if (years > 2.5 || d.getUTCMonth() === 0) return years > 2.5 ? String(d.getUTCFullYear()) : `${MONTHS[0]} ${d.getUTCFullYear()}`;
  return MONTHS[d.getUTCMonth()];
}
export const tDate = (t: number) => fdate(new Date(t).toISOString());
export function nearestIdx(ts: Pt[], t: number): number {
  let lo = 0, hi = ts.length - 1;
  if (hi <= 0) return 0;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m].t < t) lo = m; else hi = m; }
  return Math.abs(ts[lo].t - t) <= Math.abs(ts[hi].t - t) ? lo : hi;
}
/** Valeur base 100 en texte : « 119,46 ». */
export const b100 = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : num(v, 2));

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ------------------------------------------------------------------ lecture au curseur
export type CursorRead = { t: number; idx: (number | null)[] };

export function Readout({ funds, read, style, className = "" }: { funds: CFund[]; read: CursorRead; style?: React.CSSProperties; className?: string }) {
  const rows = funds.map((f, i) => ({ f, p: read.idx[i] != null ? f.pts[read.idx[i]!] : null }))
    .sort((a, b) => (b.p?.v ?? -Infinity) - (a.p?.v ?? -Infinity));
  return (
    <div className={`cmp-read ${className}`} style={style} role="status" aria-live="polite">
      <div className="cmp-read__d">{tDate(read.t)}</div>
      <ul>
        {rows.map(({ f, p }) => (
          <li key={f.id}>
            <span className="cmp-read__k" style={{ background: f.color }} aria-hidden="true" />
            <span className="cmp-read__l">{f.letter}</span>
            <span className="cmp-read__n">{f.name}</span>
            <span className="cmp-read__v num">{b100(p?.v)}</span>
            <span className="cmp-read__p num">{p ? pct(p.v / 100 - 1) : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ graphique base 100, 2D (SVG)
export function Flat2D({ funds, focus, onFocus, compact }: { funds: CFund[]; focus: string | null; onFocus: (id: string | null) => void; compact: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [read, setRead] = useState<CursorRead | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const h = compact ? 320 : 440;
  const m = { l: 46, r: compact ? 14 : 190, t: 14, b: 32 };
  const live = funds.filter((f) => f.pts.length > 1);
  const { t0, t1, y } = useMemo(() => {
    let lo = 100, hi = 100, a = Infinity, b = -Infinity;
    live.forEach((f) => f.pts.forEach((p) => { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); a = Math.min(a, p.t); b = Math.max(b, p.t); }));
    return { t0: a, t1: b, y: niceTicks(lo, hi, compact ? 4 : 6) };
  }, [live, compact]);
  const iw = Math.max(10, w - m.l - m.r), ih = h - m.t - m.b;
  const X = (t: number) => m.l + ((t - t0) / Math.max(1, t1 - t0)) * iw;
  const Y = (v: number) => m.t + (1 - (v - y.lo) / Math.max(1e-9, y.hi - y.lo)) * ih;
  const paths = live.map((f) => f.pts.map((p, k) => `${k ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(""));
  const xt = isFinite(t0) ? timeTicks(t0, t1, Math.max(3, Math.floor(iw / 90))) : [];
  const sig = live.map((f) => f.id + f.pts.length).join("|") + w;

  useEffect(() => {
    if (!svg.current || prefersReducedMotion() || !w) return;
    const ps = svg.current.querySelectorAll<SVGPathElement>("path.cmp2d__line");
    if (!ps.length) return;
    const tw = gsap.fromTo(ps, { strokeDasharray: (i: number, el: SVGPathElement) => { void i; const L = el.getTotalLength(); return `${L} ${L}`; }, strokeDashoffset: (_: number, el: SVGPathElement) => el.getTotalLength() },
      { strokeDashoffset: 0, duration: 1.6, stagger: 0.12, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" });
    return () => { tw.kill(); ps.forEach((p) => { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Étiquettes de fin : seulement si elles ne se chevauchent pas (sinon, la légende et la lecture prennent le relais)
  const ends = useMemo(() => {
    if (compact) return [];
    const items = live.map((f) => ({ f, y: Y(f.pts[f.pts.length - 1].v) })).sort((a, b) => a.y - b.y);
    const out: typeof items = [];
    items.forEach((it) => { if (!out.some((o) => Math.abs(o.y - it.y) < 18)) out.push(it); });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, compact, w, y.lo, y.hi]);

  const move = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !live.length) return;
    const t = t0 + ((Math.min(Math.max(clientX - r.left, m.l), m.l + iw) - m.l) / iw) * (t1 - t0);
    const ref = live.reduce((a, f) => (f.pts.length > a.pts.length ? f : a), live[0]);
    const tt = ref.pts[nearestIdx(ref.pts, t)].t;
    setRead({ t: tt, idx: funds.map((f) => (f.pts.length > 1 && tt >= f.pts[0].t - 4 * DAY && tt <= f.pts[f.pts.length - 1].t + 4 * DAY ? nearestIdx(f.pts, tt) : null)) });
  };
  const cx = read ? X(read.t) : 0;
  // Sur mobile, la lecture reste affichée sous le graphique (dernière date par défaut)
  const lastRead: CursorRead | null = live.length ? { t: t1, idx: funds.map((f) => (f.pts.length > 1 ? nearestIdx(f.pts, t1) : null)) } : null;
  const flip = cx > m.l + iw * 0.55;

  return (
    <div className="cmp2d" ref={ref}>
      {w > 0 && (
        <svg ref={svg} width={w} height={h} role="img" aria-label="Évolution base 100 des fonds comparés"
          onPointerMove={(e) => move(e.clientX)} onPointerDown={(e) => move(e.clientX)} onPointerLeave={() => setRead(null)}>
          {y.ticks.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={m.l + iw} y1={Y(v)} y2={Y(v)} className={v === 100 ? "cmp2d__100" : "cmp2d__grid"} />
              <text x={m.l - 8} y={Y(v)} dy="0.32em" textAnchor="end" className={`cmp2d__tick${v === 100 ? " is-100" : ""}`}>{num(v)}</text>
            </g>
          ))}
          {xt.map((t) => (
            <text key={t} x={X(t)} y={h - 10} textAnchor="middle" className="cmp2d__tick">{fmtTime(t, t1 - t0)}</text>
          ))}
          <line x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} className="cmp2d__axis" />
          {live.map((f, i) => (
            <path key={f.id} d={paths[i]} className="cmp2d__line" stroke={f.color} strokeDasharray={lineDash(f.letter)}
              style={{ opacity: focus && focus !== f.id ? 0.22 : 1, strokeWidth: focus === f.id ? 2.6 : 2 }} />
          ))}
          {live.map((f) => {
            const p = f.pts[f.pts.length - 1];
            return <circle key={f.id} cx={X(p.t)} cy={Y(p.v)} r={4} fill={f.color} className="cmp2d__end" style={{ opacity: focus && focus !== f.id ? 0.3 : 1 }} />;
          })}
          {ends.map(({ f, y: yy }) => (
            <g key={f.id} transform={`translate(${m.l + iw + 12},${yy})`} style={{ opacity: focus && focus !== f.id ? 0.35 : 1 }}
              onPointerEnter={() => onFocus(f.id)} onPointerLeave={() => onFocus(null)}>
              <text className="cmp2d__endl" dy="0.32em"><tspan className="cmp2d__endk">{f.letter}</tspan> {short(f.name, 18)} <tspan className="cmp2d__endv">{b100(f.pts[f.pts.length - 1].v)}</tspan></text>
            </g>
          ))}
          {read && (
            <g pointerEvents="none">
              <line x1={cx} x2={cx} y1={m.t} y2={m.t + ih} className="cmp2d__cross" />
              {funds.map((f, i) => read.idx[i] != null && (
                <circle key={f.id} cx={cx} cy={Y(f.pts[read.idx[i]!].v)} r={4.5} fill={f.color} className="cmp2d__dot" />
              ))}
            </g>
          )}
        </svg>
      )}
      {!compact && read && <Readout funds={funds} read={read} className="cmp-read--float"
        style={{ left: flip ? cx - 16 : cx + 16, transform: flip ? "translateX(-100%)" : undefined, top: 12 }} />}
      {compact && (read ?? lastRead) && <Readout funds={funds} read={(read ?? lastRead)!} className="cmp-read--static" />}
    </div>
  );
}

export const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// ------------------------------------------------------------------ indicateurs : définitions
export type Dir = "up" | "down" | "none";
export type IndRow = { k: keyof Ind | "nav"; label: string; dir: Dir; fmt: (f: CFund) => string; val: (f: CFund) => number | null; bar?: boolean; hint?: string };
const g = (k: keyof Ind) => (f: CFund) => { const v = f.ind[k]; return typeof v === "number" && isFinite(v) ? v : null; };
const P = (k: keyof Ind, label: string, dir: Dir = "up", hint?: string): IndRow => ({ k, label, dir, val: g(k), fmt: (f) => pct(g(k)(f)), bar: true, hint });
export const IND_GROUPS: { label: string; rows: IndRow[] }[] = [
  { label: "Performance", rows: [
    P("perf_period", "Performance sur la période"),
    P("perf_ann", "Performance annualisée"),
    P("perf_1M", "1 mois"),
    P("perf_YTD", "Depuis le 1er janvier"),
    P("perf_1A", "1 an"),
    P("perf_3A", "3 ans, annualisée"),
    P("best_month", "Meilleur mois"),
    P("worst_month", "Pire mois", "up", "le moins mauvais l'emporte"),
    { k: "pos_months", label: "Mois en hausse", dir: "up", val: g("pos_months"), fmt: (f) => pct(g("pos_months")(f), { signed: false, digits: 0 }), bar: true },
  ] },
  { label: "Risque", rows: [
    { k: "vol", label: "Volatilité annualisée", dir: "down", val: g("vol"), fmt: (f) => pct(g("vol")(f), { signed: false }), bar: true },
    P("mdd", "Perte maximale", "up", "la plus faible baisse l'emporte"),
    { k: "te", label: "Écart de suivi", dir: "none", val: g("te"), fmt: (f) => pct(g("te")(f), { signed: false }), bar: true, hint: "par rapport à l'indicateur de référence" },
    { k: "sri", label: "SRI (1 à 7)", dir: "none", val: (f) => (f.ind.sri ? Number(f.ind.sri) : null), fmt: (f) => f.ind.sri ?? "—" },
  ] },
  { label: "Efficacité", rows: [
    { k: "ratio", label: "Ratio rendement / risque", dir: "up", val: g("ratio"), fmt: (f) => num(g("ratio")(f), 2), bar: true },
    { k: "sortino", label: "Sortino", dir: "up", val: g("sortino"), fmt: (f) => num(g("sortino")(f), 2), bar: true },
    { k: "calmar", label: "Calmar", dir: "up", val: g("calmar"), fmt: (f) => num(g("calmar")(f), 2), bar: true },
  ] },
  { label: "Fonds", rows: [
    { k: "aum", label: "Encours", dir: "up", val: g("aum"), fmt: (f) => eur(g("aum")(f)), bar: true },
    { k: "flows_1A", label: "Collecte nette, 1 an", dir: "up", val: g("flows_1A"), fmt: (f) => eur(g("flows_1A")(f), { signed: true }), bar: true },
    { k: "revenue", label: "Revenus de gestion annuels estimés", dir: "up", val: g("revenue"), fmt: (f) => eur(g("revenue")(f)), bar: true },
    { k: "ongoing", label: "Frais courants", dir: "down", val: g("ongoing"), fmt: (f) => pctRaw(g("ongoing")(f)), bar: true },
    { k: "fee_rate", label: "Taux de frais de gestion", dir: "down", val: g("fee_rate"), fmt: (f) => pctRaw(g("fee_rate")(f)), bar: true },
    { k: "nav", label: "Dernière valeur liquidative", dir: "none", val: (f) => f.share?.nav ?? null, fmt: (f) => fnav(f.share?.nav, f.share?.ccy) },
  ] },
];
export const ALL_ROWS = IND_GROUPS.flatMap((x) => x.rows);

/** Identifiants des meilleures valeurs d'une ligne (au moins deux valeurs, pas toutes égales). */
export function bestOf(row: IndRow, funds: CFund[]): Set<string> {
  if (row.dir === "none") return new Set();
  const vals = funds.map((f) => ({ id: f.id, v: row.val(f) })).filter((x): x is { id: string; v: number } => x.v != null);
  if (vals.length < 2) return new Set();
  const best = row.dir === "up" ? Math.max(...vals.map((x) => x.v)) : Math.min(...vals.map((x) => x.v));
  if (vals.every((x) => Math.abs(x.v - best) < 1e-12)) return new Set();
  return new Set(vals.filter((x) => Math.abs(x.v - best) < 1e-12).map((x) => x.id));
}

/** Classement d'une ligne (meilleur d'abord, valeurs absentes en dernier). */
export function ranked(row: IndRow, funds: CFund[]): CFund[] {
  const s = row.dir === "down" ? 1 : -1;
  return [...funds].sort((a, b) => {
    const va = row.val(a), vb = row.val(b);
    if (va == null && vb == null) return a.slot - b.slot;
    if (va == null) return 1;
    if (vb == null) return -1;
    return s * (va - vb) || a.slot - b.slot;
  });
}

// ------------------------------------------------------------------ tableau comparatif
export function IndTable({ funds, focus, onFocus }: { funds: CFund[]; focus: string | null; onFocus: (id: string | null) => void }) {
  return (
    <div className="table-wrap cmp-t__wrap">
      <table className="t cmp-t" style={{ ["--n" as string]: funds.length }}>
        <caption className="sr-only">Indicateurs comparés, un fonds par colonne ; la meilleure valeur de chaque ligne est signalée.</caption>
        <thead>
          <tr>
            <th scope="col" className="cmp-t__corner"><span className="sr-only">Indicateur</span></th>
            {funds.map((f) => (
              <th key={f.id} scope="col" className={`cmp-t__f${focus === f.id ? " is-focus" : ""}`} onMouseEnter={() => onFocus(f.id)} onMouseLeave={() => onFocus(null)}>
                <span className="cmp-t__fh">
                  <span className="cmp-badge" style={{ background: f.color }} aria-hidden="true">{f.letter}</span>
                  <Link to={`/fonds/${f.id}`} className="cmp-t__fn link" onFocus={() => onFocus(f.id)} onBlur={() => onFocus(null)}>{f.name}</Link>
                </span>
                <span className="cmp-t__fs"><span className="dot" style={{ background: famVar(f.family, true) }} /> {FAMILY_SHORT[f.family] ?? "Non classé"}{f.share?.id ? <> · <span className="mono">{f.share.id}</span></> : null}</span>
              </th>
            ))}
          </tr>
        </thead>
        {IND_GROUPS.map((grp) => (
          <tbody key={grp.label}>
            <tr className="cmp-t__g"><th scope="rowgroup" colSpan={funds.length + 1}>{grp.label}</th></tr>
            {grp.rows.map((row) => {
              const best = bestOf(row, funds);
              const maxAbs = Math.max(1e-12, ...funds.map((f) => Math.abs(row.val(f) ?? 0)));
              return (
                <tr key={row.k}>
                  <th scope="row" className="cmp-t__l">
                    <span>{row.label}</span>
                    {row.dir !== "none" && <span className="cmp-t__dir" title={row.dir === "up" ? "Plus haut = meilleur" : "Plus bas = meilleur"}>{row.dir === "up" ? "↑" : "↓"}<span className="sr-only">{row.dir === "up" ? " plus haut = meilleur" : " plus bas = meilleur"}</span></span>}
                    {row.hint && <span className="cmp-t__hint">{row.hint}</span>}
                  </th>
                  {funds.map((f) => {
                    const v = row.val(f);
                    const isBest = best.has(f.id);
                    return (
                      <td key={f.id} className={`n cmp-t__c${isBest ? " is-best" : ""}${focus === f.id ? " is-focus" : ""}${focus && focus !== f.id ? " is-dim" : ""}`}
                        onMouseEnter={() => onFocus(f.id)} onMouseLeave={() => onFocus(null)}>
                        <span className="cmp-t__v">{isBest && <span className="cmp-t__star" aria-hidden="true" />}{row.fmt(f)}{isBest && <span className="sr-only"> (meilleure valeur)</span>}</span>
                        {row.bar && v != null && (
                          <span className="cmp-t__bar" aria-hidden="true">
                            <span style={{ width: `${Math.max(2, (Math.abs(v) / maxAbs) * 100)}%`, background: f.color, opacity: v < 0 ? 0.45 : 1 }} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ classement en barres (repli du podium 3D)
export function RankBars({ funds, row, focus, onFocus }: { funds: CFund[]; row: IndRow; focus: string | null; onFocus: (id: string | null) => void }) {
  const list = ranked(row, funds);
  const vals = list.map((f) => row.val(f)).filter((v): v is number => v != null);
  const maxAbs = Math.max(1e-12, ...vals.map(Math.abs));
  const neg = vals.some((v) => v < 0), pos = vals.some((v) => v > 0);
  const zero = neg && pos ? (Math.abs(Math.min(...vals)) / (Math.abs(Math.min(...vals)) + Math.max(...vals))) * 100 : neg ? 100 : 0;
  const scale = neg && pos ? Math.abs(Math.min(...vals)) + Math.max(...vals) : maxAbs;
  return (
    <ol className="cmp-rank">
      {list.map((f, i) => {
        const v = row.val(f);
        const wpct = v == null ? 0 : (Math.abs(v) / scale) * 100;
        return (
          <li key={f.id} className={focus && focus !== f.id ? "is-dim" : ""} onMouseEnter={() => onFocus(f.id)} onMouseLeave={() => onFocus(null)}>
            <span className="cmp-rank__i num">{v == null ? "—" : i === 0 ? "1er" : `${i + 1}e`}</span>
            <span className="cmp-badge" style={{ background: f.color }} aria-hidden="true">{f.letter}</span>
            <span className="cmp-rank__n">{f.name}</span>
            <span className="cmp-rank__v num">{row.fmt(f)}</span>
            <span className="cmp-rank__track" aria-hidden="true">
              {neg && pos && <span className="cmp-rank__zero" style={{ left: `${zero}%` }} />}
              {v != null && <span className="cmp-rank__bar" style={{ background: f.color, width: `${Math.max(0.8, wpct)}%`, left: v < 0 ? `${zero - wpct}%` : `${zero}%`, opacity: v < 0 ? 0.6 : 1 }} />}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ carte risque / rendement
export function RiskMap({ funds, focus, onFocus, periodLabel }: { funds: CFund[]; focus: string | null; onFocus: (id: string | null) => void; periodLabel: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = w < 480 ? 300 : 380;
  const m = { l: 52, r: 18, t: 36, b: 42 };
  const pts = funds.filter((f) => f.ind.vol != null && f.ind.perf_ann != null);
  const off = funds.filter((f) => !pts.includes(f));
  const maxV = Math.max(0.01, ...pts.map((f) => f.ind.vol!));
  const xs = niceTicks(0, maxV * 1.12, 4);
  const ys = niceTicks(Math.min(0, ...pts.map((f) => f.ind.perf_ann!)), Math.max(0.01, ...pts.map((f) => f.ind.perf_ann!)), 4);
  const iw = Math.max(10, w - m.l - m.r), ih = h - m.t - m.b;
  const pad = 18; // marge intérieure : un disque proche de 0 % ne recouvre pas les graduations
  const X = (v: number) => m.l + pad + (v / xs.hi) * (iw - pad);
  const Y = (v: number) => m.t + (1 - (v - ys.lo) / (ys.hi - ys.lo)) * ih;
  const maxAum = Math.max(1, ...pts.map((f) => f.ind.aum ?? 0));
  const R = (f: CFund) => 9 + 15 * Math.sqrt((f.ind.aum ?? 0) / maxAum);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!svg.current || prefersReducedMotion() || !w) return;
    const dots = svg.current.querySelectorAll(".cmprr__in");
    if (!dots.length) return;
    const tw = gsap.fromTo(dots, { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.8, stagger: 0.07, ease: "back.out(1.8)", clearProps: "transform" });
    return () => { tw.kill(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts.map((f) => f.id).join(","), w > 0]);
  // Repères d'iso-ratio : rendement / volatilité = 0,5 et 1
  const guide = (k: number) => {
    const xEnd = Math.min(xs.hi, ys.hi / k);
    return { x1: X(0), y1: Y(0), x2: X(xEnd), y2: Y(k * xEnd), lx: X(xEnd), ly: Y(k * xEnd) };
  };
  const hov = pts.find((f) => f.id === focus);
  const dig = (t: number[]) => { const st = t.length > 1 ? t[1] - t[0] : 1; return st >= 0.01 - 1e-12 ? 0 : st >= 0.001 - 1e-12 ? 1 : 2; };
  const dx = dig(xs.ticks), dy = dig(ys.ticks);
  return (
    <div className="cmprr" ref={ref}>
      {w > 0 && pts.length === 0 && <div className="empty cmprr__empty">Aucun fonds n'a d'historique suffisant sur la période pour situer son couple risque / rendement.</div>}
      {w > 0 && pts.length > 0 && (
        <svg ref={svg} width={w} height={h} role="img" aria-label={`Volatilité et performance annualisées sur ${periodLabel}`}>
          {ys.ticks.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={m.l + iw} y1={Y(v)} y2={Y(v)} className={Math.abs(v) < 1e-12 ? "cmprr__zero" : "cmprr__grid"} />
              <text x={m.l - 8} y={Y(v)} dy="0.32em" textAnchor="end" className="cmprr__tick">{pct(v, { digits: dy })}</text>
            </g>
          ))}
          {xs.ticks.map((v) => (
            <text key={v} x={X(v)} y={m.t + ih + 18} textAnchor="middle" className="cmprr__tick">{pct(v, { signed: false, digits: dx })}</text>
          ))}
          <line x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} className="cmprr__axis" />
          <text x={m.l + iw} y={h - 4} textAnchor="end" className="cmprr__axl">Volatilité annualisée →</text>
          <text x={m.l - 44} y={m.t - 22} className="cmprr__axl">↑ Performance annualisée</text>
          {[0.5, 1].map((k) => {
            const gd = guide(k);
            if (gd.x2 <= gd.x1 + 20) return null;
            // Étiquette du repère masquée si un disque la recouvrirait
            const lx = gd.lx - 4, ly = gd.ly + 14;
            const clash = pts.some((f) => Math.hypot(X(f.ind.vol!) - (lx - 18), Y(f.ind.perf_ann!) - (ly - 4)) < R(f) + 22);
            return (
              <g key={k}>
                <line x1={gd.x1} y1={gd.y1} x2={gd.x2} y2={gd.y2} className="cmprr__guide" />
                {!clash && <text x={lx} y={ly} textAnchor="end" className="cmprr__gl">ratio {num(k, k < 1 ? 1 : 0)}</text>}
              </g>
            );
          })}
          {[...pts].sort((a, b) => R(b) - R(a)).map((f) => (
            <g key={f.id} className="cmprr__dot" style={{ transform: `translate(${X(f.ind.vol!)}px, ${Y(f.ind.perf_ann!)}px)`, opacity: focus && focus !== f.id ? 0.3 : 1 }}
              onPointerEnter={() => onFocus(f.id)} onPointerLeave={() => onFocus(null)} tabIndex={0} onFocus={() => onFocus(f.id)} onBlur={() => onFocus(null)}
              aria-label={`${f.name} : volatilité ${pct(f.ind.vol, { signed: false })}, performance annualisée ${pct(f.ind.perf_ann)}, encours ${eur(f.ind.aum)}`}>
              <g className="cmprr__in">
                <rect x={-Math.max(R(f), 14)} y={-Math.max(R(f), 14)} width={Math.max(R(f), 14) * 2} height={Math.max(R(f), 14) * 2} fill="transparent" />
                <rect x={-R(f)} y={-R(f)} width={R(f) * 2} height={R(f) * 2} fill={f.color} fillOpacity={0.18} stroke={f.color} strokeWidth={1.5} />
                <rect x={-6} y={-6} width={12} height={12} fill={f.color} stroke="var(--paper)" strokeWidth={2} transform="rotate(45)" />
                <text dy="0.34em" textAnchor="middle" className="cmprr__l">{f.letter}</text>
              </g>
            </g>
          ))}
        </svg>
      )}
      {hov && (
        <div className="cmprr__tip" style={{ left: X(hov.ind.vol!), top: Y(hov.ind.perf_ann!) - R(hov) - 10 }} role="status">
          <div className="cmprr__tip-n"><span className="cmp-badge" style={{ background: hov.color }}>{hov.letter}</span>{hov.name}</div>
          <div className="cmprr__tip-g num">
            <span>Perf. ann.</span><b>{pct(hov.ind.perf_ann)}</b>
            <span>Volatilité</span><b>{pct(hov.ind.vol, { signed: false })}</b>
            <span>Ratio</span><b>{num(hov.ind.ratio, 2)}</b>
            <span>Encours</span><b>{eur(hov.ind.aum)}</b>
          </div>
        </div>
      )}
      <p className="small muted cmprr__note">{pts.length > 0 && "Taille du carré : encours. "}{off.length > 0 && <>Sans historique suffisant sur la période&nbsp;: {off.map((f) => f.name).join(", ")}.</>}</p>
    </div>
  );
}

export function Badge({ f }: { f: CFund }): ReactNode {
  return <span className="cmp-badge" style={{ background: f.color }} aria-hidden="true">{f.letter}</span>;
}

/** Style de trait par fonds (A plein, B tirets, C pointillés…) : l'identité ne repose jamais sur la seule couleur. */
export function lineDash(letter: string | null | undefined): string | undefined {
  return ({ A: undefined, B: "9 5", C: "2 5", D: "14 4 3 4", E: "6 3", F: "1 3" } as Record<string, string | undefined>)[letter ?? "A"];
}
