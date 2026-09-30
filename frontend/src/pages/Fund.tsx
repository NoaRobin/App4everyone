import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, longDate, nav as fnav, num, pct, pctRaw, PERIOD_LABEL, PERIOD_SHORT, plural } from "../lib/format";
import { FAMILY_LABEL, famVar } from "../lib/families";
import type { FundDetail, Section as Sec } from "../lib/types";
import { BigMoney, Bool, CopyCode, Crumbs, Decomposition, Delta, ErrorState, ExportCsv, FamilyTag, Loading, SriScale, Stars, useReveal } from "../components/ui";
import { BarList, FlowBars, RangeTabs, TimeChart, fmtIndex, sliceRange } from "../components/charts";
import { CountryTiles } from "../components/CountryTiles";
import * as I from "../components/Icon";

const TOC = [
  ["synthese", "Synthèse"], ["encours", "Encours"], ["performance", "Performance"], ["parts", "Parts"], ["portefeuille", "Portefeuille"],
  ["esg", "ESG"], ["distribution", "Distribution"], ["caracteristiques", "Caractéristiques"], ["controles", "Contrôles"],
] as const;

export default function Fund() {
  const { id = "" } = useParams();
  const { api } = useApp();
  const { data, error } = useApi<FundDetail>(api(`/api/funds/${encodeURIComponent(id)}`));
  useReveal(data);
  useEffect(() => { if (data) document.title = `${data.name} — Rothschild & Co`; }, [data]);
  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><Loading h={560} /></div>;
  return <FundView f={data} />;
}

function FundView({ f }: { f: FundDetail }) {
  const h = f.headline;
  const [active, setActive] = useState("synthese");
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: "-30% 0px -65% 0px" });
    TOC.forEach(([k]) => { const el = document.getElementById(k); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [f.id]);
  return (
    <div className="fund" style={{ ["--fc" as string]: famVar(f.family) }}>
      <header className="fund__hero" id="synthese">
        <div className="fund__hero-in">
          <Crumbs items={[{ label: "Fonds", to: "/fonds" }, { label: FAMILY_LABEL[f.family], to: `/selection?family=${f.family}` }, { label: f.name }]} />
          <div className="fund__hero-grid">
            <div>
              <div className="row" style={{ gap: 8, marginBottom: 18 }}>
                <FamilyTag k={f.family} />
                {h.sfdr && <Link to={`/selection?sfdr=${encodeURIComponent(h.sfdr)}`} className="tag tag--link">SFDR {h.sfdr.replace("Article ", "art. ")}</Link>}
                {h.domicile && <Link to={`/selection?domicile=${encodeURIComponent(h.domicile)}`} className="tag tag--link">{h.domicile}</Link>}
                {h.legal_form && <span className="tag">{h.legal_form}</span>}
                {!f.referenced && <span className="tag tag--warn"><I.Alert size={13} /> Hors référentiel produits</span>}
              </div>
              <h1 className="fund__name">{f.name}</h1>
              <p className="fund__sub">
                {[h.expertise, h.range && `Gamme ${h.range}`, h.asset_class].filter(Boolean).join(" · ")}
              </p>
              <dl className="fund__facts">
                {h.manager && <div><dt>Gérant</dt><dd><Link className="link" to={`/selection?manager=${encodeURIComponent(h.manager)}`}>{h.manager}</Link>{h.backup && <span className="muted"> · suppléant <Link className="link" to={`/selection?manager=${encodeURIComponent(h.backup)}`}>{h.backup}</Link></span>}</dd></div>}
                {h.sri && <div><dt>Risque (SRI)</dt><dd><SriScale value={h.sri} previous={h.sri_prev} /></dd></div>}
                {h.benchmark && <div><dt>Indicateur de référence</dt><dd>{h.benchmark}</dd></div>}
                {h.horizon && <div><dt>Durée recommandée</dt><dd>{h.horizon}</dd></div>}
                {h.creation && <div><dt>Création</dt><dd className="num">{fdate(h.creation)}</dd></div>}
                {h.maturity && <div><dt>Échéance</dt><dd className="num">{fdate(h.maturity)}</dd></div>}
              </dl>
            </div>
            <div className="fund__aum">
              <div className="eyebrow">Encours au {fdate(f.date)}</div>
              <div className="fund__aum-v"><BigMoney v={f.aum} unitClass="fund__aum-u" /></div>
              <div className="fund__aum-vars">
                {(["1M", "YTD", "1A"] as const).map((p) => (
                  <div key={p}><span className="small muted">{PERIOD_SHORT[p]}</span><Delta v={f.var?.[p]?.pct} /></div>
                ))}
              </div>
              {f.performance && (
                <div className="fund__perfline small">
                  Performance YTD de la part {f.performance.share?.class ?? "principale"} : <Delta v={f.performance.fund.YTD} />
                  {f.performance.bench?.YTD != null && <span className="muted"> · indice <Delta v={f.performance.bench.YTD} /></span>}
                </div>
              )}
              <div className="small muted">{plural(f.shares.length, "part")} · {f.distribution.countries.length} pays de commercialisation</div>
            </div>
          </div>
          {h.objective && <p className="fund__obj">{h.objective}</p>}
        </div>
      </header>

      <div className="fund__body">
        <nav className="toc" aria-label="Sommaire de la fiche">
          {TOC.map(([k, l]) => <a key={k} href={`#${k}`} className={active === k ? "is-active" : ""} aria-current={active === k ? "true" : undefined}>{l}</a>)}
        </nav>
        <div className="fund__main">
          <AumSection f={f} />
          <PerfSection f={f} />
          <SharesSection f={f} />
          <HoldingsSection f={f} />
          <EsgSection f={f} />
          <DistribSection f={f} />
          <CharSection sections={f.sections} validations={f.validations} />
          <ControlsSection f={f} />
        </div>
      </div>
    </div>
  );
}

