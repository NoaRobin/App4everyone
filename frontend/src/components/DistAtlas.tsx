/**
 * Distribution — l'atlas des autorisations : navigation de rubrique, matrice clients × pays (la pièce maîtresse),
 * couverture (pays par client, clients par pays) et sélecteur de clientèle.
 *
 * Unité : une clientèle est le client nommé d'une part dédiée, à défaut son pool de clientèle (Investor_Type) ; un couple
 * client-pays existe dès qu'une part de la clientèle est autorisée dans le pays. Aucun encours n'est ventilé par pays ou par
 * client : les données ne le permettent pas.
 */
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import type React from "react";
import { Link } from "react-router-dom";
import { num, plural } from "../lib/format";
import { FAMILY_LABEL, FAMILY_ORDER, famVar } from "../lib/families";
import { gsap, onVisible } from "../lib/gsap";
import { prefersReducedMotion } from "../lib/motion";
import { norm } from "../lib/search";
import type { FamilyKey } from "../lib/types";
import { Flag } from "./Flag";
import { Head } from "./Editorial";
import * as I from "./Icon";
import { ExportButton } from "./ExportDialog";
import type { ExportCol } from "../lib/xlsx";

export type Clientele = {
  client: string; kind?: "nommé" | "pool"; n_shares: number; n_funds: number;
  families?: { family: string; n_shares: number }[];
  countries: { country: string; iso: string; n_shares: number; n_funds: number }[];
};
export type CountryLite = { country: string; iso: string; n_shares: number; n_funds: number };

/** Chiffres de couverture, partagés par la synthèse, la matrice et la couverture. */
export function coverage(clients: Clientele[]) {
  const named = clients.filter((c) => c.kind === "nommé");
  const base = named.length ? named : clients;
  const pairs = base.reduce((s, c) => s + c.countries.length, 0);
  return { named: named.length, pools: clients.length - named.length, pairs, mean: base.length ? pairs / base.length : 0, base };
}

// ------------------------------------------------------------------ navigation de rubrique
export type NavItem = { id: string; label: string };

/** Sommaire collant : la section lue est soulignée d'or ; un clic y mène. */
export function DistNav({ items }: { items: NavItem[] }) {
  const [cur, setCur] = useState(items[0]?.id);
  const bar = useRef<HTMLSpanElement>(null);
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (v) setCur(v.target.id);
    }, { rootMargin: "-30% 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  useEffect(() => {
    const a = nav.current?.querySelector<HTMLElement>(`a[data-id="${cur}"]`);
    if (!a || !bar.current) return;
    const props = { x: a.offsetLeft, width: a.offsetWidth };
    if (prefersReducedMotion()) gsap.set(bar.current, props);
    else gsap.to(bar.current, { ...props, duration: 0.42, ease: "rco" });
    a.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [cur]);
  return (
    <nav ref={nav} className="dnav" aria-label="Sommaire de la rubrique Distribution">
      <div className="dnav__in">
        {items.map((i, k) => (
          <a key={i.id} href={`#${i.id}`} data-id={i.id} className={`dnav__a${cur === i.id ? " is-cur" : ""}`} aria-current={cur === i.id ? "location" : undefined}
            onClick={(e) => { e.preventDefault(); document.getElementById(i.id)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }); }}>
            <span className="dnav__n num">{String(k + 1).padStart(2, "0")}</span>{i.label}
          </a>
        ))}
        <span ref={bar} className="dnav__bar" aria-hidden="true" />
      </div>
    </nav>
  );
}

