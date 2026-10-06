import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import * as I from "./Icon";
import { eur, eurParts, pct, date as fdate } from "../lib/format";
import { FAMILY_LABEL, famVar } from "../lib/families";
import { prefersReducedMotion } from "../lib/motion";
import { animatePage } from "../lib/gsap";
import type { FamilyKey, Variation } from "../lib/types";
import { togglePin, useIsPinned, type DeskItem } from "../lib/desk";

export function Delta({ v, kind = "pct", className = "" }: { v: number | null | undefined; kind?: "pct" | "eur"; className?: string }) {
  if (v == null || !isFinite(v)) return <span className={`delta delta--flat ${className}`}>—</span>;
  const dir = Math.abs(v) < 1e-9 ? "flat" : v > 0 ? "up" : "down";
  const label = kind === "pct" ? pct(v) : eur(v, { signed: true });
  return (
    <span className={`delta delta--${dir} ${className}`}>
      {dir === "up" ? <I.Up /> : dir === "down" ? <I.Down /> : null}
      <span style={{ marginLeft: dir === "flat" ? 0 : 3 }}>{label}</span>
      <span className="sr-only">{dir === "up" ? " (hausse)" : dir === "down" ? " (baisse)" : ""}</span>
    </span>
  );
}

/**
 * Grand chiffre éditorial en « compteur mécanique » : chaque chiffre roule jusqu'à sa valeur.
 * À chaque changement (date d'arrêté, frise de la ville), seuls les chiffres qui changent tournent.
 */
export function BigMoney({ v, className = "", unitClass = "" }: { v: number | null | undefined; className?: string; unitClass?: string }) {
  if (v == null) return <span className={className}>—</span>;
  const p = eurParts(v);
  return (
    <span className={`num ${className}`} aria-label={eur(v)} role="text">
      <Roll text={p.value} />
      <span aria-hidden="true" className={unitClass} style={{ marginLeft: ".18em" }}>{p.unit}</span>
    </span>
  );
}

export function Roll({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  const chars = text.split("");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cols = Array.from(el.querySelectorAll<HTMLElement>(".roll__col"));
    const reduced = prefersReducedMotion();
    cols.forEach((c, i) => {
      const d = Number(c.dataset.d);
      const target = -d * 10;
      if (reduced) { gsap.set(c, { yPercent: target }); return; }
      if (first.current) {
        gsap.fromTo(c, { yPercent: -((d + 5 + i * 3) % 10) * 10 - 100 * 0 }, { yPercent: target, duration: 1.6 + (cols.length - i) * 0.08, ease: "expo.out", delay: 0.1 + i * 0.05 });
      } else {
        gsap.to(c, { yPercent: target, duration: 0.7, ease: "power3.out", delay: (cols.length - i) * 0.02 });
      }
    });
    first.current = false;
  }, [text]);
  // Les colonnes sont indexées depuis la droite pour que les unités restent alignées quand le nombre de chiffres change
  const n = chars.length;
  return (
    <span ref={ref} className="roll" aria-hidden="true">
      {chars.map((ch, i) => /\d/.test(ch)
        ? <span key={`d${n - i}`} className="roll__d"><span className="roll__col" data-d={ch}>{"0123456789".split("").map((x) => <span key={x}>{x}</span>)}</span><span className="roll__ghost">{ch}</span></span>
        : <span key={`s${n - i}`} className="roll__s">{ch}</span>)}
    </span>
  );
}

export function FamilyTag({ k, short = false, night = false }: { k: FamilyKey; short?: boolean; night?: boolean }) {
  const label = FAMILY_LABEL[k] ?? k;
  return (
    <span className="tag" style={night ? { background: "rgba(255,255,255,.08)", color: "var(--on-night)" } : undefined}>
      <span className="dot" style={{ background: famVar(k, night) }} />
      {short ? label.replace("Actions internationales et gestion diversifiée", "Actions int. & diversifiée") : label}
    </span>
  );
}

export function SriScale({ value, previous }: { value: string | null | undefined; previous?: string | null }) {
  const v = Number(value);
  const p = Number(previous);
  if (!v) return <span className="muted">—</span>;
  return (
    <span className="sri" role="img" aria-label={`Indicateur de risque ${v} sur 7${p && p !== v ? `, ${p} le mois précédent` : ""}`}>
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <span key={i} className={`sri__c${i === v ? " is-on" : ""}${p && p !== v && i === p ? " is-prev" : ""}`} aria-hidden="true">{i}</span>
      ))}
    </span>
  );
}

