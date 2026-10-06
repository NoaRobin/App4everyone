/**
 * Jeux de données du studio d'export : d'où viennent les lignes (API de l'application, lecture seule), quelles colonnes
 * sont proposées, quels réglages et quels graphiques. Rien n'est recalculé ni inventé : les valeurs sont celles de l'API.
 */
import { fetchJson } from "../api";
import { FAMILY_LABEL, FAMILY_ORDER } from "../families";
import type { FamilyKey, FundRow } from "../types";
import type { ExportCol } from "../xlsx";
import { FUND_COLS } from "../exportCols";
import type { ChartSpec } from "./charts";

export type Params = {
  family: string[]; domicile: string[]; sfdr: string[]; asset_class: string[];
  freq: "M" | "T" | "A"; range: "YTD" | "1A" | "3A" | "Tout"; dim: string; top: number; rmm: boolean; sort: string;
};
export const DEFAULT_PARAMS: Params = { family: [], domicile: [], sfdr: [], asset_class: [], freq: "M", range: "1A", dim: "family", top: 15, rmm: true, sort: "aum" };
export type Loaded = { rows: Record<string, unknown>[]; charts: ChartSpec[]; title?: string; note?: string; options?: Partial<Record<keyof Params, string[]>> };
export type Ctx = { api: (u: string) => string; p: Params; charts: string[] };
export type Dataset = {
  id: string; label: string; group: string; description: string; sheet: string;
  params: (keyof Params)[];
  columns: ExportCol<never>[]; defaults: string[];
  charts: { id: string; label: string; on: boolean }[];
  load: (ctx: Ctx) => Promise<Loaded>;
};

// ------------------------------------------------------------------ utilitaires
const cache = new Map<string, Promise<unknown>>();
const get = <T,>(u: string): Promise<T> => { if (!cache.has(u)) cache.set(u, fetchJson<T>(u).catch((e) => { cache.delete(u); throw e; })); return cache.get(u) as Promise<T>; };
export const clearCache = () => cache.clear();
const fam = (k: string | null | undefined) => (k ? FAMILY_LABEL[k as FamilyKey] ?? k : null);
const pts = (v: number | null | undefined) => (v == null ? null : v / 100);
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "fr"));
const pick = <T,>(xs: T[], on: string[], f: (x: T) => string | null | undefined) => (on.length ? xs.filter((x) => on.includes(f(x) ?? "")) : xs);
const C = <R,>(c: ExportCol<R>[]) => c as unknown as ExportCol<never>[];
const want = (ctx: Ctx, id: string) => ctx.charts.includes(id);
const famOrder = (k: string) => { const i = FAMILY_ORDER.indexOf(k as FamilyKey); return i < 0 ? 9 : i; };
const PERIOD: Record<string, (d: string) => string> = {
  M: (d) => new Date(d).toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" }),
  T: (d) => { const x = new Date(d); return `T${Math.floor(x.getUTCMonth() / 3) + 1} ${x.getUTCFullYear()}`; },
  A: (d) => String(new Date(d).getUTCFullYear()),
};

