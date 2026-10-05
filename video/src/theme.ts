/**
 * Charte de la vidéo — reprise des jetons de l'application (frontend/src/styles/tokens.css).
 * Une seule source pour les couleurs, la typographie, le rythme et la mise en page : aucune scène ne code une couleur
 * ou une durée en dur.
 *
 * Personnalité de mouvement : « Premium » (skill motion-design) — pas de rebond, entrées décélérées, sorties plus courtes,
 * une courbe signature pour 80 % des mouvements, trois durées, un seul motif d'entrée (montée courte + fondu).
 */
import { Easing, staticFile } from "remotion";
import { loadFont } from "@remotion/fonts";

// ------------------------------------------------------------------ format
export const VIDEO = { width: 1920, height: 1080, fps: 30 } as const;
/** Secondes → images, pour les constantes hors composant (dans un composant : `useVideoConfig().fps`). */
export const sec = (s: number) => Math.round(s * VIDEO.fps);

// ------------------------------------------------------------------ couleurs
/** Charte Rothschild & Co (référence). */
export const BRAND = {
  blue: "#1c355e",
  gold: "#cc9f53",
  red: "#8a1e41",
  rose: "#e8c9ba",
  stone: "#d6d1ca",
  white: "#ffffff",
  black: "#000000",
} as const;

/** Interface sombre de l'application : fond noir bleuté, surfaces en bleu Rothschild, encre chaude. */
export const COLOR = {
  paper: "#060b15",      // fond de toutes les scènes
  paper2: "#0d1728",     // surfaces, panneaux
  paper3: "#15233b",     // surfaces hautes
  card: "#0a1322",
  ink: "#f6f3ee",        // texte principal
  ink2: "#d6d1ca",       // texte secondaire (pierre)
  ink3: "#9a9ea8",       // légendes, graduations
  line: "rgba(214, 209, 202, 0.11)",
  line2: "rgba(214, 209, 202, 0.22)",
  gold: "#cc9f53",
  goldInk: "#dcb36d",    // or lisible en texte
  goldSoft: "rgba(204, 159, 83, 0.14)",
  goldGlow: "#f3dcaa",   // arête lumineuse des courbes
  up: "#7fcfa6",         // hausse — toujours avec un signe
  down: "#ee8ea0",       // baisse — toujours avec un signe
} as const;

/** Les quatre familles de gestion (éclaircies pour le fond sombre) — la couleur suit la famille, jamais le rang. */
export const FAMILY = {
  aid: { color: "#6189d6", label: "Actions internationales et gestion diversifiée", short: "Actions internationales" },
  ae: { color: "#c2476f", label: "Actions européennes", short: "Actions européennes" },
  fi: { color: "#cc9f53", label: "Fixed Income", short: "Fixed Income" },
  ao: { color: "#e8c9ba", label: "Architecture ouverte", short: "Architecture ouverte" },
  nc: { color: "#8d929c", label: "Non classé", short: "Non classé" },
} as const;
export type FamilyKey = keyof typeof FAMILY;
export const FAMILY_ORDER: FamilyKey[] = ["aid", "ae", "fi", "ao"];

/** Divergent (variations) : rouge ↔ ardoise ↔ bleu. Collecte : or au-dessus de l'axe, rouge au-dessous. */
export const DIVERGING = { neg: "#c2476f", mid: "#3a4254", pos: "#6189d6" } as const;
export const FLOW = { in: "#cc9f53", out: "#c2476f" } as const;

// ------------------------------------------------------------------ typographie
// Les polices de l'application (Instrument Serif, Inter Tight, JetBrains Mono — licence OFL), servies en local depuis
// public/fonts (copies des fichiers @fontsource de l'application) : le rendu ne dépend d'aucun service externe.
// Le chargement bloque le rendu de chaque image jusqu'à ce que la police soit prête.
const FAMILIES = { serif: "Instrument Serif", sans: "Inter Tight", mono: "JetBrains Mono" } as const;
loadFont({ family: FAMILIES.serif, url: staticFile("fonts/instrument-serif-latin-400-normal.woff2"), weight: "400", style: "normal" });
loadFont({ family: FAMILIES.serif, url: staticFile("fonts/instrument-serif-latin-400-italic.woff2"), weight: "400", style: "italic" });
loadFont({ family: FAMILIES.sans, url: staticFile("fonts/inter-tight-latin-wght-normal.woff2"), weight: "100 900", style: "normal" });
loadFont({ family: FAMILIES.mono, url: staticFile("fonts/jetbrains-mono-latin-400-normal.woff2"), weight: "400", style: "normal" });

