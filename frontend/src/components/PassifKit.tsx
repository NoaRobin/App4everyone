/**
 * Passif — types de la réponse /api/passif, formats et petites pièces communes.
 * Règles d'affichage : uniquement des parts (%) et des tranches ; jamais de montant ; le rang d'une tranche ne sert qu'à
 * des tailles visuelles ordinales ; un champ absent (null, tableau vide) donne un état vide propre, jamais un chiffre inventé.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { gsap, onVisible } from "../lib/gsap";
import { prefersReducedMotion } from "../lib/motion";

// ------------------------------------------------------------------ types
export type Tranche = { label: string; rank: number } | null | undefined;
export type Share<K extends string> = { [k in K]: string } & { pct: number; tranche?: Tranche };

export type Classif = { classification: string; label: string; tranche: Tranche; active?: boolean; omnibus?: boolean; opc?: boolean };
export type Teneur = { teneur: string; tranche: Tranche; clients?: Tranche; classifications?: Classif[] | null };
export type Comptes = {
  available?: boolean; total?: Tranche; teneurs?: Teneur[] | null;
  with_parent?: Tranche; without_parent?: Tranche; creation_known?: Tranche; creation_unknown?: Tranche;
  dissolved?: Tranche; open?: Tranche; currencies?: { devise: string; tranche: Tranche }[] | null; clients?: Tranche;
};
export type Group = { classe_actif: string; desk: string; devise: string; pct: number; tranche?: Tranche };
export type Band = { band: string; pct: number; tranche?: Tranche };
export type Concentration = { available?: boolean; accounts?: Tranche; points?: { top_pct: number; pct: number }[] | null; accounts_for_half?: Tranche; accounts_for_80?: Tranche };
export type Positions = {
  available?: boolean; reason?: string; measure?: string; groups?: Group[] | null; residual_pct?: number | null;
  by_desk?: Share<"desk">[] | null; by_class?: Share<"classe_actif">[] | null; by_currency?: Share<"devise">[] | null;
  matrix?: { desk: string; classe_actif: string; pct: number }[] | null;
  by_holder?: { teneur: string; classification: string; pct: number; tranche?: Tranche }[] | null;
  by_client?: { teneur: string; classification: string; pct: number; tranche?: Tranche }[] | null;
  by_teneur?: Share<"teneur">[] | null; by_classification?: Share<"classification">[] | null;
  by_country?: (Share<"pays"> & { iso?: string })[] | null; by_sdg?: Share<"sdg">[] | null; by_fund_type?: Share<"type_fonds">[] | null;
  seniority?: Band[] | null; last_trade?: Band[] | null; concentration?: Concentration | null;
  top_funds?: { fund: string; name?: string | null; pct: number; positions?: Tranche }[] | null; top_funds_pct?: number | null; funds_count?: Tranche;
  total?: Tranche; amount_valid_pct?: number | null;
};
export type DayGroup = { classe_actif: string; desk: string; sens: string; statut?: string; devise?: string; pct: number; tranche?: Tranche };
export type Day = {
  date: string; ops?: Tranche; sens?: Share<"sens">[] | null; desks?: Share<"desk">[] | null; late_pct?: number | null; groups?: DayGroup[] | null;
};
export type Statut = { statut: string; included: boolean; tranche?: Tranche; pct?: number | null };
export type Transactions = {
  available?: boolean; reason?: string; measure?: string; first?: string | null; last?: string | null; n_days?: number; window_days?: number;
  days?: Day[] | null; period_sens?: Share<"sens">[] | null; period_desks?: Share<"desk">[] | null; period_classes?: Share<"classe_actif">[] | null;
  period_countries?: (Share<"pays"> & { iso?: string })[] | null; period_desk_sens?: (Share<"desk"> & { sens: string })[] | null;
  late?: { calculable: boolean; pct: number | null; rule: string } | null; period_late_pct?: number | null; ops?: Tranche;
  statuts?: Statut[] | null; allowed?: string[] | null; amount_valid_pct?: number | null;
};
export type LectureCol = {
  field: string; name: string; kind: string; col: string | null; how: string; detected: string; status: string; nulls?: number | null; filled?: number | null;
  valid?: number | null; invalid?: number | null; rejected?: { shape: string; n: number }[] | null; min?: string | null; max?: string | null;
  distinct?: number | null; used: boolean;
};
export type LectureTable = {
  mode: "noms" | "_cN"; rows: number; usable: number; ignored_rows: number; n_columns: number; expected: number; missing: string[]; extra: string[];
  overrides_ignored: { field: string; col: string; why: string }[]; columns: LectureCol[]; to_confirm: string[]; configured: string[];
};
export type Lecture = {
  tables: Record<"compte" | "position" | "transaction", LectureTable>;
  links?: { accounts?: { rows_pct: number | null; amount_pct: number | null; linked: number; distinct: number }; isin?: { distinct: number; linked: number; amount_pct: number | null; rows_pct: number | null } } | null;
  problems: { table: string; field: string; level: string; text: string }[];
  duplicates?: { references: number; refs_repeated: number; exact_duplicates: number; refs_multi_lines: number; without_reference: number } | null;
  statuts?: Statut[] | null; allowed_statuts?: string[]; env: Record<string, string>;
};
export type PassifResp = {
  available: boolean; reason?: string; source?: string; refreshed_at?: string | null; positions_as_of?: string | null;
  model?: Partial<Record<"clients" | "comptes" | "positions" | "operations" | "funds_held", Tranche>> | null;
  comptes?: (Comptes & { reason?: string; dissolution_rule?: string }) | null; positions?: Positions | null; transactions?: Transactions | null;
  lecture?: Lecture | null;
  synthese?: import("./PassifSections").Synthese | null;
  funds?: Record<string, { pct: number; positions?: Tranche; name?: string | null }> | null;
};

/** Nature d'une classification d'après son libellé (« TA/Client Actif », « RMM/OPC », « TA/Omnibus »…). */
export function natureOfLabel(c: string): Nature {
  if (/inactif/i.test(c)) return "inactif";
  if (/omnibus/i.test(c)) return "omnibus";
  if (/\bopc\b/i.test(c)) return "opc";
  if (/client\s*actif/i.test(c)) return "actif";
  return "autre";
}

