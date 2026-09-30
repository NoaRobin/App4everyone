import { Link } from "react-router-dom";
import { num } from "../lib/format";

/** Carte stylisée en tuiles (Europe au centre, reste du monde à part) : lisible, sans fond géographique. */
const POS: Record<string, [number, number, string]> = {
  IS: [0, 0, "Islande"], NO: [4, 0, "Norvège"], SE: [5, 0, "Suède"], FI: [6, 0, "Finlande"],
  IE: [1, 1, "Irlande"], GB: [2, 1, "Royaume-Uni"], DK: [4, 1, "Danemark"],
  NL: [3, 2, "Pays-Bas"], DE: [4, 2, "Allemagne"], PL: [5, 2, "Pologne"],
  FR: [2, 3, "France"], BE: [3, 3, "Belgique"], LU: [4, 3, "Luxembourg"], CZ: [5, 3, "Tchéquie"],
  PT: [0, 4, "Portugal"], ES: [1, 4, "Espagne"], MC: [2, 4, "Monaco"], CH: [3, 4, "Suisse"], LI: [4, 4, "Liechtenstein"], AT: [5, 4, "Autriche"],
  IT: [3, 5, "Italie"], MT: [4, 6, "Malte"], GR: [6, 5, "Grèce"], CY: [7, 5, "Chypre"],
};

export function CountryTiles({ values, labels, linkFor, unit = "fonds", color = "var(--ink)" }:
  { values: Record<string, number>; labels: Record<string, string>; linkFor: (iso: string) => string | null; unit?: string; color?: string }) {
  const vals = Object.values(values).filter((v) => v > 0);
  const max = Math.max(1, ...vals), min = Math.min(max, ...vals);
  const others = Object.keys(values).filter((k) => !POS[k]);
  const tile = (iso: string, name: string, x?: number, y?: number) => {
    const v = values[iso] ?? 0;
    const href = v ? linkFor(iso) : null;
    const alpha = v ? 0.3 + 0.7 * (max === min ? 1 : (v - min) / (max - min)) : 0;
    const style: React.CSSProperties = { ["--tc" as string]: alpha > 0.62 ? "#0a0f1a" : "var(--ink)", ["--a" as string]: v ? 0.3 + 0.7 * (max === min ? 1 : (v - min) / (max - min)) : 0, ["--c" as string]: color, gridColumn: x != null ? x + 1 : undefined, gridRow: y != null ? y + 1 : undefined };
    const inner = (<><span className="tile__iso">{iso}</span><span className="tile__v num">{v ? num(v) : ""}</span></>);
    const title = `${labels[iso] ?? name} : ${v ? `${num(v)} ${unit}${v > 1 && unit !== "fonds" ? "s" : ""}` : "non commercialisé"}`;
    return href
      ? <Link key={iso} to={href} className={`tile is-on`} style={style} title={title} aria-label={title}>{inner}</Link>
      : <span key={iso} className={`tile${v ? " is-on" : ""}`} style={style} title={title} aria-label={title} role="img">{inner}</span>;
  };
  return (
    <div className="tiles">
      <div className="tiles__grid">{Object.entries(POS).map(([iso, [x, y, n]]) => tile(iso, n, x, y))}</div>
      {others.length > 0 && (
        <div className="tiles__others">
          <div className="eyebrow">Hors d'Europe</div>
          <div className="row" style={{ gap: 6 }}>{others.map((iso) => tile(iso, labels[iso] ?? iso))}</div>
        </div>
      )}
      <div className="tiles__legend small muted"><span className="tiles__scale" style={{ ["--c" as string]: color }} /> Intensité : nombre de {unit === "part" ? "parts enregistrées" : "fonds enregistrés"}</div>
    </div>
  );
}
