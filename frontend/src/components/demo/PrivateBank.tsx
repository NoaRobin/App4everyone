/**
 * Démo — banque privée Rothschild Martin Maurel, lue comme un associé gérant la lit : un canal de distribution.
 * Le canal RMM = les comptes du passif tenus par RMM ou classés RMM (jamais « hors RMM ») ; on y lit ce qu'il pèse
 * (encours, part du passif), ce qu'il rapporte (encours × frais de la part détenue), où se trouvent ces revenus (fonds,
 * parts, canaux, classes d'actifs, pays), comment il bouge (collecte, rotation) et les fonds Rothschild Martin Maurel
 * eux-mêmes (règle Product Info). Rien n'est reconstruit : seuls les champs présents dans la donnée sont lus.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { scaleBand, scaleLinear } from "d3-scale";
import { useApi } from "../../lib/api";
import { useApp } from "../../lib/context";
import { CATEGORICAL, OTHER } from "../../lib/families";
import { date as fdate, eur, pctRaw } from "../../lib/format";
import { useWidth } from "../charts";
import { Flag } from "../Flag";
import { Loading } from "../ui";
import { ClientTable, Kpi, Ops, PeriodTabs, ShareBar, signed, SplitRows, tone, TwinBars } from "./kit";
import { BoardBody } from "./ManagerBoard";
import { SALES_PERIODS } from "./Sales";
import type { ManagerBoard as ManagerBoardData, RmmBank, RmmRow } from "./types";

const rate = (r: number | null | undefined) => (r == null ? "—" : `${r.toLocaleString("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} %`);

export function PrivateBank({ index, name }: { index: number; name: string }) {
  const { api } = useApp();
  useEffect(() => { document.title = "Banque privée — Démo Eureka"; }, []);
  const { data: v, loading } = useApi<RmmBank>(api("/api/demo/banque-privee"));
  const rmm = useApi<ManagerBoardData>(api("/api/demo/fonds-rmm"));
  const y1 = v?.periods?.["1A"];
  return (
    <section className="dm-chap" id="banque-privee" aria-labelledby="h-bp">
      <header className="dm-chap__head">
        <span className="dm-chap__num" aria-hidden="true">{String(index).padStart(2, "0")}</span>
        <div className="dm-chap__title">
          <div className="eyebrow dm-eyebrow">Rothschild Martin Maurel · canal banque privée</div>
          <h2 className="dm-chap__name" id="h-bp">Banque privée</h2>
          <p className="dm-person">Interlocuteur banque privée&nbsp;: <b>{name}</b></p>
          <p className="dm-chap__lede">Ce que la banque privée RMM apporte à la gestion&nbsp;: les encours qu'elle porte, les revenus qu'ils génèrent, les fonds et les parts où ils se trouvent, et la collecte qu'elle fait.</p>
        </div>
        {v?.available && (
          <dl className="dm-kpis">
            <Kpi label="Encours via RMM" value={eur(v.encours)} sub={`${pctRaw(v.share_of_passif, 1)} du passif`} />
            <Kpi label="Revenus estimés" value={eur(v.revenue)} sub={`par an · ${pctRaw(v.share_of_revenue, 0)} des revenus de la gestion`} />
            <Kpi label="Taux moyen" value={rate(v.rate)} sub="frais des parts détenues, pondérés" />
            <Kpi label="Collecte nette 12 mois" value={signed(y1?.net)} tone={tone(y1?.net)} sub={y1 ? `${eur(y1.subscriptions)} souscrits` : "transactions non publiées"} />
          </dl>
        )}
      </header>
      {loading && !v ? <Loading h={640} /> : !v?.available ? <div className="empty">{v?.reason ?? "Aucun compte RMM repéré dans le passif."}</div>
        : <Body v={v} b={rmm.data} loadingB={rmm.loading} />}
    </section>
  );
}

function Body({ v, b, loadingB }: { v: RmmBank; b: ManagerBoardData | null; loadingB: boolean }) {
  const [p, setP] = useState<"1M" | "3M" | "YTD" | "1A">("1A");
  const f = v.periods?.[p];
  const colored = (rows: RmmRow[]) => rows.map((c, i) => ({ key: c.key, value: c.encours, color: i < CATEGORICAL.length ? CATEGORICAL[i] : OTHER }));
  const rmmSplit = v.split.find((x) => x.key === "Fonds Rothschild Martin Maurel");
  const maxRev = Math.max(1, ...v.funds.map((y) => y.revenue));
  return (
    <>
      <div className="dm-act"><span className="dm-act__n">I</span><h3 className="dm-act__t">Ce que pèse le canal</h3></div>
      <div className="dm-grid">
        <dl className="dm-kpis dm-kpis--wide dm-span-12">
          <Kpi label="Encours via RMM" value={eur(v.encours)} sub={`au ${fdate(v.as_of)} · passif total ${eur(v.passif_total)}`} />
          <Kpi label="Part du passif" value={pctRaw(v.share_of_passif, 1)} sub="de l'encours détenu par les porteurs" />
          <Kpi label="Part des revenus" value={pctRaw(v.share_of_revenue, 1)} sub={`${eur(v.revenue)} par an`} />
          <Kpi label="Dans les fonds RMM" value={pctRaw(rmmSplit?.pct, 0)} sub={`${eur(rmmSplit?.encours ?? 0)} · le reste dans la gamme`} />
          <Kpi label="Clients" value={v.clients_count.toLocaleString("fr-FR")} sub={`${v.accounts.toLocaleString("fr-FR")} comptes · ${v.positions.toLocaleString("fr-FR")} positions`} />
        </dl>
        <article className="dm-card dm-span-7">
          <div className="dm-card__head"><div><div className="eyebrow">Canaux RMM · classification du compte</div><h3 className="dm-h3">Par où passe l'argent</h3></div></div>
          <RevRows rows={v.segments} />
          <div className="eyebrow dm-sub">Fonds Rothschild Martin Maurel ou reste de la gamme</div>
          <RevRows rows={v.split} />
        </article>
        <article className="dm-card dm-span-5">
          <div className="dm-card__head"><div><div className="eyebrow">Pays du compte</div><h3 className="dm-h3">Où sont les clients</h3></div></div>
          <RevRows rows={v.countries.slice(0, 10)} flags />
          <div className="eyebrow dm-sub">Classes d'actifs</div>
          <ShareBar items={colored(v.classes)} label="Encours par classe d'actifs" />
          <RevRows rows={v.classes} />
        </article>
      </div>

      <div className="dm-act"><span className="dm-act__n">II</span><h3 className="dm-act__t">D'où viennent les revenus</h3></div>
      <div className="dm-grid">
        <article className="dm-card dm-span-12">
          <div className="dm-card__head"><div><div className="eyebrow">Fonds détenus via RMM · {v.funds_count} fonds</div><h3 className="dm-h3">Encours et revenus, fonds par fonds</h3></div></div>
          <div className="dm-scroll">
            <table className="t dm-rt">
              <thead><tr><th>Fonds</th><th>Classe</th><th className="n">Encours</th><th className="n">Poids</th><th className="n">Taux</th><th className="n">Revenus / an</th><th className="dm-rt__bar"><span className="sr-only">Revenus relatifs</span></th></tr></thead>
              <tbody>{v.funds.map((x) => (
                <tr key={x.name}>
                  <td>{x.fund ? <Link to={`/fonds/${encodeURIComponent(x.fund)}`}>{x.name}</Link> : x.name}{x.rmm_fund && <span className="dm-rmm" title="Fonds Rothschild Martin Maurel (Product Info)">RMM</span>}</td>
                  <td className="muted">{x.classe}</td>
                  <td className="n num">{eur(x.encours)}</td><td className="n num muted">{pctRaw(x.pct, 1)}</td>
                  <td className="n num">{rate(x.rate)}</td><td className="n num"><b>{eur(x.revenue)}</b></td>
                  <td className="dm-rt__bar"><span className="dm-funds__bar" aria-hidden="true"><i style={{ width: `${(x.revenue / maxRev) * 100}%` }} /></span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="small muted dm-note">Revenus estimés = encours détenu × frais de gestion de la part ({pctRaw(v.rate_coverage, 0)} de l'encours a un taux connu). « RMM » : fonds Rothschild Martin Maurel d'après Product Info.</p>
        </article>
        <article className="dm-card dm-span-12">
          <div className="dm-card__head"><div><div className="eyebrow">Parts détenues</div><h3 className="dm-h3">Les parts qui rapportent le plus</h3></div></div>
          <div className="dm-scroll">
            <table className="t dm-rt">
              <thead><tr><th>Part</th><th>ISIN</th><th className="n">Encours</th><th className="n">Poids</th><th className="n">Taux</th><th className="n">Revenus / an</th></tr></thead>
              <tbody>{v.shares.map((x, i) => (
                <tr key={x.isin ?? `${x.share}-${i}`}>
                  <td>{x.fund ? <Link to={`/fonds/${encodeURIComponent(x.fund)}`}>{x.share ?? "—"}</Link> : x.share ?? "—"}</td>
                  <td className="num muted">{x.isin ?? "—"}</td>
                  <td className="n num">{eur(x.encours)}</td><td className="n num muted">{pctRaw(x.pct, 1)}</td>
                  <td className="n num">{rate(x.rate)}</td><td className="n num"><b>{eur(x.revenue)}</b></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </article>
      </div>

      <div className="dm-act"><span className="dm-act__n">III</span><h3 className="dm-act__t">Comment il bouge</h3>
        {v.flows_available && <PeriodTabs value={p} onChange={setP} options={SALES_PERIODS} />}</div>
      {!v.flows_available || !f ? <div className="empty">Transactions du passif non publiées.</div> : (
        <div className="dm-grid">
          <dl className="dm-kpis dm-kpis--wide dm-span-12">
            <Kpi label="Souscriptions" value={eur(f.subscriptions)} sub={`${f.n.toLocaleString("fr-FR")} opérations`} />
            <Kpi label="Rachats" value={eur(f.redemptions)} />
            <Kpi label="Collecte nette" value={signed(f.net)} tone={tone(f.net)} sub={`depuis le ${fdate(f.start)}`} />
            <Kpi label="Clients actifs" value={f.clients.toLocaleString("fr-FR")} sub="au moins une opération" />
            <Kpi label="Taux de rachat" value={pctRaw(v.encours ? (f.redemptions / v.encours) * 100 : null, 0)} sub="rachats rapportés à l'encours actuel" />
          </dl>
          <article className="dm-card dm-span-7">
            <div className="dm-card__head"><div><div className="eyebrow">Mois par mois · au {fdate(v.flows_end)}</div><h3 className="dm-h3">Souscriptions et rachats</h3></div></div>
            <TwinBars months={v.monthly ?? []} height={270} />
          </article>
          <article className="dm-card dm-span-5">
            <div className="dm-card__head"><div><div className="eyebrow">Par canal RMM · sur un an</div><h3 className="dm-h3">Qui collecte</h3></div></div>
            <SplitRows rows={v.flow_segments ?? []} />
            <div className="eyebrow dm-sub">Par classe d'actifs · sur un an</div>
            <SplitRows rows={v.flow_classes ?? []} />
          </article>
          <article className="dm-card dm-span-7">
            <div className="dm-card__head"><div><div className="eyebrow">Rotation · sur un an</div><h3 className="dm-h3">Les fonds que la banque privée renforce, ceux qu'elle allège</h3></div></div>
            <SplitRows rows={(v.rotation ?? []).map((x) => ({ ...x, key: x.name }))} />
          </article>
          <article className="dm-card dm-span-5">
            <div className="dm-card__head"><div><div className="eyebrow">Dernières opérations</div><h3 className="dm-h3">Trois derniers mois</h3></div></div>
            <Ops ops={v.latest ?? []} showCommercial={false} />
          </article>
        </div>
      )}

      <div className="dm-act"><span className="dm-act__n">IV</span><h3 className="dm-act__t">Les fonds Rothschild Martin Maurel</h3></div>
      {loadingB && !b ? <Loading h={360} /> : !b?.funds.length ? <div className="empty">Aucun fonds Rothschild Martin Maurel repéré dans Product Info.</div> : (
        <>
          <BoardBody b={b} compact />
          {b.rule && <p className="small muted dm-note">Fonds Rothschild Martin Maurel : fonds de Product Info dont l'une des colonnes {b.rule.columns.join(", ")} contient « RMM » ou « Martin Maurel » (même règle que le filtre RMM de Distribution). Tous porteurs confondus.</p>}
        </>
      )}

      <div className="dm-act"><span className="dm-act__n">V</span><h3 className="dm-act__t">Les clients</h3></div>
      <div className="dm-grid">
        <article className="dm-card dm-span-12"><Vintage v={v} /></article>
        <article className="dm-card dm-span-12">
          <div className="dm-card__head"><div><div className="eyebrow">Clients du canal RMM · au {fdate(v.as_of)}</div><h3 className="dm-h3">Qui est investi dans quoi</h3></div></div>
          <ClientTable clients={v.clients} />
        </article>
      </div>
      <p className="small muted dm-note">Canal RMM : comptes du passif dont le teneur ({v.matched.teneurs.join(", ") || "—"}) ou la classification ({v.matched.classifications.join(", ") || "—"}) désigne Rothschild Martin Maurel, hors mentions « hors RMM ». Vue nominative calculée à la demande, jamais conservée.</p>
    </>
  );
}

/** Lignes encours / revenus : libellé, barre d'encours, encours, revenus, poids. */
function RevRows({ rows, flags = false }: { rows: RmmRow[]; flags?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.encours));
  if (!rows.length) return <div className="empty small">Non renseigné.</div>;
  return (
    <ul className="dm-rev">
      <li className="dm-rev__h" aria-hidden="true"><span /><span /><span>Encours</span><span>Revenus</span><span>Poids</span></li>
      {rows.map((r) => (
        <li key={r.key}>
          <span className="dm-rev__n" title={r.key}>{flags && r.iso && <Flag iso={r.iso} className="dm-flag" />}{r.key}</span>
          <span className="dm-funds__bar" aria-hidden="true"><i style={{ width: `${(r.encours / max) * 100}%` }} /></span>
          <b className="num">{eur(r.encours)}</b><span className="num">{eur(r.revenue)}</span><span className="num muted">{pctRaw(r.pct, 1)}</span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ ancienneté des positions
function Vintage({ v }: { v: RmmBank }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const ys = v.vintage;
  const W = Math.max(width, 300), H = 200, mg = { t: 24, r: 8, b: 26, l: 8 };
  const x = scaleBand<number>().domain(ys.map((y) => y.year)).range([mg.l, W - mg.r]).paddingInner(0.22);
  const y = scaleLinear().domain([0, Math.max(1, ...ys.map((d) => d.encours))]).range([H - mg.b, mg.t]);
  const recent = ys.filter((d) => d.year >= Number(v.as_of.slice(0, 4)) - 2).reduce((s, d) => s + (d.pct ?? 0), 0);
  return (
    <>
      <div className="dm-card__head"><div><div className="eyebrow">Fidélité · année du premier achat</div><h3 className="dm-h3">Depuis quand l'argent est là</h3></div>
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
