/**
 * Moteur du studio d'export : un classeur Excel complet, construit dans le navigateur (ExcelJS, chargé à la demande).
 *
 *   Sommaire     bandeau, titre, indicateurs clés, table des matières (liens vers chaque onglet), graphique principal
 *   Graphiques   tableau de bord : tous les graphiques choisis, en grille
 *   Données      un onglet par jeu de données : en-têtes, volets figés, filtres, formats, totaux, lien retour
 *   À propos     date, contexte, source, définition de chaque colonne
 */
import { cellValue, type ColKind, type ExportCol } from "../xlsx";
import { CHART_H, CHART_W, renderChart, type ChartSpec } from "./charts";
import type { Theme } from "./themes";

export type Unit = "€" | "k€" | "M€" | "Md€";
export type DataSheet = { id: string; name: string; title: string; description?: string; rows: unknown[]; columns: ExportCol<never>[]; charts: ChartSpec[] };
export type ReportSpec = {
  title: string; subtitle?: string; author?: string; confidentiality: string;
  theme: Theme; units: Unit;
  cover: boolean; dashboard: boolean; about: boolean; totals: boolean; zebra: boolean;
  sheets: DataSheet[];
  kpis: { label: string; value: string; sub?: string }[];
  context: { label: string; value: string }[];
  mock: boolean; heroChart?: ChartSpec | null;
};

const A = (h: string) => `FF${h}`;
const NUM: ColKind[] = ["int", "num", "eur", "pct"];
const EUR_FMT: Record<Unit, string> = {
  "€": '#,##0 "€";[Red]-#,##0 "€"', "k€": '#,##0, "k€";[Red]-#,##0, "k€"', "M€": '#,##0.0,, "M€";[Red]-#,##0.0,, "M€"', "Md€": '#,##0.00,,, "Md€";[Red]-#,##0.00,,, "Md€"',
};
const FMT = (k: ColKind | undefined, u: Unit, digits?: number): string | undefined => ({
  text: undefined, code: "@", int: "#,##0", num: digits != null ? `#,##0${digits ? "." + "0".repeat(digits) : ""}` : "#,##0.00", eur: EUR_FMT[u],
  pct: "0.00%;[Red]-0.00%", date: "dd/mm/yyyy", bool: undefined,
} as Record<ColKind, string | undefined>)[k ?? "text"];
const colLetter = (n: number) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
export const sheetName = (s: string) => s.replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim() || "Données";
const today = () => new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

type WS = import("exceljs").Worksheet;
type WB = import("exceljs").Workbook;

