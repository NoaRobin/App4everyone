import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import * as I from "./Icon";
import { eur, eurParts, pct, date as fdate } from "../lib/format";
import { FAMILY_LABEL, famVar } from "../lib/families";
import { prefersReducedMotion } from "../lib/motion";
import type { FamilyKey, Variation } from "../lib/types";

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

/** Grand chiffre éditorial qui se « compte » à l'apparition. */
export function BigMoney({ v, className = "", unitClass = "" }: { v: number | null | undefined; className?: string; unitClass?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(prefersReducedMotion() ? v ?? 0 : 0);
  useEffect(() => {
    if (v == null) return;
    if (prefersReducedMotion()) { setShown(v); return; }
    const o = { x: shown || v * 0.82 };
    const tw = gsap.to(o, { x: v, duration: 1.6, ease: "expo.out", onUpdate: () => setShown(o.x) });
    return () => { tw.kill(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  if (v == null) return <span className={className}>—</span>;
  const p = eurParts(shown);
  const final = eur(v);
  return (
    <span ref={ref} className={`num ${className}`} aria-label={final}>
      <span aria-hidden="true">{p.value}</span>
      <span aria-hidden="true" className={unitClass} style={{ marginLeft: ".18em" }}>{p.unit}</span>
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
  const nf = (error as Error & { status?: number }).status === 404;
  return (
    <div className="empty" role="alert">
      <p className="h3" style={{ marginBottom: 8 }}>{nf ? "Cette page n'existe pas ou plus." : "Les données n'ont pas pu être chargées."}</p>
      <p className="small">{nf ? "Utilisez la recherche pour retrouver un fonds, une part ou un gérant." : "Vérifiez votre connexion puis réessayez."}</p>
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

/** Révèle les éléments `.reveal` lorsqu'ils entrent dans l'écran. */
export function useReveal(dep: unknown) {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".reveal:not(.is-in)");
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
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

/** Export CSV réalisé dans le navigateur de l'utilisateur (rien n'est écrit côté serveur). */
export function ExportCsv({ rows, columns, filename }: { rows: Record<string, unknown>[]; columns: { key: string; label: string; fmt?: (v: unknown, r: Record<string, unknown>) => string }[]; filename: string }) {
  const onClick = () => {
    const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const head = columns.map((c) => esc(c.label)).join(";");
    const body = rows.map((r) => columns.map((c) => esc(c.fmt ? c.fmt(r[c.key], r) : r[c.key] == null ? "" : String(r[c.key]))).join(";")).join("\n");
    const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return <button type="button" className="btn btn--ghost" onClick={onClick}><I.Download size={16} /> Exporter</button>;
}
