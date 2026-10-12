/**
 * Accueil, ouverture — l'application en un geste.
 *
 *   Ouverture   nuit, filet d'or qui balaie, le logo qui se déplie, les lettres d'EUREKA qui se rassemblent, quatre compteurs nourris par les
 *               données (encours, fonds, pays, revenus) ; au défilement, le mot s'ouvre et laisse passer la suite.
 *   Traversée   les sept espaces de l'application défilent à l'horizontale, épinglés au défilement (ScrollTrigger) :
 *               un chiffre réel, une phrase, un petit mouvement qui dit ce que fait l'espace, un lien pour y entrer.
 * Écran étroit ou animations réduites : les espaces s'empilent, tout reste lisible, rien n'est épinglé.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { eur, num } from "../lib/format";
import { gsap, ScrollTrigger } from "../lib/gsap";
import { prefersReducedMotion } from "../lib/motion";
import type { Overview } from "../lib/types";
import * as I from "./Icon";
import { EurekaMark } from "./EurekaLogo";

type Dist = { countries: { country: string }[]; n_shares_registered: number; clients?: { kind?: string; countries: unknown[] }[] };
type Props = { ov: Overview | null; dist: Dist | null; revenue: number | null; mock: boolean; date?: string; afterOpening?: ReactNode };

const WORD = "EUREKA";

export function HomeIntro({ ov, dist, revenue, mock, date, afterOpening }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const named = dist?.clients?.filter((c) => c.kind === "nommé") ?? [];
  const pairs = (named.length ? named : dist?.clients ?? []).reduce((s, c) => s + c.countries.length, 0);
  const counters = [
    { k: "aum", label: "d'encours sous gestion", v: ov?.aum ?? null, f: (v: number) => eur(v) },
    { k: "funds", label: "fonds · parts", v: ov ? ov.n_funds : null, f: (v: number) => `${Math.round(v)} · ${ov?.n_parts ?? "—"}` },
    { k: "cty", label: "pays de commercialisation", v: dist ? dist.countries.length : null, f: (v: number) => String(Math.round(v)) },
    { k: "rev", label: "de revenus de gestion par an", v: revenue, f: (v: number) => eur(v) },
  ];
  const spark = useMemo(() => {
    const pts = (ov?.series ?? []).slice(-260);
    if (pts.length < 2) return "";
    const vs = pts.map((p) => p.v), mn = Math.min(...vs), mx = Math.max(...vs);
    return pts.map((p, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * 300},${100 - ((p.v - mn) / (mx - mn || 1)) * 90 - 5}`).join("");
  }, [ov]);
  const ytd = ov?.var?.YTD;

  const SPACES = [
    { to: "/fonds", n: "Fonds", t: "Chaque fonds, dans le détail.", d: "Fiche, parts, performances, frais, ESG, risques et contrôles, pays d'enregistrement : à une recherche.",
      stat: ov ? `${ov.n_funds} fonds` : "—", sub: ov ? `${ov.n_parts} parts investies` : "", vis: "cards" },
    { to: "/encours", n: "Encours", t: "Ce qui grossit, ce qui décroche.", d: "La courbe des encours du jour à l'année, la collecte nette estimée et l'effet marché, par famille, gamme, gérant.",
      stat: ov ? eur(ov.aum) : "—", sub: ytd?.pct != null ? `${ytd.pct >= 0 ? "+" : ""}${(ytd.pct * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % depuis le 1er janvier` : "", vis: "line" },
    { to: "/portefeuilles", n: "Portefeuilles", t: "Ce que détiennent nos fonds.", d: "Les inventaires, ligne à ligne : instruments, classes d'actifs, devises, et quels fonds détiennent une ligne.",
      stat: "Inventaires", sub: "par fonds et pour toute la maison", vis: "mosaic" },
    { to: "/passif", n: "Passif", t: "Qui est investi dans quoi.", d: "Les clients par encours, leurs fonds et leurs parts ; segments, teneurs, pays, fidélité, mouvements.",
      stat: "Client → fonds", sub: "encours par client, par fonds, par part", vis: "links" },
    { to: "/distribution", n: "Distribution", t: "Qui peut souscrire, et où.", d: "Le parcours pays → clients → familles, la couverture, le globe, chaque pays de commercialisation.",
      stat: dist ? `${dist.countries.length} pays` : "—", sub: named.length ? `${named.length} clients nommés · ${num(pairs)} couples client-pays` : "autorisations actives", vis: "matrix" },
    { to: "/comparateur", n: "Comparateur", t: "Mettre les fonds face à face.", d: "VL base 100, performance, volatilité, perte maximale, Sharpe : jusqu'à six fonds, sur la période de votre choix.",
      stat: "6 fonds", sub: "côte à côte, en 3D ou en 2D", vis: "duel" },
    { to: "/export", n: "Export", t: "Vos données, prêtes pour Excel.", d: "Une ligne par enregistrement, des en-têtes explicites, de vrais nombres : un tableau structuré que Copilot lit directement.",
      stat: "13 sources", sub: "du jour à l'année, de la maison à la part", vis: "grid" },
  ];

  // Ouverture et traversée : installées une seule fois (les données arrivent ensuite, sans rejouer le rideau)
  const introAt = useRef(0);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || prefersReducedMotion()) return;
    introAt.current = performance.now();
    const mm = gsap.matchMedia();
    const ctx = gsap.context(() => {
      gsap.timeline({ defaults: { ease: "expo.out" } })
        .set(".nx__curtain", { autoAlpha: 1 })
        .fromTo(".nx__sweep", { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power4.inOut" }, 0.05)
        .to(".nx__sweep", { scaleY: 90, opacity: 0, duration: 0.65, ease: "power2.in" }, 0.62)
        .to(".nx__curtain", { autoAlpha: 0, duration: 0.5 }, 0.8)
        .fromTo(".nx__floor", { opacity: 0, rotateX: 88 }, { opacity: 1, rotateX: 72, duration: 2.4, ease: "power3.out" }, 0.7)
        .fromTo(".nx__mark", { opacity: 0, rotate: -150, scale: 0.3 }, { opacity: 1, rotate: 0, scale: 1, duration: 1.8, ease: "expo.out" }, 0.75)
        .fromTo(".nx__mark g", { scale: 0, svgOrigin: "50 50" }, { scale: 1, svgOrigin: "50 50", duration: 1.2, stagger: 0.09, ease: "back.out(1.4)" }, 0.85)
        .fromTo(".nx__l", { opacity: 0, yPercent: () => gsap.utils.random(-140, 140), xPercent: () => gsap.utils.random(-90, 90), rotate: () => gsap.utils.random(-28, 28), filter: "blur(16px)", scale: 1.6 },
          { opacity: 1, yPercent: 0, xPercent: 0, rotate: 0, filter: "blur(0px)", scale: 1, duration: 1.6, stagger: { each: 0.07, from: "center" } }, 0.9)
        .fromTo(".nx__rule", { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: "power3.inOut" }, 1.7)
        .fromTo(".nx__kicker", { opacity: 0, letterSpacing: "0.7em" }, { opacity: 1, letterSpacing: "0.26em", duration: 1.6, ease: "power2.out" }, 1.6)
        .fromTo(".nx__tag", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 1, clearProps: "transform" }, 2.0)
        .fromTo(".nx__c", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 1, stagger: 0.1, clearProps: "transform" }, 2.2)
        .fromTo(".nx__cue", { opacity: 0 }, { opacity: 1, duration: 0.8 }, 3.0);
      // Au défilement, le mot s'ouvre et la scène s'éloigne
      gsap.timeline({ scrollTrigger: { trigger: ".nx", start: "top top", end: "bottom top", scrub: 0.6 } })
        .fromTo(".nx__word", { letterSpacing: "0.06em", scale: 1 }, { letterSpacing: "0.5em", scale: 1.18, opacity: 0, ease: "none", immediateRender: false }, 0)
        .to(".nx__floor", { y: 120, opacity: 0.2, ease: "none" }, 0)
        .to(".nx__counters, .nx__tag, .nx__kicker", { y: -60, opacity: 0, ease: "none" }, 0);
    }, el);
    mm.add("(min-width: 900px)", () => {
      const track = el.querySelector<HTMLElement>(".sp__track");
      const wrap = el.querySelector<HTMLElement>(".sp");
      if (!track || !wrap) return;
      const dist = () => track.scrollWidth - window.innerWidth;
      const move = gsap.to(track, { x: () => -dist(), ease: "none",
        scrollTrigger: { trigger: wrap, start: "top top", end: () => `+=${dist()}`, pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1,
          onUpdate: (st) => gsap.set(".sp__prog i", { scaleX: st.progress }) } });
      el.querySelectorAll<HTMLElement>(".sp__p").forEach((p) => {
        // Chaque panneau n'a pas toutes les pièces (pas de visuel, pas de grand chiffre) : on n'anime que ce qui existe
        const tl = gsap.timeline({ scrollTrigger: { trigger: p, containerAnimation: move, start: "left 78%", toggleActions: "play none none reverse" }, defaults: { ease: "expo.out" } });
        const add = (sel: string, from: gsap.TweenVars, to: gsap.TweenVars, at: number) => {
          const t = p.querySelectorAll(sel);
          if (t.length) tl.fromTo(t, from, to, at);
        };
        add(".sp__n, .sp__t, .sp__d", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.07 }, 0);
        add(".sp__stat, .sp__sub, .sp__go", { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.8, stagger: 0.07 }, 0.15);
        add(".vz i", { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, stagger: { each: 0.012, from: "random" } }, 0.1);
        add(".vz path", { strokeDashoffset: 400 }, { strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut" }, 0.1);
        const big = p.querySelector(".sp__big");
        if (big) gsap.fromTo(big, { xPercent: 18 }, { xPercent: -18, ease: "none", scrollTrigger: { trigger: p, containerAnimation: move, start: "left right", end: "right left", scrub: true } });
      });
    });
    return () => { ctx.revert(); mm.revert(); };
  }, []);

  // Compteurs : de zéro au chiffre réel, chacun dès que sa donnée arrive (après le rideau)
  const counted = useRef(new Set<string>());
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const tws: gsap.core.Tween[] = [];
    el.querySelectorAll<HTMLElement>(".nx__cv[data-v]").forEach((n, i) => {
      const key = n.dataset.k!, c = counters.find((x) => x.k === key);
      if (!c || c.v == null || counted.current.has(key)) return;
      counted.current.add(key);
      if (prefersReducedMotion()) return;
      const o = { v: 0 }, wait = Math.max(0, 2.3 - (performance.now() - introAt.current) / 1000);
      n.textContent = c.f(0);
      tws.push(gsap.to(o, { v: c.v, duration: 2.2, delay: wait + i * 0.1, ease: "expo.out", onUpdate: () => { n.textContent = c.f(o.v); }, onComplete: () => { n.textContent = c.f(c.v!); } }));
    });
    requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => tws.forEach((t) => t.progress(1).kill());
  }, [ov?.aum, ov?.n_funds, dist?.countries.length, revenue]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={root} className="nxw">
      <section className="nx" aria-labelledby="h-nexus">
        <div className="nx__stage" aria-hidden="true"><div className="nx__floor" /></div>
        <div className="nx__glow" aria-hidden="true" />
        <div className="nx__in">
          <div className="eyebrow nx__kicker">Rothschild &amp; Co Asset Management{date ? ` · au ${new Date(`${date}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" })}` : ""}{mock ? " · données fictives" : ""}</div>
          <div className="nx__mark" aria-hidden="true"><EurekaMark size={124} /></div>
          <h1 className="nx__word" id="h-nexus" aria-label="Eureka">{WORD.split("").map((c, i) => <span key={i} className="nx__l" aria-hidden="true">{c}</span>)}</h1>
          <i className="nx__rule" aria-hidden="true" />
          <p className="nx__tag">Toutes les données de la maison, reliées&nbsp;: fonds, encours, distribution, passif, portefeuilles — et ce qu'ils rapportent.</p>
          <dl className="nx__counters">
            {counters.map((c) => (
              <div key={c.k} className="nx__c">
                <dd className="nx__cv num" data-k={c.k} data-v={c.v ?? undefined}>{c.v != null ? c.f(c.v) : "—"}</dd>
                <dt>{c.label}</dt>
              </div>
            ))}
          </dl>
        </div>
        <div className="nx__cue" aria-hidden="true"><span>Rothschild & Co City</span><i /></div>
        <div className="nx__curtain" aria-hidden="true"><i className="nx__sweep" /></div>
      </section>

      <div className="nxw__after">{afterOpening}</div>
      <section className="sp" aria-label="Les espaces de l'application">
        <div className="sp__hd"><span className="eyebrow">L'application</span><span className="sp__prog" aria-hidden="true"><i /></span><span className="sp__cnt small">7 espaces</span></div>
        <div className="sp__track">
          {SPACES.map((s, i) => (
            <article key={s.to} className="sp__p">
              <span className="sp__big" aria-hidden="true">{s.n}</span>
              <div className="sp__txt">
                <span className="sp__n num">{String(i + 1).padStart(2, "0")} · {s.n}</span>
                <h2 className="sp__t">{s.t}</h2>
                <p className="sp__d">{s.d}</p>
              </div>
              <div className="sp__side">
                <Vis kind={s.vis} spark={spark} />
                <b className="sp__stat num">{s.stat}</b>
                <span className="sp__sub small">{s.sub}</span>
                <Link to={s.to} className="sp__go">Entrer dans {s.n} <I.Arrow size={16} /></Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Petits mouvements, un par espace : formes à l'équerre (carrés, traits), jamais de disques. */
