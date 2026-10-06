/**
 * Catalogues de colonnes exportables (Excel / CSV), par tableau : libellé, nature (format Excel), groupe et définition.
 * Les valeurs restent celles de l'application : rien n'est recalculé ni inventé à l'export.
 */
import { FAMILY_LABEL } from "./families";
import type { FamilyKey, FundRow, ShareBrief } from "./types";
import type { ExportCol } from "./xlsx";

const fam = (k: FamilyKey | string | null | undefined) => (k ? FAMILY_LABEL[k as FamilyKey] ?? k : null);
const pctPoints = (v: number | null | undefined) => (v == null ? null : v / 100);   // valeurs déjà en points de % → fraction Excel

// ------------------------------------------------------------------ fonds
export const FUND_COLS: ExportCol<FundRow>[] = [
  { key: "name", label: "Fonds", group: "Identité", desc: "Nom du fonds au référentiel produits" },
  { key: "id", label: "Code fonds", kind: "code", group: "Identité", desc: "Identifiant du fonds dans l'application (ProductID)" },
  { key: "family", label: "Famille de gestion", group: "Identité", get: (r) => fam(r.family), desc: "Famille de gestion (Management Expertise, niveau 1)" },
  { key: "range", label: "Gamme", group: "Identité" },
  { key: "asset_class", label: "Classe d'actifs", group: "Identité" },
  { key: "expertise", label: "Expertise", group: "Identité" },
  { key: "manager", label: "Gérant", group: "Identité", desc: "Gérant principal" },
  { key: "backup", label: "Gérant suppléant", group: "Identité" },
  { key: "domicile", label: "Domicile", group: "Identité", desc: "Pays de domiciliation du fonds" },
  { key: "legal_form", label: "Forme juridique", group: "Identité" },
  { key: "currency", label: "Devise du fonds", kind: "code", group: "Identité" },
  { key: "amf", label: "Classification AMF", group: "Identité" },
  { key: "n_parts", label: "Nombre de parts", kind: "int", group: "Identité" },
  { key: "referenced", label: "Au référentiel", kind: "bool", group: "Identité", desc: "Fonds présent au référentiel produits (sinon : JUMP seul)" },
  { key: "countries", label: "Pays de commercialisation", group: "Distribution", get: (r) => r.countries?.join(", ") ?? null, desc: "Pays où au moins une part est autorisée" },
  { key: "aum", label: "Encours (€)", kind: "eur", sum: true, group: "Encours et collecte", desc: "Actif net du fonds en euros à la date de valeur" },
  { key: "delta_1M", label: "Variation d'encours 1 mois (€)", kind: "eur", sum: true, group: "Encours et collecte" },
  { key: "delta_YTD", label: "Variation d'encours YTD (€)", kind: "eur", sum: true, group: "Encours et collecte" },
  { key: "var_1M", label: "Variation d'encours 1 mois (%)", kind: "pct", group: "Encours et collecte" },
  { key: "var_YTD", label: "Variation d'encours YTD (%)", kind: "pct", group: "Encours et collecte" },
  { key: "var_1A", label: "Variation d'encours 1 an (%)", kind: "pct", group: "Encours et collecte" },
  { key: "flows_1M", label: "Collecte nette 1 mois (€)", kind: "eur", sum: true, group: "Encours et collecte", desc: "Souscriptions moins rachats, estimées à partir des encours et des VL" },
  { key: "flows_YTD", label: "Collecte nette YTD (€)", kind: "eur", sum: true, group: "Encours et collecte", desc: "Souscriptions moins rachats depuis le 1er janvier, estimées" },
  { key: "flows_1A", label: "Collecte nette 1 an (€)", kind: "eur", sum: true, group: "Encours et collecte" },
  { key: "perf_YTD", label: "Performance YTD", kind: "pct", group: "Performance et risque", desc: "Performance de la part principale depuis le 1er janvier" },
  { key: "perf_1A", label: "Performance 1 an", kind: "pct", group: "Performance et risque" },
  { key: "vol_1A", label: "Volatilité 1 an", kind: "pct", group: "Performance et risque" },
  { key: "sri", label: "SRI", group: "Performance et risque", desc: "Indicateur synthétique de risque (1 à 7)" },
  { key: "sfdr", label: "SFDR", group: "Performance et risque", desc: "Classification SFDR (article 6, 8 ou 9)" },
];
/** Correspondance colonnes à l'écran → colonnes d'export. */
export const FUND_SCREEN: Record<string, string> = { name: "name", family: "family", range: "range", manager: "manager", sfdr: "sfdr", sri: "sri", aum: "aum",
  var_1M: "var_1M", var_YTD: "var_YTD", flows_YTD: "flows_YTD", perf_YTD: "perf_YTD", domicile: "domicile" };
