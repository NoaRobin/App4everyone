/**
 * Démo — la cité de la collecte. Une tour par fonds : au-dessus de la dalle, ce qu'il a collecté ; en dessous, ce qu'il a
 * perdu. Cinq périodes (1 mois, depuis le 1er janvier, 1, 3 et 5 ans). Lecture sobre : un titre, un total, la légende,
 * les cinq plus fortes collectes et décollectes, cliquables. Sans WebGL : les mêmes classements, sans la scène.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../lib/api";
import { useApp } from "../../lib/context";
import { FAMILY_LABEL, FAMILY_ORDER, famHex, famVar } from "../../lib/families";
import { date as fdate, eur, pct } from "../../lib/format";
import { onVisible } from "../../lib/gsap";
import { useReducedMotion, webglAvailable } from "../../lib/motion";
import type { FamilyKey } from "../../lib/types";
import type { FlowCityScene, FlowFund } from "../../three/FlowCityScene";
import * as I from "../Icon";
import { Loading } from "../ui";
import { PeriodTabs, signed } from "./kit";
import type { CityPeriod, FlowCityData } from "./types";

const PERIODS: { key: CityPeriod; label: string; long: string }[] = [
  { key: "1M", label: "1 mois", long: "sur un mois" }, { key: "YTD", label: "YTD", long: "depuis le 1er janvier" },
  { key: "1A", label: "1 an", long: "sur un an" }, { key: "3A", label: "3 ans", long: "sur trois ans" }, { key: "5A", label: "5 ans", long: "sur cinq ans" }];

export function FlowCity({ index }: { index: number }) {
  const { api } = useApp();
  const { data, loading } = useApi<FlowCityData>(api("/api/demo/collecte"));
  return (
    <section className="dm-chap dm-chap--city" id="cite" aria-labelledby="h-cite">
      <header className="dm-chap__head">
        <span className="dm-chap__num" aria-hidden="true">{String(index).padStart(2, "0")}</span>
        <div className="dm-chap__title">
          <div className="eyebrow dm-eyebrow">Rothschild City · la collecte</div>
          <h2 className="dm-chap__name" id="h-cite">Qui collecte, qui décollecte</h2>
          <p className="dm-chap__lede">Une tour par fonds. Au-dessus de la dalle, l'or de la collecte&nbsp;; en dessous, le grenat de la décollecte. La hauteur mesure la collecte nette estimée de la période, l'emprise l'encours.</p>
        </div>
      </header>
      {loading && !data ? <Loading h={560} /> : data ? <CityBody d={data} /> : <div className="empty">Données indisponibles.</div>}
    </section>
  );
}

function CityBody({ d }: { d: FlowCityData }) {
  const [p, setP] = useState<CityPeriod>("YTD");
  const [sel, setSel] = useState<string | null>(null);
  const [focus, setFocus] = useState<FamilyKey | null>(null);
  const [tip, setTip] = useState<{ f: FlowFund; x: number; y: number } | null>(null);
  const [under, setUnder] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<FlowCityScene | null>(null);
  const reduced = useReducedMotion();
  const [gl] = useState(() => webglAvailable());
  const per = d.periods[p];
  const byId = useMemo(() => new Map(d.funds.map((f) => [f.id, f])), [d.funds]);
  const ranked = useMemo(() => d.funds.filter((f) => f.flows[p] != null && (!focus || f.family === focus)).sort((a, b) => (b.flows[p] ?? 0) - (a.flows[p] ?? 0)), [d.funds, p, focus]);
  const top = ranked.filter((f) => (f.flows[p] ?? 0) > 0).slice(0, 5);
  const bottom = ranked.filter((f) => (f.flows[p] ?? 0) < 0).slice(-5).reverse();
  const fams = FAMILY_ORDER.filter((k) => d.funds.some((f) => f.family === k));

  useEffect(() => {
    const el = host.current, lab = labels.current;
    if (!gl || !el || !lab) return;
    let alive = true, stop = () => undefined as void;
    import("../../three/FlowCityScene").then(({ FlowCityScene }) => {
      if (!alive) return;
      const colors = Object.fromEntries([...FAMILY_ORDER, "nc"].map((k) => [k, famHex(k as FamilyKey, true)]));
      scene.current = new FlowCityScene(el, {
        funds: d.funds.map((f) => ({ id: f.id, name: f.name, family: f.family, aum: f.aum })), colors, reduced, labelLayer: lab,
        districtNames: Object.fromEntries([...FAMILY_ORDER, "nc"].map((k) => [k, FAMILY_LABEL[k as FamilyKey] ?? "Non classés"])),
        formatEur: (v, s) => eur(v, { signed: s }),
        onHover: (f, x, y) => setTip(f ? { f, x, y } : null),
        onSelect: (f) => setSel(f.id),
      });
      scene.current.setValues(new Map(d.funds.map((f) => [f.id, f.flows[p]])));
      stop = onVisible(el, () => scene.current?.play(), "0px 0px -20% 0px");
    });
    return () => { alive = false; stop(); scene.current?.dispose(); scene.current = null; };
  }, [d, gl, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.setValues(new Map(d.funds.map((f) => [f.id, f.flows[p]]))); }, [p, d.funds]);
  useEffect(() => { scene.current?.setFocus(focus); }, [focus]);
  useEffect(() => { scene.current?.select(sel); if (!sel) scene.current?.resetView(); }, [sel]);

  const s = sel ? byId.get(sel) : null;
  const row = (f: FlowCityData["funds"][number]) => (
    <li key={f.id}>
      <button type="button" onClick={() => setSel(f.id)} aria-pressed={sel === f.id}>
        <span className="dot" style={{ background: famVar(f.family, true) }} /><span className="fc__n">{f.name}</span>
        <b className={`num ${(f.flows[p] ?? 0) >= 0 ? "up-t" : "down-t"}`}>{signed(f.flows[p])}</b>
      </button>
    </li>
  );
  return (
    <div className="fc">
      <div className="fc__stage">
        {gl ? <><div className="fc__scene" ref={host} aria-hidden="true" /><div className="fc__labels" ref={labels} aria-hidden="true" /></> : <div className="fc__fallback" />}
        <div className="fc__hud">
          <PeriodTabs value={p} onChange={(k) => { setP(k); }} options={PERIODS.map((x) => ({ key: x.key, label: x.label, disabled: !d.periods[x.key].available,
            title: d.periods[x.key].available ? undefined : `Historique JUMP disponible depuis le ${fdate(d.first)}` }))} />
          <div className="fc__total">
            <span className="eyebrow">Collecte nette estimée · {PERIODS.find((x) => x.key === p)!.long}</span>
            <b className={`num ${(per.net ?? 0) >= 0 ? "up-t" : "down-t"}`}>{per.available ? signed(per.net) : "—"}</b>
            {per.available && <span className="small">{eur(per.inflows)} collectés par {per.n_up} fonds · {eur(per.outflows)} perdus par {per.n_down} fonds{per.start ? ` · depuis le ${fdate(per.start)}` : ""}</span>}
          </div>
        </div>
        <div className="fc__legend" aria-hidden="true">
          <span><i className="is-in" />Collecte (au-dessus de la dalle)</span><span><i className="is-out" />Décollecte (en dessous)</span><span>Hauteur : montant · emprise : encours</span>
        </div>
        {gl && (
          <div className="fc__ctl">
            <button type="button" onClick={() => { setUnder(!under); scene.current?.tilt(!under); }} aria-pressed={under}>{under ? "Revenir au-dessus" : "Voir sous la dalle"}</button>
            <button type="button" onClick={() => { setSel(null); setFocus(null); scene.current?.resetView(); setUnder(false); }}>Recentrer</button>
          </div>
        )}
        {tip && !s && (
          <div className="city__tip fc__tip" style={{ transform: `translate(-50%, -100%) translate(${tip.x}px, ${tip.y - 16}px)` }} role="status">
            <div className="city__tip-f">{FAMILY_LABEL[(byId.get(tip.f.id)?.family ?? "nc") as FamilyKey] ?? ""}</div>
            <div className="city__tip-n">{tip.f.name}</div>
            <div className="city__tip-v num">{signed(byId.get(tip.f.id)?.flows[p])} · encours {eur(tip.f.aum)}</div>
          </div>
        )}
        {s && (
          <aside className="fc__card" aria-live="polite">
            <button type="button" className="fc__x" onClick={() => setSel(null)} aria-label="Fermer"><I.Close size={14} /></button>
            <div className="eyebrow"><span className="dot" style={{ background: famVar(s.family, true) }} />{FAMILY_LABEL[s.family] ?? "Non classé"}</div>
            <h3>{s.name}</h3>
            {s.manager && <p className="small muted">Gérant : {s.manager}</p>}
            <dl>
              {PERIODS.map((x) => (
                <div key={x.key} className={x.key === p ? "is-on" : ""}><dt>{x.label}</dt>
                  <dd className={`num ${s.flows[x.key] == null ? "muted" : (s.flows[x.key] ?? 0) >= 0 ? "up-t" : "down-t"}`}>{s.flows[x.key] == null ? "—" : signed(s.flows[x.key])}</dd></div>
              ))}
              <div><dt>Encours</dt><dd className="num">{eur(s.aum)}</dd></div>
              <div><dt>Variation {PERIODS.find((x) => x.key === p)!.label}</dt><dd className="num">{pct(s.var[p])}</dd></div>
            </dl>
            <Link className="btn btn--gold" to={`/fonds/${encodeURIComponent(s.id)}`}>Ouvrir la fiche <I.Arrow size={15} /></Link>
          </aside>
        )}
      </div>
      <div className="fc__below">
        <ul className="fc__fams" aria-label="Isoler une famille">
          {fams.map((k) => <li key={k}><button type="button" aria-pressed={focus === k} onClick={() => setFocus(focus === k ? null : k)}><span className="dot" style={{ background: famVar(k, true) }} />{FAMILY_LABEL[k]}</button></li>)}
        </ul>
        <div className="fc__lists">
          <div><div className="eyebrow">Plus fortes collectes</div><ol className="fc__rank">{top.length ? top.map(row) : <li className="muted small">Aucune.</li>}</ol></div>
          <div><div className="eyebrow">Plus fortes décollectes</div><ol className="fc__rank">{bottom.length ? bottom.map(row) : <li className="muted small">Aucune.</li>}</ol></div>
        </div>
        {d.excluded > 0 && <p className="small muted">{d.excluded} fonds à collecte JUMP neutralisée (opérations sur titres) ne sont pas représentés.</p>}
      </div>
    </div>
  );
}
