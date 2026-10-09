import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, num, pctRaw } from "../lib/format";
import { BarList } from "./charts";
import { Flag } from "./Flag";
import { Loading } from "./ui";
import * as I from "./Icon";

type Row = { key: string; encours: number; pct: number | null; positions: number; iso?: string | null; other?: boolean; isin?: string; share?: string | null };
export type FundBreakdown = {
  available: boolean; reason?: string; as_of?: string; total?: number; positions?: number;
  countries?: Row[]; segments?: Row[]; teneurs?: Row[]; parts?: Row[]; currencies?: Row[];
  jump_aum?: number | null; jump_date?: string; coverage_pct?: number | null;
  registered?: { country: string; iso: string }[];
};
type Position = {
  client: string | null; compte: string | null; compte_nom: string | null; segment: string; classification: string | null; commercial: string | null;
  sdg: string | null; teneur: string | null; pays: string; iso: string | null; isin: string | null; share: string | null; fonds_source: string | null;
  type_fonds: string | null; classe_actif: string | null; desk: string | null; quantite: number | null; cours: number | null;
  montant_devise: number | null; devise: string | null; encours: number | null; pct_group: number | null; pct_fund: number | null;
  premier_trade: string | null; dernier_trade: string | null; anciennete_ans: number | null;
};
type Positions = { available: boolean; reason?: string; as_of?: string; group_total?: number; group_positions?: number; shown?: number; more?: boolean; positions?: Position[] };

const AXES = [["countries", "Pays du porteur"], ["segments", "Clientèle"], ["teneurs", "Teneur de compte"], ["parts", "Part"], ["currencies", "Devise"]] as const;
type Axis = (typeof AXES)[number][0];
const STEP = 25;
const AXIS_OF: Record<Axis, string> = { countries: "Pays", segments: "Clientèle", teneurs: "Teneur", parts: "Part", currencies: "Devise" };

/** Où est détenu le fonds : encours au passif (positions, Montant EUR) par pays du porteur, clientèle, teneur, part et
 *  devise ; couverture par rapport à l'encours JUMP ; pays d'autorisation sans porteur et porteurs hors autorisation. */