export const arr = <T,>(x: T[] | null | undefined): T[] => (Array.isArray(x) ? x : []);

// ------------------------------------------------------------------ formats
const NNBSP = " ";
const f1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Part déjà exprimée en % (16.3 = 16,3 %). */
export const fp = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : f1.format(v) + NNBSP + "%");
export const fpNum = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : f1.format(v));
/** Libellé d'une tranche, avec son unité (« 100 à 499 positions »). */
export const tr = (t: Tranche, unit = "") => (t ? `${t.label}${unit ? " " + unit : ""}` : "non publié");
export const rankOf = (t: Tranche) => (t ? Math.max(1, Math.min(8, t.rank)) : 0);

const DOW = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MON = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MON_S = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const parse = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const dShort = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
export const dFull = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
export const dLong = (iso?: string | null) => { if (!iso) return "—"; const d = parse(iso); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const dMonth = (iso: string) => MON_S[parse(iso).getUTCMonth()];
export const dDay = (iso: string) => String(parse(iso).getUTCDate());

// ------------------------------------------------------------------ couleurs (validées : outil dataviz, fond #0a1322, mode sombre)
/** Sens des opérations — ordre fixe d'empilement (paires adjacentes validées). */
export const SENS_ORDER = ["Souscription", "Rachat", "Transfert entrant", "Transfert sortant"];
const SENS_COLOR: Record<string, string> = { Souscription: "#6189d6", Rachat: "#c98500", "Transfert entrant": "#9085e9", "Transfert sortant": "#d55181" };
export const sensColor = (s: string) => SENS_COLOR[s] ?? "#5b6170";
export const sensRank = (s: string) => { const i = SENS_ORDER.indexOf(s); return i < 0 ? 99 : i; };

/** Nature d'une classification de compte (déduite des drapeaux de l'API), dans un ordre d'empilement fixe. */
export type Nature = "actif" | "opc" | "autre" | "omnibus" | "inactif";
export const NATURE_ORDER: Nature[] = ["actif", "opc", "autre", "omnibus", "inactif"];
export const NATURE_LABEL: Record<Nature, string> = { actif: "Client actif", opc: "OPC", autre: "Banque privée, institutionnel et autres", omnibus: "Omnibus", inactif: "Inactif" };
const NATURE_COLOR: Record<Nature, string> = { actif: "#6189d6", opc: "#c98500", autre: "#9085e9", omnibus: "#d55181", inactif: "#5b6170" };
export const natureColor = (n: Nature) => NATURE_COLOR[n];
export function natureOf(c: Pick<Classif, "label" | "active" | "omnibus" | "opc"> | null | undefined): Nature {
  if (!c) return "autre";
  if (c.active === false) return "inactif";
  if (c.omnibus) return "omnibus";
  if (c.opc) return "opc";
  if (/client\s*actif/i.test(c.label ?? "")) return "actif";
  return "autre";
}

/** Rampe séquentielle (une seule teinte, or) pour les intensités : sombre = faible, clair = fort. */
export function goldRamp(k: number): string {
  // Trois jalons d'une même teinte : bleu nuit (≈ 0) → or profond → or clair
  const stops = [[0x1c, 0x22, 0x33], [0x8a, 0x68, 0x2c], [0xf3, 0xdc, 0xaa]];
  const t = Math.max(0, Math.min(1, k)) * 2;
  const [a, b] = t <= 1 ? [stops[0], stops[1]] : [stops[1], stops[2]];
  const u = t <= 1 ? t : t - 1;
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * u));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// ------------------------------------------------------------------ pièces communes
/** Jauge ordinale d'une tranche : 6 crans, le rang allumé (jamais une valeur exacte). */
export function RankMeter({ t, max = 6 }: { t: Tranche; max?: number }) {
  const r = rankOf(t);
  return (
    <span className="pa-meter" aria-hidden="true">
      {Array.from({ length: Math.max(max, r) }, (_, i) => <i key={i} className={i < r ? "is-on" : ""} />)}
    </span>
  );
}

