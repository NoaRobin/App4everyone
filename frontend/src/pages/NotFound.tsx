import { Link } from "react-router-dom";
import { useApp } from "../lib/context";
import * as I from "../components/Icon";

export default function NotFound() {
  const { openPalette } = useApp();
  return (
    <div className="page" style={{ minHeight: "70vh" }}>
      <div className="eyebrow">Page introuvable</div>
      <h1 className="h1" style={{ margin: "12px 0 20px" }}>Cette adresse ne mène nulle part.</h1>
      <p className="lede">Retrouvez n'importe quel fonds, part, ISIN, gérant ou pays avec la recherche.</p>
      <div className="row" style={{ marginTop: 24 }}>
        <button type="button" className="btn" onClick={() => openPalette()}><I.Search size={16} /> Rechercher</button>
        <Link to="/" className="btn btn--ghost">Revenir à l'accueil</Link>
      </div>
    </div>
  );
}
