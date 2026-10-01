import { describe, expect, it } from "vitest";
import { osa, SearchIndex } from "./search";
import type { SearchEntry } from "./types";

/** Implémentation d'origine d'osa (matrice allouée à chaque appel, sortie anticipée) : référence exacte. */
function original(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

describe("recherche à grand volume", () => {
  it("osa (tampon réutilisé) donne exactement le même résultat que l'implémentation d'origine", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const word = () => Array.from({ length: 1 + Math.floor(rnd() * 9) }, () => "abcde"[Math.floor(rnd() * 5)]).join("");
    for (let k = 0; k < 2000; k++) {
      const a = word(), b = word(), max = 1 + Math.floor(rnd() * 2);
      expect(osa(a, b, max)).toBe(original(a, b, max));
    }
  });

  it("20 000 lignes : une requête reste rapide et les résultats sont stables d'un appel à l'autre", () => {
    const names = ["Nordvik", "Castellane", "Arvella", "Belmont", "Atlas", "Keystone", "Harbor", "Summit"];
    const entries: SearchEntry[] = Array.from({ length: 20000 }, (_, i) => ({
      t: "ligne", id: `L${i}`, label: `${names[i % 8]} ${names[(i * 3) % 8]} ${2026 + (i % 9)}`, terms: [`XS${1000000000 + i}`],
    } as SearchEntry));
    entries.push({ t: "fonds", id: "F1", label: "Europe Valeur", terms: [], family: "ae", aum: 3e9 } as SearchEntry);
    const ix = new SearchIndex(entries);
    const t0 = performance.now();
    const a = ix.search("europe valuer");
    const dt = performance.now() - t0;
    expect(a.hits[0]?.entry.id).toBe("F1");
    expect(JSON.stringify(ix.search("europe valuer"))).toBe(JSON.stringify(a));
    expect(dt).toBeLessThan(1500);
  });
});
