import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, pctRaw } from "../lib/format";
import { FAMILY_LABEL, famVar } from "../lib/families";
import type { FamilyKey } from "../lib/types";
import { CopyCode, Crumbs, ErrorState, Loading } from "../components/ui";
import { BarList } from "../components/charts";

type Resp = { key: string; name: string; isin: string | null; ccy: string | null; asset_class: string | null; type: string | null; debt: string | null; total_eur: number;
  funds: { fund_id: string; name: string; family: FamilyKey; weight: number; amount_eur: number; date: string }[] };

export default function Instrument() {
  const [p] = useSearchParams();
  const { api } = useApp();
  const key = p.get("key") ?? "";
  const { data, error } = useApi<Resp>(key ? api(`/api/instruments?key=${encodeURIComponent(key)}`) : null);
  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><Loading h={420} /></div>;
  return (
    <div className="page">
      <Crumbs items={[{ label: "Portefeuilles", to: "/portefeuilles" }, { label: data.name }]} />
      <div className="enc__head">
        <div>
          <div className="eyebrow">{[data.asset_class, data.debt, data.ccy].filter(Boolean).join(" · ")}</div>
          <h1 className="h1">{data.name}</h1>
          <div className="row" style={{ marginTop: 14 }}><CopyCode code={data.isin} /></div>
        </div>
        <div className="enc__total"><div className="eyebrow">Détenu par la maison</div><div className="enc__total-v num">{eur(data.total_eur)}</div>
          <div className="small muted">dans {data.funds.length} fonds</div></div>
      </div>
      <div className="grid grid-2" style={{ marginTop: 24 }}>
        <div className="card card--flat">
          <h2 className="h3" style={{ marginBottom: 14 }}>Montant détenu par fonds</h2>
          <BarList items={data.funds} value={(f) => f.amount_eur} label={(f) => <Link className="link" to={`/fonds/${encodeURIComponent(f.fund_id)}`}>{f.name}</Link>}
            sub={(f) => FAMILY_LABEL[f.family]} color={(f) => famVar(f.family)} />
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Fonds</th><th className="n">Poids</th><th className="n">Montant</th><th>Inventaire</th></tr></thead>
            <tbody>{data.funds.map((f) => (
              <tr key={f.fund_id} className="clickable"><td className="strong"><span className="dot" style={{ background: famVar(f.family), marginRight: 10 }} /><Link className="rowlink" to={`/fonds/${encodeURIComponent(f.fund_id)}`}>{f.name}</Link></td>
                <td className="n">{pctRaw(f.weight, 2)}</td><td className="n">{eur(f.amount_eur)}</td><td className="num small">{fdate(f.date)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
