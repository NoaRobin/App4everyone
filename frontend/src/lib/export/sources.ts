/**
 * Sources du mode « Données » de l'onglet Export : chaque source dit ce qu'est une ligne (le grain), quels réglages elle
 * accepte côté serveur (niveau de détail, pas de temps, période, périmètre) et quelles colonnes elle propose.
 * Les lignes viennent des API de l'application (lecture seule) ; rien n'est recalculé ni inventé.
 */
import { fetchJson } from "../api";
import { FAMILY_LABEL, FAMILY_ORDER } from "../families";
import type { FamilyKey } from "../types";
import type { ExportCol } from "../xlsx";
import { DEFAULT_PARAMS, FUND_X, datasetById, loadFunds, type Params } from "../report/datasets";

export type Level = "maison" | "famille" | "gamme" | "classe" | "fonds" | "part";
export type Freq = "J" | "S" | "M" | "T" | "A";
export type Span = "1M" | "3M" | "YTD" | "1A" | "3A" | "5A" | "Tout" | "perso";
export type Control = "level" | "freq" | "period" | "families" | "funds" | "rmm" | "actifs" | "dim" | "top";
export type SrcParams = {
  level: Level; freq: Freq; span: Span; from: string; to: string;
  families: string[]; funds: string[]; rmm: boolean; actifs: boolean; dim: string; top: number;
};
export const DEFAULT_SRC: SrcParams = { level: "fonds", freq: "M", span: "1A", from: "", to: "", families: [], funds: [], rmm: true, actifs: true, dim: "family", top: 150 };
export type Row = Record<string, unknown>;
export type Pack = { id: string; label: string; desc: string; keys: string[] };
export type Loaded = { rows: Row[]; asOf?: string | null; period?: { from: string | null; to: string | null }; tooMany?: { n: number; limit: number };
  columns?: ExportCol<Row>[]; packs?: Pack[] };
export type Source = {
  id: string; label: string; group: "Gestion" | "Distribution" | "Portefeuilles" | "Passif";
  description: string; grain: (p: SrcParams) => string; controls: Control[];
  columns: ExportCol<Row>[]; defaults: (p: SrcParams) => string[];
  load: (api: (u: string) => string, p: SrcParams, asOf: string | null) => Promise<Loaded>;
  nominative?: boolean;
  featured?: boolean;
};

export const LEVELS: { id: Level; label: string; grain: string }[] = [
  { id: "maison", label: "Maison", grain: "une ligne par date" }, { id: "famille", label: "Famille", grain: "une ligne par famille et par date" },
  { id: "gamme", label: "Gamme", grain: "une ligne par gamme et par date" }, { id: "classe", label: "Classe d'actifs", grain: "une ligne par classe d'actifs et par date" },
  { id: "fonds", label: "Fonds", grain: "une ligne par fonds et par date" }, { id: "part", label: "Part", grain: "une ligne par part et par date" },
];
export const FREQS: { id: Freq; label: string }[] = [
  { id: "J", label: "Jour" }, { id: "S", label: "Semaine" }, { id: "M", label: "Mois" }, { id: "T", label: "Trimestre" }, { id: "A", label: "Année" },
];
export const SPANS: { id: Span; label: string }[] = [
  { id: "1M", label: "1 mois" }, { id: "3M", label: "3 mois" }, { id: "YTD", label: "Depuis le 1er janvier" }, { id: "1A", label: "1 an" },
  { id: "3A", label: "3 ans" }, { id: "5A", label: "5 ans" }, { id: "Tout", label: "Tout l'historique" }, { id: "perso", label: "Dates choisies" },
];

