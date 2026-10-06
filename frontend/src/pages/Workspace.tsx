import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, plural } from "../lib/format";
import { FAMILY_LABEL, FAMILY_ORDER, famVar } from "../lib/families";
import { norm } from "../lib/search";
import { clearRecents, togglePin, usePins, useRecents, type DeskItem } from "../lib/desk";
import type { Control, FamilyKey, FundRow, Overview } from "../lib/types";
import { SearchResults, useResultNav } from "../components/SearchResults";
import { Delta, MoreRows, useProgressive, useReveal } from "../components/ui";
import * as I from "../components/Icon";

/** Espace métiers : trouver une information le plus vite possible. */
export default function Workspace() {
  const { api, asOf } = useApp();
  const ov = useApi<Overview>(api("/api/overview"));
  const funds = useApi<{ funds: FundRow[] }>(api("/api/funds"));
  const ctl = useApi<{ controls: Control[] }>(api("/api/controls"));
  useReveal(funds.data && ov.data ? 1 : null);
  return (
    <div className="desk">
      <DeskSearch ov={ov.data} asOf={asOf} />
      <div className="page desk__page">
        <Bureau />
        <Questions />
        {funds.data && <Directory funds={funds.data.funds} />}
        {ctl.data && <Watch controls={ctl.data.controls} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ recherche
function DeskSearch({ ov, asOf }: { ov: Overview | null; asOf: string | null }) {
  const { index, entries } = useApp();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const dq = useDeferredValue(q);
  const results = useMemo(() => (index && dq.trim() ? index.search(dq) : null), [index, dq]);
  const { active, setActive, onKeyDown, flat } = useResultNav(results, () => undefined);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  // « / » place le curseur dans cette recherche tant qu'elle est à l'écran
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t?.tagName ?? "") || t?.isContentEditable) return;
      const r = input.current?.getBoundingClientRect();
      if (!r || r.bottom < 60 || r.top > window.innerHeight) return;
      e.preventDefault();
      e.stopPropagation();
      input.current?.focus();
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, []);
  // Suggestions tirées des données (jamais écrites en dur) : un fonds, un ISIN, un gérant, un pays
  const ideas = useMemo(() => {
    const top = entries.filter((e) => e.t === "fonds" && (e.aum ?? 0) > 0).sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0))[0];
    const part = entries.find((e) => e.t === "part" && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(e.sub?.split(" · ")[0] ?? ""));
    const mgr = entries.find((e) => e.t === "gérant");
    const cty = entries.find((e) => e.t === "pays" && e.label !== "France");
    return [
      top && { q: `cut-off ${top.label}`, l: `Cut-off ${top.label}` },
      part && { q: part.sub!.split(" · ")[0], l: part.sub!.split(" · ")[0] },
      mgr && { q: mgr.label, l: mgr.label },
      { q: "article 9", l: "Fonds article 9" },
      cty && { q: `commercialisé ${cty.label}`, l: `Commercialisés en ${cty.label}` },
    ].filter(Boolean) as { q: string; l: string }[];
  }, [entries]);
  return (
    <header className="desk__hero">
      <div className="desk__hero-in">
        <div className="desk__intro">
          <div className="eyebrow">Espace métiers{asOf && <> · données au {fdate(asOf)}</>}</div>
          <h1 className="desk__title hero-title">Que cherchez-vous&nbsp;?</h1>
          <div className={`desk__bar${results ? " is-open" : ""}`}>
            <I.Search size={22} />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { onKeyDown(e); if (e.key === "Escape") setQ(""); }}
              placeholder="Un fonds, une part, un ISIN, un gérant, un pays…" aria-label="Rechercher un fonds, une part, un ISIN, un gérant, une gamme ou un pays"
              role="combobox" aria-expanded={!!results} aria-controls="desk-list" aria-activedescendant={flat.length ? `desk-${active}` : undefined}
              autoComplete="off" spellCheck={false} />
            {q ? <button type="button" className="kbd__clear" onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Effacer"><I.Close size={18} /></button>
              : <kbd className="desk__kbd" aria-hidden="true">/</kbd>}
            {results && <div className="desk__results"><SearchResults results={results} active={active} setActive={setActive} onGo={() => undefined} night idPrefix="desk" /></div>}
          </div>
          <div className="desk__ideas" aria-label="Exemples de recherche">
            <span className="small muted">Essayez</span>
            {ideas.map((x) => <button key={x.q} type="button" className="chip" onClick={() => { setQ(x.q); input.current?.focus(); }}>{x.l}</button>)}
          </div>
        </div>
        {ov && (
          <dl className="desk__kpis">
            <Link to="/encours" className="desk__kpi"><dt>Encours sous gestion</dt><dd className="num">{eur(ov.aum)}</dd><span className="small"><Delta v={ov.var.YTD?.pct} /> depuis le 1er janvier</span></Link>
            <Link to="/encours" className="desk__kpi"><dt>Collecte nette estimée YTD</dt><dd className="num">{eur(ov.var.YTD?.flows, { signed: true })}</dd><span className="small muted">Effet marché {eur(ov.var.YTD?.market, { signed: true })}</span></Link>
            <Link to="/selection" className="desk__kpi"><dt>Fonds ouverts</dt><dd className="num">{ov.n_funds}</dd><span className="small muted">{plural(ov.n_parts, "part")} investies</span></Link>
          </dl>
        )}
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ bureau
function Bureau() {
  const pins = usePins();
  const recents = useRecents();
  const href = (d: DeskItem) => (d.kind === "fonds" ? `/fonds/${encodeURIComponent(d.id)}` : `/parts/${encodeURIComponent(d.id)}`);
  const Item = ({ d, pinned }: { d: DeskItem; pinned?: boolean }) => (
    <li className="desk__item">
      <Link to={href(d)} className="desk__item-a">
        <span className="dot" style={{ background: famVar(d.family, true) }} />
        <span className="desk__item-t"><span className="desk__item-n">{d.label}</span>{d.sub && <span className="desk__item-s small">{d.sub}</span>}</span>
        <span className="desk__item-k small">{d.kind === "fonds" ? "Fonds" : "Part"}</span>
      </Link>
      {pinned && <button type="button" className="desk__unpin" onClick={() => togglePin(d)} aria-label={`Retirer ${d.label} des épinglés`}><I.Close size={14} /></button>}
    </li>
  );
  return (
    <section className="section reveal desk__bureau" aria-labelledby="h-bureau">
      <div className="section__head"><div><div className="eyebrow">Votre bureau</div><h2 className="h2" id="h-bureau">Vos fiches</h2></div>
        <span className="small muted">Mémorisées sur ce poste uniquement</span></div>
      <div className="grid grid-2">
        <div className="card card--flat">
          <h3 className="h3 desk__sub"><I.Star size={15} filled /> Épinglées</h3>
          {pins.length ? <ul className="desk__list">{pins.map((d) => <Item key={d.kind + d.id} d={d} pinned />)}</ul>
            : <p className="small muted desk__empty">Épinglez les fonds et les parts que vous suivez avec le bouton «&nbsp;Épingler&nbsp;» en haut de leur fiche&nbsp;: ils vous attendront ici.</p>}
        </div>
        <div className="card card--flat">
          <div className="spread"><h3 className="h3 desk__sub"><I.Calendar size={15} /> Consultées récemment</h3>
            {recents.length > 0 && <button type="button" className="link small" onClick={clearRecents}>Effacer</button>}</div>
          {recents.length ? <ul className="desk__list">{recents.map((d) => <Item key={d.kind + d.id} d={d} />)}</ul>
            : <p className="small muted desk__empty">Les dernières fiches ouvertes apparaîtront ici.</p>}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ questions
const QUESTIONS: { theme: string; items: { to: string; q: string }[] }[] = [
  { theme: "Caractéristiques", items: [
    { to: "/fonds", q: "Retrouver la fiche d'un fonds ou d'une part" },
    { to: "/comparateur", q: "Comparer les performances de plusieurs fonds" },
    { to: "/selection?sfdr=Article%209", q: "Quels fonds sont classés article 9 ?" },
  ] },
  { theme: "Encours & collecte", items: [
    { to: "/encours", q: "Encours par famille, gamme, classe d'actifs" },
    { to: "/encours?axe=manager", q: "Encours gérés par chaque gérant" },
    { to: "/encours?axe=sfdr", q: "Encours par classification SFDR" },
  ] },
  { theme: "Revenus & passif", items: [
    { to: "/", q: "Quels fonds rapportent le plus ?" },
    { to: "/passif", q: "Qui détient nos fonds (teneurs, types de comptes) ?" },
    { to: "/passif#h-transactions", q: "Souscriptions et rachats des derniers jours" },
  ] },
  { theme: "Distribution", items: [
    { to: "/distribution", q: "Où un fonds est-il commercialisé ?" },
    { to: "/distribution", q: "Quelles parts sont autorisées dans un pays ?" },
    { to: "/portefeuilles", q: "Quels fonds détiennent cette ligne ?" },
  ] },
  { theme: "Risques & contrôles", items: [
    { to: "/fonds#risques", q: "Carte risque / rendement des fonds" },
    { to: "/fonds#risques", q: "Quels fonds ont changé de SRI ?" },
    { to: "/fonds?vue=controles#risques", q: "Qu'est-ce qui n'est pas en ordre ?" },
  ] },
];

function Questions() {
  return (
    <section className="section reveal" aria-labelledby="h-q">
      <div className="section__head"><div><div className="eyebrow">Accès directs</div><h2 className="h2" id="h-q">Les questions de tous les jours</h2></div></div>
      <div className="desk__q">
        {QUESTIONS.map((g) => (
          <div key={g.theme} className="desk__q-col">
            <h3 className="desk__q-t">{g.theme}</h3>
            <ul>{g.items.map((x) => <li key={x.q}><Link to={x.to} className="desk__q-a"><span>{x.q}</span><I.Arrow size={15} /></Link></li>)}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ répertoire
function Directory({ funds }: { funds: FundRow[] }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [fam, setFam] = useState<FamilyKey | null>(null);
  const live = funds.filter((f) => (f.aum ?? 0) > 0);
  // Si la plupart des noms partagent un même premier mot (un préfixe de marque), l'index alphabétique l'ignore
  const prefix = useMemo(() => {
    const c = new Map<string, number>();
    live.forEach((f) => { const w = f.name.split(/\s+/)[0]; c.set(w, (c.get(w) ?? 0) + 1); });
    const [w, n] = [...c.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    return n > live.length * 0.3 && n > 2 ? w : "";
  }, [live]);
  const key = (name: string) => norm(prefix && name.startsWith(prefix + " ") ? name.slice(prefix.length + 1) : name);
  const nq = norm(q);
  const rows = live
    .filter((f) => (!fam || f.family === fam) && (!nq || norm([f.name, f.manager, f.range, f.asset_class, f.sfdr].filter(Boolean).join(" ")).includes(nq)))
    .sort((a, b) => key(a.name).localeCompare(key(b.name), "fr"));
  const letterOf = (f: FundRow) => (key(f.name)[0] ?? "#").toUpperCase();
  const present = new Set(rows.map(letterOf));
  // Affichage progressif : les premières lignes tout de suite, la suite à la demande (ou en sautant à une lettre)
  const page = useProgressive(80);
  const groups = new Map<string, FundRow[]>();
  rows.slice(0, page.limit).forEach((f) => { const l = letterOf(f); groups.set(l, [...(groups.get(l) ?? []), f]); });
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const [pending, setPending] = useState<string | null>(null);
  const scrollTo = (l: string) => document.getElementById(`rep-${l}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  const jump = (l: string) => { if (groups.has(l)) scrollTo(l); else { page.all(); setPending(l); } };
  useEffect(() => { if (pending && groups.has(pending)) { scrollTo(pending); setPending(null); } });
  return (
    <section className="section reveal" id="repertoire" aria-labelledby="h-rep">
      <div className="section__head">
        <div><div className="eyebrow">Le répertoire</div><h2 className="h2" id="h-rep">Tous les fonds, de A à Z</h2></div>
        <Link to="/selection" className="arrow-link">Filtres avancés et export <I.Arrow size={16} /></Link>
      </div>
      <div className="rep__tools">
        <label className="rep__filter">
          <I.Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer : nom, gérant, gamme, SFDR…" aria-label="Filtrer le répertoire" />
        </label>
        <div className="rep__fams" role="group" aria-label="Famille de gestion">
          <button type="button" className="chip" aria-pressed={!fam} onClick={() => setFam(null)}>Toutes</button>
          {FAMILY_ORDER.map((k) => <button key={k} type="button" className="chip" aria-pressed={fam === k} onClick={() => setFam(fam === k ? null : k)}><span className="dot" style={{ background: famVar(k, true) }} />{FAMILY_LABEL[k]}</button>)}
        </div>
      </div>
      <nav className="rep__az" aria-label="Aller à la lettre">
        {letters.map((l) => <button key={l} type="button" disabled={!present.has(l)} onClick={() => jump(l)}>{l}</button>)}
      </nav>
      <div className="table-wrap">
        <table className="t rep">
          <caption className="sr-only">Répertoire des fonds ouverts, par ordre alphabétique{prefix && ` (hors préfixe « ${prefix} »)`}</caption>
          <thead><tr><th scope="col">Fonds</th><th scope="col">Famille</th><th scope="col">Gérant</th><th scope="col">SFDR</th><th scope="col" className="n">SRI</th><th scope="col" className="n">Parts</th><th scope="col" className="n">Encours</th><th scope="col" className="n">YTD</th></tr></thead>
          {[...groups.entries()].map(([l, list]) => (
            <tbody key={l} id={`rep-${l}`}>
              <tr className="rep__letter"><th colSpan={8} scope="rowgroup">{l}</th></tr>
              {list.map((f) => (
                <tr key={f.id} className="clickable" onClick={() => nav(`/fonds/${encodeURIComponent(f.id)}`)}>
                  <td><Link className="rowlink" to={`/fonds/${encodeURIComponent(f.id)}`} onClick={(e) => e.stopPropagation()}>{f.name}</Link></td>
                  <td className="small"><span className="dot" style={{ background: famVar(f.family, true) }} /> {FAMILY_LABEL[f.family]}</td>
                  <td className="small">{f.manager ?? "—"}</td>
                  <td className="small">{f.sfdr?.replace("Article ", "Art. ") ?? "—"}</td>
                  <td className="n">{f.sri ?? "—"}</td>
                  <td className="n">{f.n_parts ?? "—"}</td>
                  <td className="n">{eur(f.aum)}</td>
                  <td className="n"><Delta v={f.var_YTD} /></td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        {!rows.length && <div className="empty small">Aucun fonds ne correspond à « {q} ». La recherche en haut de page tolère les fautes de frappe.</div>}
      </div>
      <MoreRows shown={Math.min(page.limit, rows.length)} total={rows.length} step={page.step} onMore={page.more} onAll={page.all} what="fonds affichés" />
    </section>
  );
}

// ------------------------------------------------------------------ à surveiller
function Watch({ controls }: { controls: Control[] }) {
  const list = controls.filter((c) => c.count > 0).slice(0, 6);
  if (!list.length) return null;
  const sev = { serious: "À traiter", warning: "À vérifier", info: "Information" } as const;
  return (
    <section className="section reveal" aria-labelledby="h-watch">
      <div className="section__head"><div><div className="eyebrow">Contrôles automatiques</div><h2 className="h2" id="h-watch">À surveiller</h2></div>
        <Link to="/fonds?vue=controles#risques" className="arrow-link">Tous les contrôles <I.Arrow size={16} /></Link></div>
      <div className="desk__watch">
        {list.map((c) => (
          <Link key={c.key} to={`/fonds?vue=controles#ctl-${c.key}`} className={`desk__w desk__w--${c.severity}`}>
            <span className="desk__w-n num">{c.count}</span>
            <span className="desk__w-t">{c.title}</span>
            <span className="desk__w-s small">{sev[c.severity]} · {c.audience}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
