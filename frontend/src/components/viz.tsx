/**
 * Visualisations « signature » : pont des encours, ruban et classement, carte risque/rendement, années civiles.
 * Toutes sont directement étiquetées, cliquables et pilotables au clavier.
 */
import { useMemo, useState, type ReactNode } from "react";
import { scaleBand, scaleLinear, scaleSqrt } from "d3-scale";
import { date as fdate, eur, pct } from "../lib/format";
import type { Variation } from "../lib/types";
import { useWidth } from "./charts";

// ------------------------------------------------------------------ pont des encours
/**
 * Pont des encours : encours de départ → collecte nette estimée → effet marché → encours d'arrivée.
 * L'axe ne part pas de zéro (sinon les flux seraient invisibles) : c'est signalé sur le graphique.
 */
export function Bridge({ v, end, height = 260, label = "Encours", compact = false }: { v: Variation | null | undefined; end?: string; height?: number; label?: string; compact?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!v || v.aum_start == null || v.aum_end == null || v.flows == null || v.market == null)
    return <div ref={ref} className="empty small">Historique insuffisant pour cette période.</div>;
  const W = Math.max(width, 280), H = height, m = { t: 46, r: 8, b: compact ? 40 : 52, l: 8 };
  const a0 = v.aum_start, f = v.flows, mk = v.market, a1 = v.aum_end;
  const steps = [
    { key: "start", label: `${label} au ${fdate(v.start)}`, short: "Départ", from: 0, to: a0, kind: "total" as const, value: a0 },
    { key: "flows", label: "Collecte nette estimée", short: "Collecte", from: a0, to: a0 + f, kind: "delta" as const, value: f },
    { key: "market", label: "Effet marché", short: "Marché", from: a0 + f, to: a1, kind: "delta" as const, value: mk },
    { key: "end", label: `${label} au ${end ? fdate(end) : "dernier arrêté"}`, short: "Arrivée", from: 0, to: a1, kind: "total" as const, value: a1 },
  ];
  const lo = Math.min(a0, a1, a0 + f), hi = Math.max(a0, a1, a0 + f);
  const pad = Math.max((hi - lo) * 0.6, hi * 0.01);
  const base = Math.max(0, lo - pad);
  const y = scaleLinear().domain([base, hi + pad * 0.35]).range([H - m.b, m.t]);
  const x = scaleBand<string>().domain(steps.map((s) => s.key)).range([m.l, W - m.r]).paddingInner(0.34).paddingOuter(0.1);
  const bw = x.bandwidth();
  return (
    <div ref={ref} className="bridge">
      <svg width={W} height={H} role="img" aria-label={`Pont des encours : ${eur(a0)} au départ, collecte ${eur(f, { signed: true })}, marché ${eur(mk, { signed: true })}, ${eur(a1)} à l'arrivée`}>
        <defs>
          <linearGradient id="bridge-total" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--ink)" stopOpacity=".92" /><stop offset="1" stopColor="var(--ink)" stopOpacity=".55" /></linearGradient>
        </defs>
        {steps.map((s, i) => {
          const top = y(Math.max(s.from, s.to)), bot = s.kind === "total" ? y(base) : y(Math.min(s.from, s.to));
          const h = Math.max(2, bot - top);
          const xx = x(s.key)!;
          const fill = s.kind === "total" ? "url(#bridge-total)" : s.value >= 0 ? "var(--div-pos)" : "var(--div-neg)";
          const next = steps[i + 1];
          return (
            <g key={s.key} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              role="img" aria-label={`${s.label} : ${s.kind === "total" ? eur(s.value) : eur(s.value, { signed: true })}`} opacity={hover == null || hover === i ? 1 : 0.55}>
              <rect x={xx} y={top} width={bw} height={h} fill={fill} />
              {next && <line x1={xx + bw} x2={x(next.key)!} y1={y(s.to)} y2={y(s.to)} className="bridge__link" />}
              <text x={xx + bw / 2} y={top - 10} textAnchor="middle" className="bridge__v">{s.kind === "total" ? eur(s.value) : eur(s.value, { signed: true })}</text>
              <text x={xx + bw / 2} y={H - m.b + 20} textAnchor="middle" className="bridge__l">{compact ? s.short : s.kind === "total" ? s.short : s.label.replace("nette estimée", "nette")}</text>
              {!compact && s.kind === "total" && <text x={xx + bw / 2} y={H - m.b + 36} textAnchor="middle" className="bridge__s">{i === 0 ? fdate(v.start) : end ? fdate(end) : ""}</text>}
            </g>
          );
        })}
        <g className="bridge__cut" aria-hidden="true">
          <path d={`M${W - m.r - (`échelle à partir de ${eur(base)}`.length * 6.1 + 26)} ${10} l5 -5 l5 5 l5 -5`} />
          <text x={W - m.r} y={10} textAnchor="end">échelle à partir de {eur(base)}</text>
        </g>
      </svg>
      {hover != null && (
        <div className="bridge__tip" role="status" style={{ left: (x(steps[hover].key) ?? 0) + bw / 2 }}>
          <b>{steps[hover].label}</b>
          <span className="num">{steps[hover].kind === "total" ? eur(steps[hover].value, { precise: true }) : eur(steps[hover].value, { signed: true })}</span>
          {steps[hover].kind === "delta" && a0 ? <span className="small">{pct(steps[hover].value / a0)} de l'encours de départ</span> : null}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ ruban et classement (remplace la mosaïque)
export type MosaicItem = { key: string; label: string; value: number; color: string; sub?: string; badge?: ReactNode; ariaExtra?: string };

/**
 * Ruban et classement : en tête, un ruban 100 % où chaque élément occupe sa part ; dessous, le classement en barres
 * (longueur ∝ valeur, valeurs lues directement). Le survol d'une ligne éclaire son segment du ruban et inversement.
 * Les plus petits éléments sont regroupés en « Autres » jusqu'au déploiement de la liste complète.
 */
export function Mosaic({ items, height = 460, onSelect, format = eur, legend, share = true }: { items: MosaicItem[]; height?: number; onSelect?: (i: MosaicItem) => void; format?: (v: number) => string; legend?: ReactNode; share?: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value), [items]);
  const total = sorted.reduce((s, i) => s + i.value, 0) || 1;
  const n = Math.max(6, Math.min(14, Math.round(height / 40)));
  const shown = all ? sorted : sorted.slice(0, n);
  const rest = sorted.slice(n);
  const restV = rest.reduce((s, i) => s + i.value, 0);
  const max = sorted[0]?.value || 1;
  const ribbon = all || !rest.length ? sorted : [...sorted.slice(0, n), { key: "__autres", label: `Autres (${rest.length})`, value: restV, color: "var(--ink-3)" } as MosaicItem];
  return (
    <div className="rbn">
      <div className="rbn__ribbon" role="img" aria-label={`Répartition : ${ribbon.slice(0, 6).map((i) => `${i.label} ${pct(i.value / total, { signed: false })}`).join(", ")}`}>
        {ribbon.map((i) => (
          <span key={i.key} className={`rbn__seg${hover === i.key ? " is-on" : ""}${hover && hover !== i.key ? " is-dim" : ""}`}
            style={{ flexGrow: i.value / total, ["--tc" as string]: i.color }} onMouseEnter={() => setHover(i.key)} onMouseLeave={() => setHover(null)}
            title={`${i.label} · ${format(i.value)}`} />
        ))}
      </div>
      <ol className="rbn__list" aria-label="Classement par valeur décroissante">
        {shown.map((i, k) => (
          <li key={i.key}>
            <button type="button" className={`rbn__row${hover === i.key ? " is-on" : ""}${hover && hover !== i.key ? " is-dim" : ""}`} style={{ ["--tc" as string]: i.color }}
              onMouseEnter={() => setHover(i.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i.key)} onBlur={() => setHover(null)}
              onClick={() => onSelect?.(i)} disabled={!onSelect} aria-label={`${i.label} : ${format(i.value)}${share ? `, ${pct(i.value / total, { signed: false })}` : ""}${i.ariaExtra ? ", " + i.ariaExtra : ""}`}>
              <span className="rbn__k num">{String(k + 1).padStart(2, "0")}</span>
              <span className="rbn__n"><span className="rbn__dot" />{i.label}{i.sub && <span className="rbn__sub">{i.sub}</span>}</span>
              <span className="rbn__bar" aria-hidden="true" style={{ ["--w" as string]: `${(i.value / max) * 100}%` }}><i /></span>
              <span className="rbn__v num">{format(i.value)}{share && <em>{pct(i.value / total, { signed: false, digits: 1 })}</em>}</span>
              {i.badge && <span className="rbn__b">{i.badge}</span>}
            </button>
          </li>
        ))}
      </ol>
      {rest.length > 0 && (
        <button type="button" className="rbn__more" onClick={() => setAll(!all)}>
          {all ? "Réduire au classement principal" : `Afficher les ${rest.length} autres (${share ? pct(restV / total, { signed: false }) : format(restV)})`}
        </button>
      )}
      {legend}
    </div>
  );
}

/** Couleur divergente (rouge ↔ pierre ↔ bleu) pour une variation. */
export function divColor(v: number | null | undefined, span = 0.2): string {
  if (v == null || !isFinite(v)) return "var(--div-mid)";
  const t = Math.max(-1, Math.min(1, v / span));
  const a = Math.round(Math.abs(t) * 100);
  return `color-mix(in srgb, ${t >= 0 ? "var(--div-pos)" : "var(--div-neg)"} ${a}%, var(--div-mid))`;
}

export function DivLegend({ span = 0.2, label }: { span?: number; label: string }) {
  return (
    <div className="divlegend small">
      <span>{label}</span>
      <span className="num">{pct(-span, { digits: 0 })}</span>
      <span className="divlegend__bar" aria-hidden="true" />
      <span className="num">{pct(span, { digits: 0 })}</span>
    </div>
  );
}

// ------------------------------------------------------------------ carte risque / rendement
export type ScatterPoint = { key: string; label: string; x: number; y: number; size: number; color: string; sub?: string };

/** Carte risque/rendement : volatilité (x), performance (y), taille ∝ encours. Un seul axe par dimension. */
export function RiskReturn({ points, height = 480, onSelect, xLabel = "Volatilité sur 1 an", yLabel = "Performance sur 1 an" }:
  { points: ScatterPoint[]; height?: number; onSelect?: (p: ScatterPoint) => void; xLabel?: string; yLabel?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const W = Math.max(width, 300), H = height, m = { t: 20, r: 24, b: 48, l: 64 };
  const pts = points.filter((p) => isFinite(p.x) && isFinite(p.y));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x = scaleLinear().domain([0, Math.max(0.05, ...xs) * 1.08]).nice().range([m.l, W - m.r]);
  const y = scaleLinear().domain([Math.min(0, ...ys) - 0.02, Math.max(0, ...ys) + 0.02]).nice().range([H - m.b, m.t]);
  const r = scaleSqrt().domain([0, Math.max(1, ...pts.map((p) => p.size))]).range([3, 30]);
  const sorted = [...pts].sort((a, b) => b.size - a.size);
  // Étiquettes : les plus gros fonds d'abord, sans chevauchement (ni entre elles, ni avec une bulle plus grosse)
  const labelled = new Set<string>();
  const boxes: [number, number, number, number][] = [];
  for (const p of sorted) {
    if (labelled.size >= 12) break;
    const cx = x(p.x), cy = y(p.y), rr = r(p.size);
    const w = p.label.length * 6.4 + 6;
    const right = cx + rr + 4 + w < W - m.r;
    const bx: [number, number, number, number] = right ? [cx + rr + 4, cy - 8, cx + rr + 4 + w, cy + 8] : [cx - rr - 4 - w, cy - 8, cx - rr - 4, cy + 8];
    const hit = boxes.some((q) => bx[0] < q[2] && bx[2] > q[0] && bx[1] < q[3] && bx[3] > q[1]);
    if (!hit) { labelled.add(p.key); boxes.push(bx); (p as ScatterPoint & { _left?: boolean })._left = !right; }
  }
  const hp = pts.find((p) => p.key === hover);
  return (
    <div ref={ref} className="chart rr">
      <svg width={W} height={H} role="img" aria-label={`${yLabel} en fonction de la ${xLabel.toLowerCase()}, taille proportionnelle à l'encours`}>
        {y.ticks(5).map((t) => <g key={t}><line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? "chart__base" : "chart__grid"} /><text x={m.l - 10} y={y(t)} dy="0.32em" textAnchor="end" className="chart__tick">{pct(t, { digits: 0 })}</text></g>)}
        {x.ticks(6).map((t) => <text key={t} x={x(t)} y={H - m.b + 18} textAnchor="middle" className="chart__tick">{pct(t, { signed: false, digits: 0 })}</text>)}
        <text x={W - m.r} y={H - 8} textAnchor="end" className="rr__axis">{xLabel} →</text>
        <text x={m.l} y={m.t - 6} className="rr__axis">↑ {yLabel}</text>
        <text x={W - m.r - 6} y={m.t + 14} textAnchor="end" className="rr__quad">plus de risque, plus de performance</text>
        <text x={m.l + 8} y={m.t + 14} className="rr__quad">peu de risque, bonne performance</text>
        {sorted.map((p) => (
          <g key={p.key} className="rr__p" tabIndex={0} role="button" aria-label={`${p.label} : volatilité ${pct(p.x, { signed: false })}, performance ${pct(p.y)}`}
            onPointerEnter={() => setHover(p.key)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(p.key)} onBlur={() => setHover(null)}
            onClick={() => onSelect?.(p)} onKeyDown={(e) => e.key === "Enter" && onSelect?.(p)} opacity={hover && hover !== p.key ? 0.35 : 1}>
            <rect x={x(p.x) - r(p.size)} y={y(p.y) - r(p.size)} width={r(p.size) * 2} height={r(p.size) * 2} fill={p.color} fillOpacity={0.22} stroke={p.color} strokeWidth={1.5} />
            <rect x={x(p.x) - 2} y={y(p.y) - 2} width={4} height={4} fill={p.color} />
            {labelled.has(p.key) && hover !== p.key && (
              (p as ScatterPoint & { _left?: boolean })._left
                ? <text x={x(p.x) - r(p.size) - 4} y={y(p.y)} dy="0.32em" textAnchor="end" className="rr__lab">{p.label}</text>
                : <text x={x(p.x) + r(p.size) + 4} y={y(p.y)} dy="0.32em" className="rr__lab">{p.label}</text>)}
          </g>
        ))}
      </svg>
      {hp && (
        <div className="chart__tip" role="status" style={{ left: Math.min(Math.max(x(hp.x), 110), W - 110), top: Math.max(y(hp.y) - r(hp.size) - 90, 0), transform: "translate(-50%, 0)" }}>
          <div className="chart__tip-d">{hp.label}</div>
          {hp.sub && <div className="chart__tip-row"><span>{hp.sub}</span></div>}
          <div className="chart__tip-row"><span>Performance 1 an</span><b className="num">{pct(hp.y)}</b></div>
          <div className="chart__tip-row"><span>Volatilité 1 an</span><b className="num">{pct(hp.x, { signed: false })}</b></div>
          <div className="chart__tip-row"><span>Encours</span><b className="num">{eur(hp.size)}</b></div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ années civiles
export type CalYear = { year: number; fund: number | null; bench?: number | null; partial: boolean; ytd: boolean };

/** Performances par année civile : barres fonds / indice côte à côte, écart en toutes lettres. */
export function CalendarBars({ years, color }: { years: CalYear[]; color: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const W = Math.max(width, 280), H = 250, m = { t: 26, r: 8, b: 48, l: 8 };
  const vals = years.flatMap((y) => [y.fund ?? 0, y.bench ?? 0]);
  const ext = Math.max(0.02, ...vals.map(Math.abs));
  const y = scaleLinear().domain([Math.min(0, ...vals) < 0 ? -ext : 0, Math.max(0, ...vals) > 0 ? ext : 0.01]).nice().range([H - m.b, m.t]);
  const x = scaleBand<number>().domain(years.map((d) => d.year)).range([m.l, W - m.r]).paddingInner(0.3);
  const bw = x.bandwidth() / 2 - 2;
  const bar = (xx: number, v: number, fill: string, dashed = false) => {
    const top = y(Math.max(0, v)), h = Math.max(1.5, Math.abs(y(v) - y(0)));
    return <rect x={xx} y={top} width={bw} height={h} fill={fill} stroke={dashed ? "var(--ink-3)" : "none"} strokeDasharray={dashed ? "3 2" : undefined} fillOpacity={dashed ? 0.25 : 1} />;
  };
  return (
    <div ref={ref} className="chart">
      <svg width={W} height={H} role="img" aria-label="Performances par année civile, fonds et indice">
        <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} className="chart__base" />
        {years.map((d) => {
          const xx = x(d.year)!;
          const gap = d.bench != null && d.fund != null ? d.fund - d.bench : null;
          return (
            <g key={d.year}>
              {d.fund != null && bar(xx, d.fund, color)}
              {d.bench != null && bar(xx + bw + 4, d.bench, "var(--ink-3)", true)}
              {d.fund != null
                ? <text x={xx + bw / 2} y={d.fund >= 0 ? y(d.fund) - 6 : y(d.fund) + 14} textAnchor="middle" className="bridge__v bridge__v--s">{pct(d.fund, { digits: 1 })}</text>
                : <text x={xx + bw / 2} y={y(0) - 6} textAnchor="middle" className="bridge__v bridge__v--s muted">indisponible</text>}
              <text x={xx + x.bandwidth() / 2} y={H - m.b + 20} textAnchor="middle" className="bridge__l">{d.ytd ? `${d.year} (YTD)` : d.partial ? `${d.year}*` : d.year}</text>
              {gap != null && <text x={xx + x.bandwidth() / 2} y={H - m.b + 36} textAnchor="middle" className={`bridge__s ${gap >= 0 ? "is-up" : "is-down"}`}>{gap >= 0 ? "▲" : "▼"} {pct(gap, { digits: 1 })} vs indice</text>}
            </g>
          );
        })}
      </svg>
      {years.some((d) => d.partial && !d.ytd) && <p className="small muted">* Année partielle (première VL de l'historique disponible).</p>}
    </div>
  );
}
