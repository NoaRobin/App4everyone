import type React from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { eur, pct, pctRaw, plural } from "../lib/format";
import { famVar } from "../lib/families";
import type { Control, FamilyKey } from "../lib/types";
import { Bool, ErrorState, Loading, SriScale, useReveal } from "../components/ui";
import { RiskReturn } from "../components/viz";
import { FAMILY_LABEL, FAMILY_ORDER } from "../lib/families";
import * as I from "../components/Icon";

type RiskRow = { id: string; name: string; family: FamilyKey; aum: number; sri: string | null; sri_prev: string | null; vol: number | null; mdd: number | null; te: number | null;
  top10: number | null; cash: number | null; derivatives: number | null; n_lines: number | null; global_exposure: string | null; leverage: boolean | null; liquidity: boolean | null };
type RiskResp = { date: string; funds: RiskRow[]; sri: { sri: string; aum: number; n: number }[] };

export default function Risk() {
  const [p, setP] = useSearchParams();
  const tab = p.get("onglet") === "controles" ? "controles" : "risques";
  return (
    <div className="page">
      <div className="enc__head">
        <div><div className="eyebrow">Risques & contrôles</div><h1 className="h1">{tab === "risques" ? "Où se situe le risque ?" : "Qu'est-ce qui n'est pas en ordre ?"}</h1></div>
      </div>
      <div className="seg seg--l" role="tablist" aria-label="Rubrique">
        <button type="button" role="tab" aria-selected={tab === "risques"} className="seg__b" onClick={() => setP({})}>Risques des fonds</button>
        <button type="button" role="tab" aria-selected={tab === "controles"} className="seg__b" onClick={() => setP({ onglet: "controles" })}>Contrôles</button>
      </div>
      <div style={{ marginTop: 28 }} role="tabpanel">{tab === "risques" ? <RiskTab /> : <ControlsTab />}</div>
    </div>
  );
}

