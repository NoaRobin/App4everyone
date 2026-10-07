/**
 * « Le matin » — film de 1 min 30 (composition `Matin`). Bande son : music/matin.py → public/matin/bande-son.wav.
 *
 *   0 → 12 s    Chaque matin : l'horloge, le lancement de l'extraction JUMP, les jours qui passent.
 *  12 → 22 s    Les données sont ailleurs : Product Info, JUMP, Centaure, Doc Info.
 *  22 → 28 s    Et si tout était au même endroit ? Le schéma dans Fabric.
 *  28 → 30 s    Le creux : « Une seule application. »
 *  30 s         L'explosion : Jasmine. Puis « Et plus encore. »
 *  34 → 49 s    Les plus beaux plans 3D de l'application, une coupe tous les deux temps.
 *  49 → 71 s    Cas pratique : frais de gestion ; Article 8 × Italie × architecture ouverte × gérant ; le fonds qui
 *               rapporte le plus ; qui y est investi.
 *  71 → 75 s    Jasmine travaille aussi : l'export Excel, très vite.
 *  75 → 82 s    Final : les trois derniers accords.
 *  82 → 90 s    Silence, tic-tac : pendant ce film, JUMP n'aurait pas terminé.
 *
 * Après l'explosion, la grille de la musique : 112 battements par minute, un temps = 16,07 images ; temps 0 = 30 s.
 */
export const FPS = 30;
export const MATIN_TOTAL = 2700;
export const DROP = 900;
export const BEAT = 0.53575 * FPS;               // 16,07 images
/** Image du n-ième temps après l'explosion (n peut être négatif : les temps du passage qui précède). */
export const B = (n: number) => Math.round(DROP + n * BEAT);
export const sec = (s: number) => Math.round(s * FPS);

/** L'extraction JUMP lancée le lundi, à l'image 60 (2 s) : le compteur de l'épilogue court depuis là. */
export const JUMP_START = 60;
export const JUMP_S = 600;
export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Les plans, en images [début, fin). */
export const S = {
  mornings: [0, sec(12)],
  tools: [sec(12), B(-15)],          // 12 s → 21,96 s
  fabric: [B(-15), B(-4)],           // → 27,86 s
  gap: [B(-4), DROP],
  drop: [DROP, B(8)],
  more: [B(8), B(12)],
  reel: [B(12), B(36)],
  fees: [B(36), B(44)],
  sfdr: [B(44), B(60)],
  rank: [B(60), B(68)],
  carnet: [B(68), B(76)],
  excel: [B(76), B(84)],
  finale: [B(84), sec(82.4)],
  epilogue: [sec(82.4), MATIN_TOTAL],
} as const;
export type ShotId = keyof typeof S;
export const from = (id: ShotId) => S[id][0];
export const len = (id: ShotId) => S[id][1] - S[id][0];
/** Image locale (dans un plan) du n-ième temps après l'explosion. */
export const lb = (id: ShotId, n: number) => B(n) - from(id);

export const pulse = (frame: number, every = BEAT, decay = 5) => Math.exp(-((((frame % every) + every) % every) / decay));
