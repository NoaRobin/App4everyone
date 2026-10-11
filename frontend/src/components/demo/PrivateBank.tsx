/**
 * Démo — banque privée : ce que détiennent et ce qu'investissent les clients d'un commercial (ou de tout le segment
 * banque privée). Détention : classes d'actifs, fonds, zones, matrice clients × fonds, ancienneté des positions.
 * Investissement : souscriptions et rachats mois par mois, rotation entre fonds et classes d'actifs, dernières opérations.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { scaleBand, scaleLinear } from "d3-scale";
import { useApi } from "../../lib/api";
import { useApp } from "../../lib/context";
import { CATEGORICAL, OTHER } from "../../lib/families";
import { date as fdate, eur, pctRaw } from "../../lib/format";
import { useWidth } from "../charts";
import { Loading } from "../ui";
import { ClientTable, Kpi, NameMatch, Ops, PeriodTabs, ShareBar, signed, SplitRows, tone, TwinBars } from "./kit";
import { HoldZones, SALES_PERIODS } from "./Sales";
import type { Match, PrivateBankView } from "./types";

export function PrivateBank({ index, name, match }: { index: number; name: string; match: Match }) {
  const { api } = useApp();
  const [scope, setScope] = useState<"commercial" | "segment">("commercial");
  useEffect(() => { document.title = "Banque privée — Démo Jasmin"; }, []);
  const who = match.found ?? name;
  const { data, loading } = useApi<PrivateBankView>(api(`/api/demo/banque-privee?nom=${encodeURIComponent(who)}&perimetre=${scope}`));
  return (
    <section className="dm-chap" id="banque-privee" aria-labelledby="h-bp">
      <header className="dm-chap__head">
        <span className="dm-chap__num" aria-hidden="true">{String(index).padStart(2, "0")}</span>
        <div className="dm-chap__title">
          <div className="eyebrow dm-eyebrow">Passif · vue nominative</div>
          <h2 className="dm-chap__name" id="h-bp">Banque privée</h2>
          <p className="dm-person">{scope === "commercial" ? <>Commercial&nbsp;: <b>{who}</b></> : <>Tout le segment banque privée (classification des comptes)</>}</p>
          {scope === "commercial" && <NameMatch match={data?.match ?? match} source="la colonne Commercial du passif" />}
          <p className="dm-chap__lede">Ce que ses clients détiennent, ce qu'ils achètent et vendent, depuis quand ils sont là.</p>
        </div>
        <PeriodTabs value={scope} onChange={setScope} label="Périmètre" options={[{ key: "commercial", label: `Clients de ${who}` }, { key: "segment", label: "Tout le segment" }]} />
      </header>
      {loading && !data ? <Loading h={520} /> : !data?.available ? <div className="empty">{data?.reason ?? "Données indisponibles."}</div> : <Body v={data} />}
    </section>
  );
}

function Body({ v }: { v: PrivateBankView }) {
  const [p, setP] = useState<"1M" | "3M" | "YTD" | "1A">("1A");
  const f = v.periods?.[p];
  const cls = v.classes.map((c, i) => ({ key: c.key, value: c.encours, color: i < CATEGORICAL.length ? CATEGORICAL[i] : OTHER }));
  const maxF = Math.max(1, ...v.by_fund.map((x) => x.encours));
  return (
    <div className="dm-grid">
      <dl className="dm-kpis dm-kpis--wide dm-span-12">
        <Kpi label="Encours détenu" value={eur(v.encours)} sub={`au ${fdate(v.as_of)}`} />
        <Kpi label="Clients" value={v.clients_count.toLocaleString("fr-FR")} sub={`${v.funds_count} fonds détenus`} />
        <Kpi label="Collecte nette 12 mois" value={signed(v.periods?.["1A"]?.net)} tone={tone(v.periods?.["1A"]?.net)} sub={v.periods ? `${eur(v.periods["1A"].subscriptions)} souscrits` : undefined} />
        <Kpi label="Argent nouveau" value={eur(v.new_money_ytd)} sub={`positions ouvertes en ${v.as_of.slice(0, 4)}`} />
        <Kpi label="Concentration" value={pctRaw(v.concentration.top5, 0)} sub={`de l'encours chez les 5 premiers clients`} />
      </dl>

      <div className="dm-span-12 dm-act"><span className="dm-act__n">I</span><h3 className="dm-act__t">Ce qu'ils détiennent</h3></div>
      <article className="dm-card dm-span-7">
        <div className="dm-card__head"><div><div className="eyebrow">Classes d'actifs</div><h3 className="dm-h3">Allocation de l'encours</h3></div></div>
        <ShareBar items={cls} label="Encours par classe d'actifs" />
        <div className="eyebrow dm-sub">Fonds détenus</div>
        <ul className="dm-funds">
          {v.by_fund.slice(0, 10).map((x) => (
            <li key={x.name}>
              <span className="dm-funds__n">{x.fund ? <Link to={`/fonds/${encodeURIComponent(x.fund)}`}>{x.name}</Link> : x.name}<em>{x.classe} · {x.clients} client{x.clients > 1 ? "s" : ""}</em></span>
              <span className="dm-funds__bar" aria-hidden="true"><i style={{ width: `${(x.encours / maxF) * 100}%` }} /></span>
              <b className="num">{eur(x.encours)}</b><span className="num muted">{pctRaw(x.pct, 1)}</span>
            </li>
          ))}
        </ul>
      </article>
      <article className="dm-card dm-span-5">
        <div className="dm-card__head"><div><div className="eyebrow">Pays du porteur</div><h3 className="dm-h3">Où sont ses clients</h3></div></div>
        <HoldZones zones={v.zones} />
        <div className="eyebrow dm-sub">Clientèle</div>
        <ul className="dm-segs dm-segs--col">{v.segments.map((s) => <li key={s.segment}><span>{s.segment}</span><b className="num">{eur(s.encours)}</b><span className="muted num">{pctRaw(s.pct, 0)}</span></li>)}</ul>
        <div className="eyebrow dm-sub">Concentration</div>
        <ul className="dm-conc">
          {([["Premier client", v.concentration.top1], ["5 premiers", v.concentration.top5], ["10 premiers", v.concentration.top10]] as [string, number | null][]).map(([k, x]) => (
            <li key={k}><span>{k}</span><span className="dm-conc__bar" aria-hidden="true"><i style={{ width: `${x ?? 0}%` }} /></span><b className="num">{pctRaw(x, 0)}</b></li>
          ))}
        </ul>
      </article>
      <article className="dm-card dm-span-12"><Matrix v={v} /></article>
      <article className="dm-card dm-span-12"><Vintage v={v} /></article>

      <div className="dm-span-12 dm-act"><span className="dm-act__n">II</span><h3 className="dm-act__t">Ce qu'ils investissent</h3>
        {v.flows_available && <PeriodTabs value={p} onChange={setP} options={SALES_PERIODS} />}</div>
      {!v.flows_available || !f ? <div className="empty dm-span-12">Transactions du passif non publiées.</div> : (
        <>
          <article className="dm-card dm-span-7">
            <div className="dm-card__head"><div><div className="eyebrow">Mois par mois · au {fdate(v.flows_end)}</div><h3 className="dm-h3">Souscriptions et rachats</h3></div>
              <dl className="dm-mini dm-mini--inline">
                <div><dt>Souscrit</dt><dd className="num">{eur(f.subscriptions)}</dd></div>
                <div><dt>Racheté</dt><dd className="num">{eur(f.redemptions)}</dd></div>
                <div><dt>Net</dt><dd className={`num ${f.net >= 0 ? "up-t" : "down-t"}`}>{signed(f.net)}</dd></div>
              </dl></div>
            <TwinBars months={v.monthly ?? []} height={270} />
          </article>
          <article className="dm-card dm-span-5">
            <div className="dm-card__head"><div><div className="eyebrow">Dernières opérations</div><h3 className="dm-h3">Trois derniers mois</h3></div></div>
            <Ops ops={v.latest ?? []} showCommercial={v.scope === "segment"} />
          </article>
          <article className="dm-card dm-span-7">
            <div className="dm-card__head"><div><div className="eyebrow">Rotation · sur un an</div><h3 className="dm-h3">Les fonds qu'ils renforcent, ceux qu'ils allègent</h3></div></div>
            <SplitRows rows={(v.rotation ?? []).map((x) => ({ ...x, key: x.name }))} />
          </article>
          <article className="dm-card dm-span-5">
            <div className="dm-card__head"><div><div className="eyebrow">Classes d'actifs · sur un an</div><h3 className="dm-h3">Vers quoi va l'argent</h3></div></div>
            <SplitRows rows={v.flow_classes ?? []} />
          </article>
        </>
      )}

      <div className="dm-span-12 dm-act"><span className="dm-act__n">III</span><h3 className="dm-act__t">Ses clients</h3></div>
      <article className="dm-card dm-span-12"><ClientTable clients={v.clients} /></article>
    </div>
  );
}

// ------------------------------------------------------------------ matrice clients × fonds
function Matrix({ v }: { v: PrivateBankView }) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const m = v.matrix;
  const max = Math.max(1, ...m.values.flat());
  if (!m.clients.length || !m.funds.length) return <div className="empty small">Pas assez de positions.</div>;
  const h = hover ? { c: m.clients[hover[0]], f: m.funds[hover[1]], v: m.values[hover[0]][hover[1]] } : null;
  return (
    <>
      <div className="dm-card__head"><div><div className="eyebrow">Matrice · premiers clients × premiers fonds</div><h3 className="dm-h3">Qui détient quoi, d'un coup d'œil</h3></div>
        <div className="dm-mx__legend" aria-hidden="true"><span>0</span><i /><span>{eur(max)}</span></div></div>
      <div className="dm-scroll">
        <table className="dm-mx" onPointerLeave={() => setHover(null)}>
          <thead><tr><th />{m.funds.map((f, j) => <th key={f} scope="col" className={hover?.[1] === j ? "is-on" : ""}><span>{m.fund_ids[j] ? <Link to={`/fonds/${encodeURIComponent(m.fund_ids[j]!)}`}>{f}</Link> : f}</span></th>)}</tr></thead>
          <tbody>{m.clients.map((c, i) => (
            <tr key={c}>
              <th scope="row" className={hover?.[0] === i ? "is-on" : ""}>{c}</th>
              {m.values[i].map((x, j) => {
                const k = x / max;
                return (
                  <td key={j} onPointerEnter={() => setHover([i, j])} title={`${c} · ${m.funds[j]} : ${x ? eur(x) : "aucune position"}`}
                    style={{ background: x ? `color-mix(in srgb, var(--gold) ${Math.round(12 + Math.sqrt(k) * 78)}%, var(--paper-2))` : undefined }}
                    className={x ? "" : "is-zero"}>{x ? <span className="num">{eur(x)}</span> : ""}</td>
                );
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="small muted dm-note" aria-live="polite">{h ? <><b>{h.c}</b> · {h.f} : {h.v ? eur(h.v) : "aucune position"}</> : "Survolez une case. Intensité de l'or : encours détenu."}</p>
    </>
  );
}

// ------------------------------------------------------------------ ancienneté des positions
function Vintage({ v }: { v: PrivateBankView }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const ys = v.vintage;
  const W = Math.max(width, 300), H = 200, mg = { t: 24, r: 8, b: 26, l: 8 };
  const x = scaleBand<number>().domain(ys.map((y) => y.year)).range([mg.l, W - mg.r]).paddingInner(0.22);
  const y = scaleLinear().domain([0, Math.max(1, ...ys.map((d) => d.encours))]).range([H - mg.b, mg.t]);
  const recent = ys.filter((d) => d.year >= Number(v.as_of.slice(0, 4)) - 2).reduce((s, d) => s + (d.pct ?? 0), 0);
  return (
    <>
      <div className="dm-card__head"><div><div className="eyebrow">Fidélité · année du premier achat</div><h3 className="dm-h3">Depuis quand ils sont là</h3></div>
        <p className="small muted dm-vin__s">{pctRaw(recent, 0)} de l'encours a été investi pour la première fois ces trois dernières années.</p></div>
      <div ref={ref} className="chart">
        {ys.length ? (
          <svg width={W} height={H} role="img" aria-label={`Encours par année de premier achat : ${ys.map((d) => `${d.year} ${eur(d.encours)}`).join(", ")}`}>
            <line x1={mg.l} x2={W - mg.r} y1={y(0)} y2={y(0)} className="chart__base" />
            {ys.map((d, i) => (
              <g key={d.year} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} opacity={hover == null || hover === i ? 1 : 0.45}>
                <rect x={x(d.year)} y={y(d.encours)} width={x.bandwidth()} height={Math.max(0, y(0) - y(d.encours))} className={d.year >= Number(v.as_of.slice(0, 4)) - 2 ? "dm-in" : "dm-vin"} />
                {(hover === i || ys.length <= 14) && <text x={(x(d.year) ?? 0) + x.bandwidth() / 2} y={y(d.encours) - 6} textAnchor="middle" className="chart__tick">{hover === i ? eur(d.encours) : pctRaw(d.pct, 0)}</text>}
                <text x={(x(d.year) ?? 0) + x.bandwidth() / 2} y={H - 8} textAnchor="middle" className="chart__tick">{ys.length > 14 && i % 2 ? "" : d.year}</text>
              </g>
            ))}
          </svg>
        ) : <div className="empty small">Dates de premier achat non renseignées.</div>}
      </div>
    </>
  );
}