// ------------------------------------------------------------------ matrice clients × pays
type Sort = "etendue" | "parts" | "nom";
type Pair = { client: string; kind: string; country: string; iso: string; n_shares: number; n_funds: number; c_countries: number; c_shares: number; c_funds: number };
const PAIR_COLS: ExportCol<Pair>[] = [
  { key: "client", label: "Clientèle", group: "Clientèle", desc: "Client nommé d'une part dédiée, à défaut le pool de clientèle (Investor_Type)" },
  { key: "kind", label: "Nature", group: "Clientèle", desc: "Client nommé ou pool de clientèle" },
  { key: "c_countries", label: "Pays de la clientèle", kind: "int", group: "Clientèle", desc: "Nombre de pays où la clientèle a au moins une part autorisée" },
  { key: "c_shares", label: "Parts de la clientèle", kind: "int", group: "Clientèle" },
  { key: "c_funds", label: "Fonds de la clientèle", kind: "int", group: "Clientèle" },
  { key: "country", label: "Pays d'enregistrement", group: "Autorisation" },
  { key: "iso", label: "Code pays", kind: "code", group: "Autorisation", desc: "Code ISO 3166 à deux lettres" },
  { key: "n_shares", label: "Parts autorisées dans le pays", kind: "int", sum: true, group: "Autorisation" },
  { key: "n_funds", label: "Fonds autorisés dans le pays", kind: "int", group: "Autorisation" },
];
type KindF = "nommé" | "pool" | "tous";

const MatrixRow = memo(function MatrixRow({ c, cols, hotCol, selected, dim, onEnter, onSelect, index, tab }: {
  c: Clientele; cols: CountryLite[]; hotCol: number; selected: boolean; dim: boolean; index: number; tab: number;
  onEnter: (row: string, col: number) => void; onSelect: (c: string) => void;
}) {
  const by = useMemo(() => new Map(c.countries.map((x) => [x.iso, x.n_shares])), [c.countries]);
  return (
    <div role="row" className={`mx__row${selected ? " is-sel" : ""}${dim ? " is-dim" : ""}`} onMouseEnter={() => onEnter(c.client, -1)}>
      <div role="rowheader" className="mx__rh">
        <button type="button" className="mx__name" onClick={() => onSelect(c.client)} aria-pressed={selected} title={c.client}>
          <i className={`mx__kind mx__kind--${c.kind === "nommé" ? "n" : "p"}`} aria-hidden="true" />
          <span className="mx__label">{c.client}</span>
        </button>
      </div>
      {cols.map((k, j) => {
        const v = by.get(k.iso) ?? 0;
        return (
          <div key={k.iso} role="gridcell" tabIndex={j === tab ? 0 : -1} data-r={index} data-c={j}
            className={`mx__cell${v ? " is-on" : ""}${v > 1 ? " is-many" : ""}${j === hotCol ? " is-col" : ""}`}
            onFocus={() => onEnter(c.client, j)} onClick={() => onSelect(c.client)}
            style={v ? { ["--v" as string]: Math.min(1, 0.45 + 0.2 * v), ["--d" as string]: Math.min(60, index + j) } : undefined}
            onMouseEnter={() => onEnter(c.client, j)}
            aria-label={v ? `${c.client} — ${k.country} : ${plural(v, "part autorisée", "parts autorisées")}` : `${c.client} — ${k.country} : non autorisé`}>
            <i aria-hidden="true">{v > 1 ? v : null}</i>
          </div>
        );
      })}
      <div role="gridcell" className="mx__tot num" aria-label={plural(c.countries.length, "pays")}>
        <span className="mx__tot-bar" style={{ width: `${Math.min(100, (c.countries.length / Math.max(1, cols.length)) * 100 * 3)}%` }} />
        {c.countries.length}
      </div>
    </div>
  );
});

