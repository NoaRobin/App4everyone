import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { scaleLinear, scaleTime, scaleBand } from "d3-scale";
import { area, line, curveMonotoneX, stack, stackOrderNone, stackOffsetNone } from "d3-shape";
import { date as fdate, eur, monthYear, num } from "../lib/format";
import type { Point } from "../lib/types";

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    setW(ref.current.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const parse = (d: string) => new Date(d + "T00:00:00");

function timeTicks(x: ReturnType<typeof scaleTime<number, number>>, width: number) {
  const n = Math.max(2, Math.min(7, Math.floor(width / 110)));
  return x.ticks(n);
}
function tickLabel(d: Date, spanDays: number) {
  const iso = d.toISOString().slice(0, 10);
  if (spanDays > 700) return d.getMonth() === 0 ? String(d.getFullYear()) : monthYear(iso);
  return monthYear(iso);
}

export type Series = { key: string; label: string; color: string; points: Point[]; dashed?: boolean; fill?: boolean };

/**
 * Graphique temporel : une ou plusieurs courbes, un seul axe vertical,
 * réticule + infobulle au survol et au clavier (flèches gauche/droite).
 */
export function TimeChart({ series, height = 300, format = eur, yLabel, baseline, endLabels = true, ariaLabel }:
  { series: Series[]; height?: number; format?: (v: number) => string; yLabel?: string; baseline?: number; endLabels?: boolean; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const main = series[0]?.points ?? [];
  const multi = endLabels && series.length > 1;
  const m = { t: 16, r: multi ? 96 : 64, b: 30, l: multi ? 44 : 8 };
  const W = Math.max(width, 280), H = height;
  const { x, y, dates } = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    const xs = main.map((p) => parse(p.d));
    const x = scaleTime().domain([xs[0] ?? new Date(), xs[xs.length - 1] ?? new Date()]).range([m.l, W - m.r]);
    let lo = Math.min(...all.map((p) => p.v)), hi = Math.max(...all.map((p) => p.v));
    if (baseline != null) { lo = Math.min(lo, baseline); hi = Math.max(hi, baseline); }
    if (series.some((s) => s.fill)) lo = Math.min(0, lo);
    const pad = (hi - lo) * 0.08 || 1;
    const y = scaleLinear().domain([series.some((s) => s.fill) ? lo : lo - pad, hi + pad]).nice(4).range([H - m.b, m.t]);
    return { x, y, dates: xs };
  }, [series, W, H]);
  if (!main.length) return <div className="empty">Aucune donnée sur la période.</div>;
  const spanDays = (dates[dates.length - 1].getTime() - dates[0].getTime()) / 864e5;
  const idxAt = (px: number) => {
    const t = x.invert(px).getTime();
    let lo = 0, hi = dates.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (dates[mid].getTime() < t) lo = mid; else hi = mid; }
    return Math.abs(dates[lo].getTime() - t) < Math.abs(dates[hi].getTime() - t) ? lo : hi;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = e.shiftKey ? 20 : 1;
      setHover((h) => Math.max(0, Math.min(dates.length - 1, (h ?? dates.length - 1) + (e.key === "ArrowRight" ? step : -step))));
    } else if (e.key === "Escape") setHover(null);
  };
  const hi = hover ?? null;
  const tip = hi != null ? { d: main[hi].d, vals: series.map((s) => ({ s, v: valueAt(s.points, main[hi].d) })) } : null;
  const hx = hi != null ? x(dates[hi]) : 0;
  const last = main[main.length - 1];
  return (
    <div ref={ref} className="chart">
      <svg width={W} height={H} role="img" aria-label={ariaLabel} tabIndex={0} onKeyDown={onKey}
        onPointerMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); setHover(idxAt(e.clientX - r.left)); }}
        onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)}>
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className="chart__grid" />
            <text x={multi ? m.l - 8 : W - m.r + 8} y={y(t)} dy="0.32em" textAnchor={multi ? "end" : "start"} className="chart__tick">{format(t)}</text>
          </g>
        ))}
        {baseline != null && <line x1={m.l} x2={W - m.r} y1={y(baseline)} y2={y(baseline)} className="chart__base" />}
        {timeTicks(x, W).map((t) => (
          <text key={t.getTime()} x={x(t)} y={H - 8} textAnchor="middle" className="chart__tick">{tickLabel(t, spanDays)}</text>
        ))}
        {series.map((s) => {
          const pts = s.points.map((p) => [x(parse(p.d)), y(p.v)] as [number, number]);
          const ln = line().curve(curveMonotoneX)(pts) ?? "";
          const ar = s.fill ? area().curve(curveMonotoneX).y0(y(Math.max(0, y.domain()[0])))(pts) ?? "" : null;
          return (
            <g key={s.key}>
              {ar && <path className="area" d={ar} fill={s.color} opacity={0.1} />}
              <path className={s.dashed ? undefined : "draw"} d={ln} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" />
            </g>
          );
        })}
        {multi && (() => {
          const ends = series.map((s) => ({ s, p: s.points[s.points.length - 1] })).filter((e) => e.p).map((e) => ({ ...e, y: y(e.p.v) })).sort((a, b) => a.y - b.y);
          for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
          return ends.map((e) => <text key={e.s.key} x={W - m.r + 10} y={e.y} dy="0.32em" className="chart__end" fill="currentColor">{e.s.label}</text>);
        })()}
        {hi != null && (
          <g>
            <line x1={hx} x2={hx} y1={m.t} y2={H - m.b} className="chart__cross" />
            {tip!.vals.map(({ s, v }) => v != null && <circle key={s.key} cx={hx} cy={y(v)} r={4.5} fill={s.color} stroke="var(--card)" strokeWidth={2} />)}
          </g>
        )}
        {hi == null && <circle cx={x(parse(last.d))} cy={y(last.v)} r={4} fill={series[0].color} stroke="var(--card)" strokeWidth={2} />}
      </svg>
      {tip && (
        <div className="chart__tip" style={{ left: Math.min(Math.max(hx, 90), W - 90) }} role="status">
          <div className="chart__tip-d">{fdate(tip.d)}</div>
          {tip.vals.map(({ s, v }) => (
            <div key={s.key} className="chart__tip-row"><span className="dot" style={{ background: s.color }} />{series.length > 1 && <span>{s.label}</span>}<b className="num">{v == null ? "—" : format(v)}</b></div>
          ))}
        </div>
      )}
      {yLabel && <div className="sr-only">{yLabel}</div>}
    </div>
  );
}

