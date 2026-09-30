import { describe, expect, it } from "vitest";
import { date, eur, pct, pctRaw } from "./format";

const clean = (s: string) => s.replace(/ | /g, " ");

describe("formats français", () => {
  it("montants", () => {
    expect(clean(eur(34_414_000_000))).toBe("34,41 Md€");
    expect(clean(eur(845_300_000))).toBe("845 M€");
    expect(clean(eur(84_530_000))).toBe("84,5 M€");
    expect(clean(eur(-12_500_000, { signed: true }))).toBe("−12,5 M€");
    expect(clean(eur(3_200_000, { signed: true }))).toBe("+3,2 M€");
    expect(eur(null)).toBe("—");
  });
  it("pourcentages", () => {
    expect(clean(pct(0.0243))).toBe("+2,43 %");
    expect(clean(pct(-0.153))).toBe("−15,3 %");
    expect(clean(pctRaw(1.35))).toBe("1,35 %");
  });
  it("dates JJ/MM/AAAA", () => {
    expect(date("2026-09-29")).toBe("29/09/2026");
  });
});
