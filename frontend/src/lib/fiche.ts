/**
 * « Chercher dans la fiche » : chaque information affichée sur une fiche fonds ou part devient une réponse
 * directement lisible (libellé + valeur), avec un lien vers l'endroit exact de la page.
 * Le vocabulaire métier est élargi par des synonymes (cut-off, CAC, bench, TER, ticket…).
 */
import { date as fdate, eur, nav as fnav, pct, pctRaw, PERIOD_LABEL } from "./format";
import { norm, wordScore } from "./search";
import type { Field, FundDetail, ShareBrief, ShareDetail } from "./types";

export type FicheEntry = { group: string; label: string; value: string; anchor: string; terms: string; weight?: number };

export const slug = (s: string) => norm(s).replace(/\s+/g, "-").slice(0, 60);
export const fieldId = (section: string, label: string) => `f-${slug(section)}-${slug(label)}`;

/** Synonymes : mot tapé → mots ajoutés à la recherche. */
const SYN: [RegExp, string][] = [
  [/\bcut ?off\b|\bheure limite\b|\bcentralis/, "heure limite cut-off centralisation"],
  [/\bter\b|\bfrais\b|\bfees?\b|\bongoing\b|\bcharges?\b/, "frais courants gestion"],
  [/\bcac\b|\bauditeur|\baudit\b|\bcommissaire/, "commissaire aux comptes"],
  [/\bdepositaire|\bcustod|\bconservateur/, "depositaire conservateur"],
  [/\bbench|\bindice\b|\bindicateur\b|\bbenchmark/, "indicateur de reference indice"],
  [/\bgerant|\bmanager\b|\bpm\b|\bgestionnaire/, "gerant"],
  [/\bsrri?\b|\brisque\b|\bprofil de risque/, "risque sri"],
  [/\bperf|\brendement\b|\breturn/, "performance"],
  [/\bvol\b|\bvolat/, "volatilite"],
  [/\baum\b|\bencours\b|\bactif net\b|\btaille\b/, "encours"],
  [/\bcollecte\b|\bflux\b|\bsouscriptions?\b|\brachats?\b|\bflows?\b/, "collecte"],
  [/\bpays\b|\bcommercialis|\benregistr|\bregistration|\bpasseport/, "commercialise pays enregistrement"],
  [/\bexclu|\btabac\b|\barmes?\b|\bcharbon\b|\bfossile|\bnucleaire/, "exclusion"],
  [/\bsfdr\b|\barticle\b|\besg\b|\bisr\b|\blabel/, "sfdr esg label"],
  [/\bmin(imum)?\b|\bticket\b|\bmontant minimum/, "minimum souscription"],
  [/\bvl\b|\bnav\b|\bvaleur liquidative\b|\bprix\b/, "vl valeur liquidative"],
  [/\bdividend|\bcoupon\b|\bdistribu|\bcapitalis/, "dividende distribution affectation revenus"],
  [/\bisin\b|\bcode\b|\blei\b|\bticker\b|\bbloomberg\b|\bwkn\b|\bvalor\b/, "code isin lei bloomberg"],
  [/\bmaturit|\becheance\b/, "echeance"],
  [/\bvalorisation\b|\bfrequence\b|\bquotidien|\bhebdo/, "frequence valorisation vl"],
  [/\bplateforme|\ballfunds\b|\bclearstream\b|\beuroclear\b|\bfundsettle\b|\biznes\b/, "plateforme referencement"],
  [/\bligne|\bposition|\bdetient|\btitre|\bportefeuille\b|\bholding/, "ligne portefeuille"],
  [/\bretro|\btrailer\b/, "retrocession"],
  [/\bsurperf|\bperformance fee|\bcommission de perf/, "commission de surperformance"],
  [/\bprospectus\b|\bdic\b|\bkid\b|\bpriips\b/, "dic priips"],
];

const COUNTRIES = ["France", "Luxembourg", "Belgique", "Allemagne", "Autriche", "Italie", "Espagne", "Portugal", "Pays-Bas", "Suisse",
  "Royaume-Uni", "Suède", "Finlande", "Danemark", "Norvège", "Irlande", "Singapour", "Chili", "Liechtenstein", "Monaco"];

function fieldValue(f: Field): string {
  const v = f.value;
  switch (f.kind) {
    case "bool": return v ? "Oui" : "Non";
    case "date": return fdate(String(v));
    case "pct": return pctRaw(Number(v));
    case "pct_int": return pctRaw(Number(v), 0);
    case "money": return eur(Number(v));
    case "stars": return `${v} étoile${Number(v) > 1 ? "s" : ""} sur 5`;
    default: return String(v);
  }
}

