import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { eur, pct } from "../lib/format";
import { FAMILY_LABEL, famVar } from "../lib/families";
import type { FundRow } from "../lib/types";
import { Delta } from "./ui";
import { ExportButton } from "./ExportDialog";
import { FUND_COLS, FUND_ESSENTIAL, FUND_SCREEN } from "../lib/exportCols";
import { useApp } from "../lib/context";
import { date as fdate } from "../lib/format";

type Col = { key: keyof FundRow | string; label: string; n?: boolean; render?: (r: FundRow) => ReactNode; sort?: (r: FundRow) => number | string | null; csv?: (r: FundRow) => string };

export const COLS: Record<string, Col> = {
  name: { key: "name", label: "Fonds", render: (r) => (<><span className="dot" style={{ background: famVar(r.family), marginRight: 10 }} /><Link className="rowlink-inline strong" to={`/fonds/${encodeURIComponent(r.id)}`} onClick={(e) => e.stopPropagation()}>{r.name}</Link></>) },
  family: { key: "family", label: "Famille", render: (r) => <span className="small">{FAMILY_LABEL[r.family]}</span>, csv: (r) => FAMILY_LABEL[r.family] },
  range: { key: "range", label: "Gamme" },
  manager: { key: "manager", label: "Gérant" },
  sfdr: { key: "sfdr", label: "SFDR", render: (r) => r.sfdr?.replace("Article ", "Art. ") ?? "—" },
  sri: { key: "sri", label: "SRI", n: true },
  aum: { key: "aum", label: "Encours", n: true, render: (r) => <b>{eur(r.aum)}</b>, csv: (r) => (r.aum == null ? "" : String(Math.round(r.aum))) },
  var_1M: { key: "var_1M", label: "1 mois", n: true, render: (r) => <Delta v={r.var_1M} />, csv: (r) => (r.var_1M == null ? "" : (r.var_1M * 100).toFixed(2)) },
  var_YTD: { key: "var_YTD", label: "Var. YTD", n: true, render: (r) => <Delta v={r.var_YTD} />, csv: (r) => (r.var_YTD == null ? "" : (r.var_YTD * 100).toFixed(2)) },
  flows_YTD: { key: "flows_YTD", label: "Collecte YTD", n: true, render: (r) => <Delta v={r.flows_YTD} kind="eur" />, csv: (r) => (r.flows_YTD == null ? "" : String(Math.round(r.flows_YTD))) },
  perf_YTD: { key: "perf_YTD", label: "Perf. YTD", n: true, render: (r) => (r.perf_YTD == null ? "—" : pct(r.perf_YTD)), csv: (r) => (r.perf_YTD == null ? "" : (r.perf_YTD * 100).toFixed(2)) },
  domicile: { key: "domicile", label: "Domicile" },
};

export function FundTable({ rows, cols = ["name", "family", "range", "manager", "sfdr", "sri", "aum", "var_1M", "var_YTD", "flows_YTD", "perf_YTD"], filename = "fonds.csv", caption, title }:
  { rows: FundRow[]; cols?: string[]; filename?: string; caption: string; title?: string }) {
  const { asOf } = useApp();
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "aum", dir: -1 });
  const nav = useNavigate();
  const sorted = useMemo(() => {
    const c = COLS[sort.k];
    const get = c?.sort ?? ((r: FundRow) => (r as Record<string, unknown>)[sort.k] as number | string | null);
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(String(y), "fr") : (x as number) - (y as number)) * sort.dir;
    });
  }, [rows, sort]);
  const columns = cols.map((k) => COLS[k]);
  return (
    <div>
      <div className="spread" style={{ marginBottom: 12 }}>
        <span className="small muted">{rows.length} fonds · cliquez un en-tête pour trier</span>
        <ExportButton id="fonds" title={title ?? caption} filename={filename} rows={sorted} columns={FUND_COLS}
          shown={cols.map((k) => FUND_SCREEN[k]).filter(Boolean)} essential={FUND_ESSENTIAL}
          context={asOf ? [{ label: "Date de valeur", value: fdate(asOf) }] : undefined} />
      </div>
      <div className="table-wrap">
        <table className="t">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>{columns.map((c) => (
              <th key={String(c.key)} className={c.n ? "n" : ""} aria-sort={sort.k === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => setSort((s) => ({ k: String(c.key), dir: s.k === c.key ? (s.dir === 1 ? -1 : 1) : c.n ? -1 : 1 }))}>
                  {c.label}{sort.k === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => nav(`/fonds/${encodeURIComponent(r.id)}`)}>
                {columns.map((c) => <td key={String(c.key)} className={c.n ? "n" : ""}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key as string] ?? "—")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
