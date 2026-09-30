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