export function MatrixSection({ clients, countries, selected, onSelect, withRmm }: {
  clients: Clientele[]; countries: CountryLite[]; selected: string | null; onSelect: (c: string | null) => void; withRmm: (u: string) => string;
}) {
  const [sort, setSort] = useState<Sort>("etendue");
  const [kind, setKind] = useState<KindF>(clients.some((c) => c.kind === "nommé") ? "nommé" : "tous");
  const [q, setQ] = useState("");
  const [col, setCol] = useState<string | null>(null);
  const [hot, setHot] = useState<{ row: string | null; col: number }>({ row: null, col: -1 });
  const grid = useRef<HTMLDivElement>(null);
  const searchId = useId();

  // colonnes : les pays, du plus grand nombre de clientèles au plus petit
  const cols = useMemo(() => {
    const n = new Map<string, number>();
    clients.forEach((c) => c.countries.forEach((x) => n.set(x.iso, (n.get(x.iso) ?? 0) + 1)));
    return [...countries].sort((a, b) => (n.get(b.iso) ?? 0) - (n.get(a.iso) ?? 0) || a.country.localeCompare(b.country, "fr"))
      .map((c) => ({ ...c, n_clients: n.get(c.iso) ?? 0 }));
  }, [clients, countries]);
  const rows = useMemo(() => {
    const qq = norm(q);
    const r = clients.filter((c) => (kind === "tous" || c.kind === kind) && (!qq || norm(c.client).includes(qq)) && (!col || c.countries.some((x) => x.iso === col)));
    const cmp: Record<Sort, (a: Clientele, b: Clientele) => number> = {
      etendue: (a, b) => b.countries.length - a.countries.length || b.n_shares - a.n_shares || a.client.localeCompare(b.client, "fr"),
      parts: (a, b) => b.n_shares - a.n_shares || a.client.localeCompare(b.client, "fr"),
      nom: (a, b) => a.client.localeCompare(b.client, "fr"),
    };
    return r.sort(cmp[sort]);
  }, [clients, kind, q, col, sort]);
  const cov = coverage(clients);
  const shownPairs = rows.reduce((s, c) => s + c.countries.length, 0);

  // Révélation : les cellules autorisées s'allument en diagonale (transition CSS, une seule fois)
  const [lit, setLit] = useState(false);
  useEffect(() => {
    const el = grid.current;
    if (!el || prefersReducedMotion()) { setLit(true); return; }
    return onVisible(el, () => setLit(true));
  }, []);

  // Clavier : une seule case dans l'ordre de tabulation, les flèches déplacent le focus (grille ARIA)
  const [cursor, setCursor] = useState<[number, number]>([0, 0]);
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.dataset.r === undefined) return;
    let [r, c] = [Number(t.dataset.r), Number(t.dataset.c)];
    if (e.key === "ArrowRight") c = Math.min(cols.length - 1, c + 1);
    else if (e.key === "ArrowLeft") c = Math.max(0, c - 1);
    else if (e.key === "ArrowDown") r = Math.min(rows.length - 1, r + 1);
    else if (e.key === "ArrowUp") r = Math.max(0, r - 1);
    else if (e.key === "Home") c = 0;
    else if (e.key === "End") c = cols.length - 1;
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(selected === rows[r]?.client ? null : rows[r]?.client ?? null); return; }
    else return;
    e.preventDefault();
    setCursor([r, c]);
    grid.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)?.focus();
  };

  const sel = selected ? clients.find((c) => c.client === selected) ?? null : null;
  const focus = sel ?? (hot.row ? clients.find((c) => c.client === hot.row) ?? null : null);
  const hotCountry = hot.col >= 0 ? cols[hot.col] : null;
  return (
    <section id="matrice" className="mx-sec reveal" aria-labelledby="h-matrice">
      <div className="dist__wrap">
        <Head id="matrice" eyebrow="La matrice des autorisations" title="Chaque clientèle, chaque pays"
          lede={<>Une ligne par clientèle, une colonne par pays d'enregistrement. Un carré d'or&nbsp;: au moins une part de la clientèle est autorisée dans le pays — plus il est plein, plus les parts sont nombreuses. Survolez pour croiser une ligne et une colonne, cliquez un client pour sa fiche, un pays pour ne garder que ses clientèles.</>} />
        <div className="mx__bar" role="toolbar" aria-label="Filtrer et trier la matrice">
          <label className="mx__search" htmlFor={searchId}>
            <I.Search size={16} />
            <input id={searchId} type="search" placeholder={`Rechercher parmi ${clients.length} clientèles`} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </label>
          <div className="seg" role="radiogroup" aria-label="Nature de la clientèle">
            {([["nommé", `Clients nommés · ${cov.named}`], ["pool", `Pools · ${cov.pools}`], ["tous", "Tous"]] as [KindF, string][]).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className="seg__b" onClick={() => setKind(k)}>{l}</button>
            ))}
          </div>
          <div className="seg" role="radiogroup" aria-label="Trier les clientèles">
            {([["etendue", "Étendue"], ["parts", "Parts"], ["nom", "A → Z"]] as [Sort, string][]).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={sort === k} className="seg__b" onClick={() => setSort(k)}>{l}</button>
            ))}
          </div>
          {col && <button type="button" className="chip is-on" onClick={() => setCol(null)}><Flag iso={col} /> {cols.find((c) => c.iso === col)?.country} <I.Close size={13} /></button>}
          <ExportButton id="clients-pays" title="Distribution — clientèles et pays" filename="distribution-clienteles-pays.xlsx" label="Exporter"
            rows={rows.flatMap((c) => c.countries.map((x) => ({ client: c.client, kind: c.kind === "nommé" ? "Client nommé" : "Pool de clientèle", country: x.country, iso: x.iso,
              n_shares: x.n_shares, n_funds: x.n_funds, c_countries: c.countries.length, c_shares: c.n_shares, c_funds: c.n_funds })))}
            columns={PAIR_COLS} shown={["client", "kind", "country", "iso", "n_shares", "n_funds"]} essential={["client", "country", "n_shares"]}
            context={[{ label: "Unité", value: "un couple clientèle-pays" }, ...(q ? [{ label: "Recherche", value: q }] : []), ...(col ? [{ label: "Pays", value: cols.find((x) => x.iso === col)?.country ?? col }] : []), { label: "Nature", value: kind === "tous" ? "toutes" : kind === "nommé" ? "clients nommés" : "pools" }]} />
          <span className="mx__count small muted num" aria-live="polite">{plural(rows.length, "clientèle")} · {plural(shownPairs, "couple client-pays", "couples client-pays")}</span>
        </div>
      </div>
      <div className="mx dist__wrap">
        <div className="mx__frame">
          <div className="mx__legend small" aria-hidden="true">
            <span><i className="mx__lg mx__lg--off" /> non autorisé</span>
            <span><i className="mx__lg" style={{ ["--v" as string]: 0.65 }} /> une part autorisée</span>
            <span><i className="mx__lg mx__lg--many" style={{ ["--v" as string]: 1 }}>3</i> plusieurs parts (nombre inscrit)</span>
            <span><i className="mx__kind mx__kind--n" /> client nommé</span>
            <span><i className="mx__kind mx__kind--p" /> pool de clientèle</span>
            <span className="mx__kbd">Clavier&nbsp;: flèches pour parcourir, Entrée pour ouvrir la fiche</span>
          </div>
          <div ref={grid} className={`mx__grid${lit ? " is-lit" : ""}`} role="grid" aria-label="Autorisations par clientèle et par pays" aria-rowcount={rows.length + 1}
            style={{ ["--cols" as string]: cols.length }} onMouseLeave={() => setHot({ row: null, col: -1 })} onKeyDown={onKey}>
            <div role="row" className="mx__head">
              <div role="columnheader" className="mx__corner small muted">Clientèle <span aria-hidden="true">\</span> pays</div>
              {cols.map((k, j) => (
                <div key={k.iso} role="columnheader" className={`mx__ch${j === hot.col ? " is-col" : ""}${col === k.iso ? " is-on" : ""}`}>
                  <button type="button" onClick={() => setCol(col === k.iso ? null : k.iso)} onMouseEnter={() => setHot({ row: null, col: j })}
                    aria-pressed={col === k.iso} title={`${k.country} : ${plural(k.n_clients, "clientèle")} — cliquer pour filtrer`}>
                    <Flag iso={k.iso} title={k.country} />
                    <span className="mx__iso mono">{k.iso}</span>
                    <span className="mx__nc num">{k.n_clients}</span>
                  </button>
                </div>
              ))}
              <div role="columnheader" className="mx__ch mx__ch--tot small muted">Pays</div>
            </div>
            {rows.map((c, i) => (
              <MatrixRow key={c.client} index={i} tab={cursor[0] === i ? cursor[1] : -1} c={c} cols={cols} hotCol={hot.row === c.client || hot.row === null ? hot.col : -1}
                selected={selected === c.client} dim={!!sel && selected !== c.client}
                onEnter={(row, j) => setHot({ row, col: j })} onSelect={(x) => onSelect(selected === x ? null : x)} />
            ))}
            {!rows.length && (
              <div className="mx__empty">
                <p className="small muted">Aucune clientèle {q ? <>ne contient « {q} »</> : "ne correspond"}{col ? <> parmi celles autorisées en {cols.find((x) => x.iso === col)?.country}</> : null}{kind !== "tous" ? <> ({kind === "nommé" ? "clients nommés" : "pools"})</> : null}.</p>
                <div className="mx__empty-a">
                  {q && <button type="button" className="chip" onClick={() => setQ("")}>Effacer la recherche</button>}
                  {col && <button type="button" className="chip" onClick={() => setCol(null)}>Tous les pays</button>}
                  {kind !== "tous" && <button type="button" className="chip" onClick={() => setKind("tous")}>Toutes les natures</button>}
                </div>
              </div>
            )}
          </div>
        </div>
        <ClientCard c={focus} pinned={!!sel} hotCountry={hotCountry} onClose={() => onSelect(null)} withRmm={withRmm} />
      </div>
    </section>
  );
}

