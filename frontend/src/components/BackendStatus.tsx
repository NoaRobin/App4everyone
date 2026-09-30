import { useEffect, useState } from "react";

type Health = { model?: { state?: string; elapsed_s?: number; error?: { message?: string; hint?: string; error?: string } } };

/**
 * Bandeau d'état du serveur : chargement des données en cours, ou erreur explicite du backend (Fabric, configuration).
 * Interroge /api/health, qui ne déclenche jamais de chargement ; disparaît dès que les données sont prêtes.
 */
export function BackendStatus() {
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    let alive = true, timer = 0;
    const poll = async () => {
      try {
        const r = await fetch("/api/health", { headers: { Accept: "application/json" }, cache: "no-store" });
        const j: Health = await r.json();
        if (!alive) return;
        setH(j);
        if (j.model?.state === "ready") return;
      } catch { /* serveur injoignable : on réessaie */ }
      timer = window.setTimeout(poll, 3000);
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  const st = h?.model?.state;
  if (!st || st === "ready" || st === "idle") return null;
  if (st === "loading") {
    return <div className="bstat bstat--load" role="status">Chargement des données{h?.model?.elapsed_s != null ? ` · ${Math.round(h.model.elapsed_s)} s` : ""}… Les pages s'afficheront dès qu'elles seront prêtes.</div>;
  }
  const e = h?.model?.error;
  return (
    <div className="bstat bstat--err" role="alert">
      <b>{e?.message ?? "Le chargement des données a échoué."}</b>
      {e?.hint && <span>{e.hint}</span>}
    </div>
  );
}
