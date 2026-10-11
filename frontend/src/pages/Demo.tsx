/**
 * Démo — des pages par thème, du gérant au client :
 *   /demo                 l'ouverture et le sommaire
 *   /demo/<gestion>       une page par gestion (Valor, Fixed Income…) : performances 1 mois → 5 ans, encours, collecte,
 *                         souscriptions, zones, portefeuille
 *   /demo/ventes          les commerciaux côte à côte ; /demo/ventes/<périmètre> : une page par commercial
 *   /demo/banque-privee   ce que les clients détiennent, ce qu'ils investissent
 * Les pages portent un thème, jamais le nom d'une personne ; la personne est retrouvée telle qu'elle est écrite dans la
 * donnée (voir /api/demo) et nommée dans la page.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { ManagerBoard } from "../components/demo/ManagerBoard";
import { PrivateBank } from "../components/demo/PrivateBank";
import { SalesOverview, SalesPage } from "../components/demo/Sales";
import type { DemoPeople, SalesPerson } from "../components/demo/types";
import { JasmineMark } from "../components/JasmineLogo";
import { ErrorState, Loading } from "../components/ui";
import { useApi } from "../lib/api";
import { date as fdate } from "../lib/format";
import { gsap, SplitText } from "../lib/gsap";
import { prefersReducedMotion } from "../lib/motion";
import "../styles/demo.css";

const slugify = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";

type Page = { path: string; n: string; kicker: string; title: string; line: string; children?: Page[] };

function pagesOf(d: DemoPeople): Page[] {
  const out: Page[] = [];
  let n = 0;
  const num = () => String(++n).padStart(2, "0");
  d.gerants.forEach((g) => out.push({ path: `/demo/${slugify(g.label)}`, n: num(), kicker: "Gestion", title: g.label,
    line: "Performances de 1 mois à 5 ans, écart à l'indicateur, encours, collecte, souscriptions, zones, portefeuille" }));
  out.push({ path: "/demo/ventes", n: num(), kicker: "Commerciaux", title: "Ventes", line: "La collecte par zone et par pays, les clients et ce dans quoi ils sont investis",
    children: d.commerciaux.map((c) => ({ path: `/demo/ventes/${c.slug}`, n: "", kicker: "Ventes", title: c.theme, line: "" })) });
  out.push({ path: "/demo/banque-privee", n: num(), kicker: "Banque privée", title: "Banque privée", line: "Ce que les clients détiennent, ce qu'ils investissent" });
  return out;
}

/** Ordre de lecture de la démonstration (pour « page suivante »). */
const sequence = (pages: Page[]): Page[] => pages.flatMap((p) => [p, ...(p.children ?? [])]);

export default function Demo() {
  const { data, error } = useApi<DemoPeople>("/api/demo");
  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><Loading h={600} /></div>;
  const pages = pagesOf(data);
  const salesIndex = data.gerants.length + 1;
  return (
    <div className="dm">
      <DemoNav pages={pages} />
      <Routes>
        <Route index element={<Index data={data} pages={pages} />} />
        <Route path="ventes" element={<Shell pages={pages}><SalesOverview index={salesIndex} people={data.commerciaux} pageOf={(p) => `/demo/ventes/${p.slug}`} /></Shell>} />
        <Route path="ventes/:slug" element={<SalesRoute data={data} pages={pages} index={salesIndex} />} />
        <Route path="banque-privee" element={<Shell pages={pages}><PrivateBank index={salesIndex + 1} name={data.banque_privee.name} match={data.banque_privee.match} /></Shell>} />
        <Route path=":slug" element={<ManagerRoute data={data} pages={pages} />} />
      </Routes>
    </div>
  );
}

function ManagerRoute({ data, pages }: { data: DemoPeople; pages: Page[] }) {
  const { slug } = useParams();
  const i = data.gerants.findIndex((g) => slugify(g.label) === slug);
  if (i < 0) return <Navigate to="/demo" replace />;
  const g = data.gerants[i];
  return <Shell pages={pages}><ManagerBoard key={g.key} index={i + 1} label={g.label} name={g.name} match={g.match} /></Shell>;
}

