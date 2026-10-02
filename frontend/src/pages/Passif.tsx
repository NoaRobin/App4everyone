/**
 * Passif — qui détient nos fonds, par quels comptes, et comment l'encours bouge.
 * Comptes (référentiel), positions (photo de l'encours à une date), transactions (60 derniers jours ouvrés).
 * Uniquement des parts (%) et des tranches : aucun montant, aucun flux net, aucun groupe de moins de 5.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { gsap, onVisible } from "../lib/gsap";
import { prefersReducedMotion, useReducedMotion, webglAvailable } from "../lib/motion";
import { ErrorState, Loading, useReveal } from "../components/ui";
import { Figures, Head } from "../components/Editorial";
import * as I from "../components/Icon";
import {
  arr, dFull, dShort, fp, natureColor, natureOf, NATURE_LABEL, NATURE_ORDER, RankMeter, rankOf, Tip, tr, TrancheChip,
  type Comptes, type PassifResp, type Positions, type Teneur, type Tranche,
} from "../components/PassifKit";
import { MappingSection, PositionsSection, TransactionsSection } from "../components/PassifSections";
import type { ModelNode, ModelScene as ModelSceneT } from "../three/PassifScene";
import "../styles/passif.css";

export default function Passif() {
  const { api } = useApp();
  const { data, error } = useApi<PassifResp>(api("/api/passif"));
  useReveal(data ? 1 : null);
  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><Loading h={560} label="Chargement du passif" /></div>;
  if (!data.available) return <Unavailable reason={data.reason} />;
  const d = data;
  return (
    <div className="pa">
      <Hero d={d} />
      <div className="page pa__page">
        <TeneursSection c={d.comptes} positions={d.positions} />
        <PositionsSection p={d.positions} asOf={d.positions_as_of} funds={d.funds} comptes={d.comptes} />
        <TransactionsSection t={d.transactions} />
        <MappingSection m={d.mapping} residual={d.positions?.residual_pct ?? null} />
      </div>
    </div>
  );
}

function Unavailable({ reason }: { reason?: string }) {
  return (
    <div className="page pa-off">
      <div className="eyebrow pa-hero__eyebrow">Passif</div>
      <h1 className="ph__title">Le passif</h1>
      <div className="empty pa-off__box" role="status">
        <I.Info size={22} />
        <p className="h3">Les données du passif ne sont pas disponibles pour le moment.</p>
        {reason && <p className="small">{reason}</p>}
        <p className="small muted">Cette rubrique lit les tables de comptes, de positions et de transactions dans Fabric. Les autres rubriques restent consultables.</p>
      </div>
    </div>
  );
}

// ================================================================== hero + carte du modèle
const MODEL_DEF: Omit<ModelNode, "tranche">[] = [
  { key: "clients", title: "Clients", unit: "clients", note: "Titulaires distincts recensés dans le référentiel des comptes.", kind: "ref" },
  { key: "comptes", title: "Comptes", unit: "comptes", note: "Comptes ouverts chez les teneurs de compte (EOC, TA, RMM, IZNES…).", kind: "ref" },
  { key: "positions", title: "Positions", unit: "positions", note: "Le stock : la photo de l'encours détenu, à la date d'arrêté.", kind: "stock" },
  { key: "operations", title: "Transactions", unit: "opérations", note: "Le flux : souscriptions, rachats et transferts des 60 derniers jours ouvrés.", kind: "flux" },
  { key: "funds_held", title: "Fonds détenus", unit: "fonds", note: "Fonds de la gamme présents dans au moins une position.", kind: "fund" },
];

function Hero({ d }: { d: PassifResp }) {
  const synthetic = (d.source ?? "").toLowerCase().startsWith("synth");
  const nodes: ModelNode[] = MODEL_DEF.map((m) => ({ ...m, tranche: d.model?.[m.key] ?? null,
    unit: m.key === "positions" && d.positions_as_of ? `positions au ${dShort(d.positions_as_of)}` : m.key === "operations" ? "opérations · 60 jours" : m.unit }));
  const tx = d.transactions;
  const late = tx?.period_late_pct;
  const resid = d.positions?.residual_pct;
  const nTen = arr(d.comptes?.teneurs).length;
  const fig = [
    { label: "Photo de l'encours", value: d.positions_as_of ? dShort(d.positions_as_of) : "—", sub: d.positions_as_of ? dFull(d.positions_as_of) : "date non publiée" },
    { label: "Période des transactions", value: String(arr(tx?.days).length || 0), unit: "jours", sub: tx?.first && tx?.last ? `du ${dShort(tx.first)} au ${dShort(tx.last)}` : "aucune journée publiée" },
    { label: "Teneurs de compte", value: String(nTen), sub: arr(d.comptes?.teneurs).map((t) => t.teneur).slice(0, 5).join(" · ") || "—" },
    { label: "Après cut-off", value: late == null ? "—" : fp(late).replace(/\s?%$/, ""), unit: late == null ? undefined : "%", sub: "du volume de la période" },
    { label: "Part masquée", value: resid == null ? "—" : fp(resid).replace(/\s?%$/, ""), unit: resid == null ? undefined : "%", sub: "groupes de moins de 5 positions" },
  ];
  return (
    <header className="pa-hero">
      <div className="pa-hero__in">
        <div className="pa-hero__grid">
          <div className="pa-hero__text">
            <div className="pa-hero__top">
              <span className="eyebrow pa-hero__eyebrow">Passif · distribution des fonds</span>
              {synthetic && <span className="pa-badge" title="Les tables Fabric ne sont pas branchées : jeu de démonstration au même format"><i aria-hidden="true" />Données synthétiques</span>}
            </div>
            <h1 className="ph__title hero-title pa-hero__title">Le passif</h1>
            <p className="ph__lede pa-hero__lede">
              Qui détient nos fonds, par quels comptes, et comment l'encours bouge. Le <strong>stock</strong>&nbsp;: la photo des positions
              {d.positions_as_of ? <> au {dFull(d.positions_as_of)}</> : null}. Le <strong>flux</strong>&nbsp;: les opérations des soixante derniers jours ouvrés.
              Tout est exprimé en parts et en tranches, jamais en montants.
            </p>
            <p className="small muted pa-hero__src">
              Source&nbsp;: {synthetic ? "jeu synthétique au format des tables Fabric" : "tables Fabric (agrégats calculés à la source)"}
              {d.refreshed_at ? <> · actualisé le {dFull(d.refreshed_at)} à {d.refreshed_at.slice(11, 16)}</> : null}
            </p>
          </div>
          <ModelMap nodes={nodes} />
        </div>
        <Figures items={fig} />
      </div>
    </header>
  );
}

function ModelMap({ nodes }: { nodes: ModelNode[] }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<ModelSceneT | null>(null);
  const reduced = useReducedMotion();
  const [gl] = useState(() => webglAvailable());
  const [tip, setTip] = useState<{ n: ModelNode; x: number; y: number } | null>(null);
  const key = nodes.map((n) => `${n.key}:${n.tranche?.rank ?? 0}`).join("|");
  useEffect(() => {
    if (!gl || !host.current || !labels.current) return;
    let alive = true;
    let stop = () => undefined as void;
    import("../three/PassifScene").then(({ ModelScene }) => {
      if (!alive || !host.current || !labels.current) return;
      const s = new ModelScene(host.current, nodes, { reduced, labelLayer: labels.current, onHover: (n, x, y) => setTip(n ? { n, x, y } : null) });
      scene.current = s;
      stop = onVisible(host.current, () => s.play(), "0px 0px -15% 0px");
    });
    return () => { alive = false; stop(); scene.current?.dispose(); scene.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, reduced, key]);
  return (
    <figure className="pa-model" aria-labelledby="pa-model-cap">
      {gl ? (
        <div className="pa-model__stage">
          <div className="pa-model__canvas" ref={host} />
          <div className="pa-model__labels" ref={labels} aria-hidden="true" />
          {tip && (
            <Tip x={tip.x} y={tip.y + (tip.y < (host.current?.clientHeight ?? 600) / 2 ? 50 : -50)} below={tip.y < (host.current?.clientHeight ?? 600) / 2}>
              <div className="city__tip-f">{tip.n.kind === "stock" ? "Stock" : tip.n.kind === "flux" ? "Flux" : "Référentiel"}</div>
              <div className="city__tip-n">{tip.n.title}</div>
              <div className="city__tip-v num">{tr(tip.n.tranche, tip.n.unit)}</div>
              <div className="city__tip-s small">{tip.n.note}</div>
            </Tip>
          )}
        </div>
      ) : <ModelFallback nodes={nodes} />}
      <figcaption id="pa-model-cap" className="pa-model__cap">
        <span className="pa-key"><i className="pa-key__stock" aria-hidden="true" />Stock&nbsp;: positions (s'écoule lentement)</span>
        <span className="pa-key"><i className="pa-key__flux" aria-hidden="true" />Flux&nbsp;: transactions (circule vite)</span>
        <span className="pa-key muted">Taille d'un nœud&nbsp;: rang de sa tranche, un ordre de grandeur et non un effectif exact.</span>
      </figcaption>
      <ul className="sr-only" aria-label="Carte du modèle">
        {nodes.map((n) => <li key={n.key}>{n.title} : {tr(n.tranche, n.unit)}. {n.note}</li>)}
      </ul>
    </figure>
  );
}

/** Sans WebGL : la même carte, en chaîne de cercles proportionnés au rang. */
function ModelFallback({ nodes }: { nodes: ModelNode[] }) {
  return (
    <div className="pa-model__flat" aria-hidden="true">
      {nodes.map((n) => (
        <div key={n.key} className={`pa-flat pa-flat--${n.kind}`}>
          <span className="pa-flat__o" style={{ width: 22 + rankOf(n.tranche) * 10, height: 22 + rankOf(n.tranche) * 10 }} />
          <span className="pa-node__k">{n.title}</span>
          <span className="pa-node__v">{n.tranche ? n.tranche.label : "non publié"}</span>
          <span className="pa-node__s">{n.unit}</span>
        </div>
      ))}
    </div>
  );
}

