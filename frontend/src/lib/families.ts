import type { FamilyKey } from "./types";

export const FAMILY_ORDER: FamilyKey[] = ["aid", "ae", "fi", "ao"];
export const FAMILY_LABEL: Record<FamilyKey, string> = {
  aid: "Actions internationales et gestion diversifiée",
  ae: "Actions européennes",
  fi: "Fixed Income",
  ao: "Architecture ouverte",
  nc: "Non classé",
};
export const FAMILY_SHORT: Record<FamilyKey, string> = {
  aid: "Actions internationales & diversifiée", ae: "Actions européennes", fi: "Fixed Income", ao: "Architecture ouverte", nc: "Non classé",
};
export const famVar = (k: FamilyKey | string | undefined, night = false) => `var(--fam-${k ?? "nc"}${night ? "-night" : ""})`;

/** Couleurs résolues (pour WebGL / canvas), lues depuis les jetons CSS. */
export function famHex(k: FamilyKey, night = false): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--fam-${k}${night ? "-night" : ""}`).trim();
  return v || "#888888";
}

/**
 * Palette catégorielle des rubriques d'analyse (classes d'actifs, devises…), fond sombre.
 * Validée (bande de luminance, chroma, séparation daltonisme, contraste) : ordre fixe, jamais recyclé ;
 * au-delà de 5 catégories, le reste est regroupé en « Autres » (gris neutre).
 */
export const CATEGORICAL = ["#b58a45", "#5f86d4", "#c2476f", "#2fa89f", "#9a7fd0"];
export const OTHER = "#5b6272";

/** Rampe ordinale du SRI (1 → 7), une seule teinte, luminance croissante avec le risque. Validée. */
export const SRI_RAMP = ["#91314a", "#a34a5e", "#b66172", "#c87988", "#da909d", "#eca8b4", "#fec1ca"];
