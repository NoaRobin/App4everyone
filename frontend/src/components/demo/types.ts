import type { FamilyKey, Variation } from "../../lib/types";

export type Match = { asked: string; found: string | null; exact: boolean; ambiguous?: boolean; score?: number; alternatives: { name: string; score: number }[] };
export type DemoPeople = {
  date: string; mock: boolean; commercials_available: boolean;
  gerants: { key: string; label: string; name: string; match: Match }[];
  commerciaux: { name: string; match: Match }[];
  banque_privee: { name: string; match: Match };
};

export type PerfKey = "1M" | "YTD" | "1A" | "3A" | "5A";
export type FlowKey = "1M" | "3M" | "YTD" | "1A" | "3A" | "5A";
export type ManagerFund = {
  id: string; name: string; family: FamilyKey; range: string | null; asset_class: string | null; aum: number | null; sri: string | null; sfdr: string | null;
  n_parts: number | null; countries: number; share: string | null; bench_name: string | null;
  perf: Record<PerfKey, number | null>; bench: Record<PerfKey, number | null>; flows: Record<FlowKey, number | null>;
  vol: number | null; mdd: number | null; te: number | null; revenue: number | null; rate: number | null; lines: number | null; top10: number | null; flows_off: boolean;
};
export type CountryRow = { country: string; iso: string | null; encours: number; pct: number | null; positions?: number; clients?: number };
export type ZoneHold = { zone: string; encours: number; pct: number | null; positions?: number; clients?: number; funds?: Record<string, number>; countries: CountryRow[] };
export type Flow = { subscriptions: number; redemptions: number; net: number; n: number };
export type FlowRow = Flow & { key: string; countries?: (Flow & { key: string; iso: string | null })[] };
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
  available: boolean; reason?: string; match: Match; date: string; name: string; funds: ManagerFund[]; co_managed: { id: string; name: string }[];
  aum?: number; var?: Record<FlowKey, Variation>; revenue?: number | null; countries?: number;
  series?: { d: string; aum: number | null; flows: number | null; market: number | null }[];
  stack?: { dates: string[]; funds: { id: string; values: number[] }[] };
  portfolio?: { fund: string; name: string; date: string; n_lines: number; top10_weight: number | null; cash_weight: number | null;
    lines: { key: string; name: string; isin: string | null; asset_class: string | null; weight: number | null; is_new?: boolean; prev_weight?: number | null }[];
    by_class: { label: string; weight: number }[]; moves: { key: string; name: string; kind: string; weight: number; change: number }[] };
  passif?: PassifSide;
};

export type CityPeriod = "1M" | "YTD" | "1A" | "3A" | "5A";
export type FlowCityData = {
  date: string; first: string; excluded: number;
  periods: Record<CityPeriod, { available: boolean; start: string | null; net: number | null; inflows: number | null; outflows: number | null; n_up: number; n_down: number }>;
  funds: { id: string; name: string; family: FamilyKey; aum: number; manager: string | null; flows: Record<CityPeriod, number | null>; var: Record<CityPeriod, number | null> }[];
};

export type ClientRow = {
  client: string; encours: number; pct: number | null; country: string; iso: string | null; zone: string; segment: string; accounts: number;
  funds: { fund: string | null; name: string; encours: number; pct: number | null; shares: { isin: string | null; share: string | null; encours: number }[] }[];
  classes: { key: string; encours: number }[]; net_1a: number | null; last_op: string | null;
};
export type Segment = { segment: string; encours: number; pct: number | null; clients: number };
export type HoldZone = { zone: string; encours: number; pct: number | null; clients: number; countries: CountryRow[] };
export type SalesView = {
  available: boolean; reason?: string; match: Match; name: string; as_of: string; flows_end: string | null; flows_available: boolean;
  encours: number; positions: number; clients_count: number; accounts: number;
  periods: Record<"1M" | "3M" | "YTD" | "1A", PeriodFlows>; monthly: Monthly[]; holdings_zones: HoldZone[]; clients: ClientRow[]; segments: Segment[];
};
export type PrivateBankView = {
  available: boolean; reason?: string; match: Match; scope: "commercial" | "segment"; name: string | null; as_of: string; encours: number;
  clients_count: number; positions: number; funds_count: number;
  by_fund: { fund: string | null; name: string; encours: number; pct: number | null; clients: number; classe: string }[];
  classes: { key: string; encours: number; pct: number | null }[]; zones: HoldZone[]; segments: Segment[];
  vintage: { year: number; encours: number; pct: number | null }[]; new_money_ytd: number;
  concentration: { top1: number | null; top5: number | null; top10: number | null };
  matrix: { clients: string[]; funds: string[]; fund_ids: (string | null)[]; values: number[][] };
  clients: ClientRow[]; flows_available: boolean; flows_end?: string;
  periods?: Record<"1M" | "3M" | "YTD" | "1A", PeriodFlows>; monthly?: Monthly[];
  rotation?: (Flow & { fund: string | null; name: string })[]; flow_classes?: FlowRow[]; latest?: Operation[];
};