/** Bornes de la période (dates ISO) à partir de la date de valeur. */
export function periodBounds(p: SrcParams, asOf: string | null): { from: string | null; to: string | null } {
  if (p.span === "perso") return { from: p.from || null, to: p.to || null };
  if (!asOf || p.span === "Tout") return { from: null, to: null };
  const d = new Date(`${asOf}T00:00:00Z`);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const back = (months: number) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() - months); return iso(x); };
  switch (p.span) {
    case "1M": return { from: back(1), to: null };
    case "3M": return { from: back(3), to: null };
    case "YTD": return { from: `${d.getUTCFullYear()}-01-01`, to: null };
    case "1A": return { from: back(12), to: null };
    case "3A": return { from: back(36), to: null };
    case "5A": return { from: back(60), to: null };
    default: return { from: null, to: null };
  }
}

type Table = { columns: string[]; rows: unknown[][]; n: number; grain?: string; too_many?: number; limit?: number; date?: string; start?: string; end?: string };
const toRows = (t: Table): Row[] => t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i]])));
const pts = (k: string) => (r: Row) => (r[k] == null ? null : (r[k] as number) / 100);
const fam = (k: unknown) => (k ? FAMILY_LABEL[k as FamilyKey] ?? String(k) : null);
const qs = (o: Record<string, string | number | boolean | null | undefined>) => {
  const s = Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
  return s ? `?${s}` : "";
};
const legacy = (p: SrcParams): Params => ({ ...DEFAULT_PARAMS, dim: p.dim, rmm: p.rmm, family: p.families });

// ------------------------------------------------------------------ Product Info (référentiel complet)
type Ref = { columns: { key: string; label: string; group: string; kind: ExportCol["kind"]; desc?: string }[]; head: string[]; rows: unknown[][]; packs: Pack[]; n_fields: number };
async function loadRef(api: (u: string) => string, niveau: "fonds" | "parts") {
  const r = await fetchJson<Ref>(api(`/api/export/referentiel?niveau=${niveau}`));
  const keys = [...r.head, ...r.columns.map((c) => c.key)];
  const byId = new Map<string, Row>(r.rows.map((row) => [String(row[0]), Object.fromEntries(keys.map((k, i) => [k, row[i]]))]));
  const columns: ExportCol<Row>[] = r.columns.map((c) => ({ key: c.key, label: c.label, kind: c.kind, group: `Product Info · ${c.group}`, desc: c.desc }));
  return { byId, columns, packs: r.packs };
}

// ------------------------------------------------------------------ encours dans le temps
const ENC_COLS: ExportCol<Row>[] = [
  { key: "date", label: "Date", kind: "date", group: "Période", desc: "Dernière date de valeur disponible de la période (fin de période)" },
  { key: "debut_periode", label: "Début de période", kind: "date", group: "Période" },
  { key: "perimetre", label: "Périmètre", group: "Entité" },
  { key: "famille", label: "Famille de gestion", group: "Entité" },
  { key: "gamme", label: "Gamme", group: "Entité" },
  { key: "classe_actifs", label: "Classe d'actifs", group: "Entité" },
  { key: "id_fonds", label: "Code fonds", kind: "code", group: "Entité" },
  { key: "fonds", label: "Fonds", group: "Entité" },
  { key: "domicile", label: "Domicile", group: "Entité" },
  { key: "id_part", label: "Code JUMP de la part", kind: "code", group: "Entité" },
  { key: "part", label: "Part", group: "Entité" },
  { key: "isin", label: "ISIN", kind: "code", group: "Entité" },
  { key: "devise_part", label: "Devise de la part", kind: "code", group: "Entité" },
  { key: "encours", label: "Encours (EUR)", kind: "eur", group: "Mesures", desc: "Encours en euros à la date de fin de période" },
  { key: "variation", label: "Variation d'encours (EUR)", kind: "eur", sum: true, group: "Mesures", desc: "Encours de la période moins encours de la période précédente" },
  { key: "variation_pct", label: "Variation d'encours (%)", kind: "pct", group: "Mesures" },
  { key: "collecte_estimee", label: "Collecte nette estimée (EUR)", kind: "eur", sum: true, group: "Mesures", desc: "Souscriptions moins rachats de la période, estimés à partir des encours et des VL" },
  { key: "effet_marche", label: "Effet marché (EUR)", kind: "eur", sum: true, group: "Mesures", desc: "Variation d'encours non expliquée par la collecte" },
];
const ENCOURS: Source = {
  id: "encours", label: "Encours dans le temps", group: "Gestion",
  description: "Encours, variation, collecte estimée et effet marché, période par période, au niveau de détail de votre choix",
  grain: (p) => LEVELS.find((l) => l.id === p.level)!.grain,
  controls: ["level", "freq", "period", "families", "funds"],
  columns: ENC_COLS,
  defaults: (p) => ["date", ...({ maison: ["perimetre"], famille: ["famille"], gamme: ["gamme"], classe: ["classe_actifs"], fonds: ["fonds", "famille"], part: ["part", "isin", "fonds"] }[p.level]),
    "encours", "variation", "collecte_estimee", "effet_marche"],
  async load(api, p, asOf) {
    const b = periodBounds(p, asOf);
    const t = await fetchJson<Table>(api(`/api/export/encours${qs({ niveau: p.level, pas: p.freq, debut: b.from, fin: b.to, familles: p.families.join(","), fonds: p.funds.join(",") })}`));
    if (t.too_many) return { rows: [], tooMany: { n: t.too_many, limit: t.limit ?? 0 } };
    return { rows: toRows(t), period: { from: t.start ?? null, to: t.end ?? null } };
  },
};

