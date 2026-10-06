import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { eur, num, plural } from "../lib/format";
import { prefersReducedMotion, useReducedMotion, webglAvailable } from "../lib/motion";
import { ScrollTrigger } from "../lib/gsap";
import { Head } from "./Editorial";
import type { MapCountry, MapMetric, MapRoute, MapScene as MapSceneT, MapView } from "../three/MapScene";
import { ClientPicker, type Clientele } from "./DistAtlas";

/** Couleurs des arcs par pays de domiciliation (les deux domiciles de la maison, puis un neutre). */
const DOM_COLORS: Record<string, string> = { FR: "#f3e6cc", LU: "#cc9f53" };
const domColor = (iso: string) => DOM_COLORS[iso] ?? "#8d929c";

// ------------------------------------------------------------------ carte 3D
export function MapSection({ countries, routes, withRmm }: { countries: MapCountry[]; routes: MapRoute[]; withRmm: (u: string) => string }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<MapSceneT | null>(null);
  const reduced = useReducedMotion();
  const nav = useNavigate();
  const navRef = useRef({ nav, withRmm });
  navRef.current = { nav, withRmm };
  const [gl] = useState(() => webglAvailable());
  const [view, setView] = useState<MapView>("europe");
  const [metric, setMetric] = useState<MapMetric>("n_funds");
  const [tip, setTip] = useState<{ c: MapCountry; x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const data = useMemo(() => ({ countries, routes }), [countries, routes]);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!gl || !host.current || !labels.current) return;
    let alive = true;
    Promise.all([import("../three/MapScene"), import("world-atlas/countries-50m.json")]).then(([{ MapScene }, world]) => {
      if (!alive || !host.current || !labels.current) return;
      scene.current = new MapScene(host.current, ((world as unknown as { default?: never }).default ?? (world as never)), dataRef.current, {
        reduced, labelLayer: labels.current, domColors: DOM_COLORS,
        onHover: (c, x, y) => setTip(c ? { c, x, y } : null),
        onSelect: (c) => navRef.current.nav(navRef.current.withRmm(`/distribution/${encodeURIComponent(c.country)}`)),
      });
      setReady(true);
    });
    return () => { alive = false; scene.current?.dispose(); scene.current = null; setReady(false); };
  }, [gl, reduced]);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } scene.current?.setData(data); }, [data]);
  useEffect(() => { if (ready) scene.current?.setMetric(metric); }, [metric, ready]);
  useEffect(() => { if (ready) scene.current?.setView(view); }, [view, ready]);

  const doms = [...new Set(routes.filter((r) => r.domicile_iso !== r.iso).map((r) => `${r.domicile_iso}|${r.domicile}`))];
  const tipRoutes = tip ? routes.filter((r) => r.iso === tip.c.iso) : [];
  const max = Math.max(1, ...countries.map((c) => c[metric]));
  return (
    <section className="mapx reveal" aria-labelledby="h-carte">
      <div className="page mapx__head">
        <Head id="carte" eyebrow="La carte" title="Nos fonds, pays par pays"
          lede={<>Hauteur et intensité&nbsp;: {metric === "n_funds" ? "nombre de fonds enregistrés" : "nombre de parts enregistrées"} dans le pays. Les arcs partent du pays de domiciliation des fonds&nbsp;; leur épaisseur suit le nombre d'enregistrements. Cliquez un pays pour la liste des parts autorisées.</>}
          right={
            <div className="mapx__ctl">
              <div className="seg" role="radiogroup" aria-label="Cadrage de la carte">
                {(["europe", "monde"] as MapView[]).map((v) => <button key={v} type="button" role="radio" aria-checked={view === v} className="seg__b" onClick={() => setView(v)}>{v === "europe" ? "Europe" : "Monde"}</button>)}
              </div>
              <div className="seg" role="radiogroup" aria-label="Mesure">
                {(["n_funds", "n_shares"] as MapMetric[]).map((m) => <button key={m} type="button" role="radio" aria-checked={metric === m} className="seg__b" onClick={() => setMetric(m)}>{m === "n_funds" ? "Fonds" : "Parts"}</button>)}
              </div>
            </div>
          } />
      </div>
      {gl ? (
        <div className="mapx__stage">
          <div className="mapx__canvas" ref={host} />
          <div className="mapx__labels" ref={labels} aria-hidden="true" />
          <div className="mapx__legend" aria-hidden="true">
            <div className="mapx__scale"><span>1</span><i /><span>{max}</span></div>
            <div className="small">{metric === "n_funds" ? "fonds enregistrés" : "parts enregistrées"}</div>
            {doms.map((k) => { const [iso, name] = k.split("|"); return <div key={k} className="mapx__dom small"><i style={{ background: domColor(iso) }} /> Fonds domiciliés {name === "France" ? "en France" : `au ${name}`}</div>; })}
          </div>
          {tip && (
            <div className="city__tip mapx__tip" style={{ transform: `translate(-50%, -100%) translate(${tip.x}px, ${tip.y - 22}px)` }} role="status">
              <div className="city__tip-f">Pays d'enregistrement</div>
              <div className="city__tip-n">{tip.c.country}</div>
              <div className="city__tip-v num">{plural(tip.c.n_funds, "fonds", "fonds")} · {plural(tip.c.n_shares, "part")}</div>
              {tipRoutes.length > 0 && <div className="city__tip-s small">{tipRoutes.map((r) => `${r.value} depuis ${r.domicile === "France" ? "la France" : `le ${r.domicile}`}`).join(" · ")}</div>}
              <div className="city__tip-s small">Encours des parts autorisées : {eur(tip.c.aum_registered)}</div>
              <div className="city__tip-go small">Cliquer pour la liste des parts</div>
            </div>
          )}
        </div>
      ) : (
        <p className="page small muted">La carte 3D nécessite WebGL ; la carte en tuiles et le classement ci-dessous donnent les mêmes chiffres.</p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ frise d'ouverture
export type TimelineData = { years: { year: number; new: number; cumulative: number; n_funds: number; opened: string[] }[]; undated: number };

/**
 * « Depuis quand ? » : l'ouverture des pays année après année. Au défilement, la frise avance d'une année à l'autre
 * (section épinglée, grand écran). En mode « animations réduites », tout est affiché d'emblée et l'on choisit l'année au clic.
 */
export function Timeline({ t }: { t: TimelineData }) {
  const sec = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const n = t.years.length;
  const [i, setI] = useState(n - 1);
  const [scrub, setScrub] = useState(false);
  useEffect(() => {
    const el = sec.current;
    if (!el || n < 2 || prefersReducedMotion() || !matchMedia("(min-width: 900px)").matches) { setScrub(false); setI(n - 1); return; }
    setScrub(true);
    const st = ScrollTrigger.create({
      trigger: el, start: "top top+=68", end: "bottom bottom",
      onUpdate: (s) => setI(Math.min(n - 1, Math.floor(s.progress * n))),
    });
    return () => st.kill();
  }, [n, reduced]);
  const y = t.years[i];
  const opened = t.years.slice(0, i + 1).flatMap((x) => x.opened);
  const max = Math.max(1, ...t.years.map((x) => x.new));
  if (!n) return null;
  return (
    <section ref={sec} className={`tl reveal${scrub ? " is-scrub" : ""}`} aria-labelledby="h-tl" style={scrub ? { height: `${Math.max(180, n * 14)}vh` } : undefined}>
      <div className="tl__sticky page">
        <Head id="tl" eyebrow="Depuis quand ?" title="L'ouverture, année après année"
          lede={<>Enregistrements aujourd'hui actifs, selon leur année d'enregistrement{t.undated ? ` (${t.undated} sans date)` : ""}. {scrub ? "Faites défiler pour avancer dans le temps." : "Choisissez une année."}</>} />
        <div className="tl__grid">
          <div className="tl__read" aria-live="polite">
            <div className="tl__year num">{y.year}</div>
            <dl className="tl__kv">
              <div><dt>Pays ouverts</dt><dd className="num">{opened.length}</dd></div>
              <div><dt>Enregistrements</dt><dd className="num">{num(y.cumulative)}</dd></div>
              <div><dt>Nouveaux cette année</dt><dd className="num">{y.new}</dd></div>
            </dl>
            <div className="tl__opened">
              {y.opened.length ? <><span className="small muted">Ouverture{y.opened.length > 1 ? "s" : ""} en {y.year}&nbsp;:</span> {y.opened.map((c) => <span key={c} className="tl__chip">{c}</span>)}</>
                : <span className="small muted">Aucun nouveau pays en {y.year}.</span>}
            </div>
          </div>
          <div className="tl__chart" role="img" aria-label={`Nouveaux enregistrements par année, de ${t.years[0].year} à ${t.years[n - 1].year}`}>
            <div className="tl__bars">
              {t.years.map((x, k) => (
                <button key={x.year} type="button" className={`tl__b${k <= i ? " is-on" : ""}${k === i ? " is-cur" : ""}`} disabled={scrub}
                  onClick={() => setI(k)} aria-label={`${x.year} : ${x.new} enregistrements, ${x.opened.length} pays ouverts`} tabIndex={scrub ? -1 : 0}>
                  {x.opened.length > 0 && <span className="tl__flag">{x.opened.length > 1 ? `${x.opened[0]} +${x.opened.length - 1}` : x.opened[0]}</span>}
                  <span className="tl__bar" style={{ height: `${(x.new / max) * 100}%` }} />
                  <span className="tl__yl num">{String(x.year).slice(2)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ globe 3D
export type ClientMap = Clientele[];

/**
 * Le globe des autorisations : terres en points, pays autorisés en or, arcs depuis les pays de domiciliation.
 * Interactif : rotation à la souris, survol, clic pour centrer un pays et afficher son panneau, filtre par clientèle.
 */
export function GlobeSection({ countries, routes, clients, withRmm, client: ctl, onClient }: { countries: MapCountry[]; routes: MapRoute[]; clients: ClientMap; withRmm: (u: string) => string; client?: string | null; onClient?: (c: string | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<import("../three/GlobeScene").GlobeScene | null>(null);
  const reduced = useReducedMotion();
  const nav = useNavigate();
  const [gl] = useState(() => webglAvailable());
  const [metric, setMetric] = useState<MapMetric>("n_funds");
  const [own, setOwn] = useState<string | null>(null);
  const client = ctl !== undefined ? ctl : own;
  const setClient = onClient ?? setOwn;
  const [tip, setTip] = useState<{ c: MapCountry; x: number; y: number } | null>(null);
  const [sel, setSel] = useState<MapCountry | null>(null);
  const [ready, setReady] = useState(false);
  const data = useMemo(() => ({ countries, routes }), [countries, routes]);
  const dataRef = useRef(data);
  dataRef.current = data;
  const values = useMemo(() => {
    if (!client) return null;
    const c = clients.find((x) => x.client === client);
    return new Map((c?.countries ?? []).map((x) => [x.iso, x[metric]]));
  }, [client, clients, metric]);

  useEffect(() => {
    if (!gl || !host.current || !labels.current) return;
    let alive = true;
    Promise.all([import("../three/GlobeScene"), import("world-atlas/countries-110m.json")]).then(([{ GlobeScene }, world]) => {
      if (!alive || !host.current || !labels.current) return;
      scene.current = new GlobeScene(host.current, ((world as unknown as { default?: never }).default ?? (world as never)), dataRef.current, {
        reduced, labelLayer: labels.current, domColors: DOM_COLORS,
        onHover: (c, x, y) => setTip(c ? { c, x, y } : null),
        onSelect: (c) => setSel(c),
      });
      setReady(true);
    });
    return () => { alive = false; scene.current?.dispose(); scene.current = null; setReady(false); };
  }, [gl, reduced]);
  useEffect(() => { if (ready) scene.current?.setMetric(metric); }, [metric, ready]);
  useEffect(() => { if (ready) scene.current?.setFilter(values); }, [values, ready]);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } scene.current?.setData(data, values ?? undefined); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (c: MapCountry | null) => { setSel(c); scene.current?.select(c?.iso ?? null); };
  const shown = values ? countries.filter((c) => values.has(c.iso)) : countries;
  const ranked = [...shown].sort((a, b) => b[metric] - a[metric]);
  const selClients = sel ? clients.filter((k) => k.countries.some((x) => x.iso === sel.iso))
    .map((k) => ({ k, n: k.countries.find((x) => x.iso === sel.iso)!.n_shares })).sort((a, b) => b.n - a.n) : [];
  const doms = [...new Set(routes.filter((r) => r.domicile_iso !== r.iso).map((r) => `${r.domicile_iso}|${r.domicile}`))];
  return (
    <section id="globe" className="globe reveal" aria-labelledby="h-globe">
      <div className="page globe__head">
        <Head id="globe" eyebrow="Le monde" title="Où nos parts sont autorisées"
          lede={<>Faites tourner le globe, survolez un pays, cliquez pour le centrer. Chaque colonne de lumière mesure {metric === "n_funds" ? "le nombre de fonds" : "le nombre de parts"} enregistrés dans le pays{client ? <> pour la clientèle <b>{client}</b></> : null}&nbsp;; les arcs partent du pays de domiciliation des fonds.</>}
          right={
            <div className="seg" role="radiogroup" aria-label="Mesure">
              {(["n_funds", "n_shares"] as MapMetric[]).map((m) => <button key={m} type="button" role="radio" aria-checked={metric === m} className="seg__b" onClick={() => setMetric(m)}>{m === "n_funds" ? "Fonds" : "Parts"}</button>)}
            </div>} />
        <div className="globe__clients"><ClientPicker clients={clients} value={client} onChange={setClient} /></div>
      </div>
      <div className="globe__stage">
        {gl ? <><div className="globe__canvas" ref={host} /><div className="globe__labels" ref={labels} aria-hidden="true" /></> : <div className="globe__fallback" />}
        {tip && !sel && (
          <div className="city__tip globe__tip" style={{ transform: `translate(-50%, -100%) translate(${tip.x}px, ${tip.y - 18}px)` }} role="status">
            <div className="city__tip-f">Pays d'enregistrement</div>
            <div className="city__tip-n">{tip.c.country}</div>
            <div className="city__tip-v num">{plural(tip.c.n_funds, "fonds", "fonds")} · {plural(tip.c.n_shares, "part")}</div>
            <div className="city__tip-go small">Cliquer pour centrer</div>
          </div>
        )}
        <aside className={`globe__panel${sel ? " is-open" : ""}`} aria-live="polite">
          {sel ? (
            <>
              <button type="button" className="globe__close" onClick={() => choose(null)} aria-label="Fermer le pays">×</button>
              <div className="eyebrow">Pays d'enregistrement · {sel.iso}</div>
              <h3 className="globe__country">{sel.country}</h3>
              <dl className="globe__kv">
                <div><dt>Fonds</dt><dd className="num">{sel.n_funds}</dd></div>
                <div><dt>Parts</dt><dd className="num">{sel.n_shares}</dd></div>
                <div><dt>Encours des parts autorisées</dt><dd className="num">{eur(sel.aum_registered)}</dd></div>
              </dl>
              {selClients.length > 0 && (
                <div className="globe__cl">
                  <div className="eyebrow">Clientèles autorisées</div>
                  <ul>{selClients.map(({ k, n }) => <li key={k.client}><span>{k.client}</span><span className="num">{plural(n, "part")}</span></li>)}</ul>
                </div>
              )}
              <button type="button" className="btn btn--gold" onClick={() => nav(withRmm(`/distribution/${encodeURIComponent(sel.country)}`))}>Ouvrir le pays</button>
            </>
          ) : (
            <>
              <div className="eyebrow">{client ? client : "Toutes les clientèles"}</div>
              <h3 className="globe__country">{shown.length} pays</h3>
              <ol className="globe__rank">
                {ranked.slice(0, 8).map((c) => (
                  <li key={c.iso}><button type="button" onClick={() => choose(c)} onMouseEnter={() => scene.current?.select(null)}>
                    <span>{c.country}</span><span className="num">{values?.get(c.iso) ?? c[metric]}</span></button></li>
                ))}
              </ol>
              <div className="globe__dom small">{doms.map((k) => { const [iso, name] = k.split("|"); return <span key={k}><i style={{ background: domColor(iso) }} /> depuis {name === "France" ? "la France" : name === "Luxembourg" ? "le Luxembourg" : name}</span>; })}</div>
            </>
          )}
        </aside>
      </div>
      <ul className="sr-only" aria-label="Pays d'enregistrement">
        {ranked.map((c) => <li key={c.iso}><button type="button" onClick={() => choose(c)}>{c.country} : {plural(c.n_funds, "fonds", "fonds")}, {plural(c.n_shares, "part")}</button></li>)}
      </ul>
    </section>
  );
}
