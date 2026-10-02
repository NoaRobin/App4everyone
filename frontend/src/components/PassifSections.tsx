/**
 * Passif — les sections de la page : qui détient (3D), où, concentration, fidélité, ce qui est détenu (3D),
 * mouvements sur 60 jours ouvrés, les comptes, et la lecture des tables sources.
 * Chaque titre énonce le fait principal, calculé sur les données publiées (parts et tranches uniquement).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap, onVisible } from "../lib/gsap";
import { prefersReducedMotion, useReducedMotion, webglAvailable } from "../lib/motion";
import { Head } from "./Editorial";
import * as I from "./Icon";
import { Flag } from "./Flag";
import { useWidth } from "./charts";
import {
  arr, dFull, dLong, dShort, fp, goldRamp, natureColor, natureOfLabel, NATURE_LABEL, NATURE_ORDER, RankMeter, sensColor, sensRank,
  ShareBars, Tip, tr,
  type Lecture, type LectureTable, type Nature, type PassifResp, type Positions, type Transactions,
} from "./PassifKit";
import type { HolderBlock, HolderScene as HolderSceneT, MatrixCell, MatrixScene as MatrixSceneT } from "../three/PassifScene";

const CLASS_FR: Record<string, string> = { Diversified: "Diversifié", "Fixed Income": "Taux", Equities: "Actions", "Money Market": "Monétaire", Alternative: "Alternatif" };
export const classFr = (c: string) => CLASS_FR[c] ?? c;
/** Part entière (« 10 % ») pour les seuils de comptes. */
const pc0 = (v: number) => `${Math.round(v)}\u202f%`;
/** Tranche lisible dans une phrase : « 1 000 comptes et plus », « 20 à 99 comptes ». */
const count = (t: { label: string } | null | undefined, unit: string) => (!t ? `des ${unit} non publiés` : t.label.endsWith("et plus") ? `${t.label.replace(" et plus", "")} ${unit} et plus` : `${t.label} ${unit}`);
const short = (c: string) => (c.includes("/") ? c.split("/").slice(1).join("/").trim() : c);

/** État vide explicite : la raison donnée par l'API (diagnostic), jamais un « — » muet. */
function Missing({ reason, what }: { reason?: string | null; what: string }) {
  return (
    <div className="pa-miss" role="status">
      <I.Info size={18} />
      <div><b>{what} non publié{what.endsWith("s") ? "es" : ""}.</b>{reason ? <> {reason}</> : null} <a className="link" href="#h-lecture">Lecture des tables sources</a></div>
    </div>
  );
}

