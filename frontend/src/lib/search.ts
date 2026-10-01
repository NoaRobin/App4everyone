/**
 * Recherche universelle, locale et instantanée.
 * Tolérante : accents, casse, fautes de frappe (distance d'édition), préfixes, codes (ISIN, LEI, ticker…).
 * Elle comprend aussi les combinaisons de critères (« article 9 italie », « encours fixed income »)
 * et propose alors une réponse directe : le nombre de fonds et leur encours, en un clic vers la liste.
 */
import type { SearchEntry } from "./types";

export const norm = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9%&]+/g, " ").trim();

const STOP = new Set(["le", "la", "les", "des", "du", "de", "d", "l", "et", "en", "au", "aux", "un", "une", "pour", "avec", "sur", "dans",
  "quel", "quels", "quelle", "quelles", "qui", "est", "sont", "commercialise", "commercialises", "commercialisee", "commercialisees", "enregistre", "enregistres", "the", "of"]);
const TYPE_HINTS: Record<string, string> = { fonds: "fonds", fond: "fonds", part: "part", parts: "part", gerant: "gérant", gerants: "gérant", ligne: "ligne", lignes: "ligne", titre: "ligne", pays: "pays" };
const TYPE_WEIGHT: Record<string, number> = { fonds: 1.15, part: 0.95, "gérant": 1.05, famille: 1.1, gamme: 1.0, "classe d'actifs": 0.95, expertise: 0.9, SFDR: 1.0, pays: 1.0, domicile: 0.8, "forme juridique": 0.75, ligne: 0.7 };
export const TYPE_LABEL: Record<string, string> = { fonds: "Fonds", part: "Parts", "gérant": "Gérants", famille: "Familles de gestion", gamme: "Gammes", "classe d'actifs": "Classes d'actifs", expertise: "Expertises", SFDR: "Classification SFDR", pays: "Pays de commercialisation", domicile: "Domiciliation", "forme juridique": "Forme juridique", ligne: "Lignes en portefeuille" };
const GROUP_LIMIT: Record<string, number> = { fonds: 8, part: 6, ligne: 5 };

type Prepared = { e: SearchEntry; words: Int32Array; sub: Int32Array; codes: string[]; full: string };

export type Hit = { entry: SearchEntry; score: number };
export type Answer = { title: string; filters: Record<string, string>; labels: string[]; count: number; aum: number; href: string; wantsAum: boolean };
/** Question posée sur une fiche : « cut-off Europe Valeur » → la fiche du fonds, recherche « cut-off » déjà lancée. */
export type Ask = { entry: SearchEntry; question: string; href: string };
export type Results = { hits: Hit[]; groups: { type: string; label: string; hits: Hit[] }[]; answer: Answer | null; tokens: string[]; ask?: Ask | null };

// Matrice de travail réutilisée par osa (évite d'allouer un tableau par comparaison)
let osaBuf = new Int32Array(0);

