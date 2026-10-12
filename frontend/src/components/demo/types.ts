import type { FamilyKey, Variation } from "../../lib/types";

export type Match = { asked: string; found: string | null; exact: boolean; ambiguous?: boolean; score?: number; alternatives: { name: string; score: number }[] };
export type SalesPerson = { theme: string; slug: string; name: string; title: string | null; countries: { iso: string; name: string }[] };
export type DemoPeople = {
  date: string; mock: boolean;
  gerants: { key: string; label: string; name: string; role: string; family: string | null; match: Match }[];
  commerciaux: SalesPerson[];
  banque_privee: { name: string };
};

export type PerfKey = "1M" | "YTD" | "1A" | "3A" | "5A";
export type FlowKey = "1M" | "3M" | "YTD" | "1A" | "3A" | "5A";
export type ManagerFund = {
  id: string; name: string; family: FamilyKey; range: string | null; asset_class: string | null; aum: number | null; sri: string | null; sfdr: string | null;
  n_parts: number | null; countries: number; share: string | null; share_name?: string | null; share_isin?: string | null; share_aum?: number | null; bench_name: string | null;
  perf: Record<PerfKey, number | null>; bench: Record<PerfKey, number | null>; flows: Record<FlowKey, number | null>;
  vol: number | null; mdd: number | null; te: number | null; via_asset_class?: boolean; revenue: number | null; rate: number | null; lines: number | null; top10: number | null; flows_off: boolean;
};
export type CountryRow = { country: string; iso: string | null; encours: number; pct: number | null; positions?: number; clients?: number };
export type ZoneHold = { zone: string; encours: number; pct: number | null; positions?: number; clients?: number; funds?: Record<string, number>; countries: CountryRow[] };
export type Flow = { subscriptions: number; redemptions: number; net: number; n: number };
export type FlowRow = Flow & { key: string; iso?: string | null; countries?: (Flow & { key: string; iso: string | null })[] };
export type PeriodFlows = Flow & { start: string; clients: number; zones?: FlowRow[]; funds?: (Flow & { fund: string | null; name: string })[] };
export type Monthly = Flow & { m: string };
export type Operation = {
  date: string; date_vl: string | null; client: string | null; commercial: string | null; segment: string; teneur: string | null; country: string; iso: string | null;
  isin: string | null; share: string | null; fund: string | null; name: string | null; sens: string; amount: number; devise: string | null;
};
export type PassifSide = {
  available: boolean; reason?: string; as_of?: string; passif_total?: number; zones: ZoneHold[]; latest: Operation[]; flows_available: boolean; flows_end?: string;
  periods?: Record<string, PeriodFlows>; monthly?: Monthly[];
};
export type ManagerBoard = {
  available?: boolean; reason?: string; match?: Match; date: string; name?: string; funds: ManagerFund[]; co_managed?: { id: string; name: string }[];
  rule?: { columns: string[]; pattern: string }; perimeter?: { family: number; asset_class: number };
  aum?: number; var?: Record<FlowKey, Variation>; revenue?: number | null; countries?: number;
  series?: { d: string; aum: number | null; flows: number | null; market: number | null }[];
  stack?: { dates: string[]; funds: { id: string; values: number[] }[] };
  portfolio?: { fund: string; name: string; date: string; n_lines: number; top10_weight: number | null; cash_weight: number | null;
    lines: { key: string; name: string; isin: string | null; asset_class: string | null; weight: number | null; is_new?: boolean; prev_weight?: number | null }[];
    by_class: { label: string; weight: number }[]; moves: { key: string; name: string; kind: string; weight: number; change: number }[] };
  passif?: PassifSide;
};

export type ClientRow = {
  client: string; encours: number; pct: number | null; country: string; iso: string | null; zone: string; segment: string; accounts: number;
  funds: { fund: string | null; name: string; encours: number; pct: number | null; shares: { isin: string | null; share: string | null; encours: number }[] }[];
  classes: { key: string; encours: number }[]; net_1a: number | null; last_op: string | null;
};
export type Segment = { segment: string; encours: number; pct: number | null; clients: number };
export type HoldZone = { zone: string; encours: number; pct: number | null; clients: number; countries: CountryRow[] };
export type SalesView = {
  available: boolean; reason?: string; match?: Match; name?: string; as_of: string; flows_end: string | null; flows_available: boolean; countries_raw?: string[];
  encours: number; positions: number; clients_count: number; accounts: number;
  periods: Record<"1M" | "3M" | "YTD" | "1A", PeriodFlows>; monthly: Monthly[]; holdings_zones: HoldZone[]; clients: ClientRow[]; segments: Segment[];
};
export type RmmRow = { key: string; encours: number; pct: number | null; revenue: number; positions?: number; iso?: string | null };
export type RmmBank = {
  available: boolean; reason?: string; as_of: string; rule: string; matched: { classifications: string[]; teneurs: string[] };
  encours: number; share_of_passif: number | null; passif_total: number; revenue: number; rate: number | null; rate_coverage: number | null;
  share_of_revenue: number | null; positions: number; accounts: number; clients_count: number;
  segments: RmmRow[]; classes: RmmRow[]; countries: RmmRow[]; split: RmmRow[];
  funds: { fund: string | null; name: string; encours: number; pct: number | null; revenue: number; rate: number | null; rmm_fund: boolean; classe: string }[];
  funds_count: number;
  shares: { isin: string | null; share: string | null; fund: string | null; encours: number; pct: number | null; rate: number | null; revenue: number }[];
  vintage: { year: number; encours: number; pct: number | null }[];
  flows_available: boolean; flows_end?: string; periods?: Record<"1M" | "3M" | "YTD" | "1A", PeriodFlows>; monthly?: Monthly[];
  rotation?: (Flow & { fund: string | null; name: string })[]; flow_classes?: FlowRow[]; flow_segments?: FlowRow[]; latest?: Operation[];
  clients: ClientRow[];
};