function RiskTab() {
  const { api } = useApp();
  const { data, error } = useApi<RiskResp>(api("/api/risk"));
  const nav = useNavigate();
  const [sort, setSort] = useState<keyof RiskRow>("aum");
  useReveal(data);
  const rows = useMemo(() => [...(data?.funds ?? [])].sort((a, b) => ((b[sort] as number) ?? -Infinity) - ((a[sort] as number) ?? -Infinity)), [data, sort]);
  if (error) return <ErrorState error={error} />;
  if (!data) return <Loading h={480} />;
  const total = data.sri.reduce((s, x) => s + x.aum, 0);
  const changed = data.funds.filter((f) => f.sri && f.sri_prev && f.sri !== f.sri_prev);
  const maxSri = Math.max(...data.sri.map((x) => x.aum));
  const th = (k: keyof RiskRow, label: string) => (
    <th className="n" aria-sort={sort === k ? "descending" : "none"}><button type="button" onClick={() => setSort(k)}>{label}{sort === k ? " ↓" : ""}</button></th>
  );
  return (
    <>
      <div className="grid grid-3 reveal">
        <div className="card card--flat" style={{ gridColumn: "span 2" }}>
          <h2 className="h3" style={{ marginBottom: 4 }}>Encours par indicateur de risque (SRI)</h2>
          <p className="small muted" style={{ marginBottom: 18 }}>De 1 (risque le plus faible) à 7 (le plus élevé).</p>
          <div className="sribars">
            {["1", "2", "3", "4", "5", "6", "7"].map((k) => {
              const x = data.sri.find((s) => s.sri === k);
              return (
                <div key={k} className="sribars__c" title={x ? `SRI ${k} : ${eur(x.aum)}, ${x.n} fonds` : `SRI ${k} : aucun fonds`}>
                  <div className="sribars__v num small">{x ? eur(x.aum) : ""}</div>
                  <div className="sribars__b" style={{ height: `${x ? Math.max(4, (x.aum / maxSri) * 160) : 2}px` }} />
                  <div className="sribars__k">{k}</div>
                  <div className="small muted">{x ? `${pct(x.aum / total, { signed: false, digits: 0 })} · ${x.n} f.` : "—"}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card card--flat">
          <h2 className="h3" style={{ marginBottom: 14 }}>SRI modifiés ce mois-ci</h2>
          {changed.length ? changed.map((f) => (
            <Link key={f.id} to={`/fonds/${encodeURIComponent(f.id)}`} className="srich">
              <span className="strong">{f.name}</span>
              <span className="srich__v"><span className="num">{f.sri_prev}</span><I.Arrow size={14} /><b className="num">{f.sri}</b></span>
            </Link>
          )) : <p className="small muted">Aucun changement.</p>}
        </div>
      </div>
      <RiskMap />
      <div className="table-wrap reveal" style={{ marginTop: 24 }}>
        <table className="t">
          <caption className="sr-only">Indicateurs de risque par fonds</caption>
          <thead><tr><th>Fonds</th><th>SRI</th>{th("aum", "Encours")}{th("vol", "Volatilité 1 an")}{th("mdd", "Perte max. 1 an")}{th("te", "Tracking error")}{th("top10", "Top 10")}{th("cash", "Liquidités")}{th("derivatives", "Dérivés")}<th>Risque global</th><th>Levier</th><th>Liquidité</th></tr></thead>
          <tbody>{rows.map((f) => (
            <tr key={f.id} className="clickable" onClick={() => nav(`/fonds/${encodeURIComponent(f.id)}`)}>
              <td className="strong"><span className="dot" style={{ background: famVar(f.family), marginRight: 10 }} /><Link className="rowlink-inline" to={`/fonds/${encodeURIComponent(f.id)}`} onClick={(e) => e.stopPropagation()}>{f.name}</Link></td>
              <td><SriScale value={f.sri} previous={f.sri_prev} /></td>
              <td className="n">{eur(f.aum)}</td>
              <td className="n">{pct(f.vol, { signed: false })}</td>
              <td className="n">{pct(f.mdd)}</td>
              <td className="n">{pct(f.te, { signed: false })}</td>
              <td className="n">{f.top10 == null ? "—" : pctRaw(f.top10, 1)}</td>
              <td className="n">{f.cash == null ? "—" : pctRaw(f.cash, 1)}</td>
              <td className="n">{f.derivatives ? pctRaw(f.derivatives, 1) : "—"}</td>
              <td className="small">{f.global_exposure ?? "—"}</td>
              <td><Bool v={f.leverage} /></td>
              <td>{f.liquidity ? <span className="tag tag--s tag--warn">à surveiller</span> : <span className="muted small">—</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

const SEV: Record<string, { label: string; icon: React.ReactElement }> = {
  serious: { label: "Important", icon: <I.Octagon size={20} /> },
  warning: { label: "À vérifier", icon: <I.Alert size={20} /> },
  info: { label: "Information", icon: <I.Info size={20} /> },
};

function ControlsTab() {
  const { api } = useApp();
  const { data, error } = useApi<{ date: string; controls: Control[] }>(api("/api/controls"));
  const [open, setOpen] = useState<string | null>(null);
  const [aud, setAud] = useState<string | null>(null);
  if (error) return <ErrorState error={error} />;
  if (!data) return <Loading h={480} />;
  const audiences = [...new Set(data.controls.map((c) => c.audience))];
  const list = data.controls.filter((c) => !aud || c.audience === aud);
  const n = data.controls.reduce((s, c) => s + c.count, 0);
  return (
    <>
      <div className="spread" style={{ marginBottom: 18 }}>
        <p className="lede" style={{ margin: 0 }}>{plural(n, "point")} d'attention sur {data.controls.length} contrôles automatiques.</p>
        <div className="row" style={{ gap: 8 }} role="group" aria-label="Filtrer par équipe">
          <button type="button" className="chip" aria-pressed={!aud} onClick={() => setAud(null)}>Tous</button>
          {audiences.map((a) => <button key={a} type="button" className="chip" aria-pressed={aud === a} onClick={() => setAud(a)}>{a}</button>)}
        </div>
      </div>
      <div className="stack" style={{ ["--s" as string]: "12px" }}>
        {list.map((c) => {
          const isOpen = open === c.key;
          const ok = c.count === 0;
          return (
            <div key={c.key} className={`ctl${ok ? " ctl--ok" : ` ctl--${c.severity}`}`}>
              <button type="button" className="ctl__h" aria-expanded={isOpen} disabled={ok} onClick={() => setOpen(isOpen ? null : c.key)}>
                <span className="ctl__icon">{ok ? <I.Check size={20} /> : SEV[c.severity].icon}</span>
                <span className="ctl__t"><span className="strong">{c.title}</span><span className="small muted">{c.description}</span></span>
                <span className="ctl__meta small"><span className="tag tag--s">{c.audience}</span>{!ok && <span className="tag tag--s">{SEV[c.severity].label}</span>}</span>
                <span className="ctl__n num">{ok ? "Aucun" : c.count}</span>
              </button>
              {isOpen && (
                <ul className="ctl__items">
                  {c.items.map((it, i) => (
                    <li key={i}>
                      {it.fund_id ? <Link className="link strong" to={it.share_id ? `/parts/${encodeURIComponent(it.share_id)}` : `/fonds/${encodeURIComponent(it.fund_id)}`}>{it.name}</Link> : <span className="strong">{it.name}</span>}
                      <span className="small">{it.detail}</span>
                      {it.aum != null && <span className="num small muted">{eur(it.aum)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

type FundLite = { id: string; name: string; family: FamilyKey; aum: number | null; vol_1A: number | null; perf_1A: number | null };
function RiskMap() {
  const { api } = useApp();
  const nav = useNavigate();
  const { data } = useApi<{ funds: FundLite[] }>(api("/api/funds"));
  const pts = (data?.funds ?? []).filter((f) => (f.aum ?? 0) > 0 && f.vol_1A != null && f.perf_1A != null);
  if (!pts.length) return null;
  return (
    <div className="card card--flat reveal" style={{ marginTop: 24 }}>
      <div className="spread" style={{ marginBottom: 8 }}>
        <h2 className="h3">Risque et rendement réalisés sur 1 an</h2>
        <div className="legend">{FAMILY_ORDER.map((k) => <span key={k} className="legend__i"><span className="dot" style={{ background: famVar(k) }} />{FAMILY_LABEL[k]}</span>)}</div>
      </div>
      <RiskReturn height={440} onSelect={(p) => nav(`/fonds/${encodeURIComponent(p.key)}`)}
        points={pts.map((f) => ({ key: f.id, label: f.name, x: f.vol_1A!, y: f.perf_1A!, size: f.aum ?? 0, color: famVar(f.family), sub: FAMILY_LABEL[f.family] }))} />
    </div>
  );
}
