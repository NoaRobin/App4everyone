/**
 * Démo — pièces communes : onglets de période, nom retrouvé dans la donnée, chiffres clés, flux mensuels (souscriptions
 * et rachats de part et d'autre de zéro), flux par zone (barres divergentes), opérations récentes, table des clients.
 * Souscriptions en or, rachats en grenat, toujours accompagnés de leur position (au-dessus / à droite = entrée) et d'un
 * signe : la couleur n'est jamais seule à porter le sens.
 */
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { scaleBand, scaleLinear } from "d3-scale";
import { date as fdate, eur, monthYear, pctRaw } from "../../lib/format";
import { useWidth } from "../charts";
import { Flag } from "../Flag";
import * as I from "../Icon";
import type { ClientRow, FlowRow, Match, Monthly, Operation } from "./types";

// ------------------------------------------------------------------ onglets de période
export type Opt<K extends string> = { key: K; label: string; disabled?: boolean; title?: string };
export function PeriodTabs<K extends string>({ value, onChange, options, label = "Période" }: { value: K; onChange: (k: K) => void; options: Opt<K>[]; label?: string }) {
  return (
    <div className="dm-tabs" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} disabled={o.disabled} title={o.title}
          className={`dm-tabs__b${value === o.key ? " is-on" : ""}`} onClick={() => onChange(o.key)}>{o.label}</button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ nom retrouvé dans la donnée
export function NameMatch({ match, source }: { match: Match; source: string }) {
  if (!match.found) {
    return (
      <p className="dm-match is-miss" role="note"><I.Alert size={14} />
        <span>« {match.asked} » n'apparaît pas dans {source}.{match.alternatives.length ? <> Noms proches : {match.alternatives.map((a) => a.name).join(", ")}.</> : null}</span>
      </p>
    );
  }
  if (match.exact && !match.ambiguous) return <p className="dm-match"><I.Check size={13} /><span>Retrouvé tel quel dans {source}</span></p>;
  return (
    <p className="dm-match is-near" role="note"><I.Info size={14} />
      <span>Écrit <b>« {match.found} »</b> dans {source} (demandé : « {match.asked} »)
        {match.ambiguous ? " · homonyme : le plus gros portefeuille est retenu" : ""}{match.alternatives.length ? ` · autres noms proches : ${match.alternatives.map((a) => a.name).join(", ")}` : ""}</span>
    </p>
  );
}

// ------------------------------------------------------------------ chiffre clé
export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "in" | "out" | null }) {
  return (
    <div className={`dm-kpi${tone ? ` is-${tone}` : ""}`}>
      <dt>{label}</dt>
      <dd className="num">{value}</dd>
      {sub != null && <span className="dm-kpi__sub">{sub}</span>}
    </div>
  );
}