function paint(ws: WS, t: Theme, rows: number, cols: number) {
  if (!t.bg) return;
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(r, c);
    if (!cell.fill || (cell.fill as { fgColor?: unknown }).fgColor === undefined) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: A(t.bg) } };
  }
}
function banner(ws: WS, t: Theme, title: string, sub: string | undefined, span: number, startCol = 1) {
  const L = (c: number) => colLetter(startCol + c - 1);
  ws.mergeCells(`${L(1)}1:${L(span)}1`); ws.mergeCells(`${L(1)}2:${L(span)}2`); ws.mergeCells(`${L(1)}3:${L(span)}3`);
  const b = ws.getCell(`${L(1)}1`); b.value = "ROTHSCHILD & CO  ·  ASSET MANAGEMENT"; b.font = { name: t.sans, size: 8, bold: true, color: { argb: A(t.brand) } };
  const ti = ws.getCell(`${L(1)}2`); ti.value = title; ti.font = { name: t.serif, size: 20, color: { argb: A(t.title) } };
  const s = ws.getCell(`${L(1)}3`); s.value = sub ?? ""; s.font = { name: t.sans, size: 9, color: { argb: A(t.muted) } };
  ws.getRow(1).height = 18; ws.getRow(2).height = 32; ws.getRow(3).height = 16;
  for (let i = 1; i <= span; i++) ws.getCell(4, startCol + i - 1).border = { top: { style: "medium", color: { argb: A(t.rule) } } };
  ws.getRow(4).height = 6;
}
function pageSetup(ws: WS, t: Theme, title: string, spec: ReportSpec, landscape = true) {
  ws.pageSetup = { orientation: landscape ? "landscape" : "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
  ws.headerFooter = {
    oddHeader: `&L&"${t.sans}"&8Rothschild & Co Asset Management&R&"${t.sans}"&8${title.replace(/&/g, "&&")}`,
    oddFooter: `&L&"${t.sans}"&7${spec.confidentiality}${spec.mock ? " · données fictives" : ""} · ${today()}&R&"${t.sans}"&7Page &P / &N`,
  };
}
function addChart(wb: WB, ws: WS, chart: ChartSpec, t: Theme, col: number, row: number) {
  const id = wb.addImage({ base64: renderChart(chart, t), extension: "png" });
  ws.addImage(id, { tl: { col, row }, ext: { width: CHART_W, height: CHART_H } });
}

// ------------------------------------------------------------------ onglets
function coverSheet(wb: WB, spec: ReportSpec, names: Map<string, string>) {
  const t = spec.theme;
  const ws = wb.addWorksheet("Sommaire", { views: [{ showGridLines: false }], properties: { tabColor: { argb: A(t.rule) } } });
  [3, 22, 22, 22, 22, 22, 22, 3].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  pageSetup(ws, t, spec.title, spec, false);
  const b = ws.getCell("B2"); b.value = "ROTHSCHILD & CO  ·  ASSET MANAGEMENT"; b.font = { name: t.sans, size: 9, bold: true, color: { argb: A(t.brand) } };
  ws.mergeCells("B4:G4"); const ti = ws.getCell("B4"); ti.value = spec.title; ti.font = { name: t.serif, size: 30, color: { argb: A(t.title) } }; ws.getRow(4).height = 46;
  ws.mergeCells("B5:G5"); const su = ws.getCell("B5"); su.value = spec.subtitle ?? ""; su.font = { name: t.sans, size: 11, color: { argb: A(t.ink) } };
  ws.mergeCells("B6:G6"); const me = ws.getCell("B6");
  me.value = [...spec.context.map((c) => `${c.label} : ${c.value}`), spec.author ? `Préparé par ${spec.author}` : null, `Édité le ${today()}`].filter(Boolean).join("   ·   ");
  me.font = { name: t.sans, size: 9, color: { argb: A(t.muted) } };
  for (let c = 2; c <= 7; c++) ws.getCell(7, c).border = { bottom: { style: "medium", color: { argb: A(t.rule) } } };
  ws.getRow(7).height = 8;
  // indicateurs clés : 3 par ligne, 2 colonnes chacun
  let r = 9;
  spec.kpis.slice(0, 6).forEach((k, i) => {
    const row = r + Math.floor(i / 3) * 4, c = 2 + (i % 3) * 2;
    ws.mergeCells(row, c, row, c + 1); ws.mergeCells(row + 1, c, row + 1, c + 1); ws.mergeCells(row + 2, c, row + 2, c + 1);
    const l = ws.getCell(row, c), v = ws.getCell(row + 1, c), s = ws.getCell(row + 2, c);
    l.value = k.label.toUpperCase(); l.font = { name: t.sans, size: 8, bold: true, color: { argb: A(t.kpiLabel) } };
    v.value = k.value; v.font = { name: t.serif, size: 24, color: { argb: A(t.kpiInk) } };
    s.value = k.sub ?? ""; s.font = { name: t.sans, size: 8, color: { argb: A(t.muted) } };
    for (let rr = row; rr <= row + 2; rr++) for (let cc = c; cc <= c + 1; cc++) {
      const cell = ws.getCell(rr, cc);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: A(t.kpiFill) } };
      cell.alignment = { vertical: "middle", indent: 1 };
      if (rr === row) cell.border = { top: { style: "medium", color: { argb: A(t.rule) } } };
    }
    ws.getRow(row + 1).height = 34;
  });
  r = 9 + Math.ceil(Math.min(6, spec.kpis.length) / 3) * 4 + 1;
  // table des matières
  const h = ws.getCell(r, 2); h.value = "CONTENU DU CLASSEUR"; h.font = { name: t.sans, size: 9, bold: true, color: { argb: A(t.brand) } };
  r += 1;
  const toc: [string, string, string][] = [
    ...(spec.dashboard && spec.sheets.some((s) => s.charts.length) ? [["Graphiques", "Tableau de bord : tous les graphiques du classeur", `${spec.sheets.reduce((a, s) => a + s.charts.length, 0)} graphiques`] as [string, string, string]] : []),
    ...spec.sheets.map((s) => [names.get(s.id)!, s.description ?? s.title, `${s.rows.length.toLocaleString("fr-FR")} lignes`] as [string, string, string]),
    ...(spec.about ? [["À propos", "Source, contexte et définition de chaque colonne", ""] as [string, string, string]] : []),
  ];
  toc.forEach(([name, desc, n], i) => {
    const row = r + i;
    const a = ws.getCell(row, 2);
    a.value = { text: name, hyperlink: `#'${name.replace(/'/g, "''")}'!A1` } as never;
    a.font = { name: t.sans, size: 10, bold: true, color: { argb: A(t.title) }, underline: false };
    ws.mergeCells(row, 3, row, 6);
    const d = ws.getCell(row, 3); d.value = desc; d.font = { name: t.sans, size: 9, color: { argb: A(t.ink) } };
    const nn = ws.getCell(row, 7); nn.value = n; nn.font = { name: t.sans, size: 9, color: { argb: A(t.muted) } }; nn.alignment = { horizontal: "right" };
    for (let c = 2; c <= 7; c++) ws.getCell(row, c).border = { bottom: { style: "hair", color: { argb: A(t.border) } } };
    ws.getRow(row).height = 20;
  });
  r += toc.length + 2;
  if (spec.heroChart) { addChart(wb, ws, spec.heroChart, t, 1, r - 1); r += 19; }
  const n1 = ws.getCell(r, 2);
  n1.value = spec.mock ? "Source : données fictives au schéma exact du Lakehouse — aucune donnée réelle." : "Source : Microsoft Fabric, Lakehouse (lecture seule). Chiffres à la date de valeur indiquée.";
  n1.font = { name: t.sans, size: 8, italic: true, color: { argb: A(t.muted) } };
  const n2 = ws.getCell(r + 1, 2); n2.value = `${spec.confidentiality}. Les revenus sont estimés (encours × frais) ; la collecte est estimée à partir des encours et des VL.`;
  n2.font = { name: t.sans, size: 8, italic: true, color: { argb: A(t.muted) } };
  paint(ws, t, r + 4, 8);
}