function shareEntries(s: ShareBrief, anchor: string, prefix = true): FicheEntry[] {
  const p = prefix ? `Part ${s.class ?? s.name}` : "Cette part";
  const g = prefix ? `Part ${s.class ?? ""}` : "Part";
  const e: FicheEntry[] = [];
  const add = (label: string, value: string | null | undefined, extra = "") => value && e.push({ group: g, label: `${p} · ${label}`, value, anchor, terms: `${s.name} ${s.class ?? ""} part ${label} ${extra}` });
  add("ISIN", s.isin, "code");
  add("Frais courants", s.ongoing != null ? pctRaw(s.ongoing) : null, "ter frais");
  add("Minimum de souscription", s.min_sub ? eur(s.min_sub) : "1 part", "ticket");
  add("Heure limite (cut-off)", s.cutoff ? `${s.cutoff}${s.settlement ? ` · règlement ${s.settlement}` : ""}` : null);
  add("Devise", s.ccy ? `${s.ccy}${s.hedged ? " (couverte)" : ""}` : null, "couverture change hedge");
  add("Affectation des revenus", s.distribution);
  add("Souscripteurs", s.investor, "investisseurs clients");
  add("VL", s.nav != null ? `${fnav(s.nav, s.ccy)} au ${fdate(s.nav_date)}` : null, "valeur liquidative");
  add("Encours", s.aum != null ? eur(s.aum) : null);
  add("Commission de surperformance", s.perf_fee == null ? null : s.perf_fee ? "Oui" : "Non");
  add("Note Morningstar", s.rating ? `${s.rating} étoile${s.rating > 1 ? "s" : ""} sur 5` : null);
  return e;
}