function valueAt(points: Point[], d: string): number | null {
  let lo = 0, hi = points.length - 1;
  if (hi < 0 || points[0].d > d) return null;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (points[mid].d <= d) lo = mid; else hi = mid - 1; }
  return points[lo].v;
}

/** Aires empilées (encours par famille, fin de mois). */
export function StackedArea({ layers, height = 320, ariaLabel }: { layers: Series[]; height?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const W = Math.max(width, 280), H = height, m = { t: 12, r: 70, b: 30, l: 4 };
  const months = layers[0]?.points.map((p) => p.d) ?? [];
  const rows = months.map((d, i) => Object.fromEntries([["d", d], ...layers.map((l) => [l.key, l.points[i]?.v ?? 0])]));
  const st = stack<Record<string, number | string>>().keys(layers.map((l) => l.key)).value((r, k) => Number(r[k]) || 0).order(stackOrderNone).offset(stackOffsetNone)(rows);
  const x = scaleTime().domain([parse(months[0] ?? "2020-01-01"), parse(months[months.length - 1] ?? "2020-01-01")]).range([m.l, W - m.r]);
  const top = Math.max(1, ...st[st.length - 1]?.map((p) => p[1]) ?? [1]);
  const y = scaleLinear().domain([0, top]).nice(4).range([H - m.b, m.t]);
  if (!months.length) return null;
  const spanDays = (parse(months[months.length - 1]).getTime() - parse(months[0]).getTime()) / 864e5;
  const onMove = (px: number) => {
    const t = x.invert(px).getTime();
    let best = 0;
    months.forEach((d, i) => { if (Math.abs(parse(d).getTime() - t) < Math.abs(parse(months[best]).getTime() - t)) best = i; });
    setHover(best);
  };
  const hx = hover != null ? x(parse(months[hover])) : 0;
  return (
    <div ref={ref} className="chart">
      <svg width={W} height={H} role="img" aria-label={ariaLabel} tabIndex={0}
        onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.max(0, Math.min(months.length - 1, (h ?? months.length - 1) + (e.key === "ArrowRight" ? 1 : -1)))); } }}
        onPointerMove={(e) => onMove(e.clientX - (e.currentTarget as SVGSVGElement).getBoundingClientRect().left)} onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)}>
        {y.ticks(4).map((t) => (
          <g key={t}><line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className="chart__grid" /><text x={W - m.r + 8} y={y(t)} dy="0.32em" className="chart__tick">{eur(t)}</text></g>
        ))}
        {timeTicks(x, W).map((t) => <text key={t.getTime()} x={x(t)} y={H - 8} textAnchor="middle" className="chart__tick">{tickLabel(t, spanDays)}</text>)}
        {st.map((s, i) => {
          const a = area<[number, number]>().curve(curveMonotoneX).x((_, j) => x(parse(months[j]))).y0((p) => y(p[0])).y1((p) => y(p[1]))(s.map((p) => [p[0], p[1]] as [number, number])) ?? "";
          const topLine = line<[number, number]>().curve(curveMonotoneX).x((_, j) => x(parse(months[j]))).y((p) => y(p[1]))(s.map((p) => [p[0], p[1]] as [number, number])) ?? "";
          return (
            <g key={s.key}>
              <path d={a} fill={layers[i].color} opacity={0.88} />
              <path d={topLine} fill="none" stroke="var(--card)" strokeWidth={1.5} />
            </g>
          );
        })}
        {hover != null && <line x1={hx} x2={hx} y1={m.t} y2={H - m.b} className="chart__cross" />}
      </svg>
      {hover != null && (
        <div className="chart__tip" style={{ left: Math.min(Math.max(hx, 120), W - 120) }} role="status">
          <div className="chart__tip-d">{monthYear(months[hover], true)}</div>
          {[...layers].reverse().map((l) => (
            <div key={l.key} className="chart__tip-row"><span className="dot" style={{ background: l.color }} /><span>{l.label}</span><b className="num">{eur(l.points[hover]?.v)}</b></div>
          ))}
          <div className="chart__tip-row chart__tip-total"><span>Total</span><b className="num">{eur(layers.reduce((s, l) => s + (l.points[hover]?.v ?? 0), 0))}</b></div>
        </div>
      )}
    </div>
  );
}

