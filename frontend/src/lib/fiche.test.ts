import { describe, expect, it } from "vitest";
import { searchFiche, type FicheEntry } from "./fiche";

const E: FicheEntry[] = [
  { group: "Part C", label: "Part C · Heure limite (cut-off)", value: "12:00 · règlement J+2", anchor: "part-c", terms: "Europe Valeur C part heure limite" },
  { group: "Part I", label: "Part I · Minimum de souscription", value: "1,0 M€", anchor: "part-i", terms: "Europe Valeur I part minimum ticket" },
  { group: "Part I", label: "Part I · Frais courants", value: "0,91 %", anchor: "part-i", terms: "Europe Valeur I part frais courants ter" },
  { group: "Part C", label: "Part C · Frais courants", value: "1,67 %", anchor: "part-c", terms: "Europe Valeur C part frais courants ter" },
  { group: "Fonctionnement", label: "Dépositaire", value: "Dépositaire Alpha SA", anchor: "f-x", terms: "Dépositaire Fonctionnement" },
  { group: "Fonctionnement", label: "Commissaire aux comptes", value: "Cabinet Audit Nord", anchor: "f-y", terms: "Commissaire aux comptes" },
  { group: "Distribution", label: "Commercialisé en Italie", value: "Oui · 2 parts (C, I)", anchor: "distribution", terms: "Commercialisé en Italie pays" },
  { group: "Distribution", label: "Commercialisé en Espagne", value: "Non enregistré", anchor: "distribution", terms: "Commercialisé en Espagne pays" },
  { group: "ESG", label: "Exclusion · Tabac", value: "Oui, exclu", anchor: "esg", terms: "Exclusion Tabac exclusion" },
  { group: "Synthèse", label: "Indicateur de référence", value: "MSCI Europe Value NR", anchor: "synthese", terms: "Indicateur de référence" },
  { group: "Performance", label: "Volatilité sur 1 an", value: "14,9 %", anchor: "performance", terms: "Volatilité sur 1 an risque" },
];
const top = (q: string) => searchFiche(E, q)[0]?.label;

describe("chercher dans la fiche", () => {
  it("vocabulaire métier et synonymes", () => {
    expect(top("cut-off")).toContain("Heure limite");
    expect(top("cac")).toBe("Commissaire aux comptes");
    expect(top("bench")).toBe("Indicateur de référence");
    expect(top("vol")).toBe("Volatilité sur 1 an");
    expect(top("ticket part i")).toContain("Minimum");
  });
  it("précision sur la part demandée", () => {
    expect(top("frais part I")).toBe("Part I · Frais courants");
    expect(top("frais c")).toBe("Part C · Frais courants");
  });
  it("sans accents, avec fautes", () => {
    expect(top("depositaire")).toBe("Dépositaire");
    expect(top("depositiare")).toBe("Dépositaire");
  });
  it("pays : réponse oui ou non", () => {
    expect(searchFiche(E, "italie")[0].value).toContain("Oui");
    expect(searchFiche(E, "espagne")[0].value).toBe("Non enregistré");
    expect(top("tabac")).toBe("Exclusion · Tabac");
  });
  it("rien d'absurde", () => {
    expect(searchFiche(E, "zzqqx")).toHaveLength(0);
  });
});

describe("lettre de part isolée", () => {
  it("n'attire pas les libellés hors sujet", () => {
    const r = searchFiche([...E, { group: "Synthèse", label: "Gérant principal", value: "Victor Lambert · suppléant Sophie", anchor: "s", terms: "Gérant principal gestion" }], "frais part i");
    expect(r[0].label).toBe("Part I · Frais courants");
    expect(r.some((x) => x.label === "Gérant principal")).toBe(false);
  });
});