export function fundEntries(f: FundDetail): FicheEntry[] {
  const out: FicheEntry[] = [];
  const add = (group: string, label: string, value: string | null | undefined, anchor: string, extra = "", weight = 1) =>
    value && out.push({ group, label, value, anchor, terms: `${label} ${extra}`, weight });
  const h = f.headline;
  add("Synthèse", "Gérant principal", h.manager ? `${h.manager}${h.backup ? ` · suppléant ${h.backup}` : ""}` : null, "synthese", "gestion", 1.2);
  add("Synthèse", "Indicateur de risque (SRI)", h.sri ? `${h.sri} sur 7${h.sri_prev && h.sri_prev !== h.sri ? ` (${h.sri_prev} le mois précédent)` : ""}` : null, "synthese", "", 1.2);
  add("Synthèse", "Indicateur de référence", h.benchmark, "synthese", "", 1.2);
  add("Synthèse", "Classification SFDR", h.sfdr, "esg", "article", 1.2);
  add("Synthèse", "Durée de placement recommandée", h.horizon, "synthese", "horizon");
  add("Synthèse", "Date de création", h.creation ? fdate(h.creation) : null, "synthese", "lancement");
  add("Synthèse", "Échéance", h.maturity ? fdate(h.maturity) : null, "synthese", "maturite");
  add("Synthèse", "Famille de gestion", f.family_label, "synthese", "expertise");
  add("Synthèse", "Gamme", h.range, "synthese");
  add("Synthèse", "Classe d'actifs", h.asset_class, "synthese");
  add("Synthèse", "Objectif de gestion", h.objective ? h.objective.slice(0, 160) + (h.objective.length > 160 ? "…" : "") : null, "synthese");
  add("Encours", `Encours au ${fdate(f.date)}`, eur(f.aum), "encours", "aum actif net", 1.3);
  if (f.var) for (const p of ["1M", "YTD", "1A", "3A"] as const) {
    const v = f.var[p];
    if (v?.delta == null) continue;
    add("Encours", `Variation des encours · ${PERIOD_LABEL[p]}`, `${eur(v.delta, { signed: true })} (${pct(v.pct)}) — collecte ${eur(v.flows, { signed: true })}, marché ${eur(v.market, { signed: true })}`, "encours", "variation evolution collecte flux marche");
  }
  const perf = f.performance;
  if (perf) {
    for (const p of ["1M", "3M", "YTD", "1A", "3A", "origine"]) {
      const a = perf.fund[p];
      if (a == null) continue;
      const b = perf.bench?.[p];
      add("Performance", `Performance · ${p === "origine" ? "depuis l'origine" : PERIOD_LABEL[p] ?? p}`, `${pct(a)}${b != null ? ` · indice ${pct(b)} · écart ${pct(a - b)}` : ""}`, "performance", "perf rendement", 1.1);
    }
    add("Performance", "Volatilité sur 1 an", perf.risk.vol != null ? pct(perf.risk.vol, { signed: false }) : null, "performance", "risque");
    add("Performance", "Perte maximale sur 1 an", perf.risk.mdd != null ? pct(perf.risk.mdd) : null, "performance", "drawdown");
    add("Performance", "Tracking error sur 1 an", perf.risk.te != null ? pct(perf.risk.te, { signed: false }) : null, "performance", "ecart de suivi");
    perf.calendar?.forEach((c) => add("Performance", `Performance ${c.year}${c.ytd ? " (depuis le 1er janvier)" : ""}`, `${pct(c.fund)}${c.bench != null ? ` · indice ${pct(c.bench)}` : ""}`, "performance", `annee ${c.year}`));
    if (perf.dividends.length) { const d = perf.dividends[perf.dividends.length - 1]; add("Performance", "Dernier dividende", `${fnav(d.v, perf.nav_ccy)} le ${fdate(d.d)}`, "performance", "coupon distribution"); }
  }
  f.shares.forEach((s) => out.push(...shareEntries(s, `part-${slug(s.id)}`)));
  const c = f.composition;
  if (c) {
    add("Portefeuille", "Nombre de lignes", String(c.n_lines), "portefeuille", "positions titres");
    add("Portefeuille", "Poids des 10 premières lignes", pctRaw(c.top10_weight, 1), "portefeuille", "concentration");
    add("Portefeuille", "Liquidités", pctRaw(c.cash_weight, 1), "portefeuille", "cash");
    add("Portefeuille", "Exposition aux dérivés", c.derivatives_expo ? pctRaw(c.derivatives_expo, 1) : "Aucune", "portefeuille", "futures");
    c.by_class.forEach((x) => add("Portefeuille", `Classe d'actifs · ${x.label}`, pctRaw(x.weight, 1), "portefeuille", "allocation repartition"));
    c.by_ccy.slice(0, 6).forEach((x) => add("Portefeuille", `Devise · ${x.label}`, pctRaw(x.weight, 1), "portefeuille", "exposition change"));
    c.lines.slice(0, 60).forEach((l, i) => add("Portefeuille", `Ligne · ${l.name}`, `${pctRaw(l.weight, 2)}${i < 10 ? ` · n°${i + 1}` : ""}${l.isin ? ` · ${l.isin}` : ""}`, "portefeuille", `${l.isin ?? ""} ${l.asset_class ?? ""} detient`, 0.9));
    c.moves.forEach((m) => add("Portefeuille", `Mouvement · ${m.name}`, `${m.kind} (${m.change >= 0 ? "+" : "−"}${pctRaw(Math.abs(m.change), 2)})`, "portefeuille", "achat vente entree sortie renforcement allegement"));
  }
  f.esg.fields.forEach((x) => add("ESG", x.label, fieldValue(x), "esg", "esg"));
  f.esg.exclusions.filter((x) => x.value != null).forEach((x) => add("ESG", `Exclusion · ${x.label}`, x.value ? "Oui, exclu" : "Non", "esg", "exclusion"));
  f.esg.pai.filter((x) => x.value != null).forEach((x) => add("ESG", `Incidence négative · ${x.label}`, x.value ? "Prise en compte" : "Non", "esg", "pai"));
  const reg = new Map(f.distribution.matrix.flatMap((m) => m.countries.map((c2) => [c2, m.share] as const)).reduce((acc, [c2, s]) => acc.set(c2, [...(acc.get(c2) ?? []), s]), new Map<string, string[]>()));
  [...new Set([...COUNTRIES, ...reg.keys()])].forEach((cty) => {
    const shares = reg.get(cty);
    add("Distribution", `Commercialisé en ${cty}`, shares ? `Oui · ${shares.length} part${shares.length > 1 ? "s" : ""} (${shares.map((s) => s.replace(f.name, "").trim() || s).join(", ")})` : "Non enregistré", "distribution", "pays", shares ? 1 : 0.8);
  });
  f.sections.forEach((sec) => sec.items.forEach((it) => add(sec.title, it.label, fieldValue(it), fieldId(sec.title, it.label), sec.title)));
  f.validations.filter((v) => v.value != null).forEach((v) => add("Contrôles", `Validation ${v.label}`, v.value ? "Validée" : "À valider", "caracteristiques", "circuit"));
  f.controls.forEach((ct) => add("Contrôles", ct.title, ct.details.join(" · "), "controles", "alerte anomalie"));
  return out;
}