// ------------------------------------------------------------------ fonds (référentiel + encours + revenus + risque)
type Rev = { funds: { id: string; rate: number | null; revenue: number | null; revenue_net: number | null; revenue_12m: number | null; d_revenue_1y: number | null; share: number | null }[] };
type Risk = { funds: { id: string; sri_prev: string | null; vol: number | null; mdd: number | null; te: number | null; top10: number | null; cash: number | null; derivatives: number | null; n_lines: number | null; global_exposure: string | null; leverage: boolean | null; liquidity: boolean | null; credit: boolean | null; counterparty: boolean | null }[]; sri: { sri: string; aum: number; n: number }[] };
type FundX = FundRow & Partial<Rev["funds"][number]> & Partial<Risk["funds"][number]>;
const FUND_X: ExportCol<FundX>[] = [
  ...(FUND_COLS as ExportCol<FundX>[]),
  { key: "rate", label: "Taux de frais de gestion", kind: "pct", get: (r) => pts(r.rate), group: "Revenus estimés", desc: "Frais de gestion réels de la part, à défaut du fonds" },
  { key: "revenue", label: "Revenus annualisés (€)", kind: "eur", sum: true, group: "Revenus estimés", desc: "Encours × taux de frais de gestion (estimation)" },
  { key: "revenue_net", label: "Revenus nets de rétrocessions (€)", kind: "eur", sum: true, group: "Revenus estimés" },
  { key: "revenue_12m", label: "Revenus 12 mois glissants (€)", kind: "eur", sum: true, group: "Revenus estimés" },
  { key: "d_revenue_1y", label: "Variation des revenus sur 1 an (€)", kind: "eur", sum: true, group: "Revenus estimés" },
  { key: "share", label: "Part des revenus de la maison", kind: "pct", group: "Revenus estimés" },
  { key: "sri_prev", label: "SRI précédent", group: "Risque" },
  { key: "vol", label: "Volatilité", kind: "pct", group: "Risque" },
  { key: "mdd", label: "Perte maximale", kind: "pct", group: "Risque", desc: "Plus forte baisse depuis un plus haut (max drawdown)" },
  { key: "te", label: "Tracking error", kind: "pct", group: "Risque" },
  { key: "top10", label: "Poids des 10 premières lignes", kind: "pct", get: (r) => pts(r.top10), group: "Risque" },
  { key: "cash", label: "Liquidités", kind: "pct", get: (r) => pts(r.cash), group: "Risque" },
  { key: "derivatives", label: "Exposition aux dérivés", kind: "pct", get: (r) => pts(r.derivatives), group: "Risque" },
  { key: "n_lines", label: "Nombre de lignes", kind: "int", group: "Risque" },
  { key: "global_exposure", label: "Méthode d'exposition globale", group: "Risque" },
  { key: "leverage", label: "Risque de levier", kind: "bool", group: "Risque" },
  { key: "liquidity", label: "Risque de liquidité", kind: "bool", group: "Risque" },
  { key: "credit", label: "Risque de crédit", kind: "bool", group: "Risque" },
  { key: "counterparty", label: "Risque de contrepartie", kind: "bool", group: "Risque" },
];

async function loadFunds(ctx: Ctx) {
  const [f, rev, risk] = await Promise.all([
    get<{ funds: FundRow[] }>(ctx.api("/api/funds")), get<Rev>(ctx.api("/api/revenue")).catch(() => ({ funds: [] }) as Rev), get<Risk>(ctx.api("/api/risk")).catch(() => ({ funds: [], sri: [] }) as Risk),
  ]);
  const rv = new Map(rev.funds.map((x) => [x.id, x])), rk = new Map(risk.funds.map((x) => [x.id, x]));
  const all: FundX[] = f.funds.map((x) => ({ ...x, ...(rv.get(x.id) ?? {}), ...(rk.get(x.id) ?? {}), id: x.id }));
  let rows = pick(all, ctx.p.family, (x) => x.family);
  rows = pick(rows, ctx.p.domicile, (x) => x.domicile);
  rows = pick(rows, ctx.p.sfdr, (x) => x.sfdr);
  rows = pick(rows, ctx.p.asset_class, (x) => x.asset_class);
  const key = ctx.p.sort as keyof FundX;
  rows = [...rows].sort((a, b) => ((b[key] as number) ?? -Infinity) - ((a[key] as number) ?? -Infinity));
  return { all, rows, risk };
}