// ------------------------------------------------------------------ fonds : Product Info + mesures de l'application
const FONDS: Source = {
  id: "fonds", label: "Fonds", group: "Gestion", featured: true,
  description: "Tous les champs Product Info du référentiel, et les mesures de l'application : encours, collecte, performance, revenus, risque",
  grain: () => "une ligne par fonds", controls: ["families"],
  columns: (FUND_X as unknown as ExportCol<Row>[]).map((c) => ({ ...c, group: `Mesures · ${c.group ?? "Fonds"}` })),
  defaults: () => ["name", "family", "pi.Fund_Range", "pi.Asset_Class", "pi.Portfolio_Manager", "aum", "flows_YTD", "perf_YTD", "sri", "sfdr"],
  async load(api, p) {
    const [{ rows }, ref] = await Promise.all([loadFunds({ api, p: { ...legacy(p), sort: "aum" }, charts: [] }), loadRef(api, "fonds")]);
    const out = (rows as unknown as Row[]).map((r) => ({ ...(ref.byId.get(String(r.id)) ?? {}), ...r }));
    return { rows: out, columns: ref.columns, packs: ref.packs };
  },
};

// ------------------------------------------------------------------ parts
const PART_COLS: ExportCol<Row>[] = [
  { key: "part", label: "Part", group: "Identité" }, { key: "isin", label: "ISIN", kind: "code", group: "Identité" },
  { key: "id_part", label: "Code part", kind: "code", group: "Identité", desc: "Identifiant de la part au référentiel (à défaut, code JUMP)" },
  { key: "id_jump", label: "Code JUMP", kind: "code", group: "Identité" }, { key: "classe_part", label: "Classe de part", group: "Identité" },
  { key: "devise", label: "Devise", kind: "code", group: "Identité" }, { key: "couverte", label: "Couverte en change", kind: "bool", group: "Identité" },
  { key: "affectation", label: "Affectation des revenus", group: "Identité" }, { key: "part_principale", label: "Part principale", kind: "bool", group: "Identité" },
  { key: "statut", label: "Statut", group: "Identité" },
  { key: "souscripteurs", label: "Souscripteurs", group: "Souscription" }, { key: "souscription_min", label: "Souscription initiale minimale", kind: "num", group: "Souscription" },
  { key: "cut_off", label: "Heure limite (cut-off)", group: "Souscription" }, { key: "reglement", label: "Règlement", group: "Souscription" },
  { key: "frais_courants", label: "Frais courants", kind: "pct", get: pts("frais_courants"), group: "Frais" },
  { key: "frais_gestion_max", label: "Frais de gestion maximum", kind: "pct", get: pts("frais_gestion_max"), group: "Frais" },
  { key: "commission_surperformance", label: "Commission de surperformance", kind: "bool", group: "Frais" },
  { key: "notation_morningstar", label: "Notation Morningstar", kind: "int", group: "Notation" },
  { key: "encours", label: "Encours (EUR)", kind: "eur", sum: true, group: "Encours" }, { key: "collecte_ytd", label: "Collecte nette estimée YTD (EUR)", kind: "eur", sum: true, group: "Encours" },
  { key: "vl", label: "Dernière VL", kind: "num", digits: 4, group: "Encours" }, { key: "date_vl", label: "Date de la VL", kind: "date", group: "Encours" },
  { key: "fonds", label: "Fonds", group: "Fonds" }, { key: "id_fonds", label: "Code fonds", kind: "code", group: "Fonds" }, { key: "famille", label: "Famille de gestion", group: "Fonds" },
  { key: "gamme", label: "Gamme", group: "Fonds" }, { key: "classe_actifs", label: "Classe d'actifs", group: "Fonds" }, { key: "domicile", label: "Domicile", group: "Fonds" },
  { key: "rattachement", label: "Rattachement au référentiel", group: "Qualité", desc: "Comment la part JUMP est rattachée au référentiel (identifiant, ISIN, référentiel seul)" },
];
const PARTS: Source = {
  id: "parts", label: "Parts", group: "Gestion", featured: true,
  description: "Tous les champs Product Info des parts, et l'encours, la collecte YTD et la dernière VL de chaque part",
  grain: () => "une ligne par part", controls: ["families"],
  columns: PART_COLS.map((c) => ({ ...c, group: `Mesures · ${c.group ?? "Part"}` })),
  defaults: () => ["fonds", "part", "isin", "devise", "souscripteurs", "frais_courants", "encours", "collecte_ytd", "vl", "date_vl"],
  async load(api, p) {
    const [t, ref, funds] = await Promise.all([fetchJson<Table>(api("/api/export/parts")), loadRef(api, "parts"),
      p.families.length ? fetchJson<{ funds: { id: string; family: string }[] }>(api("/api/funds")) : Promise.resolve(null)]);
    const m = toRows(t);
    const seen = new Set(m.map((r) => String(r.id_part)));
    const rows: Row[] = m.map((r) => ({ ...(ref.byId.get(String(r.id_part)) ?? {}), ...r }));
    ref.byId.forEach((v, id) => { if (!seen.has(id)) rows.push({ ...v }); });     // parts du référentiel sans données JUMP
    const keep = funds ? new Set(funds.funds.filter((f) => p.families.includes(f.family)).map((f) => f.id)) : null;
    return { rows: keep ? rows.filter((r) => keep.has(String(r.id_fonds))) : rows, columns: ref.columns, packs: ref.packs };
  },
};

