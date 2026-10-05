import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, pct, pctRaw } from "../lib/format";
import { FAMILY_LABEL, FAMILY_ORDER, famHex, famVar } from "../lib/families";
import { prefersReducedMotion, useReducedMotion, webglAvailable } from "../lib/motion";
import { gsap, onVisible, ScrollTrigger, SplitText } from "../lib/gsap";
import type { FamilyKey, Overview } from "../lib/types";
import { Board, Money, type BoardRow } from "../components/Story";
import { TimeChart, useWidth } from "../components/charts";
import type { PrismScene, RevFund } from "../three/PrismScene";
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
      <Paths />
      {r && <Ranking r={r} />}
      {r && <Drivers r={r} />}
      {r && <Breakdown r={r} />}
      {r && r.trend.length > 2 && <Trend r={r} />}
      {r && <Method r={r} />}
      {ov.data && <Living o={ov.data} mock={!!meta?.is_mock} />}
      {dist.data && (
        <section className="home__world" aria-labelledby="h-world">
          <Rise><div className="eyebrow home__eyebrow">Distribution</div></Rise>
          <Rise><h2 className="home__h2" id="h-world">Commercialisés dans {dist.data.countries.length}&nbsp;pays.</h2></Rise>
          <Board title="Commercialisation" rows={[...dist.data.countries].sort((a, b) => b.n_shares - a.n_shares).slice(0, 10)} />
          <Rise><p className="home__lede">{dist.data.n_shares_registered} parts disposent d'au moins un enregistrement actif. <Link className="link" to="/distribution">Tous les pays de commercialisation et le globe</Link></p></Rise>
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

// ------------------------------------------------------------------ ouverture : le prisme des revenus, un plan-séquence au défilement
const CHAPTERS = ["Total", "Familles", "N° 1", "N° 2", "N° 3", "Classement"];

function Hero({ r, mock }: { r: Revenue | null; mock: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const film = useRef<HTMLElement>(null);
  const scene = useRef<PrismScene | null>(null);
  const st = useRef<ScrollTrigger | null>(null);
  const nav = useNavigate();
  const reduced = useReducedMotion();
  const [tip, setTip] = useState<{ f: RevFund; x: number; y: number } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [chap, setChap] = useState(0);
  const [gl] = useState(() => webglAvailable());
  const total = r?.total ?? null;
  const top = useMemo(() => (r ? [...r.funds].filter((f) => f.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 3) : []), [r]);
  const fams = r ? FAMILY_ORDER.map((k) => r.families.find((g) => g.key === k)).filter(Boolean) as RevGroup[] : [];
  const filmOn = !reduced && gl;
  const top10 = r ? Math.round([...r.funds].sort((a, b) => b.revenue - a.revenue).slice(0, 10).reduce((s, f) => s + (f.share ?? 0), 0) * 1000) / 10 : null;

  // Portes d'ouverture : une couture d'or s'allume au centre, les deux battants s'écartent
  useLayoutEffect(() => {
    const el = film.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.inOut" } });
      // Les premières secondes appartiennent à la lumière ; le texte arrive quand le prisme a séparé les revenus
      tl.fromTo(".rv__bars i", { scaleY: 2.4 }, { scaleY: 1, duration: 1.6, ease: "expo.inOut" }, 0.2)
        .fromTo(".rv__kicker", { opacity: 0, letterSpacing: "0.7em" }, { opacity: 1, letterSpacing: "0.24em", duration: 1.4, ease: "power2.out" }, 2.1)
        .fromTo(".rv__big", { opacity: 0, yPercent: 24 }, { opacity: 1, yPercent: 0, duration: 1.2, ease: "expo.out" }, 2.2)
        .fromTo(".rv__rule", { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: "expo.inOut" }, 2.5)
        .fromTo(".rv__what", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9 }, 2.7)
        .fromTo(".rv__facts > *", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.08, ease: "power3.out", clearProps: "transform" }, 3.0)
        .fromTo(".rv__legend > *", { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.6, stagger: 0.06, clearProps: "transform" }, 3.1)
        .fromTo(".rv__rail, .rv__ctl", { opacity: 0 }, { opacity: 1, duration: 0.8 }, 3.5);
    }, el);
    return () => ctx.revert();
  }, []);

  // Scène 3D (chargée à la demande ; sans WebGL, le chiffre et les fiches suffisent)
  useEffect(() => {
    const el = host.current, lab = labels.current;
    if (!el || !lab || !r || !gl) return;
    let alive = true, s: PrismScene | null = null;
    import("../three/PrismScene").then(({ PrismScene }) => {
      if (!alive) return;
      const colors = Object.fromEntries([...FAMILY_ORDER, "nc"].map((k) => [k, famHex(k as FamilyKey, true)]));
      s = new PrismScene(el, {
        funds: r.funds.map((f) => ({ id: f.id, name: f.name, family: f.family, revenue: f.revenue, aum: f.aum, rate: f.rate, share: f.share })),
        total: r.total, aum: r.funds.reduce((a, f) => a + (f.aum ?? 0), 0) || null, colors, reduced, labelLayer: lab,
        familyLabels: Object.fromEntries(r.families.map((g) => [g.key, FAMILY_LABEL[g.key as FamilyKey] ?? g.label])),
        familyOrder: [...FAMILY_ORDER, "nc"], formatEur: (v) => eur(v), formatPct: (v) => pct(v, { signed: false }),
        onHover: (f, x, y) => setTip(f ? { f, x, y } : null), onSelect: (f) => nav(`/fonds/${encodeURIComponent(f.id)}`),
      });
      scene.current = s;
    });
    return () => { alive = false; s?.dispose(); scene.current = null; };
  }, [r, gl, reduced, nav]);
  useEffect(() => { scene.current?.setFocus(focus); }, [focus]);

  // Plan-séquence : la section est épinglée pendant quatre écrans ; chaque chapitre déplace la caméra et révèle sa fiche
  useLayoutEffect(() => {
    const el = film.current;
    if (!el || !filmOn || !r || top.length === 0) return;
    const splits: SplitText[] = [];
    const ctx = gsap.context(() => {
      const n = CHAPTERS.length - 1;
      const tl = gsap.timeline({ defaults: { ease: "none" } });
      tl.to(".rv__copy", { autoAlpha: 0, y: -40, duration: 0.35, ease: "power2.in" }, 0.55);
      gsap.utils.toArray<HTMLElement>(".rv__chap", el).forEach((c, i) => {
        const at = i + 1;
        const title = c.querySelector<HTMLElement>(".rv__ct");
        const parts = title ? new SplitText(title, { type: "lines,words", mask: "lines" }) : null;
        if (parts) splits.push(parts);
        tl.fromTo(c, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15 }, at - 0.4)
          .fromTo(c.querySelector(".rv__cn"), { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: "power3.out" }, at - 0.4)
          .fromTo(c.querySelector(".rv__crule"), { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "power2.inOut" }, at - 0.35);
        if (parts) tl.fromTo(parts.words, { yPercent: 110 }, { yPercent: 0, duration: 0.3, stagger: 0.02, ease: "power3.out" }, at - 0.32);
        tl.fromTo(c.querySelectorAll(".rv__cd > *"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.04, ease: "power2.out" }, at - 0.22);
        if (at < n) tl.to(c, { autoAlpha: 0, y: -30, duration: 0.3, ease: "power2.in" }, at + 0.5);
      });
      tl.to({}, { duration: 0.4 }, n);
      st.current = ScrollTrigger.create({
        trigger: el, start: "top top", end: `+=${n * 100}%`, pin: true, scrub: 0.8, animation: tl,
        onUpdate: (self) => {
          const c = Math.min(n, Math.round(self.progress * (n + 0.4) - 0.1));
          setChap((p) => (p === c ? p : c));
        },
      });
    }, el);
    return () => { st.current = null; splits.forEach((s) => s.revert()); ctx.revert(); };
  }, [filmOn, r, top.length]);

  // Chaque changement de chapitre déplace la caméra
  useEffect(() => {
    const s = scene.current;
    if (!s || !filmOn) return;
    s.goTo(chap === 0 ? { kind: "overview" } : chap === 1 ? { kind: "families" } : chap === CHAPTERS.length - 1 ? { kind: "wall" } : { kind: "fund", i: chap - 2 });
  }, [chap, filmOn]);

  const jump = (i: number) => {
    const t = st.current;
    if (!t) return;
    window.scrollTo({ top: t.start + ((t.end - t.start) * (i + 0.1)) / (CHAPTERS.length - 0.6), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  return (
    <section className={`rv__film${filmOn ? "" : " is-static"}`} ref={film} aria-labelledby="h-home"
      onKeyDown={(e) => { if (e.key === "ArrowLeft") scene.current?.nudge(-20); else if (e.key === "ArrowRight") scene.current?.nudge(20); }}>
      <div className="rv__hero">
        <div className="rv__scene" ref={host} aria-hidden="true" />
        <div className="rv__labels" ref={labels} aria-hidden="true" />
        <div className="rv__vignette" aria-hidden="true" />
        <div className="rv__frame" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="rv__bars" aria-hidden="true"><i /><i /></div>
        <div className="rv__copy">
          <div className="eyebrow rv__kicker">Rothschild &amp; Co Asset Management{r ? ` · au ${fdate(r.date)}` : ""}{mock ? " · données fictives" : ""}</div>
          <h1 className="rv__title" id="h-home">
            <span className="sr-only">Revenus de gestion annuels estimés : {total != null ? eur(total) : "chargement"}. </span>
            <Odometer total={total} />
            <i className="rv__rule" aria-hidden="true" />
            <span className="rv__what">de revenus de gestion par an, estimés sur les encours d'aujourd'hui.</span>
          </h1>
          {r && !filmOn && (
            <div className="rv__facts">
              <div><b className="num">{r.rate != null ? pctRaw(r.rate) : "—"}</b><span>taux moyen de frais de gestion</span></div>
              <div><b className="num">{r.concentration.n_for_80pct ?? "—"}</b><span>fonds font 80&nbsp;% des revenus, sur {r.concentration.n_funds}</span></div>
              <div><b className={`num ${(r.change_1y.total ?? 0) >= 0 ? "up-t" : "down-t"}`}>{eur(r.change_1y.total, { signed: true })}</b><span>en un an, dont {eur(r.change_1y.flows, { signed: true })} par la collecte</span></div>
            </div>
          )}
          {fams.length > 0 && !filmOn && <FamilyList fams={fams} focus={focus} setFocus={setFocus} label="Familles de gestion (survolez pour isoler)" />}
        </div>
        {gl && r && (
          <div className="rv__ctl" role="group" aria-label="Vue du prisme des revenus">
            <button type="button" data-touch onClick={() => scene.current?.nudge(-35)} aria-label="Tourner vers la gauche"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg></button>
            <button type="button" data-touch onClick={() => scene.current?.resetView()} aria-label="Revenir au cadrage d'origine"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="5" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="10" y="10" width="4" height="4" fill="currentColor" /></svg></button>
            <button type="button" data-touch onClick={() => scene.current?.nudge(35)} aria-label="Tourner vers la droite"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg></button>
          </div>
        )}
        {filmOn && r && (
          <nav className="rv__rail" aria-label="Chapitres de l'ouverture">
            <ol>
              {CHAPTERS.map((c, i) => (
                <li key={c}><button type="button" data-touch aria-current={chap === i ? "step" : undefined} onClick={() => jump(i)}><i />{c}</button></li>
              ))}
            </ol>
          </nav>
        )}
        {!filmOn && <div className="home__cue rv__cue" aria-hidden="true"><span>Ce qui rapporte</span><i /></div>}
      </div>

      {r && top.length > 0 && (
        <div className="rv__chaps">
          <article className="rv__chap rv__chap--map" aria-labelledby="h-fams">
            <div className="rv__cbody">
              <div className="eyebrow rv__cf">Le prisme des frais</div>
              <h2 className="rv__ct" id="h-fams">L'encours traverse les frais, les revenus se séparent en quatre familles.</h2>
              <i className="rv__crule" aria-hidden="true" />
              <div className="rv__cd"><FamilyList fams={fams} focus={focus} setFocus={setFocus} label="Part des revenus par famille" big /></div>
              <div className="rv__facts rv__facts--chap">
                <div><b className="num">{r.rate != null ? pctRaw(r.rate) : "—"}</b><span>taux moyen de frais de gestion</span></div>
                <div><b className="num">{r.concentration.n_for_80pct ?? "—"}</b><span>fonds font 80&nbsp;% des revenus, sur {r.concentration.n_funds}</span></div>
              </div>
            </div>
          </article>
          {top.map((f, i) => (
            <article className="rv__chap" key={f.id} aria-label={`Fonds n° ${i + 1} par revenu de gestion`}>
              <div className="rv__cn num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</div>
              <div className="rv__cbody">
                <div className="eyebrow rv__cf"><i style={{ background: famVar(f.family, true) }} />{i === 0 ? "Le fonds qui rapporte le plus" : `N° ${i + 1} des revenus`} · {FAMILY_LABEL[f.family] ?? f.family}</div>
                <h2 className="rv__ct">{f.name}</h2>
                <i className="rv__crule" aria-hidden="true" />
                <dl className="rv__cd">
                  <div><dt>Revenus / an</dt><dd className="num">{eur(f.revenue)}</dd></div>
                  <div><dt>Part des revenus</dt><dd className="num">{pct(f.share, { signed: false })}</dd></div>
                  <div><dt>Encours</dt><dd className="num">{eur(f.aum)}</dd></div>
                  <div><dt>Taux de frais</dt><dd className="num">{pctRaw(f.rate)}</dd></div>
                </dl>
                <Link className="rv__clink" to={`/fonds/${encodeURIComponent(f.id)}`}>Ouvrir la fiche <I.Arrow size={16} /></Link>
              </div>
            </article>
          ))}
          <article className="rv__chap rv__chap--map" aria-labelledby="h-wall">
            <div className="rv__cbody">
              <div className="eyebrow rv__cf">Le mur du classement</div>
              <h2 className="rv__ct" id="h-wall">{top10 != null ? `Dix fonds font ${top10.toLocaleString("fr-FR")} % des revenus.` : "Le classement des fonds."}</h2>
              <p className="rv__cp">Chaque faisceau frappe le mur à sa place, du fonds qui rapporte le plus au dixième. Son épaisseur est ses revenus, à la même échelle que la lumière qui entre dans le prisme.</p>
              <i className="rv__crule" aria-hidden="true" />
              <a className="rv__clink" href="#h-rank">Le classement complet <I.Arrow size={16} /></a>
            </div>
          </article>
        </div>
      )}

      {tip && (
        <div className="rv__tip" style={{ left: tip.x, top: tip.y }} role="status">
          <div className="rv__tiph"><i style={{ background: famVar(tip.f.family, true) }} /><b>{tip.f.name}</b></div>
          <dl>
            <div><dt>Revenus / an</dt><dd className="num">{eur(tip.f.revenue)}</dd></div>
            <div><dt>Encours</dt><dd className="num">{eur(tip.f.aum)}</dd></div>
            <div><dt>Taux</dt><dd className="num">{pctRaw(tip.f.rate)}</dd></div>
            <div><dt>Part des revenus</dt><dd className="num">{pct(tip.f.share, { signed: false })}</dd></div>
          </dl>
          <span className="small muted">Cliquer pour ouvrir la fiche</span>
        </div>
      )}
    </section>
  );
}

/** Liste plate des familles (repère carré), survol ou focus = isoler le district dans la scène. */
function FamilyList({ fams, focus, setFocus, label, big }: { fams: RevGroup[]; focus: string | null; setFocus: (k: string | null) => void; label: string; big?: boolean }) {
  return (
    <ul className={`rv__legend${big ? " rv__legend--big" : ""}`} aria-label={label}>
      {fams.map((g) => (
        <li key={g.key}>
          <button type="button" data-touch aria-pressed={focus === g.key} onMouseEnter={() => setFocus(g.key)} onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus(g.key)} onBlur={() => setFocus(null)}>
            <i style={{ background: famVar(g.key, true) }} /><span>{FAMILY_LABEL[g.key as FamilyKey] ?? g.label}</span>
            <span className="num">{pct(g.share, { signed: false, digits: 0 })}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Le total en compteur mécanique : chaque chiffre défile sur son rouleau jusqu'à sa valeur. */
function Odometer({ total }: { total: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const parts = total != null ? splitEur(total) : null;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !parts || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      el.querySelectorAll<HTMLElement>(".odo__col").forEach((c, i) => {
        const d = Number(c.dataset.d);
        gsap.fromTo(c, { yPercent: 0 }, { yPercent: -((10 + d) / 20) * 100, duration: 2.2 + i * 0.18, delay: 2.2, ease: "expo.out" });
      });
    }, el);
    return () => ctx.revert();
  }, [parts?.value]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!parts) return <span className="rv__big num is-loading" aria-hidden="true"><span>000</span><span className="rv__unit">M€</span></span>;
  const reduce = prefersReducedMotion();
  return (
    <span className="rv__big num" aria-hidden="true" ref={ref}>
      <span className="odo">
        {[...parts.value].map((ch, i) => /\d/.test(ch) && !reduce ? (
          <span className="odo__d" key={i}>
            <span className="odo__col" data-d={ch}>
              {Array.from({ length: 20 }, (_, k) => <span key={k}>{k % 10}</span>)}
            </span>
          </span>
        ) : <span className="odo__s" key={i}>{ch}</span>)}
      </span>
      <span className="rv__unit">{parts.unit}</span>
    </span>
  );
}

function splitEur(v: number): { value: string; unit: string } {
  const a = Math.abs(v);
  if (a >= 1e9) return { value: (v / 1e9).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), unit: "Md€" };
  if (a >= 1e6) return { value: (v / 1e6).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }), unit: "M€" };
  return { value: (v / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: 0 }), unit: "k€" };
}

