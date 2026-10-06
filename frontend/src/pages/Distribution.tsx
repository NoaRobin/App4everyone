import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, num, plural } from "../lib/format";
import { FAMILY_LABEL, famVar } from "../lib/families";
import { useRmm } from "../lib/rmm";
import type { FamilyKey } from "../lib/types";
import { ErrorState, Loading, useReveal } from "../components/ui";
import { BarList } from "../components/charts";
import { Board } from "../components/Story";
import { Head, PageHero } from "../components/Editorial";
import * as I from "../components/Icon";
import { Sankey2D, type SkData, type SkNode } from "../components/Sankey2D";
import { GlobeSection, Timeline, type ClientMap, type TimelineData } from "../components/DistViz";
import { CoverageSection, DistNav, coverage } from "../components/DistAtlas";
import "../styles/distribution.css";
import type { MapRoute } from "../three/MapScene";

type Resp = {
  date: string; n_shares_registered: number; n_funds_registered: number; exclude_rmm: boolean;
  countries: { country: string; iso: string; n_shares: number; n_funds: number; aum_registered: number }[];
  platforms: { label: string; n_shares: number; aum: number }[];
  sankey: SkData & { unit: string };
  routes: MapRoute[];
  clients: ClientMap;
  timeline: TimelineData;
  rmm: { n_funds: number; funds: string[]; rule: { columns: string[]; pattern: string } };
};

export default function Distribution() {
  const { api } = useApp();
  const [exclude, setExclude, withRmm] = useRmm();
  const { data, error } = useApi<Resp>(api(withRmm("/api/distribution")));
  const [last, setLast] = useState<Resp | null>(null);
  useEffect(() => { if (data) setLast(data); }, [data]);
  const d = data ?? last;
  useReveal(d ? 1 : null);
  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (!d) return <div className="page"><Loading h={520} /></div>;
  return <DistributionView d={d} exclude={exclude} setExclude={setExclude} withRmm={withRmm} />;
}

const NAV = [
  { id: "couverture", label: "Couverture" }, { id: "globe", label: "Le monde" },
  { id: "parcours", label: "Parcours" }, { id: "pays", label: "Pays par pays" }, { id: "chronologie", label: "Depuis quand" }, { id: "annexes", label: "Plateformes & comptes" },
];