export const FUND_ESSENTIAL = ["name", "family", "aum", "flows_YTD", "perf_YTD"];

// ------------------------------------------------------------------ parts d'un fonds
export const SHARE_COLS: ExportCol<ShareBrief>[] = [
  { key: "name", label: "Part", group: "Identité" },
  { key: "isin", label: "ISIN", kind: "code", group: "Identité" },
  { key: "jump", label: "Code JUMP", kind: "code", group: "Identité" },
  { key: "class", label: "Classe", group: "Identité" },
  { key: "ccy", label: "Devise", kind: "code", group: "Identité" },
  { key: "hedged", label: "Couverte en change", kind: "bool", group: "Identité" },
  { key: "distribution", label: "Affectation des revenus", group: "Identité" },
  { key: "main", label: "Part principale", kind: "bool", group: "Identité" },
  { key: "status", label: "Statut", group: "Identité" },
  { key: "investor", label: "Souscripteurs", group: "Souscription", desc: "Type d'investisseur visé par la part" },
  { key: "min_sub", label: "Minimum de souscription", kind: "num", digits: 0, group: "Souscription" },
  { key: "cutoff", label: "Heure limite (cut-off)", group: "Souscription" },
  { key: "settlement", label: "Règlement", group: "Souscription" },
  { key: "ongoing", label: "Frais courants", kind: "pct", get: (r) => pctPoints(r.ongoing), group: "Frais" },
  { key: "mgmt_fee", label: "Frais de gestion", kind: "pct", get: (r) => pctPoints(r.mgmt_fee), group: "Frais" },
  { key: "perf_fee", label: "Commission de surperformance", kind: "bool", group: "Frais" },
  { key: "nav", label: "Valeur liquidative", kind: "num", digits: 2, group: "Valorisation", desc: "Dernière VL, dans la devise de la part" },
  { key: "nav_date", label: "Date de VL", kind: "date", group: "Valorisation" },
  { key: "aum", label: "Encours (€)", kind: "eur", sum: true, group: "Valorisation" },
  { key: "flows_YTD", label: "Collecte nette YTD (€)", kind: "eur", sum: true, group: "Valorisation" },
  { key: "rating", label: "Notation", kind: "int", group: "Valorisation" },
];
export const SHARE_SCREEN = ["name", "isin", "ccy", "distribution", "investor", "ongoing", "min_sub", "cutoff", "nav", "aum"];
export const SHARE_ESSENTIAL = ["name", "isin", "ccy", "ongoing", "aum"];

// ------------------------------------------------------------------ enregistrements d'un pays
export type RegRow = { share_id: string; share: string; isin: string | null; ccy: string | null; investor: string | null; fund_id: string | null; fund: string | null;
  family: FamilyKey; active: boolean; date: string | null; finma: boolean | null; comment: string | null; aum: number | null; rmm?: boolean };
export const REG_COLS: ExportCol<RegRow>[] = [
  { key: "fund", label: "Fonds", group: "Fonds et part" },
  { key: "share", label: "Part", group: "Fonds et part" },
  { key: "isin", label: "ISIN", kind: "code", group: "Fonds et part" },
  { key: "ccy", label: "Devise", kind: "code", group: "Fonds et part" },
  { key: "family", label: "Famille de gestion", get: (r) => fam(r.family), group: "Fonds et part" },
  { key: "investor", label: "Souscripteurs", group: "Fonds et part" },
  { key: "rmm", label: "Fonds RMM", kind: "bool", group: "Fonds et part", desc: "Fonds Rothschild Martin Maurel (règle de repérage de l'application)" },
  { key: "fund_id", label: "Code fonds", kind: "code", group: "Fonds et part" },
  { key: "share_id", label: "Identifiant de part", kind: "code", group: "Fonds et part" },
  { key: "active", label: "Enregistrement actif", kind: "bool", group: "Enregistrement" },
  { key: "date", label: "Date d'enregistrement", kind: "date", group: "Enregistrement" },
  { key: "finma", label: "Autorisation FINMA", kind: "bool", group: "Enregistrement" },
  { key: "comment", label: "Commentaire", group: "Enregistrement" },
  { key: "aum", label: "Encours de la part (€)", kind: "eur", sum: true, group: "Encours", desc: "Encours total de la part (non ventilé par pays : les données ne le permettent pas)" },
];
export const REG_SCREEN = ["fund", "share", "isin", "ccy", "active", "date"];
export const REG_ESSENTIAL = ["fund", "share", "isin", "date"];