// ================================================================== teneurs de compte : système orbital
/** Géométrie du système orbital : large (écran) ou resserrée (mobile, pour garder des libellés lisibles). */
const GEO = { wide: { W: 920, H: 640, CX: 460, CY: 300, RX: 330, RY: 165 }, compact: { W: 600, H: 640, CX: 300, CY: 300, RX: 205, RY: 175 } };

function TeneursSection({ c, positions }: { c: Comptes | null | undefined; positions: Positions | null | undefined }) {
  const teneurs = arr(c?.teneurs);
  const [sel, setSel] = useState<string | null>(null);
  const [hov, setHov] = useState<string | null>(null);
  const cur = teneurs.find((t) => t.teneur === (hov ?? sel)) ?? teneurs.find((t) => t.teneur === sel) ?? teneurs[0];
  const encours = new Map(arr(positions?.by_teneur).map((x) => [x.teneur, x.pct]));
  const byClient = new Map(arr(positions?.by_client).map((x) => [x.classification, x.pct]));
  return (
    <section className="section reveal pa-ten" aria-labelledby="h-teneurs">
      <Head id="teneurs" eyebrow="Comptes" title="Les teneurs de compte"
        lede={<>Chaque planète est un teneur de compte, ses satellites sont ses classifications de comptes (client actif, banque privée, OPC, omnibus…). Taille&nbsp;: rang de la tranche de comptes. Survolez pour arrêter la rotation, cliquez pour ouvrir la fiche.</>}
        right={c?.total ? <div className="pa-ten__total"><span className="pa-ten__tk">Comptes au total</span><span className="pa-ten__tv">{c.total.label}</span><RankMeter t={c.total} /></div> : undefined} />
      {!c || c.available === false || !teneurs.length ? (
        <div className="empty small">Le référentiel des comptes n'est pas publié (aucun groupe d'au moins 5 comptes).</div>
      ) : (
        <>
          <div className="pa-ten__grid">
            <Orbit teneurs={teneurs} total={c.total} current={cur?.teneur ?? null} onHover={setHov} onSelect={(t) => setSel(t)} />
            {cur && <TeneurCard t={cur} encours={encours.get(cur.teneur)} byClient={byClient} />}
          </div>
          <div className="pa-ten__tabs" role="tablist" aria-label="Choisir un teneur de compte">
            {teneurs.map((t) => (
              <button key={t.teneur} type="button" role="tab" aria-selected={cur?.teneur === t.teneur} className="pa-ten__tab"
                onClick={() => setSel(t.teneur)} onMouseEnter={() => setHov(t.teneur)} onMouseLeave={() => setHov(null)}>
                <span className="pa-ten__tab-n">{t.teneur}</span><span className="pa-ten__tab-t small">{tr(t.tranche, "comptes")}</span>
              </button>
            ))}
          </div>
          <NatureLegend />
          <Structure c={c} />
        </>
      )}
    </section>
  );
}