// ================================================================== 1. qui détient l'encours
export function HoldersSection({ p }: { p: Positions | null | undefined }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<HolderSceneT | null>(null);
  const reduced = useReducedMotion();
  const [gl] = useState(() => webglAvailable());
  const [table, setTable] = useState(!gl);
  const [tip, setTip] = useState<{ b: HolderBlock; x: number; y: number } | null>(null);
  const [focus, setFocus] = useState<Nature | null>(null);
  const ok = !!p && p.available !== false;
  const holders = arr(p?.by_holder);
  const teneurs = arr(p?.by_teneur);
  const blocks: HolderBlock[] = useMemo(() => holders.map((h) => ({ teneur: h.teneur, classification: h.classification, label: short(h.classification),
    pct: h.pct, nature: natureOfLabel(h.classification), tranche: h.tranche ?? null })), [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const natures = useMemo(() => {
    const m = new Map<Nature, number>();
    blocks.forEach((b) => m.set(b.nature as Nature, (m.get(b.nature as Nature) ?? 0) + b.pct));
    return NATURE_ORDER.filter((n) => m.has(n)).map((n) => ({ nature: n, pct: Math.round((m.get(n) ?? 0) * 10) / 10 }));
  }, [blocks]);
  useEffect(() => {
    if (!ok || table || !gl || !host.current || !labels.current || !blocks.length) return;
    let alive = true, stop = () => undefined as void;
    import("../three/PassifScene").then(({ HolderScene }) => {
      if (!alive || !host.current || !labels.current) return;
      const colors = Object.fromEntries(NATURE_ORDER.map((n) => [n, natureColor(n)]));
      const s = new HolderScene(host.current, blocks, { reduced, labelLayer: labels.current, teneurs: teneurs.map((t) => ({ teneur: t.teneur, pct: t.pct })),
        colors, natureOrder: NATURE_ORDER, fmt: fp, onHover: (b, x, y) => setTip(b ? { b, x, y } : null) });
      scene.current = s;
      stop = onVisible(host.current, () => s.play(), "0px 0px -15% 0px");
    });
    return () => { alive = false; stop(); scene.current?.dispose(); scene.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, table, gl, reduced, blocks]);
  useEffect(() => { scene.current?.highlight(focus); }, [focus]);
  const top = teneurs[0], second = teneurs[1];
  const title = top ? `${top.teneur} tient ${fp(top.pct)} de l'encours${second ? `, devant ${second.teneur} (${fp(second.pct)})` : ""}.` : "Qui tient l'encours.";
  return (
    <section className="section reveal pa-who" aria-labelledby="h-qui">
      <Head id="qui" eyebrow="01 · Qui détient l'encours" title={title}
        lede={<>Une tour par teneur de compte, sa hauteur est sa part de l'encours (Montant EUR) ; chaque bloc est un type de compte, coloré par sa nature. Survolez un bloc, ou une nature dans la légende.</>}
        right={gl && ok ? <button type="button" className="btn btn--ghost pa-btn-s" onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? <><I.Cube size={15} /> Vue 3D</> : <><I.List size={15} /> Vue tableau</>}</button> : undefined} />
      {!ok ? <Missing what="Positions" reason={p?.reason} /> : (
        <div className="pa-who__g">
          {!table ? (
            <div className="pa-who__stage">
              <div className="pa-who__canvas" ref={host} />
              <div className="pa-who__labels" ref={labels} aria-hidden="true" />
              <div className="pa-mx__hint small" aria-hidden="true">Faites glisser pour tourner</div>
              {tip && (
                <Tip x={tip.x} y={tip.y}>
                  <div className="city__tip-f">{tip.b.teneur} · {NATURE_LABEL[tip.b.nature as Nature]}</div>
                  <div className="city__tip-n">{tip.b.label}</div>
                  <div className="city__tip-v num">{fp(tip.b.pct)} <span className="small">de l'encours</span></div>
                  <div className="city__tip-s small">{tr(tip.b.tranche, "positions")}</div>
                </Tip>
              )}
            </div>
          ) : (
            <div className="table-wrap"><table className="t t--mini">
              <caption className="sr-only">Part de l'encours par teneur et type de compte</caption>
              <thead><tr><th>Teneur</th><th>Type de compte</th><th>Nature</th><th className="n">Part de l'encours</th><th className="n">Positions</th></tr></thead>
              <tbody>{blocks.map((b, i) => <tr key={i}><td>{b.teneur}</td><td>{b.label}</td><td><i className="pa-sq" style={{ background: natureColor(b.nature as Nature) }} /> {NATURE_LABEL[b.nature as Nature]}</td><td className="n">{fp(b.pct)}</td><td className="n">{tr(b.tranche)}</td></tr>)}</tbody>
            </table></div>
          )}
          <aside className="pa-who__side">
            <div className="eyebrow">Par nature de compte</div>
            <ul className="pa-nat" aria-label="Natures de compte (survolez pour isoler)">
              {natures.map((n) => (
                <li key={n.nature}>
                  <button type="button" data-touch aria-pressed={focus === n.nature} onMouseEnter={() => setFocus(n.nature)} onMouseLeave={() => setFocus(null)}
                    onFocus={() => setFocus(n.nature)} onBlur={() => setFocus(null)}>
                    <i style={{ background: natureColor(n.nature) }} /><span>{NATURE_LABEL[n.nature]}</span><b className="num">{fp(n.pct)}</b>
                  </button>
                </li>
              ))}
            </ul>
            <div className="eyebrow pa-who__t2">Par teneur de compte</div>
            <ShareBars items={teneurs} label={(x) => x.teneur} pct={(x) => x.pct} tranche={(x) => x.tranche} unit="positions" />
            {p?.residual_pct != null && p.residual_pct > 0 && <p className="small muted pa-who__res">{fp(p.residual_pct)} de l'encours provient de groupes de moins de 5 positions : compté dans le total, jamais détaillé.</p>}
          </aside>
        </div>
      )}
    </section>
  );
}

// ================================================================== 2. où sont les porteurs
export function CountriesSection({ p, t }: { p: Positions | null | undefined; t: Transactions | null | undefined }) {
  const rows = arr(p?.by_country).filter((x) => x.pays !== "Non renseigné");
  if (!p || p.available === false || !rows.length) return null;
  const top = rows[0];
  const abroad = Math.round(rows.filter((x) => x !== top).reduce((s, x) => s + x.pct, 0) * 10) / 10;
  const flows = new Map(arr(t?.period_countries).map((x) => [x.pays, x.pct]));
  const max = Math.max(1, ...rows.map((x) => x.pct));
  return (
    <section className="section reveal" aria-labelledby="h-ou">
      <Head id="ou" eyebrow="02 · Où sont nos porteurs" title={`${fp(top.pct)} de l'encours est détenu depuis ${top.pays === "France" ? "la France" : top.pays} ; ${fp(abroad)} depuis ${rows.length - 1} autres pays.`}
        lede="Pays du porteur (colonne Pays des positions). À droite, la part du même pays dans le volume des opérations sur 60 jours ouvrés : un pays plus actif que son poids attire, ou perd, des capitaux." />
      <ol className="pa-geo">
        {rows.map((x) => (
          <li key={x.pays}>
            <Flag iso={x.iso} className="pa-geo__f" title={x.pays} />
            <span className="pa-geo__n">{x.pays}</span>
            <span className="pa-geo__bar" aria-hidden="true"><i style={{ width: `${(x.pct / max) * 100}%` }} /></span>
            <b className="num pa-geo__v">{fp(x.pct)}</b>
            <span className="small muted num pa-geo__t">{flows.has(x.pays) ? <>volume {fp(flows.get(x.pays))}</> : "—"}</span>
          </li>
        ))}
      </ol>
    </section>
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

// ================================================================== 5. ce qui est détenu
export function HoldingsSection({ p }: { p: Positions | null | undefined }) {
  if (!p || p.available === false) return null;
  const funds = arr(p.top_funds);
  const d0 = arr(p.by_desk)[0], c0 = arr(p.by_class)[0];
  return (
    <section className="section reveal pa-pos" aria-labelledby="h-quoi">
      <Head id="quoi" eyebrow="05 · Ce que détiennent nos clients" title={d0 && c0 ? `Le desk ${d0.desk} porte ${fp(d0.pct)} de l'encours ; ${classFr(c0.classe_actif).toLowerCase()} : ${fp(c0.pct)}.` : "Ce que détiennent nos clients."}
        lede={<>Desk de gestion × classe d'actifs, hauteur = part de l'encours. {tr(p.total, "positions")} à la date de la photo.</>} />
      <MatrixBlock p={p} />
      <div className="pa-hold">
        <div>
          <div className="eyebrow">Les fonds les plus détenus</div>
          {funds.length ? (
            <ol className="pa-funds">
              {funds.map((f, i) => (
                <li key={f.fund}><span className="num pa-funds__i">{String(i + 1).padStart(2, "0")}</span>
                  <Link className="link" to={`/fonds/${encodeURIComponent(f.fund)}`}>{f.name ?? f.fund}</Link>
                  <b className="num">{fp(f.pct)}</b><span className="small muted">{tr(f.positions, "positions")}</span></li>
              ))}
            </ol>
          ) : <p className="small muted">Aucun ISIN des positions n'est rattaché au référentiel des parts (voir la lecture des tables).</p>}
        </div>
        <div>
          <div className="eyebrow">Par type de fonds</div>
          <ShareBars items={arr(p.by_fund_type)} label={(x) => x.type_fonds} pct={(x) => x.pct} tranche={(x) => x.tranche} unit="positions" />
          <div className="eyebrow pa-who__t2">Par société de gestion</div>
          <ShareBars items={arr(p.by_sdg)} label={(x) => x.sdg} pct={(x) => x.pct} tranche={(x) => x.tranche} unit="positions" />
        </div>
      </div>
    </section>
  );
}

// ================================================================== 6. mouvements sur 60 jours ouvrés
const UP = ["Souscription", "Transfert entrant"], DOWN = ["Rachat", "Transfert sortant"];

export function FlowsSection({ t }: { t: Transactions | null | undefined }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const svg = useRef<SVGSVGElement>(null);
  const [sel, setSel] = useState<number | null>(null);
  const days = arr(t?.days);
  const ok = !!t && t.available !== false && days.length > 0;
  useEffect(() => {
    const el = svg.current;
    if (!el || !W || prefersReducedMotion()) return;
    const bars = el.querySelectorAll<SVGRectElement>("rect.pa-fl__b");
    const tw = gsap.fromTo(bars, { opacity: 0 }, { opacity: 1, duration: 0.5, stagger: 0.006, ease: "power2.out", paused: true });
    const stop = onVisible(el, () => tw.play());
    return () => { stop(); tw.progress(1).kill(); };
  }, [W, days.length]);
  const statuts = arr(t?.statuts);
  if (!ok) return (
    <section className="section reveal" aria-labelledby="h-flux">
      <Head id="flux" eyebrow="06 · Mouvements" title="Les opérations des 60 derniers jours ouvrés" />
      <Missing what="Transactions" reason={t?.reason} />
      {statuts.length > 0 && <StatutsLine statuts={statuts} />}
    </section>
  );
  const ps = new Map(arr(t!.period_sens).map((x) => [x.sens, x.pct]));
  const sub = ps.get("Souscription") ?? 0, red = ps.get("Rachat") ?? 0;
  const H = 260, mid = H / 2, n = days.length, bw = Math.max(2, (W || 1) / n - 2), x = (i: number) => i * ((W || 1) / n) + 1;
  const y = (v: number) => (v / 100) * (mid - 8);
  const d = sel != null ? days[sel] : days[days.length - 1];
  const desks = useDeskSplit(t!);
  return (
    <section className="section reveal" aria-labelledby="h-flux">
      <Head id="flux" eyebrow={`06 · Mouvements · ${dFull(t!.first)} → ${dFull(t!.last)}`}
        title={`Sur ${t!.n_days ?? n} jours ouvrés, les souscriptions font ${fp(sub)} du volume, les rachats ${fp(red)}.`}
        lede={<>Chaque jour, la répartition de son volume absolu (Montant EUR) : au-dessus de l'axe ce qui entre, au-dessous ce qui sort. Ce sont des parts du volume, jamais un flux net. {t!.late?.calculable ? <>Après cut-off&nbsp;: <b>{fp(t!.late.pct)}</b> du volume.</> : <>Après cut-off&nbsp;: <b>non calculable</b> (statut indisponible).</>}</>} />
      <div className="pa-fl">
        <div className="pa-fl__chart" ref={box}>
          {W > 0 && (
            <svg ref={svg} width={W} height={H + 24} role="img" aria-label={`Répartition quotidienne du volume des opérations, du ${dFull(t!.first)} au ${dFull(t!.last)}`}
              onMouseLeave={() => setSel(null)}>
              {[-100, -50, 50, 100].map((v) => <line key={v} className="pa-fl__grid" x1={0} x2={W} y1={mid - y(v)} y2={mid - y(v)} />)}
              {days.map((dd, i) => {
                const m = new Map(arr(dd.sens).map((s) => [s.sens, s.pct]));
                let up = 0, dn = 0;
                return (
                  <g key={dd.date} onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)} tabIndex={0} aria-label={`${dLong(dd.date)} : ${arr(dd.sens).map((s) => `${s.sens} ${fp(s.pct)}`).join(", ")}`}>
                    <rect x={x(i) - 1} y={0} width={bw + 2} height={H} fill="transparent" />
                    {UP.map((s) => { const v = m.get(s) ?? 0; const r = <rect key={s} className="pa-fl__b" x={x(i)} y={mid - y(up + v)} width={bw} height={Math.max(0, y(v) - 0.6)} fill={sensColor(s)} />; up += v; return r; })}
                    {DOWN.map((s) => { const v = m.get(s) ?? 0; const r = <rect key={s} className="pa-fl__b" x={x(i)} y={mid + y(dn) + 0.6} width={bw} height={Math.max(0, y(v) - 0.6)} fill={sensColor(s)} />; dn += v; return r; })}
                    {dd.late_pct != null && dd.late_pct > 0 && <rect x={x(i) + bw / 2 - 2} y={H + 8} width={4} height={4} className="pa-fl__lm" />}
                    {sel === i && <rect x={x(i) - 1} y={2} width={bw + 2} height={H - 4} className="pa-fl__sel" />}
                  </g>
                );
              })}
              <line className="pa-fl__axis" x1={0} x2={W} y1={mid} y2={mid} />
              <text className="pa-fl__k" x={4} y={14}>entrées</text><text className="pa-fl__k" x={4} y={H - 6}>sorties</text>
              <text className="pa-fl__k" x={0} y={H + 22}>{dShort(t!.first)}</text><text className="pa-fl__k" x={W} y={H + 22} textAnchor="end">{dShort(t!.last)}</text>
            </svg>
          )}
          <ul className="pa-fl__leg">
            {["Souscription", "Rachat", "Transfert entrant", "Transfert sortant"].map((s) => <li key={s}><i style={{ background: sensColor(s) }} />{s}<b className="num">{fp(ps.get(s))}</b></li>)}
            <li><i className="pa-fl__li" />Jour avec opérations après cut-off</li>
          </ul>
        </div>
        <aside className="pa-fl__day" aria-live="polite">
          <div className="eyebrow">{sel == null ? "Dernier jour" : "Jour survolé"}</div>
          <div className="pa-fl__date">{dLong(d.date)}</div>
          <div className="small muted">{tr(d.ops, "opérations")}{d.late_pct != null ? <> · après cut-off {fp(d.late_pct)}</> : null}</div>
          <ul className="pa-fl__mix">
            {[...arr(d.sens)].sort((a, b) => sensRank(a.sens) - sensRank(b.sens)).map((s) => <li key={s.sens}><i style={{ background: sensColor(s.sens) }} />{s.sens}<b className="num">{fp(s.pct)}</b></li>)}
          </ul>
          <div className="eyebrow pa-who__t2">Par desk, ce jour-là</div>
          <ShareBars key={d.date} items={arr(d.desks)} label={(x) => x.desk} pct={(x) => x.pct} tranche={(x) => x.tranche} unit="opérations" />
        </aside>
      </div>
      <div className="pa-fl__desks">
        <div className="eyebrow">Sur la période, par desk : ce qui entre et ce qui sort (part du volume total)</div>
        <ul>
          {desks.map((r) => (
            <li key={r.desk}>
              <span className="pa-fl__dn">{r.desk}</span>
              <span className="pa-fl__two" aria-hidden="true">
                <span className="pa-fl__in"><i style={{ width: `${(r.inn / desks.max) * 100}%` }} /></span>
                <span className="pa-fl__out"><i style={{ width: `${(r.out / desks.max) * 100}%` }} /></span>
              </span>
              <span className="num small">{fp(r.inn)} entrées · {fp(r.out)} sorties</span>
            </li>
          ))}
        </ul>
      </div>
      <StatutsLine statuts={statuts} />
    </section>
  );
}

function useDeskSplit(t: Transactions) {
  const rows = new Map<string, { desk: string; inn: number; out: number }>();
  arr(t.period_desk_sens).forEach((x) => {
    const r = rows.get(x.desk) ?? { desk: x.desk, inn: 0, out: 0 };
    if (UP.includes(x.sens)) r.inn += x.pct; else if (DOWN.includes(x.sens)) r.out += x.pct;
    rows.set(x.desk, r);
  });
  const list = [...rows.values()].map((r) => ({ ...r, inn: Math.round(r.inn * 10) / 10, out: Math.round(r.out * 10) / 10 })).sort((a, b) => b.inn + b.out - a.inn - a.out);
  return Object.assign(list, { max: Math.max(1, ...list.map((r) => Math.max(r.inn, r.out))) });
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

// ================================================================== 7. les comptes
export function AccountsSection({ c }: { c: PassifResp["comptes"] }) {
  if (!c || c.available === false) return (
    <section className="section reveal" aria-labelledby="h-comptes"><Head id="comptes" eyebrow="07 · Les comptes" title="Les comptes" /><Missing what="Comptes" reason={c?.reason} /></section>
  );
  const ten = arr(c.teneurs);
  return (
    <section className="section reveal" aria-labelledby="h-comptes">
      <Head id="comptes" eyebrow="07 · Les comptes" title={`${ten.length} teneurs de compte, ${count(c.total, "comptes")} et ${count(c.clients, "clients")}.`}
        lede={<>Effectifs en tranches. {c.dissolution_rule}</>} />
      <div className="pa-acc__facts">
        <div><span className="eyebrow">Ouverts</span><b className="num">{tr(c.open)}</b></div>
        <div><span className="eyebrow">Dissous</span><b className="num">{tr(c.dissolved)}</b></div>
        <div><span className="eyebrow">Avec compte parent</span><b className="num">{tr(c.with_parent)}</b></div>
        <div><span className="eyebrow">Sans compte parent</span><b className="num">{tr(c.without_parent)}</b></div>
        <div><span className="eyebrow">Date de création renseignée</span><b className="num">{tr(c.creation_known)}</b></div>
      </div>
      <div className="pa-acc">
        {ten.map((x) => (
          <div key={x.teneur} className="pa-acc__c">
            <div className="pa-acc__h"><b>{x.teneur}</b><span className="num">{tr(x.tranche, "comptes")}</span></div>
            {x.clients && <div className="small muted">{x.clients.label} clients</div>}
            <ul>{arr(x.classifications).map((k) => (
              <li key={k.classification} className={k.active === false ? "is-off" : ""}>
                <i className="pa-sq" style={{ background: natureColor(natureOfLabel(k.classification)) }} /><span>{k.label}</span><RankMeter t={k.tranche} /><span className="num small">{k.tranche?.label}</span>
              </li>
            ))}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ================================================================== 8. lecture des tables sources
const TABLE_LABEL = { compte: "Compte", position: "Position", transaction: "Transaction" } as const;

export function LectureSection({ l, asOf, t }: { l: Lecture | null | undefined; asOf?: string | null; t?: Transactions | null }) {
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
      {(["compte", "position", "transaction"] as const).map((k) => <LectureCard key={k} name={k} tb={l.tables[k]} env={l.env[k]} />)}
    </section>
  );
}

function LectureCard({ name, tb, env }: { name: "compte" | "position" | "transaction"; tb: LectureTable; env: string }) {
  const [open, setOpen] = useState(name === "position");
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

// ================================================================== matrice desk × classe d'actifs (3D, ou tableau)
function MatrixBlock({ p }: { p: Positions }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<MatrixSceneT | null>(null);
  const reduced = useReducedMotion();
  const [gl] = useState(() => webglAvailable());
  const [narrow] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(max-width: 760px)").matches);
  const [table, setTable] = useState(!gl || narrow);
  const [tip, setTip] = useState<{ c: MatrixCell; x: number; y: number } | null>(null);
  const [axis, setAxis] = useState<"desk" | "classe" | "devise">("desk");
  const [focus, setFocus] = useState<{ desk: string | null; classe: string | null }>({ desk: null, classe: null });
  const cells = arr(p.matrix);
  const rows = useMemo(() => { const o = arr(p.by_desk).map((x) => x.desk); cells.forEach((c) => { if (!o.includes(c.desk)) o.push(c.desk); }); return o; }, [p]);
  const cols = useMemo(() => { const o = arr(p.by_class).map((x) => x.classe_actif); cells.forEach((c) => { if (!o.includes(c.classe_actif)) o.push(c.classe_actif); }); return o; }, [p]);
  const deskPct = new Map(arr(p.by_desk).map((x) => [x.desk, x.pct]));
  const classPct = new Map(arr(p.by_class).map((x) => [x.classe_actif, x.pct]));

  useEffect(() => {
    if (table || !gl || !host.current || !labels.current || !cells.length) return;
    let alive = true;
    let stop = () => undefined as void;
    import("../three/PassifScene").then(({ MatrixScene }) => {
      if (!alive || !host.current || !labels.current) return;
      const s = new MatrixScene(host.current, cells, { reduced, labelLayer: labels.current, rows, cols, colLabel: classFr, fmt: fp,
        onHover: (c, x, y) => setTip(c ? { c, x, y } : null) });
      scene.current = s;
      stop = onVisible(host.current, () => s.play(), "0px 0px -20% 0px");
    });
    return () => { alive = false; stop(); scene.current?.dispose(); scene.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, gl, reduced, cells, rows, cols]);
  useEffect(() => { scene.current?.highlight(focus.desk, focus.classe); }, [focus]);

  return (
    <div className="pa-mx">
      <div className="pa-mx__main">
        <div className="pa-mx__bar">
          <span className="small muted">Desk de gestion × classe d'actifs · hauteur&nbsp;: part de l'encours</span>
          {gl && <button type="button" className="btn btn--ghost pa-btn-s" onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? <><I.Cube size={15} /> Vue 3D</> : <><I.List size={15} /> Vue tableau</>}</button>}
        </div>
        {!cells.length ? <div className="empty small">Aucun croisement desk × classe d'actifs publié.</div> : !table ? (
          <div className="pa-mx__stage">
            <div className="pa-mx__canvas" ref={host} />
            <div className="pa-mx__labels" ref={labels} aria-hidden="true" />
            <div className="pa-mx__hint small" aria-hidden="true">Faites glisser pour tourner · survolez une colonne</div>
            <div className="pa-mx__scale" aria-hidden="true"><span>faible</span><i /><span>forte</span><em>part de l'encours</em></div>
            {tip && (
              <Tip x={tip.x} y={tip.y}>
                <div className="city__tip-f">Desk {tip.c.desk}</div>
                <div className="city__tip-n">{classFr(tip.c.classe_actif)}</div>
                <div className="city__tip-v num">{fp(tip.c.pct)} <span className="small">de l'encours</span></div>
                <div className="city__tip-s small">Desk&nbsp;: {fp(deskPct.get(tip.c.desk))} · Classe&nbsp;: {fp(classPct.get(tip.c.classe_actif))}</div>
              </Tip>
            )}
          </div>
        ) : <HeatTable cells={cells} rows={rows} cols={cols} deskPct={deskPct} classPct={classPct} />}
      </div>
      <aside className="pa-mx__side">
        <div className="seg" role="radiogroup" aria-label="Répartition">
          {([["desk", "Desk"], ["classe", "Classe d'actifs"], ["devise", "Devise"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={axis === k} className="seg__b" onClick={() => setAxis(k)}>{l}</button>
          ))}
        </div>
        <div className="pa-mx__list">
          {axis === "desk" && <ShareBars key="d" items={arr(p.by_desk)} label={(x) => x.desk} pct={(x) => x.pct} tranche={(x) => x.tranche} unit="positions"
            onHover={(x) => setFocus({ desk: x?.desk ?? null, classe: null })} active={(x) => focus.desk === x.desk} />}
          {axis === "classe" && <ShareBars key="c" items={arr(p.by_class)} label={(x) => classFr(x.classe_actif)} pct={(x) => x.pct} tranche={(x) => x.tranche} unit="positions"
            onHover={(x) => setFocus({ desk: null, classe: x?.classe_actif ?? null })} active={(x) => focus.classe === x.classe_actif} />}
          {axis === "devise" && <ShareBars key="v" items={arr(p.by_currency)} label={(x) => x.devise} pct={(x) => x.pct} tranche={(x) => x.tranche} unit="positions" />}
        </div>
        <div className="pa-resid">
          <div className="pa-resid__v"><span className="num">{p.residual_pct == null ? "—" : fp(p.residual_pct)}</span></div>
          <p className="small"><strong>Part résiduelle.</strong> Poids des groupes de moins de 5 positions, masqués&nbsp;: ils restent comptés dans le total mais ne sont jamais détaillés.</p>
        </div>
      </aside>
    </div>
  );
}

function HeatTable({ cells, rows, cols, deskPct, classPct }: { cells: MatrixCell[]; rows: string[]; cols: string[]; deskPct: Map<string, number>; classPct: Map<string, number> }) {
  const m = new Map(cells.map((c) => [`${c.desk}|${c.classe_actif}`, c.pct]));
  const max = Math.max(0.1, ...cells.map((c) => c.pct));
  return (
    <div className="table-wrap pa-heat">
      <table className="t t--mini">
        <caption className="sr-only">Part de l'encours par desk et classe d'actifs</caption>
        <thead><tr><th scope="col">Desk</th>{cols.map((c) => <th key={c} scope="col" className="n">{classFr(c)}</th>)}<th scope="col" className="n">Total</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th scope="row" className="pa-heat__r">{r}</th>
              {cols.map((c) => {
                const v = m.get(`${r}|${c}`);
                return <td key={c} className="n pa-heat__c" style={v == null ? undefined : { background: goldRamp((v / max) * 0.9), color: v / max > 0.55 ? "#0a0f1a" : "var(--ink)" }}>{v == null ? <span className="muted">·</span> : fp(v)}</td>;
              })}
              <td className="n strong">{fp(deskPct.get(r))}</td>
            </tr>
          ))}
          <tr className="pa-heat__tot"><th scope="row">Total</th>{cols.map((c) => <td key={c} className="n strong">{fp(classPct.get(c))}</td>)}<td /></tr>
        </tbody>
      </table>
      <p className="small muted pa-heat__n">« · »&nbsp;: aucun groupe publié pour ce croisement.</p>
    </div>
  );
}

