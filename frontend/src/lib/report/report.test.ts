import { describe, expect, it } from "vitest";
import { cellValue, toCsv, type ExportCol } from "../xlsx";
import { buildReport, sheetName } from "./engine";
import { fmtValue } from "./charts";
import { DATASETS } from "./datasets";
import { THEMES } from "./themes";

describe("studio d'export", () => {
  it("chaque jeu de données a des colonnes uniques et des colonnes par défaut existantes", () => {
    for (const d of DATASETS) {
      const keys = d.columns.map((c) => c.key);
      expect(new Set(keys).size, d.id).toBe(keys.length);
      d.defaults.forEach((k) => expect(keys, `${d.id} → ${k}`).toContain(k));
    }
  });

  it("noms d'onglets valides pour Excel (31 caractères, sans caractères interdits)", () => {
    expect(sheetName("Clientèles × pays : [test] / a\\b ? *")).not.toMatch(/[[\]:*?/\\]/);
    expect(sheetName("x".repeat(60)).length).toBe(31);
    expect(sheetName("")).toBe("Données");
  });

  it("valeurs de cellule : nombres, dates, booléens, vides", () => {
    const c = (kind: ExportCol["kind"]): ExportCol => ({ key: "v", label: "v", kind });
    expect(cellValue(c("eur"), { v: 12.5 })).toBe(12.5);
    expect(cellValue(c("pct"), { v: null })).toBeNull();
    expect(cellValue(c("bool"), { v: true })).toBe("Oui");
    expect(cellValue(c("date"), { v: "2026-09-29" })).toBeInstanceOf(Date);
    expect(cellValue(c("eur"), { v: Number.NaN })).toBeNull();
  });

  it("formats courts des graphiques", () => {
    expect(fmtValue(34_410_000_000, "eur")).toMatch(/Md€$/);
    expect(fmtValue(0.123, "pct")).toMatch(/12,3/);
    expect(fmtValue(null, "eur")).toBe("—");
  });

  it("CSV : séparateur point-virgule, virgule décimale, pourcentages en points", async () => {
    const blob = toCsv([{ a: "x;y", p: 0.1234, n: 1.5 }], [{ key: "a", label: "A" }, { key: "p", label: "P", kind: "pct" }, { key: "n", label: "N", kind: "num" }]);
    const t = await blob.text();
    expect(t).toContain('"x;y";12,34;1,5');
  });

  it("construit un classeur complet sans graphique, dans chaque style", async () => {
    for (const theme of THEMES) {
      const blob = await buildReport({
        title: "Test", confidentiality: "Usage interne", theme, units: "M€", cover: true, dashboard: true, about: true, totals: true, zebra: true,
        sheets: [{ id: "a", name: "Fonds", title: "Fonds", rows: [{ name: "A", aum: 1e9 }, { name: "B", aum: 2e9 }], charts: [],
          columns: [{ key: "name", label: "Fonds" }, { key: "aum", label: "Encours", kind: "eur", sum: true }] as never }],
        kpis: [{ label: "Encours", value: "3 Md€" }], context: [{ label: "Date de valeur", value: "29/09/2026" }], mock: true, heroChart: null,
      });
      expect(blob.size, theme.id).toBeGreaterThan(5000);
    }
  });
});