function SectionHead({ id, eyebrow, title, right }: { id: string; eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="section__head">
      <div><div className="eyebrow">{eyebrow}</div><h2 className="h2" id={`h-${id}`}>{title}</h2></div>
      {right}
    </div>
  );
}

function AumSection({ f }: { f: FundDetail }) {
  const [range, setRange] = useState("3y");
  const [p, setP] = useState<"1M" | "YTD" | "1A">("YTD");
  if (!f.var) return null;
  const pts = sliceRange(f.aum_series, range);
  return (
    <section className="section reveal" id="encours" aria-labelledby="h-encours">
      <SectionHead id="encours" eyebrow="Encours" title="Évolution des encours" right={<RangeTabs value={range} onChange={setRange} options={[{ key: "1y", label: "1 an" }, { key: "3y", label: "3 ans" }, { key: "all", label: "Tout" }]} />} />
      <div className="card card--flat">
        <TimeChart series={[{ key: "aum", label: "Encours", color: "var(--fc)", points: pts, fill: true }]} height={300} ariaLabel={`Évolution des encours de ${f.name}`} />
      </div>
      <div className="grid grid-2" style={{ marginTop: 24 }}>
        <div className="card card--flat">
          <div className="spread" style={{ marginBottom: 16 }}>
            <h3 className="h3">D'où vient la variation&nbsp;?</h3>
            <div className="seg seg--s" role="radiogroup" aria-label="Période">
              {(["1M", "YTD", "1A"] as const).map((x) => <button key={x} type="button" role="radio" aria-checked={p === x} className="seg__b" onClick={() => setP(x)}>{PERIOD_SHORT[x]}</button>)}
            </div>
          </div>
          <div className="row" style={{ alignItems: "baseline", gap: 12, marginBottom: 14 }}>
            <span className="h2 num">{eur(f.var[p]?.delta, { signed: true })}</span><Delta v={f.var[p]?.pct} />
          </div>
          <Decomposition v={f.var[p]} />
          <table className="t t--mini" style={{ marginTop: 18 }}>
            <thead><tr><th>Période</th><th className="n">Variation</th><th className="n">Collecte</th><th className="n">Marché</th></tr></thead>
            <tbody>{(["1J", "1S", "1M", "3M", "YTD", "1A", "3A"] as const).map((k) => (
              <tr key={k}><td>{PERIOD_LABEL[k]}</td><td className="n"><Delta v={f.var![k]?.pct} /></td><td className="n">{eur(f.var![k]?.flows, { signed: true })}</td><td className="n">{eur(f.var![k]?.market, { signed: true })}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="card card--flat">
          <h3 className="h3" style={{ marginBottom: 16 }}>Collecte nette estimée, mois par mois</h3>
          <FlowBars points={f.flows_monthly} ariaLabel={`Collecte nette estimée mensuelle de ${f.name}`} />
          <p className="small muted" style={{ marginTop: 10 }}>Estimation : variation du nombre de parts × VL, toutes parts confondues, en euros.</p>
        </div>
      </div>
    </section>
  );
}

function PerfSection({ f }: { f: FundDetail }) {
  const [range, setRange] = useState("3y");
  const perf = f.performance;
  const series = useMemo(() => {
    if (!perf) return [];
    const fund = sliceRange(perf.index, range);
    const rebase = (pts: typeof fund) => { const b = pts[0]?.v || 1; return pts.map((p) => ({ d: p.d, v: (p.v / b) * 100 })); };
    const from = fund[0]?.d;
    const out = [{ key: "f", label: perf.share?.class ? `Part ${perf.share.class}` : "Fonds", color: "var(--fc)", points: rebase(fund) }];
    if (perf.bench_index.length) out.push({ key: "b", label: "Indice", color: "var(--ink-3)", points: rebase(perf.bench_index.filter((p) => !from || p.d >= from)), dashed: true } as never);
    return out;
  }, [perf, range]);
  if (!perf) return null;
  const periods = ["1M", "3M", "YTD", "1A", "3A", "origine"];
  const lab: Record<string, string> = { ...PERIOD_LABEL, "3A": "3 ans (annualisée)", origine: `Depuis le ${fdate(perf.first_nav)}` };
  return (
    <section className="section reveal" id="performance" aria-labelledby="h-performance">
      <SectionHead id="performance" eyebrow="Performance" title="Performance et indicateur de référence"
        right={<RangeTabs value={range} onChange={setRange} options={[{ key: "1y", label: "1 an" }, { key: "3y", label: "3 ans" }, { key: "all", label: "Tout" }]} />} />
      <p className="small muted" style={{ marginTop: -12, marginBottom: 20 }}>
        Part de référence : <Link className="link" to={`/parts/${encodeURIComponent(perf.share?.id ?? "")}`}>{perf.share?.name}</Link> ({perf.share?.isin}) · VL au {fdate(perf.nav_date)} : <b className="num">{fnav(perf.nav, perf.nav_ccy)}</b>.
        Base 100, dividendes réinvestis et opérations sur titres neutralisées.
      </p>
      <div className="card card--flat">
        <div className="legend" style={{ marginBottom: 8 }}>{series.map((s) => <span key={s.key} className="legend__i"><span className="legend__line" style={{ background: s.color, opacity: s.key === "b" ? 0.7 : 1 }} />{s.key === "b" ? perf.bench_name : s.label}</span>)}</div>
        <TimeChart series={series} format={fmtIndex} baseline={100} height={320} ariaLabel={`Performance comparée de ${f.name} et de son indicateur de référence, base 100`} />
      </div>
      <div className="grid grid-2" style={{ marginTop: 24 }}>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Période</th><th className="n">Fonds</th><th className="n">Indice</th><th className="n">Écart</th></tr></thead>
            <tbody>{periods.map((k) => {
              const a = perf.fund[k], b = perf.bench?.[k];
              return (<tr key={k}><td>{lab[k]}</td><td className="n"><Delta v={a} /></td><td className="n">{b == null ? "—" : pct(b)}</td><td className="n">{a != null && b != null ? <Delta v={a - b} /> : "—"}</td></tr>);
            })}</tbody>
          </table>
        </div>
        <div className="card card--flat">
          <h3 className="h3" style={{ marginBottom: 16 }}>Risque réalisé sur 1 an</h3>
          <div className="grid grid-3" style={{ gap: 16 }}>
            <div className="stat"><div className="eyebrow">Volatilité</div><div className="stat__v num">{pct(perf.risk.vol, { signed: false })}</div><div className="small muted">Indice {pct(perf.risk.bench_vol, { signed: false })}</div></div>
            <div className="stat"><div className="eyebrow">Perte max.</div><div className="stat__v num">{pct(perf.risk.mdd)}</div><div className="small muted">du plus haut au plus bas</div></div>
            <div className="stat"><div className="eyebrow">Tracking error</div><div className="stat__v num">{pct(perf.risk.te, { signed: false })}</div><div className="small muted">écart de suivi</div></div>
          </div>
          {perf.dividends.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Derniers dividendes</div>
              <div className="row" style={{ gap: 8 }}>{perf.dividends.slice(-4).reverse().map((d) => <span key={d.d} className="tag num">{fdate(d.d)} · {fnav(d.v, perf.nav_ccy)}</span>)}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SharesSection({ f }: { f: FundDetail }) {
  const nav = useNavigate();
  const cols = [
    { key: "name", label: "Part" }, { key: "isin", label: "ISIN" }, { key: "ccy", label: "Devise" }, { key: "distribution", label: "Affectation" },
    { key: "investor", label: "Souscripteurs" }, { key: "ongoing", label: "Frais courants (%)" }, { key: "min_sub", label: "Minimum" },
    { key: "cutoff", label: "Cut-off" }, { key: "nav", label: "VL" }, { key: "aum", label: "Encours (€)" },
  ];
  return (
    <section className="section reveal" id="parts" aria-labelledby="h-parts">
      <SectionHead id="parts" eyebrow="Parts" title={`${f.shares.length} part${f.shares.length > 1 ? "s" : ""} pour ce fonds`} right={<ExportCsv rows={f.shares as never} columns={cols} filename={`parts-${f.name}.csv`} />} />
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Part</th><th>ISIN</th><th>Devise</th><th>Affectation</th><th>Souscripteurs</th><th className="n">Frais courants</th><th className="n">Minimum</th><th>Cut-off</th><th className="n">VL</th><th className="n">Encours</th></tr></thead>
          <tbody>
            {f.shares.map((s) => (
              <tr key={s.id} className="clickable" onClick={() => nav(`/parts/${encodeURIComponent(s.id)}`)}>
                <td className="strong">
                  <Link className="rowlink-inline" to={`/parts/${encodeURIComponent(s.id)}`} onClick={(e) => e.stopPropagation()}>{s.name}</Link>
                  {s.main && <span className="tag tag--s" style={{ marginLeft: 8 }}>principale</span>}
                  {s.link === "isin" && <span className="tag tag--s tag--warn" title="Rattachée au référentiel par son ISIN" style={{ marginLeft: 8 }}>via ISIN</span>}
                  {s.link === "none" && <span className="tag tag--s tag--warn" style={{ marginLeft: 8 }}>hors référentiel</span>}
                  {s.link === "ref" && <span className="tag tag--s" style={{ marginLeft: 8 }}>sans VL</span>}
                </td>
                <td><CopyCode code={s.isin} /></td>
                <td>{s.ccy}{s.hedged ? <span className="small muted"> couverte</span> : ""}</td>
                <td>{s.distribution ?? "—"}</td>
                <td className="small">{s.investor ?? "—"}</td>
                <td className="n">{pctRaw(s.ongoing)}</td>
                <td className="n">{s.min_sub ? eur(s.min_sub) : "—"}</td>
                <td className="num">{s.cutoff ?? "—"}</td>
                <td className="n">{fnav(s.nav, s.ccy)}</td>
                <td className="n strong">{eur(s.aum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HoldingsSection({ f }: { f: FundDetail }) {
  const c = f.composition;
  const nav = useNavigate();
  const [all, setAll] = useState(false);
  if (!c) return (
    <section className="section" id="portefeuille"><SectionHead id="portefeuille" eyebrow="Portefeuille" title="Composition" /><div className="empty">Aucun inventaire disponible pour ce fonds.</div></section>
  );
  const lines = all ? c.lines : c.lines.slice(0, 10);
  return (
    <section className="section reveal" id="portefeuille" aria-labelledby="h-portefeuille">
      <SectionHead id="portefeuille" eyebrow={`Inventaire au ${fdate(c.date)}`} title="Ce que détient le fonds" />
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="stat card card--flat"><div className="eyebrow">Lignes</div><div className="stat__v num">{num(c.n_lines)}</div></div>
        <div className="stat card card--flat"><div className="eyebrow">Poids des 10 premières</div><div className="stat__v num">{pctRaw(c.top10_weight, 1)}</div></div>
        <div className="stat card card--flat"><div className="eyebrow">Liquidités</div><div className="stat__v num">{pctRaw(c.cash_weight, 1)}</div></div>
        <div className="stat card card--flat"><div className="eyebrow">Exposition dérivés</div><div className="stat__v num">{c.derivatives_expo ? pctRaw(c.derivatives_expo, 1) : "Aucune"}</div></div>
      </div>
      <div className="grid grid-2">
        <div className="card card--flat">
          <div className="spread" style={{ marginBottom: 14 }}><h3 className="h3">{all ? "Toutes les lignes" : "10 premières lignes"}</h3>
            <button type="button" className="link small" onClick={() => setAll((a) => !a)}>{all ? "Voir les 10 premières" : `Voir les ${c.n_lines} lignes`}</button></div>
          <BarList items={lines} value={(l) => l.weight} label={(l) => l.name} sub={(l) => [l.asset_class, l.ccy, l.debt].filter(Boolean).join(" · ")}
            format={(v) => pctRaw(v, 2)} color={() => "var(--fc)"} onSelect={(l) => nav(`/portefeuilles/ligne?key=${encodeURIComponent(l.key)}`)} />
          <p className="small muted" style={{ marginTop: 10 }}>Cliquer une ligne pour voir tous les fonds de la maison qui la détiennent.</p>
        </div>
        <div className="stack" style={{ ["--s" as string]: "24px" }}>
          <div className="card card--flat"><h3 className="h3" style={{ marginBottom: 14 }}>Par classe d'actifs</h3>
            <BarList items={c.by_class} value={(x) => x.weight} label={(x) => x.label} format={(v) => pctRaw(v, 1)} color={() => "var(--ink-2)"} /></div>
          <div className="card card--flat"><h3 className="h3" style={{ marginBottom: 14 }}>Par devise</h3>
            <BarList items={c.by_ccy.slice(0, 8)} value={(x) => x.weight} label={(x) => x.label} format={(v) => pctRaw(v, 1)} color={() => "var(--ink-2)"} /></div>
          {c.by_debt.length > 0 && <div className="card card--flat"><h3 className="h3" style={{ marginBottom: 14 }}>Par type de dette</h3>
            <BarList items={c.by_debt} value={(x) => x.weight} label={(x) => x.label} format={(v) => pctRaw(v, 1)} color={() => "var(--ink-2)"} /></div>}
        </div>
      </div>
      {c.moves.length > 0 && (
        <div className="card card--flat" style={{ marginTop: 24 }}>
          <h3 className="h3" style={{ marginBottom: 14 }}>Mouvements depuis l'inventaire du {fdate(c.previous_date)}</h3>
          <div className="moves">
            {c.moves.slice(0, 12).map((m) => (
              <Link key={m.key + m.kind} to={`/portefeuilles/ligne?key=${encodeURIComponent(m.key)}`} className={`move move--${m.kind === "entrée" || m.kind === "renforcement" ? "up" : "down"}`}>
                <span className="move__k">{m.kind}</span><span className="move__n">{m.name}</span><span className="move__v num">{m.change > 0 ? "+" : "−"}{pctRaw(Math.abs(m.change), 2)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function EsgSection({ f }: { f: FundDetail }) {
  const e = f.esg;
  const main = e.fields.filter((x) => x.kind !== "pct_int");
  const pcts = e.fields.filter((x) => x.kind === "pct_int");
  const excl = e.exclusions.filter((x) => x.value != null);
  const pai = e.pai.filter((x) => x.value != null);
  return (
    <section className="section reveal" id="esg" aria-labelledby="h-esg">
      <SectionHead id="esg" eyebrow="Investissement responsable" title="ESG et SFDR" />
      <div className="grid grid-3">
        <div className="card card--flat esg__main">
          {main.map((x) => (
            <div key={x.label} className="kv"><span className="kv__k">{x.label}</span><span className="kv__v">{x.kind === "bool" ? <Bool v={x.value as boolean} /> : String(x.value)}</span></div>
          ))}
        </div>
        <div className="card card--flat">
          <h3 className="h3" style={{ marginBottom: 14 }}>Engagements minimum</h3>
          {pcts.length ? pcts.map((x) => (
            <div key={x.label} className="meter">
              <div className="spread small"><span>{x.label}</span><b className="num">{pctRaw(Number(x.value), 0)}</b></div>
              <div className="meter__t" aria-hidden="true"><span style={{ width: `${Math.min(100, Number(x.value))}%` }} /></div>
            </div>
          )) : <p className="small muted">Aucun engagement chiffré déclaré.</p>}
        </div>
        <div className="card card--flat">
          <h3 className="h3" style={{ marginBottom: 14 }}>Exclusions déclarées</h3>
          {excl.length ? <ul className="flags">{excl.map((x) => <li key={x.label} className={x.value ? "is-yes" : "is-no"}>{x.value ? <I.Check size={15} /> : <I.Minus size={15} />}{x.label}<span className="sr-only">{x.value ? " : exclu" : " : non exclu"}</span></li>)}</ul> : <p className="small muted">Non renseigné.</p>}
        </div>
      </div>
      {pai.length > 0 && (
        <div className="card card--flat" style={{ marginTop: 24 }}>
          <h3 className="h3" style={{ marginBottom: 6 }}>Principales incidences négatives prises en compte</h3>
          <p className="small muted" style={{ marginBottom: 14 }}>Le référentiel indique la prise en compte de chaque indicateur, pas sa valeur mesurée.</p>
          <ul className="flags flags--cols">{pai.map((x) => <li key={x.label} className={x.value ? "is-yes" : "is-no"}>{x.value ? <I.Check size={15} /> : <I.Minus size={15} />}{x.label}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

function DistribSection({ f }: { f: FundDetail }) {
  const countries = f.distribution.countries;
  const all = [...new Set(f.distribution.matrix.flatMap((m) => m.countries))].sort();
  return (
    <section className="section reveal" id="distribution" aria-labelledby="h-distribution">
      <SectionHead id="distribution" eyebrow="Distribution" title={`Commercialisé dans ${countries.length} pays`} />
      <div className="grid grid-2">
        <div className="card card--flat">
          <CountryTiles values={Object.fromEntries(countries.map((c) => [c.iso, c.n]))} labels={Object.fromEntries(countries.map((c) => [c.iso, c.country_fr]))}
            linkFor={(iso) => { const c = countries.find((x) => x.iso === iso); return c ? `/distribution/${encodeURIComponent(c.country_fr)}` : null; }}
            unit="part" color="var(--fc)" />
        </div>
        <div className="table-wrap">
          <table className="t t--matrix">
            <caption className="sr-only">Pays d'enregistrement par part</caption>
            <thead><tr><th>Part</th>{all.map((c) => <th key={c} className="t__rot"><span>{c}</span></th>)}</tr></thead>
            <tbody>{f.distribution.matrix.map((m) => (
              <tr key={m.share_id}><td className="strong small">{m.share}</td>{all.map((c) => (
                <td key={c} className="t__cell">{m.countries.includes(c) ? <span className="t__on" aria-label="enregistrée" /> : <span className="sr-only">non</span>}</td>
              ))}</tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function CharSection({ sections, validations }: { sections: Sec[]; validations?: { label: string; value: boolean | null }[] }) {
  if (!sections.length) return null;
  return (
    <section className="section reveal" id="caracteristiques" aria-labelledby="h-caracteristiques">
      <SectionHead id="caracteristiques" eyebrow="Référentiel" title="Caractéristiques" />
      <div className="chars">
        {sections.map((s) => (
          <div key={s.key} className="chars__sec">
            <h3 className="h3">{s.title}</h3>
            <dl>
              {s.items.map((it) => (
                <div key={it.label} className={`kv${it.kind === "long" ? " kv--long" : ""}`}>
                  <dt className="kv__k">{it.label}</dt>
                  <dd className="kv__v">{renderValue(it.kind, it.value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        {validations && validations.some((v) => v.value != null) && (
          <div className="chars__sec">
            <h3 className="h3">Circuit de validation</h3>
            <ul className="flags">{validations.filter((v) => v.value != null).map((v) => <li key={v.label} className={v.value ? "is-yes" : "is-warn"}>{v.value ? <I.Check size={15} /> : <I.Alert size={15} />}{v.label}{!v.value && <b className="small"> — à valider</b>}</li>)}</ul>
          </div>
        )}
      </div>
    </section>
  );
}

export function renderValue(kind: string, v: string | number | boolean) {
  switch (kind) {
    case "bool": return <Bool v={v as boolean} />;
    case "date": return <span className="num">{fdate(String(v))}</span>;
    case "pct": return <span className="num">{pctRaw(Number(v))}</span>;
    case "pct_int": return <span className="num">{pctRaw(Number(v), 0)}</span>;
    case "money": return <span className="num">{eur(Number(v))}</span>;
    case "num": return <span className="num">{num(Number(v), Number(v) % 1 ? 2 : 0)}</span>;
    case "int": return <span className="num">{num(Number(v))}</span>;
    case "stars": return <Stars n={Number(v)} />;
    case "code": return <CopyCode code={String(v)} />;
    default: return String(v);
  }
}

function ControlsSection({ f }: { f: FundDetail }) {
  return (
    <section className="section reveal" id="controles" aria-labelledby="h-controles">
      <SectionHead id="controles" eyebrow="Contrôles" title={f.controls.length ? "Points d'attention" : "Aucun point d'attention"} right={<Link to="/risques?onglet=controles" className="arrow-link">Tous les contrôles <I.Arrow size={16} /></Link>} />
      {f.controls.length ? (
        <div className="stack" style={{ ["--s" as string]: "12px" }}>
          {f.controls.map((c) => (
            <div key={c.title} className={`alert alert--${c.severity}`}>
              {c.severity === "serious" ? <I.Octagon size={20} /> : c.severity === "warning" ? <I.Alert size={20} /> : <I.Info size={20} />}
              <div><div className="strong">{c.title}</div>{c.details.map((d) => <div key={d} className="small">{d}</div>)}</div>
            </div>
          ))}
        </div>
      ) : <div className="empty small">Tous les contrôles automatiques sont au vert pour ce fonds au {longDate(f.date)}.</div>}
    </section>
  );
}