/** Fiche latérale : la clientèle sélectionnée (ou survolée), ses pays et ses familles de gestion. */
function ClientCard({ c, pinned, hotCountry, onClose, withRmm }: {
  c: Clientele | null; pinned: boolean; hotCountry: (CountryLite & { n_clients: number }) | null; onClose: () => void; withRmm: (u: string) => string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!ref.current || prefersReducedMotion() || !c) return;
    gsap.fromTo(ref.current.querySelectorAll(".cc__anim"), { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.42, stagger: 0.035, clearProps: "opacity,transform" });
  }, [c?.client]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c) {
    return (
      <aside ref={ref} className="cc cc--idle" aria-live="polite">
        <div className="eyebrow">Fiche clientèle</div>
        {hotCountry ? (
          <>
            <div className="cc__title"><Flag iso={hotCountry.iso} /> {hotCountry.country}</div>
            <dl className="cc__kv"><div><dt>Clientèles</dt><dd className="num">{hotCountry.n_clients}</dd></div><div><dt>Fonds</dt><dd className="num">{hotCountry.n_funds}</dd></div><div><dt>Parts</dt><dd className="num">{hotCountry.n_shares}</dd></div></dl>
          </>
        ) : <p className="small muted">Survolez une ligne pour lire la clientèle, cliquez pour la garder à l'écran.</p>}
      </aside>
    );
  }
  const fams = (c.families ?? []).filter((f) => f.n_shares > 0).sort((a, b) => FAMILY_ORDER.indexOf(a.family as FamilyKey) - FAMILY_ORDER.indexOf(b.family as FamilyKey));
  return (
    <aside ref={ref} className={`cc${pinned ? " is-pinned" : ""}`} aria-live="polite" aria-label={`Fiche de la clientèle ${c.client}`}>
      <div className="cc__top cc__anim">
        <span className="eyebrow">{c.kind === "nommé" ? "Client nommé · part dédiée" : "Pool de clientèle"}</span>
        {pinned && <button type="button" className="cc__close" onClick={onClose} aria-label="Fermer la fiche"><I.Close size={15} /></button>}
      </div>
      <h3 className="cc__title cc__anim">{c.client}</h3>
      <dl className="cc__kv cc__anim">
        <div><dt>Pays</dt><dd className="num">{c.countries.length}</dd></div>
        <div><dt>Fonds</dt><dd className="num">{c.n_funds}</dd></div>
        <div><dt>Parts</dt><dd className="num">{c.n_shares}</dd></div>
      </dl>
      {fams.length > 0 && (
        <div className="cc__fam cc__anim">
          <div className="cc__fam-bar" role="img" aria-label={fams.map((f) => `${FAMILY_LABEL[f.family as FamilyKey] ?? f.family} : ${f.n_shares}`).join(", ")}>
            {fams.map((f) => <i key={f.family} style={{ flexGrow: f.n_shares, background: famVar(f.family, true) }} />)}
          </div>
          <ul className="cc__fam-l small">{fams.map((f) => <li key={f.family}><i style={{ background: famVar(f.family, true) }} />{FAMILY_LABEL[f.family as FamilyKey] ?? "Non classé"} <span className="num muted">{f.n_shares}</span></li>)}</ul>
        </div>
      )}
      <ol className="cc__list cc__anim">
        {c.countries.map((x) => (
          <li key={x.iso} className={hotCountry?.iso === x.iso ? "is-hot" : ""}>
            <Link to={withRmm(`/distribution/${encodeURIComponent(x.country)}`)}><Flag iso={x.iso} /><span>{x.country}</span><span className="num muted">{plural(x.n_shares, "part")}</span><I.Arrow size={13} /></Link>
          </li>
        ))}
      </ol>
    </aside>
  );
}

