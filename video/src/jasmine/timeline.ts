/**
 * « Jasmine » — le film de 1 min 30. Tout est posé sur la grille de la musique (« Fireworks », FreePD, CC0, extrait de
 * 86,8 s à 176,8 s) : 117 battements par minute, un temps = 15,385 images, une mesure de quatre temps = 61,54 images.
 *
 *   mesures  0–5    Ouverture : le point d'or, les mots du métier sur chaque temps, le logo se plie, « Jasmine ».
 *   mesures  5–11   Chercher : la recherche de fonds (clavier 3D), puis une question directe → la fiche.
 *   mesures 11–13   Les frais de gestion, en grand.
 *   mesures 13–20   La fiche répond : ISIN, cut-off, SFDR, dépositaire, gérant — une question par mesure.
 *   mesures 20–31   Exporter : l'outil d'export, champs Product Info, packs, style, téléchargement.
 *   mesures 31–35   Le fichier Excel : une ligne par fonds.
 *   mesures 35–39   Chercher. Comprendre. Exporter.
 *   mesures 39–44   Signature : le logo, Jasmine, Rothschild & Co Asset Management (la musique s'éteint).
 */
export const BEAT = 30 * 60 / 117;   // 15,385 images
export const BAR = BEAT * 4;          // 61,54 images
export const bar = (b: number) => Math.round(b * BAR);
export const beat = (n: number) => Math.round(n * BEAT);
export const JASMINE_TOTAL = 2700;   // 90 s

/** Les plans, en mesures [début, fin). */
export const S = {
  open: [0, 5],
  search: [5, 11],
  fees: [11, 13],
  fiche: [13, 20],
  exportTitle: [20, 21],
  export: [21, 31],
  excel: [31, 35],
  recap: [35, 39],
  sign: [39, 43.875],
} as const;
export type ShotId = keyof typeof S;
export const from = (id: ShotId) => bar(S[id][0]);
export const len = (id: ShotId) => (id === "sign" ? JASMINE_TOTAL : bar(S[id][1])) - bar(S[id][0]);

/** Impulsion décroissante sur chaque temps (0 → 1), pour les respirations d'échelle et de lumière. */
export const pulse = (frame: number, every = BEAT, decay = 5) => Math.exp(-((frame % every) / decay));
