import { describe, expect, it } from "vitest";
import { buildWorkbook, tableName, toTsv, uniqueHeaders, type ExportCol } from "../xlsx";
import { applyFilters, applySort, defaultFilter, describe as describeFilter, facet, type Filter } from "./filters";
import { DEFAULT_SRC, SOURCES, periodBounds, type Row } from "./sources";

const cols: ExportCol<Row>[] = [
  { key: "d", label: "Date", kind: "date" }, { key: "f", label: "Fonds" }, { key: "a", label: "Encours", kind: "eur", sum: true }, { key: "p", label: "Perf", kind: "pct" },
];
const rows: Row[] = [
  { d: "2026-01-31", f: "A", a: 100, p: 0.05 }, { d: "2026-02-28", f: "B", a: 300, p: -0.02 }, { d: "2026-03-31", f: "A", a: 200, p: null },
];
const byKey = new Map(cols.map((c) => [c.key, c]));

describe("export de données", () => {
  it("chaque source a des colonnes uniques et des colonnes par défaut existantes", () => {
    for (const s of SOURCES) {
      const keys = s.columns.map((c) => c.key);
      expect(new Set(keys).size, s.id).toBe(keys.length);
      for (const lvl of ["maison", "famille", "fonds", "part"] as const) s.defaults({ ...DEFAULT_SRC, level: lvl }).filter((k) => !k.startsWith("pi.")).forEach((k) => expect(keys, `${s.id} → ${k}`).toContain(k));
    }
  });

  it("bornes de période depuis la date de valeur", () => {
    expect(periodBounds({ ...DEFAULT_SRC, span: "YTD" }, "2026-09-29")).toEqual({ from: "2026-01-01", to: null });
    expect(periodBounds({ ...DEFAULT_SRC, span: "1A" }, "2026-09-29").from).toBe("2025-09-29");
    expect(periodBounds({ ...DEFAULT_SRC, span: "Tout" }, "2026-09-29")).toEqual({ from: null, to: null });
    expect(periodBounds({ ...DEFAULT_SRC, span: "perso", from: "2024-01-01", to: "2024-12-31" }, "2026-09-29")).toEqual({ from: "2024-01-01", to: "2024-12-31" });
  });

  it("filtres : valeurs, bornes numériques, dates ; tri avec les vides en dernier", () => {
    const f: Filter[] = [{ col: "f", op: "in", values: ["A"] }];
    expect(applyFilters(rows, f, byKey).map((r) => r.a)).toEqual([100, 200]);
    expect(applyFilters(rows, [{ col: "a", op: "range", min: 150, max: null }], byKey)).toHaveLength(2);
    expect(applyFilters(rows, [{ col: "d", op: "dates", from: "2026-02-01", to: "2026-02-28" }], byKey)).toHaveLength(1);
    expect(applyFilters(rows, [{ col: "f", op: "in", values: [] }], byKey)).toHaveLength(3);
    expect(applySort(rows, { col: "p", dir: -1 }, byKey).map((r) => r.p)).toEqual([0.05, -0.02, null]);
    expect(facet(rows, cols[1])).toEqual([{ value: "A", n: 2 }, { value: "B", n: 1 }]);
    expect(defaultFilter(rows, cols[2]).op).toBe("range");
    expect(describeFilter({ col: "p", op: "range", min: 0.01, max: null }, cols[3])).toContain("1 %");
  });

  it("en-têtes uniques et noms de tableau valides", () => {
    expect(uniqueHeaders(["Encours", "encours", "", "Encours"])).toEqual(["Encours", "encours (2)", "Colonne", "Encours (3)"]);
    expect(tableName("Encours dans le temps")).toBe("T_Encours_dans_le_temps");
    expect(tableName("Clientèles × pays")).toMatch(/^T_[A-Za-z0-9_]+$/);
  });

  it("copie pour Excel : tabulations, virgule décimale, pourcentages", () => {
    const t = toTsv(rows.slice(0, 1), cols);
    expect(t.split("\r\n")[0]).toBe("Date\tFonds\tEncours\tPerf");
    expect(t.split("\r\n")[1]).toBe("31/01/2026\tA\t100\t5 %");
  });

  it("classeur propre : tableau structuré en A1, vrais types, aucune fusion, dictionnaire et paramètres", async () => {
    const blob = await buildWorkbook({ title: "Test", filename: "t", sheet: "Encours", rows, columns: cols, grain: "Une ligne par fonds et par date", context: [{ label: "Période", value: "2026" }], totals: true, style: "bordeaux" });
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Encours", "Dictionnaire", "Paramètres"]);
    const ws = wb.getWorksheet("Encours")!;
    expect(ws.getCell("A1").value).toBe("Date");
    expect(ws.getCell("A2").value).toBeInstanceOf(Date);
    expect(ws.getCell("C2").value).toBe(100);
    expect(ws.getCell("D2").value).toBe(0.05);
    expect(ws.getCell("C2").numFmt).toBe("#,##0.00");
    expect(ws.getCell("D2").numFmt).toBe("0.00%");
    expect(Object.keys((ws as unknown as { _merges: object })._merges)).toHaveLength(0);
    expect(ws.getTables().length).toBe(1);
    expect((ws.getCell("A1").fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe("FF8A1E41");
  });
});
