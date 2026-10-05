/**
 * Passif — qui détient nos fonds, d'où, depuis quand, et comment l'encours bouge.
 * Comptes (référentiel des teneurs), positions (photo de l'encours à la dernière date valide), transactions (60 derniers
 * jours ouvrés). Uniquement des parts (%) et des tranches : aucun nom, aucun montant, aucun flux net, aucun groupe de moins de 5.
 * Chaque titre énonce le fait principal, calculé sur les données publiées ; une donnée absente affiche sa raison.
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { gsap } from "../lib/gsap";
import { prefersReducedMotion } from "../lib/motion";
import { ErrorState, Loading, useReveal } from "../components/ui";
import * as I from "../components/Icon";
import { arr, dFull, fp, tr, type PassifResp } from "../components/PassifKit";
import {
  AssetsSection, ClientsSection, ConcentrationSection, LectureSection, LoyaltySection, RhythmSection, SegmentsSection, WhereSection,
} from "../components/PassifSections";
import "../styles/passif.css";

const CHAPTERS = [["seg", "Segments"], ["ou", "Teneurs et pays"], ["conc", "Concentration"], ["loy", "Fidélité"], ["quoi", "Ce qui est détenu"],
  ["flux", "Mouvements"], ["clients", "Clients et fonds"], ["lecture", "Lecture des tables"]] as const;

export default function Passif() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    let n = 0;
    const t = window.setInterval(() => {                 // la section apparaît une fois les données chargées
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el || ++n > 40) {
        window.clearInterval(t);
        el?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      }
    }, 100);
    return () => window.clearInterval(t);
  }, [hash]);
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
        <SegmentsSection s={d.synthese} p={d.positions} t={d.transactions} />
        <WhereSection s={d.synthese} />
        <ConcentrationSection p={d.positions} />
        <LoyaltySection p={d.positions} />
        <AssetsSection s={d.synthese} p={d.positions} />
        <RhythmSection s={d.synthese} t={d.transactions} />
        <ClientsSection funds={d.funds} />
        <LectureSection l={d.lecture} asOf={d.positions_as_of} t={d.transactions} c={d.comptes} />
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

// ================================================================== ouverture : quatre faits
function Hero({ d }: { d: PassifResp }) {
  const ref = useRef<HTMLElement>(null);
  const p = d.positions, t = d.transactions;
  const top = arr(d.synthese?.segments)[0];
  const p10 = arr(p?.concentration?.points).find((x) => x.top_pct === 10);
  const old = arr(p?.seniority).filter((b) => /3 à 5|5 à 10|Plus de 10/.test(b.band)).reduce((s, b) => s + b.pct, 0);
  const sens = new Map(arr(t?.period_sens).map((x) => [x.sens, x.pct]));
  const facts = [
    top && { v: fp(top.encours_pct), l: <>de l'encours est détenu par les <b>{(top.label ?? top.key).toLowerCase()}</b>, premier segment</> },
    p10 && { v: fp(p10.pct), l: <>de l'encours est détenu par les <b>10&nbsp;%</b> de comptes les plus importants</> },
    old > 0 && { v: fp(Math.round(old * 10) / 10), l: <>de l'encours est investi depuis <b>plus de trois ans</b></> },
    t?.available && sens.size > 0 && { v: fp(sens.get("Souscription")), l: <>du volume des {t.n_days ?? 60} derniers jours ouvrés sont des <b>souscriptions</b>, {fp(sens.get("Rachat"))} des rachats</> },
  ].filter(Boolean) as { v: string; l: ReactNode }[];
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.timeline({ defaults: { ease: "expo.out" } })
        .fromTo(".pa-h__rule", { scaleX: 0 }, { scaleX: 1, duration: 1.1, transformOrigin: "left center", ease: "power3.inOut" }, 0)
        .fromTo(".pa-h__title span", { yPercent: 105 }, { yPercent: 0, duration: 1.1, stagger: 0.08 }, 0.1)
        .fromTo(".pa-h__lede, .pa-h__src", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.08, clearProps: "transform" }, 0.5)
        .fromTo(".pa-h__fact", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.1, clearProps: "transform" }, 0.7)
        .fromTo(".pa-h__nav a", { opacity: 0 }, { opacity: 1, duration: 0.5, stagger: 0.04 }, 1.1);
    }, el);
    return () => ctx.revert();
  }, []);
  return (
    <header className="pa-h" ref={ref}>
      <div className="pa-h__in">
        <div className="eyebrow pa-hero__eyebrow">Passif · photo de l'encours au {dFull(d.positions_as_of)}{d.source === "synthétique" ? " · données synthétiques" : " · Fabric"}</div>
        <i className="pa-h__rule" aria-hidden="true" />
        <h1 className="pa-h__title"><span>Qui détient</span> <span>nos fonds.</span></h1>
        <p className="pa-h__lede">Les comptes de nos teneurs, leurs positions et soixante jours d'opérations, agrégés dans Fabric&nbsp;: uniquement des parts et des tranches, aucun nom ni montant ne quitte la source.</p>
        <p className="small muted pa-h__src">{tr(d.comptes?.total, "comptes")} · {tr(p?.total, "positions")} · {tr(t?.ops, "opérations")} · agrégats rafraîchis le {d.refreshed_at ? dFull(d.refreshed_at.slice(0, 10)) : "—"}</p>
        {facts.length > 0 && (
          <ol className="pa-h__facts">
            {facts.map((f, i) => <li key={i} className="pa-h__fact"><b className="num">{f.v}</b><span>{f.l}</span></li>)}
          </ol>
        )}
        <nav className="pa-h__nav" aria-label="Sections du passif">
          {CHAPTERS.map(([id, l], i) => <a key={id} href={`#h-${id}`}><span className="num">{String(i + 1).padStart(2, "0")}</span>{l}</a>)}
        </nav>
      </div>
    </header>
  );
}
