/** Formats financiers français : M€, Md€, JJ/MM/AAAA, espaces insécables. */
const NNBSP = " ";

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: min, maximumFractionDigits: max });
const n0 = nf(0, 0), n1 = nf(1, 1), n2 = nf(2, 2);

export function eur(v: number | null | undefined, opts: { signed?: boolean; precise?: boolean } = {}): string {
  if (v == null || !isFinite(v)) return "—";
  const sign = opts.signed ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : "";
  const a = Math.abs(v);
  let s: string;
  if (a >= 1e9) s = (opts.precise ? n2 : a >= 1e11 ? n1 : n2).format(a / 1e9) + NNBSP + "Md€";
  else if (a >= 1e6) s = (a >= 1e8 ? n0 : n1).format(a / 1e6) + NNBSP + "M€";
  else if (a >= 1e3) s = n0.format(a / 1e3) + NNBSP + "k€";
  else s = n0.format(a) + NNBSP + "€";
  return sign + s;
}

/** Montant décomposé pour les grands chiffres : { value: "34,41", unit: "Md€" } */
export function eurParts(v: number | null | undefined): { value: string; unit: string } {
  const s = eur(v);
  const i = s.lastIndexOf(NNBSP);
  return i < 0 ? { value: s, unit: "" } : { value: s.slice(0, i), unit: s.slice(i + 1) };
}

export function pct(v: number | null | undefined, opts: { signed?: boolean; digits?: number } = {}): string {
  if (v == null || !isFinite(v)) return "—";
  const d = opts.digits ?? (Math.abs(v) < 0.1 ? 2 : 1);
  const signed = opts.signed ?? true;
  const x = v * 100;
  const sign = signed ? (x > 0.00001 ? "+" : x < -0.00001 ? "−" : "") : x < 0 ? "−" : "";
  return sign + nf(d, d).format(Math.abs(x)) + NNBSP + "%";
}

/** Valeur déjà exprimée en pourcentage dans le référentiel (ex. 1,35 = 1,35 %). */
export function pctRaw(v: number | null | undefined, digits = 2): string {
  if (v == null || !isFinite(v)) return "—";
  return nf(0, digits).format(v) + NNBSP + "%";
}

export function num(v: number | null | undefined, digits = 0): string {
  if (v == null || !isFinite(v)) return "—";
  return nf(digits, digits).format(v);
}

export function nav(v: number | null | undefined, ccy?: string | null): string {
  if (v == null || !isFinite(v)) return "—";
  const d = Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 10 ? 2 : 4;
  return nf(d, d).format(v) + (ccy ? NNBSP + ccy : "");
}

export function date(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MONTHS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export function monthYear(iso: string, long = false): string {
  const [y, m] = iso.split("-");
  return `${(long ? MONTHS_LONG : MONTHS)[Number(m) - 1]} ${y}`;
}
export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS_LONG[Number(m) - 1]} ${y}`;
}

export function plural(n: number, one: string, many?: string): string {
  return `${num(n)}\u00a0${n > 1 ? many ?? (/[sxz]$/.test(one) ? one : one + "s") : one}`;
}

export const PERIOD_LABEL: Record<string, string> = {
  "1J": "1 jour", "1S": "1 semaine", "1M": "1 mois", "3M": "3 mois", YTD: "Depuis le 1er janvier", "1A": "1 an", "3A": "3 ans",
};
export const PERIOD_SHORT: Record<string, string> = { "1J": "1 j", "1S": "1 sem.", "1M": "1 mois", "3M": "3 mois", YTD: "YTD", "1A": "1 an", "3A": "3 ans" };
