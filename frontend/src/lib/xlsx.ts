/**
 * Classeurs Excel « propres », construits dans le navigateur (rien n'est écrit côté serveur) avec ExcelJS, chargé à la
 * demande. Conçus pour être retravaillés dans Excel (tableaux croisés, formules, Copilot) :
 *
 *   Données       un tableau Excel structuré qui commence en A1 : une ligne par enregistrement, une ligne d'en-têtes
 *                 explicites (uniques), vrais nombres, vraies dates, pourcentages en fraction, aucune cellule fusionnée,
 *                 aucune ligne de titre au-dessus des données ; ligne d'en-têtes figée ; ligne de totaux en option
 *                 (ligne de totaux du tableau, reconnue comme telle par Excel).
 *   Dictionnaire  chaque colonne : nom, format, définition.
 *   Paramètres    ce que contient le fichier : source, grain, date de valeur, période, filtres, nombre de lignes, date d'export.
 */
export type ColKind = "text" | "code" | "int" | "num" | "eur" | "pct" | "date" | "bool";
export type ExportCol<R = Record<string, unknown>> = {
  key: string;
  label: string;
  kind?: ColKind;
  group?: string;              // regroupement dans le sélecteur de colonnes
  desc?: string;               // définition (onglet « À propos »)
  get?: (r: R) => unknown;     // valeur brute (par défaut r[key])
  sum?: boolean;               // total en pied de tableau
  digits?: number;             // décimales pour « num »
};
export type ExportSpec<R> = {
  title: string; subtitle?: string; filename: string; sheet?: string;
  rows: R[]; columns: ExportCol<R>[];
  context?: { label: string; value: string }[];
  grain?: string;              // « une ligne par fonds et par date »
  mock?: boolean; totals?: boolean; about?: boolean;
  style?: string;              // identifiant d'un style de XSTYLES
};

/** Styles du tableau : en-tête aux couleurs choisies, lignes alternées natives du tableau Excel (aucune cellule fusionnée). */
export type XStyle = { id: string; label: string; note: string; head: string; ink: string; rule: string; zebra: string | null; theme: "TableStyleMedium2" | "TableStyleLight1" | "TableStyleLight8" | "TableStyleLight15"; stripes: boolean };
export const XSTYLES: XStyle[] = [
  { id: "rco", label: "Rothschild", note: "Bleu nuit, filet d'or", head: "1C355E", ink: "FFFFFF", rule: "CC9F53", zebra: "F2F2F2", theme: "TableStyleLight1", stripes: true },
  { id: "epure", label: "Épuré", note: "Blanc, filet bleu, sans fond", head: "FFFFFF", ink: "1C355E", rule: "1C355E", zebra: null, theme: "TableStyleLight1", stripes: false },
  { id: "bordeaux", label: "Bordeaux", note: "Rouge Rothschild, filet rose", head: "8A1E41", ink: "FFFFFF", rule: "E8C9BA", zebra: "F2F2F2", theme: "TableStyleLight1", stripes: true },
  { id: "graphite", label: "Graphite", note: "Gris anthracite, filet d'or", head: "2B2F36", ink: "FFFFFF", rule: "CC9F53", zebra: "F2F2F2", theme: "TableStyleLight1", stripes: true },
  { id: "excel", label: "Excel standard", note: "Le style bleu par défaut d'Excel", head: "4472C4", ink: "FFFFFF", rule: "4472C4", zebra: "D9E1F2", theme: "TableStyleMedium2", stripes: true },
];
export const xstyle = (id?: string) => XSTYLES.find((x) => x.id === id) ?? XSTYLES[0];

const FMT: Record<ColKind, string | undefined> = {
  text: undefined, code: "@", int: "#,##0", num: "#,##0.00", eur: "#,##0.00", pct: "0.00%", date: "dd/mm/yyyy", bool: undefined,
};
export const KIND_LABEL: Record<ColKind, string> = { text: "Texte", code: "Code (texte)", int: "Nombre entier", num: "Nombre décimal", eur: "Montant en euros", pct: "Pourcentage (fraction : 0,05 = 5 %)", date: "Date", bool: "Oui / Non" };
const NUMERIC = new Set<ColKind>(["int", "num", "eur", "pct"]);

