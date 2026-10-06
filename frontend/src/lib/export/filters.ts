/**
 * Filtres et tri du mode « Données », appliqués aux lignes chargées, sur les valeurs telles qu'elles seront écrites dans
 * le fichier (libellés, nombres, dates) : ce que l'on filtre est exactement ce que l'on exporte.
 */
import { cellValue, type ExportCol } from "../xlsx";
import type { Row } from "./sources";

export const EMPTY = "(vide)";
export type Filter =
  | { col: string; op: "in"; values: string[] }
  | { col: string; op: "range"; min: number | null; max: number | null }
  | { col: string; op: "dates"; from: string | null; to: string | null }
  | { col: string; op: "text"; q: string };
export type Sort = { col: string; dir: 1 | -1 } | null;

export const isNumeric = (c: ExportCol<Row>) => ["int", "num", "eur", "pct"].includes(c.kind ?? "");
export const isDate = (c: ExportCol<Row>) => c.kind === "date";

export function label(c: ExportCol<Row>, r: Row): string {
  const v = cellValue(c, r);
  if (v == null) return EMPTY;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

/** Valeurs distinctes d'une colonne, les plus fréquentes d'abord. */
export function facet(rows: Row[], c: ExportCol<Row>, limit = 400): { value: string; n: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) { const k = label(c, r); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value, "fr")).slice(0, limit);
}

/** Le filtre proposé par défaut pour une colonne, selon sa nature et le nombre de valeurs distinctes. */
export function defaultFilter(rows: Row[], c: ExportCol<Row>): Filter {
  if (isNumeric(c)) return { col: c.key, op: "range", min: null, max: null };
  if (isDate(c)) return { col: c.key, op: "dates", from: null, to: null };
  const n = new Set(rows.slice(0, 20000).map((r) => label(c, r))).size;
  return n <= 400 ? { col: c.key, op: "in", values: [] } : { col: c.key, op: "text", q: "" };
}

export const isActive = (f: Filter) =>
  f.op === "in" ? f.values.length > 0 : f.op === "range" ? f.min != null || f.max != null : f.op === "dates" ? !!(f.from || f.to) : f.q.trim().length > 0;

export function applyFilters(rows: Row[], filters: Filter[], byKey: Map<string, ExportCol<Row>>): Row[] {
  const act = filters.filter((f) => isActive(f) && byKey.has(f.col));
  if (!act.length) return rows;
  const tests = act.map((f) => {
    const c = byKey.get(f.col)!;
    if (f.op === "in") { const s = new Set(f.values); return (r: Row) => s.has(label(c, r)); }
    if (f.op === "text") { const q = f.q.trim().toLowerCase(); return (r: Row) => label(c, r).toLowerCase().includes(q); }
    if (f.op === "range") return (r: Row) => { const v = cellValue(c, r); return typeof v === "number" && (f.min == null || v >= f.min) && (f.max == null || v <= f.max); };
    return (r: Row) => { const v = cellValue(c, r); if (!(v instanceof Date)) return false; const d = v.toISOString().slice(0, 10); return (!f.from || d >= f.from) && (!f.to || d <= f.to); };
  });
  return rows.filter((r) => tests.every((t) => t(r)));
}

export function applySort(rows: Row[], sort: Sort, byKey: Map<string, ExportCol<Row>>): Row[] {
  if (!sort || !byKey.has(sort.col)) return rows;
  const c = byKey.get(sort.col)!;
  const key = (r: Row) => { const v = cellValue(c, r); return v instanceof Date ? v.getTime() : v; };
  return [...rows].sort((a, b) => {
    const x = key(a), y = key(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr", { numeric: true })) * sort.dir;
  });
}

/** Description lisible d'un filtre (onglet Paramètres du fichier, pastilles). */
export function describe(f: Filter, c: ExportCol<Row> | undefined): string {
  const name = c?.label ?? f.col;
  const num = (v: number) => (c?.kind === "pct" ? `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %` : v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }));
  if (f.op === "in") return `${name} : ${f.values.length <= 3 ? f.values.join(", ") : `${f.values.slice(0, 2).join(", ")} et ${f.values.length - 2} autres`}`;
  if (f.op === "text") return `${name} contient « ${f.q.trim()} »`;
  if (f.op === "range") return `${name} ${f.min != null && f.max != null ? `entre ${num(f.min)} et ${num(f.max)}` : f.min != null ? `≥ ${num(f.min)}` : `≤ ${num(f.max!)}`}`;
  const d = (x: string) => new Date(`${x}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" });
  return `${name} ${f.from && f.to ? `du ${d(f.from)} au ${d(f.to)}` : f.from ? `à partir du ${d(f.from)}` : `jusqu'au ${d(f.to!)}`}`;
}
