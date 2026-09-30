import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { eur, pct } from "../lib/format";
import { famVar } from "../lib/families";
import type { Breakdown, Overview } from "../lib/types";
import { BigMoney, Delta, ErrorState, Loading, useReveal } from "../components/ui";
import { StackedArea } from "../components/charts";

const AXES: { key: string; label: string; group: string }[] = [
  { key: "family", label: "Famille de gestion", group: "Fonds" }, { key: "range", label: "Gamme", group: "Fonds" },
  { key: "asset_class", label: "Classe d'actifs", group: "Fonds" }, { key: "expertise", label: "Expertise", group: "Fonds" },
  { key: "manager", label: "Gérant", group: "Fonds" }, { key: "sfdr", label: "SFDR", group: "Fonds" }, { key: "sri", label: "SRI", group: "Fonds" },
  { key: "domicile", label: "Domicile", group: "Fonds" }, { key: "legal_form", label: "Forme juridique", group: "Fonds" }, { key: "currency", label: "Devise du fonds", group: "Fonds" },
  { key: "share_ccy", label: "Devise de part", group: "Parts" }, { key: "distribution", label: "Capitalisation / distribution", group: "Parts" },
  { key: "investor", label: "Souscripteurs", group: "Parts" }, { key: "hedged", label: "Couverture de change", group: "Parts" },
];
const SEQ = ["#0c1624", "#2b3a52", "#4d5d78", "#7384a0", "#9aa8bf", "#c3ccd9"];

export default function Encours() {
  const [params, setParams] = useSearchParams();
  const axis = params.get("axe") ?? "family";
  const { api } = useApp();
  const { data, error } = useApi<Breakdown>(api(`/api/breakdown/${axis}`));
  const ov = useApi<Overview>(api("/api/overview"));
  const nav = useNavigate();
  useReveal(data);
  const colorFor = (g: { key: string }, i: number) => (axis === "family" ? famVar(g.key) : SEQ[Math.min(i, SEQ.length - 1)]);
  const layers = useMemo(() => {
    if (!data) return [];
    const top = data.groups.slice(0, 5);
    const rest = data.groups.slice(5);
    const L = top.map((g, i) => ({ key: g.key, label: g.label, color: colorFor(g, i), points: g.series }));
    if (rest.length) {
      const months = top[0]?.series.map((p) => p.d) ?? [];
      L.push({ key: "__other", label: `Autres (${rest.length})`, color: SEQ[5], points: months.map((d) => ({ d, v: rest.reduce((s, g) => s + (g.series.find((p) => p.d === d)?.v ?? 0), 0) })) });
    }
    return L.reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, axis]);
  if (error) return <div className="page"><ErrorState error={error} /></div>;
  const open = (key: string) => {
    if (!data?.filterable || key === "Non renseigné") return;
    nav(`/selection?${new URLSearchParams({ [axis]: key }).toString()}`);
  };
  const max = Math.max(1, ...(data?.groups.map((g) => g.aum) ?? [1]));
  return (
    <div className="page">
      <div className="enc__head">
        <div>
          <div className="eyebrow">Encours de la maison</div>
          <h1 className="h1">Où sont nos encours&nbsp;?</h1>
        </div>
        {ov.data && <div className="enc__total"><BigMoney v={ov.data.aum} className="enc__total-v" /><div className="small muted">Évolution YTD <Delta v={ov.data.var.YTD?.pct} /> · collecte <Delta v={ov.data.var.YTD?.flows} kind="eur" /></div></div>}
      </div>
      <div className="axes" role="radiogroup" aria-label="Répartir les encours par">
        {["Fonds", "Parts"].map((grp) => (
          <div key={grp} className="axes__g">
            <span className="axes__l eyebrow">Par {grp === "Fonds" ? "caractéristique du fonds" : "caractéristique de la part"}</span>
            {AXES.filter((a) => a.group === grp).map((a) => (
              <button key={a.key} type="button" role="radio" aria-checked={axis === a.key} className="chip" aria-pressed={axis === a.key} onClick={() => setParams({ axe: a.key })}>{a.label}</button>
            ))}
          </div>
        ))}
      </div>
      {!data ? <Loading h={480} /> : (
        <div className="grid enc__grid reveal">
          <div className="card card--flat">
            <div className="spread" style={{ marginBottom: 6 }}>
              <h2 className="h3">{data.label}</h2>
              <span className="small muted">{data.groups.length} groupes · {eur(data.total)}</span>
            </div>
            <table className="t t--groups">
              <caption className="sr-only">Encours par {data.label.toLowerCase()}</caption>
              <thead><tr><th>{data.label}</th><th className="n">Encours</th><th className="n">Part</th><th className="n">Var. YTD</th><th className="n">Collecte YTD</th><th className="n">Marché YTD</th></tr></thead>
              <tbody>
                {data.groups.map((g, i) => (
                  <tr key={g.key} className={data.filterable && g.key !== "Non renseigné" ? "clickable" : ""} onClick={() => open(g.key)}
                    tabIndex={data.filterable ? 0 : undefined} onKeyDown={(e) => e.key === "Enter" && open(g.key)}>
                    <td>
                      <div className="grp"><span className="dot" style={{ background: colorFor(g, i) }} /><span><span className="strong">{g.label}</span>{g.n_funds != null && <span className="grp__n small muted">{g.n_funds} fonds</span>}</span></div>
                      <div className="grp__bar" aria-hidden="true"><span style={{ width: `${(g.aum / max) * 100}%`, background: colorFor(g, i) }} /></div>
                    </td>
                    <td className="n strong">{eur(g.aum)}</td>
                    <td className="n">{pct(g.weight, { signed: false, digits: 1 })}</td>
                    <td className="n"><Delta v={g.var.YTD?.pct} /></td>
                    <td className="n"><Delta v={g.var.YTD?.flows} kind="eur" /></td>
                    <td className="n"><Delta v={g.var.YTD?.market} kind="eur" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.filterable ? <p className="small muted" style={{ marginTop: 12 }}>Cliquer une ligne pour ouvrir la liste des fonds correspondants.</p>
              : <p className="small muted" style={{ marginTop: 12 }}>Répartition au niveau des parts : un fonds peut apparaître dans plusieurs groupes.</p>}
          </div>
          <div className="card card--flat">
            <div className="spread" style={{ marginBottom: 10 }}><h2 className="h3">Évolution mensuelle</h2></div>
            <div className="legend" style={{ marginBottom: 10 }}>{[...layers].reverse().map((l) => <span key={l.key} className="legend__i"><span className="dot" style={{ background: l.color }} />{l.label}</span>)}</div>
            <StackedArea layers={layers} height={360} ariaLabel={`Évolution des encours par ${data.label.toLowerCase()}`} />
          </div>
        </div>
      )}
    </div>
  );
}