/** Pastille de tranche. */
export function TrancheChip({ t, unit }: { t: Tranche; unit?: string }) {
  return <span className={`pa-tr${t ? "" : " is-null"}`} title={t ? undefined : "Groupe inférieur à 5 ou absent : non publié"}>{tr(t, unit)}</span>;
}

/** Infobulle positionnée dans un conteneur relatif. */
export function Tip({ x, y, children, below = false }: { x: number; y: number; children: ReactNode; below?: boolean }) {
  return (
    <div className="city__tip pa-tip" role="status" style={{ transform: `translate(-50%, ${below ? "18px" : "-100%"}) translate(${x}px, ${y + (below ? 0 : -14)}px)` }}>
      {children}
    </div>
  );
}

/** Liste de barres horizontales d'une seule teinte (catégories nominales : une seule couleur). */
export function ShareBars<T>({ items, label, pct, tranche, unit, color = "var(--gold)", max, onHover, active, className = "" }:
  { className?: string; items: T[]; label: (t: T) => ReactNode; pct: (t: T) => number; tranche?: (t: T) => Tranche; unit?: string; color?: string; max?: number;
    onHover?: (t: T | null) => void; active?: (t: T) => boolean }) {
  const ref = useRef<HTMLUListElement>(null);
  const m = max ?? Math.max(1, ...items.map(pct));
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const bars = el.querySelectorAll(".pa-bars__fill");
    gsap.set(bars, { scaleX: 0, transformOrigin: "left center" });
    return onVisible(el, () => gsap.to(bars, { scaleX: 1, duration: 1.1, stagger: 0.05, ease: "power3.out", clearProps: "transform" }));
  }, [items.length]);
  if (!items.length) return <p className="small muted pa-none">Aucun groupe publié.</p>;
  return (
    <ul className={`pa-bars ${className}`} ref={ref}>
      {items.map((it, i) => (
        <li key={i} className={active?.(it) ? "is-on" : undefined} onMouseEnter={() => onHover?.(it)} onMouseLeave={() => onHover?.(null)}>
          <span className="pa-bars__l">{label(it)}</span>
          <span className="pa-bars__v num">{fp(pct(it))}</span>
          <span className="pa-bars__track" aria-hidden="true"><span className="pa-bars__fill" style={{ width: `${Math.max(0.6, (pct(it) / m) * 100)}%`, background: color }} /></span>
          {tranche && <span className="pa-bars__t small">{tr(tranche(it), unit)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Animation fine d'apparition d'un groupe d'éléments (fromTo explicite + clearProps : pas de transition CSS d'opacité). */
export function useStagger(sel: string, dep: unknown, from: gsap.TweenVars = { opacity: 0, y: 12 }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const items = el.querySelectorAll(sel);
    if (!items.length) return;
    const to: gsap.TweenVars = {};
    Object.keys(from).forEach((k) => { to[k] = k === "opacity" || k === "scale" || k === "scaleY" || k === "scaleX" ? 1 : 0; });
    gsap.set(items, from);
    const stop = onVisible(el, () => gsap.to(items, { ...to, duration: 0.8, stagger: 0.04, ease: "power3.out", clearProps: "opacity,transform" }));
    return () => { stop(); gsap.killTweensOf(items); gsap.set(items, { clearProps: "opacity,transform" }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
  return ref;
}
