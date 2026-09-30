import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { eur, monthYear, pct, PERIOD_LABEL, plural } from "../lib/format";
import { FAMILY_LABEL, FAMILY_ORDER, FAMILY_SHORT, famHex, famVar } from "../lib/families";
import { useReducedMotion, webglAvailable } from "../lib/motion";
import type { CityData, FamilyKey, FundRow, Overview } from "../lib/types";
import { BigMoney, Decomposition, Delta, useReveal } from "../components/ui";
import { BarList, Sparkline, StackedArea } from "../components/charts";
import * as I from "../components/Icon";
import type { CityScene as CitySceneT } from "../three/CityScene";

export default function Home() {
  const { api } = useApp();
  const ov = useApi<Overview>(api("/api/overview"));
  const city = useApi<CityData>(api("/api/city"));
  useReveal(ov.data);
  return (
    <>
      <CityHero data={city.data} ov={ov.data} />
      <div className="home">
        {ov.data && <Synthesis ov={ov.data} />}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ la ville
function CityHero({ data, ov }: { data: CityData | null; ov: Overview | null }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<CitySceneT | null>(null);
  const reduced = useReducedMotion();
  const nav = useNavigate();
  const [tip, setTip] = useState<{ f: CityData["funds"][number]; x: number; y: number } | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState<FamilyKey | null>(null);
  const [listView, setListView] = useState(false);
  const [gl] = useState(() => webglAvailable());
  const last = data ? data.months.length - 1 : 0;
  const mi = month ?? last;

  useEffect(() => {
    if (!data || !host.current || !labels.current || !gl || listView) return;
    let alive = true;
    import("../three/CityScene").then(({ CityScene }) => {
      if (!alive || !host.current || !labels.current) return;
      const colors = Object.fromEntries((["aid", "ae", "fi", "ao", "nc"] as FamilyKey[]).map((k) => [k, { day: famHex(k), night: famHex(k, true) }]));
      const byId = new Map(data.funds.map((f) => [f.id, f]));
      scene.current = new CityScene(host.current, {
        funds: data.funds, monthIndex: data.months.length - 1, reduced, colors,
        familyLabels: FAMILY_SHORT, labelLayer: labels.current, formatAum: eur,
        onHover: (f, x, y) => setTip(f ? { f: byId.get(f.id)!, x, y } : null),
        onSelect: (f) => { scene.current?.flyTo(f.id).then(() => nav(`/fonds/${encodeURIComponent(f.id)}`)); },
      });
    });
    return () => { alive = false; scene.current?.dispose(); scene.current = null; };
  }, [data, reduced, gl, listView, nav]);

  useEffect(() => { scene.current?.setMonth(mi); }, [mi]);
  useEffect(() => { scene.current?.setFocus(focus); }, [focus]);
  useEffect(() => {
    if (!playing || !data) return;
    let i = month == null || month >= last ? 0 : month;
    setMonth(i);
    const t = setInterval(() => {
      i += 1;
      if (i > last) { setPlaying(false); setMonth(null); clearInterval(t); return; }
      setMonth(i);
    }, reduced ? 400 : 190);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const totalAt = useMemo(() => (data ? data.funds.reduce((s, f) => s + (f.series[mi] ?? 0), 0) : null), [data, mi]);
  const famTotals = useMemo(() => {
    const t: Record<string, number> = {};
    data?.funds.forEach((f) => { t[f.family] = (t[f.family] ?? 0) + (f.series[mi] ?? 0); });
    return t;
  }, [data, mi]);
  const isNow = month == null || month === last;

  return (
    <section className="city" aria-label="La ville des encours : chaque immeuble est un fonds">
      <div className="city__view">
        <div className="city__stage" ref={host} />
        <div className="city__labels" ref={labels} aria-hidden="true" />
        <div className="city__vignette" aria-hidden="true" />
      </div>
      {(!gl || listView) && data && <CityList data={data} mi={mi} />}

      <div className="city__hero">
        <div className="eyebrow city__eyebrow">{isNow ? "Encours sous gestion" : `Encours à fin ${data ? monthYear(data.months[mi], true) : ""}`}</div>
        <h1 className="city__total">{totalAt != null ? <BigMoney v={isNow ? ov?.aum ?? totalAt : totalAt} unitClass="city__unit" /> : <span className="skeleton" style={{ display: "inline-block", width: 320, height: 90 }} />}</h1>
        {ov && isNow && (
          <div className="city__vars">
            {(["1M", "YTD", "1A"] as const).map((p) => (
              <div key={p} className="city__var">
                <span className="city__var-l">{PERIOD_LABEL[p]}</span>
                <Delta v={ov.var[p]?.pct} />
                <span className="city__var-s">{eur(ov.var[p]?.delta, { signed: true })}</span>
              </div>
            ))}
          </div>
        )}
        {ov && <p className="city__lede">{isNow ? <>{plural(ov.n_funds, "fonds", "fonds")} · {plural(ov.n_parts, "part")} investies.</> : <>{plural(data?.funds.filter((f) => (f.series[mi] ?? 0) > 0).length ?? 0, "fonds", "fonds")} à cette date.</>} Chaque immeuble est un fonds&nbsp;: son volume est proportionnel à son encours.</p>}
        <div className="city__legend" role="group" aria-label="Familles de gestion — survoler ou choisir pour mettre en valeur un quartier">
          {FAMILY_ORDER.filter((k) => famTotals[k]).map((k) => (
            <button key={k} type="button" className="city__fam" aria-pressed={focus === k}
              onMouseEnter={() => setFocus(k)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(k)} onBlur={() => setFocus(null)}
              onClick={() => nav(`/selection?family=${k}`)}>
              <span className="city__fam-bar" style={{ background: famVar(k, true) }} />
              <span className="city__fam-l">{FAMILY_LABEL[k]}</span>
              <span className="city__fam-v num">{eur(famTotals[k])}</span>
              <span className="city__fam-p num">{totalAt ? pct(famTotals[k] / totalAt, { signed: false, digits: 0 }) : ""}</span>
            </button>
          ))}
        </div>

      </div>

      {data && (
        <div className="city__time">
          <button type="button" className="city__play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Mettre en pause" : "Rejouer l'évolution des encours"}>
            {playing ? <I.Pause size={16} /> : <I.Play size={16} />}
          </button>
          <div className="city__range">
            <input type="range" min={0} max={last} value={mi} onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setMonth(v === last ? null : v); }}
              aria-label="Date de la ville" aria-valuetext={monthYear(data.months[mi], true)} style={{ ["--p" as string]: `${(mi / Math.max(last, 1)) * 100}%` }} />
            <div className="city__range-l small"><span>{monthYear(data.months[0])}</span><b>{isNow ? "Aujourd'hui" : monthYear(data.months[mi], true)}</b><span>{monthYear(data.months[last])}</span></div>
          </div>
          {gl && (
            <button type="button" className="city__toggle" onClick={() => setListView((v) => !v)} aria-pressed={listView}>
              {listView ? <><I.Cube size={16} /> Vue 3D</> : <><I.List size={16} /> Vue liste</>}
            </button>
          )}
        </div>
      )}

      {tip && (
        <div className="city__tip" style={{ transform: tip.y < 260 ? `translate(-50%, 0) translate(${tip.x}px, ${tip.y + 40}px)` : `translate(-50%, -100%) translate(${tip.x}px, ${tip.y - 14}px)` }} role="status">
          <div className="city__tip-f"><span className="dot" style={{ background: famVar(tip.f.family, true) }} />{FAMILY_LABEL[tip.f.family]}</div>
          <div className="city__tip-n">{tip.f.name}</div>
          <div className="city__tip-v num">{eur(tip.f.series[mi])}</div>
          {isNow && <div className="city__tip-s small">1 mois <Delta v={tip.f.var_1M} /> · YTD <Delta v={tip.f.var_YTD} /></div>}
          <div className="city__tip-go small">Cliquer pour ouvrir la fiche</div>
        </div>
      )}
    </section>
  );
}

function CityList({ data, mi }: { data: CityData; mi: number }) {
  const rows = [...data.funds].sort((a, b) => (b.series[mi] ?? 0) - (a.series[mi] ?? 0));
  const max = rows[0]?.series[mi] ?? 1;
  return (
    <div className="city__list">
      <table className="t t--night">
        <caption className="sr-only">Encours par fonds</caption>
        <thead><tr><th>Fonds</th><th>Famille</th><th className="n">Encours</th></tr></thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id} className="clickable">
              <td><Link className="rowlink" to={`/fonds/${encodeURIComponent(f.id)}`}>{f.name}</Link>
                <span className="city__list-bar" style={{ width: `${((f.series[mi] ?? 0) / max) * 100}%`, background: famVar(f.family, true) }} /></td>
              <td className="small">{FAMILY_LABEL[f.family]}</td>
              <td className="n">{eur(f.series[mi])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ synthèse
function Synthesis({ ov }: { ov: Overview }) {
  const nav = useNavigate();
  const [period, setPeriod] = useState<"1M" | "YTD" | "1A">("YTD");
  const fams = FAMILY_ORDER.map((k) => ov.families.find((f) => f.key === k)).filter(Boolean) as Overview["families"];
  const layers = fams.map((f) => ({ key: f.key, label: FAMILY_LABEL[f.key], color: famVar(f.key), points: f.series }));
  const v = ov.var[period];
  return (
    <div className="page page--home" id="synthese">
      <section className="section reveal" aria-labelledby="h-var">
        <div className="section__head">
          <div>
            <div className="eyebrow">Ce qui a bougé</div>
            <h2 className="h2" id="h-var">D'où vient la variation des encours&nbsp;?</h2>
          </div>
          <div className="seg" role="radiogroup" aria-label="Période">
            {(["1M", "YTD", "1A"] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={period === p} className="seg__b" onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-3 home__var">
          <div className="home__var-main">
            <div className="eyebrow">Variation des encours</div>
            <div className="home__big num">{eur(v?.delta, { signed: true })}</div>
            <div><Delta v={v?.pct} /> <span className="muted small">depuis le {v?.start ? v.start.split("-").reverse().join("/") : "—"}</span></div>
          </div>
          <div className="home__var-decomp" style={{ gridColumn: "span 2" }}>
            <Decomposition v={v} />
            <p className="small muted" style={{ marginTop: 14 }}>
              La <b>collecte nette estimée</b> correspond aux souscriptions moins les rachats, déduits de la variation du nombre de parts valorisée à la VL.
              L'<b>effet marché</b> est le reste de la variation : l'évolution des VL et des changes.
            </p>
          </div>
        </div>
      </section>

      <section className="section reveal" aria-labelledby="h-fam">
        <div className="section__head">
          <div>
            <div className="eyebrow">Les quatre familles de gestion</div>
            <h2 className="h2" id="h-fam">Encours par famille</h2>
          </div>
          <Link to="/encours" className="arrow-link">Explorer toutes les répartitions <I.Arrow size={16} /></Link>
        </div>
        <div className="grid grid-4">
          {fams.map((f) => (
            <Link key={f.key} to={`/selection?family=${f.key}`} className="card card--link famcard" style={{ ["--fc" as string]: famVar(f.key) }}>
              <div className="famcard__top"><span className="famcard__bar" /><span className="small muted">{plural(f.n_funds, "fonds", "fonds")}</span></div>
              <div className="h3 famcard__t">{FAMILY_LABEL[f.key]}</div>
              <div className="famcard__v num">{eur(f.aum)}</div>
              <div className="famcard__row small"><span>{pct(f.aum / ov.aum, { signed: false, digits: 0 })} des encours</span><span>YTD <Delta v={f.var.YTD?.pct} /></span></div>
              <Sparkline points={f.series.slice(-24)} color={famVar(f.key)} width={240} height={44} />
              <div className="famcard__row small"><span className="muted">Collecte YTD</span><Delta v={f.var.YTD?.flows} kind="eur" /></div>
            </Link>
          ))}
        </div>
        <div className="card card--flat" style={{ marginTop: 24 }}>
          <div className="spread" style={{ marginBottom: 12 }}>
            <h3 className="h3">Évolution mensuelle des encours par famille</h3>
            <div className="legend">{layers.map((l) => <span key={l.key} className="legend__i"><span className="dot" style={{ background: l.color }} />{l.label}</span>)}</div>
          </div>
          <StackedArea layers={layers} ariaLabel="Évolution mensuelle des encours par famille de gestion" />
        </div>
      </section>

      <section className="section reveal" aria-labelledby="h-mov">
        <div className="section__head">
          <div>
            <div className="eyebrow">Les mouvements</div>
            <h2 className="h2" id="h-mov">Qui monte, qui baisse</h2>
          </div>
        </div>
        <div className="grid grid-2">
          <MoverList title="Plus fortes hausses d'encours · 1 mois" rows={ov.top_up} field="delta_1M" onSelect={(r) => nav(`/fonds/${encodeURIComponent(r.id)}`)} />
          <MoverList title="Plus fortes baisses d'encours · 1 mois" rows={ov.top_down} field="delta_1M" onSelect={(r) => nav(`/fonds/${encodeURIComponent(r.id)}`)} />
          <MoverList title="Plus fortes collectes · depuis le 1er janvier" rows={ov.top_inflows} field="flows_YTD" onSelect={(r) => nav(`/fonds/${encodeURIComponent(r.id)}`)} />
          <MoverList title="Plus fortes décollectes · depuis le 1er janvier" rows={ov.top_outflows} field="flows_YTD" onSelect={(r) => nav(`/fonds/${encodeURIComponent(r.id)}`)} />
        </div>
      </section>

      <section className="section reveal" aria-labelledby="h-go">
        <div className="section__head">
          <div>
            <div className="eyebrow">Accès directs</div>
            <h2 className="h2" id="h-go">Les questions de tous les jours</h2>
          </div>
        </div>
        <div className="grid grid-3 quick">
          {[
            { to: "/fonds", q: "Trouver un fonds, une part, un ISIN", s: "Recherche tolérante aux fautes, au clavier" },
            { to: "/distribution", q: "Où un fonds est-il commercialisé ?", s: "Pays d'enregistrement et plateformes" },
            { to: "/portefeuilles", q: "Quels fonds détiennent cette ligne ?", s: "Inventaires et positions transverses" },
            { to: "/encours?axe=manager", q: "Quels sont les encours de chaque gérant ?", s: "Répartitions par gérant, gamme, SFDR…" },
            { to: "/risques", q: "Quels fonds ont changé de SRI ?", s: "Risques, concentrations, contrôles" },
            { to: "/risques?onglet=controles", q: "Qu'est-ce qui n'est pas en ordre ?", s: "Validations, mandats, enregistrements, qualité des données" },
          ].map((x) => (
            <Link key={x.to} to={x.to} className="card card--link quick__c">
              <div className="h3">{x.q}</div>
              <div className="small muted">{x.s}</div>
              <I.Arrow size={18} className="quick__a" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function MoverList({ title, rows, field, onSelect }: { title: string; rows: FundRow[]; field: "delta_1M" | "flows_YTD"; onSelect: (r: FundRow) => void }) {
  return (
    <div className="card card--flat">
      <h3 className="h3" style={{ marginBottom: 14 }}>{title}</h3>
      <BarList items={rows} value={(r) => Number(r[field] ?? 0)} label={(r) => r.name} color={(r) => famVar(r.family)}
        sub={(r) => FAMILY_LABEL[r.family]} right={(r) => <Delta v={r[field] as number} kind="eur" />} onSelect={onSelect} />
    </div>
  );
}
