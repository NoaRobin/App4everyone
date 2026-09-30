import type React from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, pct, pctRaw, plural } from "../lib/format";
import { famVar } from "../lib/families";
import type { Control, FamilyKey } from "../lib/types";
import { Bool, ErrorState, Loading, SriScale, useReveal } from "../components/ui";
import { RiskReturn } from "../components/viz";
import { FAMILY_LABEL, FAMILY_ORDER, SRI_RAMP } from "../lib/families";
import { Head, PageHero } from "../components/Editorial";
import * as I from "../components/Icon";

type RiskRow = { id: string; name: string; family: FamilyKey; aum: number; sri: string | null; sri_prev: string | null; vol: number | null; mdd: number | null; te: number | null;
  top10: number | null; cash: number | null; derivatives: number | null; n_lines: number | null; global_exposure: string | null; leverage: boolean | null; liquidity: boolean | null };
type RiskResp = { date: string; funds: RiskRow[]; sri: { sri: string; aum: number; n: number }[] };

export default function Risk() {
  const [p, setP] = useSearchParams();
  const tab = p.get("onglet") === "controles" ? "controles" : "risques";
  const { api } = useApp();
  const risk = useApi<RiskResp>(api("/api/risk"));
  const ctl = useApi<{ date: string; controls: Control[] }>(api("/api/controls"));
  const figs = useMemo(() => {
    if (tab === "risques") {
      const f = risk.data?.funds.filter((x) => Number(x.sri) > 0 && x.aum > 0) ?? [];
      const tot = f.reduce((s, x) => s + x.aum, 0) || 1;
      const avg = f.reduce((s, x) => s + Number(x.sri) * x.aum, 0) / tot;
      const vols = (risk.data?.funds ?? []).map((x) => x.vol).filter((v): v is number => v != null).sort((a, b) => a - b);
      const med = vols.length ? vols[Math.floor(vols.length / 2)] : null;
      const chg = (risk.data?.funds ?? []).filter((x) => x.sri && x.sri_prev && x.sri !== x.sri_prev).length;
      return risk.data ? [
        { label: "SRI moyen pondéré", value: avg.toFixed(1).replace(".", ","), unit: "/ 7", sub: "pondéré par les encours" },
        { label: "Volatilité médiane 1 an", value: med == null ? "—" : (med * 100).toFixed(1).replace(".", ","), unit: "%" },
        { label: "SRI modifiés ce mois-ci", value: String(chg) },
        { label: "Fonds suivis", value: String(risk.data.funds.length) },
      ] : undefined;
    }
    const c = ctl.data?.controls ?? [];
    const by = (sv: string) => c.filter((x) => x.severity === sv).reduce((s, x) => s + x.count, 0);
    return ctl.data ? [
      { label: "Points d'attention", value: String(c.reduce((s, x) => s + x.count, 0)) },
      { label: "À traiter", value: String(by("serious")) },
      { label: "À vérifier", value: String(by("warning")) },
      { label: "Contrôles sans anomalie", value: `${c.filter((x) => x.count === 0).length}`, unit: `/ ${c.length}` },
    ] : undefined;
  }, [tab, risk.data, ctl.data]);
  return (
    <div className="risk">
      <PageHero
        eyebrow={<>Risques & contrôles{risk.data && <> · au {fdate(risk.data.date)}</>}</>}
        title={tab === "risques" ? "Où se situe le risque ?" : "Qu'est-ce qui n'est pas en ordre ?"}
        lede={tab === "risques" ? "L'indicateur de risque réglementaire (SRI), les risques réalisés sur un an et la concentration des portefeuilles, fonds par fonds."
          : "Des contrôles automatiques sur le référentiel, les enregistrements et la qualité des chargements. Chaque point ouvre la fiche concernée."}
        figures={figs}
      />
      <nav className="axbar" aria-label="Rubrique">
        <div className="axbar__in" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "risques"} className="axbar__b axbar__b--l" onClick={() => setP({})}>Risques des fonds</button>
          <button type="button" role="tab" aria-selected={tab === "controles"} className="axbar__b axbar__b--l" onClick={() => setP({ onglet: "controles" })}>
            Contrôles{ctl.data && <span className="axbar__n num">{ctl.data.controls.reduce((s, x) => s + x.count, 0)}</span>}
          </button>
        </div>
      </nav>
      <div className="page risk__page" role="tabpanel">{tab === "risques" ? <RiskTab data={risk.data} error={risk.error} /> : <ControlsTab data={ctl.data} error={ctl.error} />}</div>
    </div>
  );
}