/** Barres mensuelles de part et d'autre de zéro (collecte nette estimée). */
export function FlowBars({ points, height = 220, ariaLabel }: { points: Point[]; height?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const W = Math.max(width, 280), H = height, m = { t: 10, r: 64, b: 28, l: 4 };
  const x = scaleBand<string>().domain(points.map((p) => p.d)).range([m.l, W - m.r]).paddingInner(0.28);
  const lo = Math.min(0, ...points.map((p) => p.v)), hi = Math.max(0, ...points.map((p) => p.v));
  const y = scaleLinear().domain([lo, hi === lo ? 1 : hi]).nice(4).range([H - m.b, m.t]);
  if (!points.length) return <div className="empty">Aucun flux sur la période.</div>;
  return (
    <div ref={ref} className="chart">
      <svg width={W} height={H} role="img" aria-label={ariaLabel}>
        {y.ticks(4).map((t) => <g key={t}><line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? "chart__base" : "chart__grid"} /><text x={W - m.r + 8} y={y(t)} dy="0.32em" className="chart__tick">{eur(t, { signed: t !== 0 })}</text></g>)}
        {points.map((p, i) => {
          const h = Math.abs(y(p.v) - y(0));
          const bw = x.bandwidth();
          const top = p.v >= 0 ? y(p.v) : y(0);
          const r = Math.min(4, bw / 2, h);
          const path = p.v >= 0
            ? `M${x(p.d)},${y(0)}V${top + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${y(0)}Z`
            : `M${x(p.d)},${y(0)}V${top + h - r}q0,${r} ${r},${r}h${bw - 2 * r}q${r},0 ${r},-${r}V${y(0)}Z`;
          return (
            <g key={p.d} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              role="img" aria-label={`${monthYear(p.d, true)} : ${eur(p.v, { signed: true })}`}>
              <rect x={(x(p.d) ?? 0) - x.step() * 0.14} y={m.t} width={x.step()} height={H - m.t - m.b} fill="transparent" />
              <path d={h < 0.5 ? "" : path} className={p.v >= 0 ? "bar--pos" : "bar--neg"} opacity={hover == null || hover === i ? 1 : 0.45} />
            </g>
          );
        })}
        {points.filter((_, i) => i % Math.ceil(points.length / Math.max(2, Math.floor(W / 90))) === 0).map((p) => (
          <text key={p.d} x={(x(p.d) ?? 0) + x.bandwidth() / 2} y={H - 8} textAnchor="middle" className="chart__tick">{monthYear(p.d)}</text>
        ))}
      </svg>
      {hover != null && (
        <div className="chart__tip" style={{ left: Math.min(Math.max((x(points[hover].d) ?? 0) + x.bandwidth() / 2, 90), W - 90) }} role="status">
          <div className="chart__tip-d">{monthYear(points[hover].d, true)}</div>
          <div className="chart__tip-row"><span>Collecte nette estimée</span><b className="num">{eur(points[hover].v, { signed: true })}</b></div>
        </div>
      )}
    </div>
  );
}

