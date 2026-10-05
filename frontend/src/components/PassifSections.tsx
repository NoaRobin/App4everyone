/**
 * Passif — une lecture d'analyste : quelques axes regroupés (segments de clientèle, teneurs, pays, classes d'actifs,
 * desks), chacun comparant sa part de l'encours à sa part des entrées et des sorties de la période. Les milliers de
 * positions ne sont jamais listées : tout est agrégé dans Fabric, en parts et en tranches (aucun nom, aucun montant).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { gsap, onVisible } from "../lib/gsap";
import { prefersReducedMotion, useReducedMotion, webglAvailable } from "../lib/motion";
import { Head } from "./Editorial";
import * as I from "./Icon";
import { Flag } from "./Flag";
import { arr, dFull, dShort, fp, Tip, tr, type Lecture, type LectureTable, type PassifResp, type Positions, type Transactions, type Tranche } from "./PassifKit";
import type { HolderBlock, HolderScene as HolderSceneT } from "../three/PassifScene";

const CLASS_FR: Record<string, string> = { Diversified: "Diversifié", "Fixed Income": "Taux", Equities: "Actions", "Money Market": "Monétaire", Alternative: "Alternatif" };
export const classFr = (c: string) => CLASS_FR[c] ?? c;
const pc0 = (v: number) => `${Math.round(v)} %`;

// ------------------------------------------------------------------ types de la synthèse
export type Row = { key: string; label?: string; iso?: string | null; encours_pct: number | null; tranche: Tranche; in_pct: number | null; out_pct: number | null;
  trend: "hausse" | "baisse" | "stable" | null; activity: number | null; other?: boolean };
export type Synthese = {
  segment_labels?: Record<string, string>; segments?: Row[]; teneurs?: Row[]; countries?: Row[]; classes?: Row[]; desks?: Row[];
  towers?: { teneur: string; segment: string; label: string; pct: number; tranche: Tranche }[]; tower_order?: string[];
  weeks?: { week: string; ops: Tranche; in_pct: number | null; out_pct: number | null; late_pct: number | null }[];
};

/** Segments de clientèle : ordre et couleurs fixes (palette validée sur fond sombre). */
export const SEG_ORDER = ["direct", "prive", "opc", "omnibus", "inactif", "autre"];
export const SEG_COLOR: Record<string, string> = { direct: "#6189d6", prive: "#9085e9", opc: "#c98500", omnibus: "#d55181", inactif: "#5b6170", autre: "#8d929c" };

const TREND: Record<string, { t: string; c: string }> = {
  hausse: { t: "Pèse plus dans les entrées", c: "up-t" }, baisse: { t: "Pèse plus dans les sorties", c: "down-t" }, stable: { t: "Équilibré", c: "muted" },
};

/**
 * Tableau comparatif : un groupe par ligne. Part de l'encours (barre) face à sa part des entrées et des sorties de la
 * période (volumes absolus), et son activité relative. Lecture : un groupe dont la part des entrées dépasse sa part des
 * sorties pèse de plus en plus dans les mouvements ; ce n'est jamais un flux net.
 */
