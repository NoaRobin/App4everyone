/**
 * Rothschild City (Accueil), vue collecte : une tour par fonds ; au-dessus de la dalle, l'or de la collecte ; en dessous,
 * le grenat de la décollecte. Cinq périodes : 1 mois, depuis le 1er janvier, 1, 3 et 5 ans. Lecture sobre : la période,
 * le total, les cinq plus fortes collectes et décollectes (cliquables), la fiche du fonds choisi.
 * S'affiche dans la section de la City, à la place de la vue revenus (une seule scène 3D à la fois).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { FAMILY_LABEL, FAMILY_ORDER, famHex, famVar } from "../lib/families";
import { date as fdate, eur, pct } from "../lib/format";
import { onVisible } from "../lib/gsap";
import { useReducedMotion } from "../lib/motion";
import type { FamilyKey } from "../lib/types";
import type { FlowCityScene, FlowFund } from "../three/FlowCityScene";
import * as I from "./Icon";

export type CityPeriod = "1M" | "YTD" | "1A" | "3A" | "5A";
type FlowCityData = {
  date: string; first: string; excluded: number;
  periods: Record<CityPeriod, { available: boolean; start: string | null; net: number | null; inflows: number | null; outflows: number | null; n_up: number; n_down: number }>;
  funds: { id: string; name: string; family: FamilyKey; aum: number; manager: string | null; flows: Record<CityPeriod, number | null>; var: Record<CityPeriod, number | null> }[];
};

export const CITY_PERIODS: { key: CityPeriod; label: string; long: string }[] = [
  { key: "YTD", label: "YTD", long: "depuis le 1er janvier" }, { key: "1M", label: "1 mois", long: "sur un mois" },
  { key: "1A", label: "1 an", long: "sur un an" }, { key: "3A", label: "3 ans", long: "sur trois ans" }, { key: "5A", label: "5 ans", long: "sur cinq ans" }];
const signed = (v: number | null | undefined) => eur(v, { signed: true });

export function CityFlows({ period, onPeriod }: { period: CityPeriod; onPeriod: (p: CityPeriod) => void }) {
  const { api } = useApp();
  const { data } = useApi<FlowCityData>(api("/api/cite/collecte"));
  const [sel, setSel] = useState<string | null>(null);
  const [focus, setFocus] = useState<FamilyKey | null>(null);
  const [tip, setTip] = useState<{ f: FlowFund; x: number; y: number } | null>(null);
  const [under, setUnder] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<FlowCityScene | null>(null);
  const reduced = useReducedMotion();
  const p = period;

  useEffect(() => {
    const el = host.current, lab = labels.current;
    if (!el || !lab || !data) return;
    let alive = true, stop = () => undefined as void;
    import("../three/FlowCityScene").then(({ FlowCityScene }) => {
      if (!alive) return;
      const colors = Object.fromEntries([...FAMILY_ORDER, "nc"].map((k) => [k, famHex(k as FamilyKey, true)]));
      scene.current = new FlowCityScene(el, {
        funds: data.funds.map((f) => ({ id: f.id, name: f.name, family: f.family, aum: f.aum })), colors, reduced, labelLayer: lab,
        districtNames: Object.fromEntries([...FAMILY_ORDER, "nc"].map((k) => [k, `Quartier ${FAMILY_LABEL[k as FamilyKey] ?? "non classé"}`])),
        formatEur: (v, s) => eur(v, { signed: s }), offsetX: -0.06,
        onHover: (f, x, y) => setTip(f ? { f, x, y } : null),
        onSelect: (f) => setSel(f.id),
      });
      scene.current.setValues(new Map(data.funds.map((f) => [f.id, f.flows[p]])));
      stop = onVisible(el, () => scene.current?.play(), "0px 0px -20% 0px");
    });
    return () => { alive = false; stop(); scene.current?.dispose(); scene.current = null; };
  }, [data, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (data) scene.current?.setValues(new Map(data.funds.map((f) => [f.id, f.flows[p]]))); }, [p, data]);
  useEffect(() => { scene.current?.setFocus(focus); }, [focus]);
  useEffect(() => { scene.current?.select(sel); if (!sel) scene.current?.resetView(); }, [sel]);

  const byId = useMemo(() => new Map((data?.funds ?? []).map((f) => [f.id, f])), [data]);
  const ranked = useMemo(() => (data?.funds ?? []).filter((f) => f.flows[p] != null && (!focus || f.family === focus))
    .sort((a, b) => (b.flows[p] ?? 0) - (a.flows[p] ?? 0)), [data, p, focus]);
  if (!data) return <div className="c3f__loading" aria-busy="true" />;
  const per = data.periods[p];
  const top = ranked.filter((f) => (f.flows[p] ?? 0) > 0).slice(0, 5);
  const bottom = ranked.filter((f) => (f.flows[p] ?? 0) < 0).slice(-5).reverse();
  const fams = FAMILY_ORDER.filter((k) => data.funds.some((f) => f.family === k));
  const s = sel ? byId.get(sel) : null;
  const long = CITY_PERIODS.find((x) => x.key === p)!.long;
  const row = (f: FlowCityData["funds"][number]) => (
    <li key={f.id}>
      <button type="button" onClick={() => setSel(f.id)} aria-pressed={sel === f.id}>
        <span className="dot" style={{ background: famVar(f.family, true) }} /><span className="c3f__n">{f.name}</span>
        <b className={`num ${(f.flows[p] ?? 0) >= 0 ? "c3f__in" : "c3f__out"}`}>{signed(f.flows[p])}</b>
      </button>
    </li>
  );
  return (
    <>
      <div className="c3__scene" ref={host} aria-hidden="true" />
      <div className="c3__labels" ref={labels} aria-hidden="true" />
      <aside className="c3f__panel" aria-label="Collecte de la période">
        <div className="c3f__tabs" role="radiogroup" aria-label="Période">
          {CITY_PERIODS.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={p === x.key} disabled={!data.periods[x.key].available}
              title={data.periods[x.key].available ? undefined : `Historique JUMP disponible depuis le ${fdate(data.first)}`} onClick={() => onPeriod(x.key)}>{x.label}</button>
          ))}
        </div>
        <span className="c3__k">Collecte nette estimée · {long}</span>
        <b className={`c3f__total num ${(per.net ?? 0) >= 0 ? "c3f__in" : "c3f__out"}`}>{per.available ? signed(per.net) : "—"}</b>
        {per.available && <span className="c3__k2">{eur(per.inflows)} collectés par {per.n_up} fonds · {eur(per.outflows)} perdus par {per.n_down} fonds{per.start ? ` · depuis le ${fdate(per.start)}` : ""}</span>}
        <div className="c3f__lists">
          <div><span className="c3__k">Plus fortes collectes</span><ol>{top.length ? top.map(row) : <li className="c3__k2">Aucune.</li>}</ol></div>
          <div><span className="c3__k">Plus fortes décollectes</span><ol>{bottom.length ? bottom.map(row) : <li className="c3__k2">Aucune.</li>}</ol></div>
        </div>
      </aside>
      <div className="c3__bar">
        <ul className="c3__fams" aria-label="Quartiers (isoler)">
          {fams.map((k) => <li key={k}><button type="button" aria-pressed={focus === k} onClick={() => setFocus(focus === k ? null : k)}><span className="dot" style={{ background: famVar(k, true) }} />{FAMILY_LABEL[k]}</button></li>)}
        </ul>
        <span className="c3f__legend" aria-hidden="true"><span><i className="is-in" />Collecte, au-dessus de la dalle</span><span><i className="is-out" />Décollecte, en dessous</span></span>
        <div className="c3__btns">
          <button type="button" onClick={() => { setUnder(!under); scene.current?.tilt(!under); }} aria-pressed={under}>{under ? "Revenir au-dessus" : "Voir sous la dalle"}</button>
          <button type="button" onClick={() => { setSel(null); setFocus(null); setUnder(false); scene.current?.resetView(); }}>Recentrer</button>
        </div>
      </div>
      {tip && !s && (
        <div className="c3__tip" style={{ left: tip.x, top: tip.y }} role="status">
          <b>{tip.f.name}</b><span className="num">{signed(byId.get(tip.f.id)?.flows[p])} · encours {eur(tip.f.aum)}</span>
        </div>
      )}
      {s && (
        <aside className="c3__card" aria-live="polite">
          <button type="button" className="c3__x" onClick={() => setSel(null)} aria-label="Fermer la fiche"><I.Close size={14} /></button>
          <div className="c3__k"><span className="dot" style={{ background: famVar(s.family, true) }} />{FAMILY_LABEL[s.family] ?? "Non classé"}</div>
          <h3>{s.name}</h3>
          <dl>
            {CITY_PERIODS.map((x) => (
              <div key={x.key}><dt>{x.label}{x.key === p ? " ·" : ""}</dt>
                <dd className={`num ${s.flows[x.key] == null ? "" : (s.flows[x.key] ?? 0) >= 0 ? "c3f__in" : "c3f__out"}`}>{s.flows[x.key] == null ? "—" : signed(s.flows[x.key])}</dd></div>
            ))}
            <div><dt>Encours</dt><dd className="num">{eur(s.aum)}</dd></div>
            <div><dt>Variation · {CITY_PERIODS.find((x) => x.key === p)!.label}</dt><dd className="num">{pct(s.var[p])}</dd></div>
          </dl>
          {s.manager && <p className="c3__k2 c3f__mgr">Gérant : {s.manager}</p>}
          <Link className="btn btn--gold c3__open" to={`/fonds/${encodeURIComponent(s.id)}`}>Ouvrir la fiche <I.Arrow size={15} /></Link>
        </aside>
      )}
    </>
  );
}