/** Liste de barres horizontales : lisible, cliquable, directement étiquetée. */
export function BarList<T>({ items, value, label, color, sub, onSelect, format = eur, max, right }:
  { items: T[]; value: (t: T) => number; label: (t: T) => ReactNode; color?: (t: T) => string; sub?: (t: T) => ReactNode;
    onSelect?: (t: T) => void; format?: (v: number) => string; max?: number; right?: (t: T) => ReactNode }) {
  const mx = max ?? Math.max(1e-9, ...items.map((i) => Math.abs(value(i))));
  return (
    <ul className="barlist" role="list">
      {items.map((it, i) => {
        const v = value(it);
        const content = (
          <>
            <span className="barlist__label">{label(it)}{sub && <span className="barlist__sub">{sub(it)}</span>}</span>
            <span className="barlist__val num">{right ? right(it) : format(v)}</span>
            <span className="barlist__track" aria-hidden="true"><span className="barlist__bar" style={{ width: `${(Math.abs(v) / mx) * 100}%`, background: color?.(it) ?? "var(--ink)" }} /></span>
          </>
        );
        return (
          <li key={i}>
            {onSelect ? <button type="button" className="barlist__item is-click" onClick={() => onSelect(it)}>{content}</button> : <div className="barlist__item">{content}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function Sparkline({ points, color = "currentColor", width = 120, height = 36 }: { points: Point[]; color?: string; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const xs = scaleLinear().domain([0, points.length - 1]).range([2, width - 4]);
  const vals = points.map((p) => p.v);
  const ys = scaleLinear().domain([Math.min(...vals), Math.max(...vals)]).range([height - 3, 3]);
  const d = line<Point>().curve(curveMonotoneX).x((_, i) => xs(i)).y((p) => ys(p.v))(points) ?? "";
  const l = points[points.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true" className="spark">
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} />
      <circle cx={xs(points.length - 1)} cy={ys(l.v)} r={2.6} fill={color} />
    </svg>
  );
}

export function RangeTabs({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { key: string; label: string }[] }) {
  return (
    <div className="seg" role="radiogroup" aria-label="Période affichée">
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} className="seg__b" onClick={() => onChange(o.key)}>{o.label}</button>
      ))}
    </div>
  );
}

export function sliceRange(points: Point[], range: string): Point[] {
  if (!points.length || range === "all") return points;
  const last = parse(points[points.length - 1].d);
  const from = new Date(last);
  if (range === "ytd") { from.setMonth(0, 1); from.setDate(0); }
  else from.setFullYear(last.getFullYear() - Number(range.replace("y", "")));
  const iso = from.toISOString().slice(0, 10);
  return points.filter((p) => p.d >= iso);
}

export const fmtIndex = (v: number) => num(v, 0);
