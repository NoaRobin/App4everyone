import { useEffect, useState } from "react";

const q = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const KEY = "rco.motion";
const EVT = "rco-motion";

/** Animations mises en pause par l'utilisateur (bouton de l'en-tête), mémorisé sur le poste. */
export function motionPaused(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.motion === "off";
}

export function setMotionPaused(off: boolean) {
  document.documentElement.dataset.motion = off ? "off" : "on";
  try { localStorage.setItem(KEY, off ? "off" : "on"); } catch { /* stockage indisponible */ }
  window.dispatchEvent(new Event(EVT));
}

if (typeof document !== "undefined") {
  let v: string | null = null;
  try { v = localStorage.getItem(KEY); } catch { /* stockage indisponible */ }
  document.documentElement.dataset.motion = v === "off" ? "off" : "on";
}

/** Préférence système « réduire les animations », ou animations mises en pause dans l'application. */
export const prefersReducedMotion = () => !!q?.matches || motionPaused();

export function useReducedMotion(): boolean {
  const [v, setV] = useState(prefersReducedMotion());
  useEffect(() => {
    const on = () => setV(prefersReducedMotion());
    q?.addEventListener("change", on);
    window.addEventListener(EVT, on);
    return () => { q?.removeEventListener("change", on); window.removeEventListener(EVT, on); };
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
