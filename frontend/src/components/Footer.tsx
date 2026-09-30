import { useApp } from "../lib/context";
import { date as fdate } from "../lib/format";

export function Footer({ night }: { night: boolean }) {
  const { meta } = useApp();
  const refresh = meta?.refresh ? new Date(meta.refresh) : null;
  return (
    <footer className={`ftr${night ? " ftr--night" : ""}`}>
      <div className="ftr__in">
        <div>
          <div className="brand__name" style={{ fontSize: 22 }}>Rothschild &amp; Co</div>
          <p className="small muted" style={{ marginTop: 6, maxWidth: "52ch" }}>
            Application de référence des fonds et des encours. Sources : JUMP (encours, VL, parts, dividendes, indices, inventaires) et Product Info
            (référentiel fonds et parts), via le Lakehouse Fabric — lecture seule.
          </p>
        </div>
        <div className="small muted ftr__meta">
          {meta && <div>Historique du {fdate(meta.first_date)} au {fdate(meta.last_date)}</div>}
          {refresh && <div>Dernier chargement du Lakehouse : {refresh.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</div>}
          <div>Collecte nette = estimation (variation du nombre de parts × VL). Encours en euros.</div>
          {meta?.is_mock && <div><b>Données fictives</b> — aucune donnée réelle n'est affichée.</div>}
        </div>
      </div>
    </footer>
  );
}
