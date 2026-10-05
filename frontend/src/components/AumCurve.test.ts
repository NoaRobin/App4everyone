import { describe, expect, it } from "vitest";
import { periodLabel, tickEur, type SeriesPoint } from "./AumCurve";

const pt = (d: string, p: string): SeriesPoint => ({ d, p, aum: 1, delta: null, pct: null, flows: null, market: null });

describe("courbe des encours", () => {
  it("nomme la période de chaque point", () => {
    expect(periodLabel(pt("2026-10-05", "2026-10-05"), "J")).toBe("5 octobre 2026");
    expect(periodLabel(pt("2026-10-02", "2026-09-28"), "S")).toBe("Semaine du 28 septembre 2026");
    expect(periodLabel(pt("2026-09-30", "2026-09-01"), "M")).toBe("Septembre 2026");
    expect(periodLabel(pt("2026-09-30", "2026-07-01"), "T")).toBe("T3 2026");
    expect(periodLabel(pt("2025-12-31", "2025-01-01"), "A")).toBe("2025");
  });
  it("gradue sans décimales inutiles", () => {
    expect(tickEur(34.5e9)).toBe("34,5 Md€");
    expect(tickEur(35e9)).toBe("35 Md€");
    expect(tickEur(820e6)).toBe("820 M€");
    expect(tickEur(-136e6)).toBe("−136 M€");
  });
});