// ------------------------------------------------------------------ par où commencer (un chemin par métier)
const PATHS: { who: string; what: string; links: { to: string; label: string }[] }[] = [
  { who: "Direction", what: "Ce qui rapporte, ce qui grossit, ce qui décroche.", links: [
    { to: "#h-rank", label: "Les fonds qui rapportent le plus" }, { to: "/encours", label: "La ville des encours" }, { to: "/comparateur", label: "Comparer des fonds" }] },
  { who: "Commercial & distribution", what: "Quelle part proposer, où, et à qui.", links: [
    { to: "/distribution", label: "Pays et autorisations" }, { to: "/passif", label: "Qui détient nos fonds" }, { to: "/comparateur", label: "Comparateur de performance" }] },
  { who: "Gestion", what: "La fiche, le portefeuille, les performances.", links: [
    { to: "/fonds", label: "Rechercher un fonds" }, { to: "/portefeuilles", label: "Portefeuilles" }, { to: "/selection", label: "Sélection multicritère" }] },
  { who: "Risques & contrôle", what: "Ce qui n'est pas en ordre, tout de suite.", links: [
    { to: "/fonds#risques", label: "Risques des fonds" }, { to: "/fonds?vue=controles#risques", label: "Contrôles et rattachement" }, { to: "/passif#h-lecture", label: "Lecture des tables sources" }] },
];

