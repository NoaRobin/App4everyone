import { useEffect, useState } from "react";

const cache = new Map<string, Promise<unknown>>();

/** Erreur renvoyée par le serveur : { error, message, hint?, detail? } (JSON). */
export type ApiError = Error & { status?: number; code?: string; hint?: string; detail?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function load<T>(url: string): Promise<T> {
  // Pendant le chargement des données (503 « model_loading »), on patiente et on réessaie (jusqu'à 15 minutes)
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (r.ok) return r.json() as Promise<T>;
    let body: { error?: string; message?: string; hint?: string; detail?: string } = {};
    try { body = await r.json(); } catch { /* réponse non JSON */ }
    if (r.status === 503 && body.error === "model_loading" && i < 300) { await sleep(3000); continue; }
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
