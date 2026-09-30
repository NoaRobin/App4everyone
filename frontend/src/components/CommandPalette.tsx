import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as I from "./Icon";
import { useApp } from "../lib/context";
import { SearchResults, useResultNav } from "./SearchResults";

const SUGGESTIONS = ["Europe Valeur", "article 9 italie", "encours fixed income", "Claire Vasseur", "Luxembourg", "FRDEMO"];

/** Recherche universelle accessible de partout (⌘K / Ctrl K / « / »). */
export function CommandPalette() {
  const { index, paletteOpen, closePalette, openPalette, paletteSeed } = useApp();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const last = useRef<HTMLElement | null>(null);
  const nav = useNavigate();
  const results = useMemo(() => (index && q.trim() ? index.search(q) : null), [index, q]);
  const { active, setActive, onKeyDown, flat } = useResultNav(results, closePalette);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); paletteOpen ? closePalette() : openPalette(); }
      else if (e.key === "/" && !typing && !paletteOpen) { e.preventDefault(); openPalette(); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [paletteOpen, openPalette, closePalette]);

  useEffect(() => {
    if (paletteOpen) {
      last.current = document.activeElement as HTMLElement;
      setQ(paletteSeed);
      requestAnimationFrame(() => input.current?.focus());
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      last.current?.focus?.();
    }
  }, [paletteOpen, paletteSeed]);

  if (!paletteOpen) return null;
  return (
    <div className="pal" role="dialog" aria-modal="true" aria-label="Recherche universelle" onMouseDown={(e) => e.target === e.currentTarget && closePalette()}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); closePalette(); }
        if (e.key === "Tab") { e.preventDefault(); input.current?.focus(); }
      }}>
      <div className="pal__box">
        <div className="pal__bar">
          <I.Search size={20} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Fonds, part, ISIN, gérant, gamme, pays… ou « article 9 italie »"
            role="combobox" aria-expanded={!!results} aria-controls="pal-list" aria-activedescendant={flat.length ? `pal-${active}` : undefined}
            aria-autocomplete="list" autoComplete="off" spellCheck={false} />
          <button type="button" className="pal__close" onClick={closePalette} aria-label="Fermer la recherche"><kbd>Échap</kbd></button>
        </div>
        {results ? (
          <SearchResults results={results} active={active} setActive={setActive} onGo={closePalette} idPrefix="pal" />
        ) : (
          <div className="pal__hint">
            <div className="eyebrow">Essayez</div>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip" onClick={() => setQ(s)}>{s}</button>)}
            </div>
            <div className="pal__keys small muted">
              <span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span><span><kbd>Entrée</kbd> ouvrir</span><span><kbd>Échap</kbd> fermer</span>
              <button type="button" className="link" onClick={() => { closePalette(); nav("/fonds"); }}>Ouvrir le clavier de recherche</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