function Paths() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const cards = el.querySelectorAll<HTMLElement>(".pth__c");
    gsap.set(cards, { opacity: 0, y: 24 });
    return onVisible(el, () => gsap.to(cards, { opacity: 1, y: 0, duration: 0.7, stagger: 0.04, ease: "power3.out", clearProps: "opacity,transform" }));
  }, []);
  return (
    <section className="rv__sec pth" aria-labelledby="h-paths">
      <Rise><div className="eyebrow home__eyebrow">Par où commencer</div></Rise>
      <Rise><h2 className="home__h2" id="h-paths">Je suis…</h2></Rise>
      <div className="pth__g" ref={ref}>
        {PATHS.map((p, i) => (
          <article key={p.who} className="pth__c">
            <span className="pth__n num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="pth__t">{p.who}</h3>
            <p className="pth__w">{p.what}</p>
            <ul>{p.links.map((l) => (
              <li key={l.label}>{l.to.startsWith("#")
                ? <a href={l.to.replace("#h-", "#")} onClick={(e) => { e.preventDefault(); document.getElementById(l.to.slice(1))?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }); }}>{l.label}<I.Arrow size={14} /></a>
                : <Link to={l.to}>{l.label}<I.Arrow size={14} /></Link>}</li>
            ))}</ul>
          </article>
        ))}
      </div>
    </section>
  );
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
        {c.total != null && c.flows != null && c.market != null ? <Bridge total={r.total} change={c.total} flows={c.flows} market={c.market} /> : (
          <div className="dv__eq">
            {row("Collecte nette", c.flows, "is-flow", "argent confié ou retiré")}
            {row("Effet marché", c.market, "is-mkt", "valorisation des encours")}
            {row("Variation des revenus", c.total, "is-tot", "revenus annualisés, un an")}
          </div>
        )}
        <div className="dv__lists">
          {list("Plus forte hausse", up)}
          {down.length > 0 && list("Plus forte baisse", down)}
        </div>
      </div>
    </section>
  );
}