export const rawValue = <R,>(c: ExportCol<R>, r: R): unknown => (c.get ? c.get(r) : (r as Record<string, unknown>)[c.key]);

/** Valeur prête pour une cellule : nombres en nombres, dates en dates, booléens en Oui/Non, vides en vide. */
export function cellValue<R>(c: ExportCol<R>, r: R): string | number | Date | null {
  const v = rawValue(c, r);
  if (v == null || v === "" || (typeof v === "number" && !Number.isFinite(v))) return null;
  switch (c.kind) {
    case "int": case "num": case "eur": case "pct": return typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : String(v);
    case "date": { const d = typeof v === "string" ? new Date(`${v.slice(0, 10)}T00:00:00Z`) : v instanceof Date ? v : null; return d && !Number.isNaN(d.getTime()) ? d : String(v); }
    case "bool": return v === true ? "Oui" : v === false ? "Non" : String(v);
    default: return Array.isArray(v) ? v.join(", ") : String(v);
  }
}

const today = () => new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** En-têtes uniques et non vides (exigence des tableaux Excel). */
export function uniqueHeaders(labels: string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((l0) => {
    const l = (l0 || "Colonne").replace(/[\r\n\t]+/g, " ").trim().slice(0, 250) || "Colonne";
    const k = l.toLowerCase();
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n === 1 ? l : `${l} (${n})`;
  });
}

/** Nom de tableau Excel valide : lettres, chiffres, soulignés ; commence par une lettre ; jamais une référence de cellule. */
export function tableName(s: string): string {
  const base = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return `T_${base || "Donnees"}`;
}