const FONDS: Dataset = {
  id: "fonds", label: "Fonds", group: "Gestion", sheet: "Fonds",
  description: "Tous les fonds : identité, encours, collecte, performance, revenus estimés et risque",
  params: ["family", "domicile", "sfdr", "asset_class", "sort", "top"],
  columns: C(FUND_X), defaults: ["name", "family", "range", "manager", "aum", "var_YTD", "flows_YTD", "perf_YTD", "revenue", "sri", "sfdr"],
  charts: [{ id: "top", label: "Premiers fonds par encours", on: true }, { id: "flows", label: "Collecte YTD : premiers et derniers", on: true },
    { id: "famille", label: "Encours par famille (100 %)", on: true }, { id: "perf", label: "Performance YTD des premiers fonds", on: false }],
  async load(ctx) {
    const { all, rows } = await loadFunds(ctx);
    const charts: ChartSpec[] = [];
    const byAum = [...rows].sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0)).slice(0, ctx.p.top);
    if (want(ctx, "top")) charts.push({ id: "fonds-top", kind: "barh", unit: "eur", title: `Les ${byAum.length} premiers fonds par encours`, labels: byAum.map((x) => x.name), series: [{ name: "Encours", values: byAum.map((x) => x.aum) }] });
    if (want(ctx, "flows")) {
      const s = [...rows].filter((x) => x.flows_YTD != null).sort((a, b) => (b.flows_YTD ?? 0) - (a.flows_YTD ?? 0));
      const k = Math.min(6, Math.floor(s.length / 2));
      const sel = [...s.slice(0, k), ...s.slice(-k)];
      charts.push({ id: "fonds-flows", kind: "barh", unit: "eur", title: "Collecte nette depuis le 1er janvier", note: "Les plus fortes souscriptions nettes, puis les plus forts rachats nets (estimation)", labels: sel.map((x) => x.name), series: [{ name: "Collecte YTD", values: sel.map((x) => x.flows_YTD ?? null) }] });
    }
    if (want(ctx, "famille")) {
      const g = new Map<string, number>();
      rows.forEach((x) => g.set(x.family, (g.get(x.family) ?? 0) + (x.aum ?? 0)));
      const ks = [...g.keys()].sort((a, b) => famOrder(a) - famOrder(b));
      charts.push({ id: "fonds-fam", kind: "stack", unit: "eur", title: "Répartition de l'encours par famille de gestion", labels: ks.map((k) => fam(k) ?? k), series: [{ name: "Encours", values: ks.map((k) => g.get(k) ?? 0) }] });
    }
    if (want(ctx, "perf")) charts.push({ id: "fonds-perf", kind: "barh", unit: "pct", title: "Performance depuis le 1er janvier", note: `Les ${byAum.length} premiers fonds par encours`, labels: byAum.map((x) => x.name), series: [{ name: "Perf. YTD", values: byAum.map((x) => x.perf_YTD ?? null) }] });
    return { rows: rows as never, charts, options: { family: uniq(all.map((x) => x.family)), domicile: uniq(all.map((x) => x.domicile)), sfdr: uniq(all.map((x) => x.sfdr)), asset_class: uniq(all.map((x) => x.asset_class)) } };
  },
};

// ------------------------------------------------------------------ évolution de l'encours
type Series = { points: { d: string; p: string; aum: number; delta: number | null; pct: number | null; flows: number | null; market: number | null }[]; families: { key: string; label: string; values: (number | null)[] }[]; summary: Record<string, unknown> };
const EVO_BASE: ExportCol<Record<string, unknown>>[] = [
  { key: "period", label: "Période", group: "Période" },
  { key: "d", label: "Date de fin", kind: "date", group: "Période" },
  { key: "aum", label: "Encours (€)", kind: "eur", group: "Encours", desc: "Encours total en fin de période" },
  { key: "delta", label: "Variation (€)", kind: "eur", sum: true, group: "Encours" },
  { key: "pct", label: "Variation (%)", kind: "pct", group: "Encours" },
  { key: "flows", label: "Collecte nette (€)", kind: "eur", sum: true, group: "Décomposition", desc: "Souscriptions moins rachats (estimation)" },
  { key: "market", label: "Effet marché (€)", kind: "eur", sum: true, group: "Décomposition", desc: "Variation d'encours non expliquée par la collecte" },
  ...FAMILY_ORDER.map((k) => ({ key: `fam_${k}`, label: `Encours ${FAMILY_LABEL[k]} (€)`, kind: "eur" as const, group: "Par famille" })),
];
const EVOLUTION: Dataset = {
  id: "evolution", label: "Évolution de l'encours", group: "Gestion", sheet: "Évolution",
  description: "L'encours période par période, la collecte et l'effet marché, par famille",
  params: ["freq", "range", "family"],
  columns: C(EVO_BASE), defaults: ["period", "d", "aum", "delta", "pct", "flows", "market"],
  charts: [{ id: "aum", label: "Courbe de l'encours", on: true }, { id: "decomp", label: "Collecte et effet marché", on: true }, { id: "fam", label: "Encours par famille", on: false }],
  async load(ctx) {
    const fam1 = ctx.p.family.length === 1 ? `&famille=${ctx.p.family[0]}` : "";
    const s = await get<Series>(ctx.api(`/api/encours/series?freq=${ctx.p.freq}&range=${ctx.p.range}${fam1}`));
    const rows = s.points.map((p, i) => {
      const r: Record<string, unknown> = { period: PERIOD[ctx.p.freq](p.d), d: p.d, aum: p.aum, delta: p.delta, pct: p.pct, flows: p.flows, market: p.market };
      s.families.forEach((f) => (r[`fam_${f.key}`] = f.values[i] ?? null));
      return r;
    });
    const lab = rows.map((r) => String(r.period));
    const charts: ChartSpec[] = [];
    if (want(ctx, "aum")) charts.push({ id: "evo-aum", kind: "line", unit: "eur", title: "Encours sous gestion", note: fam1 ? fam(ctx.p.family[0]) ?? undefined : "Toutes familles", labels: lab, series: [{ name: "Encours", values: s.points.map((p) => p.aum) }] });
    if (want(ctx, "decomp")) charts.push({ id: "evo-dec", kind: "col", unit: "eur", title: "D'où vient la variation : collecte et effet marché", labels: lab, series: [{ name: "Collecte nette", values: s.points.map((p) => p.flows) }, { name: "Effet marché", values: s.points.map((p) => p.market) }] });
    if (want(ctx, "fam") && s.families.length) charts.push({ id: "evo-fam", kind: "line", unit: "eur", title: "Encours par famille de gestion", labels: lab, series: [...s.families].sort((a, b) => famOrder(a.key) - famOrder(b.key)).map((f) => ({ name: f.label, values: f.values })) });
    return { rows, charts, options: { family: FAMILY_ORDER as string[] } };
  },
};

