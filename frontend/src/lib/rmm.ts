/**
 * Interrupteur « fonds Rothschild Martin Maurel » de la rubrique Distribution.
 * L'état est dans l'adresse (`?rmm=exclure`, partageable) et mémorisé pour la session,
 * afin de rester appliqué en passant de la vue d'ensemble à un pays et inversement.
 */
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

const KEY = "rco.rmm";

export function useRmm(): [boolean, (v: boolean) => void, (url: string) => string] {
  const [sp, setSp] = useSearchParams();
  const fromUrl = sp.get("rmm");
  let stored = false;
  try { stored = sessionStorage.getItem(KEY) === "exclure"; } catch { /* stockage indisponible */ }
  const exclude = fromUrl != null ? fromUrl === "exclure" : stored;
  const set = useCallback((v: boolean) => {
    try { v ? sessionStorage.setItem(KEY, "exclure") : sessionStorage.removeItem(KEY); } catch { /* idem */ }
    setSp((p) => { const n = new URLSearchParams(p); if (v) n.set("rmm", "exclure"); else n.delete("rmm"); return n; }, { replace: true });
  }, [setSp]);
  /** Ajoute le paramètre à une adresse (API ou lien interne) quand les fonds RMM sont exclus. */
  const withRmm = useCallback((url: string) => (exclude ? url + (url.includes("?") ? "&" : "?") + "rmm=exclure" : url), [exclude]);
  return [exclude, set, withRmm];
}
