import type React from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { eur, pct, pctRaw, plural } from "../lib/format";
import { famVar } from "../lib/families";
import type { Control, FamilyKey } from "../lib/types";
import { Bool, ErrorState, Loading, MoreRows, SriScale, useProgressive, useReveal } from "./ui";
import { RiskReturn } from "./viz";
import { FAMILY_LABEL, FAMILY_ORDER, SRI_RAMP } from "../lib/families";
import { Head } from "./Editorial";
import * as I from "./Icon";

type RiskRow = { id: string; name: string; family: FamilyKey; aum: number; sri: string | null; sri_prev: string | null; vol: number | null; mdd: number | null; te: number | null;
  top10: number | null; cash: number | null; derivatives: number | null; n_lines: number | null; global_exposure: string | null; leverage: boolean | null; liquidity: boolean | null };
type RiskResp = { date: string; funds: RiskRow[]; sri: { sri: string; aum: number; n: number }[] };

/** Risques et contrôles, intégrés à la page Fonds (onglets « Risques » et « Contrôles », paramètre ?vue=). */
export function FundsRiskControls() {
  const [p, setP] = useSearchParams();
  const tab = p.get("vue") === "controles" ? "controles" : "risques";
  const { api } = useApp();
  const risk = useApi<RiskResp>(api("/api/risk"));
  const ctl = useApi<{ date: string; controls: Control[]; links?: Links }>(api("/api/controls"));
  return (
    <div className="frc" id="risques">
      <nav className="axbar frc__bar" aria-label="Rubrique">
        <div className="axbar__in" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "risques"} className="axbar__b axbar__b--l" onClick={() => setP({}, { replace: true })}>Risques des fonds</button>
          <button type="button" role="tab" aria-selected={tab === "controles"} className="axbar__b axbar__b--l" onClick={() => setP({ vue: "controles" }, { replace: true })}>
            Contrôles{ctl.data && <span className="axbar__n num">{ctl.data.controls.reduce((s, x) => s + x.count, 0)}</span>}
          </button>
        </div>
      </nav>
      <div className="page risk__page" role="tabpanel">
        {tab === "risques" ? <RiskTab data={risk.data} error={risk.error} /> : <>
          {ctl.data?.links && <LinksSummary links={ctl.data.links} />}
          <ControlsTab data={ctl.data} error={ctl.error} />
        </>}
      </div>
    </div>
  );
}

type Links = {
  parts: { total: number; by_pi_shareid: number; by_isin: number; unlinked: number };
  funds: { total: number; by_product_id: number; by_id_pi_fonds: number; by_propagation?: number; unlinked: number;
    unlinked_with_aum?: number; unlinked_multi_parts?: number; split_across_products?: number };
  ambiguous_isins: string[]; duplicates: { name: string; funds: { id: string; referenced: boolean; aum: number | null }[] }[];
  funds_displayed?: number; funds_jump_only?: number; parts_without_product?: number | null; exact_duplicates?: number;
  aum?: { date: string; linked: number; unlinked: number };
  family_nc?: { referenced: number; jump_only: number };
  unlinked_funds?: { fund_id: string; parts: number; has_aum: boolean; reasons: string[] }[];
  coverage?: { products_active: number; products_with_jump: number; products_without_jump: number; by_portfolio_code?: number };
  diagnosis?: { kind: "complet" | "perimetre" | "echec"; text: string };
  watch?: { fund_id: string; name: string | null; referenced: boolean; parts: number; has_aum: boolean;
    fund_links: Record<string, number>; reasons: string[]; fields: Record<string, boolean> }[];
};

const FIELD_LABEL: Record<string, string> = { manager: "gérant", sfdr: "SFDR", sri: "SRI", currency: "devise", range: "gamme",
  asset_class: "classe d'actifs", expertise: "expertise" };
const reasonText = (r: string) => r.replace(/_/g, " ");

