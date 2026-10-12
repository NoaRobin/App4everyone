/**
 * Accueil, en bas de page — Rothschild & Co City : la cité des revenus, et des vues de collecte sur la même scène.
 *  · Revenus (vue d'origine) : hauteur = revenus annuels estimés.
 *  · YTD, 1 mois, 1 an, 3 ans, 5 ans : hauteur = collecte nette estimée (JUMP) de la période ; décollecte en grenat.
 *
 * Revenus : une tour = un fonds (hauteur : revenus annuels estimés ; emprise : encours ; couronne : taux de frais), un
 * quartier = une famille de gestion. Mode exploration : plein écran, pilotage au clavier (ZQSD/WASD ou flèches, A/E pour
 * tourner, molette pour zoomer, Maj pour accélérer), mini-carte cliquable, fiche de la tour, recherche d'un fonds.
 * Lecture sobre : ni missions ni niveaux. Sans WebGL : la section se replie.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { eur, pct, pctRaw } from "../lib/format";
import { FAMILY_LABEL, FAMILY_ORDER, famHex, famVar } from "../lib/families";
import { gsap, onVisible } from "../lib/gsap";
import { prefersReducedMotion, useReducedMotion, webglAvailable } from "../lib/motion";
import type { FamilyKey } from "../lib/types";
import type { DriveInput, RevenueScene, RevFund } from "../three/RevenueScene";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import * as I from "./Icon";

export type CityFund = { id: string; name: string; family: FamilyKey; range: string | null; aum: number; rate: number; revenue: number; share: number | null };
type Props = { funds: CityFund[]; total: number; date: string; mock: boolean };
type Period = "YTD" | "1M" | "1A" | "3A" | "5A";
type View = "REV" | Period;
type FlowsData = { periods: Record<Period, { available: boolean; net: number | null; n_up: number; n_down: number }>; funds: { id: string; flows: Record<Period, number | null> }[] };
const VIEWS: { key: View; label: string; long: string }[] = [
  { key: "REV", label: "Revenus", long: "" }, { key: "YTD", label: "YTD", long: "depuis le 1er janvier" }, { key: "1M", label: "1 mois", long: "sur un mois" },
  { key: "1A", label: "1 an", long: "sur un an" }, { key: "3A", label: "3 ans", long: "sur trois ans" }, { key: "5A", label: "5 ans", long: "sur cinq ans" }];

export function RothschildCity({ funds, total, date, mock }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef<RevenueScene | null>(null);
  const reduced = useReducedMotion();
  const [gl] = useState(() => webglAvailable());
  const [game, setGame] = useState(false);
  const [sel, setSel] = useState<CityFund | null>(null);
  const [hover, setHover] = useState<{ f: RevFund; x: number; y: number } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // Vue : revenus (d'origine) ou collecte nette d'une période ; la collecte n'est chargée qu'au premier choix d'une période
  const flowsWanted = useRef(false);
  const [view, setView] = useState<View>("REV");
  const { api } = useApp();
  const flows = useApi<FlowsData>(view !== "REV" || flowsWanted.current ? (flowsWanted.current = true, api("/api/cite/collecte")) : null);
  const cam = useRef({ x: 104, z: 126, tx: 0, tz: 0, yaw: 0 });
  const [sceneReady, setSceneReady] = useState(0);
  const layout = useRef<{ id: string; family: string; x: number; z: number; w: number }[]>([]);

  const ranked = useMemo(() => [...funds].filter((f) => f.revenue > 0).sort((a, b) => b.revenue - a.revenue), [funds]);
  const rank = useMemo(() => new Map(ranked.map((f, i) => [f.id, i + 1])), [ranked]);
  const byId = useMemo(() => new Map(ranked.map((f) => [f.id, f])), [ranked]);
  const famsPresent = useMemo(() => FAMILY_ORDER.filter((k) => ranked.some((f) => f.family === k)), [ranked]);

  const pick = (f: CityFund | null, fly = true) => {
    setSel(f);
    scene.current?.select(f?.id ?? null, fly);
  };
  const fmtV = (v: number) => (view === "REV" ? `${eur(v)} / an` : eur(v, { signed: true }));
  const valOf = (id: string): number | null => (view === "REV" ? byId.get(id)?.revenue ?? null : flows.data?.funds.find((f) => f.id === id)?.flows[view] ?? null);
  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    if (view === "REV") { s.setValues(null, (v) => `${eur(v)} / an`); return; }
    if (!flows.data) return;
    s.setValues(new Map(flows.data.funds.map((f) => [f.id, f.flows[view]])), (v) => eur(v, { signed: true }));
  }, [view, flows.data, sceneReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------ scène (construite à l'approche de la section, pas au chargement)
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el || near) return;
    return onVisible(el, () => setNear(true), "120% 0px 120% 0px");
  }, [near]);
  useEffect(() => {
    const el = host.current, lab = labels.current;
    if (!el || !lab || !gl || !ranked.length || !near) return;
    let alive = true, s: RevenueScene | null = null, stop = () => undefined as void;
    import("../three/RevenueScene").then(({ RevenueScene }) => {
      if (!alive) return;
      const colors = Object.fromEntries([...FAMILY_ORDER, "nc"].map((k) => [k, famHex(k as FamilyKey, true)]));
      s = new RevenueScene(el, {
        funds: ranked.map((f) => ({ id: f.id, name: f.name, family: f.family, revenue: f.revenue, aum: f.aum, rate: f.rate, share: f.share })),
        colors, reduced, labelLayer: lab, formatEur: (v) => eur(v), autoIntro: false, offset: false,
        districtNames: Object.fromEntries(FAMILY_ORDER.map((k) => [k, `Quartier ${FAMILY_LABEL[k]}`])),
        onHover: (f, x, y) => setHover(f ? { f, x, y } : null),
        onSelect: (f) => pick(byId.get(f.id) ?? null),
        onCamera: (c) => { cam.current = c; },
      });
      scene.current = s;
      setSceneReady((n) => n + 1);
      layout.current = s.layout();
      stop = onVisible(el, () => s?.play(), "0px 0px -25% 0px");
    });
    return () => { alive = false; stop(); s?.dispose(); scene.current = null; };
  }, [ranked, gl, reduced, near]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.setFocus(focus); }, [focus]);

  // ------------------------------------------------------------ mini-carte
  useEffect(() => {
    const c = mapRef.current;
    if (!c || !gl) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const g = c.getContext("2d");
      if (!g) return;
      const S = c.width, k = S / 320, X = (x: number) => S / 2 + x * k;
      g.clearRect(0, 0, S, S);
      g.fillStyle = "rgba(6, 11, 21, .82)"; g.fillRect(0, 0, S, S);
      g.strokeStyle = "rgba(204, 159, 83, .18)"; g.lineWidth = 1;
      for (const r of [14, 34, 58, 86, 118]) g.strokeRect(X(-r), X(-r), r * 2 * k, r * 2 * k);
      for (const t of layout.current) {
        const on = !focus || t.family === focus;
        g.fillStyle = famHex(t.family as FamilyKey, true); g.globalAlpha = on ? (sel?.id === t.id ? 1 : 0.8) : 0.2;
        const w = Math.max(2.5, t.w * k * 1.2);
        g.fillRect(X(t.x) - w / 2, X(t.z) - w / 2, w, w);
        if (sel?.id === t.id) { g.globalAlpha = 1; g.strokeStyle = "#f3c56b"; g.lineWidth = 1.5; g.strokeRect(X(t.x) - w / 2 - 3, X(t.z) - w / 2 - 3, w + 6, w + 6); }
      }
      g.globalAlpha = 1;
      const m = cam.current;
      g.save(); g.translate(X(m.x), X(m.z)); g.rotate(m.yaw);
      g.fillStyle = "#f6f3ee"; g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-5, 5); g.closePath(); g.fill();
      g.restore();
      g.strokeStyle = "rgba(246, 243, 238, .35)"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(m.x), X(m.z)); g.lineTo(X(m.tx), X(m.tz)); g.stroke(); g.setLineDash([]);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [gl, focus, sel]);
  const onMap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), k = 320 / r.width;
    scene.current?.goTo((e.clientX - r.left) * k - 160, (e.clientY - r.top) * k - 160);
  };

  // ------------------------------------------------------------ mode exploration : plein écran et clavier
  useEffect(() => {
    scene.current?.setGame(game);
    if (!game) { scene.current?.setInput({ f: 0, r: 0, turn: 0, zoom: 0, boost: false }); return; }
    document.documentElement.classList.add("city-lock");
    const keys = new Set<string>();
    const sync = () => {
      const has = (...k: string[]) => k.some((x) => keys.has(x));
      const inp: DriveInput = {
        f: (has("z", "w", "arrowup") ? 1 : 0) - (has("s", "arrowdown") ? 1 : 0),
        r: (has("d", "arrowright") ? 1 : 0) - (has("q", "arrowleft") ? 1 : 0),
        turn: (has("e") ? 1 : 0) - (has("a") ? 1 : 0),
        zoom: (has("-", "_") ? 1 : 0) - (has("+", "=") ? 1 : 0),
        boost: keys.has("shift"),
      };
      scene.current?.setInput(inp);
    };
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.tagName === "INPUT";
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setGame(false); return; }
      if (typing(e)) return;
      const k = e.key.toLowerCase();
      if (["z", "q", "s", "d", "w", "a", "e", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", "+", "-", "=", "_"].includes(k)) { keys.add(k); sync(); e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); if (e.key === "Shift") keys.delete("shift"); sync(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => { keys.clear(); sync(); });
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); document.documentElement.classList.remove("city-lock"); };
  }, [game]);

  // ------------------------------------------------------------ entrée du HUD
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ paused: true, defaults: { ease: "expo.out" } });
      tl.fromTo(".c3__title span", { yPercent: 110 }, { yPercent: 0, duration: 1.1, stagger: 0.08 }, 0.2)
        .fromTo(".c3__hud > *", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.08, clearProps: "transform" }, 1.2)
        .fromTo(".c3__scan", { scaleY: 0 }, { scaleY: 1, duration: 1.4, ease: "power2.inOut" }, 0)
        .to(".c3__scan", { opacity: 0, duration: 0.6 }, 1.4);
      onVisible(el, () => tl.play(), "0px 0px -25% 0px");
    }, el);
    return () => ctx.revert();
  }, []);
  // Compteur des revenus
  const treasure = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = treasure.current;
    if (!el) return;
    const fmt = (v: number) => (v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    if (prefersReducedMotion()) { el.textContent = fmt(total); return; }
    const o = { v: 0 };
    let tw: gsap.core.Tween | null = null;
    const stop = onVisible(el, () => { tw = gsap.to(o, { v: total, duration: 2.6, ease: "expo.out", delay: 0.6, onUpdate: () => { el.textContent = fmt(o.v); } }); });
    return () => { stop(); tw?.kill(); el.textContent = fmt(total); };
  }, [total]);

  if (!gl || !ranked.length) return null;
  const hits = q.trim() ? ranked.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  const sr = sel ? rank.get(sel.id) : null;
  return (
    <section ref={root} className={`c3${game ? " is-game" : ""}`} aria-labelledby="h-city">
      <div className="c3__scene" ref={host} aria-hidden="true" />
      <div className="c3__labels" ref={labels} aria-hidden="true" />
      <div className="c3__vignette" aria-hidden="true" />
      <i className="c3__scan" aria-hidden="true" />

      <header className="c3__head">
        <div className="eyebrow c3__eyebrow">Rothschild & Co City · au {new Date(`${date}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" })}{mock ? " · données fictives" : ""}</div>
        <h2 className="c3__title" id="h-city"><span>Rothschild&nbsp;&amp;&nbsp;Co</span> <span>City.</span></h2>
        <p className="c3__lede">{view === "REV"
          ? <>Une tour par fonds&nbsp;: sa hauteur, ce qu'il rapporte chaque année&nbsp;; son emprise, son encours&nbsp;; sa couronne, son taux de frais. Un quartier par famille de gestion.</>
          : <>Une tour par fonds&nbsp;: sa hauteur, sa collecte nette estimée {VIEWS.find((x) => x.key === view)!.long}&nbsp;; en or s'il collecte, en grenat s'il décollecte. Un quartier par famille de gestion.</>}</p>
        <div className="c3__views" role="radiogroup" aria-label="Vue de la cité">
          {VIEWS.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={view === x.key} onClick={() => { setView(x.key); setHover(null); }}
              disabled={x.key !== "REV" && !!flows.data && !flows.data.periods[x.key].available}
              title={x.key !== "REV" && flows.data && !flows.data.periods[x.key].available ? "Historique insuffisant" : undefined}>{x.label}</button>
          ))}
        </div>
      </header>

      <div className="c3__hud">
        <div className="c3__score">
          {view === "REV" ? (<>
            <span className="c3__k">Revenus estimés de la maison</span>
            <b className="num"><span ref={treasure}>{(total / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</span><i> M€ / an</i></b>
            <span className="c3__k2">{ranked.length} tours · {famsPresent.length} quartiers</span>
          </>) : (<>
            <span className="c3__k">Collecte nette estimée · {VIEWS.find((x) => x.key === view)!.label}</span>
            <b className="num">{flows.data ? eur(flows.data.periods[view].net, { signed: true }) : "…"}</b>
            <span className="c3__k2">{flows.data ? `${flows.data.periods[view].n_up} fonds en collecte · ${flows.data.periods[view].n_down} en décollecte` : "Chargement"}</span>
          </>)}
        </div>
      </div>

      <div className="c3__map">
        <canvas ref={mapRef} width={360} height={360} onClick={onMap} aria-label="Mini-carte : cliquer pour s'y rendre" />
        <span className="c3__k">Mini-carte</span>
      </div>


      {sel && (
        <aside className="c3__card" aria-live="polite">
          <button type="button" className="c3__x" onClick={() => pick(null, false)} aria-label="Fermer la fiche"><I.Close size={14} /></button>
          <div className="c3__k"><span className="dot" style={{ background: famVar(sel.family, true) }} />Tour n° {sr} sur {ranked.length} · {FAMILY_LABEL[sel.family]}</div>
          <h3>{sel.name}</h3>
          <dl>
            {view !== "REV" && <div><dt>Collecte {VIEWS.find((x) => x.key === view)!.label}</dt><dd className="num">{eur(valOf(sel.id), { signed: true })}</dd></div>}
            <div><dt>Revenus / an</dt><dd className="num">{eur(sel.revenue)}</dd></div>
            <div><dt>Encours</dt><dd className="num">{eur(sel.aum)}</dd></div>
            <div><dt>Taux de frais</dt><dd className="num">{pctRaw(sel.rate)}</dd></div>
            <div><dt>Part des revenus</dt><dd className="num">{pct(sel.share, { signed: false })}</dd></div>
          </dl>
          <div className="c3__nav">
            {sr && sr > 1 ? <button type="button" onClick={() => pick(ranked[sr - 2])}>← Tour n° {sr - 1}</button> : <span />}
            {sr && sr < ranked.length ? <button type="button" onClick={() => pick(ranked[sr])}>Tour n° {sr + 1} →</button> : <span />}
          </div>
          <Link className="btn btn--gold c3__open" to={`/fonds/${encodeURIComponent(sel.id)}`}>Ouvrir la fiche <I.Arrow size={15} /></Link>
        </aside>
      )}

      <div className="c3__bar">
        <ul className="c3__fams" aria-label="Quartiers (isoler)">
          {famsPresent.map((k) => (
            <li key={k}><button type="button" aria-pressed={focus === k} onClick={() => setFocus((f) => (f === k ? null : k))}>
              <span className="dot" style={{ background: famVar(k, true) }} />{FAMILY_LABEL[k]}</button></li>
          ))}
        </ul>
        <div className="c3__tele">
          <label className="c3__search"><I.Search size={14} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Aller à un fonds…" aria-label="Aller à un fonds" /></label>
          {hits.length > 0 && (
            <ul className="c3__hits">{hits.map((f) => <li key={f.id}><button type="button" onClick={() => { pick(f); setQ(""); }}><span className="dot" style={{ background: famVar(f.family, true) }} />{f.name}<span className="num">n° {rank.get(f.id)}</span></button></li>)}</ul>
          )}
        </div>
        <div className="c3__btns">
          <button type="button" onClick={() => { pick(ranked[0]); }} title="Aller à la tour qui rapporte le plus">Tour n° 1</button>
          <button type="button" onClick={() => { pick(null, false); scene.current?.resetView(); }}>Recentrer</button>
          <button type="button" className={`c3__play${game ? " is-on" : ""}`} onClick={() => setGame((g) => !g)} aria-pressed={game}>
            {game ? <>Quitter l'exploration <kbd>Échap</kbd></> : <><I.Play size={14} /> Explorer la cité</>}
          </button>
        </div>
      </div>
      {game && <p className="c3__keys small" aria-live="polite"><kbd>Z Q S D</kbd> ou flèches : se déplacer · <kbd>A</kbd> <kbd>E</kbd> : tourner · molette ou <kbd>+</kbd> <kbd>−</kbd> : zoom · <kbd>Maj</kbd> : accélérer · clic : inspecter</p>}

      {hover && !sel && (
        <div className="c3__tip" style={{ left: hover.x, top: hover.y }} role="status">
          <span className="dot" style={{ background: famVar(hover.f.family, true) }} /><b>{hover.f.name}</b>
          <span className="num">{view === "REV" ? `${eur(hover.f.revenue)} / an · n° ${rank.get(hover.f.id)}` : `${fmtV(valOf(hover.f.id) ?? 0)} · collecte ${VIEWS.find((x) => x.key === view)!.label}`}</span>
        </div>
      )}
    </section>
  );
}
