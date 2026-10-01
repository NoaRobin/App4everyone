import { useEffect, useState } from "react";

const cache = new Map<string, Promise<unknown>>();

/** Erreur renvoyée par le serveur : { error, message, hint?, detail? } (JSON). */
export type ApiError = Error & { status?: number; code?: string; hint?: string; detail?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Attente commune de la fin du chargement : une seule boucle interroge /api/health (qui ne déclenche rien), quel que
 * soit le nombre de requêtes en attente ; elles sont toutes relancées une fois le modèle prêt.
 */
let ready: Promise<void> | null = null;
function untilReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (let i = 0; i < 900; i++) {
        await sleep(i < 5 ? 1500 : 2500);
        try {
          const h = await (await fetch("/api/health", { headers: { Accept: "application/json" }, cache: "no-store" })).json();
          if (h?.model?.state && h.model.state !== "loading") return;
        } catch { /* serveur momentanément injoignable */ }
      }
    })().finally(() => { ready = null; });
  }
  return ready;
}

async function load<T>(url: string): Promise<T> {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (r.ok) return r.json() as Promise<T>;
    let body: { error?: string; message?: string; hint?: string; detail?: string } = {};
    try { body = await r.json(); } catch { /* réponse non JSON */ }
    if (r.status === 503 && body.error === "model_loading" && i < 20) { await untilReady(); continue; }
    const msg = body.message ?? (r.status === 404 ? "Introuvable" : "Erreur de chargement");
    throw Object.assign(new Error(msg), { status: r.status, code: body.error, hint: body.hint, detail: body.detail }) as ApiError;
  }
}

export function fetchJson<T>(url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = load<T>(url);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

export function withDate(url: string, date: string | null): string {
  if (!date) return url;
  return url + (url.includes("?") ? "&" : "?") + "date=" + encodeURIComponent(date);
}

export type Loadable<T> = { data: T | null; error: Error | null; loading: boolean };

export function useApi<T>(url: string | null): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ data: null, error: null, loading: !!url });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState((s) => ({ data: s.data, error: null, loading: true }));
    fetchJson<T>(url)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => {
      alive = false;
    };
  }, [url]);
  return state;
}

export const prefetch = (url: string) => void fetchJson(url).catch(() => undefined);
