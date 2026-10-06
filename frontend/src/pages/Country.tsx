import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, eurParts } from "../lib/format";
import { PageHero } from "../components/Editorial";
import { FAMILY_LABEL, famVar } from "../lib/families";
import type { FamilyKey } from "../lib/types";
import { CopyCode, Crumbs, ErrorState, Loading } from "../components/ui";
import { ExportButton } from "../components/ExportDialog";
import { REG_COLS, REG_ESSENTIAL, REG_SCREEN } from "../lib/exportCols";
import * as I from "../components/Icon";
import { useRmm } from "../lib/rmm";

type Row = { share_id: string; share: string; isin: string | null; ccy: string | null; investor: string | null; fund_id: string | null; fund: string | null;
  family: FamilyKey; active: boolean; date: string | null; finma: boolean | null; comment: string | null; aum: number | null; rmm?: boolean };
type Resp = { date: string; country: string; iso: string; rows: Row[]; n_funds: number; n_shares: number };

export default function Country() {
  const { pays = "" } = useParams();
  const { api } = useApp();
  const [exclude, setExclude, withRmm] = useRmm();
  const { data, error } = useApi<Resp>(api(withRmm(`/api/countries/${encodeURIComponent(pays)}`)));
  const [showInactive, setShowInactive] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    (data?.rows ?? []).filter((r) => showInactive || r.active).forEach((r) => m.set(r.fund_id ?? r.share, [...(m.get(r.fund_id ?? r.share) ?? []), r]));
    return [...m.values()].sort((a, b) => (b.reduce((s, r) => s + (r.aum ?? 0), 0)) - (a.reduce((s, r) => s + (r.aum ?? 0), 0)));
  }, [data, showInactive]);
  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><Loading h={420} /></div>;
  const inactive = data.rows.filter((r) => !r.active).length;
  return (
    <div className="country">
      <PageHero
        top={<Crumbs items={[{ label: "Distribution", to: withRmm("/distribution") }, { label: data.country }]} />}
        eyebrow={<>Pays de commercialisation{data.iso && data.iso !== "??" ? ` · ${data.iso}` : ""}</>}
        title={data.country}
        lede={<>Les fonds et les parts autorisés à la commercialisation{exclude ? ", hors fonds Rothschild Martin Maurel" : ""}, avec la date d'enregistrement de chaque part.</>}
        aside={<div className="country__tools">
          <button type="button" role="switch" aria-checked={!exclude} className={`rmm__sw${exclude ? "" : " is-on"}`} onClick={() => setExclude(!exclude)}>
            <span className="rmm__track" aria-hidden="true"><span className="rmm__knob" /></span>
            <span className="rmm__t"><span className="rmm__l">Fonds Rothschild Martin Maurel</span><span className="rmm__s">{exclude ? "Exclus" : "Inclus"}</span></span>
          </button>
          <div className="row">
            <Link to={`/selection?country=${encodeURIComponent(data.country)}`} className="btn btn--ghost">Voir leurs encours <I.Arrow size={16} /></Link>
            <ExportButton id="enregistrements" title={`${data.country} — enregistrements`} filename={`enregistrements-${data.country}.xlsx`} rows={data.rows}
              columns={REG_COLS} shown={REG_SCREEN} essential={REG_ESSENTIAL}
              context={[{ label: "Pays", value: data.country }, { label: "Date de valeur", value: fdate(data.date) }, { label: "Fonds RMM", value: exclude ? "exclus" : "inclus" }]} />
          </div>
        </div>}
        figures={[
          { label: "Fonds autorisés", value: String(data.n_funds) },
          { label: "Parts autorisées", value: String(data.n_shares) },
          { label: "Encours de ces parts", value: eurParts(groups.reduce((s, g) => s + g.filter((r) => r.active).reduce((x, r) => x + (r.aum ?? 0), 0), 0)).value, unit: eurParts(groups.reduce((s, g) => s + g.filter((r) => r.active).reduce((x, r) => x + (r.aum ?? 0), 0), 0)).unit },
          { label: "Enregistrements inactifs", value: String(inactive) },
        ]}
      />
      <div className="page country__page">
      {inactive > 0 && <label className="row small" style={{ marginBottom: 16, gap: 8 }}><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Afficher aussi les {inactive} enregistrements inactifs</label>}
      <div className="stack" style={{ ["--s" as string]: "16px" }}>
        {groups.map((rows) => (
          <div key={rows[0].fund_id ?? rows[0].share} className="card card--flat cgroup">
            <div className="spread">
              <div className="row" style={{ gap: 10 }}>
                <span className="dot" style={{ background: famVar(rows[0].family) }} />
                {rows[0].fund_id ? <Link className="h3 link" to={`/fonds/${encodeURIComponent(rows[0].fund_id)}`}>{rows[0].fund}</Link> : <span className="h3">{rows[0].share}</span>}
                <span className="small muted">{FAMILY_LABEL[rows[0].family]}</span>
                {rows[0].rmm && <span className="tag tag--s" title="Fonds Rothschild Martin Maurel">RMM</span>}
              </div>
              <span className="num strong">{eur(rows.reduce((s, r) => s + (r.aum ?? 0), 0))}</span>
            </div>
            <table className="t t--mini" style={{ marginTop: 10 }}>
              <thead><tr><th>Part</th><th>ISIN</th><th>Devise</th><th>Souscripteurs</th><th>Enregistrée le</th><th className="n">Encours</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.share_id} className={r.active ? "" : "is-muted"}>
                  <td><Link className="link" to={`/parts/${encodeURIComponent(r.share_id)}`}>{r.share}</Link>{!r.active && <span className="tag tag--s" style={{ marginLeft: 8 }}>inactif</span>}{r.finma && <span className="tag tag--s" style={{ marginLeft: 8 }}>FINMA</span>}</td>
                  <td><CopyCode code={r.isin} /></td><td>{r.ccy ?? "—"}</td><td className="small">{r.investor ?? "—"}</td><td className="num">{fdate(r.date)}</td><td className="n">{eur(r.aum)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