export const FONT = {
  serif: `"${FAMILIES.serif}", "Iowan Old Style", Georgia, serif`,  // chiffres héros, titres éditoriaux
  sans: `"${FAMILIES.sans}", system-ui, sans-serif`,                 // textes, libellés, surtitres
  mono: `"${FAMILIES.mono}", ui-monospace, monospace`,               // codes, horodatages techniques
} as const;

/**
 * Échelle typographique pour 1920 × 1080 (minimums du skill Remotion : titre ≥ 84 px et texte d'appui ≥ 44 px à 1080 px
 * de large, soit × 1,78 à 1920). Les chiffres héros sont en serif, chiffres tabulaires ; les surtitres en capitales espacées.
 */
export const TYPE = {
  hero: { fontFamily: FONT.serif, fontSize: 340, lineHeight: 0.9, letterSpacing: "-0.02em" },     // « 34,4 Md€ »
  display: { fontFamily: FONT.serif, fontSize: 168, lineHeight: 0.95, letterSpacing: "-0.015em" }, // titres de scène
  title: { fontFamily: FONT.serif, fontSize: 112, lineHeight: 1.0, letterSpacing: "-0.01em" },
  lede: { fontFamily: FONT.sans, fontSize: 52, lineHeight: 1.3, fontWeight: 300 },
  body: { fontFamily: FONT.sans, fontSize: 40, lineHeight: 1.4, fontWeight: 400 },
  label: { fontFamily: FONT.sans, fontSize: 30, lineHeight: 1.2, fontWeight: 500 },
  eyebrow: { fontFamily: FONT.sans, fontSize: 26, lineHeight: 1, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase" as const },
  tick: { fontFamily: FONT.sans, fontSize: 24, lineHeight: 1, fontWeight: 400 },
} as const;
/** Chiffres alignés (encours, pourcentages) : toujours tabulaires. */
export const NUMERIC = { fontVariantNumeric: "tabular-nums lining-nums" } as const;

// ------------------------------------------------------------------ mise en page
export const LAYOUT = {
  safeX: 144,      // marge latérale (80 px à 1080 de large → 144 px à 1920)
  safeY: 100,      // marge haute et basse
  gutter: 48,
  grid: 12,        // colonnes
  hairline: 1.5,   // filets, graduations
  stroke: 3,       // trait d'une courbe
  strokeHero: 5,   // courbe héros
  radius: 0,       // aucune forme arrondie : angles vifs partout
} as const;

// ------------------------------------------------------------------ mouvement
/** Courbe signature de l'application (--ease) : départ franc, atterrissage très doux. */
export const EASE = {
  signature: Easing.bezier(0.2, 0.7, 0.1, 1),
  /** Premium (motion-design) : déplacements et fondus à l'écran. */
  premium: Easing.bezier(0.4, 0, 0.2, 1),
  /** Sorties : accélèrent (--ease-in). */
  exit: Easing.bezier(0.6, 0, 0.8, 0.3),
  /** Tracé des courbes : régulier, presque linéaire, ralenti à l'arrivée. */
  draw: Easing.bezier(0.45, 0.05, 0.25, 1),
  /** Compteurs de chiffres : la valeur ralentit fortement avant de se figer. */
  count: Easing.bezier(0.16, 1, 0.3, 1),
} as const;

/** Trois durées (en images à 30 i/s) + le plan d'ouverture. Sortie ≈ 65 % de l'entrée. */
export const DUR = {
  quick: 12,       // 0,4 s — libellés, filets
  standard: 18,    // 0,6 s — entrées de blocs
  slow: 30,        // 1 s — révélations
  hero: 45,        // 1,5 s — chiffre héros, tracé principal
  exitRatio: 0.65,
  cut: 20,         // fondu ou balayage entre deux scènes
} as const;

/** Décalages en cascade : le total d'une cascade reste sous ~0,5 s (règle du skill motion-design). */
export const STAGGER = { micro: 1, standard: 3, dramatic: 5 } as const;

/** Motif d'entrée unique : montée de 24 px + fondu, avec la courbe signature. */
export const ENTER = { distance: 24, scaleFrom: 0.98 } as const;

/** Ambiance : grain très léger, halo d'or qui respire — jamais au premier plan. */
export const AMBIENT = { grainOpacity: 0.035, glowOpacity: 0.07, breathSeconds: 8 } as const;
