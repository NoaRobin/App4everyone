/** Petits outils d'animation : tout dérive de l'image courante (aucune animation CSS). */
import { interpolate, type EasingFunction } from "remotion";
import { DUR, EASE, ENTER } from "../theme";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Progression 0 → 1 entre deux images, avec une courbe. */
export function prog(frame: number, from: number, dur: number, ease: EasingFunction = EASE.signature): number {
  if (dur <= 0) return frame >= from ? 1 : 0;
  return interpolate(frame, [from, from + dur], [0, 1], { ...CLAMP, easing: ease });
}

/** Valeur entre a et b selon une progression. */
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Motif d'entrée unique de la charte : montée de 24 px + fondu (courbe signature), sortie plus courte qui accélère.
 * `out` : image de début de sortie (optionnelle).
 */
export function enter(frame: number, at: number, opts: { dur?: number; out?: number; dist?: number; outDur?: number } = {}) {
  const dur = opts.dur ?? DUR.standard;
  const dist = opts.dist ?? ENTER.distance;
  const i = prog(frame, at, dur);
  const outDur = opts.outDur ?? Math.round(dur * DUR.exitRatio);
  const o = opts.out == null ? 0 : prog(frame, opts.out, outDur, EASE.exit);
  return {
    opacity: i * (1 - o),
    transform: `translate3d(0, ${(1 - i) * dist - o * dist * 0.6}px, 0)`,
  };
}

/** Lettres qui se resserrent : espacement de `from` à `to` em. */
export function tracking(frame: number, at: number, dur: number, from: number, to: number) {
  return `${mix(from, to, prog(frame, at, dur, EASE.premium))}em`;
}

/** Bruit déterministe 0 → 1 (pour les détails décoratifs). */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Interpolation linéaire d'une série (xs croissants) en x ; hors étendue : valeur de l'extrémité. */
export function sampleAt(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (!n) return 0;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (xs[m] <= x) lo = m;
    else hi = m;
  }
  const u = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + (ys[hi] - ys[lo]) * u;
}
