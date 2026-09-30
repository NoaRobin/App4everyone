/**
 * Le bureau de l'utilisateur : fiches épinglées et consultées récemment.
 * Mémorisé uniquement dans ce navigateur (localStorage) : identifiants et libellés, jamais de chiffres.
 */
import { useSyncExternalStore } from "react";
import type { FamilyKey } from "./types";

export type DeskItem = { kind: "fonds" | "part"; id: string; label: string; sub?: string; family?: FamilyKey };

const KEYS = { pins: "rco.pins", recents: "rco.recents" } as const;
const listeners = new Set<() => void>();
const cache: Record<string, DeskItem[]> = {};

function read(k: string): DeskItem[] {
  if (cache[k]) return cache[k];
  try { cache[k] = JSON.parse(localStorage.getItem(k) ?? "[]"); } catch { cache[k] = []; }
  if (!Array.isArray(cache[k])) cache[k] = [];
  return cache[k];
}
function write(k: string, v: DeskItem[]) {
  cache[k] = v;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible : la liste vit le temps de la session */ }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const same = (a: DeskItem, b: DeskItem) => a.kind === b.kind && a.id === b.id;

export function recordVisit(it: DeskItem) {
  write(KEYS.recents, [it, ...read(KEYS.recents).filter((x) => !same(x, it))].slice(0, 8));
}
export function togglePin(it: DeskItem) {
  const cur = read(KEYS.pins);
  write(KEYS.pins, cur.some((x) => same(x, it)) ? cur.filter((x) => !same(x, it)) : [it, ...cur].slice(0, 12));
}
export function clearRecents() { write(KEYS.recents, []); }

export const usePins = () => useSyncExternalStore(subscribe, () => read(KEYS.pins), () => []);
export const useRecents = () => useSyncExternalStore(subscribe, () => read(KEYS.recents), () => []);
export const useIsPinned = (kind: DeskItem["kind"], id: string | undefined) => usePins().some((x) => x.kind === kind && x.id === id);
