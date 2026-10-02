import { useEffect, useState } from "react";

/** Drapeaux nationaux (SVG du paquet libre country-flag-icons, intégrés à l'interface compilée : aucun appel réseau).
 *  Chaque drapeau est un petit module chargé à la demande. */
const FLAGS = import.meta.glob<string>("/node_modules/country-flag-icons/string/3x2/*.js", { import: "default" });
const cache = new Map<string, string>();

export function flagLoader(iso: string | null | undefined): (() => Promise<string>) | null {
  const k = (iso ?? "").toUpperCase();
  if (k === "UK") return flagLoader("GB");
  if (k === "EL") return flagLoader("GR");
  return FLAGS[`/node_modules/country-flag-icons/string/3x2/${k}.js`] ?? null;
}

export function Flag({ iso, className = "", title }: { iso: string | null | undefined; className?: string; title?: string }) {
  const k = (iso ?? "").toUpperCase();
  const [svg, setSvg] = useState<string | null>(cache.get(k) ?? null);
  useEffect(() => {
    if (cache.has(k)) { setSvg(cache.get(k)!); return; }
    const load = flagLoader(k);
    if (!load) { setSvg(null); return; }
    let alive = true;
    load().then((s) => { cache.set(k, s); if (alive) setSvg(s); }).catch(() => undefined);
    return () => { alive = false; };
  }, [k]);
  return (
    <span className={`flag ${className}`} role="img" aria-label={title ?? `Drapeau ${k}`}
      {...(svg ? { dangerouslySetInnerHTML: { __html: svg } } : {})}>
      {svg ? undefined : <span className="flag__iso">{k || "—"}</span>}
    </span>
  );
}
