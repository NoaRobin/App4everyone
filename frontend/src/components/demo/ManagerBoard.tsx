/**
 * Démo — tableau de bord d'un gérant : ses fonds (gérant principal dans Product Info), leurs performances de 1 mois à
 * 5 ans et l'écart à l'indicateur, le risque, l'évolution des encours et ce qui la fait varier, la collecte par fonds,
 * les dernières souscriptions (passif), la détention par zone (globe 3D ou tableau) et le portefeuille du fonds phare.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../lib/api";
import { useApp } from "../../lib/context";
import { CATEGORICAL, OTHER } from "../../lib/families";
import { date as fdate, eur, pctRaw } from "../../lib/format";
import { useReducedMotion, webglAvailable } from "../../lib/motion";
import type { MapCountry } from "../../three/MapScene";
import { FlowBars, StackedArea } from "../charts";
import { Flag } from "../Flag";
import { Loading } from "../ui";
import { Bridge } from "../viz";
import { Kpi, NameMatch, Ops, PerfVal, PeriodTabs, signed, tone, TwinBars, type Opt } from "./kit";
import type { FlowKey, ManagerBoard as Board, ManagerFund, Match, PerfKey, ZoneHold } from "./types";

const PERF: { key: PerfKey; label: string; annual?: boolean }[] = [
  { key: "1M", label: "1 mois" }, { key: "YTD", label: "YTD" }, { key: "1A", label: "1 an" }, { key: "3A", label: "3 ans", annual: true }, { key: "5A", label: "5 ans", annual: true }];
const FLOWS: Opt<FlowKey>[] = [{ key: "1M", label: "1 mois" }, { key: "3M", label: "3 mois" }, { key: "YTD", label: "YTD" }, { key: "1A", label: "1 an" }, { key: "3A", label: "3 ans" }, { key: "5A", label: "5 ans" }];
const RANGES = [{ key: "1A", label: "1 an", months: 13 }, { key: "3A", label: "3 ans", months: 37 }, { key: "5A", label: "5 ans", months: 61 }] as const;
type RangeKey = (typeof RANGES)[number]["key"];

export function ManagerBoard({ index, label, name, match, role = "Gérant principal", family = null }:
  { index: number; label: string; name: string; match: Match; role?: string; family?: string | null }) {
  useEffect(() => { document.title = `${label} — Démo Jasmin`; }, [label]);
  const { api } = useApp();
  const who = match.found ?? name;
  const { data, loading } = useApi<Board>(api(`/api/demo/gerant?nom=${encodeURIComponent(who)}${family ? `&famille=${encodeURIComponent(family)}` : ""}`));
  const id = `gerant-${index}`;
  return (
    <section className="dm-chap" id={id} aria-labelledby={`h-${id}`}>
      <header className="dm-chap__head">
        <span className="dm-chap__num" aria-hidden="true">{String(index).padStart(2, "0")}</span>
        <div className="dm-chap__title">
          <div className="eyebrow dm-eyebrow">Gestion</div>
          <h2 className="dm-chap__name" id={`h-${id}`}>{label}</h2>
          <p className="dm-person">{role}&nbsp;: <b>{who}</b>{family ? <span className="muted"> · tous les fonds obligataires</span> : null}</p>
          {!family && <NameMatch match={data?.match ?? match} source="Product Info (gérant principal)" />}
        </div>
        {data?.available && data.aum != null && (
          <dl className="dm-kpis">
            <Kpi label="Encours géré" value={eur(data.aum)} sub={`${data.funds.length} fonds · ${data.countries ?? 0} pays d'autorisation`} />
            <Kpi label="Collecte YTD" value={signed(data.var?.YTD?.flows)} tone={tone(data.var?.YTD?.flows)} sub={`1 an : ${signed(data.var?.["1A"]?.flows)}`} />
            <Kpi label="Variation YTD" value={data.var?.YTD?.pct == null ? "—" : <PerfVal v={data.var.YTD.pct} />} sub={`marché : ${signed(data.var?.YTD?.market)}`} />
            <Kpi label="Revenus estimés" value={eur(data.revenue)} sub="par an, encours × frais" />
          </dl>
        )}
      </header>
      {loading && !data ? <Loading h={420} /> : !data?.available ? <div className="empty">{data?.reason ?? "Données indisponibles."}</div>
        : !data.funds.length ? <div className="empty">{family ? "Aucun fonds avec encours dans cette famille." : `Aucun fonds avec encours dont ${who} est le gérant principal.`}</div>
        : <BoardBody b={data} />}
    </section>
  );
}

export function BoardBody({ b, compact = false }: { b: Board; compact?: boolean }) {
  const color = useMemo(() => {
    const m = new Map<string, string>();
    b.funds.forEach((f, i) => m.set(f.id, i < CATEGORICAL.length ? CATEGORICAL[i] : OTHER));
    return m;
  }, [b.funds]);
  return (
    <div className="dm-grid">
      <article className="dm-card dm-span-12"><PerfTable funds={b.funds} color={color} />
        {b.perimeter && <p className="small muted dm-note">Périmètre : les {b.perimeter.family} fonds de la famille de gestion, plus {b.perimeter.asset_class} fonds rangés dans une autre famille (gamme Sélection, Multigestion…) mais dont la classe d'actifs Product Info est obligataire ou monétaire. Fonds sans encours à la date exclus.</p>}</article>
      <article className="dm-card dm-span-8"><AumStack b={b} color={color} /></article>
      <article className="dm-card dm-span-4"><Variation b={b} /></article>
      <article className={`dm-card ${compact ? "dm-span-12" : "dm-span-6"}`}><FundFlows funds={b.funds} color={color} />
        <div className="eyebrow dm-sub">Collecte nette estimée, mois par mois (JUMP)</div>
        <FlowBars points={(b.series ?? []).slice(-13).filter((x) => x.flows != null).map((x) => ({ d: x.d, v: x.flows as number }))} height={200} ariaLabel="Collecte nette estimée par mois, 13 derniers mois" />
      </article>
      {!compact && <article className="dm-card dm-span-6"><Subscriptions b={b} /></article>}
      {!compact && b.passif?.available && b.passif.zones.length > 0 && <article className="dm-card dm-span-12 dm-card--flush"><Zones b={b} color={color} /></article>}
      {!compact && b.portfolio && <article className="dm-card dm-span-12"><Portfolio p={b.portfolio} /></article>}
      {(b.co_managed?.length ?? 0) > 0 && (
        <p className="small muted dm-span-12 dm-co">Également gérant suppléant de : {(b.co_managed ?? []).map((f, i) => <Fragment key={f.id}>{i ? ", " : ""}<Link to={`/fonds/${encodeURIComponent(f.id)}`}>{f.name}</Link></Fragment>)}.</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ performances
/** 3 et 5 ans : la performance est fournie annualisée ; la cumulée s'en déduit exactement, (1 + r)^n − 1. */
const YEARS: Partial<Record<PerfKey, number>> = { "3A": 3, "5A": 5 };
const onBase = (v: number | null, k: PerfKey, base: "cum" | "ann") => (v == null || base === "ann" || !YEARS[k] ? v : Math.pow(1 + v, YEARS[k]!) - 1);

