import { describe, expect, it } from "vitest";
import { norm, SearchIndex } from "./search";
import type { SearchEntry } from "./types";

describe("données réelles incomplètes : champs nuls", () => {
  it("norm tolère null, undefined et les nombres", () => {
    expect(norm(null)).toBe("");
    expect(norm(undefined)).toBe("");
    expect(norm(12345)).toBe("12345");
    expect(norm("  Épargne  ")).toBe("epargne");
  });

  it("l'index et la recherche supportent libellés, sous-titres et codes nuls", () => {
    const entries = [
      { t: "fonds", id: "F1", label: null, sub: null, terms: [null, "FR0000000001", undefined], family: "fi" },
      { t: "part", id: "P1", label: "R-co 4Change Net Zero Credit Euro C", sub: undefined, terms: null, fund_id: "F1" },
      { t: "gérant", id: "G", label: "Claire Vasseur", key: "manager", terms: [] },
    ] as unknown as SearchEntry[];
    const ix = new SearchIndex(entries);
    expect(() => ix.search("4change")).not.toThrow();
    expect(ix.search("4change").hits[0]?.entry.id).toBe("P1");
    expect(ix.search("FR0000000001").hits[0]?.entry.id).toBe("F1");
    expect(() => ix.search("article 9 italie")).not.toThrow();
  });
});
