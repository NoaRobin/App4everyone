/**
 * Géométrie partagée par les scènes 3 (la courbe sur trois ans) et 4 (du jour à l'année) : le zoom de la scène 3 aboutit
 * exactement au cadrage de la scène 4, d'où un raccord invisible.
 */
import { scaleLinear, scaleUtc } from "d3-scale";
import { SAMPLE } from "../data/sample";
import { tOf } from "./format";

type Pt = { d: string; aum: number; flows: number | null };

export const BOX3 = { x0: 144, x1: 1640, y0: 380, y1: 900 };
export const BOX4 = { x0: 144, x1: 1776, y0: 400, y1: 760, axis: 870, barMax: 56 };

export const S3_POINTS = SAMPLE.aum3y.points as readonly Pt[];
export const S4_SERIES = SAMPLE.granularity as unknown as Record<"A" | "T" | "M" | "S" | "J", Pt[]>;

const t3 = S3_POINTS.map((p) => tOf(p.d));
export const x3 = scaleUtc().domain([new Date(t3[0]), new Date(t3[t3.length - 1])]).range([BOX3.x0, BOX3.x1]);
export const y3 = scaleLinear().domain([24e9, 36e9]).range([BOX3.y1, BOX3.y0]);
export const Y3_TICKS = [24e9, 26e9, 28e9, 30e9, 32e9, 34e9, 36e9];

const J = S4_SERIES.J;
export const T4 = J.map((p) => tOf(p.d));
const all = Object.values(S4_SERIES).flat().map((p) => p.aum);
const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.1;
export const x4 = scaleUtc().domain([new Date(T4[0]), new Date(T4[T4.length - 1])]).range([BOX4.x0, BOX4.x1]);
export const y4 = scaleLinear().domain([lo - pad, hi + pad]).range([BOX4.y1, BOX4.y0]);
export const Y4_TICKS = y4.ticks(5);

/** Matrice qui envoie le repère de la scène 3 sur celui de la scène 4 (x et y affines, indépendants). */
export function zoomMatrix() {
  const xa = x3(new Date(T4[0])), xb = x3(new Date(T4[T4.length - 1]));
  const ax = (BOX4.x1 - BOX4.x0) / (xb - xa);
  const bx = BOX4.x0 - ax * xa;
  // y3 = A3·v + B3 ; y4 = A4·v + B4  ⇒  y4 = (A4 / A3)·(y3 − B3) + B4
  const A3 = y3(1) - y3(0), B3 = y3(0);
  const A4 = y4(1) - y4(0), B4 = y4(0);
  const ay = A4 / A3;
  return { ax, bx, ay, by: B4 - ay * B3 };
}