function SalesRoute({ data, pages, index }: { data: DemoPeople; pages: Page[]; index: number }) {
  const { slug } = useParams();
  const person: SalesPerson | undefined = data.commerciaux.find((c) => c.slug === slug);
  if (!person) return <Navigate to="/demo/ventes" replace />;
  return <Shell pages={pages}><SalesPage key={person.slug} index={index} person={person} /></Shell>;
}

/** Corps d'une page thématique, avec la page précédente et la suivante en pied. */
function Shell({ pages, children }: { pages: Page[]; children: React.ReactNode }) {
  const loc = useLocation();
  const seq = sequence(pages);
  const i = seq.findIndex((p) => p.path === loc.pathname.replace(/\/$/, ""));
  const next = i >= 0 ? seq[i + 1] : undefined;
  const prev = i > 0 ? seq[i - 1] : undefined;
  return (
    <div className="dm__body">
      {children}
      <nav className="dm-next" aria-label="Pages voisines">
        {prev ? <Link to={prev.path} className="dm-next__prev"><span className="dm-next__k">← Précédente</span><span className="dm-next__t">{prev.title}</span></Link>
          : <Link to="/demo" className="dm-next__prev"><span className="dm-next__k">← Retour</span><span className="dm-next__t">Sommaire</span></Link>}
        {next ? <Link to={next.path} className="dm-next__go"><span className="dm-next__k">Page suivante →</span><span className="dm-next__t">{next.title}</span></Link>
          : <Link to="/demo" className="dm-next__go"><span className="dm-next__k">Fin de la démonstration →</span><span className="dm-next__t">Sommaire</span></Link>}
      </nav>
    </div>
  );
}

// ------------------------------------------------------------------ navigation par thème
function DemoNav({ pages }: { pages: Page[] }) {
  const loc = useLocation();
  const sales = pages.find((p) => p.children);
  const inSales = loc.pathname.startsWith("/demo/ventes");
  const on = ({ isActive }: { isActive: boolean }) => (isActive ? "is-on" : "");
  return (
    <nav className="dm-bar is-shown" aria-label="Pages de la démonstration">
      <ol>
        <li><NavLink to="/demo" end className={on}><span className="num">00</span><span className="dm-bar__t">Sommaire</span></NavLink></li>
        {pages.map((p) => (
          <li key={p.path}><NavLink to={p.path} end={!p.children} className={on}><span className="num">{p.n}</span><span className="dm-bar__t">{p.title}</span></NavLink></li>
        ))}
      </ol>
      {inSales && sales?.children && (
        <ol className="dm-bar__sub" aria-label="Pages Ventes">
          <li><NavLink to="/demo/ventes" end className={on}>Vue d'ensemble</NavLink></li>
          {sales.children.map((c) => <li key={c.path}><NavLink to={c.path} className={on}>{c.title}</NavLink></li>)}
        </ol>
      )}
    </nav>
  );
}

// ------------------------------------------------------------------ ouverture et sommaire
function Index({ data, pages }: { data: DemoPeople; pages: Page[] }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => { document.title = "Démo — Jasmin"; }, []);
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
        .fromTo(".dm-index > li", { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.07, clearProps: "transform" }, 1.1);
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
        <p className="dm-hero__lede">JUMP, Product Info, le passif et les inventaires, reliés. Une page par thème, du gérant au client.</p>
        <p className="dm-hero__meta small">Arrêté au {fdate(data.date)}{data.mock ? " · données fictives au schéma exact des tables" : ""} · vues nominatives calculées à la demande, jamais conservées</p>
        <ol className="dm-index">
          {pages.map((c) => (
            <li key={c.path}>
              <Link to={c.path}>
                <span className="dm-index__n num">{c.n}</span>
                <span className="dm-index__b"><span className="dm-index__k">{c.kicker}</span><span className="dm-index__t">{c.title}</span><span className="dm-index__l">{c.line}</span>
                  {c.children && <span className="dm-index__sub">{c.children.map((s) => <span key={s.path}>{s.title}</span>)}</span>}</span>
                <span className="dm-index__go" aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
