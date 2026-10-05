/**
 * « Entrée » — la publicité Nexus. Tout le film est posé sur la grille de la musique (« From Page to Practice », FreePD,
 * CC0) : 160 battements par minute, une mesure de quatre temps = 1,5 s = 45 images exactement (la bande son est recalée
 * de 0,02 s pour que la mesure 0 tombe sur l'image 0).
 *
 *   mesures  0–40   I.   La question, en cinémascope : le clavier seul, dans le noir.
 *   mesure   40          L'explosion de la musique : la touche Entrée.
 *   mesures 40–72   II.  Tout : l'application, une coupe toutes les quatre mesures.
 *   mesures 72–90   III. Le compte (l'extraction n'a pas fini), puis NEXUS et la signature.
 */
import VO_LINES from "./vo.json";

export const BAR = 45;
export const BEAT = BAR / 4;
export const bar = (b: number) => Math.round(b * BAR);
export const NEXUS_TOTAL = bar(90);

export type VoLine = { id: string; file: string; at: number; frames: number; text: string };
export const VO = VO_LINES as VoLine[];
export const vo = (id: string) => VO.find((l) => l.id === id)!;

/** Les plans, en mesures. */
export const S = {
  reveal: [0, 8], questions: [8, 16], disperse: [16, 26], fabric: [26, 34], tension: [34, 40], drop: [40, 41],
  aum: [41, 44], courbe: [44, 48], valor: [48, 52], revenus: [52, 56], pays: [56, 60], passif: [60, 64], perf: [64, 68], fiche: [68, 72],
  compte: [72, 77], nexus: [77, 90],
} as const;
export type ShotId = keyof typeof S;
export const from = (id: ShotId) => bar(S[id][0]);
export const len = (id: ShotId) => bar(S[id][1]) - bar(S[id][0]);

/** L'extraction qui tourne pendant tout le film. */
export const EXTRACT_START = bar(1);
export const EXTRACT_S = 600;
export const extractElapsed = (f: number, fps = 30) => Math.max(0, (f - EXTRACT_START) / fps);
export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Chiffres communiqués par la direction (les seuls chiffres réels du film). */
export const FACTS = { aum: "50,3 Md€", valor: "10 Md€" } as const;

/** Lignes sans sous-titre : le texte est déjà à l'écran (noms des outils, compte, signature). */
export const NO_SUBTITLE = new Set(["outil-1", "outil-2", "outil-3", "outil-4", "outil-5", "compte", "montre", "nom", "signature"]);
