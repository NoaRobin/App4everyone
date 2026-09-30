import { describe, expect, it } from "vitest";
import { SearchIndex, hrefFor, norm, osa } from "./search";
import type { SearchEntry } from "./types";

const E: SearchEntry[] = [
  { t: "fonds", id: "f1", label: "Europe Valeur", family: "ae", aum: 3e9, terms: ["PG2013"], attrs: { sfdr: "Article 8", manager: "Claire Vasseur", countries: ["France", "Italie"] } },
  { t: "fonds", id: "f2", label: "Europe Croissance Durable", family: "ae", aum: 7e8, terms: [], attrs: { sfdr: "Article 9", manager: "Marc Aubry", countries: ["France", "Italie"] } },
  { t: "fonds", id: "f3", label: "Obligations Vertes", family: "fi", aum: 1.6e8, terms: [], attrs: { sfdr: "Article 9", manager: "Inès Marchal", countries: ["Luxembourg"] } },
  { t: "fonds", id: "f4", label: "Crédit Euro Investment Grade", family: "fi", aum: 2.2e9, terms: [], attrs: { sfdr: "Article 8", countries: ["Italie"] } },
  { t: "part", id: "s1", label: "Europe Valeur C", family: "ae", aum: 1e9, terms: ["FRDEMO000015", "DEMOEV C FP"], fund_id: "f1" },
  { t: "gérant", id: "Claire Vasseur", label: "Claire Vasseur", key: "manager", terms: [] },
  { t: "pays", id: "Italie", label: "Italie", key: "country", terms: ["Italy"] },
  { t: "pays", id: "Allemagne", label: "Allemagne", key: "country", terms: ["Germany"] },
  { t: "famille", id: "fi", label: "Fixed Income", key: "family", family: "fi", terms: [] },
  { t: "ligne", id: "JI1", label: "Nordvik Industrie", terms: ["XSDEMO000017"] },
];
const idx = new SearchIndex(E);
const first = (q: string) => idx.search(q).hits[0]?.entry.id;

describe("normalisation", () => {
  it("accents et casse", () => expect(norm("Échéance  2030 — Crédit")).toBe("echeance 2030 credit"));
  it("distance d'édition avec transposition", () => {
    expect(osa("vasseur", "vaseur", 2)).toBe(1);
    expect(osa("euorpe", "europe", 2)).toBe(1);
  });
});

describe("recherche tolérante", () => {
  it("nom exact et préfixe", () => {
    expect(first("europe valeur")).toBe("f1");
    expect(first("oblig vert")).toBe("f3");
  });
  it("sans accents et avec fautes", () => {
    expect(first("credit euro")).toBe("f4");
    expect(first("euorpe valuer")).toBe("f1");
    expect(first("vaseur")).toBe("Claire Vasseur");
  });
  it("ISIN complet ou partiel, ticker", () => {
    expect(first("FRDEMO000015")).toBe("s1");
    expect(first("frdemo00001")).toBe("s1");
    expect(first("XSDEMO000017")).toBe("JI1");
  });
  it("pays en français ou en anglais", () => {
    expect(first("italy")).toBe("Italie");
    expect(first("allemagne")).toBe("Allemagne");
  });
  it("aucun résultat absurde", () => {
    expect(idx.search("zzzzqqq").hits.length).toBe(0);
  });
});

describe("réponses directes", () => {
  it("combinaison de critères", () => {
    const a = idx.search("article 9 italie").answer!;
    expect(a.count).toBe(1);
    expect(a.filters).toEqual({ sfdr: "Article 9", country: "Italie" });
    expect(a.href).toContain("sfdr=Article+9");
  });
  it("encours d'une famille", () => {
    const a = idx.search("encours fixed income").answer!;
    expect(a.aum).toBe(1.6e8 + 2.2e9);
    expect(a.wantsAum).toBe(true);
  });
  it("gérant + SFDR", () => {
    expect(idx.search("fonds art 8 claire vasseur").answer!.count).toBe(1);
  });
  it("pas de réponse si des mots restent inexpliqués", () => {
    expect(idx.search("europe valeur").answer).toBeNull();
  });
});

describe("liens", () => {
  it("chaque type mène à sa page", () => {
    expect(hrefFor(E[0])).toBe("/fonds/f1");
    expect(hrefFor(E[4])).toBe("/parts/s1");
    expect(hrefFor(E[5])).toBe("/selection?manager=Claire+Vasseur");
    expect(hrefFor(E[6])).toBe("/distribution/Italie");
  });
});

describe("questions sur une fiche", () => {
  const idx = new SearchIndex([
    { t: "fonds", id: "F1", label: "Europe Valeur", sub: "Convictions", family: "ae", aum: 3e9, terms: ["europe valeur"] },
    { t: "fonds", id: "F2", label: "Monétaire Euro", family: "fi", aum: 2e9, terms: [] },
  ] as never);
  it("reconnaît le fonds et garde la question", () => {
    const r = idx.search("cut-off europe valeur");
    expect(r.hits.length).toBe(0);
    expect(r.ask?.entry.id).toBe("F1");
    expect(r.ask?.question).toBe("cut-off");
    expect(r.ask?.href).toBe("/fonds/F1?q=cut-off");
  });
  it("accepte le fonds en premier", () => {
    expect(idx.search("monetaire euro frais courants").ask?.question).toBe("frais courants");
  });
  it("ne propose rien sans fonds reconnu", () => {
    expect(idx.search("cut-off xyzabc").ask ?? null).toBeNull();
  });
});
