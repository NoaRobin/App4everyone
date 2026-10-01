import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, eurParts, num, pctRaw, plural } from "../lib/format";
import { CATEGORICAL, OTHER } from "../lib/families";
import { norm } from "../lib/search";
import { ErrorState, Loading, useReveal } from "../components/ui";
import { Mosaic } from "../components/viz";
import { Head, PageHero } from "../components/Editorial";
import { prefersReducedMotion } from "../lib/motion";
import { gsap, ScrollTrigger } from "../lib/gsap";
import * as I from "../components/Icon";

type Resp = {
  date: string; total_eur: number; n_funds: number; n_instruments: number; dates: string[];
  instruments: { key: string; name: string; isin: string | null; asset_class: string | null; ccy: string | null; amount_eur: number | null; n_funds: number }[];
  most_shared: { key: string; name: string; n_funds: number; amount_eur: number | null }[];
  by_class: { label: string; amount_eur: number | null; weight: number | null }[]; by_ccy: { label: string; amount_eur: number | null; weight: number | null }[];
};

/** Regroupe au-delà des 5 premiers (palette catégorielle limitée, jamais recyclée). */
type Part = { label: string; amount_eur: number | null; weight: number | null };
function top5(rows: Part[]): Part[] {
  const s = [...rows].sort((a, b) => (b.amount_eur ?? -Infinity) - (a.amount_eur ?? -Infinity));
  if (s.length <= 6) return s;
  const rest = s.slice(5);
  // Un montant indisponible dans le reste rend le total « Autres » indisponible (pas de somme partielle présentée comme totale)
  const sum = (k: "amount_eur" | "weight") => (rest.some((r) => r[k] == null) ? null : rest.reduce((x, r) => x + (r[k] as number), 0));
  return [...s.slice(0, 5), { label: `Autres (${rest.length})`, amount_eur: sum("amount_eur"), weight: sum("weight") }];
}

