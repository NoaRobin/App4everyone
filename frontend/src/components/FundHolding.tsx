import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, pctRaw } from "../lib/format";
import { BarList } from "./charts";
import { Flag } from "./Flag";
import { Loading } from "./ui";
import * as I from "./Icon";

type Row = { key: string; encours: number; pct: number | null; positions: number; iso?: string | null; other?: boolean; isin?: string; share?: string | null };
export type FundBreakdown = {
  available: boolean; reason?: string; as_of?: string; total?: number; positions?: number;
  countries?: Row[]; segments?: Row[]; teneurs?: Row[]; parts?: Row[]; currencies?: Row[];
  jump_aum?: number | null; jump_date?: string; coverage_pct?: number | null;
  registered?: { country: string; iso: string; held: boolean }[]; held_not_registered?: string[];
};

const AXES = [["countries", "Pays du porteur"], ["segments", "Clientèle"], ["teneurs", "Teneur de compte"], ["parts", "Part"], ["currencies", "Devise"]] as const;
type Axis = (typeof AXES)[number][0];

/** Où est détenu le fonds : encours au passif (positions, Montant EUR) par pays du porteur, clientèle, teneur, part et
 *  devise ; couverture par rapport à l'encours JUMP ; pays d'autorisation sans porteur et porteurs hors autorisation. */
export function HoldingSection({ fundId, name }: { fundId: string; name: string }) {
  const { api } = useApp();
  const { data, loading } = useApi<FundBreakdown>(api(`/api/fonds/${encodeURIComponent(fundId)}/repartition`));
  const [axis, setAxis] = useState<Axis>("countries");
  const rows = (data?.[axis] ?? []) as Row[];
  const off = new Set(data?.held_not_registered ?? []);
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
                <BarList items={rows} value={(r) => r.encours} color={() => "var(--fc)"}
                  label={(r) => (
                    <span className="hold__lab">
                      {axis === "countries" && r.iso && <Flag iso={r.iso} className="hold__flag" />}
                      {axis === "parts" ? (r.share ?? r.key) : r.key}
                      {axis === "countries" && off.has(r.key) && <span className="tag tag--warn hold__warn" title="Des porteurs détiennent le fonds depuis ce pays, où aucune part n'est autorisée à la commercialisation.">hors autorisation</span>}
                    </span>
                  )}
                  sub={(r) => axis === "parts" && r.share ? r.isin : `${r.positions} position${r.positions > 1 ? "s" : ""}`}
                  right={(r) => <><b>{eur(r.encours)}</b><span className="muted"> · {r.pct == null ? "—" : pctRaw(r.pct)}</span></>} />
              </div>
              <div className="card card--flat hold__reg">
                <div className="eyebrow">Autorisé · détenu</div>
                <p className="small muted" style={{ margin: "6px 0 14px" }}>Pays où une part du fonds est autorisée à la commercialisation, et s'il y a des porteurs au passif.</p>
                <ul className="hold__chips" role="list">
                  {(data.registered ?? []).map((c) => (
                    <li key={c.country} className={`hold__chip${c.held ? " is-held" : ""}`}>
                      <Flag iso={c.iso} className="hold__flag" />
                      <Link to={`/distribution/${encodeURIComponent(c.country)}`}>{c.country}</Link>
                      <span className="small">{c.held ? "porteurs" : "aucun porteur"}</span>
                    </li>
                  ))}
                </ul>
                {(data.held_not_registered ?? []).length > 0 && (
                  <p className="hold__alert small"><I.Alert size={14} /> Porteurs hors des pays d'autorisation : {data.held_not_registered!.join(", ")}.</p>
                )}
              </div>
            </div>
            <p className="small muted hold__note">
              Pays du compte porteur, tel que renseigné au passif (positions, Montant EUR), à la date de la photo. Le passif ne couvre qu'une partie de
              l'encours JUMP : les pourcentages se lisent sur l'encours suivi au passif. Montants agrégés, aucun nom de client.
            </p>
          </>
        )}
    </section>
  );
}