// ------------------------------------------------------------------ agrégats existants (répartition, revenus)
const viaDataset = (id: string, grain: string, controls: Control[], extra?: Partial<Source>): Source => {
  const d = datasetById(id);
  return {
    id: `agg-${id}`, label: d.label, group: d.group as Source["group"], description: d.description, grain: () => grain, controls,
    columns: d.columns as unknown as ExportCol<Row>[], defaults: () => d.defaults,
    async load(api, p) { const r = await d.load({ api, p: legacy(p), charts: [] }); return { rows: r.rows as Row[] }; },
    ...extra,
  };
};

// ------------------------------------------------------------------ autorisations de commercialisation
const REG_COLS: ExportCol<Row>[] = [
  { key: "pays", label: "Pays d'enregistrement", group: "Autorisation" }, { key: "code_pays", label: "Code pays", kind: "code", group: "Autorisation" },
  { key: "actif", label: "Enregistrement actif", kind: "bool", group: "Autorisation" }, { key: "date_enregistrement", label: "Date d'enregistrement", kind: "date", group: "Autorisation" },
  { key: "autorisation_finma", label: "Autorisation FINMA", kind: "bool", group: "Autorisation" }, { key: "commentaire", label: "Commentaire", group: "Autorisation" },
  { key: "part", label: "Part", group: "Part" }, { key: "isin", label: "ISIN", kind: "code", group: "Part" }, { key: "id_part", label: "Code part", kind: "code", group: "Part" },
  { key: "devise_part", label: "Devise de la part", kind: "code", group: "Part" }, { key: "encours_part", label: "Encours de la part (EUR)", kind: "eur", group: "Part", desc: "Encours total de la part, non ventilé par pays" },
  { key: "clientele", label: "Clientèle", group: "Clientèle", desc: "Client nommé d'une part dédiée, à défaut le pool de clientèle" },
  { key: "nature_clientele", label: "Nature de la clientèle", group: "Clientèle", get: (r) => (r.nature_clientele === "nommé" ? "Client nommé" : r.nature_clientele === "pool" ? "Pool de clientèle" : null) },
  { key: "fonds", label: "Fonds", group: "Fonds" }, { key: "id_fonds", label: "Code fonds", kind: "code", group: "Fonds" }, { key: "famille", label: "Famille de gestion", group: "Fonds" },
  { key: "fonds_rmm", label: "Fonds RMM", kind: "bool", group: "Fonds" },
];
const ENREG: Source = {
  id: "enregistrements", label: "Autorisations de commercialisation", group: "Distribution",
  description: "Chaque part dans chaque pays : statut, date d'enregistrement, FINMA, clientèle, fonds",
  grain: () => "une ligne par part et par pays", controls: ["actifs", "rmm"],
  columns: REG_COLS, defaults: () => ["pays", "code_pays", "fonds", "part", "isin", "clientele", "date_enregistrement", "actif"],
  async load(api, p) { const t = await fetchJson<Table>(api(`/api/export/enregistrements${qs({ actifs: p.actifs ? 1 : 0, rmm: p.rmm ? null : "exclure" })}`)); return { rows: toRows(t) }; },
};

