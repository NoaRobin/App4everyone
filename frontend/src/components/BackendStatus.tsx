import { useEffect, useState } from "react";

type Progress = { table: string; rows?: number | null; total?: number | null; done?: boolean };
type Health = { model?: { state?: string; elapsed_s?: number; step?: string; progress?: Progress[];
  error?: { message?: string; hint?: string; error?: string } } };

/** 1 234 567 → « 1,2 M » ; 12 345 → « 12 345 » (format français). */
function rows(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  return n.toLocaleString("fr-FR");
}

/** Lecture en cours (la plus récente non terminée), pour afficher lignes lues et pourcentage. */
function current(p?: Progress[]): Progress | null {
  if (!p?.length) return null;
  const open = p.filter((x) => !x.done);
  return open.length ? open[open.length - 1] : null;
}

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
      timer = window.setTimeout(poll, h?.model?.state === "loading" ? 1500 : 3000);
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  const st = h?.model?.state;
  if (!st || st === "ready" || st === "idle") return null;
  if (st === "loading") {
    const p = current(h?.model?.progress);
    const pct = p?.total && p.rows != null ? Math.min(100, (100 * p.rows) / p.total) : null;
    return (
      <div className="bstat bstat--load" role="status" aria-live="polite">
        <span>
          <b>{h?.model?.step ?? "Chargement des données"}</b>
          {h?.model?.elapsed_s != null ? ` · ${Math.round(h.model.elapsed_s)} s` : ""}
        </span>
        {p && p.rows != null && (
          <span className="bstat__rows num">{rows(p.rows)}{p.total ? ` / ${rows(p.total)}` : ""} lignes lues</span>
        )}
        {pct != null && <span className="bstat__bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>}
        <span className="bstat__hint">Les pages s'afficheront dès que les données seront prêtes.</span>
      </div>
    );
  }
  const e = h?.model?.error;
  return (
    <div className="bstat bstat--err" role="alert">
      <b>{e?.message ?? "Le chargement des données a échoué."}</b>
      {e?.hint && <span>{e.hint}</span>}
    </div>
  );
}
