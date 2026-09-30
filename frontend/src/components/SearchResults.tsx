import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as I from "./Icon";
import { hrefFor, type Results } from "../lib/search";
import { eur, plural } from "../lib/format";
import { famVar } from "../lib/families";
import type { SearchEntry } from "../lib/types";

export type Flat = { kind: "answer"; href: string } | { kind: "hit"; entry: SearchEntry; href: string };

export function flatten(r: Results | null): Flat[] {
  if (!r) return [];
  const out: Flat[] = [];
  if (r.answer) out.push({ kind: "answer", href: r.answer.href });
  if (r.ask) out.push({ kind: "answer", href: r.ask.href });
  r.groups.forEach((g) => g.hits.forEach((h) => out.push({ kind: "hit", entry: h.entry, href: hrefFor(h.entry) })));
  return out;
}

/** Gestion clavier commune (↑ ↓ Entrée) pour la palette et la page Fonds. */
export function useResultNav(results: Results | null, onGo: () => void) {
  const nav = useNavigate();
  const flat = useMemo(() => flatten(results), [results]);
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [results]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!flat.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % flat.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + flat.length) % flat.length); }
    else if (e.key === "Enter") { e.preventDefault(); const f = flat[active]; if (f) { onGo(); nav(f.href); } }
  };
  return { flat, active, setActive, onKeyDown };
}

export function SearchResults({ results, active, setActive, onGo, night = false, idPrefix = "sr" }:
  { results: Results | null; active: number; setActive: (i: number) => void; onGo: () => void; night?: boolean; idPrefix?: string }) {
  const nav = useNavigate();
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  if (!results) return null;
  let i = -1;
  const go = (href: string) => { onGo(); nav(href); };
  return (
    <div className={`sres${night ? " sres--night" : ""}`} ref={listRef} role="listbox" id={`${idPrefix}-list`} aria-label="Résultats de recherche">
      {results.answer && (() => {
        i++;
        const a = results.answer;
        const idx = i;
        return (
          <div role="option" id={`${idPrefix}-${idx}`} aria-selected={active === idx} data-i={idx}
            className={`sres__answer${active === idx ? " is-active" : ""}`} onMouseEnter={() => setActive(idx)} onClick={() => go(a.href)}>
            <div className="eyebrow">Réponse directe</div>
            <div className="sres__answer-t">{a.title}</div>
            <div className="sres__answer-v">
              <span className="num">{eur(a.aum)}</span>
              <span className="muted"> d'encours · {plural(a.count, "fonds", "fonds")}</span>
            </div>
            <span className="sres__go">Voir la liste <I.Arrow size={15} /></span>
          </div>
        );
      })()}
      {results.groups.map((g) => (
        <div key={g.type} className="sres__g" role="group" aria-label={g.label}>
          <div className="sres__gh eyebrow">{g.label}</div>
          {g.hits.map((h) => {
            i++;
            const idx = i;
            const e = h.entry;
            return (
              <div key={e.t + e.id} role="option" id={`${idPrefix}-${idx}`} aria-selected={active === idx} data-i={idx}
                className={`sres__it${active === idx ? " is-active" : ""}`} onMouseEnter={() => setActive(idx)} onClick={() => go(hrefFor(e))}>
                <span className="dot" style={{ background: e.family ? famVar(e.family, night) : night ? "var(--on-night-2)" : "var(--ink-3)", opacity: e.family ? 1 : 0.5 }} />
                <span className="sres__main">
                  <span className="sres__label">{e.label}</span>
                  {e.sub && <span className="sres__sub">{e.sub}</span>}
                </span>
                {e.aum ? <span className="sres__aum num">{eur(e.aum)}</span> : null}
                <I.Arrow size={15} className="sres__arrow" />
              </div>
            );
          })}
        </div>
      ))}
      {results.ask && (() => {
        i++;
        const a = results.ask;
        const idx = i;
        return (
          <div role="option" id={`${idPrefix}-${idx}`} aria-selected={active === idx} data-i={idx}
            className={`sres__answer${active === idx ? " is-active" : ""}`} onMouseEnter={() => setActive(idx)} onClick={() => go(a.href)}>
            <div className="eyebrow">Question sur {a.entry.t === "part" ? "une part" : "un fonds"}</div>
            <div className="sres__answer-t">« {a.question} » dans la fiche {a.entry.label}</div>
            <div className="sres__answer-v"><span className="muted">{a.entry.sub}</span></div>
            <span className="sres__go">Ouvrir la fiche et chercher <I.Arrow size={15} /></span>
          </div>
        );
      })()}
      {!results.answer && !results.ask && !results.groups.length && results.tokens.length > 0 && (
        <div className="sres__none">
          Aucun résultat. Essayez un nom de fonds, un ISIN, un gérant, une gamme ou un pays — par exemple « <i>article 9 italie</i> ».
        </div>
      )}
    </div>
  );
}