function RiskTab({ data, error }: { data: RiskResp | null; error: Error | null }) {
  const nav = useNavigate();
  const [sort, setSort] = useState<keyof RiskRow>("aum");
  const [sriF, setSriF] = useState<string | null>(null);
  useReveal(data);
  const rows = useMemo(() => [...(data?.funds ?? [])].filter((f) => !sriF || f.sri === sriF)
    .sort((a, b) => ((b[sort] as number) ?? -Infinity) - ((a[sort] as number) ?? -Infinity)), [data, sort, sriF]);
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
      <section className="section reveal" aria-labelledby="h-sri">
        <Head id="sri" eyebrow="L'échelle du risque" title="Encours par indicateur de risque (SRI)"
          lede="De 1 (risque le plus faible) à 7 (le plus élevé). Hauteur : encours. Cliquez une marche pour filtrer les fonds ci-dessous." />
        <div className="scale" role="group" aria-label="Filtrer les fonds par SRI">
          {["1", "2", "3", "4", "5", "6", "7"].map((k, i) => {
            const x = data.sri.find((s) => s.sri === k);
            return (
              <button key={k} type="button" className={`scale__c${sriF === k ? " is-on" : ""}${sriF && sriF !== k ? " is-off" : ""}`} disabled={!x} aria-pressed={sriF === k}
                onClick={() => setSriF(sriF === k ? null : k)} aria-label={x ? `SRI ${k} : ${eur(x.aum)}, ${plural(x.n, "fonds", "fonds")}` : `SRI ${k} : aucun fonds`}>
                <span className="scale__v num">{x ? eur(x.aum) : ""}</span>
                <span className="scale__s small">{x ? `${pct(x.aum / total, { signed: false, digits: 0 })} · ${plural(x.n, "fonds", "fonds")}` : "—"}</span>
                <span className="scale__b" style={{ height: `${x ? Math.max(3, (x.aum / maxSri) * 100) : 1}%`, background: SRI_RAMP[i] }} />
                <span className="scale__k num">{k}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="section reveal" aria-labelledby="h-chg">
        <Head id="chg" eyebrow="Ce qui a bougé" title={changed.length ? `${plural(changed.length, "fonds a changé", "fonds ont changé")} de SRI ce mois-ci` : "Aucun changement de SRI ce mois-ci"} />
        {changed.length > 0 && (
          <div className="chg">
            {changed.map((f) => {
              const up = Number(f.sri) > Number(f.sri_prev);
              return (
                <Link key={f.id} to={`/fonds/${encodeURIComponent(f.id)}`} className={`chg__c${up ? " is-up" : " is-down"}`}>
                  <span className="chg__f small"><span className="dot" style={{ background: famVar(f.family) }} />{FAMILY_LABEL[f.family]}</span>
                  <span className="chg__n">{f.name}</span>
                  <span className="chg__v num"><span className="chg__p">{f.sri_prev}</span><I.Arrow size={20} /><b>{f.sri}</b></span>
                  <span className="chg__t small">{up ? "Risque relevé" : "Risque abaissé"} · {eur(f.aum)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      <RiskMap />
      <section className="section reveal" aria-labelledby="h-tab">
        <Head id="tab" eyebrow="Fonds par fonds" title="Les indicateurs de risque"
          right={sriF ? <button type="button" className="chip" aria-pressed="true" onClick={() => setSriF(null)}>SRI {sriF} <I.Close size={13} /></button> : undefined}
          lede={`${plural(rows.length, "fonds", "fonds")}${sriF ? ` de SRI ${sriF}` : ""}. Cliquez un en-tête pour trier.`} />
        <div className="table-wrap">
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
      </section>
    </>
  );
}

const SEV: Record<string, { label: string; icon: React.ReactElement }> = {
  serious: { label: "Important", icon: <I.Octagon size={20} /> },
  warning: { label: "À vérifier", icon: <I.Alert size={20} /> },
  info: { label: "Information", icon: <I.Info size={20} /> },
};

function ControlsTab({ data, error }: { data: { date: string; controls: Control[] } | null; error: Error | null }) {
  const [open, setOpen] = useState<string | null>(null);
  useReveal(data);
  const [aud, setAud] = useState<string | null>(null);
  if (error) return <ErrorState error={error} />;
  if (!data) return <Loading h={480} />;
  const audiences = [...new Set(data.controls.map((c) => c.audience))];
  const list = data.controls.filter((c) => !aud || c.audience === aud);
  const n = data.controls.reduce((s, c) => s + c.count, 0);
  return (
    <section className="section reveal" aria-labelledby="h-ctl">
      <Head id="ctl" eyebrow="Contrôles automatiques" title={`${plural(n, "point")} d'attention`}
        lede={`${data.controls.length} contrôles, du plus important au plus informatif. Filtrez par équipe concernée.`}
        right={<div className="row" style={{ gap: 8 }} role="group" aria-label="Filtrer par équipe">
          <button type="button" className="chip" aria-pressed={!aud} onClick={() => setAud(null)}>Tous</button>
          {audiences.map((a) => <button key={a} type="button" className="chip" aria-pressed={aud === a} onClick={() => setAud(a)}>{a}</button>)}
        </div>} />
      <div className="ctls">
        {list.map((c) => {
          const isOpen = open === c.key;
          const ok = c.count === 0;
          return (
            <div key={c.key} id={`ctl-${c.key}`} className={`ctl${ok ? " ctl--ok" : ` ctl--${c.severity}`}`}>
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
    </section>
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
    <section className="section reveal" aria-labelledby="h-rr">
      <Head id="rr" eyebrow="Risque réalisé" title="Risque et rendement sur un an"
        lede="Horizontal : volatilité sur un an. Vertical : performance sur un an. Taille : encours. Cliquez un point pour ouvrir la fiche."
        right={<div className="legend">{FAMILY_ORDER.map((k) => <span key={k} className="legend__i"><span className="dot" style={{ background: famVar(k) }} />{FAMILY_LABEL[k]}</span>)}</div>} />
      <RiskReturn height={500} onSelect={(p) => nav(`/fonds/${encodeURIComponent(p.key)}`)}
        points={pts.map((f) => ({ key: f.id, label: f.name, x: f.vol_1A!, y: f.perf_1A!, size: f.aum ?? 0, color: famVar(f.family), sub: FAMILY_LABEL[f.family] }))} />
    </section>
  );
}