function Vis({ kind, spark }: { kind: string; spark: string }) {
  if (kind === "matrix") return <div className="vz vz--matrix" aria-hidden="true">{Array.from({ length: 96 }, (_, i) => <i key={i} className={(i * 37) % 7 < 3 ? "on" : ""} />)}</div>;
  if (kind === "cards") return <div className="vz vz--cards" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} style={{ ["--k" as string]: i }} />)}</div>;
  if (kind === "line") return <svg className="vz vz--line" viewBox="0 0 300 100" aria-hidden="true"><path d={spark || "M0,80 L60,70 L120,60 L180,45 L240,40 L300,20"} pathLength={400} strokeDasharray={400} /></svg>;
  if (kind === "mosaic") return <div className="vz vz--mosaic" aria-hidden="true">{[34, 22, 14, 10, 8, 6, 4, 2].map((w, i) => <i key={i} style={{ flexGrow: w }} />)}</div>;
  if (kind === "links") return (
    <svg className="vz vz--links" viewBox="0 0 300 100" aria-hidden="true">
      {[10, 30, 50, 70, 90].map((y, i) => [20, 50, 80].map((y2, j) => (i + j) % 2 === 0 && <path key={`${i}${j}`} d={`M20,${y} C150,${y} 150,${y2} 280,${y2}`} pathLength={400} strokeDasharray={400} />))}
    </svg>
  );
  if (kind === "duel") return <svg className="vz vz--duel" viewBox="0 0 300 100" aria-hidden="true"><path d="M0,70 L50,62 L100,66 L150,44 L200,40 L250,30 L300,22" pathLength={400} strokeDasharray={400} /><path className="b" d="M0,70 L50,74 L100,58 L150,60 L200,52 L250,55 L300,40" pathLength={400} strokeDasharray={400} /></svg>;
  return <div className="vz vz--grid" aria-hidden="true">{Array.from({ length: 48 }, (_, i) => <i key={i} className={i < 6 ? "h" : ""} />)}</div>;
}