export default function Holdings() {
  const { api, entries } = useApp();
  const { data, error } = useApi<Resp>(api("/api/holdings"));
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  useReveal(data);
  // Libellés et codes normalisés une fois (des dizaines de milliers de lignes possibles), pas à chaque frappe
  const lines = useMemo(() => entries.filter((e) => e.t === "ligne")
    .map((l) => ({ l, label: norm(l.label), codes: l.terms.map((t) => norm(t).replace(/\s/g, "")) })), [entries]);
  const found = useMemo(() => {
    const n = norm(q);
    if (n.length < 2) return [];
    const c = n.replace(/\s/g, "");
    const out = [];
    for (const x of lines) {
      if (x.label.includes(n) || x.codes.some((t) => t.includes(c))) out.push(x.l);
      if (out.length >= 10) break;
    }
    return out;
  }, [q, lines]);
  // Couleur d'une classe d'actifs : fixée par son rang dans l'inventaire de la maison
  const classColor = useMemo(() => {
    const order = [...(data?.by_class ?? [])].sort((a, b) => (b.amount_eur ?? -Infinity) - (a.amount_eur ?? -Infinity)).map((c) => c.label);
    return (label: string | null | undefined) => { const i = order.indexOf(label ?? ""); return i >= 0 && i < CATEGORICAL.length ? CATEGORICAL[i] : OTHER; };
  }, [data]);
  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><Loading h={520} /></div>;
  const tp = eurParts(data.total_eur);
  const top40 = data.instruments.slice(0, 40);
  const mosaicLines = top40.filter((x) => x.amount_eur != null && x.amount_eur > 0);
  const noAmount = top40.length - mosaicLines.length;
  const classes = top5(data.by_class);
  const ccys = top5(data.by_ccy);
  const maxShared = Math.max(1, ...data.most_shared.map((x) => x.n_funds));
  const go = (key: string) => nav(`/portefeuilles/ligne?key=${encodeURIComponent(key)}`);
  return (
    <div className="hold">
      <PageHero
        eyebrow={<>Portefeuilles · derniers inventaires{data.dates[0] ? ` au ${fdate(data.dates[0])}` : ""}</>}
        title="Ce que nous détenons"
        lede="Toutes les lignes des derniers inventaires, fonds par fonds. Cherchez un émetteur ou un ISIN pour savoir quels fonds le détiennent, et pour quel poids."
        figures={[
          { label: "Actifs inventoriés", value: tp.value, unit: tp.unit, aria: eur(data.total_eur) },
          { label: "Lignes distinctes", value: num(data.n_instruments) },
          { label: "Fonds inventoriés", value: String(data.n_funds) },
          { label: "Classes d'actifs", value: String(data.by_class.length) },
        ]}
      />
      <div className="page hold__page">
        <section className="section hold__ask" aria-labelledby="h-ask">
          <Head id="ask" eyebrow="La question" title="Quels fonds détiennent… ?" />
          <div className={`desk__bar${found.length ? " is-open" : ""}`}>
            <I.Search size={22} />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && found[0]) go(found[0].id); if (e.key === "Escape") setQ(""); }}
              placeholder="Nom d'émetteur, ISIN…" aria-label="Rechercher une ligne en portefeuille" autoComplete="off" spellCheck={false} />
            {q && <button type="button" className="kbd__clear" onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Effacer"><I.Close size={18} /></button>}
            {found.length > 0 && (
              <ul className="desk__results hold__res" role="list">
                {found.map((l) => (
                  <li key={l.id}><button type="button" onClick={() => go(l.id)}>
                    <span className="hold__res-n">{l.label}</span><span className="small muted">{l.sub}</span><span className="num">{eur(l.aum)}</span><I.Arrow size={15} />
                  </button></li>
                ))}
              </ul>
            )}
          </div>
          {q.length >= 2 && !found.length && <p className="small muted" style={{ marginTop: 10 }}>Aucune ligne ne correspond à « {q} ».</p>}
          <div className="desk__ideas">
            <span className="small muted">Les plus partagées</span>
            {data.most_shared.slice(0, 4).map((x) => <button key={x.key} type="button" className="chip" onClick={() => go(x.key)}>{x.name}</button>)}
          </div>
        </section>

        <section className="section reveal" aria-labelledby="h-ana">
          <Head id="ana" eyebrow="L'anatomie" title="De quoi sont faits nos portefeuilles"
            lede="Montants cumulés de tous les derniers inventaires, en euros. Survolez un segment pour son montant ; au-delà de cinq catégories, le reste est regroupé." />
          <div className="rings">
            <Ring title="Par classe d'actifs" parts={classes} color={(x) => (x.label.startsWith("Autres") ? OTHER : classColor(x.label))} />
            <Ring title="Par devise" parts={ccys} color={(x, i) => (x.label.startsWith("Autres") ? OTHER : CATEGORICAL[i] ?? OTHER)} />
          </div>
        </section>

        <section className="section reveal" aria-labelledby="h-lines">
          <Head id="lines" eyebrow="Les lignes de la maison" title="Nos 40 premières positions"
            lede="Surface : montant détenu, tous fonds confondus. Couleur : classe d'actifs. Cliquez une case pour voir les fonds qui la détiennent." />
          <Mosaic height={480} onSelect={(x) => go(x.key)} share={false}
            items={mosaicLines.map((x) => ({ key: x.key, label: x.name, value: x.amount_eur as number, color: classColor(x.asset_class),
              sub: `${x.asset_class ?? "—"} · ${plural(x.n_funds, "fonds", "fonds")}`, ariaExtra: `${x.asset_class ?? ""}, détenue par ${plural(x.n_funds, "fonds", "fonds")}` }))}
            legend={<><div className="legend" style={{ marginTop: 12 }}>{classes.map((c) => <span key={c.label} className="legend__i"><span className="dot" style={{ background: c.label.startsWith("Autres") ? OTHER : classColor(c.label) }} />{c.label}</span>)}</div>
              {noAmount > 0 && <p className="small muted" style={{ marginTop: 8 }}>{plural(noAmount, "ligne", "lignes")} sans montant en euros calculable (taux de change ou montant indisponible) : absentes de la mosaïque, présentes dans la recherche.</p>}</>} />
        </section>

        <section className="section reveal" aria-labelledby="h-shared">
          <Head id="shared" eyebrow="Les convictions communes" title="Les lignes les plus partagées"
            lede="Un point par fonds qui détient la ligne." />
          <ol className="dots">
            {data.most_shared.map((x, i) => (
              <li key={x.key}>
                <button type="button" className="dots__row" onClick={() => go(x.key)}>
                  <span className="dots__i num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="dots__n">{x.name}</span>
                  <span className="dots__m" aria-hidden="true">{Array.from({ length: maxShared }, (_, k) => <i key={k} className={k < x.n_funds ? "is-on" : ""} />)}</span>
                  <span className="dots__v num">{plural(x.n_funds, "fonds", "fonds")}<span className="muted small"> · {eur(x.amount_eur)}</span></span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}


/**
 * Anneau de répartition : les segments se dessinent à l'entrée dans la page ; au survol (ou au clavier), le segment
 * s'écarte et le centre affiche son libellé, son montant et son poids.
 */
function Ring({ title, parts, color }: { title: string; parts: Part[]; color: (p: Part, i: number) => string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hot, setHot] = useState<number | null>(null);
  const items = parts.filter((p) => (p.amount_eur ?? 0) > 0);
  const total = items.reduce((s, p) => s + (p.amount_eur ?? 0), 0) || 1;
  const R = 92, W = 26, C = 2 * Math.PI * R;
  let acc = 0;
  const segs = items.map((p, i) => {
    const f = (p.amount_eur ?? 0) / total;
    const seg = { p, i, f, start: acc };
    acc += f;
    return seg;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const arcs = el.querySelectorAll(".ring__s");
    const tw = gsap.fromTo(arcs, { strokeDashoffset: (_i: number, t: Element) => Number((t as SVGElement).dataset.len) },
      { strokeDashoffset: 0, duration: 1.4, stagger: 0.12, ease: "power3.out", paused: true });
    const st = ScrollTrigger.create({ trigger: el, start: "top 85%", once: true, onEnter: () => tw.play() });
    return () => { st.kill(); tw.revert(); };
  }, [items.length]);
  const h = hot != null ? segs[hot] : null;
  return (
    <figure className="ring">
      <figcaption className="ring__t">{title}</figcaption>
      <div className="ring__body">
        <svg ref={ref} viewBox="-130 -130 260 260" className="ring__svg" role="img" aria-label={`${title} : ${items.map((p) => `${p.label} ${pctRaw(p.weight, 1)}`).join(", ")}`}>
          <circle r={R} className="ring__track" />
          {segs.map(({ p, i, f, start }) => {
            const len = Math.max(0, f * C - 2);
            const mid = (start + f / 2) * 2 * Math.PI - Math.PI / 2;
            const off = hot === i ? 7 : 0;
            return (
              <circle key={p.label} r={R} className="ring__s" data-len={len} stroke={color(p, i)}
                strokeDasharray={`${len} ${C}`} strokeDashoffset={0} transform={`translate(${Math.cos(mid) * off} ${Math.sin(mid) * off}) rotate(${start * 360 - 90})`}
                style={{ strokeWidth: hot === i ? W + 6 : W, opacity: hot != null && hot !== i ? 0.35 : 1 }}
                onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)} />
            );
          })}
          <text className="ring__v num" y={h ? -2 : 6} textAnchor="middle">{h ? pctRaw(h.p.weight, 1) : eurParts(total).value}</text>
          <text className="ring__l" y={h ? 22 : 30} textAnchor="middle">{h ? (h.p.label.length > 22 ? h.p.label.slice(0, 21) + "…" : h.p.label) : eurParts(total).unit}</text>
          {h && <text className="ring__a num" y={42} textAnchor="middle">{eur(h.p.amount_eur)}</text>}
        </svg>
        <ul className="ring__legend">
          {segs.map(({ p, i }) => (
            <li key={p.label}>
              <button type="button" className={hot === i ? "is-on" : ""} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(i)} onBlur={() => setHot(null)}>
                <span className="dot" style={{ background: color(p, i) }} /><span className="ring__ln">{p.label}</span>
                <span className="num ring__lv">{pctRaw(p.weight, 1)}</span>
              </button>
            </li>
          ))}
          {parts.some((p) => p.amount_eur == null) && <li className="small muted">Certains montants en euros sont indisponibles (taux de change incalculable).</li>}
        </ul>
      </div>
    </figure>
  );
}