type Ws = import("exceljs").Worksheet;
function addCleanTable(ws: Ws, name: string, headers: string[], kinds: (ColKind | undefined)[], rows: (string | number | Date | null)[][], totals?: boolean[], style: XStyle = XSTYLES[0]) {
  // Formats portés par les colonnes : chaque cellule créée ensuite les hérite (pas de boucle cellule par cellule)
  kinds.forEach((k, i) => {
    const col = ws.getColumn(i + 1);
    const f = FMT[k ?? "text"];
    if (f) col.numFmt = f;
    if (k && NUMERIC.has(k)) col.alignment = { horizontal: "right" };
  });
  if (!rows.length) {
    ws.addRow(headers).font = { bold: true };
  } else {
    ws.addTable({
      name, displayName: name, ref: "A1", headerRow: true, totalsRow: !!totals?.some(Boolean),
      style: { theme: style.theme, showRowStripes: style.stripes },
      columns: headers.map((h, i) => ({ name: h, filterButton: true, ...(totals?.some(Boolean)
        ? (i === 0 && !totals[0] ? { totalsRowLabel: "Total" } : totals[i] ? { totalsRowFunction: "sum" as const } : {}) : {}) })),
      rows,
    });
  }
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1, activeCell: "A2" }];
  // En-tête aux couleurs du style (une seule ligne : coût nul) ; le style natif du tableau garde filtres et lignes alternées
  if (style.id !== "excel") {
    const head = ws.getRow(1);
    head.height = 22;
    headers.forEach((_, i) => {
      const c = head.getCell(i + 1);
      c.font = { bold: true, color: { argb: `FF${style.ink}` } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${style.head}` } };
      c.border = { bottom: { style: "medium", color: { argb: `FF${style.rule}` } } };
      c.alignment = { vertical: "middle", horizontal: kinds[i] && NUMERIC.has(kinds[i]!) ? "right" : "left" };
    });
  }
  // Largeurs selon le contenu (échantillon), bornées
  headers.forEach((h, i) => {
    const sample = rows.slice(0, 300).map((r) => { const v = r[i]; return v instanceof Date ? "00/00/0000" : typeof v === "number" ? v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + "   " : String(v ?? ""); });
    const w = Math.max(h.length + 4, ...sample.map((x) => x.length + 2));
    ws.getColumn(i + 1).width = Math.min(kinds[i] === "text" || !kinds[i] ? 50 : 24, Math.max(9, w));
  });
}

/** Le classeur : Données (tableau structuré), Dictionnaire, Paramètres. */
export async function buildWorkbook<R>(spec: ExportSpec<R>): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rothschild & Co Asset Management — application interne";
  wb.title = spec.title;
  wb.subject = spec.grain ?? "";
  wb.created = new Date();
  const cols = spec.columns;
  const headers = uniqueHeaders(cols.map((c) => c.label));
  const kinds = cols.map((c) => c.kind);
  const rows = spec.rows.map((r) => cols.map((c) => cellValue(c, r)));
  const ws = wb.addWorksheet((spec.sheet ?? "Données").replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Données");
  const st = xstyle(spec.style);
  addCleanTable(ws, tableName(spec.sheet ?? spec.title), headers, kinds, rows, spec.totals ? cols.map((c) => !!c.sum) : undefined, st);

  if (spec.about !== false) {
    const dico = wb.addWorksheet("Dictionnaire");
    addCleanTable(dico, "T_Dictionnaire", ["Colonne", "Format", "Définition"], ["text", "text", "text"],
      cols.map((c, i) => [headers[i], KIND_LABEL[c.kind ?? "text"], c.desc ?? ""]), undefined, st);
    const par = wb.addWorksheet("Paramètres");
    const kv: [string, string][] = [
      ["Contenu", spec.title],
      ...(spec.subtitle ? [["Détail", spec.subtitle] as [string, string]] : []),
      ...(spec.grain ? [["Grain", spec.grain] as [string, string]] : []),
      ...((spec.context ?? []).map((c) => [c.label, c.value]) as [string, string][]),
      ["Lignes", String(spec.rows.length)],
      ["Colonnes", String(cols.length)],
      ["Exporté le", today()],
      ["Source", spec.mock ? "Données fictives au schéma exact du Lakehouse (aucune donnée réelle)" : "Microsoft Fabric — Lakehouse, lecture seule"],
      ["Diffusion", "Usage interne. Ne pas transmettre à l'extérieur sans validation."],
    ];
    addCleanTable(par, "T_Parametres", ["Paramètre", "Valeur"], ["text", "text"], kv, undefined, st);
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/** CSV (séparateur « ; », UTF-8 avec BOM) pour qui préfère un fichier brut. */
export function toCsv<R>(rows: R[], cols: ExportCol<R>[], headers?: string[]): Blob {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const fmt = (c: ExportCol<R>, r: R) => {
    const v = cellValue(c, r);
    if (v == null) return "";
    if (v instanceof Date) return v.toLocaleDateString("fr-FR", { timeZone: "UTC" });
    if (typeof v === "number") return (c.kind === "pct" ? (v * 100).toFixed(2) : String(v)).replace(".", ",");
    return String(v);
  };
  const body = [(headers ?? cols.map((c) => c.label + (c.kind === "pct" ? " (%)" : ""))).map(esc).join(";"), ...rows.map((r) => cols.map((c) => esc(fmt(c, r))).join(";"))].join("\n");
  return new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
}

/** Texte tabulé pour un collage direct dans Excel (paramètres régionaux français : virgule décimale, dates jj/mm/aaaa). */
export function toTsv<R>(rows: R[], cols: ExportCol<R>[], headers?: string[]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, " ");
  const fmt = (c: ExportCol<R>, r: R) => {
    const v = cellValue(c, r);
    if (v == null) return "";
    if (v instanceof Date) return v.toLocaleDateString("fr-FR", { timeZone: "UTC" });
    if (typeof v === "number") return c.kind === "pct" ? `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 4, useGrouping: false })} %` : v.toLocaleString("fr-FR", { maximumFractionDigits: 6, useGrouping: false });
    return clean(String(v));
  };
  return [(headers ?? cols.map((c) => c.label)).map(clean).join("\t"), ...rows.map((r) => cols.map((c) => fmt(c, r)).join("\t"))].join("\r\n");
}