export function PerfTable({ funds, color }: { funds: ManagerFund[]; color: Map<string, string> }) {
  const [mode, setMode] = useState<"perf" | "rel">("perf");
  const [base, setBase] = useState<"cum" | "ann">("cum");
  const cell = (f: ManagerFund, p: (typeof PERF)[number]) => {
    const v = onBase(f.perf[p.key], p.key, base), bv = onBase(f.bench[p.key], p.key, base);
    const shown = mode === "perf" ? v : v != null && bv != null ? v - bv : null;
    const span = (mode === "perf" ? 0.15 : 0.04) * (base === "cum" && YEARS[p.key] ? Math.sqrt(YEARS[p.key]!) : 1);
    const k = shown == null ? 0 : Math.min(1, Math.abs(shown) / span);
    const bg = shown == null ? undefined : `color-mix(in srgb, ${shown >= 0 ? "var(--up)" : "var(--down)"} ${Math.round(6 + k * 22)}%, transparent)`;
    const title = `${f.name} · ${p.label}${p.annual ? (base === "ann" ? " (annualisée)" : " (cumulée)") : ""} : fonds ${v == null ? "—" : pctRaw(v * 100, 2)}, indicateur ${bv == null ? "—" : pctRaw(bv * 100, 2)}`;
    return (
      <td key={p.key} className="n dm-pt__c" style={{ background: bg }} title={title}>
        {mode === "perf" ? <PerfVal v={shown} annual={base === "ann" && p.annual} /> : shown == null ? <span className="muted">—</span>
          : <span className={shown >= 0 ? "up-t" : "down-t"}>{shown > 0 ? "+" : shown < 0 ? "−" : ""}{Math.abs(shown * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}&nbsp;pt</span>}
        {mode === "perf" && bv != null && <span className="dm-pt__b num">ind. {(bv * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}</span>}
      </td>
    );
  };
  return (
    <>
      <div className="dm-card__head">
        <div><div className="eyebrow">Performances · part principale</div><h3 className="dm-h3">Comment se comportent les fonds</h3></div>
        <div className="dm-ctl">
          <PeriodTabs value={base} onChange={setBase} label="Calcul sur 3 et 5 ans" options={[{ key: "cum", label: "Cumulée" }, { key: "ann", label: "Annualisée" }]} />
          <PeriodTabs value={mode} onChange={setMode} label="Lecture" options={[{ key: "perf", label: "Performance" }, { key: "rel", label: "Écart à l'indicateur" }]} />
        </div>
      </div>
      <div className="dm-scroll">
        <table className="t dm-pt">
          <thead><tr>
            <th>Fonds</th><th className="n">Encours</th>
            {PERF.map((p) => <th key={p.key} className="n">{p.label}{p.annual && base === "ann" ? <sup>a</sup> : null}</th>)}
            <th className="n">Volatilité 1 an</th><th className="n">Perte max 1 an</th><th className="n">SRI</th>
          </tr></thead>
          <tbody>{funds.map((f) => (
            <tr key={f.id}>
              <td><Link to={`/fonds/${encodeURIComponent(f.id)}`} className="dm-pt__f"><i style={{ background: color.get(f.id) }} aria-hidden="true" /><span><b>{f.name}</b>
                <em>{[f.range, f.asset_class, f.sfdr].filter(Boolean).join(" · ")}{f.via_asset_class ? " · hors famille, retenu pour sa classe d'actifs" : ""}</em></span></Link></td>
              <td className="n num">{eur(f.aum)}</td>
              {PERF.map((p) => cell(f, p))}
              <td className="n num">{f.vol == null ? "—" : pctRaw(f.vol * 100, 1)}</td>
              <td className="n num">{f.mdd == null ? "—" : <span className="down-t">{pctRaw(f.mdd * 100, 1)}</span>}</td>
              <td className="n"><span className="dm-sri">{f.sri ?? "—"}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="small muted dm-note">{base === "ann" ? <><sup>a</sup> annualisée (3 et 5 ans). </> : "Performances cumulées sur chaque période. "}Part principale de chaque fonds (la plus grosse en encours), coupons réinvestis ; « ind. » : son indicateur de référence sur la même période.
        {funds.some((f) => f.perf["5A"] == null) ? " — : historique insuffisant pour la période." : ""}</p>
    </>
  );
}

// ------------------------------------------------------------------ évolution des encours
function AumStack({ b, color }: { b: Board; color: Map<string, string> }) {
  const [r, setR] = useState<RangeKey>("5A");
  const st = b.stack;
  const n = st?.dates.length ?? 0;
  const keep = RANGES.find((x) => x.key === r)!.months;
  const from = Math.max(0, n - keep);
  const layers = useMemo(() => !st ? [] : [...st.funds].reverse().map((f) => ({
    key: f.id, label: b.funds.find((x) => x.id === f.id)?.name ?? f.id, color: color.get(f.id) ?? OTHER,
    points: st.dates.slice(from).map((d, i) => ({ d, v: f.values[from + i] ?? 0 })),
  })), [st, from, b.funds, color]);
  const avail = (k: RangeKey) => n >= RANGES.find((x) => x.key === k)!.months - 1;
  return (
    <>
      <div className="dm-card__head">
        <div><div className="eyebrow">Évolution des encours · fin de mois</div><h3 className="dm-h3">{eur(b.aum)} aujourd'hui</h3></div>
        <PeriodTabs value={r} onChange={setR} options={RANGES.map((x) => ({ key: x.key, label: x.label, disabled: !avail(x.key), title: avail(x.key) ? undefined : "Historique insuffisant" }))} />
      </div>
      {layers.length ? <StackedArea layers={layers} height={300} ariaLabel="Encours de chaque fonds, empilés, par fin de mois" /> : <div className="empty small">Pas d'historique.</div>}
      <ul className="dm-legend dm-legend--funds">{b.funds.map((f) => <li key={f.id}><i style={{ background: color.get(f.id) }} />{f.name}</li>)}</ul>
    </>
  );
}

function Variation({ b }: { b: Board }) {
  const [p, setP] = useState<FlowKey>("YTD");
  const v = b.var?.[p];
  return (
    <>
      <div className="dm-card__head dm-card__head--stack">
        <div><div className="eyebrow">D'où vient la variation</div><h3 className="dm-h3">{v?.pct == null ? "—" : <PerfVal v={v.pct} />}</h3></div>
        <PeriodTabs value={p} onChange={setP} options={FLOWS.map((o) => ({ ...o, disabled: !b.var?.[o.key]?.start }))} />
      </div>
      <Bridge v={v} end={b.date} height={250} compact />
      <p className="small muted dm-note">Collecte nette estimée (JUMP : variation du nombre de parts × VL) et effet marché, sur l'ensemble des fonds.</p>
    </>
  );
}

// ------------------------------------------------------------------ collecte par fonds
function FundFlows({ funds, color }: { funds: ManagerFund[]; color: Map<string, string> }) {
  const [p, setP] = useState<FlowKey>("YTD");
  const rows = funds.filter((f) => !f.flows_off).map((f) => ({ f, v: f.flows[p] })).sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.v ?? 0)));
  const tot = rows.reduce((s, r) => s + (r.v ?? 0), 0);
  return (
    <>
      <div className="dm-card__head dm-card__head--stack">
        <div><div className="eyebrow">Collecte nette estimée par fonds</div><h3 className="dm-h3"><span className={tot >= 0 ? "up-t" : "down-t"}>{signed(tot)}</span></h3></div>
        <PeriodTabs value={p} onChange={setP} options={FLOWS.map((o) => ({ ...o, disabled: funds.every((f) => f.flows[o.key] == null) }))} />
      </div>
      <ul className="dm-div" role="list">
        {rows.map(({ f, v }) => (
          <li key={f.id} className="dm-div__row" title={`${f.name} : ${signed(v)}`}>
            <span className="dm-div__lab"><i style={{ background: color.get(f.id) }} aria-hidden="true" />{f.name}</span>
            <span className="dm-div__track" aria-hidden="true">
              <span className="dm-div__neg">{v != null && v < 0 && <i style={{ width: `${(-v / max) * 100}%` }} />}</span>
              <span className="dm-div__pos">{v != null && v > 0 && <i style={{ width: `${(v / max) * 100}%` }} />}</span>
            </span>
            <b className={`num ${v == null ? "muted" : v >= 0 ? "up-t" : "down-t"}`}>{v == null ? "—" : signed(v)}</b>
          </li>
        ))}
      </ul>
      {funds.some((f) => f.flows_off) && <p className="small muted dm-note">Collecte JUMP neutralisée pour certains fonds (opérations sur titres) : non affichée.</p>}
    </>
  );
}

// ------------------------------------------------------------------ dernières souscriptions (passif)
function Subscriptions({ b }: { b: Board }) {
  const ps = b.passif;
  const [view, setView] = useState<"ops" | "months">("ops");
  return (
    <>
      <div className="dm-card__head dm-card__head--stack">
        <div><div className="eyebrow">Passif · transactions{ps?.flows_end ? ` au ${fdate(ps.flows_end)}` : ""}</div>
          <h3 className="dm-h3">{view === "ops" ? "Dernières souscriptions" : "Souscriptions et rachats, 13 mois"}</h3></div>
        <PeriodTabs value={view} onChange={setView} label="Vue" options={[{ key: "ops", label: "Dernières" }, { key: "months", label: "Par mois" }]} />
      </div>
      {!ps?.available || !ps.flows_available ? <div className="empty small">{ps?.reason ?? "Transactions du passif non publiées."}</div>
        : view === "ops" ? <Ops ops={ps.latest} /> : <TwinBars months={ps.monthly ?? []} height={250} />}
      {ps?.flows_available && ps.periods && (
        <dl className="dm-mini">
          {(["1M", "3M", "YTD", "1A"] as const).map((k) => ps.periods![k] && (
            <div key={k}><dt>{k === "1M" ? "1 mois" : k === "3M" ? "3 mois" : k === "YTD" ? "YTD" : "1 an"}</dt>
              <dd className={`num ${ps.periods![k].net >= 0 ? "up-t" : "down-t"}`}>{signed(ps.periods![k].net)}</dd></div>
          ))}
        </dl>
      )}
    </>
  );
}

// ------------------------------------------------------------------ détention par zone : globe 3D ou tableau
function Zones({ b, color }: { b: Board; color: Map<string, string> }) {
  const ps = b.passif!;
  const [view, setView] = useState<"globe" | "table">(webglAvailable() ? "globe" : "table");
  const [open, setOpen] = useState<string | null>(null);
  const countries = useMemo(() => ps.zones.flatMap((z) => z.countries.filter((c) => c.iso)), [ps.zones]);
  return (
    <div className="dm-zones">
      <div className="dm-card__head dm-zones__head">
        <div><div className="eyebrow">Passif · pays du porteur au {fdate(ps.as_of)}</div>
          <h3 className="dm-h3">Où sont détenus les fonds</h3>
          <p className="small muted">{eur(ps.passif_total)} suivis au passif, répartis par zone et par pays du compte porteur.</p></div>
        <PeriodTabs value={view} onChange={setView} label="Vue" options={[{ key: "globe", label: "Globe 3D", disabled: !webglAvailable() }, { key: "table", label: "Tableau" }]} />
      </div>
      <div className={`dm-zones__body${view === "globe" ? " is-globe" : ""}`}>
        {view === "globe" && <HoldGlobe countries={countries} />}
        <div className="dm-zones__list">
          {ps.zones.map((z) => (
            <ZoneLine key={z.zone} z={z} max={ps.zones[0]?.encours || 1} open={open === z.zone} onToggle={() => setOpen(open === z.zone ? null : z.zone)} funds={b.funds} color={color} detail={view === "table"} />
          ))}
          <ul className="dm-legend dm-legend--funds">{b.funds.map((f) => <li key={f.id}><i style={{ background: color.get(f.id) }} />{f.name}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}

function ZoneLine({ z, max, open, onToggle, funds, color, detail }: { z: ZoneHold; max: number; open: boolean; onToggle: () => void; funds: ManagerFund[]; color: Map<string, string>; detail: boolean }) {
  const parts = funds.map((f) => ({ f, v: z.funds?.[f.id] ?? 0 })).filter((x) => x.v > 0);
  return (
    <div className={`dm-zl${open ? " is-open" : ""}`}>
      <button type="button" className="dm-zl__btn" onClick={onToggle} aria-expanded={open}>
        <span className="dm-zl__name">{z.zone}</span>
        <span className="dm-zl__track" aria-hidden="true"><span className="dm-zl__bar" style={{ width: `${(z.encours / max) * 100}%` }}>
          {parts.map(({ f, v }) => <i key={f.id} style={{ flexGrow: v, background: color.get(f.id) }} title={`${f.name} · ${eur(v)}`} />)}</span></span>
        <b className="num">{eur(z.encours)}</b><span className="num muted">{pctRaw(z.pct, 1)}</span>
      </button>
      {(open || detail) && (
        <ul className="dm-zl__countries">
          {z.countries.map((c) => <li key={c.country}><span>{c.iso && <Flag iso={c.iso} className="dm-flag" />}{c.country}</span><span className="num">{eur(c.encours)}</span><span className="num muted">{pctRaw(c.pct, 1)}</span></li>)}
        </ul>
      )}
    </div>
  );
}

function HoldGlobe({ countries }: { countries: { country: string; iso: string | null; encours: number; positions?: number }[] }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [tip, setTip] = useState<{ c: MapCountry; x: number; y: number } | null>(null);
  const data = useMemo(() => ({
    countries: countries.map((c) => ({ country: c.country, iso: c.iso!, n_funds: Math.round(c.encours), n_shares: c.positions ?? 0, aum_registered: c.encours })),
    routes: [],
  }), [countries]);
  useEffect(() => {
    if (!host.current || !labels.current) return;
    let alive = true;
    let scene: import("../../three/GlobeScene").GlobeScene | null = null;
    Promise.all([import("../../three/GlobeScene"), import("world-atlas/countries-110m.json")]).then(([{ GlobeScene }, world]) => {
      if (!alive || !host.current || !labels.current) return;
      scene = new GlobeScene(host.current, ((world as unknown as { default?: never }).default ?? (world as never)), data, {
        reduced, labelLayer: labels.current, domColors: {}, formatValue: (v) => eur(v), view: [9, 44, 27], labels: 7,
        onHover: (c, x, y) => setTip(c ? { c, x, y } : null), onSelect: () => undefined,
      });
    });
    return () => { alive = false; scene?.dispose(); };
  }, [data, reduced]);
  return (
    <div className="dm-globe">
      <div className="dm-globe__canvas" ref={host} />
      <div className="globe__labels" ref={labels} aria-hidden="true" />
      {tip && (
        <div className="city__tip globe__tip" style={{ transform: `translate(-50%, -100%) translate(${tip.x}px, ${tip.y - 18}px)` }} role="status">
          <div className="city__tip-f">Pays du porteur</div>
          <div className="city__tip-n">{tip.c.country}</div>
          <div className="city__tip-v num">{eur(tip.c.aum_registered)} · {tip.c.n_shares} position{tip.c.n_shares > 1 ? "s" : ""}</div>
        </div>
      )}
      <p className="dm-globe__hint small" aria-hidden="true">Glisser pour faire tourner le globe</p>
    </div>
  );
}

// ------------------------------------------------------------------ portefeuille du fonds phare
function Portfolio({ p }: { p: NonNullable<Board["portfolio"]> }) {
  const max = Math.max(1, ...p.lines.map((l) => l.weight ?? 0));
  return (
    <>
      <div className="dm-card__head">
        <div><div className="eyebrow">Portefeuille · inventaire du {fdate(p.date)}</div>
          <h3 className="dm-h3">Les dix premières lignes de {p.name}</h3></div>
        <dl className="dm-mini dm-mini--inline">
          <div><dt>Lignes</dt><dd className="num">{p.n_lines}</dd></div>
          <div><dt>10 premières</dt><dd className="num">{pctRaw(p.top10_weight, 1)}</dd></div>
          <div><dt>Liquidités</dt><dd className="num">{pctRaw(p.cash_weight, 1)}</dd></div>
        </dl>
      </div>
      <div className="dm-port">
        <ol className="dm-lines">
          {p.lines.map((l, i) => (
            <li key={l.key}>
              <span className="dm-lines__r num">{i + 1}</span>
              <span className="dm-lines__n"><Link to={`/portefeuilles/ligne?key=${encodeURIComponent(l.key)}`}>{l.name}</Link>
                <em>{[l.asset_class, l.isin].filter(Boolean).join(" · ")}{l.is_new ? " · nouvelle ligne" : ""}</em></span>
              <span className="dm-lines__bar" aria-hidden="true"><i style={{ width: `${((l.weight ?? 0) / max) * 100}%` }} /></span>
              <b className="num">{pctRaw(l.weight, 2)}</b>
            </li>
          ))}
        </ol>
        <div className="dm-port__side">
          <div className="eyebrow">Classes d'actifs</div>
          <ul className="dm-classes">{p.by_class.map((c) => (
            <li key={c.label}><span>{c.label}</span><span className="dm-classes__bar" aria-hidden="true"><i style={{ width: `${Math.min(100, c.weight)}%` }} /></span><b className="num">{pctRaw(c.weight, 1)}</b></li>
          ))}</ul>
          {p.moves.length > 0 && (
            <>
              <div className="eyebrow dm-port__mv">Mouvements depuis l'inventaire précédent</div>
              <ul className="dm-moves">{p.moves.map((m) => (
                <li key={m.key + m.kind}><span className={`dm-moves__k is-${m.change >= 0 ? "in" : "out"}`}>{m.kind}</span><span>{m.name}</span>
                  <b className={`num ${m.change >= 0 ? "up-t" : "down-t"}`}>{m.change > 0 ? "+" : "−"}{pctRaw(Math.abs(m.change), 2).replace("%", "pt")}</b></li>
              ))}</ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
