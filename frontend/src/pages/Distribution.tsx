import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, num, plural } from "../lib/format";
import { FAMILY_LABEL, FAMILY_ORDER, famHex, famVar } from "../lib/families";
import { useReducedMotion, webglAvailable } from "../lib/motion";
import { useRmm } from "../lib/rmm";
import type { FamilyKey } from "../lib/types";
import { ErrorState, Loading, useReveal } from "../components/ui";
import { BarList } from "../components/charts";
import { CountryTiles } from "../components/CountryTiles";
import { Head, PageHero } from "../components/Editorial";
import * as I from "../components/Icon";
import { GlobeSection, Timeline, type ClientMap, type TimelineData } from "../components/DistViz";
import type { MapRoute } from "../three/MapScene";
import type { SankeyScene as SankeySceneT, SkData, SkHover, SkNode } from "../three/SankeyScene";

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
  const n = d.sankey.nodes.reduce((s, x) => s + (x.col === 0 ? x.value : 0), 0);
  return (
    <div className="dist">
      <PageHero
        eyebrow={<>Distribution · au {fdate(d.date)}</>}
        title="Où nos fonds sont‑ils commercialisés ?"
        lede={<>Chaque part peut être enregistrée dans plusieurs pays. Suivez le parcours d'une autorisation&nbsp;: d'abord les clients à qui la part s'adresse, puis les pays où elle est autorisée, enfin la famille de gestion du fonds.</>}
        aside={<RmmSwitch exclude={exclude} onChange={setExclude} rmm={d.rmm} />}
        figures={[
          { label: "Pays", value: String(d.countries.length) },
          { label: "Fonds enregistrés", value: String(d.n_funds_registered) },
          { label: "Parts enregistrées", value: String(d.n_shares_registered) },
          { label: "Enregistrements actifs", value: num(n), sub: "une part autorisée dans un pays" },
        ]}
      />
      <FlowSection d={d} withRmm={withRmm} />
      <GlobeSection countries={d.countries} routes={d.routes} clients={d.clients ?? []} withRmm={withRmm} />
      <Timeline t={d.timeline} />
      <div className="page dist__page">
        <section className="section reveal" aria-labelledby="h-pays">
          <Head id="pays" eyebrow="Pays par pays" title="La carte des autorisations"
            lede="Intensité et classement : nombre de fonds enregistrés dans le pays. Encours des parts autorisées (une même part pouvant l'être dans plusieurs pays, ces montants ne s'additionnent pas)." />
          <div className="dist__map">
            <CountryTiles values={Object.fromEntries(d.countries.map((c) => [c.iso, c.n_funds]))} labels={Object.fromEntries(d.countries.map((c) => [c.iso, c.country]))}
              linkFor={(iso) => { const c = d.countries.find((x) => x.iso === iso); return c ? withRmm(`/distribution/${encodeURIComponent(c.country)}`) : null; }} unit="fonds" color="var(--gold-ink)" />
            <CountryRank rows={d.countries} withRmm={withRmm} />
          </div>
        </section>
        <section className="section reveal" aria-labelledby="h-plat">
          <Head id="plat" eyebrow="Plateformes" title="Référencement sur les plateformes" lede="Nombre de parts référencées et encours correspondant." />
          <BarList items={d.platforms} value={(p) => p.n_shares} label={(p) => p.label} right={(p) => <span>{p.n_shares} parts <span className="muted">· {eur(p.aum)}</span></span>} color={() => "var(--gold)"} />
        </section>
        <RmmNote rmm={d.rmm} exclude={exclude} />
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
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<SankeySceneT | null>(null);
  const reduced = useReducedMotion();
  const nav = useNavigate();
  const [gl] = useState(() => webglAvailable());
  const [table, setTable] = useState(!gl);
  const [tip, setTip] = useState<{ h: SkHover; x: number; y: number } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const navRef = useRef(nav);
  navRef.current = nav;
  const hrefFor = (n: SkNode) => n.family ? `/selection?family=${n.family}` : n.col === 0 ? `/encours?axe=investor`
    : n.other ? withRmm("/distribution") + "#h-pays" : withRmm(`/distribution/${encodeURIComponent(n.id.slice(2))}`);
  const hrefRef = useRef(hrefFor);
  hrefRef.current = hrefFor;

  useEffect(() => {
    if (!gl || table || !host.current || !labels.current) return;
    let alive = true;
    import("../three/SankeyScene").then(({ SankeyScene }) => {
      if (!alive || !host.current || !labels.current) return;
      const colors = Object.fromEntries((["aid", "ae", "fi", "ao", "nc"] as FamilyKey[]).map((k) => [k, famHex(k, true)]));
      scene.current = new SankeyScene(host.current, d.sankey, {
        reduced, colors, familyOrder: [...FAMILY_ORDER, "nc"], labelLayer: labels.current,
        onHover: (h, x, y) => setTip(h ? { h, x, y } : null),
        onSelect: (n) => navRef.current(hrefRef.current(n)),
        formatLabel: (n) => ({ title: n.family ? shortFam(n) : n.label, sub: `${num(n.value)} · ${plural(n.n_funds, "fonds", "fonds")}` }),
      });
    });
    return () => { alive = false; scene.current?.dispose(); scene.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, table, reduced]);
  useEffect(() => { scene.current?.setData(d.sankey); }, [d.sankey]);
  useEffect(() => { scene.current?.focus(focus); }, [focus]);

  const clients = d.sankey.nodes.filter((n) => n.col === 0).sort((a, b) => b.value - a.value);
  const fams = d.sankey.nodes.filter((n) => n.family).sort((a, b) => FAMILY_ORDER.indexOf(a.family as FamilyKey) - FAMILY_ORDER.indexOf(b.family as FamilyKey));
  return (
    <section className="flow reveal" aria-labelledby="h-flow">
      <div className="flow__head page">
        <Head id="flow" eyebrow="Le parcours d'une autorisation" title="Des clients aux pays, puis aux familles"
          lede={<>D'abord à qui s'adresse la part (sa clientèle), puis les pays où elle est autorisée, enfin la famille de gestion du fonds. Épaisseur d'un flux&nbsp;: nombre d'enregistrements actifs (une part autorisée dans un pays) ; couleur&nbsp;: la famille de gestion. Survolez pour isoler un parcours, cliquez un pays pour l'ouvrir.</>}
          right={gl ? <button type="button" className="btn btn--ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? <><I.Cube size={16} /> Vue 3D</> : <><I.List size={16} /> Vue tableau</>}</button> : undefined} />
        <div className="flow__legend" role="group" aria-label="Clientèles : survoler pour isoler leur parcours">
          {clients.map((n) => (
            <button key={n.id} type="button" className="flow__fam" aria-pressed={focus === n.id}
              onMouseEnter={() => setFocus(n.id)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(n.id)} onBlur={() => setFocus(null)}>
              <span className="flow__fam-bar" style={{ background: "var(--brand-stone)" }} />
              <span className="flow__fam-l">{n.label}</span>
              <span className="flow__fam-v num">{num(n.value)}</span>
            </button>
          ))}
        </div>
        <div className="flow__legend flow__legend--fam" role="group" aria-label="Familles de gestion : survoler pour isoler leur parcours">
          {fams.map((n) => (
            <button key={n.id} type="button" className="flow__fam" aria-pressed={focus === n.id}
              onMouseEnter={() => setFocus(n.id)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(n.id)} onBlur={() => setFocus(null)}
              onClick={() => nav(hrefFor(n))}>
              <span className="flow__fam-bar" style={{ background: famVar(n.family, true) }} />
              <span className="flow__fam-l">{FAMILY_LABEL[n.family as FamilyKey]}</span>
              <span className="flow__fam-v num">{num(n.value)}</span>
            </button>
          ))}
        </div>
      </div>
      {!table ? (
        <div className="flow__stage">
          <div className="flow__canvas" ref={host} />
          <div className="flow__labels" ref={labels} aria-hidden="true" />
          {tip && <FlowTip tip={tip} />}
          <FlowKeyboard d={d} onFocus={setFocus} href={hrefFor} />
        </div>
      ) : (
        <div className="page"><FlowTable d={d} withRmm={withRmm} /></div>
      )}
    </section>
  );
}

const shortFam = (n: SkNode) => (n.family === "aid" ? "Actions int. & diversifiée" : n.label);

function FlowTip({ tip }: { tip: { h: SkHover; x: number; y: number } }) {
  const h = tip.h;
  const style = { transform: `translate(-50%, -100%) translate(${tip.x}px, ${tip.y - 16}px)` };
  if (h.kind === "node") {
    const n = h.node;
    return (
      <div className="city__tip flow__tip" style={style} role="status">
        <div className="city__tip-f">{["Clientèle", "Pays d'enregistrement", "Famille de gestion"][n.col]}</div>
        <div className="city__tip-n">{n.label}</div>
        <div className="city__tip-v num">{plural(n.value, "enregistrement")}</div>
        <div className="city__tip-s small">{plural(n.n_funds, "fonds", "fonds")} · {plural(n.n_shares, "part")}</div>
        <div className="city__tip-go small">{n.other ? "Voir le classement complet" : "Cliquer pour ouvrir"}</div>
      </div>
    );
  }
  const l = h.link;
  return (
    <div className="city__tip flow__tip" style={style} role="status">
      <div className="city__tip-f"><span className="dot" style={{ background: famVar(l.family, true) }} />{FAMILY_LABEL[l.family as FamilyKey]}</div>
      <div className="city__tip-n">{h.from.label} <span className="muted">→</span> {h.to.label}</div>
      <div className="city__tip-v num">{plural(l.value, "enregistrement")}</div>
      <div className="city__tip-s small">{plural(l.n_funds, "fonds", "fonds")} · {plural(l.n_shares, "part")}</div>
    </div>
  );
}

/** Accès clavier au diagramme : chaque nœud est un bouton qui isole son parcours et ouvre sa destination. */
function FlowKeyboard({ d, onFocus, href }: { d: Resp; onFocus: (id: string | null) => void; href: (n: SkNode) => string }) {
  const nav = useNavigate();
  return (
    <ul className="sr-only" aria-label="Nœuds du diagramme">
      {d.sankey.nodes.map((n) => (
        <li key={n.id}>
          <button type="button" onFocus={() => onFocus(n.id)} onBlur={() => onFocus(null)} onClick={() => nav(href(n))}>
            {n.label} : {plural(n.value, "enregistrement")}, {plural(n.n_funds, "fonds", "fonds")}
          </button>
        </li>
      ))}
    </ul>
  );
}

function FlowTable({ d, withRmm }: { d: Resp; withRmm: (u: string) => string }) {
  const { nodes, links } = d.sankey;
  const rows = useMemo(() => links.filter((l) => nodes[l.source].col === 0)
    .sort((a, b) => nodes[b.source].value - nodes[a.source].value || b.value - a.value), [nodes, links]);
  return (
    <div className="table-wrap">
      <table className="t">
        <caption className="sr-only">Enregistrements actifs par clientèle, pays et famille de gestion</caption>
        <thead><tr><th scope="col">Clientèle</th><th scope="col">Pays</th><th scope="col">Famille</th><th scope="col" className="n">Enregistrements</th><th scope="col" className="n">Fonds</th><th scope="col" className="n">Parts</th></tr></thead>
        <tbody>
          {rows.map((l, i) => (
            <tr key={i}>
              <td>{nodes[l.source].label}</td>
              <td>{nodes[l.target].other ? nodes[l.target].label : <Link className="link" to={withRmm(`/distribution/${encodeURIComponent(nodes[l.target].label)}`)}>{nodes[l.target].label}</Link>}</td>
              <td><span className="dot" style={{ background: famVar(l.family, true) }} /> {FAMILY_LABEL[l.family as FamilyKey]}</td>
              <td className="n">{num(l.value)}</td><td className="n">{l.n_funds}</td><td className="n">{l.n_shares}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CountryRank({ rows, withRmm }: { rows: Resp["countries"]; withRmm: (u: string) => string }) {
  const sorted = [...rows].sort((a, b) => b.n_funds - a.n_funds || b.n_shares - a.n_shares);
  const max = sorted[0]?.n_funds || 1;
  return (
    <ol className="rank">
      {sorted.map((c, i) => (
        <li key={c.iso}>
          <Link to={withRmm(`/distribution/${encodeURIComponent(c.country)}`)} className="rank__a">
            <span className="rank__i num">{String(i + 1).padStart(2, "0")}</span>
            <span className="rank__n">{c.country}<span className="rank__iso">{c.iso}</span></span>
            <span className="rank__bar" aria-hidden="true"><span style={{ width: `${(c.n_funds / max) * 100}%` }} /></span>
            <span className="rank__v num">{c.n_funds}<span className="rank__u"> fonds</span></span>
            <span className="rank__s small num">{c.n_shares} parts · {eur(c.aum_registered)}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