// ------------------------------------------------------------------ couverture
export function CoverageSection({ clients, countries, withRmm }: { clients: Clientele[]; countries: CountryLite[]; withRmm: (u: string) => string }) {
  const cov = coverage(clients);
  const hist = useMemo(() => {
    const h = new Map<number, number>();
    cov.base.forEach((c) => { const k = Math.min(6, c.countries.length); h.set(k, (h.get(k) ?? 0) + 1); });
    const max = Math.max(...cov.base.map((c) => c.countries.length), 1);
    return Array.from({ length: Math.min(6, max) }, (_, i) => ({ k: i + 1, n: h.get(i + 1) ?? 0, plus: i + 1 === 6 && max > 6 }));
  }, [cov.base]);
  const hmax = Math.max(1, ...hist.map((h) => h.n));
  const per = useMemo(() => {
    const n = new Map<string, number>();
    cov.base.forEach((c) => c.countries.forEach((x) => n.set(x.iso, (n.get(x.iso) ?? 0) + 1)));
    return countries.map((c) => ({ ...c, n_clients: n.get(c.iso) ?? 0 })).sort((a, b) => b.n_clients - a.n_clients || b.n_shares - a.n_shares);
  }, [cov.base, countries]);
  const pmax = Math.max(1, ...per.map((p) => p.n_clients));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || prefersReducedMotion()) return;
    const bars = el.querySelectorAll<HTMLElement>(".cov__col i, .cov__row i");
    gsap.set(bars, { scaleY: 0 });
    const stop = onVisible(el, () => gsap.to(bars, { scaleY: 1, duration: 0.9, stagger: 0.03, ease: "rco", clearProps: "transform" }));
    return () => { stop(); gsap.set(bars, { clearProps: "transform" }); };
  }, []);
  const meanPos = (cov.mean - 0.5) / hist.length;
  const who = cov.named ? "clients nommés" : "clientèles";
  return (
    <section id="couverture" className="section page reveal" aria-labelledby="h-couverture">
      <Head id="couverture" eyebrow="Couverture" title="Combien de pays, pour qui"
        lede={<>À gauche, la répartition des {who} selon leur nombre de pays d'autorisation ; à droite, combien de {who} chaque pays accueille. Moyenne&nbsp;: <b className="num">{num(cov.mean, 1)}</b> pays par client, {num(cov.pairs)} couples client-pays.</>} />
      <div ref={box} className="cov">
        <figure className="cov__card">
          <figcaption className="eyebrow">Pays par client</figcaption>
          <div className="cov__hist" role="img" aria-label={hist.map((h) => `${h.k}${h.plus ? " et plus" : ""} pays : ${h.n} ${who}`).join(" ; ")}>
            {hist.map((h) => (
              <div key={h.k} className="cov__col">
                <span className="cov__v num">{h.n}</span>
                <i style={{ height: `${(h.n / hmax) * 100}%` }} />
                <span className="cov__k num">{h.k}{h.plus ? "+" : ""}</span>
              </div>
            ))}
            <span className="cov__mean" style={{ left: `${meanPos * 100}%` }}><span className="small num">moyenne {num(cov.mean, 1)}</span></span>
          </div>
          <div className="small muted cov__axis">nombre de pays d'autorisation</div>
        </figure>
        <figure className="cov__card cov__card--wide">
          <figcaption className="eyebrow">{cov.named ? "Clients nommés" : "Clientèles"} par pays</figcaption>
          <ol className="cov__rows">
            {per.map((p) => (
              <li key={p.iso} className="cov__row">
                <Link to={withRmm(`/distribution/${encodeURIComponent(p.country)}`)}>
                  <Flag iso={p.iso} /><span className="cov__c">{p.country}</span>
                  <span className="cov__track"><i style={{ width: `${(p.n_clients / pmax) * 100}%` }} /></span>
                  <span className="num cov__n">{p.n_clients}</span><span className="num muted small cov__s">{plural(p.n_shares, "part")}</span>
                </Link>
              </li>
            ))}
          </ol>
        </figure>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ sélecteur de clientèle (globe)
export function ClientPicker({ clients, value, onChange }: { clients: Clientele[]; value: string | null; onChange: (c: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [act, setAct] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const items = useMemo(() => {
    const qq = norm(q);
    const pools = clients.filter((c) => c.kind !== "nommé"), named = clients.filter((c) => c.kind === "nommé");
    return [...pools, ...named].filter((c) => !qq || norm(c.client).includes(qq)).slice(0, 60);
  }, [clients, q]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const pick = (c: string | null) => { onChange(c); setOpen(false); setQ(""); };
  return (
    <div ref={box} className={`cpk${open ? " is-open" : ""}`}>
      <div className="cpk__field">
        <I.Search size={16} />
        <input role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-label="Filtrer le globe par clientèle"
          aria-activedescendant={open && items[act] ? `${listId}-${act}` : undefined}
          placeholder={value ?? `Toutes les clientèles (${clients.length})`} value={q}
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); setAct(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAct((a) => Math.min(items.length - 1, a + 1)); setOpen(true); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter" && items[act]) { e.preventDefault(); pick(items[act].client); }
            else if (e.key === "Escape") setOpen(false);
          }} />
        {value && <button type="button" className="cpk__clear" onClick={() => pick(null)} aria-label="Toutes les clientèles"><I.Close size={14} /></button>}
      </div>
      {open && (
        <ul id={listId} role="listbox" className="cpk__list" aria-label="Clientèles">
          {items.map((c, i) => (
            <li key={c.client} id={`${listId}-${i}`} role="option" aria-selected={value === c.client} className={i === act ? "is-act" : ""}
              onMouseEnter={() => setAct(i)} onMouseDown={(e) => { e.preventDefault(); pick(c.client); }}>
              <i className={`mx__kind mx__kind--${c.kind === "nommé" ? "n" : "p"}`} aria-hidden="true" />
              <span>{c.client}</span><span className="num muted small">{plural(c.countries.length, "pays")}</span>
            </li>
          ))}
          {!items.length && <li className="small muted cpk__none">Aucune clientèle</li>}
        </ul>
      )}
    </div>
  );
}