export function shareEntries2(s: ShareDetail): FicheEntry[] {
  const out: FicheEntry[] = shareEntries(s, "synthese", false);
  const add = (group: string, label: string, value: string | null | undefined, anchor: string, extra = "") => value && out.push({ group, label, value, anchor, terms: `${label} ${extra}` });
  if (s.fund) add("Fonds", "Fonds", s.fund.name, "synthese");
  if (s.performance) for (const p of ["1M", "3M", "YTD", "1A", "3A", "origine"]) {
    const a = s.performance.fund[p];
    if (a != null) add("Performance", `Performance · ${p === "origine" ? "depuis l'origine" : PERIOD_LABEL[p] ?? p}`, pct(a), "perf", "perf");
  }
  if (s.var?.YTD?.delta != null) add("Encours", "Variation depuis le 1er janvier", `${eur(s.var.YTD.delta, { signed: true })} — collecte ${eur(s.var.YTD.flows, { signed: true })}`, "enc", "collecte");
  const active = new Set(s.registrations.filter((r) => r.active).map((r) => r.country));
  [...new Set([...COUNTRIES, ...s.registrations.map((r) => r.country)])].forEach((c) => {
    const r = s.registrations.find((x) => x.country === c);
    add("Distribution", `Commercialisée en ${c}`, active.has(c) ? `Oui${r?.date ? ` depuis le ${fdate(r.date)}` : ""}${r?.finma ? " · FINMA" : ""}` : r ? "Enregistrement inactif" : "Non enregistrée", "reg", "pays");
  });
  s.platforms.filter((p) => p.value != null).forEach((p) => add("Distribution", `Plateforme ${p.label}`, p.value ? "Référencée" : "Non", "reg", "plateforme"));
  s.sections.forEach((sec) => sec.items.forEach((it) => add(sec.title, it.label, fieldValue(it), fieldId(sec.title, it.label), sec.title)));
  return out;
}

/** Recherche tolérante (accents, fautes, préfixes, synonymes). */
export function searchFiche(entries: FicheEntry[], q: string, limit = 8): FicheEntry[] {
  const nq = norm(q);
  if (!nq) return [];
  const tokens = nq.split(" ").filter((t) => t.length > 0 && !["de", "du", "la", "le", "les", "des", "en", "a", "au", "quel", "quelle", "est", "l", "d"].includes(t));
  // Synonymes rattachés aux seuls mots qui les déclenchent
  const synFor = new Map<string, string[]>();
  for (const [re, add] of SYN) {
    const m = nq.match(re);
    if (!m) continue;
    const words = norm(add).split(" ").filter((w) => w.length >= 4);
    for (const t of norm(m[0]).split(" ")) if (t) synFor.set(t, [...(synFor.get(t) ?? []), ...words]);
  }
  const scored = entries.map((e) => {
    const words = norm(`${e.label} ${e.terms} ${e.group}`).split(" ").filter(Boolean);
    const valueWords = norm(e.value).split(" ").filter(Boolean);
    let score = 0, missing = 0;
    for (const t of tokens) {
      if (t.length === 1) {
        // Une lettre seule (ex. « part I ») ne compte que si elle correspond exactement à un mot du libellé
        if (words.includes(t)) score += 1.2;
        continue;
      }
      let best = 0;
      for (const w of words) best = Math.max(best, wordScore(t, w));
      for (const w of valueWords) best = Math.max(best, wordScore(t, w) * 0.7);
      if (best < 0.45) {
        let syn = 0;
        for (const x of synFor.get(t) ?? []) for (const w of words) syn = Math.max(syn, wordScore(x, w) * 0.8);
        best = Math.max(best, syn);
      }
      if (best < 0.4) missing++;
      score += best;
    }
    const real = tokens.filter((t) => t.length > 1).length;
    if (!real || missing > Math.max(0, real - 1 - (real > 2 ? 1 : 0))) return { e, s: 0 };
    if (missing) score *= 0.55;
    if (norm(e.label).startsWith(nq)) score += 0.6;
    return { e, s: (score / Math.max(1, real)) * (e.weight ?? 1) };
  }).filter((x) => x.s > 0.42);
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.e);
}
