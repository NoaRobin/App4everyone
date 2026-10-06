/**
 * Version PDF du rapport mis en forme : une mise en page A4 paysage imprimée par le navigateur (« Enregistrer au format PDF »).
 * Même contenu que le classeur : page de garde et indicateurs, graphiques, tableaux (les 60 premières lignes de chaque
 * onglet, le classeur Excel portant les données complètes), définitions. Rien ne quitte le navigateur.
 */
import { cellValue, type ExportCol } from "../xlsx";
import { renderChart } from "./charts";
import type { ReportSpec, Unit } from "./engine";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const DIV: Record<Unit, number> = { "€": 1, "k€": 1e3, "M€": 1e6, "Md€": 1e9 };
const MAX_ROWS = 60;

function fmt(c: ExportCol<never>, r: never, u: Unit): string {
  const v = cellValue(c, r);
  if (v == null) return "";
  if (v instanceof Date) return v.toLocaleDateString("fr-FR", { timeZone: "UTC" });
  if (typeof v === "number") {
    if (c.kind === "pct") return `${(v * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
    if (c.kind === "eur") return `${(v / DIV[u]).toLocaleString("fr-FR", { maximumFractionDigits: u === "€" ? 0 : u === "Md€" ? 2 : 1 })} ${u}`;
    if (c.kind === "int") return Math.round(v).toLocaleString("fr-FR");
    return v.toLocaleString("fr-FR", { maximumFractionDigits: c.digits ?? 2 });
  }
  return String(v);
}

export function reportHtml(spec: ReportSpec): string {
  const t = spec.theme, h = (x: string) => `#${x}`;
  const charts = spec.sheets.flatMap((s) => s.charts);
  const img = (c: (typeof charts)[number]) => `<figure><img src="${renderChart(c, t, 2)}" alt="${esc(c.title)}"/></figure>`;
  const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const NUM = new Set(["int", "num", "eur", "pct"]);
  const sheets = spec.sheets.map((s) => {
    const cols = s.columns;
    const rows = (s.rows as never[]).slice(0, MAX_ROWS);
    return `<section class="sheet">
      <div class="eyebrow">${esc(s.name)}</div><h2>${esc(s.title)}</h2>${s.description ? `<p class="lede">${esc(s.description)}</p>` : ""}
      ${s.charts.length ? `<div class="charts">${s.charts.map(img).join("")}</div>` : ""}
      <table><thead><tr>${cols.map((c) => `<th class="${NUM.has(c.kind ?? "") ? "n" : ""}">${esc(c.label)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${NUM.has(c.kind ?? "") ? "n" : ""}">${esc(fmt(c, r, spec.units))}</td>`).join("")}</tr>`).join("")}</tbody></table>
      ${s.rows.length > MAX_ROWS ? `<p class="note">${MAX_ROWS} premières lignes sur ${s.rows.length.toLocaleString("fr-FR")} — le classeur Excel contient toutes les lignes.</p>` : ""}
    </section>`;
  }).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(spec.title)}</title><style>
    @page { size: A4 landscape; margin: 14mm 14mm 16mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; font: 9.5pt/1.45 ${t.sans}, Arial, sans-serif; color: ${h(t.ink)}; background: #fff; }
    .brand { font-size: 7.5pt; font-weight: 700; letter-spacing: .22em; color: ${h(t.brand)}; }
    h1 { font: 400 34pt/1.05 ${t.serif}, Georgia, serif; color: ${h(t.title)}; margin: 14mm 0 4mm; }
    h2 { font: 400 18pt/1.1 ${t.serif}, Georgia, serif; color: ${h(t.title)}; margin: 2mm 0 2mm; }
    .eyebrow { font-size: 7.5pt; letter-spacing: .18em; text-transform: uppercase; color: ${h(t.brand)}; font-weight: 700; }
    .lede, .note, .meta { color: ${h(t.muted)}; }
    .rule { height: 2px; width: 60mm; background: ${h(t.rule)}; margin: 6mm 0; }
    .cover { page-break-after: always; min-height: 170mm; position: relative; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin: 8mm 0; }
    .kpi { background: ${h(t.kpiFill)}; padding: 4mm 5mm; border-top: 2px solid ${h(t.rule)}; }
    .kpi b { display: block; font: 400 20pt/1.1 ${t.serif}, Georgia, serif; color: ${h(t.kpiInk)}; margin-top: 1mm; }
    .kpi span { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .1em; color: ${h(t.kpiLabel)}; }
    .kpi i { display: block; font-style: normal; font-size: 8pt; color: ${h(t.muted)}; }
    .hero img { width: 150mm; }
    .foot { position: absolute; bottom: 0; left: 0; right: 0; font-size: 7.5pt; color: ${h(t.muted)}; border-top: 1px solid ${h(t.border)}; padding-top: 2mm; }
    .sheet { page-break-before: always; }
    .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin: 3mm 0 5mm; }
    figure { margin: 0; break-inside: avoid; } figure img { width: 100%; display: block; }
    table { width: 100%; border-collapse: collapse; font-size: 8pt; }
    thead { display: table-header-group; }
    th { background: ${h(t.headFill)}; color: ${h(t.headInk)}; text-align: left; padding: 2mm 2mm; border-bottom: 1.5px solid ${h(t.headRule)}; font-weight: 700; }
    td { padding: 1.4mm 2mm; border-bottom: 0.5px solid ${h(t.border)}; }
    tr:nth-child(even) td { background: ${t.zebra ? h(t.zebra) : "transparent"}; }
    tr { break-inside: avoid; }
    .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    dl { display: grid; grid-template-columns: 50mm 1fr; gap: 1.5mm 6mm; }
    dt { font-weight: 700; color: ${h(t.title)}; } dd { margin: 0; }
  </style></head><body>
  <section class="cover">
    <div class="brand">ROTHSCHILD &amp; CO · ASSET MANAGEMENT</div>
    <h1>${esc(spec.title)}</h1>
    ${spec.subtitle ? `<div class="lede">${esc(spec.subtitle)}</div>` : ""}
    <div class="rule"></div>
    <div class="meta">${[...spec.context.map((c) => `${esc(c.label)} : ${esc(c.value)}`), `Édité le ${date}`, spec.author ? `Préparé par ${esc(spec.author)}` : ""].filter(Boolean).join(" · ")}</div>
    ${spec.kpis.length ? `<div class="kpis">${spec.kpis.map((k) => `<div class="kpi"><span>${esc(k.label)}</span><b>${esc(k.value)}</b>${k.sub ? `<i>${esc(k.sub)}</i>` : ""}</div>`).join("")}</div>` : ""}
    ${spec.heroChart ? `<div class="hero">${img(spec.heroChart)}</div>` : ""}
    <div class="foot">${esc(spec.confidentiality)}${spec.mock ? " · données fictives" : ""} · Rothschild &amp; Co Asset Management</div>
  </section>
  ${sheets}
  ${spec.about ? `<section class="sheet"><div class="eyebrow">À propos</div><h2>Source et définitions</h2>
    <p class="lede">${spec.mock ? "Données fictives au schéma exact du Lakehouse (aucune donnée réelle)." : "Microsoft Fabric — Lakehouse, lecture seule."} Les collectes sont estimées à partir des encours et des VL ; les revenus sont estimés (encours × taux de frais).</p>
    <dl>${[...new Map(spec.sheets.flatMap((s) => s.columns).filter((c) => c.desc).map((c) => [c.label, c.desc])).entries()].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></section>` : ""}
  </body></html>`;
}

/** Ouvre la boîte d'impression du navigateur sur le rapport (destination « Enregistrer au format PDF »). */
export function printReport(spec: ReportSpec) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(f);
  const doc = f.contentDocument!;
  doc.open(); doc.write(reportHtml(spec)); doc.close();
  const go = () => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60_000); };
  const imgs = [...doc.images];
  Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = i.onerror = () => r(null); })))).then(() => setTimeout(go, 50));
}