export function CompareTable({ rows, label, flag, color, caption }: { rows: Row[]; label: (r: Row) => string; flag?: boolean; color?: (r: Row) => string; caption: string }) {
  const ref = useRef<HTMLTableSectionElement>(null);
  const max = Math.max(1, ...rows.map((r) => r.encours_pct ?? 0));
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const bars = el.querySelectorAll<HTMLElement>(".pa-ct__fill");
    gsap.set(bars, { scaleX: 0, transformOrigin: "left center" });
    return onVisible(el, () => gsap.to(bars, { scaleX: 1, duration: 1.1, stagger: 0.06, ease: "expo.out", clearProps: "transform" }));
  }, [rows.length]);
  if (!rows.length) return <p className="small muted">Aucun groupe publié.</p>;
  return (
    <div className="table-wrap pa-ct">
      <table className="t">
        <caption className="sr-only">{caption}</caption>
        <thead><tr><th scope="col">Groupe</th><th scope="col" className="pa-ct__enc">Part de l'encours</th><th scope="col" className="n">Part des entrées</th>
          <th scope="col" className="n">Part des sorties</th><th scope="col">Lecture</th><th scope="col" className="n" title="Part moyenne des mouvements rapportée à la part de l'encours">Activité</th></tr></thead>
        <tbody ref={ref}>
          {rows.map((r) => (
            <tr key={r.key} className={r.other ? "is-other" : ""}>
              <th scope="row"><div className="pa-ct__n">
                {flag && (r.iso ? <Flag iso={r.iso} className="pa-ct__flag" title={r.key} /> : <span className="pa-ct__flag" />)}
                {color && <i className="pa-sq" style={{ background: color(r) }} />}
                <span className="pa-ct__l">{label(r)}<span className="small muted pa-ct__tr">{tr(r.tranche, "positions")}</span></span>
              </div></th>
              <td className="pa-ct__enc"><div className="pa-ct__ew"><span className="pa-ct__bar" aria-hidden="true"><i className="pa-ct__fill" style={{ width: `${((r.encours_pct ?? 0) / max) * 100}%`, background: color?.(r) }} /></span><b className="num">{fp(r.encours_pct)}</b></div></td>
              <td className="n num" data-l="Entrées ">{fp(r.in_pct)}</td>
              <td className="n num" data-l="Sorties ">{fp(r.out_pct)}</td>
              <td className={`small ${r.trend ? TREND[r.trend].c : "muted"}`}>{r.trend ? TREND[r.trend].t : "—"}</td>
              <td className="n num" data-l="Activité ">{r.activity == null ? "—" : `×${r.activity.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const READ_HINT = <>Lecture : la part des entrées et celle des sorties se comparent à la part de l'encours. Activité ×2 : le groupe fait deux fois plus de mouvements que son poids. Ce ne sont jamais des flux nets.</>;

// ================================================================== 1. segments de clientèle (3D)
export function SegmentsSection({ s, p, t }: { s: Synthese | null | undefined; p: Positions | null | undefined; t: Transactions | null | undefined }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<HolderSceneT | null>(null);
  const reduced = useReducedMotion();
  const [gl] = useState(() => webglAvailable());
  const [tip, setTip] = useState<{ b: HolderBlock; x: number; y: number } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const segs = arr(s?.segments);
  const ok = !!p && p.available !== false && segs.length > 0;
  const blocks: HolderBlock[] = useMemo(() => arr(s?.towers).map((x) => ({ teneur: x.teneur, classification: x.segment, label: x.label, pct: x.pct, nature: x.segment, tranche: x.tranche ?? null })), [s]);
  const order = useMemo(() => arr(s?.tower_order).map((te) => ({ teneur: te, pct: Math.round(blocks.filter((b) => b.teneur === te).reduce((a, b) => a + b.pct, 0) * 10) / 10 })), [s, blocks]);
  useEffect(() => {
    if (!ok || !gl || !host.current || !labels.current || !blocks.length) return;
    let alive = true, stop = () => undefined as void;
    import("../three/PassifScene").then(({ HolderScene }) => {
      if (!alive || !host.current || !labels.current) return;
      const sc = new HolderScene(host.current, blocks, { reduced, labelLayer: labels.current, teneurs: order, colors: SEG_COLOR, natureOrder: SEG_ORDER, fmt: fp,
        onHover: (b, x, y) => setTip(b ? { b, x, y } : null) });
      scene.current = sc;
      stop = onVisible(host.current, () => sc.play(), "0px 0px -15% 0px");
    });
    return () => { alive = false; stop(); scene.current?.dispose(); scene.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, gl, reduced, blocks]);
  useEffect(() => { scene.current?.highlight(focus); }, [focus]);
  if (!ok) return (
    <section className="section reveal" aria-labelledby="h-seg"><Head id="seg" eyebrow="01 · Segments de clientèle" title="Qui détient l'encours" /><Missing what="Positions" reason={p?.reason} /></section>
  );
  const top = segs[0];
  const mover = [...segs].filter((r) => r.activity != null && (r.encours_pct ?? 0) >= 5).sort((a, b) => (b.activity ?? 0) - (a.activity ?? 0))[0];
  return (
    <section className="section reveal" aria-labelledby="h-seg">
      <Head id="seg" eyebrow="01 · Segments de clientèle" title={`${top.label ?? top.key} : ${fp(top.encours_pct)} de l'encours.`}
        lede={<>Les classifications de comptes regroupées en {segs.length} segments. {mover && mover.activity && mover.activity >= 1.2 ? <>Le segment le plus actif&nbsp;: <b>{mover.label}</b>, {mover.activity.toLocaleString("fr-FR")} fois plus de mouvements que son poids. </> : null}{t?.first ? <>Mouvements du {dFull(t.first)} au {dFull(t.last)}.</> : null}</>} />
      <div className="pa-seg">
        {gl && blocks.length > 0 && (
          <div className="pa-who__stage pa-seg__stage">
            <div className="pa-who__canvas" ref={host} />
            <div className="pa-who__labels" ref={labels} aria-hidden="true" />
            <div className="pa-mx__hint small" aria-hidden="true">Une tour par teneur de compte, empilée par segment · faites glisser pour tourner</div>
            {tip && (
              <Tip x={tip.x} y={tip.y}>
                <div className="city__tip-f">{tip.b.teneur}</div>
                <div className="city__tip-n">{tip.b.label}</div>
                <div className="city__tip-v num">{fp(tip.b.pct)} <span className="small">de l'encours</span></div>
                <div className="city__tip-s small">{tr(tip.b.tranche, "positions")}</div>
              </Tip>
            )}
          </div>
        )}
        <div className="pa-seg__legend" role="group" aria-label="Segments (survolez pour isoler dans la 3D)">
          {segs.map((r) => (
            <button key={r.key} type="button" data-touch aria-pressed={focus === r.key} onMouseEnter={() => setFocus(r.key)} onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(r.key)} onBlur={() => setFocus(null)}>
              <i style={{ background: SEG_COLOR[r.key] ?? SEG_COLOR.autre }} /><span>{r.label}</span><b className="num">{fp(r.encours_pct)}</b>
            </button>
          ))}
        </div>
      </div>
      <CompareTable rows={segs} label={(r) => r.label ?? r.key} color={(r) => SEG_COLOR[r.key] ?? SEG_COLOR.autre} caption="Segments de clientèle : encours, entrées et sorties" />
      <p className="small muted pa-ct__hint">{READ_HINT}</p>
    </section>
  );
}

// ================================================================== 2. teneurs et pays
export function WhereSection({ s }: { s: Synthese | null | undefined }) {
  const [tab, setTab] = useState<"teneurs" | "pays">("teneurs");
  const ten = arr(s?.teneurs), cty = arr(s?.countries);
  if (!ten.length && !cty.length) return null;
  const fr = cty.find((r) => r.key === "France");
  const busy = [...ten].filter((r) => r.activity != null && (r.encours_pct ?? 0) >= 5).sort((a, b) => (b.activity ?? 0) - (a.activity ?? 0))[0];
  const title = tab === "teneurs" && ten[0] ? `${ten[0].key} tient ${fp(ten[0].encours_pct)} de l'encours${busy && busy.key !== ten[0].key && (busy.activity ?? 0) >= 1.3 ? ` ; ${busy.key} concentre l'activité (×${(busy.activity ?? 0).toLocaleString("fr-FR")})` : ""}.`
    : fr ? `${fp(fr.encours_pct)} de l'encours est détenu depuis la France.` : `${cty[0]?.key} : ${fp(cty[0]?.encours_pct)} de l'encours.`;
  return (
    <section className="section reveal" aria-labelledby="h-ou">
      <Head id="ou" eyebrow="02 · Teneurs de compte et pays" title={title}
        lede="Les quatre premiers teneurs et les six premiers pays, le reste regroupé."
        right={<div className="seg" role="radiogroup" aria-label="Axe">{([["teneurs", "Teneurs de compte"], ["pays", "Pays du porteur"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={tab === k} className="seg__b" onClick={() => setTab(k)}>{l}</button>))}</div>} />
      {tab === "teneurs" ? <CompareTable key="t" rows={ten} label={(r) => r.key} caption="Teneurs de compte : encours, entrées et sorties" />
        : <CompareTable key="p" rows={cty} label={(r) => r.key} flag caption="Pays du porteur : encours, entrées et sorties" />}
      <p className="small muted pa-ct__hint">{READ_HINT}</p>
    </section>
  );
}

// ================================================================== 4. ce qui est détenu
export function AssetsSection({ s, p }: { s: Synthese | null | undefined; p: Positions | null | undefined }) {
  const [tab, setTab] = useState<"classes" | "desks">("classes");
  const cls = arr(s?.classes), dsk = arr(s?.desks), funds = arr(p?.top_funds);
  if (!cls.length && !dsk.length) return null;
  const c0 = cls[0];
  return (
    <section className="section reveal" aria-labelledby="h-quoi">
      <Head id="quoi" eyebrow="05 · Ce que détiennent nos clients" title={c0 ? `${classFr(c0.key)} : ${fp(c0.encours_pct)} de l'encours détenu par nos clients.` : "Ce que détiennent nos clients."}
        right={<div className="seg" role="radiogroup" aria-label="Axe">{([["classes", "Classes d'actifs"], ["desks", "Desks de gestion"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={tab === k} className="seg__b" onClick={() => setTab(k)}>{l}</button>))}</div>} />
      {tab === "classes" ? <CompareTable key="c" rows={cls} label={(r) => classFr(r.key)} caption="Classes d'actifs : encours, entrées et sorties" />
        : <CompareTable key="d" rows={dsk} label={(r) => r.key} caption="Desks : encours, entrées et sorties" />}
      {funds.length > 0 && (
        <div className="pa-hold1">
          <div className="eyebrow">Les {funds.length} fonds les plus détenus · {fp(p?.top_funds_pct)} de l'encours, sur {tr(p?.funds_count, "fonds")}</div>
          <ol className="pa-funds">
            {funds.map((f, i) => (
              <li key={f.fund}><span className="num pa-funds__i">{String(i + 1).padStart(2, "0")}</span>
                <Link className="link" to={`/fonds/${encodeURIComponent(f.fund)}`}>{f.name ?? f.fund}</Link>
                <b className="num">{fp(f.pct)}</b><span className="small muted">{tr(f.positions, "positions")}</span></li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

// ================================================================== 5. rythme des mouvements (semaines)
export function RhythmSection({ s, t }: { s: Synthese | null | undefined; t: Transactions | null | undefined }) {
  const weeks = arr(s?.weeks);
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const bars = el.querySelectorAll<HTMLElement>(".pa-wk__in i, .pa-wk__out i");
    gsap.set(bars, { scaleY: 0 });
    return onVisible(el, () => gsap.to(bars, { scaleY: 1, duration: 0.9, stagger: 0.02, ease: "expo.out", clearProps: "transform" }));
  }, [weeks.length]);
  const statuts = arr(t?.statuts);
  if (!t || t.available === false || !weeks.length) return (
    <section className="section reveal" aria-labelledby="h-flux"><Head id="flux" eyebrow="06 · Mouvements" title="Le rythme des opérations" /><Missing what="Transactions" reason={t?.reason} />{statuts.length > 0 && <StatutsLine statuts={statuts} />}</section>
  );
  const ps = new Map(arr(t.period_sens).map((x) => [x.sens, x.pct]));
  const inn = (ps.get("Souscription") ?? 0) + (ps.get("Transfert entrant") ?? 0), out = (ps.get("Rachat") ?? 0) + (ps.get("Transfert sortant") ?? 0);
  const outWeeks = weeks.filter((w) => (w.out_pct ?? 0) > (w.in_pct ?? 0)).length;
  return (
    <section className="section reveal" aria-labelledby="h-flux">
      <Head id="flux" eyebrow={`06 · Mouvements · ${dFull(t.first)} → ${dFull(t.last)}`}
        title={`${weeks.length} semaines : les entrées font ${fp(inn)} du volume, les sorties ${fp(out)} ; ${outWeeks} semaine${outWeeks > 1 ? "s" : ""} à dominante de sorties.`}
        lede={<>Chaque semaine, la part de son volume absolu (Montant EUR) qui entre (souscriptions et transferts entrants) et qui sort. {t.late?.calculable ? <>Après cut-off&nbsp;: <b>{fp(t.late.pct)}</b> du volume.</> : <>Après cut-off&nbsp;: <b>non calculable</b>.</>}</>} />
      <ol className="pa-wk" ref={ref}>
        {weeks.map((w) => {
          const i = w.in_pct ?? 0, o = w.out_pct ?? 0;
          return (
            <li key={w.week} className={o > i ? "is-out" : ""} aria-label={`Semaine du ${dFull(w.week)} : entrées ${fp(w.in_pct)}, sorties ${fp(w.out_pct)}`}>
              <span className="pa-wk__v num">{pc0(i)}</span>
              <span className="pa-wk__in"><i style={{ height: `${i}%` }} /></span>
              <span className="pa-wk__out"><i style={{ height: `${o}%` }} /></span>
              <span className="pa-wk__v num">{pc0(o)}</span>
              <span className="pa-wk__d small">{dShort(w.week)}</span>
              {w.late_pct != null && w.late_pct > 0 && <span className="pa-wk__late small" title="Part après cut-off">{pc0(w.late_pct)}</span>}
            </li>
          );
        })}
      </ol>
      <ul className="pa-fl__leg"><li><i style={{ background: "#6189d6" }} />Entrées</li><li><i style={{ background: "#c98500" }} />Sorties</li><li><span className="small muted">chiffre sous la date : part après cut-off</span></li></ul>
      <StatutsLine statuts={statuts} />
    </section>
  );
}

// ================================================================== 6. structure des comptes (compacte)
export function AccountsLine({ c }: { c: PassifResp["comptes"] }) {
  if (!c || c.available === false) return null;
  return (
    <div className="pa-acc__facts pa-acc__facts--c" aria-label="Structure des comptes">
      <div><span className="eyebrow">Comptes</span><b className="num">{tr(c.total)}</b></div>
      <div><span className="eyebrow">Clients</span><b className="num">{tr(c.clients)}</b></div>
      <div><span className="eyebrow">Ouverts · dissous</span><b className="num">{tr(c.open)} · {tr(c.dissolved)}</b></div>
      <div><span className="eyebrow">Avec compte parent</span><b className="num">{tr(c.with_parent)}</b></div>
      <div><span className="eyebrow">Teneurs</span><b className="num">{arr(c.teneurs).length}</b></div>
    </div>
  );
}

/** État vide explicite : la raison donnée par l'API (diagnostic), jamais un « — » muet. */
function Missing({ reason, what }: { reason?: string | null; what: string }) {
  return (
    <div className="pa-miss" role="status">
      <I.Info size={18} />
      <div><b>{what} non publié{what.endsWith("s") ? "es" : ""}.</b>{reason ? <> {reason}</> : null} <a className="link" href="#h-lecture">Lecture des tables sources</a></div>
    </div>
  );
}

// ================================================================== 3. concentration
export function ConcentrationSection({ p }: { p: Positions | null | undefined }) {
  const c = p?.concentration;
  const ref = useRef<HTMLOListElement>(null);
  const pts = arr(c?.points);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !pts.length) return;
    const bars = el.querySelectorAll<HTMLElement>(".pa-conc__fill");
    gsap.set(bars, { scaleX: 0, transformOrigin: "left center" });
    return onVisible(el, () => gsap.to(bars, { scaleX: 1, duration: 1.2, stagger: 0.12, ease: "expo.out", clearProps: "transform" }));
  }, [pts.length]);
  if (!p || p.available === false || !c?.available || !pts.length) return null;
  const p10 = pts.find((x) => x.top_pct === 10) ?? pts[pts.length - 1];
  return (
    <section className="section reveal" aria-labelledby="h-conc">
      <Head id="conc" eyebrow="03 · Concentration" title={`Les ${pc0(p10.top_pct)} de comptes les plus importants détiennent ${fp(p10.pct)} de l'encours.`}
        lede={<>Comptes classés du plus gros au plus petit encours (calcul dans Fabric, aucun compte n'en sort). La moitié de l'encours tient dans <b>{tr(c.accounts_for_half, "comptes")}</b>, 80&nbsp;% dans <b>{tr(c.accounts_for_80, "comptes")}</b>, sur {tr(c.accounts, "comptes porteurs")}.</>} />
      <ol className="pa-conc" ref={ref}>
        {pts.map((x) => (
          <li key={x.top_pct}>
            <span className="pa-conc__l">Les {pc0(x.top_pct)} premiers comptes</span>
            <span className="pa-conc__bar" aria-hidden="true"><i className="pa-conc__fill" style={{ width: `${x.pct}%` }} /><em style={{ left: `${x.top_pct}%` }} /></span>
            <b className="num">{fp(x.pct)}</b>
          </li>
        ))}
      </ol>
      <p className="small muted">Le repère vertical marque la part qu'ils détiendraient si tous les comptes pesaient autant : l'écart mesure la concentration.</p>
    </section>
  );
}

// ================================================================== 4. fidélité
export function LoyaltySection({ p }: { p: Positions | null | undefined }) {
  const sen = arr(p?.seniority), last = arr(p?.last_trade);
  if (!p || p.available === false || !sen.length) return null;
  const old = Math.round(sen.filter((b) => /3 à 5|5 à 10|Plus de 10/.test(b.band)).reduce((s, b) => s + b.pct, 0) * 10) / 10;
  const SEN_C = ["#3a4a6b", "#55709f", "#8a682c", "#cc9f53", "#f3dcaa", "#5b6170"];
  const strip = (rows: typeof sen, label: string) => (
    <div className="pa-loy__row">
      <div className="eyebrow">{label}</div>
      <div className="pa-loy__strip" role="img" aria-label={rows.map((b) => `${b.band} ${fp(b.pct)}`).join(", ")}>
        {rows.map((b, i) => <span key={b.band} style={{ flexGrow: b.pct, background: /non renseign/i.test(b.band) ? SEN_C[5] : SEN_C[i] }} title={`${b.band} · ${fp(b.pct)}`}>{b.pct >= 7 && <b className="num">{fp(b.pct)}</b>}</span>)}
      </div>
      <ul className="pa-loy__leg">
        {rows.map((b, i) => <li key={b.band}><i style={{ background: /non renseign/i.test(b.band) ? SEN_C[5] : SEN_C[i] }} />{b.band}<b className="num">{fp(b.pct)}</b></li>)}
      </ul>
    </div>
  );
  return (
    <section className="section reveal" aria-labelledby="h-loy">
      <Head id="loy" eyebrow="04 · Fidélité" title={`${fp(old)} de l'encours est investi depuis plus de trois ans.`}
        lede="Âge des positions à la date de la photo, d'après leur premier achat (Premier trade) ; dessous, l'ancienneté de leur dernière opération (Dernier trade). Pondération : Montant EUR." />
      {strip(sen, "Depuis le premier achat")}
      {last.length > 0 && strip(last, "Depuis la dernière opération")}
    </section>
  );
}

function StatutsLine({ statuts }: { statuts: { statut: string; included: boolean; tranche?: { label: string } | null }[] }) {
  if (!statuts.length) return null;
  return (
    <p className="small pa-st">
      <b>Statuts présents dans la table :</b>{" "}
      {statuts.map((s, i) => <span key={s.statut} className={s.included ? "pa-st__in" : "pa-st__out"}>{s.statut} ({s.included ? "retenu" : "exclu"}{s.tranche ? `, ${s.tranche.label} opérations` : ""}){i < statuts.length - 1 ? " · " : ""}</span>)}
    </p>
  );
}

// ================================================================== 8. lecture des tables sources
const TABLE_LABEL = { compte: "Compte", position: "Position", transaction: "Transaction" } as const;

export function LectureSection({ l, asOf, t, c }: { l: Lecture | null | undefined; asOf?: string | null; t?: Transactions | null; c?: PassifResp["comptes"] }) {
  if (!l) return null;
  const nf = new Intl.NumberFormat("fr-FR");
  const a = l.links?.accounts, isin = l.links?.isin, dup = l.duplicates;
  return (
    <section className="section reveal pa-lec" aria-labelledby="h-lecture">
      <Head id="lecture" eyebrow="08 · Transparence" title="Lecture des tables sources"
        lede={<>Correspondance exacte des colonnes (vrais noms, sinon _c0…_cN dans l'ordre fixe), type détecté, valeurs nulles, dates valides et invalides. Photo de l'encours au <b>{dFull(asOf)}</b>{t?.first ? <> · opérations du <b>{dFull(t.first)}</b> au <b>{dFull(t.last)}</b></> : null}. Uniquement des comptages de lignes, jamais une valeur.</>} />
      {l.problems.length > 0 && (
        <div className="pa-lec__pb" role="alert">
          {l.problems.map((p, i) => <p key={i} className={`small pa-lec__p is-${p.level}`}><b>{TABLE_LABEL[p.table as keyof typeof TABLE_LABEL] ?? p.table} · {p.level === "erreur" ? "Erreur" : "Information"}.</b> {p.text}</p>)}
        </div>
      )}
      <div className="pa-lec__links">
        <div><span className="eyebrow">Comptes rattachés</span><b className="num">{a ? fp(a.rows_pct) : "—"}</b><span className="small muted">{a ? <>des positions · {nf.format(a.linked)} comptes sur {nf.format(a.distinct)} (Compte Centaure ↔ Id Compte)</> : "non calculé"}</span></div>
        <div><span className="eyebrow">ISIN rattachés</span><b className="num">{isin ? fp(isin.amount_pct) : "—"}</b><span className="small muted">{isin ? <>de l'encours · {nf.format(isin.linked)} ISIN sur {nf.format(isin.distinct)} (↔ PI_OUT_Share.ISIN_Code)</> : "non calculé"}</span></div>
        <div><span className="eyebrow">Doublons de référence</span><b className="num">{dup ? nf.format(dup.exact_duplicates) : "—"}</b><span className="small muted">{dup ? <>lignes identiques écartées · {nf.format(dup.refs_multi_lines)} références sur plusieurs lignes distinctes, conservées</> : "Reference absente"}</span></div>
      </div>
      <div className="eyebrow pa-lec__acc">Structure des comptes (table Compte)</div>
      <AccountsLine c={c} />
      {(["compte", "position", "transaction"] as const).map((k) => <LectureCard key={k} name={k} tb={l.tables[k]} env={l.env[k]} />)}
    </section>
  );
}

function LectureCard({ name, tb, env }: { name: "compte" | "position" | "transaction"; tb: LectureTable; env: string }) {
  const [open, setOpen] = useState(false);
  const nf = new Intl.NumberFormat("fr-FR");
  const n = (v: number | null | undefined) => (v == null ? "—" : nf.format(v));
  const STATUS: Record<string, string> = { conforme: "Conforme", "à confirmer": "À confirmer", absente: "Absente", vide: "Vide" };
  return (
    <div className="pa-lec__card">
      <button type="button" className="pa-lec__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <b>{TABLE_LABEL[name]}</b>
        <span className="small">{tb.mode === "noms" ? "vrais noms de colonnes" : `colonnes _c0…_c${tb.expected - 1}`} · {tb.n_columns}/{tb.expected} colonnes · {n(tb.usable)} lignes exploitables sur {n(tb.rows)}{tb.ignored_rows ? ` (${n(tb.ignored_rows)} écartées : en-tête relue ou enregistrement vide)` : ""}</span>
        <span className={`pa-lec__badge ${tb.to_confirm.length || tb.missing.length ? "is-warn" : "is-ok"}`}>{tb.missing.length ? `${tb.missing.length} absentes` : tb.to_confirm.length ? `${tb.to_confirm.length} à confirmer` : "Correspondance exacte"}</span>
        <I.Down size={16} className="pa-lec__chev" />
      </button>
      {open && (
        <div className="table-wrap">
          <table className="t t--mini pa-lec__t">
            <thead><tr><th>Champ</th><th>Colonne lue</th><th>Nature attendue</th><th>Type détecté</th><th className="n">Remplies</th><th className="n">Nulles</th><th className="n">Valides</th><th className="n">Invalides</th><th>Statut</th><th>Correspondance</th></tr></thead>
            <tbody>
              {tb.columns.map((c) => (
                <tr key={c.field} className={c.used ? "" : "is-conf"}>
                  <td>{c.name}</td><td><code>{c.col ?? "—"}</code></td><td>{c.kind === "confidentiel" ? "confidentielle (jamais lue)" : c.kind}</td><td>{c.detected}</td>
                  <td className="n">{n(c.filled)}</td><td className="n">{n(c.nulls)}</td>
                  <td className="n">{c.valid == null ? "" : n(c.valid)}</td>
                  <td className="n">{c.invalid == null ? "" : <span className={c.invalid ? "down-t" : ""}>{n(c.invalid)}{c.rejected?.length ? <span className="small muted"> ({c.rejected.map((r) => r.shape).join(", ")})</span> : null}</span>}</td>
                  <td><span className={`pa-lec__s is-${c.status.replace(/\s/g, "-")}`}>{STATUS[c.status] ?? c.status}</span></td>
                  <td className="small muted">{c.how}{c.min ? ` · ${dShort(c.min)}/${c.min.slice(0, 4)} → ${dShort(c.max)}/${(c.max ?? "").slice(0, 4)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">Ajustement possible colonne par colonne : <code>{env}</code> (voir .env.example). {tb.overrides_ignored.length ? `Ajustements ignorés : ${tb.overrides_ignored.map((o) => `${o.field}=${o.col} (${o.why})`).join(", ")}.` : ""}{tb.extra.length ? ` Colonnes non prévues : ${tb.extra.join(", ")}.` : ""}</p>
        </div>
      )}
    </div>
  );
}


// ================================================================== 07. clients et fonds (vue nominative)
type Holder = { client: string; pct: number | null; positions: number; comptes: number; teneur: string; pays: string; segment: string };
type HoldersResp = { available: boolean; reason?: string; fund?: string; name?: string | null; as_of?: string; n_clients?: number; clients?: Holder[];
  others_pct?: number | null; top10_pct?: number | null };
type ClientResp = { available: boolean; reason?: string; clients?: { client: string; positions: number; unlinked_pct: number | null;
  funds: { fund: string; name?: string | null; pct_of_fund: number | null; pct_of_client: number | null }[] }[] };

/**
 * Qui est investi dans quel fonds : pour un fonds, ses clients porteurs (part du fonds détenue) ; pour un client, ses
 * fonds. Calculé à la demande dans la source, jamais conservé ; parts uniquement (aucun montant).
 */
export function ClientsSection({ funds }: { funds: PassifResp["funds"] }) {
  const { api } = useApp();
  const [params, setParams] = useSearchParams();
  const list = useMemo(() => Object.entries(funds ?? {}).map(([id, f]) => ({ id, name: f.name ?? id, pct: f.pct })).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)), [funds]);
  const [fid, setFid] = useState<string | null>(() => params.get("fonds") ?? list[0]?.id ?? null);
  const [ff, setFf] = useState("");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = window.setTimeout(() => setDq(q.trim()), 300); return () => window.clearTimeout(t); }, [q]);
  useEffect(() => { if (!fid && list[0]) setFid(list[0].id); }, [list, fid]);
  const h = useApi<HoldersResp>(fid ? api(`/api/passif/fonds/${encodeURIComponent(fid)}/porteurs`) : null);
  const c = useApi<ClientResp>(dq.length >= 2 ? api(`/api/passif/clients?q=${encodeURIComponent(dq)}`) : null);
  const shown = list.filter((f) => !ff || f.name.toLowerCase().includes(ff.toLowerCase())).slice(0, 14);
  const pick = (id: string) => { setFid(id); const p = new URLSearchParams(params); p.set("fonds", id); setParams(p, { replace: true }); };
  const hd = h.data;
  const max = Math.max(1, ...(hd?.clients ?? []).map((x) => x.pct ?? 0));
  if (!list.length) return null;
  return (
    <section className="section reveal pa-cli" aria-labelledby="h-clients">
      <Head id="clients" eyebrow="07 · Clients et fonds" title="Qui est investi dans quel fonds."
        lede="Pour un fonds, ses clients porteurs et la part du fonds que chacun détient ; pour un client, les fonds qu'il détient. Parts calculées sur Montant EUR à la date de la photo, aucun montant." />
      <p className="pa-cli__warn small"><I.Alert size={15} /> Données nominatives, usage interne : calculées à la demande dans la source, jamais conservées par l'application.</p>
      <div className="pa-cli__g">
        <aside className="pa-cli__pick">
          <label className="eyebrow" htmlFor="pa-fund-f">Choisir un fonds</label>
          <input id="pa-fund-f" className="pa-cli__in" placeholder="Filtrer les fonds détenus…" value={ff} onChange={(e) => setFf(e.target.value)} />
          <ul role="listbox" aria-label="Fonds détenus au passif">
            {shown.map((f) => (
              <li key={f.id}><button type="button" role="option" aria-selected={fid === f.id} onClick={() => pick(f.id)}>
                <span>{f.name}</span><b className="num">{fp(f.pct)}</b></button></li>
            ))}
          </ul>
          <p className="small muted">Part de l'encours suivi au passif. {list.length > shown.length ? `${list.length} fonds détenus.` : ""}</p>
        </aside>
        <div className="pa-cli__main">
          {!hd ? <p className="small muted">{h.loading ? "Calcul des porteurs…" : "Choisissez un fonds."}</p> : !hd.available ? <Missing what="Porteurs" reason={hd.reason} /> : (
            <>
              <div className="pa-cli__h">
                <div><div className="eyebrow">Porteurs au {dFull(hd.as_of)}</div><h3 className="pa-cli__t">{hd.name ?? hd.fund}</h3></div>
                <div className="pa-cli__k"><b className="num">{hd.n_clients ?? 0}</b><span>clients porteurs</span></div>
                <div className="pa-cli__k"><b className="num">{fp(hd.top10_pct)}</b><span>du fonds détenu par les 10 premiers</span></div>
                {hd.fund && <Link className="link small" to={`/fonds/${encodeURIComponent(hd.fund)}`}>Fiche du fonds</Link>}
              </div>
              <div className="table-wrap pa-cli__tw">
                <table className="t t--mini">
                  <caption className="sr-only">Clients porteurs du fonds</caption>
                  <thead><tr><th>#</th><th>Client</th><th>Part du fonds</th><th className="n">Positions</th><th className="n">Comptes</th><th>Teneur</th><th>Pays</th><th>Segment</th></tr></thead>
                  <tbody>{(hd.clients ?? []).map((x, i) => (
                    <tr key={i}><td className="num muted">{i + 1}</td><td className="pa-cli__n">{x.client}</td>
                      <td><div className="pa-ct__ew"><span className="pa-ct__bar" aria-hidden="true"><i className="pa-ct__fill" style={{ width: `${((x.pct ?? 0) / max) * 100}%` }} /></span><b className="num">{fp(x.pct)}</b></div></td>
                      <td className="n num">{x.positions}</td><td className="n num">{x.comptes}</td><td>{x.teneur}</td><td>{x.pays}</td><td className="small">{x.segment}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              {hd.others_pct != null && <p className="small muted">Autres porteurs (au-delà des {hd.clients?.length} premiers)&nbsp;: {fp(hd.others_pct)} du fonds.</p>}
            </>
          )}
        </div>
      </div>
      <div className="pa-cli__s">
        <label className="eyebrow" htmlFor="pa-cli-q">Rechercher un client</label>
        <input id="pa-cli-q" className="pa-cli__in" placeholder="Nom du client (au moins deux caractères)…" value={q} onChange={(e) => setQ(e.target.value)} />
        {dq.length >= 2 && (c.loading && !c.data ? <p className="small muted">Recherche…</p> : c.data && !c.data.available ? <Missing what="Clients" reason={c.data.reason} /> : (
          <ul className="pa-cli__res">
            {(c.data?.clients ?? []).length === 0 && <li className="small muted">Aucun client trouvé.</li>}
            {(c.data?.clients ?? []).map((x) => (
              <li key={x.client}>
                <div className="pa-cli__rn"><b>{x.client}</b><span className="small muted">{x.positions} positions</span></div>
                <ul>{x.funds.map((f) => (
                  <li key={f.fund}><button type="button" className="link" onClick={() => pick(f.fund)}>{f.name ?? f.fund}</button>
                    <span className="num small">{fp(f.pct_of_client)} de ses positions · {fp(f.pct_of_fund)} du fonds</span></li>
                ))}{x.unlinked_pct ? <li className="small muted">{fp(x.unlinked_pct)} dans des parts non rattachées au référentiel</li> : null}</ul>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}
