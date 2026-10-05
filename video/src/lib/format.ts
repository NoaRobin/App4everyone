/** Formats français (espace fine insécable avant les unités, virgule décimale, signe moins typographique). */
export const NNBSP = " ";

const nf = (d: number) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Milliards d'euros sans unité : 34.41e9 → « 34,4 ». */
export const md = (v: number, d = 1) => nf(d).format(v / 1e9);
/** Millions d'euros sans unité : 397.3e6 → « 397 ». */
export const mn = (v: number, d = 0) => nf(d).format(v / 1e6);
/** Entier : 75000000 → « 75 000 000 » (espaces fines). */
export const int = (v: number) => nf(0).format(Math.round(v)).replace(/\s/g, NNBSP);
/** Pourcentage depuis une fraction : 0.110 → « 11,0 ». */
export const pct = (v: number, d = 1) => nf(d).format(v * 100);
/** Signe typographique. */
export const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");

/** Montant court avec unité : « 34,4 Md€ », « +75 M€ ». */
export function eur(v: number, opts: { signed?: boolean } = {}): string {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${md(a, a >= 1e10 ? 1 : 2)}${NNBSP}Md€` : a >= 1e6 ? `${mn(a, a >= 1e8 ? 0 : 1)}${NNBSP}M€` : `${nf(0).format(a / 1e3)}${NNBSP}k€`;
  return (opts.signed ? sign(v) : v < 0 ? "−" : "") + s;
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
/** « sept. 26 » */
export const monthShort = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
export const tOf = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");
