import { useEffect, useState } from "react";

const q = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export const prefersReducedMotion = () => !!q?.matches;

export function useReducedMotion(): boolean {
  const [v, setV] = useState(prefersReducedMotion());
  useEffect(() => {
    if (!q) return;
    const on = () => setV(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return v;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
