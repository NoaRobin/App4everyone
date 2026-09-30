import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { eur, PERIOD_SHORT } from "../lib/format";
import { FAMILY_LABEL, FAMILY_ORDER, famVar } from "../lib/families";
import type { FundRow, Point, Variation } from "../lib/types";
import { Crumbs, Decomposition, Delta, ErrorState, Loading, useReveal } from "../components/ui";
import { TimeChart } from "../components/charts";
import { FundTable } from "../components/FundTable";
import * as I from "../components/Icon";

type Resp = { date: string; labels: { key: string; label: string; value: string }[]; total_aum: number; n_funds: number;
  aggregate: { var: Record<string, Variation>; series: Point[] } | null; funds: FundRow[] };

const FILTERS: { key: string; label: string; from: (r: FundRow) => string | null | undefined }[] = [
  { key: "family", label: "Famille", from: (r) => r.family },
  { key: "range", label: "Gamme", from: (r) => r.range },
  { key: "asset_class", label: "Classe d'actifs", from: (r) => r.asset_class },
  { key: "manager", label: "Gérant", from: (r) => r.manager },
  { key: "sfdr", label: "SFDR", from: (r) => r.sfdr },
  { key: "sri", label: "SRI", from: (r) => r.sri },
  { key: "domicile", label: "Domicile", from: (r) => r.domicile },
  { key: "legal_form", label: "Forme juridique", from: (r) => r.legal_form },
];

/** Toute sélection de fonds (par gérant, gamme, pays, SFDR…) : agrégat en tête, détail dessous. */
export default function Selection() {
  const [params, setParams] = useSearchParams();
  const { api } = useApp();
  const qs = params.toString();
  const { data, error } = useApi<Resp>(api(`/api/funds${qs ? `?${qs}` : ""}`));
  const all = useApi<Resp>(api("/api/funds"));
  useReveal(data);
  const options = useMemo(() => {
    const src = (all.data?.funds ?? []).filter((f) => (f.aum ?? 0) > 0);
    return Object.fromEntries(FILTERS.map((f) => [f.key, [...new Set(src.map(f.from).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "fr"))]));
  }, [all.data]);
  if (error) return <div className="page"><ErrorState error={error} /></div>;
  const set = (k: string, v: string | null) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p); };
  const live = (data?.funds ?? []).filter((f) => (f.aum ?? 0) > 0);
  const title = data?.labels.length ? data.labels.map((l) => (l.key === "family" ? FAMILY_LABEL[l.value as keyof typeof FAMILY_LABEL] ?? l.value : l.value)).join(" · ") : "Tous les fonds";
  const fam = params.get("family");
  return (
    <div className="page" style={fam ? { ["--fc" as string]: famVar(fam) } : undefined}>
      <Crumbs items={[{ label: "Encours", to: "/encours" }, { label: "Sélection" }]} />
      <div className="sel__head">
        <div>
          <div className="eyebrow">{data?.labels.length ? data.labels.map((l) => l.label).join(" · ") : "Sélection"}</div>
          <h1 className="h1" style={{ maxWidth: "18ch" }}>{title}</h1>
        </div>
        {data && (
          <div className="sel__kpi">
            <div><div className="eyebrow">Encours</div><div className="sel__big num">{eur(data.total_aum)}</div></div>
            <div><div className="eyebrow">Fonds</div><div className="sel__big num">{data.n_funds}</div></div>
            {data.aggregate && (["1M", "YTD", "1A"] as const).map((p) => (
              <div key={p}><div className="eyebrow">{PERIOD_SHORT[p]}</div><div className="sel__mid"><Delta v={data.aggregate!.var[p]?.pct} /></div></div>
            ))}
          </div>
        )}
      </div>

      <div className="filters" role="group" aria-label="Affiner la sélection">
        {FILTERS.map((f) => {
          const cur = params.get(f.key);
          return (
            <label key={f.key} className={`filter${cur ? " is-on" : ""}`}>
              <span className="filter__l">{f.label}</span>
              <select value={cur ?? ""} onChange={(e) => set(f.key, e.target.value || null)} aria-label={`Filtrer par ${f.label.toLowerCase()}`}>
                <option value="">Tous</option>
                {(f.key === "family" ? FAMILY_ORDER : options[f.key] ?? []).map((o) => <option key={o} value={o}>{f.key === "family" ? FAMILY_LABEL[o as keyof typeof FAMILY_LABEL] : o}</option>)}
                {cur && f.key !== "family" && !(options[f.key] ?? []).includes(cur) && <option value={cur}>{cur}</option>}
              </select>
            </label>
          );
        })}
        {params.get("country") && <button type="button" className="chip chip--on" onClick={() => set("country", null)}>Commercialisé en {params.get("country")} <I.Close size={14} /></button>}
        {qs && <button type="button" className="link small" onClick={() => setParams(new URLSearchParams())}>Tout effacer</button>}
      </div>

      {!data ? <Loading h={420} /> : (
        <>
          {data.aggregate && live.length > 0 && (
            <div className="grid grid-3 reveal" style={{ marginBottom: 32 }}>
              <div className="card card--flat" style={{ gridColumn: "span 2" }}>
                <h3 className="h3" style={{ marginBottom: 12 }}>Évolution des encours de la sélection</h3>
                <TimeChart series={[{ key: "a", label: "Encours", color: fam ? "var(--fc)" : "var(--ink)", points: data.aggregate.series, fill: true }]} height={240} ariaLabel="Encours mensuels de la sélection" />
              </div>
              <div className="card card--flat">
                <h3 className="h3" style={{ marginBottom: 14 }}>Depuis le 1er janvier</h3>
                <div className="h2 num" style={{ marginBottom: 12 }}>{eur(data.aggregate.var.YTD?.delta, { signed: true })}</div>
                <Decomposition v={data.aggregate.var.YTD} />
              </div>
            </div>
          )}
          {live.length ? <FundTable rows={live} caption={`Fonds : ${title}`} filename={`selection-${title}.csv`} /> :
            <div className="empty">Aucun fonds ne correspond à cette sélection. <Link className="link" to="/selection">Voir tous les fonds</Link></div>}
        </>
      )}
    </div>
  );
}
