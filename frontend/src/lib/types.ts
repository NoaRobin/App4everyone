export type FamilyKey = "aid" | "ae" | "fi" | "ao" | "nc";
export type Point = { d: string; v: number };
export type Variation = {
  start: string | null; aum_start: number | null; aum_end: number | null;
  delta: number | null; pct: number | null; flows: number | null; market: number | null;
};
export type Meta = {
  is_mock: boolean; first_date: string; last_date: string; refresh: string | null; jump_updated: string | null;
  families: { key: FamilyKey; label: string; short: string }[]; periods: string[]; dims: Record<string, string>;
};
export type FundRow = {
  id: string; name: string; family: FamilyKey; referenced: boolean; aum: number | null;
  var_1M?: number | null; var_YTD?: number | null; var_1A?: number | null; delta_1M?: number | null; delta_YTD?: number | null;
  flows_1M?: number | null; flows_YTD?: number | null; flows_1A?: number | null;
  range?: string | null; asset_class?: string | null; expertise?: string | null; manager?: string | null; backup?: string | null;
  sfdr?: string | null; sri?: string | null; domicile?: string | null; legal_form?: string | null; currency?: string | null;
  amf?: string | null; n_parts?: number; perf_YTD?: number | null; perf_1A?: number | null; vol_1A?: number | null; countries?: string[];
};
export type Overview = {
  date: string; aum: number; n_funds: number; n_parts: number; var: Record<string, Variation>; series: Point[];
  families: { key: FamilyKey; label: string; aum: number; n_funds: number; var: Record<string, Variation>; series: Point[] }[];
  top_up: FundRow[]; top_down: FundRow[]; top_inflows: FundRow[]; top_outflows: FundRow[];
};
export type CityData = {
  date: string; months: string[];
  funds: { id: string; name: string; family: FamilyKey; aum: number; var_1M: number | null; var_YTD: number | null;
    manager: string | null; range: string | null; sfdr: string | null; series: number[] }[];
};
export type SearchEntry = {
  t: string; id: string; label: string; sub?: string; family?: FamilyKey; aum?: number | null; key?: string;
  terms: string[]; fund_id?: string; attrs?: Record<string, string | string[] | null>;
};
export type Field = { label: string; value: string | number | boolean; kind: string };
export type Section = { key: string; title: string; items: Field[] };
export type Flag = { label: string; value: boolean | null };
export type Perf = {
  first_nav: string; nav: number; nav_date: string; nav_ccy: string; bench_name: string | null;
  fund: Record<string, number | null>; bench: Record<string, number | null> | null;
  risk: { vol: number | null; mdd: number | null; te: number | null; bench_vol: number | null };
  index: Point[]; bench_index: Point[]; dividends: Point[]; share?: ShareBrief; nav_series?: Point[];
  calendar: { year: number; fund: number | null; bench?: number | null; partial: boolean; ytd: boolean }[];
};
export type ShareBrief = {
  id: string; jump: string | null; name: string; isin: string | null; link: string; class: string | null; ccy: string | null;
  hedged: boolean | null; distribution: string | null; investor: string | null; min_sub: number | null; ongoing: number | null;
  mgmt_fee: number | null; perf_fee: boolean | null; cutoff: string | null; settlement: string | null; rating: number | null;
  main: boolean | null; aum: number | null; flows_YTD: number | null; nav: number | null; nav_date: string | null; status: string | null;
};
export type Composition = {
  date: string; n_lines: number; top10_weight: number; hhi: number; cash_weight: number; derivatives_expo: number;
  lines: { key: string; name: string; isin: string | null; ccy: string | null; asset_class: string | null; type: string | null; debt: string | null; weight: number; amount_eur: number | null; prev_weight?: number | null; is_new?: boolean }[];
  by_class: { label: string; weight: number }[]; by_ccy: { label: string; weight: number }[]; by_debt: { label: string; weight: number }[];
  previous_date: string | null; moves: { key: string; name: string; kind: string; weight: number; change: number }[];
};
export type FundDetail = {
  id: string; name: string; family: FamilyKey; family_label: string; referenced: boolean; date: string;
  headline: Record<string, string | null>; aum: number | null; var: Record<string, Variation> | null;
  aum_series: Point[]; flows_monthly: Point[]; performance: Perf | null; shares: ShareBrief[]; composition: Composition | null;
  esg: { fields: Field[]; exclusions: Flag[]; pai: Flag[] };
  distribution: { countries: { country_fr: string; iso: string; n: number }[]; matrix: { share_id: string; share: string; countries: string[] }[] };
  sections: Section[]; validations: Flag[]; controls: { title: string; severity: string; details: string[] }[];
  flows_off?: { reason: string; rule: string } | null;
};
export type ShareDetail = ShareBrief & {
  fund: { id: string; name: string; family: FamilyKey } | null; date: string; var: Record<string, Variation> | null;
  aum_series: Point[]; performance: Perf | null; sections: Section[]; platforms: Flag[];
  registrations: { country: string; iso: string; active: boolean; date: string | null; finma: boolean | null; comment: string | null }[];
};
export type Group = { key: string; label: string; aum: number; weight: number | null; n_funds: number | null; var: Record<string, Variation>; series: Point[] };
export type Breakdown = { date: string; dim: string; label: string; total: number; groups: Group[]; filterable: boolean };
export type Control = { key: string; title: string; audience: string; severity: "serious" | "warning" | "info"; description: string; count: number;
  items: { fund_id?: string | null; share_id?: string; name: string; detail: string; aum?: number | null }[] };
