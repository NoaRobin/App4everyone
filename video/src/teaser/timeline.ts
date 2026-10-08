/**
 * « Dix minutes » — minutage (version Jasmine : sans les plans encours ni R-co Valor, 1 min 57,5). Coupes franches, toutes sur un temps de la musique (120 battements par minute : un temps
 * = 15 images). Le compteur d'extraction JUMP démarre à l'image JUMP_START et court jusqu'au plan « Le compte ».
 */
export const SHOTS = {
  launch: 210,       // I.  L'attente — une extraction JUMP est lancée
  ritual: 375,       //     le rituel : recherches, fichiers, mails, attente
  rupture: 135,      //     « Et si tout était déjà là ? »
  fabric: 510,       //     comment ça marche : les outils d'aujourd'hui, Fabric, l'application
  manifesto: 195,    // II. Toutes les informations métiers, au même endroit
  revenus: 240,      //     les fonds qui nous font gagner le plus (application)
  distribution: 210, //     globe et Sankey (application)
  passif: 180,       //     qui détient nos fonds (application)
  perf: 210,         //     comparer, en relief (application)
  search: 375,       //     plus de recherches Product Info (application)
  wall: 225,         //     le mur : tout, en même temps
  count: 300,        // III. Le compte : l'extraction n'est pas finie
  sign: 360,         //     signature, puis le nom de l'application : Jasmine
} as const;
export type Shot = keyof typeof SHOTS;

export const START: Record<Shot, number> = (() => {
  let t = 0;
  const out = {} as Record<Shot, number>;
  (Object.keys(SHOTS) as Shot[]).forEach((k) => { out[k] = t; t += SHOTS[k]; });
  return out;
})();
export const TEASER_TOTAL = Object.values(SHOTS).reduce((a, b) => a + b, 0);

/** L'extraction démarre à 2 s, et dure 10 minutes. */
export const JUMP_START = 60;
export const JUMP_DURATION_S = 600;
export const jumpElapsed = (globalFrame: number, fps = 30) => Math.max(0, (globalFrame - JUMP_START) / fps);
export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Chiffres communiqués (seules données réelles du film, fournies par la direction ; tout le reste est illustratif). */
export const FACTS = {
  aumMdEur: 50.278,       // encours sous gestion, en milliards d'euros
  biggestFund: "R-co Valor",
  biggestFundMdEur: 10,   // encours du plus gros fonds, en milliards d'euros
} as const;
