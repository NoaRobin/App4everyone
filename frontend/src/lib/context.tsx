import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchJson, withDate } from "./api";
import { SearchIndex } from "./search";
import type { Meta, SearchEntry } from "./types";

type Ctx = {
  meta: Meta | null;
  /** Date d'arrêté choisie (null = dernier arrêté disponible). */
  date: string | null;
  asOf: string | null;
  setDate: (d: string | null) => void;
  index: SearchIndex | null;
  entries: SearchEntry[];
  paletteOpen: boolean;
  openPalette: (q?: string) => void;
  closePalette: () => void;
  paletteSeed: string;
  api: (url: string) => string;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [date, setDateState] = useState<string | null>(() => {
    try { return sessionStorage.getItem("rco.date"); } catch { return null; }
  });
  const [entries, setEntries] = useState<SearchEntry[]>([]);
  const [paletteOpen, setOpen] = useState(false);
  const [paletteSeed, setSeed] = useState("");

  useEffect(() => { fetchJson<Meta>("/api/meta").then(setMeta).catch(() => undefined); }, []);
  useEffect(() => {
    fetchJson<{ entries: SearchEntry[] }>(withDate("/api/search-index", date)).then((r) => setEntries(r.entries)).catch(() => undefined);
  }, [date]);

  const setDate = useCallback((d: string | null) => {
    const v = d && meta && d >= meta.last_date ? null : d;
    setDateState(v);
    try { v ? sessionStorage.setItem("rco.date", v) : sessionStorage.removeItem("rco.date"); } catch { /* stockage indisponible */ }
  }, [meta]);

  const index = useMemo(() => (entries.length ? new SearchIndex(entries) : null), [entries]);
  const value: Ctx = {
    meta, date, asOf: date ?? meta?.last_date ?? null, setDate, index, entries,
    paletteOpen, paletteSeed,
    openPalette: (q = "") => { setSeed(q); setOpen(true); },
    closePalette: () => setOpen(false),
    api: (url: string) => withDate(url, date),
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("AppProvider manquant");
  return c;
}
