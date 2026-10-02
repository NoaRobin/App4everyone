import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, pct, pctRaw } from "../lib/format";
import { FAMILY_LABEL, FAMILY_ORDER, famHex, famVar } from "../lib/families";
import { prefersReducedMotion, useReducedMotion, webglAvailable } from "../lib/motion";
import { gsap, onVisible } from "../lib/gsap";
import type { FamilyKey, Overview } from "../lib/types";
import { Board, Money, type BoardRow } from "../components/Story";
import { TimeChart } from "../components/charts";
import type { RevenueScene, RevFund } from "../three/RevenueScene";
import * as I from "../components/Icon";

/** Revenus de gestion estimés (GET /api/revenue) : encours × taux de frais de gestion financière. */
type RevRow = { id: string; name: string; family: FamilyKey; range: string | null; asset_class: string | null; aum: number; rate: number;
  revenue: number; revenue_net: number; revenue_12m: number | null; d_revenue_1y: number | null; flow_effect_1y: number | null; share: number | null };
type RevGroup = { key: string; label: string; revenue: number; aum: number; n: number; rate: number | null; share: number | null };
type Revenue = {
  date: string; total: number; total_net: number; total_12m: number | null; rate: number | null; coverage: number | null; aum_without_rate: number;
  rate_sources: Record<string, number>; concentration: { top10_share: number | null; n_for_80pct: number | null; n_funds: number };
  change_1y: { total: number | null; flows: number | null; market: number | null };
  funds: RevRow[]; families: RevGroup[]; ranges: RevGroup[]; asset_classes: RevGroup[]; trend: { d: string; v: number }[];
};
type Dist = { countries: BoardRow[]; n_shares_registered: number };