function DistributionView({ d, exclude, setExclude, withRmm }: { d: Resp; exclude: boolean; setExclude: (v: boolean) => void; withRmm: (u: string) => string }) {
  const [client, setClient] = useState<string | null>(null);
  const clients = d.clients ?? [];
  const cov = coverage(clients);
  const n = d.countries.reduce((s, x) => s + x.n_shares, 0);
  return (
    <div className="dist">
      <PageHero
        eyebrow={<>Distribution · au {fdate(d.date)}</>}
        title="Qui peut souscrire, et où ?"
        lede={<>L'atlas de nos autorisations de commercialisation&nbsp;: {plural(cov.named || clients.length, cov.named ? "client nommé" : "clientèle")} et {plural(d.countries.length, "pays")}, croisés ligne à ligne. Une clientèle est le client d'une part dédiée, à défaut son pool de clientèle&nbsp;; un couple client-pays existe dès qu'une de ses parts est autorisée dans le pays.</>}
        aside={<RmmSwitch exclude={exclude} onChange={setExclude} rmm={d.rmm} />}
        figures={[
          { label: cov.named ? "Clients nommés" : "Clientèles", value: num(cov.named || clients.length), sub: cov.pools ? `+ ${plural(cov.pools, "pool")} de clientèle` : undefined },
          { label: "Couples client-pays", value: num(cov.pairs) },
          { label: "Pays par client", value: num(cov.mean, 1), sub: "en moyenne" },
          { label: "Pays", value: String(d.countries.length) },
          { label: "Fonds · parts enregistrés", value: `${d.n_funds_registered} · ${d.n_shares_registered}`, sub: `${num(n)} enregistrements actifs` },
        ]}
      />
      <DistNav items={NAV} />
      <CoverageSection clients={clients} countries={d.countries} withRmm={withRmm} />
      <GlobeSection countries={d.countries} routes={d.routes} clients={clients} withRmm={withRmm} client={client} onClient={setClient} />
      <FlowSection d={d} withRmm={withRmm} />
      <div className="page dist__page">
        <section id="pays" className="section reveal" aria-labelledby="h-pays">
          <Head id="pays" eyebrow="Pays par pays" title="Le tableau des départs"
            lede="Chaque pays de commercialisation, comme un vol au départ : nombre de fonds et de parts autorisés. Cliquez sur une destination pour sa fiche pays." />
          <Board rows={[...d.countries].sort((a, b) => b.n_shares - a.n_shares)} subtitle={`${d.countries.length} pays de commercialisation`} />
        </section>
      </div>
      <div id="chronologie"><Timeline t={d.timeline} /></div>
      <div id="annexes" className="page dist__page">
        <div className="dist__annex">
          <section className="section reveal" aria-labelledby="h-plat">
            <Head id="plat" eyebrow="Plateformes" title="Référencement sur les plateformes" lede="Nombre de parts référencées et encours correspondant." />
            <BarList items={d.platforms} value={(p) => p.n_shares} label={(p) => p.label} right={(p) => <span>{p.n_shares} parts <span className="muted">· {eur(p.aum)}</span></span>} color={() => "var(--gold)"} />
          </section>
          <RmmNote rmm={d.rmm} exclude={exclude} />
        </div>
        <TeneursSection />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ interrupteur RMM
function RmmSwitch({ exclude, onChange, rmm }: { exclude: boolean; onChange: (v: boolean) => void; rmm: Resp["rmm"] }) {
  return (
    <div className="rmm">
      <button type="button" role="switch" aria-checked={!exclude} className={`rmm__sw${exclude ? "" : " is-on"}`} onClick={() => onChange(!exclude)}
        aria-describedby="rmm-desc">
        <span className="rmm__track" aria-hidden="true"><span className="rmm__knob" /></span>
        <span className="rmm__t">
          <span className="rmm__l">Fonds Rothschild Martin Maurel</span>
          <span className="rmm__s">{exclude ? "Exclus de toute la rubrique" : "Inclus"} · {plural(rmm.n_funds, "fonds", "fonds")}</span>
        </span>
      </button>
      <p id="rmm-desc" className="sr-only">Inclure ou exclure les fonds RMM de tous les chiffres, du diagramme et des pays de la rubrique Distribution.</p>
    </div>
  );
}

function RmmNote({ rmm, exclude }: { rmm: Resp["rmm"]; exclude: boolean }) {
  return (
    <aside className="dist__note reveal" aria-label="Comment les fonds RMM sont repérés">
      <div className="eyebrow">Fonds Rothschild Martin Maurel {exclude ? "· exclus" : "· inclus"}</div>
      <p className="small">
        Le référentiel ne comporte pas de colonne dédiée : un fonds est considéré comme RMM lorsque « RMM » ou « Martin Maurel » figure
        dans l'une de ces colonnes du référentiel produits&nbsp;: {rmm.rule.columns.map((c, i) => <span key={c}><code>{c}</code>{i < rmm.rule.columns.length - 1 ? ", " : ""}</span>)}.
        Règle réglable par les variables <code>APP_RMM_COLUMNS</code> et <code>APP_RMM_PATTERN</code>.
      </p>
      {rmm.funds.length > 0 && <p className="small muted">{plural(rmm.n_funds, "fonds repéré", "fonds repérés")}&nbsp;: {rmm.funds.join(", ")}.</p>}
    </aside>
  );
}

// ------------------------------------------------------------------ Sankey
function FlowSection({ d, withRmm }: { d: Resp; withRmm: (u: string) => string }) {
  const nav = useNavigate();
  const [table, setTable] = useState(false);
  const open = (n: SkNode) => {
    if (n.col === 2 && n.family) nav(`/selection?family=${n.family}`);
    else if (n.col === 1) nav(n.other ? "#pays" : withRmm(`/distribution/${encodeURIComponent(n.label)}`));
  };
  return (
    <section id="parcours" className="flow reveal" aria-labelledby="h-flow">
      <div className="flow__head page">
        <Head id="flow" eyebrow="Le parcours d'une autorisation" title="Des plus gros clients aux pays, puis aux familles"
          lede={<>Les {d.sankey.nodes.filter((x) => x.col === 0).length} plus grosses clientèles, par encours décroissant. Épaisseur d'un flux&nbsp;: nombre d'enregistrements actifs (une part autorisée dans un pays)&nbsp;; couleur&nbsp;: or pour un client nommé, pierre pour un pool, puis la famille de gestion.</>}
          right={<button type="button" className="btn btn--ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? <><I.Arrow size={16} /> Diagramme</> : <><I.List size={16} /> Vue tableau</>}</button>} />
      </div>
      <div className="page">{table ? <FlowTable d={d} withRmm={withRmm} /> : <Sankey2D data={d.sankey} onOpen={open} />}</div>
    </section>
  );
}

function FlowTable({ d, withRmm }: { d: Resp; withRmm: (u: string) => string }) {
  const { nodes, links } = d.sankey;
  const rows = useMemo(() => links.filter((l) => nodes[l.source].col === 0)
    .sort((a, b) => a.source - b.source || b.value - a.value), [nodes, links]);
  return (
    <div className="table-wrap">
      <table className="t">
        <caption className="sr-only">Enregistrements actifs par clientèle, pays et famille de gestion</caption>
        <thead><tr><th scope="col">Clientèle</th><th scope="col" className="n">Encours</th><th scope="col">Pays</th><th scope="col">Famille</th><th scope="col" className="n">Enregistrements</th><th scope="col" className="n">Fonds</th><th scope="col" className="n">Parts</th></tr></thead>
        <tbody>
          {rows.map((l, i) => (
            <tr key={i}>
              <td>{nodes[l.source].label}</td>
              <td className="n">{eur(nodes[l.source].aum)}</td>
              <td>{nodes[l.target].other ? nodes[l.target].label : <Link className="link" to={withRmm(`/distribution/${encodeURIComponent(nodes[l.target].label)}`)}>{nodes[l.target].label}</Link>}</td>
              <td>{l.family === "all" ? <span className="muted">Toutes familles</span> : <><span className="dot" style={{ background: famVar(l.family, true) }} /> {FAMILY_LABEL[l.family as FamilyKey]}</>}</td>
              <td className="n">{num(l.value)}</td><td className="n">{l.n_funds}</td><td className="n">{l.n_shares}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Teneurs = { available: boolean; source?: string; comptes?: { available: boolean; teneurs: { teneur: string; tranche: { label: string; rank: number } | null;
  clients: { label: string } | null; classifications: { classification: string; label: string; tranche: { label: string; rank: number } | null; active: boolean }[] }[] } };

/** Le passif vu de la distribution : qui tient les comptes (teneurs) et quels types de comptes, en tranches. */
function TeneursSection() {
  const { api } = useApp();
  const { data } = useApi<Teneurs>(api("/api/passif"));
  const t = data?.comptes?.available ? data.comptes.teneurs : [];
  if (!t.length) return null;
  return (
    <section className="section reveal" aria-labelledby="h-ten">
      <Head id="ten" eyebrow="Au passif" title="Qui tient les comptes"
        lede={<>Teneurs de compte et types de comptes porteurs de nos fonds, en tranches (jamais de nombre exact ni de montant). {data?.source === "synthétique" ? "Données synthétiques. " : ""}<Link className="link" to="/passif">Tout le passif</Link></>} />
      <div className="ten">
        {t.map((x) => (
          <div key={x.teneur} className="ten__c">
            <div className="ten__h"><b>{x.teneur}</b><span className="num">{x.tranche?.label ?? "—"} comptes</span></div>
            {x.clients && <div className="small muted">{x.clients.label} clients</div>}
            <ul>{x.classifications.map((c) => (
              <li key={c.classification} className={c.active ? "" : "is-off"}><span>{c.label}</span><span className="ten__r" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < (c.tranche?.rank ?? 0) ? "on" : ""} />)}</span><span className="num small">{c.tranche?.label}</span></li>
            ))}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}
