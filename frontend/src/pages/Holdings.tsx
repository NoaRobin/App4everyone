import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, pctRaw } from "../lib/format";
import { norm } from "../lib/search";
import { ErrorState, Loading, useReveal } from "../components/ui";
import { BarList } from "../components/charts";
import * as I from "../components/Icon";

type Resp = {
  date: string; total_eur: number; n_funds: number; n_instruments: number; dates: string[];
  instruments: { key: string; name: string; isin: string | null; asset_class: string | null; ccy: string | null; amount_eur: number; n_funds: number }[];
  most_shared: { key: string; name: string; n_funds: number; amount_eur: number }[];
  by_class: { label: string; amount_eur: number; weight: number }[]; by_ccy: { label: string; amount_eur: number; weight: number }[];
};

export default function Holdings() {
  const { api, entries } = useApp();
  const { data, error } = useApi<Resp>(api("/api/holdings"));
  const [q, setQ] = useState("");
  const nav = useNavigate();
  useReveal(data);
  const lines = useMemo(() => entries.filter((e) => e.t === "ligne"), [entries]);
  const found = useMemo(() => {
    const n = norm(q);
    if (n.length < 2) return [];
    return lines.filter((l) => norm(l.label).includes(n) || l.terms.some((t) => norm(t).replace(/\s/g, "").includes(n.replace(/\s/g, "")))).slice(0, 12);
  }, [q, lines]);
  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><Loading h={520} /></div>;
  return (
    <div className="page">
      <div className="enc__head">
        <div>
          <div className="eyebrow">Portefeuilles · derniers inventaires{data.dates[0] ? ` (au ${fdate(data.dates[0])})` : ""}</div>
          <h1 className="h1">Ce que nous détenons</h1>
          <p className="lede" style={{ marginTop: 14 }}>{data.n_instruments.toLocaleString("fr-FR")} lignes dans {data.n_funds} fonds, pour {eur(data.total_eur)} d'actifs inventoriés.</p>
        </div>
      </div>
      <div className="hsearch">
        <I.Search size={20} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Quels fonds détiennent… (nom d'émetteur, ISIN)" aria-label="Rechercher une ligne en portefeuille" />
      </div>
      {found.length > 0 && (
        <ul className="hsearch__res" role="list">
          {found.map((l) => (
            <li key={l.id}><button type="button" onClick={() => nav(`/portefeuilles/ligne?key=${encodeURIComponent(l.id)}`)}>
              <span className="strong">{l.label}</span><span className="small muted">{l.sub}</span><span className="num">{eur(l.aum)}</span><I.Arrow size={15} />
            </button></li>
          ))}
        </ul>
      )}
      {q.length >= 2 && !found.length && <p className="small muted" style={{ marginTop: 10 }}>Aucune ligne ne correspond à « {q} ».</p>}

      <div className="grid grid-2 reveal" style={{ marginTop: 40 }}>
        <div className="card card--flat">
          <h2 className="h3" style={{ marginBottom: 14 }}>Répartition par classe d'actifs</h2>
          <BarList items={data.by_class} value={(x) => x.amount_eur} label={(x) => x.label} right={(x) => <span>{eur(x.amount_eur)} <span className="muted">· {pctRaw(x.weight, 1)}</span></span>} color={() => "var(--ink)"} />
        </div>
        <div className="card card--flat">
          <h2 className="h3" style={{ marginBottom: 14 }}>Répartition par devise</h2>
          <BarList items={data.by_ccy.slice(0, 10)} value={(x) => x.amount_eur} label={(x) => x.label} right={(x) => <span>{eur(x.amount_eur)} <span className="muted">· {pctRaw(x.weight, 1)}</span></span>} color={() => "var(--ink-2)"} />
        </div>
      </div>
      <div className="grid grid-2 reveal" style={{ marginTop: 24 }}>
        <div className="card card--flat">
          <h2 className="h3" style={{ marginBottom: 4 }}>Principales lignes de la maison</h2>
          <p className="small muted" style={{ marginBottom: 14 }}>Montant cumulé tous fonds confondus.</p>
          <BarList items={data.instruments.slice(0, 20)} value={(x) => x.amount_eur} label={(x) => x.name} sub={(x) => `${x.asset_class ?? ""} · ${x.n_funds} fonds`}
            color={() => "var(--gold)"} onSelect={(x) => nav(`/portefeuilles/ligne?key=${encodeURIComponent(x.key)}`)} />
        </div>
        <div className="card card--flat">
          <h2 className="h3" style={{ marginBottom: 4 }}>Lignes les plus partagées</h2>
          <p className="small muted" style={{ marginBottom: 14 }}>Détenues par le plus grand nombre de fonds.</p>
          <BarList items={data.most_shared} value={(x) => x.n_funds} label={(x) => x.name} right={(x) => <span>{x.n_funds} fonds <span className="muted">· {eur(x.amount_eur)}</span></span>}
            color={() => "var(--ink-2)"} onSelect={(x) => nav(`/portefeuilles/ligne?key=${encodeURIComponent(x.key)}`)} />
        </div>
      </div>
    </div>
  );
}
