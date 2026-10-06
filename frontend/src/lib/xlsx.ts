/**
 * Classeur Excel institutionnel, construit dans le navigateur (rien n'est écrit côté serveur) avec ExcelJS, chargé à la
 * demande. Charte Rothschild & Co : bleu #1C355E, or #CC9F53, pierre #D6D1CA.
 *
 *   Données     bandeau de marque, titre, contexte ; en-têtes bleus filetés d'or ; volets figés ; filtres automatiques ;
 *               formats par nature de colonne ; lignes alternées ; ligne de totaux (SOUS.TOTAL : suit les filtres) ;
 *               impression paysage, en-têtes répétés, pied de page.
 *   À propos    date de l'export, contexte, source, et définition de chaque colonne.
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
  mock?: boolean; totals?: boolean; about?: boolean;
};

const NAVY = "FF1C355E", GOLD = "FFCC9F53", STONE = "FFD6D1CA", ZEBRA = "FFF6F4F0", INK = "FF1B2333", MUTED = "FF6B7280", WHITE = "FFFFFFFF";
const FONT = "Arial", SERIF = "Georgia";

const FMT: Record<ColKind, string | undefined> = {
  text: undefined, code: "@", int: "#,##0", num: "#,##0.00", eur: '#,##0 "€";[Red]-#,##0 "€"', pct: "0.00%;[Red]-0.00%", date: "dd/mm/yyyy", bool: undefined,
};

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

const colLetter = (n: number) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const today = () => new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

export async function buildWorkbook<R>(spec: ExportSpec<R>): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rothschild & Co Asset Management — application interne";
  wb.title = spec.title;
  wb.created = new Date();
  const cols = spec.columns;
  const n = cols.length;
  const last = colLetter(Math.max(n, 4));
  const ws = wb.addWorksheet(spec.sheet ?? "Données", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 6, showGridLines: false }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 }, printTitlesRow: "6:6" },
    headerFooter: {
      oddHeader: `&L&"${FONT}"&8&K1C355ERothschild & Co Asset Management&R&"${FONT}"&8&K6B7280${spec.title.replace(/&/g, "&&")}`,
      oddFooter: `&L&"${FONT}"&7&K6B7280Usage interne${spec.mock ? " · données fictives" : ""} · exporté le ${today()}&R&"${FONT}"&7&K6B7280Page &P / &N`,
    },
  });

  // Bandeau
  ws.mergeCells(`A1:${last}1`); ws.mergeCells(`A2:${last}2`); ws.mergeCells(`A3:${last}3`); ws.mergeCells(`A4:${last}4`);
  const brand = ws.getCell("A1");
  brand.value = "ROTHSCHILD & CO  ·  ASSET MANAGEMENT";
  brand.font = { name: FONT, size: 8, bold: true, color: { argb: GOLD } };
  ws.getRow(1).height = 18;
  const title = ws.getCell("A2");
  title.value = spec.title;
  title.font = { name: SERIF, size: 20, color: { argb: NAVY } };
  ws.getRow(2).height = 32;
  const sub = ws.getCell("A3");
  sub.value = [spec.subtitle, ...(spec.context ?? []).map((c) => `${c.label} : ${c.value}`)].filter(Boolean).join("   ·   ");
  sub.font = { name: FONT, size: 9, color: { argb: MUTED } };
  const meta = ws.getCell("A4");
  meta.value = `${spec.rows.length.toLocaleString("fr-FR")} lignes · ${n} colonnes · exporté le ${today()}${spec.mock ? " · données fictives" : ""}`;
  meta.font = { name: FONT, size: 8, italic: true, color: { argb: MUTED } };
  for (let i = 1; i <= Math.max(n, 4); i++) ws.getCell(5, i).border = { top: { style: "medium", color: { argb: GOLD } } };
  ws.getRow(5).height = 6;

  // En-têtes
  const head = ws.getRow(6);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.font = { name: FONT, size: 9, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: ["int", "num", "eur", "pct"].includes(c.kind ?? "") ? "right" : "left", wrapText: true, indent: 1 };
    cell.border = { bottom: { style: "medium", color: { argb: GOLD } } };
  });
  head.height = 30;

  // Données
  spec.rows.forEach((r, k) => {
    const row = ws.getRow(7 + k);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = cellValue(c, r) as never;
      const fmt = c.kind === "num" && c.digits != null ? `#,##0${c.digits ? "." + "0".repeat(c.digits) : ""}` : FMT[c.kind ?? "text"];
      if (fmt) cell.numFmt = fmt;
      cell.font = { name: c.kind === "code" ? "Consolas" : FONT, size: 9, color: { argb: INK }, bold: i === 0 };
      cell.alignment = { vertical: "middle", horizontal: ["int", "num", "eur", "pct"].includes(c.kind ?? "") ? "right" : c.kind === "bool" || c.kind === "date" ? "center" : "left", indent: 1 };
      cell.border = { bottom: { style: "hair", color: { argb: STONE } } };
      if (k % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    });
    row.height = 18;
  });
  const first = 7, lastRow = 6 + spec.rows.length;

  // Totaux (SOUS.TOTAL 109 : ne compte que les lignes visibles après filtrage)
  if (spec.totals !== false && spec.rows.length && cols.some((c) => c.sum)) {
    const row = ws.getRow(lastRow + 1);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const L = colLetter(i + 1);
      if (i === 0) cell.value = "Total (lignes filtrées)";
      else if (c.sum) { cell.value = { formula: `SUBTOTAL(109,${L}${first}:${L}${lastRow})` } as never; cell.numFmt = FMT[c.kind ?? "num"] ?? "#,##0"; }
      cell.font = { name: FONT, size: 9, bold: true, color: { argb: NAVY } };
      cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "right", indent: 1 };
      cell.border = { top: { style: "thin", color: { argb: NAVY } }, bottom: { style: "double", color: { argb: NAVY } } };
    });
    row.height = 20;
  }
  if (spec.rows.length) ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: lastRow, column: n } };

  // Largeurs : selon le contenu, bornées
  cols.forEach((c, i) => {
    const sample = spec.rows.slice(0, 400).map((r) => { const v = cellValue(c, r); return v instanceof Date ? "00/00/0000" : typeof v === "number" ? v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + "  " : String(v ?? ""); });
    const w = Math.max(c.label.length * 0.95, ...sample.map((s) => s.length)) + 3;
    ws.getColumn(i + 1).width = Math.min(c.kind === "text" ? 48 : 26, Math.max(10, w));
  });

  // À propos
  if (spec.about !== false) {
    const ab = wb.addWorksheet("À propos", { views: [{ showGridLines: false }] });
    ab.getColumn(1).width = 30; ab.getColumn(2).width = 64; ab.getColumn(3).width = 18;
    ab.getCell("A1").value = "ROTHSCHILD & CO  ·  ASSET MANAGEMENT";
    ab.getCell("A1").font = { name: FONT, size: 8, bold: true, color: { argb: GOLD } };
    ab.getCell("A2").value = spec.title;
    ab.getCell("A2").font = { name: SERIF, size: 18, color: { argb: NAVY } };
    ab.getRow(2).height = 28;
    const kv: [string, string][] = [
      ["Exporté le", today()],
      ...((spec.context ?? []).map((c) => [c.label, c.value]) as [string, string][]),
      ["Lignes", spec.rows.length.toLocaleString("fr-FR")],
      ["Source", spec.mock ? "Données fictives au schéma exact du Lakehouse (aucune donnée réelle)" : "Microsoft Fabric — Lakehouse, lecture seule"],
      ["Diffusion", "Usage interne. Ne pas transmettre à l'extérieur sans validation."],
    ];
    kv.forEach(([k, v], i) => {
      const r = ab.getRow(4 + i);
      r.getCell(1).value = k; r.getCell(1).font = { name: FONT, size: 9, bold: true, color: { argb: NAVY } };
      r.getCell(2).value = v; r.getCell(2).font = { name: FONT, size: 9, color: { argb: INK } };
      r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    });
    const h0 = 5 + kv.length;
    ["Colonne", "Définition", "Format"].forEach((t, i) => {
      const c = ab.getRow(h0).getCell(i + 1);
      c.value = t; c.font = { name: FONT, size: 9, bold: true, color: { argb: WHITE } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      c.border = { bottom: { style: "medium", color: { argb: GOLD } } };
      c.alignment = { indent: 1, vertical: "middle" };
    });
    ab.getRow(h0).height = 22;
    const KIND: Record<ColKind, string> = { text: "Texte", code: "Code", int: "Nombre entier", num: "Nombre", eur: "Montant en euros", pct: "Pourcentage", date: "Date", bool: "Oui / Non" };
    cols.forEach((c, i) => {
      const r = ab.getRow(h0 + 1 + i);
      r.getCell(1).value = c.label; r.getCell(1).font = { name: FONT, size: 9, bold: true, color: { argb: INK } };
      r.getCell(2).value = c.desc ?? ""; r.getCell(2).font = { name: FONT, size: 9, color: { argb: INK } }; r.getCell(2).alignment = { wrapText: true, vertical: "top" };
      r.getCell(3).value = KIND[c.kind ?? "text"]; r.getCell(3).font = { name: FONT, size: 9, color: { argb: MUTED } };
      for (let j = 1; j <= 3; j++) {
        r.getCell(j).border = { bottom: { style: "hair", color: { argb: STONE } } };
        if (i % 2 === 1) r.getCell(j).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
    });
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
export function toCsv<R>(rows: R[], cols: ExportCol<R>[]): Blob {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const fmt = (c: ExportCol<R>, r: R) => {
    const v = cellValue(c, r);
    if (v == null) return "";
    if (v instanceof Date) return v.toLocaleDateString("fr-FR", { timeZone: "UTC" });
    if (typeof v === "number") return (c.kind === "pct" ? (v * 100).toFixed(2) : String(v)).replace(".", ",");
    return String(v);
  };
  const body = [cols.map((c) => esc(c.label + (c.kind === "pct" ? " (%)" : ""))).join(";"), ...rows.map((r) => cols.map((c) => esc(fmt(c, r))).join(";"))].join("\n");
  return new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
}