// ------------------------------------------------------------------ répartition selon un axe
export const DIMS: { key: string; label: string }[] = [
  { key: "family", label: "Famille de gestion" }, { key: "range", label: "Gamme" }, { key: "asset_class", label: "Classe d'actifs" }, { key: "expertise", label: "Expertise" },
  { key: "manager", label: "Gérant principal" }, { key: "sfdr", label: "Classification SFDR" }, { key: "sri", label: "Indicateur de risque (SRI)" }, { key: "domicile", label: "Domicile" },
  { key: "legal_form", label: "Forme juridique" }, { key: "currency", label: "Devise du fonds" }, { key: "share_ccy", label: "Devise de la part" }, { key: "distribution", label: "Affectation des revenus" },
  { key: "investor", label: "Souscripteurs" }, { key: "hedged", label: "Couverture de change" },
];
type Bd = { label: string; total: number; groups: { key: string; label: string; aum: number; weight: number; n_funds?: number; n_shares?: number; var?: Record<string, { pct: number | null; delta: number | null; flows: number | null }> }[] };
const REP_COLS: ExportCol<Record<string, unknown>>[] = [
  { key: "label", label: "Catégorie", group: "Catégorie" },
  { key: "aum", label: "Encours (€)", kind: "eur", sum: true, group: "Encours" },
  { key: "weight", label: "Poids", kind: "pct", sum: true, group: "Encours" },
  { key: "n", label: "Nombre de fonds ou de parts", kind: "int", sum: true, group: "Encours" },
  ...(["1M", "YTD", "1A"] as const).flatMap((p) => [
    { key: `pct_${p}`, label: `Variation ${p === "1M" ? "1 mois" : p === "1A" ? "1 an" : "YTD"} (%)`, kind: "pct" as const, group: "Variation" },
    { key: `delta_${p}`, label: `Variation ${p === "1M" ? "1 mois" : p === "1A" ? "1 an" : "YTD"} (€)`, kind: "eur" as const, sum: true, group: "Variation" },
    { key: `flows_${p}`, label: `Collecte ${p === "1M" ? "1 mois" : p === "1A" ? "1 an" : "YTD"} (€)`, kind: "eur" as const, sum: true, group: "Collecte" },
  ]),
];
const REPARTITION: Dataset = {
  id: "repartition", label: "Répartition de l'encours", group: "Gestion", sheet: "Répartition",
  description: "L'encours ventilé selon l'axe de votre choix, avec variations et collecte",
  params: ["dim"],
  columns: C(REP_COLS), defaults: ["label", "aum", "weight", "n", "pct_YTD", "flows_YTD"],
  charts: [{ id: "bar", label: "Encours par catégorie", on: true }, { id: "stack", label: "Poids (100 %)", on: false }, { id: "flows", label: "Collecte YTD par catégorie", on: false }],
  async load(ctx) {
    const b = await get<Bd>(ctx.api(`/api/breakdown/${ctx.p.dim}`));
    const rows = [...b.groups].sort((x, y) => y.aum - x.aum).map((g) => {
      const r: Record<string, unknown> = { label: g.label, aum: g.aum, weight: g.weight, n: g.n_funds ?? g.n_shares ?? null };
      (["1M", "YTD", "1A"] as const).forEach((p) => { r[`pct_${p}`] = g.var?.[p]?.pct ?? null; r[`delta_${p}`] = g.var?.[p]?.delta ?? null; r[`flows_${p}`] = g.var?.[p]?.flows ?? null; });
      return r;
    });
    const lab = rows.map((r) => String(r.label));
    const charts: ChartSpec[] = [];
    if (want(ctx, "bar")) charts.push({ id: `rep-bar-${ctx.p.dim}`, kind: "barh", unit: "eur", title: `Encours par ${b.label.toLowerCase()}`, labels: lab.slice(0, 15), series: [{ name: "Encours", values: rows.slice(0, 15).map((r) => r.aum as number) }] });
    if (want(ctx, "stack")) charts.push({ id: `rep-stack-${ctx.p.dim}`, kind: "stack", unit: "eur", title: `Poids de chaque ${b.label.toLowerCase()}`, labels: lab.slice(0, 6), series: [{ name: "Encours", values: rows.slice(0, 6).map((r) => r.aum as number) }] });
    if (want(ctx, "flows")) charts.push({ id: `rep-flows-${ctx.p.dim}`, kind: "barh", unit: "eur", title: `Collecte YTD par ${b.label.toLowerCase()}`, labels: lab.slice(0, 15), series: [{ name: "Collecte", values: rows.slice(0, 15).map((r) => r.flows_YTD as number) }] });
    return { rows, charts, title: `Répartition par ${b.label.toLowerCase()}` };
  },
};

