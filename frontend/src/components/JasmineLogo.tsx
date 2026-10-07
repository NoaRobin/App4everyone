/**
 * Jasmine — le logo de l'application : une fleur de jasmin à cinq pétales, pliée comme un origami.
 * Formes de la charte : uniquement des angles vifs (aucun arrondi) ; deux ors (face claire, face pliée) et un cœur clair.
 * La même géométrie sert à la vidéo (video/src/jasmine/logo.ts).
 */
import type React from "react";

export const JASMINE_PETALS: { light: string; dark: string }[] = [
  { light: "51.93,47.7 35.0,24.02 56.4,4.45 51.67,34.09", dark: "51.93,47.7 51.67,34.09 56.4,4.45 62.5,28.35" },
  { light: "52.78,51.12 70.07,27.71 95.3,42.01 65.65,46.67", dark: "52.78,51.12 65.65,46.67 95.3,42.01 74.45,55.2" },
  { light: "49.79,52.99 77.41,62.2 71.6,90.62 58.0,63.86", dark: "49.79,52.99 58.0,63.86 71.6,90.62 52.61,74.86" },
  { light: "47.09,50.73 46.86,79.84 18.05,83.09 39.29,61.89", dark: "47.09,50.73 39.29,61.89 18.05,83.09 27.16,60.17" },
  { light: "48.41,47.46 20.66,56.24 8.66,29.83 35.38,43.49", dark: "48.41,47.46 35.38,43.49 8.66,29.83 33.27,31.42" },
];
export const JASMINE_HEART = "50.32,45.41 54.46,48.89 52.44,53.9 47.04,53.52 45.73,48.28";

export function JasmineMark({ size = 28, title, style, light = "#e8c788", dark = "#b0823c", heart = "#fff3d6" }: {
  size?: number; title?: string; style?: React.CSSProperties; light?: string; dark?: string; heart?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={style} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {JASMINE_PETALS.map((p, i) => (
        <g key={i}>
          <polygon points={p.light} fill={light} />
          <polygon points={p.dark} fill={dark} />
        </g>
      ))}
      <polygon points={JASMINE_HEART} fill={heart} />
    </svg>
  );
}
