import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import * as I from "./Icon";
import { searchFiche, type FicheEntry } from "../lib/fiche";
import { prefersReducedMotion } from "../lib/motion";

/** Ramène l'information trouvée à l'écran et la souligne d'un halo doré. */
export function revealAnchor(anchor: string) {
  const fallback = anchor.startsWith("part-") ? "parts" : anchor.startsWith("f-") ? "caracteristiques" : anchor;
  const el = document.getElementById(anchor) ?? document.getElementById(fallback);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 150;
  window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  el.classList.remove("is-flash");
  void el.offsetWidth;
  el.classList.add("is-flash");
  window.setTimeout(() => el.classList.remove("is-flash"), 2200);
}

/**
 * « Une question sur ce fonds ? » — recherche instantanée dans toutes les informations de la fiche.
 * Raccourci « / » lorsque la barre est visible (la recherche universelle reste sur Ctrl K).
 */
export function FicheSearch({ entries, subject, compact = false, suggestions = [], initial }:
  { entries: FicheEntry[]; subject: string; compact?: boolean; suggestions?: string[]; initial?: string | null }) {
  const [q, setQ] = useState(initial ?? "");
  const [open, setOpen] = useState(!!initial);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const dq = useDeferredValue(q);
  const results = useMemo(() => searchFiche(entries, dq, compact ? 6 : 8), [entries, dq, compact]);
  const id = compact ? "fs-c" : "fs-h";
  useEffect(() => setActive(0), [dq]);
  // Question arrivée depuis la recherche générale : la barre est prête, les réponses affichées
  useEffect(() => { if (initial) input.current?.focus({ preventScroll: true }); }, [initial]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t?.tagName ?? "") || t?.isContentEditable) return;
      const r = input.current?.getBoundingClientRect();
      if (!r || r.top < 60 || r.bottom > window.innerHeight || r.width === 0) return;
      e.preventDefault();
      e.stopPropagation();
      input.current?.focus();
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, []);

  useEffect(() => {
    if (!open || !list.current || prefersReducedMotion()) return;
    gsap.fromTo(list.current.children, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.32, stagger: 0.025, ease: "power2.out", overwrite: true });
  }, [results, open]);

  const go = (e: FicheEntry) => {
    setOpen(false);
    input.current?.blur();
    revealAnchor(e.anchor);
  };
  const showList = open && q.trim().length > 0;
  return (
    <div className={`fs${compact ? " fs--compact" : ""}${showList ? " is-open" : ""}`} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <div className="fs__bar">
        <I.Search size={compact ? 15 : 18} />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          placeholder={compact ? "Chercher dans la fiche…" : `Une question sur ${subject} ? cut-off, frais, dépositaire, Italie…`}
          aria-label={`Chercher une information dans la fiche de ${subject}`} role="combobox" aria-expanded={showList} aria-controls={`${id}-list`}
          aria-activedescendant={showList && results.length ? `${id}-${active}` : undefined} autoComplete="off" spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active]); }
            else if (e.key === "Escape") { setQ(""); setOpen(false); }
          }} />
        {!compact && <kbd aria-hidden="true">/</kbd>}
      </div>
      {!compact && !q && suggestions.length > 0 && (
        <div className="fs__sugg" aria-label="Exemples">
          {suggestions.map((s) => <button key={s} type="button" className="fs__chip" onClick={() => { setQ(s); setOpen(true); input.current?.focus(); }}>{s}</button>)}
        </div>
      )}
      {showList && (
        <ul ref={list} className="fs__list" role="listbox" id={`${id}-list`} aria-label="Réponses dans la fiche">
          {results.length ? results.map((r, i) => (
            <li key={r.group + r.label} id={`${id}-${i}`} role="option" aria-selected={i === active} className={`fs__it${i === active ? " is-active" : ""}`}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => go(r)}>
              <span className="fs__g">{r.group}</span>
              <span className="fs__l">{r.label}</span>
              <span className="fs__v">{r.value}</span>
              <I.Arrow size={14} className="fs__go" />
            </li>
          )) : <li className="fs__none">Rien de tel dans cette fiche. La recherche universelle (Ctrl K) couvre toute la maison.</li>}
        </ul>
      )}
    </div>
  );
}