// ------------------------------------------------------------------ revenus estimés
type RevAll = { total: number; total_12m: number; rate: number; families: { key: string; label: string; revenue: number; aum: number; n: number; rate: number; share: number }[];
  ranges: RevAll["families"]; asset_classes: RevAll["families"]; trend: { d: string; v: number }[] };
const REV_COLS: ExportCol<Record<string, unknown>>[] = [
  { key: "axis", label: "Axe", group: "Catégorie" }, { key: "label", label: "Catégorie", group: "Catégorie" },
  { key: "revenue", label: "Revenus annualisés (€)", kind: "eur", sum: true, group: "Revenus", desc: "Encours × taux de frais de gestion (estimation)" },
  { key: "share", label: "Part des revenus", kind: "pct", group: "Revenus" },
  { key: "aum", label: "Encours (€)", kind: "eur", sum: true, group: "Encours" },
  { key: "rate", label: "Taux moyen de frais", kind: "pct", get: (r) => pts(r.rate as number), group: "Revenus", desc: "Revenus rapportés à l'encours" },
  { key: "n", label: "Nombre de fonds", kind: "int", sum: true, group: "Encours" },
];
const REVENUS: Dataset = {
  id: "revenus", label: "Revenus estimés", group: "Gestion", sheet: "Revenus",
  description: "Les revenus de gestion estimés, par famille, gamme et classe d'actifs",
  params: [],
  columns: C(REV_COLS), defaults: ["axis", "label", "revenue", "share", "aum", "rate", "n"],
  charts: [{ id: "trend", label: "Revenus annualisés dans le temps", on: true }, { id: "fam", label: "Revenus par famille", on: true }, { id: "range", label: "Revenus par gamme", on: false }],
  async load(ctx) {
    const r = await get<RevAll>(ctx.api("/api/revenue"));
    const rows = ([["Famille de gestion", r.families], ["Gamme", r.ranges], ["Classe d'actifs", r.asset_classes]] as const)
      .flatMap(([axis, xs]) => [...xs].sort((a, b) => b.revenue - a.revenue).map((x) => ({ axis, label: x.label, revenue: x.revenue, share: x.share, aum: x.aum, rate: x.rate, n: x.n })));
    const charts: ChartSpec[] = [];
    if (want(ctx, "trend") && r.trend.length) charts.push({ id: "rev-trend", kind: "line", unit: "eur", title: "Revenus de gestion annualisés", note: "Estimation : encours × taux de frais, à chaque fin de mois", labels: r.trend.map((p) => PERIOD.M(p.d)), series: [{ name: "Revenus annualisés", values: r.trend.map((p) => p.v) }] });
    if (want(ctx, "fam")) { const f = [...r.families].sort((a, b) => famOrder(a.key) - famOrder(b.key)); charts.push({ id: "rev-fam", kind: "stack", unit: "eur", title: "Revenus estimés par famille de gestion", labels: f.map((x) => x.label), series: [{ name: "Revenus", values: f.map((x) => x.revenue) }] }); }
    if (want(ctx, "range")) { const g = [...r.ranges].sort((a, b) => b.revenue - a.revenue).slice(0, 12); charts.push({ id: "rev-range", kind: "barh", unit: "eur", title: "Revenus estimés par gamme", labels: g.map((x) => x.label), series: [{ name: "Revenus", values: g.map((x) => x.revenue) }] }); }
    return { rows, charts };
  },
};