/** Compteurs de rattachement JUMP ↔ Product Info : parts (pi_shareid, ISIN, non rattachées) et fonds. */
function LinksSummary({ links }: { links: Links }) {
  const p = links.parts, f = links.funds;
  const prop = f.by_propagation ?? Math.max(0, f.total - f.by_product_id - f.by_id_pi_fonds - f.unlinked);
  const bar = (rows: { k: string; v: number; cls: string }[]) => (
    <div className="lnk__bar" aria-hidden="true">{rows.map((r) => <span key={r.k} className={r.cls} style={{ flexGrow: r.v, flexBasis: 0, display: r.v ? undefined : "none" }} />)}</div>
  );
  const prow = [{ k: "id", v: p.by_pi_shareid, cls: "is-a" }, { k: "isin", v: p.by_isin, cls: "is-b" }, { k: "none", v: p.unlinked, cls: "is-c" }];
  const frow = [{ k: "pid", v: f.by_product_id, cls: "is-a" }, { k: "pif", v: f.by_id_pi_fonds, cls: "is-b" },
    { k: "sib", v: prop, cls: "is-d" }, { k: "none", v: f.unlinked, cls: "is-c" }];
  const watch = links.watch ?? [];
  const orphans = (links.unlinked_funds ?? []).filter((u) => u.has_aum || u.parts > 1);
  return (
    <section className="section reveal lnk" aria-labelledby="h-lnk">
      <Head id="lnk" eyebrow="Qualité des données" title="Rattachement JUMP ↔ Product Info"
        lede="Chaque part JUMP est rattachée à sa part du référentiel par son identifiant (pi_shareid), à défaut par son ISIN lorsqu'il est unique ; chaque fonds par le ProductID de ses parts, à défaut par l'ID_PI_FONDS de JUMP, puis par les autres parts du même fonds JUMP. Jamais sur le nom." />
      {links.diagnosis && (
        <div className={`lnk__diag is-${links.diagnosis.kind}`} role="status">
          <span className="eyebrow">Lecture</span>
          <p>{links.diagnosis.text}</p>
          {links.coverage && <div className="lnk__cov num" aria-label="Couverture du référentiel">
            <b>{links.coverage.products_with_jump}</b><span>/ {links.coverage.products_active} fonds du référentiel reçoivent leurs parts JUMP</span>
          </div>}
        </div>
      )}
      <div className="lnk__grid">
        <div className="lnk__card">
          <div className="eyebrow">Parts JUMP · {p.total}</div>
          {bar(prow)}
          <dl className="lnk__kv">
            <div><dt><span className="lnk__dot is-a" />Par pi_shareid</dt><dd className="num">{p.by_pi_shareid}</dd></div>
            <div><dt><span className="lnk__dot is-b" />Par ISIN (unique)</dt><dd className="num">{p.by_isin}</dd></div>
            <div><dt><span className="lnk__dot is-c" />Non rattachées</dt><dd className="num">{p.unlinked}</dd></div>
          </dl>
        </div>
        <div className="lnk__card">
          <div className="eyebrow">Fonds JUMP · {f.total}</div>
          {bar(frow)}
          <dl className="lnk__kv">
            <div><dt><span className="lnk__dot is-a" />Par ProductID</dt><dd className="num">{f.by_product_id}</dd></div>
            <div><dt><span className="lnk__dot is-b" />Par ID_PI_FONDS</dt><dd className="num">{f.by_id_pi_fonds}</dd></div>
            <div><dt><span className="lnk__dot is-d" />Par propagation (même fonds JUMP)</dt><dd className="num">{prop}</dd></div>
            <div><dt><span className="lnk__dot is-c" />Non rattachés</dt><dd className="num">{f.unlinked}</dd></div>
            {f.unlinked_with_aum != null && <div><dt>… dont avec encours</dt><dd className={`num${f.unlinked_with_aum ? " down-t" : ""}`}>{f.unlinked_with_aum}</dd></div>}
            {f.unlinked_multi_parts != null && <div><dt>… dont avec plusieurs parts</dt><dd className="num">{f.unlinked_multi_parts}</dd></div>}
          </dl>
        </div>
        <div className="lnk__card">
          <div className="eyebrow">Après consolidation</div>
          <dl className="lnk__kv">
            {links.aum && <div><dt>Encours rattachés</dt><dd className="num">{eur(links.aum.linked)}</dd></div>}
            {links.aum && <div><dt>Encours non rattachés</dt><dd className={`num${links.aum.unlinked ? " down-t" : ""}`}>{eur(links.aum.unlinked)}</dd></div>}
            <div><dt>ISIN ambigus</dt><dd className="num">{links.ambiguous_isins.length}</dd></div>
            {links.exact_duplicates != null && <div><dt>Doublons exacts</dt><dd className={`num${links.exact_duplicates ? " down-t" : ""}`}>{links.exact_duplicates}</dd></div>}
            <div><dt>Fonds de même nom restants</dt><dd className={`num${links.duplicates.length ? " down-t" : ""}`}>{links.duplicates.length}</dd></div>
            <div><dt>Fonds « JUMP seul » affichés (avec encours)</dt><dd className="num">{links.funds_jump_only ?? "—"}</dd></div>
            {links.family_nc && <div><dt>Famille nc (référentiel)</dt><dd className="num">{links.family_nc.referenced}</dd></div>}
            {links.parts_without_product != null && <div><dt>Parts du référentiel sans ProductID</dt><dd className="num">{links.parts_without_product}</dd></div>}
          </dl>
        </div>
      </div>
      {(watch.length > 0 || orphans.length > 0) && (
        <div className="lnk__grid" style={{ marginTop: 16 }}>
          {watch.length > 0 && <div className="lnk__card" style={{ gridColumn: orphans.length ? "span 2" : "1 / -1" }}>
            <div className="eyebrow">Fonds suivis · {watch.length}</div>
            <dl className="lnk__kv">
              {watch.map((w) => {
                const missing = Object.entries(w.fields ?? {}).filter(([, ok]) => !ok).map(([k]) => FIELD_LABEL[k] ?? k);
                return <div key={w.fund_id}>
                  <dt><span className={`lnk__dot ${w.referenced ? "is-a" : "is-c"}`} />
                    {w.referenced ? <Link to={`/fonds/${encodeURIComponent(w.fund_id)}`}>{w.name ?? w.fund_id}</Link> : <span>{w.name ?? w.fund_id}</span>}
                  </dt>
                  <dd className="num" title={w.reasons.map(reasonText).join(" · ")}>
                    {w.referenced ? "référentiel" : "JUMP seul"} · {plural(w.parts, "part")}
                    {missing.length ? ` · vide : ${missing.join(", ")}` : ""}
                  </dd>
                </div>;
              })}
            </dl>
          </div>}
          {orphans.length > 0 && <div className="lnk__card" style={{ gridColumn: watch.length ? undefined : "1 / -1" }}>
            <div className="eyebrow">Fonds encore non rattachés · {orphans.length}</div>
            <dl className="lnk__kv">
              {orphans.slice(0, 12).map((u) => <div key={u.fund_id}>
                <dt>{u.fund_id}</dt>
                <dd className="num" title={u.reasons.map(reasonText).join(" · ")}>{plural(u.parts, "part")}{u.has_aum ? " · encours" : ""}</dd>
              </div>)}
            </dl>
          </div>}
        </div>
      )}
    </section>
  );
}

