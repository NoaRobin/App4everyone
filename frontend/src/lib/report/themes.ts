/**
 * Styles de classeur. Couleurs en hexadécimal sans « # » (ExcelJS attend de l'ARGB : « FF » + hex).
 * Tous restent dans la charte Rothschild & Co : bleu #1C355E, or #CC9F53, rouge #8A1E41, rose #E8C9BA, pierre #D6D1CA.
 */
export type Theme = {
  id: string; label: string; note: string;
  bg: string | null;          // fond des cellules (null = blanc d'Excel)
  brand: string;              // bandeau « ROTHSCHILD & CO »
  title: string;              // titres
  ink: string; muted: string;
  headFill: string; headInk: string; headRule: string;
  rule: string;               // filet sous le bandeau
  zebra: string | null; border: string;
  totalInk: string;
  kpiFill: string; kpiInk: string; kpiLabel: string;
  chart: { bg: string; ink: string; muted: string; grid: string; palette: string[]; pos: string; neg: string };
  serif: string; sans: string;
};

export const THEMES: Theme[] = [
  {
    id: "institutionnel", label: "Institutionnel", note: "Bleu Rothschild, filets d'or — le style maison",
    bg: null, brand: "CC9F53", title: "1C355E", ink: "1B2333", muted: "6B7280",
    headFill: "1C355E", headInk: "FFFFFF", headRule: "CC9F53", rule: "CC9F53", zebra: "F6F4F0", border: "D6D1CA", totalInk: "1C355E",
    kpiFill: "F6F4F0", kpiInk: "1C355E", kpiLabel: "6B7280",
    chart: { bg: "FFFFFF", ink: "1B2333", muted: "6B7280", grid: "E7E2DA", palette: ["1C355E", "CC9F53", "8A1E41", "6189D6", "E8C9BA", "8D929C"], pos: "1C355E", neg: "8A1E41" },
    serif: "Georgia", sans: "Arial",
  },
  {
    id: "epure", label: "Épuré", note: "Blanc, filets fins, une seule touche d'or — pour les comités",
    bg: null, brand: "8C7A55", title: "111827", ink: "1F2937", muted: "6B7280",
    headFill: "FFFFFF", headInk: "111827", headRule: "111827", rule: "111827", zebra: null, border: "E5E7EB", totalInk: "111827",
    kpiFill: "FFFFFF", kpiInk: "111827", kpiLabel: "6B7280",
    chart: { bg: "FFFFFF", ink: "111827", muted: "6B7280", grid: "EEEEEE", palette: ["1F2937", "CC9F53", "9CA3AF", "4B5563", "D6D1CA", "6B7280"], pos: "1F2937", neg: "B45309" },
    serif: "Georgia", sans: "Arial",
  },
  {
    id: "nuit", label: "Nuit", note: "Le thème sombre de l'application — pour l'écran",
    bg: "0A1322", brand: "CC9F53", title: "F6F3EE", ink: "E7E3DC", muted: "9A9EA8",
    headFill: "15233B", headInk: "DCB36D", headRule: "CC9F53", rule: "CC9F53", zebra: "0D1728", border: "1E2A40", totalInk: "DCB36D",
    kpiFill: "0D1728", kpiInk: "F6F3EE", kpiLabel: "9A9EA8",
    chart: { bg: "0A1322", ink: "E7E3DC", muted: "9A9EA8", grid: "1E2A40", palette: ["CC9F53", "6189D6", "C2476F", "E8C9BA", "8D929C", "F3DCAA"], pos: "CC9F53", neg: "C2476F" },
    serif: "Georgia", sans: "Arial",
  },
  {
    id: "bordeaux", label: "Bordeaux", note: "Rouge Rothschild et or — pour les présentations",
    bg: null, brand: "8A1E41", title: "8A1E41", ink: "2A1A20", muted: "7A6A70",
    headFill: "8A1E41", headInk: "FFFFFF", headRule: "CC9F53", rule: "8A1E41", zebra: "FBF6F3", border: "E8C9BA", totalInk: "8A1E41",
    kpiFill: "FBF6F3", kpiInk: "8A1E41", kpiLabel: "7A6A70",
    chart: { bg: "FFFFFF", ink: "2A1A20", muted: "7A6A70", grid: "F0E4DE", palette: ["8A1E41", "CC9F53", "1C355E", "E8C9BA", "C2476F", "8D929C"], pos: "1C355E", neg: "8A1E41" },
    serif: "Georgia", sans: "Arial",
  },
  {
    id: "impression", label: "Impression", note: "Noir et gris, économe en encre — pour imprimer",
    bg: null, brand: "000000", title: "000000", ink: "000000", muted: "555555",
    headFill: "E6E6E6", headInk: "000000", headRule: "000000", rule: "000000", zebra: "F5F5F5", border: "BFBFBF", totalInk: "000000",
    kpiFill: "F2F2F2", kpiInk: "000000", kpiLabel: "555555",
    chart: { bg: "FFFFFF", ink: "000000", muted: "555555", grid: "DDDDDD", palette: ["222222", "777777", "AAAAAA", "444444", "CCCCCC", "999999"], pos: "222222", neg: "888888" },
    serif: "Georgia", sans: "Arial",
  },
];
export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];
export const css = (hex: string) => `#${hex}`;
