import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, nav as fnav, pct, PERIOD_LABEL, PERIOD_SHORT } from "../lib/format";
import { FAMILY_LABEL, famVar } from "../lib/families";
import type { ShareDetail } from "../lib/types";
import { BigMoney, Bool, CopyCode, Crumbs, Delta, ErrorState, FamilyTag, Loading, useReveal } from "../components/ui";
import { RangeTabs, TimeChart, fmtIndex, sliceRange } from "../components/charts";
import { CharSection } from "./Fund";
import { Bridge } from "../components/viz";
import { FicheSearch } from "../components/FicheSearch";
import { shareEntries2 } from "../lib/fiche";
import { eur, pctRaw } from "../lib/format";
import * as I from "../components/Icon";
import { recordVisit } from "../lib/desk";
import { PinButton } from "../components/ui";

export default function Share() {
  const { id = "" } = useParams();
  const askQ = useSearchParams()[0].get("q");
  const { api } = useApp();
  const { data: s, error } = useApi<ShareDetail>(api(`/api/shares/${encodeURIComponent(id)}`));
  const [range, setRange] = useState("3y");
  useReveal(s);
  useEffect(() => {
    if (!s) return;
    document.title = `${s.name} — Rothschild & Co`;
    recordVisit({ kind: "part", id: s.id, label: s.name, sub: [s.isin, s.fund?.name].filter(Boolean).join(" · "), family: s.fund?.family });
  }, [s]);
  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (!s) return <div className="page"><Loading h={520} /></div>;
  const fam = s.fund?.family ?? "nc";
  const p = s.performance;
  const perfSeries = p ? (() => {
    const fund = sliceRange(p.index, range);
    const b0 = fund[0]?.v || 1;
    const out = [{ key: "f", label: "Part", color: "var(--fc)", points: fund.map((x) => ({ d: x.d, v: (x.v / b0) * 100 })) }];
    const bench = p.bench_index.filter((x) => x.d >= (fund[0]?.d ?? ""));
    if (bench.length) { const bb = bench[0].v || 1; out.push({ key: "b", label: "Indice", color: "var(--ink-3)", points: bench.map((x) => ({ d: x.d, v: (x.v / bb) * 100 })), dashed: true } as never); }
    return out;
  })() : [];
  const active = s.registrations.filter((r) => r.active);
  return (
    <div className="fund" style={{ ["--fc" as string]: famVar(fam) }}>
      <header className="fund__hero fund__hero--share" id="synthese">
        <div className="fund__hero-in">
          <Crumbs items={[{ label: "Fonds", to: "/fonds" }, ...(s.fund ? [{ label: s.fund.name, to: `/fonds/${encodeURIComponent(s.fund.id)}` }] : []), { label: `Part ${s.class ?? ""}` }]} />
          <div className="fund__hero-grid">
            <div>
              <div className="row" style={{ gap: 8, marginBottom: 18 }}>
                <FamilyTag k={fam} />
                {s.main && <span className="tag">Part principale</span>}
                {s.hedged && <span className="tag">Couverte en {s.ccy}</span>}
                {s.status && <span className="tag">{s.status}</span>}
                <PinButton item={{ kind: "part", id: s.id, label: s.name, sub: [s.isin, s.fund?.name].filter(Boolean).join(" · "), family: s.fund?.family }} />
              </div>
              <h1 className="fund__name hero-title">{s.name}</h1>
              <div className="row" style={{ gap: 14, marginTop: 14 }}>
                <CopyCode code={s.isin} />
                {s.fund && <Link to={`/fonds/${encodeURIComponent(s.fund.id)}`} className="arrow-link">Fiche du fonds <I.Arrow size={16} /></Link>}
                <CopySheet s={s} />
              </div>
              <dl className="fund__facts">
                <div><dt>Devise</dt><dd>{s.ccy ?? "—"}</dd></div>
                <div><dt>Affectation</dt><dd>{s.distribution ?? "—"}</dd></div>
                <div><dt>Souscripteurs</dt><dd>{s.investor ?? "—"}</dd></div>
                <div><dt>Frais courants</dt><dd className="num">{s.ongoing != null ? `${String(s.ongoing).replace(".", ",")} %` : "—"}</dd></div>
                <div><dt>Heure limite</dt><dd className="num">{s.cutoff ?? "—"} · règlement {s.settlement ?? "—"}</dd></div>
                <div><dt>Commission de surperformance</dt><dd><Bool v={s.perf_fee} /></dd></div>
              </dl>
              <div className="fund__ask"><FicheSearch initial={askQ} entries={shareEntries2(s)} subject={s.name} suggestions={["cut-off", "frais", "Allemagne", "Allfunds", "dépositaire", "performance 1 an"]} /></div>
            </div>
            <div className="fund__aum">
              <div className="eyebrow">Encours de la part au {fdate(s.date)}</div>
              <div className="fund__aum-v"><BigMoney v={s.aum} unitClass="fund__aum-u" /></div>
              {s.var && <div className="fund__aum-vars">{(["1M", "YTD", "1A"] as const).map((k) => <div key={k}><span className="small muted">{PERIOD_SHORT[k]}</span><Delta v={s.var![k]?.pct} /></div>)}</div>}
              {s.nav != null && <div className="small">VL au {fdate(s.nav_date)} : <b className="num">{fnav(s.nav, s.ccy)}</b></div>}
            </div>
          </div>
        </div>
      </header>
      <div className="fund__body fund__body--single">
        <div className="fund__main">
          {p && (
            <section className="section reveal" id="perf" aria-labelledby="h-perf">
              <div className="section__head"><div><div className="eyebrow">Performance</div><h2 className="h2" id="h-perf">Performance de la part</h2></div>
                <RangeTabs value={range} onChange={setRange} options={[{ key: "1y", label: "1 an" }, { key: "3y", label: "3 ans" }, { key: "all", label: "Tout" }]} /></div>
              <div className="card card--flat">
                <div className="legend" style={{ marginBottom: 8 }}>{perfSeries.map((x) => <span key={x.key} className="legend__i"><span className="legend__line" style={{ background: x.color }} />{x.key === "b" ? p.bench_name : s.name}</span>)}</div>
                <TimeChart series={perfSeries} format={fmtIndex} baseline={100} ariaLabel={`Performance de ${s.name}, base 100`} />
              </div>
              <div className="table-wrap" style={{ marginTop: 24 }}>
                <table className="t">
                  <thead><tr><th>Période</th>{["1M", "3M", "YTD", "1A", "3A", "origine"].map((k) => <th key={k} className="n">{k === "origine" ? "Origine" : k === "3A" ? "3 ans ann." : PERIOD_SHORT[k]}</th>)}</tr></thead>
                  <tbody>
                    <tr><td className="strong">Part</td>{["1M", "3M", "YTD", "1A", "3A", "origine"].map((k) => <td key={k} className="n"><Delta v={p.fund[k]} /></td>)}</tr>
                    {p.bench && <tr><td>Indice</td>{["1M", "3M", "YTD", "1A", "3A", "origine"].map((k) => <td key={k} className="n">{pct(p.bench![k])}</td>)}</tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {s.var && (
            <section className="section reveal" id="enc" aria-labelledby="h-enc">
              <div className="section__head"><div><div className="eyebrow">Encours</div><h2 className="h2" id="h-enc">Encours de la part</h2></div></div>
              <div className="grid grid-2">
                <div className="card card--flat"><TimeChart series={[{ key: "a", label: "Encours", color: "var(--fc)", points: sliceRange(s.aum_series, "3y"), fill: true }]} ariaLabel={`Encours de ${s.name}`} height={260} /></div>
                <div className="card card--flat">
                  <h3 className="h3" style={{ marginBottom: 4 }}>{PERIOD_LABEL.YTD}</h3>
                  <Bridge v={s.var.YTD} end={s.date} height={240} label="Encours de la part" />
                </div>
              </div>
            </section>
          )}
          <section className="section reveal" id="reg" aria-labelledby="h-reg">
            <div className="section__head"><div><div className="eyebrow">Distribution</div><h2 className="h2" id="h-reg">Enregistrée dans {active.length} pays</h2></div></div>
            <div className="grid grid-2">
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>Pays</th><th>Statut</th><th>Depuis le</th><th>Remarque</th></tr></thead>
                  <tbody>{s.registrations.map((r) => (
                    <tr key={r.country} className="clickable">
                      <td className="strong"><Link className="rowlink" to={`/distribution/${encodeURIComponent(r.country)}`}>{r.country}</Link>{r.finma ? <span className="tag tag--s" style={{ marginLeft: 8 }}>FINMA</span> : null}</td>
                      <td>{r.active ? <span className="bool bool--yes"><I.Check size={14} /> Enregistrée</span> : <span className="bool bool--no"><I.Minus size={14} /> Inactive</span>}</td>
                      <td className="num">{fdate(r.date)}</td><td className="small muted">{r.comment ?? ""}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="card card--flat">
                <h3 className="h3" style={{ marginBottom: 14 }}>Plateformes</h3>
                <ul className="flags">{s.platforms.filter((x) => x.value != null).map((x) => <li key={x.label} className={x.value ? "is-yes" : "is-no"}>{x.value ? <I.Check size={15} /> : <I.Minus size={15} />}{x.label}</li>)}</ul>
              </div>
            </div>
          </section>
          <CharSection sections={s.sections} />
          {s.fund && <p className="small muted" style={{ marginTop: 40 }}>Famille : {FAMILY_LABEL[fam]}.</p>}
        </div>
      </div>
    </div>
  );
}

/** Copie un résumé prêt à coller dans un e-mail (nom, ISIN, frais, minimum, cut-off, pays). */
function CopySheet({ s }: { s: ShareDetail }) {
  const [done, setDone] = useState(false);
  const text = [
    `${s.name} — ${s.isin ?? ""}`,
    s.fund ? `Fonds : ${s.fund.name}` : "",
    `Devise : ${s.ccy ?? "—"}${s.hedged ? " (couverte)" : ""} · ${s.distribution ?? ""}`,
    `Souscripteurs : ${s.investor ?? "—"}`,
    `Frais courants : ${s.ongoing != null ? pctRaw(s.ongoing) : "—"} · Minimum : ${s.min_sub ? eur(s.min_sub) : "1 part"}`,
    `Cut-off : ${s.cutoff ?? "—"} · Règlement : ${s.settlement ?? "—"}`,
    s.nav != null ? `VL au ${fdate(s.nav_date)} : ${fnav(s.nav, s.ccy)}` : "",
    `Pays d'enregistrement : ${s.registrations.filter((r) => r.active).map((r) => r.country).join(", ") || "—"}`,
  ].filter(Boolean).join("\n").replace(/\u202f/g, " ");
  return (
    <button type="button" className="btn btn--ghost" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1600); })}>
      {done ? <I.Check size={16} /> : <I.Copy size={16} />} {done ? "Fiche copiée" : "Copier la fiche"}
      <span className="sr-only" aria-live="polite">{done ? "Fiche copiée dans le presse-papiers" : ""}</span>
    </button>
  );
}