function dashboardSheet(wb: WB, spec: ReportSpec) {
  const t = spec.theme;
  const charts = spec.sheets.flatMap((s) => s.charts);
  if (!charts.length) return;
  const ws = wb.addWorksheet("Graphiques", { views: [{ showGridLines: false }], properties: { tabColor: { argb: A(t.brand) } } });
  for (let c = 1; c <= 22; c++) ws.getColumn(c).width = 10;
  ws.getColumn(1).width = 2;
  pageSetup(ws, t, spec.title, spec);
  banner(ws, t, "Tableau de bord", `${charts.length} graphiques · ${spec.title}`, 19, 2);
  const back = ws.getCell("U1"); back.value = { text: "← Sommaire", hyperlink: "#'Sommaire'!A1" } as never; back.font = { name: t.sans, size: 9, color: { argb: A(t.brand) } };
  charts.forEach((c, i) => addChart(wb, ws, c, t, 1.2 + (i % 2) * 10, 5.5 + Math.floor(i / 2) * 18.5));
  paint(ws, t, 8 + Math.ceil(charts.length / 2) * 19, 22);
}

function dataSheet(wb: WB, spec: ReportSpec, s: DataSheet, name: string) {
  const t = spec.theme;
  const cols = s.columns as ExportCol<unknown>[];
  const n = cols.length;
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", xSplit: 1, ySplit: 6, showGridLines: false }] });
  pageSetup(ws, t, `${spec.title} — ${s.title}`, spec);
  ws.pageSetup.printTitlesRow = "6:6";
  banner(ws, t, s.title, [s.description, `${s.rows.length.toLocaleString("fr-FR")} lignes`, spec.context.map((c) => `${c.label} : ${c.value}`).join(" · ")].filter(Boolean).join("   ·   "), Math.max(n, 4));
  if (spec.cover) {
    const back = ws.getCell(1, Math.max(n, 4) + 2); back.value = { text: "← Sommaire", hyperlink: "#'Sommaire'!A1" } as never;
    back.font = { name: t.sans, size: 9, color: { argb: A(t.brand) } };
  }
  const head = ws.getRow(6);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.font = { name: t.sans, size: 9, bold: true, color: { argb: A(t.headInk) } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: A(t.headFill) } };
    cell.alignment = { vertical: "middle", horizontal: NUM.includes(c.kind ?? "text") ? "right" : "left", wrapText: true, indent: 1 };
    cell.border = { bottom: { style: "medium", color: { argb: A(t.headRule) } } };
  });
  head.height = 30;
  s.rows.forEach((r, k) => {
    const row = ws.getRow(7 + k);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = cellValue(c, r) as never;
      const fmt = FMT(c.kind, spec.units, c.digits);
      if (fmt) cell.numFmt = fmt;
      cell.font = { name: c.kind === "code" ? "Consolas" : t.sans, size: 9, color: { argb: A(t.ink) }, bold: i === 0 };
      cell.alignment = { vertical: "middle", horizontal: NUM.includes(c.kind ?? "text") ? "right" : c.kind === "bool" || c.kind === "date" ? "center" : "left", indent: 1 };
      cell.border = { bottom: { style: "hair", color: { argb: A(t.border) } } };
      const z = spec.zebra && t.zebra && k % 2 === 1 ? t.zebra : t.bg;
      if (z) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: A(z) } };
    });
    row.height = 18;
  });
  const first = 7, last = 6 + s.rows.length;
  if (spec.totals && s.rows.length && cols.some((c) => c.sum)) {
    const row = ws.getRow(last + 1);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1), L = colLetter(i + 1);
      if (i === 0) cell.value = "Total (lignes filtrées)";
      else if (c.sum) { cell.value = { formula: `SUBTOTAL(109,${L}${first}:${L}${last})` } as never; cell.numFmt = FMT(c.kind, spec.units, c.digits) ?? "#,##0"; }
      cell.font = { name: t.sans, size: 9, bold: true, color: { argb: A(t.totalInk) } };
      cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "right", indent: 1 };
      cell.border = { top: { style: "thin", color: { argb: A(t.totalInk) } }, bottom: { style: "double", color: { argb: A(t.totalInk) } } };
      if (t.bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: A(t.bg) } };
    });
    row.height = 20;
  }
  if (s.rows.length) ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: last, column: n } };
  cols.forEach((c, i) => {
    const sample = (s.rows as unknown[]).slice(0, 300).map((r) => { const v = cellValue(c, r); return v instanceof Date ? "00/00/0000" : typeof v === "number" ? (c.kind === "eur" ? "000 000 000 €" : v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })) + " " : String(v ?? ""); });
    ws.getColumn(i + 1).width = Math.min(c.kind === "text" ? 46 : 24, Math.max(10, Math.max(c.label.length * 0.9, ...sample.map((x) => x.length)) + 3));
  });
  paint(ws, t, last + 6, n + 3);
}