// ------------------------------------------------------------------ inventaires
const INV_COLS: ExportCol<Row>[] = [
  { key: "fonds", label: "Fonds", group: "Fonds" }, { key: "id_fonds", label: "Code fonds", kind: "code", group: "Fonds" }, { key: "famille", label: "Famille de gestion", group: "Fonds" },
  { key: "date_inventaire", label: "Date d'inventaire", kind: "date", group: "Fonds" },
  { key: "instrument", label: "Instrument", group: "Instrument" }, { key: "isin_instrument", label: "ISIN de l'instrument", kind: "code", group: "Instrument" },
  { key: "code_bloomberg", label: "Code Bloomberg", kind: "code", group: "Instrument" }, { key: "type_instrument", label: "Type d'instrument", kind: "code", group: "Instrument" },
  { key: "classe_actifs", label: "Classe d'actifs", group: "Instrument" }, { key: "devise_instrument", label: "Devise de l'instrument", kind: "code", group: "Instrument" },
  { key: "type_detention", label: "Type de détention", group: "Instrument" }, { key: "type_dette", label: "Type de dette", group: "Instrument" },
  { key: "devise_fonds", label: "Devise du fonds", kind: "code", group: "Montants" }, { key: "montant_devise_fonds", label: "Montant (devise du fonds)", kind: "num", sum: true, group: "Montants" },
  { key: "montant_eur", label: "Montant (EUR)", kind: "eur", sum: true, group: "Montants", desc: "Montant converti en euros au taux implicite de JUMP (actif net EUR / actif net devise)" },
  { key: "exposition_eur", label: "Exposition (EUR)", kind: "eur", sum: true, group: "Montants" },
  { key: "poids", label: "Poids dans le fonds", kind: "pct", get: pts("poids"), group: "Montants" },
];
const INVENTAIRES: Source = {
  id: "inventaires", label: "Lignes d'inventaire", group: "Portefeuilles",
  description: "Le dernier inventaire de chaque fonds : chaque instrument détenu, montant, exposition, poids",
  grain: () => "une ligne par fonds et par instrument", controls: ["funds"],
  columns: INV_COLS, defaults: () => ["fonds", "date_inventaire", "instrument", "isin_instrument", "classe_actifs", "devise_instrument", "montant_eur", "poids"],
  async load(api, p) { const t = await fetchJson<Table>(api(`/api/export/inventaires${qs({ fonds: p.funds.join(",") })}`)); return t.too_many ? { rows: [], tooMany: { n: t.too_many, limit: t.limit ?? 0 } } : { rows: toRows(t) }; },
};