export function Stars({ n }: { n: number | null | undefined }) {
  if (!n) return <span className="muted">—</span>;
  return (
    <span className="stars" role="img" aria-label={`${n} étoiles Morningstar sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => <I.Star key={i} filled={i <= n} size={13} />)}
    </span>
  );
}

export function Bool({ v }: { v: boolean | null | undefined }) {
  if (v == null) return <span className="muted">Non renseigné</span>;
  return v ? <span className="bool bool--yes"><I.Check size={15} /> Oui</span> : <span className="bool bool--no"><I.Minus size={15} /> Non</span>;
}

/** Décomposition visuelle d'une variation : collecte nette estimée + effet marché. */
export function Decomposition({ v, compact = false }: { v: Variation | null | undefined; compact?: boolean }) {
  if (!v || v.delta == null) return <span className="muted small">Historique insuffisant</span>;
  const max = Math.max(Math.abs(v.flows ?? 0), Math.abs(v.market ?? 0), 1);
  const bar = (x: number | null, label: string, cls: string) => (
    <div className="decomp__row">
      <span className="decomp__label">{label}</span>
      <span className="decomp__track" aria-hidden="true">
        <span className={`decomp__bar ${cls} ${(x ?? 0) < 0 ? "is-neg" : ""}`} style={{ width: `${(Math.abs(x ?? 0) / max) * 50}%` }} />
      </span>
      <Delta v={x} kind="eur" className="decomp__val" />
    </div>
  );
  return (
    <div className={`decomp${compact ? " decomp--compact" : ""}`}>
      {bar(v.flows, "Collecte nette estimée", "is-flows")}
      {bar(v.market, "Effet marché", "is-market")}
    </div>
  );
}

export function Loading({ label = "Chargement", h = 320 }: { label?: string; h?: number }) {
  return <div className="skeleton" style={{ height: h }} role="status" aria-label={label} />;
}

export function ErrorState({ error }: { error: Error }) {
  const e = error as Error & { status?: number; code?: string; hint?: string };
  const nf = e.status === 404;
  const backend = !nf && !!e.code;
  return (
    <div className="empty" role="alert">
      <p className="h3" style={{ marginBottom: 8 }}>{nf ? "Cette page n'existe pas ou plus." : "Les données n'ont pas pu être chargées."}</p>
      {backend && <p className="small strong">{e.message}</p>}
      <p className="small">{nf ? "Utilisez la recherche pour retrouver un fonds, une part ou un gérant." : e.hint || "Vérifiez votre connexion puis réessayez."}</p>
      <Link to="/fonds" className="btn btn--ghost" style={{ marginTop: 12 }}><I.Search size={16} /> Rechercher</Link>
    </div>
  );
}

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="crumbs">
      {items.map((it, i) => (
        <span key={i}>
          {it.to ? <Link className="link" to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
          {i < items.length - 1 && <span className="crumbs__sep" aria-hidden="true">/</span>}
        </span>
      ))}
    </nav>
  );
}

export function AsOf({ d }: { d: string }) {
  return <span className="small muted">Données au {fdate(d)}</span>;
}

export function Stat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="eyebrow">{label}</div>
      <div className="stat__v">{children}</div>
      {sub && <div className="stat__sub small">{sub}</div>}
    </div>
  );
}

/** Anime la page (révélations, titres, courbes, barres) une fois les données affichées. */
export function useReveal(dep: unknown) {
  useEffect(() => {
    if (dep == null) return;
    let undo: (() => void) | undefined;
    const id = requestAnimationFrame(() => { undo = animatePage(); });
    return () => { cancelAnimationFrame(id); undo?.(); };
  }, [dep]);
}

export function CopyCode({ code }: { code: string | null | undefined }) {
  const [done, setDone] = useState(false);
  if (!code) return <span className="muted">—</span>;
  return (
    <button type="button" className="copy mono" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(code).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }); }}
      aria-label={`Copier ${code}`} title="Copier">
      {code}<span aria-hidden="true">{done ? <I.Check size={13} /> : <I.Copy size={13} />}</span>
      <span className="sr-only" aria-live="polite">{done ? "Copié" : ""}</span>
    </button>
  );
}

/** Étoile d'épinglage : la fiche rejoint « Votre bureau » dans l'espace métiers. */
export function PinButton({ item }: { item: DeskItem }) {
  const on = useIsPinned(item.kind, item.id);
  return (
    <button type="button" className={`pin${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => togglePin(item)}
      title={on ? "Retirer de votre bureau" : "Épingler sur votre bureau (espace métiers)"}>
      <I.Star size={15} filled={on} /><span>{on ? "Épinglé" : "Épingler"}</span>
    </button>
  );
}

/**
 * Affichage progressif des longues listes (des centaines de fonds avec les données réelles) : les premières lignes
 * tout de suite, le reste à la demande. Évite des dizaines de milliers de nœuds dans la page.
 */
export function useProgressive(step = 60) {
  const [limit, setLimit] = useState(step);
  return { limit, step, more: () => setLimit((l) => l + step), all: () => setLimit(Infinity), reset: () => setLimit(step) };
}

export function MoreRows({ shown, total, step, onMore, onAll, what = "lignes affichées" }:
  { shown: number; total: number; step: number; onMore: () => void; onAll: () => void; what?: string }) {
  if (shown >= total) return null;
  return (
    <div className="more" role="group" aria-label="Afficher davantage">
      <span className="small muted num">{shown} {what} sur {total}</span>
      <button type="button" className="chip" onClick={onMore}>Afficher {Math.min(step, total - shown)} de plus</button>
      <button type="button" className="chip" onClick={onAll}>Tout afficher</button>
    </div>
  );
}
