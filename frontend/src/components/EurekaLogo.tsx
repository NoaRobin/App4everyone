/**
 * Eureka — le logo de l'application : une étincelle à huit rayons, pliée comme un origami (le moment « eurêka »).
 * Formes de la charte : uniquement des angles vifs (aucun arrondi) ; deux ors (face claire, face pliée) et un cœur clair.
 */
import type React from "react";

export const EUREKA_RAYS: { light: string; dark: string }[] = [
  { light: "50.00,46.00 46.16,37.58 50.00,3.00", dark: "50.00,46.00 50.00,3.00 53.84,37.58" },
  { light: "52.83,47.17 54.13,40.89 69.09,30.91", dark: "52.83,47.17 69.09,30.91 59.11,45.87" },
  { light: "54.00,50.00 62.42,46.16 97.00,50.00", dark: "54.00,50.00 97.00,50.00 62.42,53.84" },
  { light: "52.83,52.83 59.11,54.13 69.09,69.09", dark: "52.83,52.83 69.09,69.09 54.13,59.11" },
  { light: "50.00,54.00 53.84,62.42 50.00,97.00", dark: "50.00,54.00 50.00,97.00 46.16,62.42" },
  { light: "47.17,52.83 45.87,59.11 30.91,69.09", dark: "47.17,52.83 30.91,69.09 40.89,54.13" },
  { light: "46.00,50.00 37.58,53.84 3.00,50.00", dark: "46.00,50.00 3.00,50.00 37.58,46.16" },
  { light: "47.17,47.17 40.89,45.87 30.91,30.91", dark: "47.17,47.17 30.91,30.91 45.87,40.89" },
];
export const EUREKA_HEART = "54.60,45.40 54.60,54.60 45.40,54.60 45.40,45.40";

export function EurekaMark({ size = 28, title, style, light = "#e8c788", dark = "#b0823c", heart = "#fff3d6" }: {
  size?: number; title?: string; style?: React.CSSProperties; light?: string; dark?: string; heart?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={style} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {EUREKA_RAYS.map((p, i) => (
        <g key={i}>
          <polygon points={p.light} fill={light} />
          <polygon points={p.dark} fill={dark} />
        </g>
      ))}
      <polygon points={EUREKA_HEART} fill={heart} />
    </svg>
  );
}