export function HoldingSection({ fundId, name }: { fundId: string; name: string }) {
  const { api } = useApp();
  const { data, loading } = useApi<FundBreakdown>(api(`/api/fonds/${encodeURIComponent(fundId)}/repartition`));
  const [axis, setAxis] = useState<Axis>("countries");
  const [pick, setPick] = useState<{ axis: Axis | null; key: string | null; label: string } | null>(null);
  const rows = (data?.[axis] ?? []) as Row[];
  const choose = (r: Row) => {
    if (r.other) return;
    const same = pick?.axis === axis && pick.key === r.key;
    setPick(same ? null : { axis, key: r.key, label: axis === "parts" ? (r.share ?? r.key) : r.key });
  };
  return (
    <section className="section reveal" id="detention" aria-labelledby="h-detention">
      <div className="section__head">
        <div>
          <div className="eyebrow">Détention · d'après le passif{data?.as_of ? ` au ${fdate(data.as_of)}` : ""}</div>
          <h2 className="h2" id="h-detention">Où est détenu {name}&nbsp;?</h2>
        </div>
      </div>
      {loading && !data ? <Loading h={260} />
        : !data || !data.available ? <div className="empty">{data?.reason ?? "Passif indisponible."}</div>
        : !data.total ? <div className="empty">{data.reason ?? "Aucune position de ce fonds au passif."}</div>
        : (
          <>
            <dl className="hold__kpis">
              <div><dt>Encours suivi au passif</dt><dd className="num">{eur(data.total)}</dd></div>
              <div><dt>Part de l'encours JUMP</dt><dd className="num">{data.coverage_pct == null ? "—" : pctRaw(data.coverage_pct)}</dd>
                <span className="small muted">sur {eur(data.jump_aum)} au {fdate(data.jump_date)}</span></div>
              <div><dt>Pays de porteurs</dt><dd className="num">{(data.countries ?? []).filter((c) => !c.other).length}</dd></div>
              <div><dt>Positions</dt><dd className="num">{data.positions?.toLocaleString("fr-FR")}</dd></div>
            </dl>
            <div className="hold__grid">
              <div className="card card--flat">
                <div className="seg hold__axes" role="tablist" aria-label="Répartir l'encours par">
                  {AXES.map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={axis === k} className="seg__b" onClick={() => setAxis(k)}>{l}</button>
                  ))}
                </div>
                <div className="hold__bars">
                <BarList items={rows} value={(r) => r.encours} color={(r) => pick?.axis === axis && pick.key === r.key ? "var(--gold)" : "var(--fc)"}
                  onSelect={choose}
                  label={(r) => (
                    <span className="hold__lab">
                      {axis === "countries" && r.iso && <Flag iso={r.iso} className="hold__flag" />}
                      {axis === "parts" ? (r.share ?? r.key) : r.key}
                    </span>
                  )}
                  sub={(r) => (
                    <>
                      {axis === "parts" && r.share ? `${r.isin} · ` : ""}
                      {r.other ? `${r.positions} position${r.positions > 1 ? "s" : ""}`
                        : <span className="hold__more">{r.positions} position{r.positions > 1 ? "s" : ""} <span aria-hidden="true">{pick?.axis === axis && pick.key === r.key ? "▴" : "▾"}</span></span>}
                    </>
                  )}
                  right={(r) => <><b>{eur(r.encours)}</b><span className="muted"> · {r.pct == null ? "—" : pctRaw(r.pct)}</span></>} />
                </div>
                <button type="button" className="hold__all" onClick={() => setPick(pick?.axis === null ? null : { axis: null, key: null, label: "Toutes les positions" })}>
                  {pick?.axis === null ? "Masquer les positions" : `Voir les ${data.positions?.toLocaleString("fr-FR")} positions du fonds`}
                </button>
              </div>
              <div className="card card--flat hold__reg">
                <div className="eyebrow">Autorisé · détenu</div>
                <p className="small muted" style={{ margin: "6px 0 14px" }}>Pays où une part du fonds est autorisée à la commercialisation (JUMP). Liste indépendante du pays des porteurs.</p>
                <ul className="hold__chips" role="list">
                  {(data.registered ?? []).map((c) => (
                    <li key={c.country} className="hold__chip">
                      <Flag iso={c.iso} className="hold__flag" />
                      <Link to={`/distribution/${encodeURIComponent(c.country)}`}>{c.country}</Link>
                      <I.Arrow size={12} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {pick && <PositionsPanel fundId={fundId} pick={pick} onClose={() => setPick(null)} />}
            <p className="small muted hold__note">
              Pays du compte porteur, tel que renseigné au passif (positions, Montant EUR), à la date de la photo. Le passif ne couvre qu'une partie de
              l'encours JUMP : les pourcentages se lisent sur l'encours suivi au passif. Cliquez un groupe pour voir ses positions, ligne à ligne
              (vue nominative, calculée à la demande dans la source).
            </p>
          </>
        )}
    </section>
  );
}

/** Positions d'un groupe (ou de tout le fonds), ligne à ligne, triées par Montant EUR ; chaque ligne se déplie sur tout
 *  le détail de la table Position. Vue nominative chargée à la demande, jamais mise en cache. */
function PositionsPanel({ fundId, pick, onClose }: { fundId: string; pick: { axis: Axis | null; key: string | null; label: string }; onClose: () => void }) {
  const { api } = useApp();
  const [n, setN] = useState(STEP);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { setN(STEP); setOpen(null); }, [pick.axis, pick.key]);
  const q = pick.axis ? `&axe=${pick.axis}&cle=${encodeURIComponent(pick.key ?? "")}` : "";
  const { data, loading } = useApi<Positions>(api(`/api/fonds/${encodeURIComponent(fundId)}/positions?n=${n}${q}`));
  const list = data?.positions ?? [];
  return (
    <div className="card card--flat pos" role="region" aria-labelledby="h-pos">
      <div className="pos__head">
        <div>
          <div className="eyebrow">{pick.axis ? `Positions · ${AXIS_OF[pick.axis]}` : "Positions du fonds"}{data?.as_of ? ` · au ${fdate(data.as_of)}` : ""}</div>
          <h3 className="h3" id="h-pos">{pick.label}</h3>
          {data?.available && <p className="small muted">{data.group_positions?.toLocaleString("fr-FR")} position{(data.group_positions ?? 0) > 1 ? "s" : ""} · {eur(data.group_total)} · triées par montant</p>}
        </div>
        <button type="button" className="btn btn--ghost pos__close" onClick={onClose} aria-label="Fermer les positions"><I.Close size={16} /></button>
      </div>
      {loading && !data ? <Loading h={200} />
        : !data?.available ? <div className="empty">{data?.reason ?? "Positions indisponibles."}</div>
        : !list.length ? <div className="empty">Aucune position.</div>
        : (
          <>
            <div className="pos__scroll">
              <table className="t t--mini pos__t">
                <thead><tr>
                  <th>Porteur</th><th>Compte</th><th>Clientèle</th><th>Teneur</th><th>Pays</th><th>Part</th>
                  <th className="n">Quantité</th><th className="n">Cours</th><th className="n">Montant EUR</th><th className="n">% du groupe</th><th className="n">% du fonds</th><th>Détenu depuis</th><th aria-label="Détail" />
                </tr></thead>
                <tbody>{list.map((p, i) => (
                  <Fragment key={i}>
                    <tr className={`pos__row${open === i ? " is-open" : ""}`} onClick={() => setOpen(open === i ? null : i)}>
                      <td><b>{p.client ?? "Non renseigné"}</b></td>
                      <td><span className="mono">{p.compte ?? "—"}</span>{p.compte_nom && <span className="pos__sub">{p.compte_nom}</span>}</td>
                      <td>{p.segment}</td>
                      <td>{p.teneur ?? "—"}</td>
                      <td><span className="pos__pays">{p.iso && <Flag iso={p.iso} className="hold__flag" />}{p.pays}</span></td>
                      <td>{p.share ?? "—"}<span className="pos__sub mono">{p.isin}</span></td>
                      <td className="n num">{num(p.quantite, 3)}</td>
                      <td className="n num">{p.cours == null ? "—" : `${num(p.cours, 2)}${p.devise ? ` ${p.devise}` : ""}`}</td>
                      <td className="n num"><b>{eur(p.encours)}</b></td>
                      <td className="n num">{p.pct_group == null ? "—" : pctRaw(p.pct_group, 1)}</td>
                      <td className="n num">{p.pct_fund == null ? "—" : pctRaw(p.pct_fund, 1)}</td>
                      <td>{p.premier_trade ? fdate(p.premier_trade) : "—"}{p.anciennete_ans != null && <span className="pos__sub">{p.anciennete_ans.toLocaleString("fr-FR")} an{p.anciennete_ans >= 2 ? "s" : ""}</span>}</td>
                      <td><button type="button" className="pos__tg" aria-expanded={open === i} aria-label={`Détail de la position ${i + 1}`}
                        onClick={(e) => { e.stopPropagation(); setOpen(open === i ? null : i); }}>{open === i ? "−" : "+"}</button></td>
                    </tr>
                    {open === i && (
                      <tr className="pos__detail"><td colSpan={13}>
                        <dl className="pos__dl">
                          {([
                            ["Nom client", p.client], ["Compte Centaure", p.compte], ["Nom du compte", p.compte_nom], ["Classification compte", p.classification],
                            ["Clientèle", p.segment], ["Commercial", p.commercial], ["Teneur de compte", p.teneur], ["Pays", p.pays],
                            ["Société de gestion", p.sdg], ["Desk", p.desk], ["Type de fonds", p.type_fonds], ["Classe d'actifs", p.classe_actif],
                            ["Fonds (libellé source)", p.fonds_source], ["Part", p.share], ["ISIN", p.isin], ["Devise", p.devise],
                            ["Quantité", num(p.quantite, 3)], ["Cours", p.cours == null ? null : num(p.cours, 4)],
                            ["Montant devise", p.montant_devise == null ? null : `${num(p.montant_devise, 2)}${p.devise ? ` ${p.devise}` : ""}`],
                            ["Montant EUR", p.encours == null ? null : `${num(p.encours, 2)} €`],
                            ["Premier trade", p.premier_trade ? fdate(p.premier_trade) : null], ["Dernier trade", p.dernier_trade ? fdate(p.dernier_trade) : null],
                          ] as [string, string | null][]).map(([k, v]) => (
                            <div key={k}><dt>{k}</dt><dd>{v ?? "—"}</dd></div>
                          ))}
                        </dl>
                      </td></tr>
                    )}
                  </Fragment>
                ))}</tbody>
              </table>
            </div>
            <div className="pos__foot">
              <span className="small muted">{list.length.toLocaleString("fr-FR")} sur {data.group_positions?.toLocaleString("fr-FR")} affichées</span>
              {data.more && <button type="button" className="btn btn--ghost" onClick={() => setN(n + STEP * 2)} disabled={loading}>{loading ? "Chargement…" : "Afficher plus"}</button>}
            </div>
          </>
        )}
    </div>
  );
}