/**
 * Pont des revenus sur un an : revenus annualisés il y a un an + collecte nette + effet marché = revenus d'aujourd'hui.
 * Le mouvement fait l'addition : la première barre monte, un filet porte son niveau vers la colonne suivante, chaque
 * effet part de ce niveau (vers le haut s'il ajoute, vers le bas s'il retire), puis la barre d'arrivée monte du sol.
 * Échelle partant de zéro : les effets gardent leur vraie proportion face au total.
 */
function Bridge({ total, change, flows, market }: { total: number; change: number; flows: number; market: number }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const svg = useRef<SVGSVGElement>(null);
  const start = total - change;
  const other = change - flows - market;
  const steps: { key: string; label: string; note: string; from: number; to: number; kind: "total" | "delta" }[] = [
    { key: "a", label: "Il y a un an", note: "revenus annualisés", from: 0, to: start, kind: "total" },
    { key: "f", label: "Collecte nette", note: "argent confié ou retiré", from: start, to: start + flows, kind: "delta" },
    { key: "m", label: "Effet marché", note: "valorisation des encours", from: start + flows, to: start + flows + market, kind: "delta" },
    ...(Math.abs(other) > Math.abs(change) * 0.005 ? [{ key: "o", label: "Autres effets", note: "écart d'arrondi et de périmètre", from: start + flows + market, to: total, kind: "delta" as const }] : []),
    { key: "z", label: "Aujourd'hui", note: "revenus annualisés", from: 0, to: total, kind: "total" },
  ];
  const H = W < 600 ? 300 : 360, top = 46, bottom = 64;
  const max = Math.max(...steps.map((x) => Math.max(x.from, x.to))) * 1.06 || 1;
  const y = (v: number) => top + (1 - v / max) * (H - top - bottom);
  const n = steps.length, slot = (W || 1) / n, bw = Math.min(96, slot * 0.56);
  const cx = (i: number) => slot * (i + 0.5);
  useEffect(() => {
    const el = svg.current;
    if (!el || !W || prefersReducedMotion()) return;
    const q = (sel: string) => Array.from(el.querySelectorAll<SVGElement>(sel));
    const num = (e: Element, k: string) => Number(e.getAttribute(k));
    const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.inOut" } });
    // Uniquement des attributs SVG (pas de transformations) : rien ne peut rester décalé si la largeur change
    q(".br__axis").forEach((e) => tl.fromTo(e, { attr: { x2: 0 } }, { attr: { x2: num(e, "x2") }, duration: 0.7 }, 0));
    steps.forEach((st, i) => {
      const at = 0.35 + i * 0.62;
      const up = st.to >= st.from;
      const g = el.querySelector(`[data-k="${st.key}"]`);
      if (!g) return;
      const bar = g.querySelector(".br__bar")!, yy = num(bar, "y"), hh = num(bar, "height");
      tl.fromTo(bar, { attr: { y: up ? yy + hh : yy, height: 0 } }, { attr: { y: yy, height: hh }, duration: st.kind === "total" ? 0.9 : 0.6, ease: "expo.out" }, at)
        .fromTo(g.querySelectorAll(".br__v, .br__x"), { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "power2.out" }, at + 0.3);
      const link = el.querySelector(`[data-c="${i}"]`);
      if (link) tl.fromTo(link, { attr: { x2: num(link, "x1") } }, { attr: { x2: num(link, "x2") }, duration: 0.4, ease: "power2.inOut" }, at + 0.45);
    });
    q(".br__check").forEach((e) => tl.fromTo(e, { opacity: 0, attr: { x2: num(e, "x1") } }, { opacity: 1, attr: { x2: num(e, "x2") }, duration: 0.8 }, 0.35 + n * 0.62));
    const stop = onVisible(el, () => tl.play(), "0px 0px -18% 0px");
    return () => { stop(); tl.progress(1).kill(); };
  }, [W, total, change, flows, market]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="br" ref={box}>
      {W > 0 && (
        <svg ref={svg} width={W} height={H} role="img"
          aria-label={`Revenus annualisés : ${eur(start)} il y a un an, ${eur(flows, { signed: true })} par la collecte nette, ${eur(market, { signed: true })} par l'effet marché, ${eur(total)} aujourd'hui.`}>
          <line className="br__axis" x1={0} x2={W} y1={y(0)} y2={y(0)} />
          {steps.slice(0, -1).map((st, i) => (
            <line key={`c${i}`} data-c={i} className="br__link" x1={cx(i) + bw / 2} x2={cx(i + 1) - bw / 2} y1={y(st.to)} y2={y(st.to)} />
          ))}
          <line className="br__check" x1={cx(0) - bw / 2} x2={cx(n - 1) + bw / 2} y1={y(total)} y2={y(total)} />
          {steps.map((st, i) => {
            const lo = Math.min(st.from, st.to), hi = Math.max(st.from, st.to);
            const up = st.to >= st.from, d = st.to - st.from;
            const cls = st.kind === "total" ? "is-total" : up ? "is-up" : "is-down";
            return (
              <g key={st.key} data-k={st.key} className={cls}>
                <rect className="br__bar" x={cx(i) - bw / 2} y={y(hi)} width={bw} height={Math.max(1, y(lo) - y(hi))} />
                {st.kind === "delta" && <rect className="br__x" x={cx(i) - bw / 2} y={up ? y(hi) - 1 : y(lo) - 1} width={bw} height={2} />}
                <text className="br__v num" x={cx(i)} y={up ? y(hi) - 12 : y(lo) + 24} textAnchor="middle">{st.kind === "total" ? eur(st.to) : eur(d, { signed: true })}</text>
                <text className="br__l" x={cx(i)} y={H - bottom + 26} textAnchor="middle">{st.label}</text>
                {W >= 600 && <text className="br__n" x={cx(i)} y={H - bottom + 44} textAnchor="middle">{st.note}</text>}
              </g>
            );
          })}
        </svg>
      )}
    </div>
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
    // Chaque segment s'ouvre de bas en haut, à l'équerre, dans l'ordre de la part
    gsap.fromTo(segs, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.75, stagger: 0.05, ease: "power3.out", clearProps: "clipPath" });
    gsap.fromTo(el.querySelectorAll(".bd__strip b"), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05, delay: 0.35, ease: "power2.out" });
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
          {rows.map((g, i) => (
            <span key={g.key} style={{ flexGrow: g.share ?? 0, background: colorOf(g, i) }} title={`${g.label} · ${eur(g.revenue)}`}>
              {(g.share ?? 0) >= 0.07 && <b className="num" aria-hidden="true">{pct(g.share, { signed: false, digits: 0 })}</b>}
            </span>
          ))}
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
  const ref = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  // La courbe se trace au rythme du défilement : le temps avance quand on descend, une tête carrée marque le mois lu
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const apply = (p: number) => {
      const line = el.querySelector<SVGPathElement>(".chart path.draw"), area = el.querySelector<SVGPathElement>(".chart path.area");
      if (!line) return;
      const len = line.getTotalLength();
      line.style.strokeDasharray = p >= 0.999 ? "none" : `${len} ${len}`;
      line.style.strokeDashoffset = `${len * (1 - p)}`;
      if (area) area.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
      const h = head.current, svg = line.ownerSVGElement;
      if (h && svg) {
        const pt = line.getPointAtLength(len * p), o = svg.getBoundingClientRect(), b = el.getBoundingClientRect();
        h.style.opacity = p > 0.01 && p < 0.999 ? "1" : "0";
        h.style.transform = `translate(${pt.x + o.left - b.left}px, ${pt.y + o.top - b.top}px) rotate(45deg)`;
      }
    };
    const st = ScrollTrigger.create({ trigger: el, start: "top 88%", end: "bottom 60%", scrub: 0.6, onUpdate: (self) => apply(self.progress), onRefresh: (self) => apply(self.progress) });
    requestAnimationFrame(() => apply(st.progress));
    return () => st.kill();
  }, [r.trend]);
  return (
    <section className="rv__sec" aria-labelledby="h-tr">
      <Rise><div className="eyebrow home__eyebrow">Trajectoire</div></Rise>
      <Rise><h2 className="home__h2" id="h-tr">Le rythme annuel des revenus, mois après mois.</h2></Rise>
      <Rise><p className="home__lede">Encours de fin de mois multiplié par le taux de frais actuel de chaque part&nbsp;: la courbe isole l'effet des encours.</p></Rise>
      <div className="rv__chart tr" ref={ref}><TimeChart series={series} height={300} ariaLabel="Revenus de gestion annualisés, fin de mois" /><span className="tr__head" ref={head} aria-hidden="true" /></div>
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