export const signed = (v: number | null | undefined) => eur(v, { signed: true });
export const tone = (v: number | null | undefined) => (v == null ? null : v >= 0 ? "in" : "out");
export function PerfVal({ v, annual }: { v: number | null | undefined; annual?: boolean }) {
  if (v == null || !isFinite(v)) return <span className="muted">—</span>;
  const s = (v * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return <span className={v >= 0 ? "up-t" : "down-t"}>{v > 0 ? "+" : v < 0 ? "−" : ""}{s.replace("-", "")}&nbsp;%{annual ? <sup>a</sup> : null}</span>;
}

// ------------------------------------------------------------------ flux mensuels : souscriptions au-dessus, rachats en dessous
export function TwinBars({ months, height = 240 }: { months: Monthly[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const W = Math.max(width, 300), H = height, m = { t: 14, r: 70, b: 28, l: 4 };
  const x = scaleBand<string>().domain(months.map((p) => p.m)).range([m.l, W - m.r]).paddingInner(0.32);
  const top = Math.max(1, ...months.map((p) => Math.max(p.subscriptions, p.redemptions)));
  const y = scaleLinear().domain([-top, top]).nice(4).range([H - m.b, m.t]);
  if (!months.length) return <div className="empty small">Aucune opération sur la période.</div>;
  const bw = x.bandwidth();
  const h = hover != null ? months[hover] : null;
  return (
    <div ref={ref} className="chart dm-twin">
      <svg width={W} height={H} role="img" aria-label="Souscriptions et rachats par mois, collecte nette en repère">
        {y.ticks(4).map((t) => (
          <g key={t}><line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? "chart__base" : "chart__grid"} />
            <text x={W - m.r + 8} y={y(t)} dy="0.32em" className="chart__tick">{t === 0 ? "0" : eur(Math.abs(t))}</text></g>
        ))}
        {months.map((p, i) => {
          const xx = x(p.m)!;
          const on = hover == null || hover === i;
          return (
            <g key={p.m} opacity={on ? 1 : 0.4} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              role="img" aria-label={`${monthYear(p.m + "-01", true)} : souscriptions ${eur(p.subscriptions)}, rachats ${eur(p.redemptions)}, net ${signed(p.net)}`}>
              <rect x={xx - x.step() * 0.16} y={m.t} width={x.step()} height={H - m.t - m.b} fill="transparent" />
              <rect x={xx} y={y(p.subscriptions)} width={bw} height={Math.max(0, y(0) - y(p.subscriptions) - 1)} className="dm-in" />
              <rect x={xx} y={y(0) + 1} width={bw} height={Math.max(0, y(-p.redemptions) - y(0) - 1)} className="dm-out" />
              <line x1={xx - 3} x2={xx + bw + 3} y1={y(p.net)} y2={y(p.net)} className="dm-net" />
            </g>
          );
        })}
        {months.filter((_, i) => i % Math.ceil(months.length / Math.max(2, Math.floor(W / 74))) === 0).map((p) => (
          <text key={p.m} x={(x(p.m) ?? 0) + bw / 2} y={H - 8} textAnchor="middle" className="chart__tick">{monthYear(p.m + "-01")}</text>
        ))}
      </svg>
      <div className="dm-legend" aria-hidden="true"><span><i className="dm-in" />Souscriptions</span><span><i className="dm-out" />Rachats</span><span><i className="dm-net" />Collecte nette</span></div>
      {h && (
        <div className="chart__tip" style={{ left: Math.min(Math.max((x(h.m) ?? 0) + bw / 2, 110), W - 110) }} role="status">
          <div className="chart__tip-d">{monthYear(h.m + "-01", true)}</div>
          <div className="chart__tip-row"><span className="dot dm-in-bg" /><span>Souscriptions</span><b className="num">{eur(h.subscriptions)}</b></div>
          <div className="chart__tip-row"><span className="dot dm-out-bg" /><span>Rachats</span><b className="num">{eur(h.redemptions)}</b></div>
          <div className="chart__tip-row chart__tip-total"><span>Collecte nette</span><b className="num">{signed(h.net)}</b></div>
          <div className="chart__tip-row"><span>Opérations</span><b className="num">{h.n.toLocaleString("fr-FR")}</b></div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ flux par groupe : rachats à gauche, souscriptions à droite, net
export function SplitRows({ rows, label, expandable = false, iso, empty = "Aucune opération sur la période." }:
  { rows: FlowRow[]; label?: (r: FlowRow) => ReactNode; expandable?: boolean; iso?: (r: FlowRow) => string | null | undefined; empty?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.subscriptions, r.redemptions)));
  if (!rows.length) return <div className="empty small">{empty}</div>;
  const line = (r: FlowRow) => (
    <div className="dm-split__row">
      <span className="dm-split__lab">{iso?.(r) && <Flag iso={iso(r)!} className="dm-flag" />}{label ? label(r) : r.key}</span>
      <span className="dm-split__out" aria-hidden="true"><i style={{ width: `${(r.redemptions / max) * 100}%` }} /></span>
      <span className="dm-split__in" aria-hidden="true"><i style={{ width: `${(r.subscriptions / max) * 100}%` }} /></span>
      <span className={`dm-split__net num ${r.net >= 0 ? "up-t" : "down-t"}`}>{signed(r.net)}</span>
      <span className="sr-only">Souscriptions {eur(r.subscriptions)}, rachats {eur(r.redemptions)}</span>
    </div>
  );
  return (
    <div className="dm-split" role="table" aria-label="Souscriptions et rachats">
      <div className="dm-split__head" aria-hidden="true"><span /><span>← Rachats</span><span>Souscriptions →</span><span>Net</span></div>
      {rows.map((r) => {
        const can = expandable && (r.countries?.length ?? 0) > 1;
        return (
          <Fragment key={r.key}>
            {can ? (
              <button type="button" className="dm-split__btn" aria-expanded={open === r.key} onClick={() => setOpen(open === r.key ? null : r.key)}
                title={`${eur(r.subscriptions)} souscrits · ${eur(r.redemptions)} rachetés`}>
                {line(r)}
              </button>
            ) : <div title={`${eur(r.subscriptions)} souscrits · ${eur(r.redemptions)} rachetés`}>{line(r)}</div>}
            {can && open === r.key && <div className="dm-split__kids">{r.countries!.map((c) => (
              <div className="dm-split__row is-sub" key={c.key}>
                <span className="dm-split__lab">{c.iso && <Flag iso={c.iso} className="dm-flag" />}{c.key}</span>
                <span className="dm-split__out" aria-hidden="true"><i style={{ width: `${(c.redemptions / max) * 100}%` }} /></span>
                <span className="dm-split__in" aria-hidden="true"><i style={{ width: `${(c.subscriptions / max) * 100}%` }} /></span>
                <span className={`dm-split__net num ${c.net >= 0 ? "up-t" : "down-t"}`}>{signed(c.net)}</span>
              </div>
            ))}</div>}
          </Fragment>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ opérations récentes
export function Ops({ ops, showCommercial = true, limit = 8 }: { ops: Operation[]; showCommercial?: boolean; limit?: number }) {
  if (!ops.length) return <div className="empty small">Aucune opération récente.</div>;
  return (
    <ol className="dm-ops">
      {ops.slice(0, limit).map((o, i) => {
        const inflow = o.sens === "Souscription" || o.sens === "Transfert entrant";
        return (
          <li key={i} className={inflow ? "is-in" : "is-out"} title={`${o.segment}${o.teneur ? ` · teneur ${o.teneur}` : ""}${o.date_vl ? ` · VL du ${fdate(o.date_vl)}` : ""}`}>
            <span className="dm-ops__mark" aria-hidden="true">{inflow ? "+" : "−"}</span>
            <span className="dm-ops__l1"><b>{o.client ?? "Client non renseigné"}</b><b className={`num ${inflow ? "up-t" : "down-t"}`}>{inflow ? "+" : "−"}{eur(o.amount)}</b></span>
            <span className="dm-ops__l2">{o.fund ? <Link to={`/fonds/${encodeURIComponent(o.fund)}`}>{o.share ?? o.name}</Link> : <span>{o.share ?? o.name ?? o.isin}</span>}</span>
            <span className="dm-ops__l3">{fdate(o.date)} · {o.iso && <Flag iso={o.iso} className="dm-flag" />}{o.country}{showCommercial && o.commercial ? ` · ${o.commercial}` : ""} · {o.sens}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ barre de répartition 100 %
export function ShareBar({ items, label }: { items: { key: string; value: number; color: string }[]; label: string }) {
  const tot = items.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  return (
    <div className="dm-sharebar">
      <div className="dm-sharebar__bar" role="img" aria-label={`${label} : ${items.map((x) => `${x.key} ${pctRaw((x.value / tot) * 100, 1)}`).join(", ")}`}>
        {items.map((x) => <span key={x.key} style={{ flexGrow: Math.max(0, x.value), background: x.color }} title={`${x.key} · ${eur(x.value)} · ${pctRaw((x.value / tot) * 100, 1)}`} />)}
      </div>
      <ul className="dm-sharebar__legend">
        {items.map((x) => <li key={x.key}><i style={{ background: x.color }} /><span>{x.key}</span><b className="num">{pctRaw((x.value / tot) * 100, 1)}</b><span className="muted num">{eur(x.value)}</span></li>)}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ clients : encours, fonds détenus, collecte 12 mois
type SortKey = "encours" | "net_1a" | "client" | "last_op";
export function ClientTable({ clients, pageSize = 12, showZone = true }: { clients: ClientRow[]; pageSize?: number; showZone?: boolean }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("encours");
  const [n, setN] = useState(pageSize);
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const f = q.trim().toLowerCase();
    const r = clients.filter((c) => !f || c.client.toLowerCase().includes(f) || c.funds.some((x) => x.name.toLowerCase().includes(f)) || c.country.toLowerCase().includes(f));
    const val = (c: ClientRow) => sort === "client" ? c.client : sort === "last_op" ? c.last_op ?? "" : (c[sort] ?? -Infinity);
    return [...r].sort((a, b) => {
      const A = val(a), B = val(b);
      return sort === "client" ? String(A).localeCompare(String(B), "fr") : A < B ? 1 : A > B ? -1 : 0;
    });
  }, [clients, q, sort]);
  const max = Math.max(1, ...clients.map((c) => c.encours));
  const th = (k: SortKey, l: string, cls = "") => (
    <th className={cls} aria-sort={sort === k ? "descending" : "none"}>
      <button type="button" className="dm-th" onClick={() => setSort(k)}>{l}{sort === k ? " ↓" : ""}</button>
    </th>
  );
  return (
    <div className="dm-clients">
      <div className="dm-clients__bar">
        <label className="dm-search"><I.Search size={14} /><input type="search" value={q} onChange={(e) => { setQ(e.target.value); setN(pageSize); }}
          placeholder="Client, fonds ou pays…" aria-label="Rechercher un client, un fonds ou un pays" /></label>
        <span className="small muted">{rows.length.toLocaleString("fr-FR")} client{rows.length > 1 ? "s" : ""} · cliquez une ligne pour voir ses parts</span>
      </div>
      <div className="dm-clients__scroll">
        <table className="t dm-ct">
          <thead><tr>
            {th("client", "Client")}{showZone && <th>Pays</th>}<th>Clientèle</th>{th("encours", "Encours", "n")}<th className="dm-ct__bar" aria-label="Poids" />
            <th>Investi dans</th>{th("net_1a", "Collecte 12 mois", "n")}{th("last_op", "Dernière opération", "n")}
          </tr></thead>
          <tbody>
            {rows.slice(0, n).map((c) => (
              <Fragment key={c.client}>
                <tr className={`dm-ct__row${open === c.client ? " is-open" : ""}`} onClick={() => setOpen(open === c.client ? null : c.client)}
                  tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(open === c.client ? null : c.client); } }} aria-expanded={open === c.client}>
                  <td><b>{c.client}</b></td>
                  {showZone && <td><span className="dm-ct__pays">{c.iso && <Flag iso={c.iso} className="dm-flag" />}{c.country}</span></td>}
                  <td className="small">{c.segment}</td>
                  <td className="n num"><b>{eur(c.encours)}</b></td>
                  <td className="dm-ct__bar"><i style={{ width: `${(c.encours / max) * 100}%` }} /></td>
                  <td>
                    <span className="dm-chips">{c.funds.slice(0, 3).map((f) => <span key={f.name} className="dm-chip">{f.name}<em className="num">{pctRaw(f.pct, 0)}</em></span>)}
                      {c.funds.length > 3 && <span className="dm-chip is-more">+{c.funds.length - 3}</span>}</span>
                  </td>
                  <td className={`n num ${c.net_1a == null ? "muted" : c.net_1a >= 0 ? "up-t" : "down-t"}`}>{c.net_1a == null ? "—" : signed(c.net_1a)}</td>
                  <td className="n num">{c.last_op ? fdate(c.last_op) : "—"}</td>
                </tr>
                {open === c.client && (
                  <tr className="dm-ct__detail"><td colSpan={showZone ? 8 : 7}>
                    <div className="dm-ct__grid">
                      {c.funds.map((f) => (
                        <div key={f.name} className="dm-ct__fund">
                          <div className="dm-ct__fh">{f.fund ? <Link to={`/fonds/${encodeURIComponent(f.fund)}`}>{f.name}</Link> : <span>{f.name}</span>}
                            <b className="num">{eur(f.encours)}</b></div>
                          <div className="dm-ct__fbar" aria-hidden="true"><i style={{ width: `${f.pct ?? 0}%` }} /></div>
                          <ul>{f.shares.map((s) => <li key={s.isin ?? s.share}><span>{s.share ?? "Part"}</span><span className="mono">{s.isin}</span><span className="num">{eur(s.encours)}</span></li>)}</ul>
                        </div>
                      ))}
                    </div>
                    <p className="small muted dm-ct__foot">{c.accounts} compte{c.accounts > 1 ? "s" : ""} au moins · zone {c.zone} · {pctRaw(c.pct, 1)} du portefeuille
                      {c.classes.length ? ` · ${c.classes.map((k) => `${k.key} ${eur(k.encours)}`).join(" · ")}` : ""}</p>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > n && <button type="button" className="btn btn--ghost dm-more" onClick={() => setN(n + pageSize * 2)}>Afficher plus de clients</button>}
    </div>
  );
}
