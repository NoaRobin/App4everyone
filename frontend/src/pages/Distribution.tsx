import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { eur } from "../lib/format";
import { ErrorState, Loading, useReveal } from "../components/ui";
import { BarList } from "../components/charts";
import { CountryTiles } from "../components/CountryTiles";

type Resp = { date: string; n_shares_registered: number;
  countries: { country: string; iso: string; n_shares: number; n_funds: number; aum_registered: number }[];
  platforms: { label: string; n_shares: number; aum: number }[] };

export default function Distribution() {
  const { api } = useApp();
  const { data, error } = useApi<Resp>(api("/api/distribution"));
  const nav = useNavigate();
  useReveal(data);
  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><Loading h={520} /></div>;
  const byIso = Object.fromEntries(data.countries.map((c) => [c.iso, c]));
  return (
    <div className="page">
      <div className="enc__head">
        <div>
          <div className="eyebrow">Distribution</div>
          <h1 className="h1">Où sommes-nous commercialisés&nbsp;?</h1>
          <p className="lede" style={{ marginTop: 14 }}>{data.n_shares_registered} parts enregistrées dans {data.countries.length} pays. Choisissez un pays pour voir les fonds et les parts autorisés.</p>
        </div>
      </div>
      <div className="grid grid-2 reveal">
        <div className="card card--flat">
          <CountryTiles values={Object.fromEntries(data.countries.map((c) => [c.iso, c.n_funds]))} labels={Object.fromEntries(data.countries.map((c) => [c.iso, c.country]))}
            linkFor={(iso) => (byIso[iso] ? `/distribution/${encodeURIComponent(byIso[iso].country)}` : null)} unit="fonds" color="var(--gold-ink)" />
        </div>
        <div className="card card--flat">
          <h2 className="h3" style={{ marginBottom: 4 }}>Fonds commercialisés par pays</h2>
          <p className="small muted" style={{ marginBottom: 14 }}>Encours des parts autorisées dans le pays (une même part peut l'être dans plusieurs pays : ces montants ne s'additionnent pas).</p>
          <BarList items={[...data.countries].sort((a, b) => b.n_funds - a.n_funds || b.n_shares - a.n_shares)} value={(c) => c.n_funds} label={(c) => c.country} sub={(c) => `${c.n_shares} parts · ${eur(c.aum_registered)}`}
            right={(c) => `${c.n_funds} fonds`} color={() => "var(--gold)"} onSelect={(c) => nav(`/distribution/${encodeURIComponent(c.country)}`)} />
        </div>
      </div>
      <div className="card card--flat reveal" style={{ marginTop: 24 }}>
        <h2 className="h3" style={{ marginBottom: 4 }}>Référencement sur les plateformes</h2>
        <p className="small muted" style={{ marginBottom: 14 }}>Nombre de parts référencées et encours correspondant.</p>
        <BarList items={data.platforms} value={(p) => p.n_shares} label={(p) => p.label} right={(p) => <span>{p.n_shares} parts <span className="muted">· {eur(p.aum)}</span></span>} color={() => "var(--ink-2)"} />
      </div>
    </div>
  );
}