export default function Home() {
  const { api, meta } = useApp();
  const rev = useApi<Revenue>(api("/api/revenue"));
  const ov = useApi<Overview>(api("/api/overview"));
  const dist = useApi<Dist>(api("/api/distribution"));
  const r = rev.data;
  return (
    <div className="home rv">
      <Grain />
      <Hero r={r} mock={!!meta?.is_mock} />
      {r && <Ranking r={r} />}
      {r && <Drivers r={r} />}
      {r && <Breakdown r={r} />}
      {r && r.trend.length > 2 && <Trend r={r} />}
      {r && <Method r={r} />}
      {ov.data && <Living o={ov.data} mock={!!meta?.is_mock} />}
      {dist.data && (
        <section className="home__world" aria-labelledby="h-world">
          <Rise><div className="eyebrow home__eyebrow">Départs · distribution</div></Rise>
          <Rise><h2 className="home__h2" id="h-world">Commercialisés dans {dist.data.countries.length}&nbsp;pays.</h2></Rise>
          <Board rows={[...dist.data.countries].sort((a, b) => b.n_shares - a.n_shares).slice(0, 10)} />
          <Rise><p className="home__lede">{dist.data.n_shares_registered} parts disposent d'au moins un enregistrement actif. <Link className="link" to="/distribution">Tout le tableau des départs et le globe</Link></p></Rise>
        </section>
      )}
      <section className="home__close" aria-labelledby="h-close">
        <div className="home__close-in">
          <Rise><div className="eyebrow home__eyebrow">Espace métiers</div></Rise>
          <Rise><h2 className="home__h1" id="h-close">Chaque fonds, dans le détail.</h2></Rise>
          <Rise><p className="home__lede">Fiches, parts, performances, comparateur, portefeuilles, passif, pays d'enregistrement, risques et contrôles&nbsp;: tout est à une recherche.</p></Rise>
          <Rise>
            <div className="home__cta">
              <Link to="/metiers" className="btn btn--gold btn--lg">Entrer dans l'espace métiers <I.Arrow size={18} /></Link>
              <Link to="/fonds" className="btn btn--ghost btn--lg"><I.Search size={18} /> Rechercher un fonds</Link>
            </div>
          </Rise>
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ ouverture : la cité des revenus
function Hero({ r, mock }: { r: Revenue | null; mock: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const big = useRef<HTMLSpanElement>(null);
  const scene = useRef<RevenueScene | null>(null);
  const nav = useNavigate();
  const reduced = useReducedMotion();
  const [tip, setTip] = useState<{ f: RevFund; x: number; y: number } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [gl] = useState(() => webglAvailable());
  const total = r?.total ?? null;

  // Rideau d'ouverture : barres de cinéma, filet d'or qui balaie l'écran, puis le chiffre
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.inOut" } });
      tl.set(".rv__curtain", { autoAlpha: 1 })
        .fromTo(".rv__sweep", { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: "power4.inOut" }, 0.05)
        .to(".rv__sweep", { scaleY: 120, opacity: 0, duration: 0.6, ease: "power2.in" }, 0.6)
        .to(".rv__curtain", { autoAlpha: 0, duration: 0.5 }, 0.75)
        .fromTo(".rv__bars i", { scaleY: 1.6 }, { scaleY: 1, duration: 1.2 }, 0.6)
        .fromTo(".rv__kicker", { opacity: 0, letterSpacing: "0.6em" }, { opacity: 1, letterSpacing: "0.24em", duration: 1.4, ease: "power2.out" }, 0.9)
        .fromTo(".rv__big", { opacity: 0, yPercent: 30, filter: "blur(18px)" }, { opacity: 1, yPercent: 0, filter: "blur(0px)", duration: 1.3, ease: "expo.out" }, 1.0)
        .fromTo(".rv__unit, .rv__what", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.1 }, 1.6)
        .fromTo(".rv__facts > *", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.08, ease: "power3.out", clearProps: "transform" }, 2.1)
        .fromTo(".rv__legend > *", { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.6, stagger: 0.06, clearProps: "transform" }, 2.3)
        .fromTo(".rv__cue", { opacity: 0 }, { opacity: 1, duration: 0.8 }, 2.8);
    }, el);
    return () => ctx.revert();
  }, []);

  // Compteur : 0 → total pendant que les tours sortent de terre
  useEffect(() => {
    const el = big.current;
    if (!el || total == null) return;
    const { value } = splitEur(total);
    if (prefersReducedMotion()) { el.textContent = value; return; }
    const target = parseFloat(value.replace(/\s/g, "").replace(",", "."));
    const dec = value.includes(",") ? value.split(",")[1].length : 0;
    const o = { v: 0 };
    const tw = gsap.to(o, { v: target, duration: 2.4, delay: 1.0, ease: "expo.out",
      onUpdate: () => { el.textContent = o.v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }); } });
    return () => { tw.kill(); el.textContent = value; };
  }, [total]);

  // Scène 3D (chargée à la demande ; sans WebGL, le chiffre et le classement suffisent)
  useEffect(() => {
    const el = host.current, lab = labels.current;
    if (!el || !lab || !r || !gl) return;
    let alive = true, s: RevenueScene | null = null;
    import("../three/RevenueScene").then(({ RevenueScene }) => {
      if (!alive) return;
      const colors = Object.fromEntries([...FAMILY_ORDER, "nc"].map((k) => [k, famHex(k as FamilyKey, true)]));
      s = new RevenueScene(el, {
        funds: r.funds.map((f) => ({ id: f.id, name: f.name, family: f.family, revenue: f.revenue, aum: f.aum, rate: f.rate, share: f.share })),
        colors, reduced, labelLayer: lab, formatEur: (v) => eur(v),
        onHover: (f, x, y) => setTip(f ? { f, x, y } : null), onSelect: (f) => nav(`/fonds/${encodeURIComponent(f.id)}`),
      });
      scene.current = s;
    });
    return () => { alive = false; s?.dispose(); scene.current = null; };
  }, [r, gl, reduced, nav]);
  useEffect(() => { scene.current?.setFocus(focus); }, [focus]);

  const parts = total != null ? splitEur(total) : null;
  const fams = r ? FAMILY_ORDER.map((k) => r.families.find((g) => g.key === k)).filter(Boolean) as RevGroup[] : [];
  return (
    <section className="rv__hero" ref={root} aria-labelledby="h-home">
      <div className="rv__scene" ref={host} aria-hidden="true" />
      <div className="rv__labels" ref={labels} aria-hidden="true" />
      <div className="rv__vignette" aria-hidden="true" />
      <div className="rv__bars" aria-hidden="true"><i /><i /></div>
      <div className="rv__copy">
        <div className="eyebrow rv__kicker">Rothschild &amp; Co Asset Management{r ? ` · au ${fdate(r.date)}` : ""}{mock ? " · données fictives" : ""}</div>
        <h1 className="rv__title" id="h-home">
          <span className="sr-only">Revenus de gestion annuels estimés : {total != null ? eur(total) : "chargement"}. </span>
          <span className="rv__big num" aria-hidden="true"><span ref={big}>{parts?.value ?? "—"}</span><span className="rv__unit">{parts?.unit ?? ""}</span></span>
          <span className="rv__what">de revenus de gestion par an, estimés sur les encours d'aujourd'hui.</span>
        </h1>
        {r && (
          <div className="rv__facts">
            <div><b className="num">{r.rate != null ? pctRaw(r.rate) : "—"}</b><span>taux moyen de frais de gestion</span></div>
            <div><b className="num">{r.concentration.n_for_80pct ?? "—"}</b><span>fonds font 80&nbsp;% des revenus, sur {r.concentration.n_funds}</span></div>
            <div><b className={`num ${(r.change_1y.total ?? 0) >= 0 ? "up-t" : "down-t"}`}>{eur(r.change_1y.total, { signed: true })}</b><span>en un an, dont {eur(r.change_1y.flows, { signed: true })} par la collecte</span></div>
          </div>
        )}
        {fams.length > 0 && (
          <ul className="rv__legend" aria-label="Familles de gestion (survolez pour isoler)">
            {fams.map((g) => (
              <li key={g.key}>
                <button type="button" aria-pressed={focus === g.key} onMouseEnter={() => setFocus(g.key)} onMouseLeave={() => setFocus(null)}
                  onFocus={() => setFocus(g.key)} onBlur={() => setFocus(null)}>
                  <span className="dot" style={{ background: famVar(g.key, true) }} />{FAMILY_LABEL[g.key as FamilyKey] ?? g.label}
                  <span className="num">{pct(g.share, { signed: false, digits: 0 })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {tip && (
        <div className="rv__tip" style={{ left: tip.x, top: tip.y }} role="status">
          <span className="dot" style={{ background: famVar(tip.f.family, true) }} />
          <b>{tip.f.name}</b>
          <dl>
            <div><dt>Revenus / an</dt><dd className="num">{eur(tip.f.revenue)}</dd></div>
            <div><dt>Encours</dt><dd className="num">{eur(tip.f.aum)}</dd></div>
            <div><dt>Taux</dt><dd className="num">{pctRaw(tip.f.rate)}</dd></div>
            <div><dt>Part des revenus</dt><dd className="num">{pct(tip.f.share, { signed: false })}</dd></div>
          </dl>
          <span className="small muted">Cliquer pour ouvrir la fiche</span>
        </div>
      )}
      <div className="rv__curtain" aria-hidden="true"><i className="rv__sweep" /></div>
      <div className="home__cue rv__cue" aria-hidden="true"><span>Ce qui rapporte</span><i /></div>
    </section>
  );
}

function splitEur(v: number): { value: string; unit: string } {
  const a = Math.abs(v);
  if (a >= 1e9) return { value: (v / 1e9).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), unit: "Md€" };
  if (a >= 1e6) return { value: (v / 1e6).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }), unit: "M€" };
  return { value: (v / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: 0 }), unit: "k€" };
}

// ------------------------------------------------------------------ le classement
function Ranking({ r }: { r: Revenue }) {
  const ref = useRef<HTMLOListElement>(null);
  const [n, setN] = useState(12);
  const top = r.funds.slice(0, n);
  const max = top[0]?.revenue || 1;
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const bars = el.querySelectorAll<HTMLElement>(".rk__bar i");
    const rows = el.querySelectorAll<HTMLElement>(".rk__row");
    gsap.set(bars, { scaleX: 0 });
    gsap.set(rows, { opacity: 0, y: 12 });
    return onVisible(el, () => {
      gsap.to(rows, { opacity: 1, y: 0, duration: 0.6, stagger: 0.05, ease: "power3.out", clearProps: "transform" });
      gsap.to(bars, { scaleX: 1, duration: 1.3, stagger: 0.05, ease: "expo.out", delay: 0.15 });
    });
  }, [n, r]);
  return (
    <section className="rv__sec" aria-labelledby="h-rank">
      <Rise><div className="eyebrow home__eyebrow">Le classement</div></Rise>
      <Rise><h2 className="home__h2" id="h-rank">Les fonds qui rapportent le plus.</h2></Rise>
      <Rise><p className="home__lede">{r.concentration.top10_share != null ? <>Les dix premiers fonds apportent <b>{pct(r.concentration.top10_share, { signed: false, digits: 0 })}</b> des revenus de gestion. </> : null}
        Longueur de la barre&nbsp;: revenus annuels estimés&nbsp;; à droite, l'encours et le taux de frais qui les produisent.</p></Rise>
      <ol className="rk" ref={ref}>
        {top.map((f, i) => (
          <li key={f.id} className="rk__row">
            <Link to={`/fonds/${encodeURIComponent(f.id)}`} className="rk__a">
              <span className="rk__i num">{String(i + 1).padStart(2, "0")}</span>
              <span className="rk__n"><span className="dot" style={{ background: famVar(f.family, true) }} />{f.name}<span className="rk__sub">{f.range ?? FAMILY_LABEL[f.family] ?? ""}</span></span>
              <span className="rk__bar" aria-hidden="true"><i style={{ width: `${(f.revenue / max) * 100}%`, background: famVar(f.family, true) }} /></span>
              <b className="rk__v num">{eur(f.revenue)}</b>
              <span className="rk__m num">{eur(f.aum)} · {pctRaw(f.rate)}</span>
            </Link>
          </li>
        ))}
      </ol>
      {r.funds.length > n && <button type="button" className="btn btn--ghost rk__more" onClick={() => setN(r.funds.length)}>Voir les {r.funds.length} fonds</button>}
    </section>
  );
}

