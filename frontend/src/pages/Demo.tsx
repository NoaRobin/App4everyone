/**
 * Démo — la page de présentation : cinq chapitres, du gérant au client.
 *   01–02  Les gérants (Valor, Fixed Income) : performances 1 mois → 5 ans, encours, collecte, souscriptions, zones, portefeuille.
 *   03     Rothschild City, version collecte : qui collecte, qui décollecte, sur 1 mois, YTD, 1, 3 et 5 ans.
 *   04     Les commerciaux : collecte par zone et par période, leurs clients et ce dans quoi ils sont investis.
 *   05     La banque privée : ce que les clients détiennent, ce qu'ils investissent.
 * Les personnes sont retrouvées telles qu'elles sont écrites dans la donnée (voir /api/demo).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FlowCity } from "../components/demo/FlowCity";
import { ManagerBoard } from "../components/demo/ManagerBoard";
import { PrivateBank } from "../components/demo/PrivateBank";
import { Sales } from "../components/demo/Sales";
import type { DemoPeople } from "../components/demo/types";
import { JasmineMark } from "../components/JasmineLogo";
import { ErrorState, Loading } from "../components/ui";
import { useApi } from "../lib/api";
import { date as fdate } from "../lib/format";
import { gsap, SplitText } from "../lib/gsap";
import { prefersReducedMotion } from "../lib/motion";
import "../styles/demo.css";

type Chapter = { id: string; n: string; kicker: string; title: string; line: string };

export default function Demo() {
  const { data, error } = useApi<DemoPeople>("/api/demo");
  useEffect(() => { document.title = "Démo — Jasmin"; }, []);
  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><Loading h={600} /></div>;
  const chapters: Chapter[] = [
    ...data.gerants.map((g, i) => ({ id: `gerant-${i + 1}`, n: String(i + 1).padStart(2, "0"), kicker: `Gestion · ${g.label}`, title: g.match.found ?? g.name,
      line: "Performances de 1 mois à 5 ans, encours, collecte, souscriptions, zones, portefeuille" })),
    { id: "cite", n: String(data.gerants.length + 1).padStart(2, "0"), kicker: "Rothschild City", title: "La cité de la collecte", line: "Qui collecte, qui décollecte : 1 mois, YTD, 1, 3 et 5 ans" },
    { id: "commerciaux", n: String(data.gerants.length + 2).padStart(2, "0"), kicker: "Commerciaux", title: data.commerciaux.map((c) => (c.match.found ?? c.name).split(" ")[0]).join(" · "),
      line: "La collecte par zone, leurs clients et ce dans quoi ils sont investis" },
    { id: "banque-privee", n: String(data.gerants.length + 3).padStart(2, "0"), kicker: "Banque privée", title: data.banque_privee.match.found ?? data.banque_privee.name,
      line: "Ce que ses clients détiennent, ce qu'ils investissent" },
  ];
  return (
    <div className="dm">
      <Hero data={data} chapters={chapters} />
      <ChapterBar chapters={chapters} />
      <div className="dm__body">
        {data.gerants.map((g, i) => <ManagerBoard key={g.key} index={i + 1} label={g.label} name={g.name} match={g.match} />)}
        <FlowCity index={data.gerants.length + 1} />
        <Sales index={data.gerants.length + 2} people={data.commerciaux} />
        <PrivateBank index={data.gerants.length + 3} name={data.banque_privee.name} match={data.banque_privee.match} />
        <footer className="dm-end">
          <JasmineMark size={56} />
          <p className="dm-end__t">Toutes les données de la maison, au même endroit.</p>
          <p className="small muted">{data.mock ? "Données fictives au schéma exact des tables. " : ""}Arrêté JUMP au {fdate(data.date)}. Vues nominatives calculées à la demande dans la source, jamais conservées.</p>
        </footer>
      </div>
    </div>
  );
}

function Hero({ data, chapters }: { data: DemoPeople; chapters: Chapter[] }) {
  const root = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const split = new SplitText(".dm-hero__t", { type: "chars,words" });
      gsap.timeline({ defaults: { ease: "expo.out" } })
        .fromTo(".dm-hero__mark", { opacity: 0, rotate: -120, scale: 0.4 }, { opacity: 1, rotate: 0, scale: 1, duration: 1.6 }, 0)
        .fromTo(".dm-hero__mark g", { scale: 0, svgOrigin: "50 50" }, { scale: 1, svgOrigin: "50 50", duration: 1.1, stagger: 0.08, ease: "back.out(1.5)" }, 0.15)
        .fromTo(split.chars, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.1, stagger: 0.025 }, 0.3)
        .fromTo(".dm-hero__rule", { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: "power3.inOut" }, 0.7)
        .fromTo(".dm-hero__k, .dm-hero__lede, .dm-hero__meta", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.08, clearProps: "transform" }, 0.9)
        .fromTo(".dm-index li", { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.07, clearProps: "transform" }, 1.1);
      return () => split.revert();
    }, el);
    return () => ctx.revert();
  }, []);
  return (
    <section ref={root} className="dm-hero" aria-labelledby="h-demo">
      <div className="dm-hero__bg" aria-hidden="true" />
      <div className="dm-hero__in">
        <span className="dm-hero__mark"><JasmineMark size={64} title="Jasmin" style={{ display: "block" }} /></span>
        <div className="dm-hero__k eyebrow">Rothschild &amp; Co Asset Management · démonstration{data.mock ? " · données fictives" : ""}</div>
        <h1 className="dm-hero__t" id="h-demo">Du gérant au client, en&nbsp;un&nbsp;seul&nbsp;endroit.</h1>
        <i className="dm-hero__rule" aria-hidden="true" />
        <p className="dm-hero__lede">JUMP, Product Info, le passif et les inventaires, reliés. Cinq chapitres, cinq points de vue sur la même maison.</p>
        <p className="dm-hero__meta small">Arrêté au {fdate(data.date)}</p>
        <ol className="dm-index">
          {chapters.map((c) => (
            <li key={c.id}>
              <a href={`#${c.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(c.id)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }); }}>
                <span className="dm-index__n num">{c.n}</span>
                <span className="dm-index__b"><span className="dm-index__k">{c.kicker}</span><span className="dm-index__t">{c.title}</span><span className="dm-index__l">{c.line}</span></span>
                <span className="dm-index__go" aria-hidden="true">→</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
function ChapterBar({ chapters }: { chapters: Chapter[] }) {
  const [cur, setCur] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [prog, setProg] = useState(0);
  useEffect(() => {
    const els = chapters.map((c) => document.getElementById(c.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setCur(vis[0].target.id);
    }, { rootMargin: "-30% 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    const onScroll = () => {
      const first = els[0];
      setShown(!!first && first.getBoundingClientRect().top < window.innerHeight * 0.5);
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setProg(h > 0 ? window.scrollY / h : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, [chapters]);
  return (
    <nav className={`dm-bar${shown ? " is-shown" : ""}`} aria-label="Chapitres de la démonstration">
      <ol>
        {chapters.map((c) => (
          <li key={c.id}>
            <a href={`#${c.id}`} aria-current={cur === c.id ? "true" : undefined} className={cur === c.id ? "is-on" : ""}
              onClick={(e) => { e.preventDefault(); document.getElementById(c.id)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }); }}>
              <span className="num">{c.n}</span><span className="dm-bar__t">{c.title}</span>
            </a>
          </li>
        ))}
      </ol>
      <i className="dm-bar__p" style={{ transform: `scaleX(${prog})` }} aria-hidden="true" />
    </nav>
  );
}