function aboutSheet(wb: WB, spec: ReportSpec) {
  const t = spec.theme;
  const ws = wb.addWorksheet("À propos", { views: [{ showGridLines: false }] });
  [26, 30, 70, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  pageSetup(ws, t, spec.title, spec, false);
  banner(ws, t, "À propos de ce classeur", spec.title, 4);
  const kv: [string, string][] = [
    ["Édité le", today()], ...spec.context.map((c) => [c.label, c.value] as [string, string]),
    ...(spec.author ? [["Préparé par", spec.author] as [string, string]] : []),
    ["Source", spec.mock ? "Données fictives au schéma exact du Lakehouse (aucune donnée réelle)" : "Microsoft Fabric — Lakehouse, lecture seule"],
    ["Diffusion", spec.confidentiality],
    ["Montants", `En euros, affichés en ${spec.units} (valeurs complètes conservées dans les cellules)`],
    ["Estimations", "Revenus = encours × frais de gestion ; collecte estimée à partir des encours et des VL ; aucun encours n'est ventilé par pays ou par client."],
  ];
  let r = 6;
  kv.forEach(([k, v]) => {
    const a = ws.getCell(r, 1); a.value = k; a.font = { name: t.sans, size: 9, bold: true, color: { argb: A(t.title) } };
    ws.mergeCells(r, 2, r, 4); const b = ws.getCell(r, 2); b.value = v; b.font = { name: t.sans, size: 9, color: { argb: A(t.ink) } }; b.alignment = { wrapText: true, vertical: "top" };
    r += 1;
  });
  r += 1;
  const KIND: Record<string, string> = { text: "Texte", code: "Code", int: "Nombre entier", num: "Nombre", eur: "Montant (€)", pct: "Pourcentage", date: "Date", bool: "Oui / Non" };
  ["Onglet", "Colonne", "Définition", "Format"].forEach((x, i) => {
    const c = ws.getCell(r, i + 1); c.value = x; c.font = { name: t.sans, size: 9, bold: true, color: { argb: A(t.headInk) } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: A(t.headFill) } }; c.border = { bottom: { style: "medium", color: { argb: A(t.headRule) } } }; c.alignment = { indent: 1 };
  });
  r += 1;
  spec.sheets.forEach((s) => (s.columns as ExportCol<unknown>[]).forEach((c, i) => {
    const vals = [i === 0 ? s.title : "", c.label, c.desc ?? "", KIND[c.kind ?? "text"]];
    vals.forEach((v, j) => {
      const cell = ws.getCell(r, j + 1); cell.value = v;
      cell.font = { name: t.sans, size: 9, bold: j < 2, color: { argb: A(j === 3 ? t.muted : t.ink) } };
      cell.alignment = { wrapText: j === 2, vertical: "top", indent: 1 };
      cell.border = { bottom: { style: "hair", color: { argb: A(t.border) } } };
    });
    r += 1;
  }));
  paint(ws, t, r + 3, 5);
}

/** Construit le classeur et renvoie le fichier. */
export async function buildReport(spec: ReportSpec): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rothschild & Co Asset Management — application interne";
  wb.title = spec.title; wb.subject = spec.subtitle ?? ""; wb.created = new Date();
  // noms d'onglets uniques
  const names = new Map<string, string>();
  const used = new Set(["Sommaire", "Graphiques", "À propos"]);
  spec.sheets.forEach((s) => {
    let nm = sheetName(s.name), k = 2;
    while (used.has(nm)) nm = sheetName(`${s.name.slice(0, 27)} ${k++}`);
    used.add(nm); names.set(s.id, nm);
  });
  if (spec.cover) coverSheet(wb, spec, names);
  if (spec.dashboard) dashboardSheet(wb, spec);
  spec.sheets.forEach((s) => dataSheet(wb, spec, s, names.get(s.id)!));
  if (spec.about) aboutSheet(wb, spec);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
