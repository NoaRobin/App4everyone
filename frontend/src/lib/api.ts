import { useEffect, useState } from "react";

const cache = new Map<string, Promise<unknown>>();

export function fetchJson<T>(url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url, { headers: { Accept: "application/json" } }).then(async (r) => {
      if (!r.ok) throw Object.assign(new Error(r.status === 404 ? "Introuvable" : "Erreur de chargement"), { status: r.status });
      return r.json() as Promise<T>;
    });
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