function NatureLegend() {
  return (
    <ul className="pa-legend" aria-label="Nature des classifications">
      {NATURE_ORDER.map((n) => <li key={n}><span className={`pa-moon-key${n === "inactif" ? " is-hollow" : ""}`} style={{ ["--c" as string]: natureColor(n) }} />{NATURE_LABEL[n]}</li>)}
    </ul>
  );
}

function Orbit({ teneurs, total, current, onHover, onSelect }:
  { teneurs: Teneur[]; total: Tranche; current: string | null; onHover: (t: string | null) => void; onSelect: (t: string) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const planets = useRef<(SVGGElement | null)[]>([]);
  const moons = useRef<(SVGCircleElement | null)[][]>([]);
  const paused = useRef(false);
  const [moonTip, setMoonTip] = useState<{ t: string; label: string; tranche: Tranche; x: number; y: number } | null>(null);
  const n = teneurs.length;
  const pr = (t: Tranche) => 16 + rankOf(t) * 8;
  const mr = (t: Tranche) => 4 + rankOf(t) * 2;
  const sunR = 26 + rankOf(total) * 6;
  const [compact, setCompact] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(max-width: 640px)").matches);
  useEffect(() => {
    const mq = matchMedia("(max-width: 640px)");
    const on = () => setCompact(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const { W: VB_W, H: VB_H, CX, CY, RX, RY } = compact ? GEO.compact : GEO.wide;

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const reduced = prefersReducedMotion();
    let angle = -Math.PI / 2 + 0.35;
    let mt = 0;
    const place = () => {
      teneurs.forEach((t, i) => {
        const g = planets.current[i];
        if (!g) return;
        const th = angle + (i * 2 * Math.PI) / n;
        const depth = Math.sin(th);
        const x = CX + RX * Math.cos(th), y = CY + RY * depth;
        const s = 0.78 + 0.3 * (depth + 1) / 2;
        g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})`);
        g.style.opacity = String(0.62 + 0.38 * (depth + 1) / 2);
        const ms = moons.current[i] ?? [];
        const r0 = pr(t.tranche);
        ms.forEach((m, k) => {
          if (!m) return;
          const ph = mt * (0.5 + 0.08 * k) + (k * 2 * Math.PI) / Math.max(1, ms.length) + i;
          const rr = r0 + 18 + k * 10;
          const front = Math.sin(ph) > 0;
          m.setAttribute("cx", (rr * Math.cos(ph)).toFixed(1));
          m.setAttribute("cy", (rr * 0.42 * Math.sin(ph)).toFixed(1));
          m.style.opacity = front ? "1" : "0.45";
        });
      });
    };
    place();
    if (reduced) return;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paused.current) { angle += dt * 0.07; mt += dt; }
      place();
    };
    // Entrée : les orbites se dessinent, les planètes s'allument une à une
    const rings = el.querySelectorAll(".pa-orb__ring");
    const ps = el.querySelectorAll(".pa-orb__planet-in");
    gsap.set(ps, { scale: 0, transformOrigin: "50% 50%" });
    gsap.set(rings, { strokeDashoffset: 2400, strokeDasharray: 2400 });
    const stop = onVisible(el, () => {
      gsap.to(rings, { strokeDashoffset: 0, duration: 2.2, ease: "power2.inOut", stagger: 0.2, onComplete: () => { gsap.set(rings, { clearProps: "strokeDasharray,strokeDashoffset" }); } });
      gsap.to(ps, { scale: 1, duration: 1.1, ease: "back.out(1.7)", stagger: 0.12, delay: 0.4, clearProps: "transform" });
    });
    gsap.ticker.add(tick);
    return () => { stop(); gsap.ticker.remove(tick); gsap.killTweensOf([...rings, ...ps]); };
  }, [teneurs, n, CX, CY, RX, RY]);

  return (
    <div className="pa-orb" onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; onHover(null); setMoonTip(null); }}>
      <svg ref={svg} viewBox={`0 0 ${VB_W} ${VB_H}`} className="pa-orb__svg" role="img" aria-label={`Teneurs de compte : ${teneurs.map((t) => `${t.teneur}, ${tr(t.tranche, "comptes")}`).join(" ; ")}`}>
        <defs>
          <radialGradient id="pa-sun" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#f6e7c4" /><stop offset="45%" stopColor="#cc9f53" /><stop offset="100%" stopColor="#5b4520" />
          </radialGradient>
          <radialGradient id="pa-halo"><stop offset="0%" stopColor="rgba(204,159,83,.35)" /><stop offset="100%" stopColor="rgba(204,159,83,0)" /></radialGradient>
          <radialGradient id="pa-planet" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#3b5584" /><stop offset="70%" stopColor="#15233b" /><stop offset="100%" stopColor="#0b1424" />
          </radialGradient>
        </defs>
        <ellipse className="pa-orb__ring" cx={CX} cy={CY} rx={RX} ry={RY} />
        <ellipse className="pa-orb__ring pa-orb__ring--2" cx={CX} cy={CY} rx={RX * 0.62} ry={RY * 0.62} />
        <ellipse className="pa-orb__ring pa-orb__ring--3" cx={CX} cy={CY} rx={RX * 1.22} ry={RY * 1.22} />
        <circle cx={CX} cy={CY} r={sunR * 2.6} fill="url(#pa-halo)" />
        <circle cx={CX} cy={CY} r={sunR} fill="url(#pa-sun)" className="pa-orb__sun" />
        <text x={CX} y={CY - 4} className="pa-orb__sun-k" textAnchor="middle">Comptes</text>
        <text x={CX} y={CY + (compact ? 24 : 18)} className="pa-orb__sun-v" textAnchor="middle">{total ? total.label : "non publié"}</text>
        {teneurs.map((t, i) => {
          const r = pr(t.tranche);
          const cls = arr(t.classifications);
          const on = current === t.teneur;
          return (
            <g key={t.teneur} ref={(e) => { planets.current[i] = e; }} className={`pa-orb__planet${on ? " is-on" : ""}`}
              onMouseEnter={() => onHover(t.teneur)} onClick={() => onSelect(t.teneur)} style={{ cursor: "pointer" }}>
              <g className="pa-orb__planet-in">
                <ellipse rx={r + 18 + Math.max(0, cls.length - 1) * 10} ry={(r + 18 + Math.max(0, cls.length - 1) * 10) * 0.42} className="pa-orb__moonring" />
                <circle r={r + 30} fill="transparent" />
                {on && <circle r={r + 7} className="pa-orb__sel" />}
                <circle r={r} fill="url(#pa-planet)" className="pa-orb__body" />
                {cls.map((m, k) => {
                  const nat = natureOf(m);
                  return (
                    <circle key={m.classification} ref={(e) => { (moons.current[i] ??= [])[k] = e; }} r={mr(m.tranche)}
                      className={`pa-orb__moon${nat === "inactif" ? " is-hollow" : ""}`} style={{ ["--c" as string]: natureColor(nat) }}
                      onMouseEnter={(e) => { const box = svg.current!.getBoundingClientRect(); const b = (e.target as SVGCircleElement).getBoundingClientRect(); setMoonTip({ t: t.teneur, label: m.label, tranche: m.tranche, x: b.left + b.width / 2 - box.left, y: b.top - box.top }); }}
                      onMouseLeave={() => setMoonTip(null)} />
                  );
                })}
                <text y={r + (compact ? 40 : 34) + Math.max(0, cls.length - 1) * 4.2} className="pa-orb__name" textAnchor="middle">{t.teneur}</text>
                <text y={r + (compact ? 74 : 60) + Math.max(0, cls.length - 1) * 4.2} className="pa-orb__tr" textAnchor="middle">{t.tranche ? t.tranche.label : "non publié"}</text>
              </g>
            </g>
          );
        })}
      </svg>
      {moonTip && (
        <Tip x={moonTip.x} y={moonTip.y}>
          <div className="city__tip-f">{moonTip.t}</div>
          <div className="city__tip-n">{moonTip.label}</div>
          <div className="city__tip-v num">{tr(moonTip.tranche, "comptes")}</div>
        </Tip>
      )}
    </div>
  );
}

function TeneurCard({ t, encours, byClient }: { t: Teneur; encours?: number; byClient: Map<string, number> }) {
  const ref = useRef<HTMLDivElement>(null);
  const cls = useMemo(() => [...arr(t.classifications)].sort((a, b) => rankOf(b.tranche) - rankOf(a.tranche)), [t]);
  const maxPct = Math.max(1, ...cls.map((c) => byClient.get(c.classification) ?? 0));
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const items = el.querySelectorAll(".pa-tc__anim");
    gsap.fromTo(items, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.035, ease: "power2.out", clearProps: "opacity,transform" });
  }, [t.teneur]);
  return (
    <div className="pa-tc" ref={ref} aria-live="polite">
      <div className="eyebrow pa-tc__anim">Teneur de compte</div>
      <h3 className="pa-tc__name pa-tc__anim">{t.teneur}</h3>
      <dl className="pa-tc__kv pa-tc__anim">
        <div><dt>Comptes</dt><dd>{tr(t.tranche)}</dd><RankMeter t={t.tranche} /></div>
        <div><dt>Clients</dt><dd>{tr(t.clients)}</dd><RankMeter t={t.clients} /></div>
        <div><dt>Part de l'encours</dt><dd className="num">{encours == null ? "non publiée" : fp(encours)}</dd></div>
      </dl>
      <div className="pa-tc__h small muted pa-tc__anim">Classifications de comptes · part de l'encours détenu</div>
      {cls.length ? (
        <ul className="pa-tc__list">
          {cls.map((c) => {
            const nat = natureOf(c);
            const p = byClient.get(c.classification);
            return (
              <li key={c.classification} className="pa-tc__anim">
                <span className={`pa-moon-key${nat === "inactif" ? " is-hollow" : ""}`} style={{ ["--c" as string]: natureColor(nat) }} aria-hidden="true" />
                <span className="pa-tc__l">{c.label}
                  <span className="pa-tc__flags">
                    {c.active === false && <span className="tag tag--s">Inactif</span>}
                    {c.opc && <span className="tag tag--s">OPC</span>}
                    {c.omnibus && <span className="tag tag--s">Omnibus</span>}
                  </span>
                </span>
                <TrancheChip t={c.tranche} unit="comptes" />
                <span className="pa-tc__bar" aria-hidden="true"><span style={{ width: p == null ? 0 : `${Math.max(1.5, (p / maxPct) * 100)}%`, background: natureColor(nat) }} /></span>
                <span className="pa-tc__p num">{p == null ? "—" : fp(p)}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="small muted">Aucune classification publiée pour ce teneur.</p>}
    </div>
  );
}

function Structure({ c }: { c: Comptes }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const items = el.querySelectorAll(".pa-st__c");
    gsap.set(items, { opacity: 0, y: 14 });
    return onVisible(el, () => gsap.to(items, { opacity: 1, y: 0, duration: 0.8, stagger: 0.07, ease: "power3.out", clearProps: "opacity,transform" }));
  }, []);
  const pair = (a: string, ta: Tranche, b: string, tb: Tranche) => (
    <div className="pa-st__pair">
      <div><span className="pa-st__l small">{a}</span><span className="pa-st__v">{tr(ta)}</span><RankMeter t={ta} /></div>
      <div><span className="pa-st__l small">{b}</span><span className="pa-st__v">{tr(tb)}</span><RankMeter t={tb} /></div>
    </div>
  );
  return (
    <div className="pa-st" ref={ref}>
      <div className="pa-st__c">
        <div className="eyebrow">Structure</div>
        {pair("Avec compte parent", c.with_parent, "Sans compte parent", c.without_parent)}
      </div>
      <div className="pa-st__c">
        <div className="eyebrow">Statut</div>
        {pair("Ouverts", c.open, "Dissous", c.dissolved)}
      </div>
      <div className="pa-st__c">
        <div className="eyebrow">Date de création</div>
        {pair("Connue", c.creation_known, "Non renseignée", c.creation_unknown)}
      </div>
      <div className="pa-st__c">
        <div className="eyebrow">Devises des comptes</div>
        {arr(c.currencies).length ? (
          <ul className="pa-st__ccy">
            {arr(c.currencies).map((x) => <li key={x.devise}><span className="pa-st__code">{x.devise}</span><span className="small">{tr(x.tranche, "comptes")}</span></li>)}
          </ul>
        ) : <p className="small muted">Non publiées.</p>}
      </div>
      <p className="pa-st__note small muted">« Non publié »&nbsp;: groupe de moins de 5 comptes, ou information absente du référentiel. Rien n'est extrapolé.</p>
    </div>
  );
}
