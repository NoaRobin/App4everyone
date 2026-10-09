/**
 * Jasmin — le logo de l'application, en référence à Rothschild & Co : les cinq flèches du blason (une par frère :
 * Francfort, Vienne, Londres, Naples, Paris) deviennent les cinq pétales du jasmin, réunies en un cœur clair — les
 * données de la maison réunies en un seul endroit. Angles vifs, deux ors et un cœur clair. viewBox 0 0 100 100.
 */
import type React from "react";

type Arrow = { shaft: [number, number, number, number]; head: string; fletch: string[] };
export const JASMIN_ARROWS: Arrow[] = [{"shaft": [50.0, 41.0, 50.0, 9.4], "head": "50.00,4.00 46.22,13.00 50.00,10.30 53.78,13.00", "fletch": ["50.00,39.00 46.54,41.00 48.00,40.06", "50.00,39.00 53.46,41.00 52.00,40.06", "50.00,35.80 46.54,37.80 48.00,36.86", "50.00,35.80 53.46,37.80 52.00,36.86"]}, {"shaft": [58.56, 47.22, 88.61, 37.45], "head": "93.75,35.79 84.02,34.97 87.76,37.73 86.36,42.16", "fletch": ["60.46,46.60 57.49,43.92 58.83,45.03", "60.46,46.60 59.63,50.51 60.07,48.83", "63.51,45.61 60.53,42.94 61.87,44.04", "63.51,45.61 62.67,49.52 63.11,47.84"]}, {"shaft": [55.29, 57.28, 73.86, 82.85], "head": "77.04,87.21 74.81,77.71 73.34,82.12 68.69,82.16", "fletch": ["56.47,58.90 58.09,55.25 57.46,56.86", "56.47,58.90 52.49,59.32 54.22,59.21", "58.35,61.49 59.97,57.83 59.34,59.45", "58.35,61.49 54.37,61.91 56.10,61.80"]}, {"shaft": [44.71, 57.28, 26.14, 82.85], "head": "22.96,87.21 31.31,82.16 26.66,82.12 25.19,77.71", "fletch": ["43.53,58.90 47.51,59.32 45.78,59.21", "43.53,58.90 41.91,55.25 42.54,56.86", "41.65,61.49 45.63,61.91 43.90,61.80", "41.65,61.49 40.03,57.83 40.66,59.45"]}, {"shaft": [41.44, 47.22, 11.39, 37.45], "head": "6.25,35.79 13.64,42.16 12.24,37.73 15.98,34.97", "fletch": ["39.54,46.60 40.37,50.51 39.93,48.83", "39.54,46.60 42.51,43.92 41.17,45.03", "36.49,45.61 37.33,49.52 36.89,47.84", "36.49,45.61 39.47,42.94 38.13,44.04"]}];
export const JASMIN_HEART = "53.53,45.15 55.71,51.85 50.00,56.00 44.29,51.85 46.47,45.15";

/** Le logo Jasmin : une flèche par groupe <g> (l'accueil les anime une à une). */
export function JasmineMark({ size = 28, title, style, light = "#e8c788", dark = "#b0823c", heart = "#fff3d6" }: {
  size?: number; title?: string; style?: React.CSSProperties; light?: string; dark?: string; heart?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={style} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {JASMIN_ARROWS.map((a, i) => (
        <g key={i}>
          <line x1={a.shaft[0]} y1={a.shaft[1]} x2={a.shaft[2]} y2={a.shaft[3]} stroke={light} strokeWidth={2.6} />
          <polygon points={a.head} fill={light} />
          {a.fletch.map((p, j) => <polygon key={j} points={p} fill={dark} />)}
        </g>
      ))}
      <polygon points={JASMIN_HEART} fill={heart} />
    </svg>
  );
}