// ------------------------------------------------------------------ risque
const RISQUE: Dataset = {
  id: "risque", label: "Risque", group: "Gestion", sheet: "Risque",
  description: "Indicateurs de risque par fonds : SRI, volatilité, perte maximale, concentration, liquidités, dérivés",
  params: ["family"],
  columns: C(FUND_X.filter((c) => ["name", "family", "aum", "sri", "sri_prev", "vol", "mdd", "te", "top10", "cash", "derivatives", "n_lines", "global_exposure", "leverage", "liquidity", "credit", "counterparty", "sfdr"].includes(c.key))),
  defaults: ["name", "family", "aum", "sri", "vol", "mdd", "top10", "cash", "n_lines"],
  charts: [{ id: "sri", label: "Encours par niveau de SRI", on: true }, { id: "vol", label: "Fonds les plus volatils", on: false }],
  async load(ctx) {
    const { rows, risk } = await loadFunds({ ...ctx, p: { ...ctx.p, sort: "aum", domicile: [], sfdr: [], asset_class: [] } });
    const charts: ChartSpec[] = [];
    if (want(ctx, "sri")) { const s = [...risk.sri].sort((a, b) => Number(a.sri) - Number(b.sri)); charts.push({ id: "risk-sri", kind: "col", unit: "eur", title: "Encours par indicateur synthétique de risque (SRI)", labels: s.map((x) => `SRI ${x.sri}`), series: [{ name: "Encours", values: s.map((x) => x.aum) }] }); }
    if (want(ctx, "vol")) { const v = [...rows].filter((x) => x.vol != null).sort((a, b) => (b.vol ?? 0) - (a.vol ?? 0)).slice(0, 12); charts.push({ id: "risk-vol", kind: "barh", unit: "pct", title: "Les fonds les plus volatils", labels: v.map((x) => x.name), series: [{ name: "Volatilité", values: v.map((x) => x.vol ?? null) }] }); }
    return { rows: rows as never, charts, options: { family: FAMILY_ORDER as string[] } };
  },
};

// ------------------------------------------------------------------ distribution
type Dist = { countries: { country: string; iso: string; n_shares: number; n_funds: number; aum_registered: number }[]; platforms: { label: string; n_shares: number; aum: number }[];
  clients: { client: string; kind?: string; n_shares: number; n_funds: number; countries: { country: string; iso: string; n_shares: number; n_funds: number }[] }[];
  timeline: { years: { year: number; new: number; cumulative: number; n_funds: number; opened: string[] }[] } };