// ------------------------------------------------------------------ passif : clients, fonds, parts
type Book = { available: boolean; reason?: string; as_of?: string; clients?: { client: string; encours: number; positions: number; funds: { fund: string | null; name: string | null; linked: boolean; encours: number; shares: { isin: string | null; share: string | null; encours: number; positions: number }[] }[] }[] };
const PASSIF: Source = {
  id: "passif", label: "Passif : clients, fonds et parts", group: "Passif", nominative: true,
  description: "Les premiers clients par encours, chacun avec ses fonds et ses parts (Montant EUR à la date de la photo)",
  grain: () => "une ligne par client et par part", controls: ["top"],
  columns: [
    { key: "rang", label: "Rang du client", kind: "int", group: "Client" }, { key: "client", label: "Client", group: "Client" },
    { key: "client_encours", label: "Encours du client (EUR)", kind: "eur", group: "Client" },
    { key: "fonds", label: "Fonds", group: "Fonds et part" }, { key: "id_fonds", label: "Code fonds", kind: "code", group: "Fonds et part" },
    { key: "part", label: "Part", group: "Fonds et part" }, { key: "isin", label: "ISIN", kind: "code", group: "Fonds et part" },
    { key: "encours", label: "Encours (EUR)", kind: "eur", sum: true, group: "Mesures" },
    { key: "part_client", label: "Part de l'encours du client", kind: "pct", group: "Mesures" },
    { key: "positions", label: "Positions", kind: "int", sum: true, group: "Mesures" },
    { key: "date_photo", label: "Date de la photo", kind: "date", group: "Mesures" },
  ],
  defaults: () => ["rang", "client", "fonds", "part", "isin", "encours", "part_client"],
  async load(api, p) {
    const b = await fetchJson<Book>(api(`/api/passif/carnet?top=${p.top}`));
    if (!b.available) throw new Error(b.reason ?? "Passif indisponible");
    return {
      asOf: b.as_of ?? null,
      rows: (b.clients ?? []).flatMap((c, i) => c.funds.flatMap((f) => f.shares.map((s) => ({
        rang: i + 1, client: c.client, client_encours: c.encours, fonds: f.name ?? (f.linked ? f.fund : "Non rattaché au référentiel"), id_fonds: f.fund,
        part: s.share, isin: s.isin, encours: s.encours, part_client: c.encours ? s.encours / c.encours : null, positions: s.positions, date_photo: b.as_of,
      })))),
    };
  },
};

export const SOURCES: Source[] = [
  ENCOURS, FONDS, PARTS,
  viaDataset("repartition", "une ligne par catégorie de l'axe choisi", ["dim"]),
  viaDataset("revenus", "une ligne par catégorie (famille, gamme, classe d'actifs)", []),
  ENREG,
  viaDataset("clientele", "une ligne par clientèle et par pays", ["rmm"]),
  viaDataset("pays", "une ligne par pays", ["rmm"]),
  viaDataset("plateformes", "une ligne par plateforme", ["rmm"]),
  viaDataset("chronologie", "une ligne par année d'enregistrement", ["rmm"]),
  INVENTAIRES,
  viaDataset("portefeuilles", "une ligne par instrument (toute la maison)", []),
  PASSIF,
];
export const sourceById = (id: string) => SOURCES.find((s) => s.id === id) ?? SOURCES[0];
export const FAMILY_CHOICES = FAMILY_ORDER.map((k) => ({ id: k as string, label: fam(k) ?? k }));