// ------------------------------------------------------------------ ce qui fait bouger les revenus
function Drivers({ r }: { r: Revenue }) {
  const c = r.change_1y;
  const moves = r.funds.filter((f) => f.d_revenue_1y != null);
  const up = [...moves].sort((a, b) => (b.d_revenue_1y ?? 0) - (a.d_revenue_1y ?? 0)).slice(0, 5);
  const down = [...moves].sort((a, b) => (a.d_revenue_1y ?? 0) - (b.d_revenue_1y ?? 0)).filter((f) => (f.d_revenue_1y ?? 0) < 0).slice(0, 5);
  const m = Math.max(Math.abs(c.flows ?? 0), Math.abs(c.market ?? 0), 1);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const bars = el.querySelectorAll<HTMLElement>(".dv__bar i");
    gsap.set(bars, { scaleX: 0 });
    return onVisible(el, () => gsap.to(bars, { scaleX: 1, duration: 1.4, stagger: 0.15, ease: "expo.out" }));
  }, [r]);
  const row = (label: string, v: number | null, cls: string, note: string) => (
    <div className={`dv__row ${cls}`}>
      <span className="dv__l">{label}<em>{note}</em></span>
      <span className="dv__bar" aria-hidden="true"><i className={(v ?? 0) < 0 ? "is-neg" : ""} style={{ width: `${(Math.abs(v ?? 0) / m) * 100}%` }} /></span>
      <b className={`num ${(v ?? 0) >= 0 ? "up-t" : "down-t"}`}>{eur(v, { signed: true })}</b>
    </div>
  );
  const list = (title: string, rows: RevRow[]) => (
    <div className="dv__list">
      <div className="eyebrow">{title}</div>
      <ol>{rows.map((f) => (
        <li key={f.id}><Link to={`/fonds/${encodeURIComponent(f.id)}`}><span className="dot" style={{ background: famVar(f.family, true) }} />{f.name}
          <b className={`num ${(f.d_revenue_1y ?? 0) >= 0 ? "up-t" : "down-t"}`}>{eur(f.d_revenue_1y, { signed: true })}</b></Link></li>
      ))}</ol>
    </div>
  );
  return (
    <section className="rv__sec" aria-labelledby="h-drv">
      <Rise><div className="eyebrow home__eyebrow">Sur un an</div></Rise>
      <Rise><h2 className="home__h2" id="h-drv">Ce qui fait bouger les revenus.</h2></Rise>
      <Rise><p className="home__lede">Variation des revenus annualisés en un an, séparée entre ce qu'apporte la collecte nette (au taux de chaque part) et ce qu'apportent les marchés.</p></Rise>
      <div className="dv" ref={ref}>
        <div className="dv__eq">
          {row("Collecte nette", c.flows, "is-flow", "argent confié ou retiré")}
          {row("Effet marché", c.market, "is-mkt", "valorisation des encours")}
          {row("Variation des revenus", c.total, "is-tot", "revenus annualisés, un an")}
        </div>
        <div className="dv__lists">
          {list("Plus forte hausse", up)}
          {down.length > 0 && list("Plus forte baisse", down)}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ par famille, gamme, classe d'actifs
function Breakdown({ r }: { r: Revenue }) {
  const [dim, setDim] = useState<"families" | "ranges" | "asset_classes">("families");
  const rows = r[dim];
  const ref = useRef<HTMLDivElement>(null);
  const colorOf = (g: RevGroup, i: number) => dim === "families" ? famVar(g.key, true) : `color-mix(in srgb, var(--gold) ${Math.max(28, 100 - i * 9)}%, #1c355e)`;
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const segs = el.querySelectorAll<HTMLElement>(".bd__strip span");
    gsap.fromTo(segs, { scaleY: 0 }, { scaleY: 1, duration: 0.8, stagger: 0.04, ease: "back.out(1.6)", transformOrigin: "50% 100%" });
  }, [dim]);
  return (
    <section className="rv__sec" aria-labelledby="h-bd">
      <Rise><div className="eyebrow home__eyebrow">Répartition</div></Rise>
      <Rise><h2 className="home__h2" id="h-bd">D'où viennent les revenus.</h2></Rise>
      <div className="seg rv__seg" role="radiogroup" aria-label="Regrouper par">
        {([["families", "Familles"], ["ranges", "Gammes"], ["asset_classes", "Classes d'actifs"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={dim === k} className="seg__b" onClick={() => setDim(k)}>{l}</button>
        ))}
      </div>
      <div className="bd" ref={ref}>
        <div className="bd__strip" role="img" aria-label={rows.map((g) => `${g.label} ${pct(g.share, { signed: false })}`).join(", ")}>
          {rows.map((g, i) => <span key={g.key} style={{ flexGrow: g.share ?? 0, background: colorOf(g, i) }} title={`${g.label} · ${eur(g.revenue)}`} />)}
        </div>
        <table className="t bd__t">
          <thead><tr><th>{dim === "families" ? "Famille" : dim === "ranges" ? "Gamme" : "Classe d'actifs"}</th><th className="n">Revenus / an</th><th className="n">Part</th><th className="n">Encours</th><th className="n">Taux moyen</th><th className="n">Fonds</th></tr></thead>
          <tbody>{rows.map((g, i) => (
            <tr key={g.key}><td><span className="dot" style={{ background: colorOf(g, i) }} /> {g.label}</td><td className="n">{eur(g.revenue)}</td><td className="n">{pct(g.share, { signed: false })}</td>
              <td className="n">{eur(g.aum)}</td><td className="n">{g.rate != null ? pctRaw(g.rate) : "—"}</td><td className="n">{g.n}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ trajectoire
function Trend({ r }: { r: Revenue }) {
  const series = useMemo(() => [{ key: "rev", label: "Revenus annualisés", color: "var(--gold)", points: r.trend, fill: true }], [r.trend]);
  return (
    <section className="rv__sec" aria-labelledby="h-tr">
      <Rise><div className="eyebrow home__eyebrow">Trajectoire</div></Rise>
      <Rise><h2 className="home__h2" id="h-tr">Le rythme annuel des revenus, mois après mois.</h2></Rise>
      <Rise><p className="home__lede">Encours de fin de mois multiplié par le taux de frais actuel de chaque part&nbsp;: la courbe isole l'effet des encours.</p></Rise>
      <div className="rv__chart"><TimeChart series={series} height={300} ariaLabel="Revenus de gestion annualisés, fin de mois" /></div>
    </section>
  );
}

// ------------------------------------------------------------------ méthode
function Method({ r }: { r: Revenue }) {
  return (
    <section className="rv__sec rv__method" aria-labelledby="h-me">
      <h2 className="eyebrow home__eyebrow" id="h-me">Comment ces chiffres sont estimés</h2>
      <p>Revenu annuel d'une part = encours en euros × taux de frais de gestion financière (frais réels de la part, à défaut maximum de la part, puis du fonds ; aucun taux inventé).
        Montants bruts, avant rétrocessions aux distributeurs, commissions de surperformance et frais administratifs.
        {r.total_net ? <> Net des rétrocessions standard renseignées&nbsp;: <b>{eur(r.total_net)}</b> par an.</> : null}
        {r.total_12m != null ? <> Revenus courus sur les douze derniers mois&nbsp;: <b>{eur(r.total_12m)}</b>.</> : null}
        {" "}Couverture&nbsp;: {pct(r.coverage, { signed: false, digits: 0 })} des encours ont un taux{r.aum_without_rate > 0 ? <> ({eur(r.aum_without_rate)} sans taux, non valorisés)</> : null}.</p>
    </section>
  );
}

// ------------------------------------------------------------------ la maison dans l'application
function Living({ o, mock }: { o: Overview; mock: boolean }) {
  const tot = o.families.reduce((s, f) => s + (f.aum ?? 0), 0) || 1;
  const fams = FAMILY_ORDER.map((k) => o.families.find((f) => f.key === k)).filter(Boolean) as Overview["families"];
  return (
    <section className="living" aria-labelledby="h-living">
      <Rise><div className="eyebrow home__eyebrow">Les encours · au {fdate(o.date)}{mock ? " · données fictives" : ""}</div></Rise>
      <Rise><h2 className="home__h2" id="h-living">La matière première des revenus.</h2></Rise>
      <div className="living__mega num"><Money v={o.aum} big /></div>
      <Rise>
        <div className="living__facts">
          <div><b className="num">{o.n_funds}</b><span>fonds ouverts</span></div>
          <div><b className="num">{o.n_parts}</b><span>parts investies</span></div>
          <div><b className="num">4</b><span>familles de gestion</span></div>
        </div>
      </Rise>
      <div className="living__bar" role="img" aria-label={fams.map((f) => `${FAMILY_LABEL[f.key]} ${eur(f.aum)}`).join(", ")}>
        {fams.map((f) => <span key={f.key} style={{ flexGrow: (f.aum ?? 0) / tot, background: famVar(f.key, true) }} />)}
      </div>
      <ul className="living__legend">
        {fams.map((f) => (
          <li key={f.key}><Link to={`/selection?family=${f.key}`}><span className="dot" style={{ background: famVar(f.key, true) }} />{FAMILY_LABEL[f.key]}<span className="num">{eur(f.aum)}</span></Link></li>
        ))}
      </ul>
      <Rise><Link to="/encours" className="arrow-link">Explorer la ville des encours <I.Arrow size={16} /></Link></Rise>
    </section>
  );
}

// ------------------------------------------------------------------ utilitaires
/** Apparition au défilement (une fois), sans rien laisser invisible si l'animation est désactivée. */
function Rise({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const tw = gsap.fromTo(el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1, ease: "rco", paused: true, clearProps: "transform" });
    const off = onVisible(el, () => tw.play());
    return () => { off(); tw.revert(); };
  }, []);
  return <div ref={ref} className="rise">{children}</div>;
}

function Grain() {
  return <div className="grain" aria-hidden="true" />;
}
