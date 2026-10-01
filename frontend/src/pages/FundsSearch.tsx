import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../lib/context";
import { famHex } from "../lib/families";
import { useReducedMotion, webglAvailable } from "../lib/motion";
import { SearchResults, useResultNav } from "../components/SearchResults";
import * as I from "../components/Icon";
import { useReveal } from "../components/ui";
import type { KeyboardScene as KS } from "../three/KeyboardScene";
import { FundsRiskControls } from "../components/RiskPanels";

/** Rubrique Fonds : la recherche (clavier 3D), puis les risques et les contrôles de tous les fonds. */
export default function FundsSearch() {
  const { index, entries, closePalette } = useApp();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const kb = useRef<KS | null>(null);
  const reduced = useReducedMotion();
  const nav = useNavigate();
  const dq = useDeferredValue(q);
  const results = useMemo(() => (index && dq.trim() ? index.search(dq) : null), [index, dq]);
  const { active, setActive, onKeyDown, flat } = useResultNav(results, () => undefined);
  const nFunds = entries.filter((e) => e.t === "fonds" && (e.aum ?? 0) > 0).length;
  const qRef = useRef(q);
  qRef.current = q;
  const loc = useLocation();

  useEffect(() => { closePalette(); if (!loc.hash) input.current?.focus(); }, [closePalette, loc.hash]);
  // Ancre (#risques, #ctl-…) : défilement une fois la section rendue
  useEffect(() => {
    if (!loc.hash) return;
    let n = 0;
    const t = window.setInterval(() => {
      const el = document.getElementById(decodeURIComponent(loc.hash.slice(1)));
      if (el || ++n > 40) { window.clearInterval(t); el?.scrollIntoView({ block: "start" }); }
    }, 150);
    return () => window.clearInterval(t);
  }, [loc.hash, loc.search]);
  useReveal(1);

  useEffect(() => {
    if (!host.current || !webglAvailable()) return;
    let alive = true;
    import("../three/KeyboardScene").then(({ KeyboardScene }) => {
      if (!alive || !host.current) return;
      kb.current = new KeyboardScene(host.current, {
        reduced,
        onVirtualKey: (k) => {
          if (k === "Backspace") setQ((v) => v.slice(0, -1));
          else if (k === "Enter") input.current?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          else setQ((v) => v + k);
          input.current?.focus();
        },
      });
    });
    return () => { alive = false; kb.current?.dispose(); kb.current = null; };
  }, [reduced]);

  // Le clavier suit la frappe physique
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (!e.metaKey && !e.ctrlKey) kb.current?.press(e.code); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // Couleur de l'onde = famille du meilleur résultat
  useEffect(() => {
    const top = results?.hits[0]?.entry.family;
    kb.current?.setAccent(top ? famHex(top, true) : "#c8a15a");
  }, [results]);

  const has = !!results;
  return (
    <>
    <section className={`kbd${has ? " has-results" : ""}`} aria-label="Rechercher un fonds">
      <div className="kbd__stage" ref={host} />
      <div className="kbd__glow" aria-hidden="true" />
      <div className="kbd__top">
        <h1 className="kbd__title hero-title">Quel fonds cherchez-vous&nbsp;?</h1>
        <div className="kbd__bar">
          <I.Search size={22} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { onKeyDown(e); if (e.key === "Escape") setQ(""); }}
            placeholder="Nom, ISIN, gérant, gamme, pays…" aria-label="Rechercher un fonds, une part, un ISIN, un gérant, une gamme ou un pays"
            role="combobox" aria-expanded={has} aria-controls="kbd-list" aria-activedescendant={flat.length ? `kbd-${active}` : undefined}
            autoComplete="off" spellCheck={false} />
          {q && <button type="button" className="kbd__clear" onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Effacer"><I.Close size={18} /></button>}
        </div>
        <div className="kbd__hint small">
          {has ? <span>{results!.answer ? "Réponse directe" : results!.hits.length ? `${results!.hits.length} résultat${results!.hits.length > 1 ? "s" : ""}` : "Aucun résultat"} · <kbd>↑</kbd><kbd>↓</kbd> puis <kbd>Entrée</kbd></span>
            : <span>Tolérante aux accents et aux fautes · essayez « <button type="button" className="link" onClick={() => setQ("article 9 italie")}>article 9 italie</button> » ou « <button type="button" className="link" onClick={() => setQ("vaseur")}>vaseur</button> »</span>}
          <Link to="/selection" className="link kbd__all" onClick={(e) => { e.preventDefault(); nav("/selection"); }}>Parcourir les {nFunds || ""} fonds <I.Arrow size={13} /></Link>
        </div>
        {has && (
          <div className="kbd__results">
            <SearchResults results={results} active={active} setActive={setActive} onGo={() => undefined} night idPrefix="kbd" />
          </div>
        )}
      </div>
      <a href="#risques" className="kbd__down" onClick={(e) => { e.preventDefault(); document.getElementById("risques")?.scrollIntoView({ behavior: "smooth" }); }}>
        Risques &amp; contrôles des fonds <I.Arrow size={14} />
      </a>
    </section>
    <FundsRiskControls />
    </>
  );
}
