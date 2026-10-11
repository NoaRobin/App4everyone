import { useEffect, useRef, useState } from "react";
import { magnetic } from "../lib/gsap";
import { Link, NavLink, useLocation } from "react-router-dom";
import * as I from "./Icon";
import { JasmineMark } from "./JasmineLogo";
import { useApp } from "../lib/context";
import { date as fdate } from "../lib/format";
import { motionPaused, setMotionPaused, useReducedMotion } from "../lib/motion";

const NAV = [
  { to: "/fonds", label: "Fonds" },
  { to: "/encours", label: "Encours" },
  { to: "/portefeuilles", label: "Portefeuilles" },
  { to: "/passif", label: "Passif" },
  { to: "/distribution", label: "Distribution" },
  { to: "/comparateur", label: "Comparateur" },
  { to: "/export", label: "Export" },
  { to: "/demo", label: "Démo" },
];

export function Header() {
  const { meta, asOf, date, setDate, openPalette } = useApp();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenu(false), [loc.pathname]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const searchBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => magnetic(searchBtn.current, 0.18), []);
  const pano = loc.pathname === "/";
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header className={`hdr hdr--night${scrolled ? " is-scrolled" : ""}${pano ? " hdr--pano" : ""}`}>
      <a href="#contenu" className="skip-link">Aller au contenu</a>
      <div className="hdr__in">
        <Link to="/" className="brand brand--jasmine" aria-label="Jasmin, Rothschild & Co Asset Management — accueil">
          <JasmineMark size={34} style={{ flex: "none" }} />
          <span className="brand__txt">
            <span className="brand__name">Jasmin</span>
            <span className="brand__sub">Rothschild &amp; Co · Asset Management</span>
          </span>
        </Link>
        <nav className="spaces" aria-label="Espaces">
          <Link to="/" className={`spaces__a${pano ? " is-on" : ""}`} aria-current={pano ? "page" : undefined}>Accueil</Link>
          <Link to="/metiers" className={`spaces__a${!pano ? " is-on" : ""}`} aria-current={loc.pathname === "/metiers" ? "page" : undefined}><span className="spaces__x">Espace </span>métiers</Link>
          <span className="spaces__k" aria-hidden="true" data-on={pano ? "0" : "1"} />
        </nav>
        {!pano && (
          <nav aria-label="Navigation de l'espace métiers" className={`nav${menu ? " is-open" : ""}`}>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav__a${isActive ? " is-active" : ""}`}>{n.label}</NavLink>
            ))}
          </nav>
        )}
        <div className="hdr__tools">
          <MotionToggle />
          <button ref={searchBtn} type="button" className="hdr__search" onClick={() => openPalette()} aria-label="Rechercher un fonds, une part, un ISIN, un gérant…">
            <I.Search size={17} />
            <span className="hdr__search-t">Rechercher</span>
            <kbd>{isMac ? "⌘" : "Ctrl"} K</kbd>
          </button>
          {asOf && meta && (
            <label className={`asof${date ? " is-past" : ""}`} title="Date d'arrêté des données">
              <I.Calendar size={15} />
              <span className="sr-only">Date d'arrêté</span>
              <span className="asof__t" aria-hidden="true">{fdate(asOf)}</span>
              <input type="date" value={asOf} min={meta.first_date} max={meta.last_date}
                onChange={(e) => e.target.value && setDate(e.target.value)} aria-label={`Date d'arrêté des données, actuellement le ${fdate(asOf)}`} />
            </label>
          )}
          {meta?.is_mock && <span className="mockbadge" title="L'application tourne sur des données fictives au schéma exact du Lakehouse">Données fictives</span>}
          {!pano && <button type="button" className="hdr__burger" aria-expanded={menu} aria-label="Menu" onClick={() => setMenu((m) => !m)}><span /><span /></button>}
        </div>
      </div>
      {date && (
        <div className="pastbar" role="status">
          Vous consultez les données au <b>{fdate(date)}</b>.
          <button type="button" className="link" onClick={() => setDate(null)}>Revenir au dernier arrêté ({meta && fdate(meta.last_date)})</button>
        </div>
      )}
    </header>
  );
}

/** Pause des animations décoratives (rotations, particules, défilements) : toujours au même endroit, mémorisée. */
function MotionToggle() {
  const reduced = useReducedMotion();
  const [off, setOff] = useState(motionPaused());
  const sys = reduced && !off;
  return (
    <button type="button" className="hdr__motion" aria-pressed={off || sys} disabled={sys} data-touch
      onClick={() => { setMotionPaused(!off); setOff(!off); }}
      title={sys ? "Animations réduites par votre système" : off ? "Reprendre les animations" : "Mettre en pause les animations"}
      aria-label={off ? "Reprendre les animations" : "Mettre en pause les animations"}>
      {off || sys
        ? <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        : <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" /></svg>}
    </button>
  );
}