export function osa(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const W = b.length + 1;
  const need = (a.length + 1) * W;
  if (osaBuf.length < need) osaBuf = new Int32Array(Math.max(need, osaBuf.length * 2));
  const d = osaBuf;
  for (let i = 0; i <= a.length; i++) d[i * W] = i;
  for (let j = 1; j <= b.length; j++) d[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[(i - 1) * W + j] + 1, d[i * W + j - 1] + 1, d[(i - 1) * W + j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[(i - 2) * W + j - 2] + 1);
      d[i * W + j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length * W + b.length];
}

function dice(a: string, b: string): number {
  const bg = (s: string) => { const out: string[] = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out; };
  const A = bg(a), B = bg(b);
  if (!A.length || !B.length) return 0;
  const pool = [...B];
  let common = 0;
  for (const x of A) { const i = pool.indexOf(x); if (i >= 0) { common++; pool.splice(i, 1); } }
  return (2 * common) / (A.length + B.length);
}

export function wordScore(t: string, w: string): number {
  if (w === t) return 1;
  if (w.startsWith(t)) return t.length === 1 ? 0.5 : 0.88;
  if (t.length >= 3 && w.includes(t)) return 0.6;
  if (t.length >= 4) {
    const max = t.length >= 7 ? 2 : 1;
    const dFull = osa(t, w, max);
    if (dFull <= max) return 0.4 - dFull * 0.06 + 0.3 * dice(t, w);
    if (w.length > t.length) {
      const dPre = osa(t, w.slice(0, t.length), max);
      if (dPre <= max) return 0.55 - dPre * 0.06;
    }
  }
  return 0;
}

// Synonymes métier → facettes
const SYNONYMS: [RegExp, string, string][] = [
  [/\b(article|art|sfdr|a)\s*9\b/, "sfdr", "Article 9"],
  [/\b(article|art|sfdr|a)\s*8\b/, "sfdr", "Article 8"],
  [/\b(article|art|sfdr|a)\s*6\b/, "sfdr", "Article 6"],
  [/\bfixed income\b|\bobligataire?s?\b|\btaux\b/, "family", "fi"],
  [/\bactions? europeennes?\b|\bactions? europe\b/, "family", "ae"],
  [/\barchitecture ouverte\b|\bmultigestion\b|\bmulti gestion\b/, "family", "ao"],
  [/\bactions? internationales?\b|\bgestion diversifiee\b|\bdiversifiee?s?\b/, "family", "aid"],
];

export class SearchIndex {
  private items: Prepared[];
  private funds: SearchEntry[];
  private facets: SearchEntry[];
  /** Vocabulaire commun : chaque mot distinct n'est évalué qu'une fois par jeton de requête (milliers d'entrées). */
  private vocab: string[] = [];
  private scoreCache = new Map<string, Float64Array>();

  constructor(entries: SearchEntry[]) {
    const ids = new Map<string, number>();
    const id = (w: string) => {
      let k = ids.get(w);
      if (k === undefined) { k = this.vocab.length; ids.set(w, k); this.vocab.push(w); }
      return k;
    };
    this.items = entries.map((e) => {
      const full = norm(e.label);
      const codes = e.terms.map((x) => norm(x).replace(/\s+/g, "")).filter(Boolean);
      const words = [...new Set([...full.split(" "), ...e.terms.flatMap((x) => norm(x).split(" "))].filter(Boolean))];
      const sub = norm(e.sub ?? "").split(" ").filter(Boolean);
      return { e, words: Int32Array.from(words, id), sub: Int32Array.from(sub, id), codes, full };
    });
    this.funds = entries.filter((e) => e.t === "fonds");
    this.facets = entries.filter((e) => e.key && e.t !== "fonds");
  }

  /** Score de chaque mot du vocabulaire pour un jeton (mémorisé : la saisie réutilise les jetons précédents). */
  private scores(t: string): Float64Array {
    let sc = this.scoreCache.get(t);
    if (!sc) {
      sc = new Float64Array(this.vocab.length);
      for (let i = 0; i < this.vocab.length; i++) sc[i] = wordScore(t, this.vocab[i]);
      if (this.scoreCache.size > 64) this.scoreCache.clear();
      this.scoreCache.set(t, sc);
    }
    return sc;
  }

  search(q: string, withAsk = true): Results {
    const nq = norm(q);
    if (!nq) return { hits: [], groups: [], answer: null, tokens: [] };
    let tokens = nq.split(" ").filter((t) => t && !STOP.has(t));
    const hints = new Set(tokens.filter((t) => TYPE_HINTS[t]).map((t) => TYPE_HINTS[t]));
    const wantsAum = tokens.some((t) => ["encours", "aum", "actif", "actifs", "montant"].includes(t));
    const core = tokens.filter((t) => !TYPE_HINTS[t] && !["encours", "aum", "actif", "actifs", "montant", "total"].includes(t));
    if (core.length) tokens = core;
    const compact = nq.replace(/\s+/g, "");
    const tokenScores = tokens.map((t) => this.scores(t));
    const hits: Hit[] = [];
    for (const it of this.items) {
      let score = 0;
      let ok = true;
      // Codes (ISIN, LEI, ticker…) : correspondance directe sur la chaîne compacte
      let codeHit = 0;
      if (compact.length >= 4) {
        for (const c of it.codes) {
          if (c === compact) codeHit = Math.max(codeHit, 3);
          else if (c.startsWith(compact)) codeHit = Math.max(codeHit, 2.2);
          else if (compact.length >= 6 && c.includes(compact)) codeHit = Math.max(codeHit, 1.4);
        }
      }
      if (codeHit) score = codeHit;
      else {
        for (const sc of tokenScores) {
          let best = 0;
          for (let k = 0; k < it.words.length; k++) {
            const s = sc[it.words[k]];
            if (s > best) best = s;
            if (best === 1) break;
          }
          if (best < 0.5) {
            for (let k = 0; k < it.sub.length; k++) best = Math.max(best, sc[it.sub[k]] * 0.55);
          }
          if (best < 0.3) {
            ok = false;
            break;
          }
          score += best;
        }
        if (!ok) continue;
        score /= Math.max(tokens.length, 1);
        if (it.full === nq) score += 1;
        else if (it.full.startsWith(nq)) score += 0.45;
      }
      score *= TYPE_WEIGHT[it.e.t] ?? 1;
      if (hints.has(it.e.t)) score *= 1.25;
      if (it.e.aum) score += 0.012 * Math.log10(it.e.aum / 1e6 + 1);
      hits.push({ entry: it.e, score });
    }
    hits.sort((a, b) => b.score - a.score);
    const top = hits[0]?.score ?? 0;
    const kept = hits.filter((h) => h.score >= Math.max(0.3, top * 0.42));
    const groups: Results["groups"] = [];
    const byType = new Map<string, Hit[]>();
    for (const h of kept) {
      const arr = byType.get(h.entry.t) ?? [];
      if (arr.length < (GROUP_LIMIT[h.entry.t] ?? 4)) arr.push(h);
      byType.set(h.entry.t, arr);
    }
    for (const [type, hs] of [...byType.entries()].sort((a, b) => b[1][0].score - a[1][0].score)) {
      groups.push({ type, label: TYPE_LABEL[type] ?? type, hits: hs });
    }
    const answer = this.answer(nq, wantsAum);
    const ask = withAsk && !kept.length && !answer ? this.ask(q) : null;
    return { hits: kept, groups, answer, tokens, ask };
  }

  /**
   * Aucune correspondance directe : la requête est peut-être une question sur une fiche.
   * On cherche le plus long groupe de mots (au début ou à la fin) qui désigne un fonds ou une part ;
   * le reste devient la question posée dans la fiche.
   */
  ask(q: string): Ask | null {
    const words = q.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return null;
    for (let n = words.length - 1; n >= 1; n--) {
      for (const [subj, rest] of [[words.slice(-n), words.slice(0, -n)], [words.slice(0, n), words.slice(n)]]) {
        const r = this.search(subj.join(" "), false);
        const top = r.hits[0];
        if (!top || !["fonds", "part"].includes(top.entry.t) || top.score < 0.8) continue;
        const question = rest.join(" ").replace(/^(le|la|les|du|de|des|d'|sur)\s+/i, "").trim();
        if (!question) continue;
        return { entry: top.entry, question, href: `${hrefFor(top.entry)}?q=${encodeURIComponent(question)}` };
      }
    }
    return null;
  }

  /** Détecte des critères (famille, SFDR, pays, gérant, gamme…) et calcule la réponse. */
  private answer(nq: string, wantsAum: boolean): Answer | null {
    const filters: Record<string, string> = {};
    const labels: string[] = [];
    let rest = ` ${nq} `;
    for (const [re, key, value] of SYNONYMS) {
      if (filters[key]) continue;
      const m = rest.match(re);
      if (m) {
        filters[key] = value;
        rest = rest.replace(m[0], " ");
      }
    }
    // Facettes par libellé complet (le plus long d'abord)
    const facets = [...this.facets].sort((a, b) => b.label.length - a.label.length);
    for (const f of facets) {
      if (!f.key || filters[f.key]) continue;
      const names = [f.label, ...f.terms].map(norm).filter((x) => x.length >= 3);
      const hit = names.find((n) => new RegExp(`(^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(rest));
      if (hit) {
        filters[f.key] = f.key === "family" ? f.id : f.label;
        rest = rest.replace(hit, " ");
      }
    }
    const keys = Object.keys(filters);
    const leftover = norm(rest).split(" ").filter((t) => t && !STOP.has(t) && !TYPE_HINTS[t] && !["encours", "aum", "total", "actifs", "actif", "montant"].includes(t));
    if (!keys.length || leftover.length) return null;
    if (keys.length < 2 && !wantsAum) return null;
    const match = this.funds.filter((f) => keys.every((k) => fundMatches(f, k, filters[k])));
    const aum = match.reduce((s, f) => s + (f.aum ?? 0), 0);
    for (const k of keys) labels.push(describe(k, filters[k]));
    const qs = new URLSearchParams(filters).toString();
    return { title: labels.join(" · "), filters, labels, count: match.filter((f) => (f.aum ?? 0) > 0).length, aum, href: `/selection?${qs}`, wantsAum };
  }
}

const FAMILY_NAMES: Record<string, string> = { aid: "Actions internationales et gestion diversifiée", ae: "Actions européennes", fi: "Fixed Income", ao: "Architecture ouverte" };

function describe(k: string, v: string): string {
  switch (k) {
    case "family": return FAMILY_NAMES[v] ?? v;
    case "country": return `Commercialisés en ${v}`;
    case "manager": return `Gérés par ${v}`;
    case "sfdr": return v;
    case "domicile": return `Domiciliés en ${v}`;
    default: return v;
  }
}

function fundMatches(f: SearchEntry, k: string, v: string): boolean {
  const a = f.attrs ?? {};
  const eq = (x: unknown) => typeof x === "string" && norm(x) === norm(v);
  if (k === "family") return f.family === v;
  if (k === "country") return Array.isArray(a.countries) && a.countries.some((c) => norm(c) === norm(v));
  if (k === "manager") return eq(a.manager) || eq(a.backup);
  return eq(a[k]);
}

export function hrefFor(e: SearchEntry): string {
  switch (e.t) {
    case "fonds": return `/fonds/${encodeURIComponent(e.id)}`;
    case "part": return `/parts/${encodeURIComponent(e.id)}`;
    case "pays": return `/distribution/${encodeURIComponent(e.id)}`;
    case "ligne": return `/portefeuilles/ligne?key=${encodeURIComponent(e.id)}`;
    default: return `/selection?${new URLSearchParams({ [e.key ?? "q"]: e.id }).toString()}`;
  }
}