const distUrl = (ctx: Ctx) => ctx.api(`/api/distribution${ctx.p.rmm ? "" : "?rmm=exclure"}`);
const CLIENTS: Dataset = {
  id: "clientele", label: "Clientèles × pays", group: "Distribution", sheet: "Clientèles × pays",
  description: "Chaque couple clientèle-pays : parts et fonds autorisés",
  params: ["rmm"],
  columns: C<Record<string, unknown>>([
    { key: "client", label: "Clientèle", group: "Clientèle", desc: "Client nommé d'une part dédiée, à défaut le pool de clientèle" },
    { key: "kind", label: "Nature", group: "Clientèle" },
    { key: "c_countries", label: "Pays de la clientèle", kind: "int", group: "Clientèle" },
    { key: "c_shares", label: "Parts de la clientèle", kind: "int", group: "Clientèle" },
    { key: "c_funds", label: "Fonds de la clientèle", kind: "int", group: "Clientèle" },
    { key: "country", label: "Pays d'enregistrement", group: "Autorisation" },
    { key: "iso", label: "Code pays", kind: "code", group: "Autorisation" },
    { key: "n_shares", label: "Parts autorisées dans le pays", kind: "int", sum: true, group: "Autorisation" },
    { key: "n_funds", label: "Fonds autorisés dans le pays", kind: "int", group: "Autorisation" },
  ]),
  defaults: ["client", "kind", "country", "iso", "n_shares", "n_funds"],
  charts: [{ id: "par-pays", label: "Clientèles par pays", on: true }, { id: "histo", label: "Nombre de pays par clientèle", on: true }],
  async load(ctx) {
    const d = await get<Dist>(distUrl(ctx));
    const rows = d.clients.flatMap((c) => c.countries.map((x) => ({ client: c.client, kind: c.kind === "nommé" ? "Client nommé" : "Pool de clientèle", c_countries: c.countries.length, c_shares: c.n_shares, c_funds: c.n_funds, ...x })));
    const named = d.clients.filter((c) => c.kind === "nommé");
    const base = named.length ? named : d.clients;
    const charts: ChartSpec[] = [];
    if (want(ctx, "par-pays")) {
      const n = new Map<string, number>(); base.forEach((c) => c.countries.forEach((x) => n.set(x.country, (n.get(x.country) ?? 0) + 1)));
      const s = [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
      charts.push({ id: "cl-pays", kind: "barh", unit: "int", title: named.length ? "Clients nommés par pays" : "Clientèles par pays", labels: s.map((x) => x[0]), series: [{ name: "Clientèles", values: s.map((x) => x[1]) }] });
    }
    if (want(ctx, "histo")) {
      const h = new Map<number, number>(); base.forEach((c) => h.set(c.countries.length, (h.get(c.countries.length) ?? 0) + 1));
      const ks = [...h.keys()].sort((a, b) => a - b);
      const mean = base.reduce((s, c) => s + c.countries.length, 0) / Math.max(1, base.length);
      charts.push({ id: "cl-histo", kind: "col", unit: "int", title: "Nombre de pays par clientèle", note: `Moyenne : ${mean.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} pays`, labels: ks.map((k) => `${k} pays`), series: [{ name: "Clientèles", values: ks.map((k) => h.get(k) ?? 0) }] });
    }
    return { rows, charts };
  },
};
const PAYS: Dataset = {
  id: "pays", label: "Pays de commercialisation", group: "Distribution", sheet: "Pays",
  description: "Chaque pays : fonds et parts autorisés, clientèles, encours des parts autorisées",
  params: ["rmm"],
  columns: C<Record<string, unknown>>([
    { key: "country", label: "Pays", group: "Pays" }, { key: "iso", label: "Code pays", kind: "code", group: "Pays" },
    { key: "n_funds", label: "Fonds autorisés", kind: "int", group: "Autorisations" }, { key: "n_shares", label: "Parts autorisées", kind: "int", sum: true, group: "Autorisations" },
    { key: "n_clients", label: "Clientèles", kind: "int", group: "Autorisations", desc: "Clientèles ayant au moins une part autorisée dans le pays" },
    { key: "aum_registered", label: "Encours des parts autorisées (€)", kind: "eur", group: "Encours", desc: "Encours total des parts autorisées — non ventilé par pays (une part peut l'être dans plusieurs)" },
  ]),
  defaults: ["country", "iso", "n_funds", "n_shares", "n_clients"],
  charts: [{ id: "parts", label: "Parts autorisées par pays", on: true }],
  async load(ctx) {
    const d = await get<Dist>(distUrl(ctx));
    const nc = new Map<string, number>(); d.clients.forEach((c) => c.countries.forEach((x) => nc.set(x.iso, (nc.get(x.iso) ?? 0) + 1)));
    const rows = [...d.countries].sort((a, b) => b.n_shares - a.n_shares).map((c) => ({ ...c, n_clients: nc.get(c.iso) ?? 0 }));
    const charts: ChartSpec[] = want(ctx, "parts") ? [{ id: "pays-parts", kind: "barh", unit: "int", title: "Parts autorisées par pays", labels: rows.slice(0, 18).map((r) => r.country), series: [{ name: "Parts", values: rows.slice(0, 18).map((r) => r.n_shares) }] }] : [];
    return { rows, charts };
  },
};
const PLATEFORMES: Dataset = {
  id: "plateformes", label: "Plateformes", group: "Distribution", sheet: "Plateformes",
  description: "Référencement sur les plateformes : parts et encours",
  params: ["rmm"],
  columns: C<Record<string, unknown>>([
    { key: "label", label: "Plateforme", group: "Plateforme" }, { key: "n_shares", label: "Parts référencées", kind: "int", group: "Référencement" },
    { key: "aum", label: "Encours des parts référencées (€)", kind: "eur", group: "Référencement" },
  ]),
  defaults: ["label", "n_shares", "aum"],
  charts: [{ id: "bar", label: "Parts référencées par plateforme", on: true }],
  async load(ctx) {
    const d = await get<Dist>(distUrl(ctx));
    const rows = [...d.platforms].sort((a, b) => b.n_shares - a.n_shares);
    return { rows, charts: want(ctx, "bar") ? [{ id: "plat-bar", kind: "barh", unit: "int", title: "Parts référencées par plateforme", labels: rows.map((r) => r.label), series: [{ name: "Parts", values: rows.map((r) => r.n_shares) }] }] : [] };
  },
};
const CHRONO: Dataset = {
  id: "chronologie", label: "Chronologie des autorisations", group: "Distribution", sheet: "Chronologie",
  description: "Enregistrements actifs par année d'enregistrement, pays ouverts",
  params: ["rmm"],
  columns: C<Record<string, unknown>>([
    { key: "year", label: "Année", kind: "int", group: "Année" }, { key: "new", label: "Nouveaux enregistrements", kind: "int", sum: true, group: "Enregistrements" },
    { key: "cumulative", label: "Enregistrements cumulés", kind: "int", group: "Enregistrements" }, { key: "n_funds", label: "Fonds concernés", kind: "int", group: "Enregistrements" },
    { key: "opened", label: "Pays ouverts cette année", get: (r) => ((r.opened as string[]) ?? []).join(", "), group: "Pays" },
  ]),
  defaults: ["year", "new", "cumulative", "opened"],
  charts: [{ id: "col", label: "Nouveaux enregistrements par année", on: true }],
  async load(ctx) {
    const d = await get<Dist>(distUrl(ctx));
    const rows = d.timeline.years;
    return { rows, charts: want(ctx, "col") ? [{ id: "chrono-col", kind: "col", unit: "int", title: "Nouveaux enregistrements par année", labels: rows.map((r) => String(r.year)), series: [{ name: "Nouveaux", values: rows.map((r) => r.new) }] }] : [] };
  },
};

// ------------------------------------------------------------------ portefeuilles
type Hold = { instruments: { name: string; isin: string | null; asset_class: string | null; ccy: string | null; n_funds: number; amount_eur: number }[]; by_class: { label: string; amount_eur: number; weight: number }[]; by_ccy: Hold["by_class"] };
const PORTEFEUILLES: Dataset = {
  id: "portefeuilles", label: "Lignes en portefeuille", group: "Portefeuilles", sheet: "Lignes",
  description: "Principales lignes détenues par l'ensemble des fonds (inventaires), par classe d'actifs et devise",
  params: [],
  columns: C<Record<string, unknown>>([
    { key: "name", label: "Instrument", group: "Instrument" }, { key: "isin", label: "ISIN", kind: "code", group: "Instrument" },
    { key: "asset_class", label: "Classe d'actifs", group: "Instrument" }, { key: "ccy", label: "Devise", kind: "code", group: "Instrument" },
    { key: "n_funds", label: "Fonds détenteurs", kind: "int", group: "Détention" }, { key: "amount_eur", label: "Montant détenu (€)", kind: "eur", sum: true, group: "Détention" },
  ]),
  defaults: ["name", "isin", "asset_class", "ccy", "n_funds", "amount_eur"],
  charts: [{ id: "class", label: "Par classe d'actifs (100 %)", on: true }, { id: "ccy", label: "Par devise", on: false }],
  async load(ctx) {
    const h = await get<Hold>(ctx.api("/api/holdings"));
    const charts: ChartSpec[] = [];
    if (want(ctx, "class")) charts.push({ id: "pf-class", kind: "stack", unit: "eur", title: "Inventaires par classe d'actifs", labels: h.by_class.map((x) => x.label), series: [{ name: "Montant", values: h.by_class.map((x) => x.amount_eur) }] });
    if (want(ctx, "ccy")) charts.push({ id: "pf-ccy", kind: "barh", unit: "eur", title: "Inventaires par devise", labels: h.by_ccy.map((x) => x.label), series: [{ name: "Montant", values: h.by_ccy.map((x) => x.amount_eur) }] });
    return { rows: h.instruments, charts };
  },
};

export const DATASETS: Dataset[] = [FONDS, EVOLUTION, REPARTITION, REVENUS, RISQUE, CLIENTS, PAYS, PLATEFORMES, CHRONO, PORTEFEUILLES];
export const datasetById = (id: string) => DATASETS.find((d) => d.id === id)!;

/** Indicateurs clés du sommaire (une requête légère par source, en cache). */
export async function loadKpis(api: (u: string) => string, rmm: boolean) {
  const [ov, rev, dist] = await Promise.all([
    get<{ aum: number; n_funds: number; n_parts: number; var: Record<string, { pct: number | null; flows: number | null }> }>(api("/api/overview")).catch(() => null),
    get<RevAll>(api("/api/revenue")).catch(() => null),
    get<Dist>(api(`/api/distribution${rmm ? "" : "?rmm=exclure"}`)).catch(() => null),
  ]);
  return { ov, rev, dist };
}