function RiskTab({ data, error }: { data: RiskResp | null; error: Error | null }) {
  const nav = useNavigate();
  const [sort, setSort] = useState<keyof RiskRow>("aum");
  const [sriF, setSriF] = useState<string | null>(null);
  useReveal(data);
  const rows = useMemo(() => [...(data?.funds ?? [])].filter((f) => !sriF || f.sri === sriF)
    .sort((a, b) => ((b[sort] as number) ?? -Infinity) - ((a[sort] as number) ?? -Infinity)), [data, sort, sriF]);
  const page = useProgressive(60);
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
            <tbody>{rows.slice(0, page.limit).map((f) => (
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
        <MoreRows shown={Math.min(page.limit, rows.length)} total={rows.length} step={page.step} onMore={page.more} onAll={page.all} what="fonds affichés" />
      </section>
    </>
  );
}

const SEV: Record<string, { label: string; icon: React.ReactElement }> = {
  serious: { label: "Important", icon: <I.Octagon size={20} /> },
  warning: { label: "À vérifier", icon: <I.Alert size={20} /> },
  info: { label: "Information", icon: <I.Info size={20} /> },
};

/** Éléments d'un contrôle : affichage progressif (des milliers de parts possibles avec les données réelles). */
function CtlItems({ items }: { items: Control["items"] }) {
  const page = useProgressive(100);
  return (
    <>
      <ul className="ctl__items">
        {items.slice(0, page.limit).map((it, i) => (
          <li key={i}>
            {it.fund_id ? <Link className="link strong" to={it.share_id ? `/parts/${encodeURIComponent(it.share_id)}` : `/fonds/${encodeURIComponent(it.fund_id)}`}>{it.name}</Link> : <span className="strong">{it.name}</span>}
            <span className="small">{it.detail}</span>
            {it.aum != null && <span className="num small muted">{eur(it.aum)}</span>}
          </li>
        ))}
      </ul>
      <MoreRows shown={Math.min(page.limit, items.length)} total={items.length} step={page.step} onMore={page.more} onAll={page.all} what="éléments affichés" />
    </>
  );
}

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
              {isOpen && <CtlItems items={c.items} />}
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
