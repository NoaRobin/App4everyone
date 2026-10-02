/**
 * Passif — positions (photo de l'encours), transactions (60 jours) et lecture des tables sources.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../lib/context";
import { gsap, onVisible } from "../lib/gsap";
import { prefersReducedMotion, useReducedMotion, webglAvailable } from "../lib/motion";
import { Head } from "./Editorial";
import * as I from "./Icon";
import {
  arr, dDay, dFull, dLong, dMonth, dShort, fp, goldRamp, natureColor, natureOf, NATURE_LABEL, NATURE_ORDER, rankOf, sensColor, sensRank,
  ShareBars, SENS_ORDER, Tip, tr, TrancheChip,
  type Comptes, type Day, type MapTable, type Nature, type PassifResp, type Positions, type Transactions,
} from "./PassifKit";
import type { MatrixCell, MatrixScene as MatrixSceneT } from "../three/PassifScene";

const CLASS_FR: Record<string, string> = { Diversified: "Diversifié", "Fixed Income": "Taux", Equities: "Actions", "Money Market": "Monétaire", Alternative: "Alternatif" };
export const classFr = (c: string) => CLASS_FR[c] ?? c;

// ================================================================== positions
export function PositionsSection({ p, asOf, funds, comptes }: { p: Positions | null | undefined; asOf?: string | null; funds: PassifResp["funds"]; comptes: Comptes | null | undefined }) {
  const ok = !!p && p.available !== false;
  return (
    <section className="section reveal pa-pos" aria-labelledby="h-positions">
      <Head id="positions" eyebrow="Positions · le stock" title="La photo de l'encours"
        lede={<>Au {dFull(asOf)} · {p?.measure ?? "part de l'encours"} · {tr(p?.total, "positions")}. Chaque part est calculée dans la source sur l'encours total&nbsp;; aucun montant n'en sort.</>} />
      {!ok ? <div className="empty small">Les positions ne sont pas publiées pour cette date.</div> : (
        <>
          <MatrixBlock p={p!} />
          <ClientMosaic p={p!} comptes={comptes} />
          <FundsBlock funds={funds} />
          <GroupsTable p={p!} />
        </>
      )}
    </section>
  );
}

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

/** Mosaïque (marimekko) : largeur d'une colonne = part de l'encours du teneur ; hauteur d'un pavé = part de la classification dans le teneur. */
function ClientMosaic({ p, comptes }: { p: Positions; comptes: Comptes | null | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ t: string; label: string; pct: number; tranche: PassifTr; nat: Nature; x: number; y: number } | null>(null);
  const flags = new Map(arr(comptes?.teneurs).flatMap((t) => arr(t.classifications).map((c) => [c.classification, c] as const)));
  const byTen = arr(p.by_teneur);
  const cl = arr(p.by_client);
  const cols = (byTen.length ? byTen.map((t) => ({ teneur: t.teneur, pct: t.pct, tranche: t.tranche })) : [...new Set(cl.map((c) => c.teneur))].map((t) => ({ teneur: t, pct: cl.filter((c) => c.teneur === t).reduce((s, c) => s + c.pct, 0), tranche: null })))
    .filter((c) => c.pct > 0);
  const total = cols.reduce((s, c) => s + c.pct, 0) || 1;
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const segs = el.querySelectorAll(".pa-mk__s");
    gsap.set(segs, { scaleY: 0, transformOrigin: "50% 100%" });
    return onVisible(el, () => gsap.to(segs, { scaleY: 1, duration: 0.9, ease: "power3.out", stagger: { each: 0.03, from: "start" }, clearProps: "transform" }));
  }, [cl.length]);
  if (!cl.length) return null;
  const label = (c: string) => flags.get(c)?.label ?? (c.split("/").slice(1).join("/").trim() || c);
  return (
    <div className="pa-sub">
      <div className="pa-sub__h">
        <h3 className="pa-sub__t">Par type de client</h3>
        <p className="small muted">Largeur d'une colonne&nbsp;: part de l'encours détenue via le teneur de compte. Pavés&nbsp;: classifications de comptes, empilées par nature. Surface = part de l'encours.</p>
      </div>
      <div className="pa-mk" ref={ref} onMouseLeave={() => setTip(null)}>
        <div className="pa-mk__plot" role="img" aria-label={`Part de l'encours par teneur et classification : ${cl.map((c) => `${label(c.classification)} (${c.teneur}) ${fp(c.pct)}`).join(", ")}`}>
          {cols.map((col) => {
            const segs = cl.filter((c) => c.teneur === col.teneur)
              .map((c) => ({ ...c, nat: natureOf(flags.get(c.classification) ?? { label: label(c.classification) }) }))
              .sort((a, b) => NATURE_ORDER.indexOf(a.nat) - NATURE_ORDER.indexOf(b.nat) || b.pct - a.pct);
            const sum = segs.reduce((s, c) => s + c.pct, 0) || 1;
            const w = (col.pct / total) * 100;
            return (
              <div key={col.teneur} className="pa-mk__col" style={{ flexBasis: `${w}%` }}>
                <div className="pa-mk__stack">
                  {segs.map((s) => {
                    const h = (s.pct / sum) * 100;
                    const fits = w > 9 && h > 12;
                    return (
                      <div key={s.classification} className="pa-mk__s" style={{ height: `calc(${h}% - 2px)`, background: natureColor(s.nat) }}
                        onMouseMove={(e) => { const b = ref.current!.getBoundingClientRect(); setTip({ t: s.teneur, label: label(s.classification), pct: s.pct, tranche: s.tranche, nat: s.nat, x: e.clientX - b.left, y: e.clientY - b.top }); }}>
                        {fits && <span className="pa-mk__l"><span>{label(s.classification)}</span><b className="num">{fp(s.pct)}</b></span>}
                      </div>
                    );
                  })}
                </div>
                <div className="pa-mk__foot">{w > 6 ? <><span className="pa-mk__n">{col.teneur}</span><span className="num small">{fp(col.pct)}</span></> : <span className="pa-mk__n pa-mk__n--s" title={`${col.teneur} ${fp(col.pct)}`}>{col.teneur.slice(0, 3)}</span>}</div>
              </div>
            );
          })}
        </div>
        {tip && (
          <Tip x={tip.x} y={tip.y}>
            <div className="city__tip-f"><span className="dot" style={{ background: natureColor(tip.nat) }} />{tip.t} · {NATURE_LABEL[tip.nat]}</div>
            <div className="city__tip-n">{tip.label}</div>
            <div className="city__tip-v num">{fp(tip.pct)} <span className="small">de l'encours</span></div>
            <div className="city__tip-s small">{tr(tip.tranche, "positions")}</div>
          </Tip>
        )}
        <ul className="pa-legend">
          {NATURE_ORDER.filter((n) => cl.some((c) => natureOf(flags.get(c.classification) ?? { label: label(c.classification) }) === n)).map((n) => <li key={n}><span className="pa-sw" style={{ background: natureColor(n) }} />{NATURE_LABEL[n]}</li>)}
        </ul>
      </div>
      <div className="pa-mk__table">
        {cols.map((col) => (
          <div key={col.teneur} className="pa-mk__g">
            <div className="pa-mk__gh"><span>{col.teneur}</span><span className="num">{fp(col.pct)}</span></div>
            <ul>
              {cl.filter((c) => c.teneur === col.teneur).sort((a, b) => b.pct - a.pct).map((c) => {
                const nat = natureOf(flags.get(c.classification) ?? { label: label(c.classification) });
                return <li key={c.classification}><span className="pa-sw" style={{ background: natureColor(nat) }} /><span className="pa-mk__gl">{label(c.classification)}</span><span className="num">{fp(c.pct)}</span><span className="small muted">{tr(c.tranche)}</span></li>;
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
type PassifTr = Day["ops"];

function FundsBlock({ funds }: { funds: PassifResp["funds"] }) {
  const { entries } = useApp();
  const [all, setAll] = useState(false);
  const names = useMemo(() => new Map(entries.filter((e) => e.t === "fonds").map((e) => [e.id, e.label])), [entries]);
  const rows = Object.entries(funds ?? {}).map(([id, v]) => ({ id, name: names.get(id) ?? null, pct: v.pct, tranche: v.positions })).sort((a, b) => b.pct - a.pct);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, 12);
  return (
    <div className="pa-sub">
      <div className="pa-sub__h">
        <h3 className="pa-sub__t">Les fonds détenus</h3>
        <p className="small muted">{rows.length} fonds publiés (au moins 5 positions). Part de l'encours et tranche du nombre de positions.</p>
      </div>
      <ShareBars key={all ? "all" : "top"} className="pa-bars--cols" items={shown}
        label={(x) => x.name ? <Link className="link" to={`/fonds/${x.id}`}>{x.name}</Link> : <span className="muted">Fonds non référencé</span>}
        pct={(x) => x.pct} tranche={(x) => x.tranche} unit="positions" />
      {rows.length > 12 && <button type="button" className="chip pa-more" onClick={() => setAll((a) => !a)}>{all ? "Afficher les 12 premiers" : `Afficher les ${rows.length} fonds`}</button>}
    </div>
  );
}

function GroupsTable({ p }: { p: Positions }) {
  const g = arr(p.groups);
  if (!g.length) return null;
  return (
    <details className="pa-details">
      <summary><span>Les {g.length} groupes publiés</span><span className="small muted">desk × classe d'actifs × devise, au moins 5 positions chacun</span></summary>
      <div className="table-wrap">
        <table className="t t--mini">
          <thead><tr><th scope="col">Desk</th><th scope="col">Classe d'actifs</th><th scope="col">Devise</th><th scope="col" className="n">Part de l'encours</th><th scope="col">Positions</th></tr></thead>
          <tbody>
            {g.map((x, i) => <tr key={i}><td>{x.desk}</td><td>{classFr(x.classe_actif)}</td><td>{x.devise}</td><td className="n">{fp(x.pct)}</td><td><TrancheChip t={x.tranche} /></td></tr>)}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ================================================================== transactions
export function TransactionsSection({ t }: { t: Transactions | null | undefined }) {
  const days = arr(t?.days);
  const ok = !!t && t.available !== false && days.length > 0;
  const [sel, setSel] = useState(days.length - 1);
  const [hov, setHov] = useState<number | null>(null);
  const period = [...arr(t?.period_sens)].sort((a, b) => sensRank(a.sens) - sensRank(b.sens));
  return (
    <section className="section reveal pa-tx" aria-labelledby="h-transactions">
      <Head id="transactions" eyebrow="Transactions · le flux" title="Soixante jours d'opérations"
        lede={<>Du {dFull(t?.first)} au {dFull(t?.last)} · {t?.measure ?? "part du volume absolu"} de chaque journée · {tr(t?.ops, "opérations")} sur la période.</>} />
      {!ok ? <div className="empty small">Aucune journée de transactions publiée.</div> : (
        <>
          <PeriodTiles period={period} late={t!.period_late_pct} ops={t!.ops} />
          <p className="pa-nonet small"><I.Info size={15} /> Parts du volume absolu, pas des flux&nbsp;: souscriptions et rachats sont montrés côte à côte, jamais soustraits. Cette page ne calcule aucune collecte nette.</p>
          <div className="pa-days">
            <DaysChart days={days} sel={sel} hov={hov} onSel={setSel} onHov={setHov} />
            <DayCard d={days[Math.min(days.length - 1, Math.max(0, hov ?? sel))]} i={hov ?? sel} n={days.length} onNav={(k) => setSel(Math.max(0, Math.min(days.length - 1, k)))} preview={hov != null && hov !== sel} />
          </div>
          <div className="pa-tx__period">
            <div>
              <h3 className="pa-sub__t">Par desk, sur la période</h3>
              <ShareBars items={arr(t!.period_desks)} label={(x) => x.desk} pct={(x) => x.pct} tranche={(x) => x.tranche} unit="opérations" color="var(--brand-stone)" />
            </div>
            <div>
              <h3 className="pa-sub__t">Par classe d'actifs, sur la période</h3>
              <ShareBars items={arr(t!.period_classes)} label={(x) => classFr(x.classe_actif)} pct={(x) => x.pct} tranche={(x) => x.tranche} unit="opérations" color="var(--brand-stone)" />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function PeriodTiles({ period, late, ops }: { period: { sens: string; pct: number; tranche?: PassifTr }[]; late?: number | null; ops?: PassifTr }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const vs = Array.from(el.querySelectorAll<HTMLElement>("[data-v]"));
    const keys = el.querySelectorAll(".pa-pt__key");
    const fmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    vs.forEach((v) => { v.textContent = fmt.format(0); });
    gsap.set(keys, { scaleX: 0, transformOrigin: "left center" });
    return onVisible(el, () => {
      vs.forEach((v, i) => {
        const o = { x: 0 };
        gsap.to(o, { x: Number(v.dataset.v), duration: 1.4, delay: i * 0.08, ease: "power3.out", onUpdate: () => { v.textContent = fmt.format(o.x); } });
      });
      gsap.to(keys, { scaleX: 1, duration: 1, stagger: 0.08, ease: "power3.out", clearProps: "transform" });
    });
  }, [period.length]);
  if (!period.length) return null;
  return (
    <div className="pa-pt" ref={ref}>
      {period.map((s) => (
        <div key={s.sens} className="pa-pt__c">
          <span className="pa-pt__key" style={{ background: sensColor(s.sens) }} aria-hidden="true" />
          <span className="pa-pt__l">{s.sens}</span>
          <span className="pa-pt__v"><span className="num" data-v={s.pct}>{fp(s.pct).replace(/\s?%$/, "")}</span><span className="pa-pt__u">%</span></span>
          <span className="small muted">{tr(s.tranche, "opérations")}</span>
        </div>
      ))}
      <div className="pa-pt__c pa-pt__c--late">
        <span className="pa-pt__key pa-pt__key--late" aria-hidden="true" />
        <span className="pa-pt__l">Après cut-off</span>
        <span className="pa-pt__v"><span className="num" data-v={late ?? 0}>{late == null ? "—" : fp(late).replace(/\s?%$/, "")}</span><span className="pa-pt__u">%</span></span>
        <span className="small muted">du volume · {tr(ops, "opérations")} au total</span>
      </div>
    </div>
  );
}

function DaysChart({ days, sel, hov, onSel, onHov }: { days: Day[]; sel: number; hov: number | null; onSel: (i: number) => void; onHov: (i: number | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const desks = useMemo(() => {
    const score = new Map<string, number>();
    days.forEach((d) => arr(d.desks).forEach((x) => score.set(x.desk, (score.get(x.desk) ?? 0) + x.pct)));
    return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [days]);
  const deskMax = Math.max(1, ...days.flatMap((d) => arr(d.desks).map((x) => x.pct)));
  const lateMax = Math.max(1, ...days.map((d) => d.late_pct ?? 0));
  const N = days.length;
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const cols = el.querySelectorAll(".pa-rb__stack");
    const cells = el.querySelectorAll(".pa-hm__c");
    const lates = el.querySelectorAll(".pa-late__b");
    gsap.set(cols, { scaleY: 0, transformOrigin: "50% 100%" });
    gsap.set(cells, { scale: 0.2, opacity: 0 });
    gsap.set(lates, { scaleY: 0, transformOrigin: "50% 100%" });
    return onVisible(el, () => {
      gsap.to(cols, { scaleY: 1, duration: 0.9, stagger: 0.014, ease: "power3.out", clearProps: "transform" });
      gsap.to(lates, { scaleY: 1, duration: 0.7, stagger: 0.012, delay: 0.3, ease: "power2.out", clearProps: "transform" });
      gsap.to(cells, { scale: 1, opacity: 1, duration: 0.5, ease: "power2.out", delay: 0.5, stagger: { grid: [desks.length, N], from: "start", amount: 1.1, axis: "x" }, clearProps: "opacity,transform" });
    });
  }, [N, desks.length]);
  const months = days.map((d, i) => (i === 0 || d.date.slice(5, 7) !== days[i - 1].date.slice(5, 7) ? dMonth(d.date) : null));
  const cur = hov ?? sel;
  const grid = { gridTemplateColumns: `var(--pa-lab) repeat(${N}, minmax(0, 1fr))` };
  const tipDay = hov != null ? days[hov] : null;
  const [tipX, setTipX] = useState(0);
  // L'infobulle vit hors du conteneur défilant (sinon rognée) : on la place d'après la colonne survolée
  const over = (i: number, el: Element) => {
    onHov(i);
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const b = el.getBoundingClientRect();
    const cx = b.left + b.width / 2 - r.left;
    // À côté de la colonne survolée (jamais dessus), du côté où il y a de la place
    setTipX(Math.max(130, Math.min(r.width - 130, cx > r.width / 2 ? cx - 140 : cx + 140)));
  };
  return (
    <div className="pa-dc" ref={ref} onMouseLeave={() => onHov(null)}>
      <div className="pa-dc__scroll">
        <div className="pa-dc__in">
          <div className="pa-rb" style={grid} role="group" aria-label="Part du volume de chaque journée par sens d'opération">
            <div className="pa-rb__axis" aria-hidden="true"><span>100 %</span><span>50 %</span><span>0 %</span></div>
            {days.map((d, i) => {
              const segs = [...arr(d.sens)].sort((a, b) => sensRank(a.sens) - sensRank(b.sens));
              return (
                <button key={d.date} type="button" className={`pa-rb__col${i === sel ? " is-sel" : ""}${i === cur ? " is-cur" : ""}`}
                  onMouseEnter={(e) => over(i, e.currentTarget)} onFocus={(e) => over(i, e.currentTarget)} onBlur={() => onHov(null)} onClick={() => onSel(i)}
                  aria-label={`${dLong(d.date)} : ${segs.map((s) => `${s.sens} ${fp(s.pct)}`).join(", ")} ; après cut-off ${fp(d.late_pct)}`} aria-pressed={i === sel}>
                  <span className="pa-rb__stack">
                    {segs.map((s) => <span key={s.sens} className="pa-rb__s" style={{ height: `calc(${s.pct}% - 2px)`, background: sensColor(s.sens) }} />)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="pa-row" style={grid} aria-hidden="true">
            <span className="pa-row__l">Opérations</span>
            {days.map((d, i) => <span key={d.date} className={`pa-ops${i === cur ? " is-cur" : ""}`} onMouseEnter={(e) => over(i, e.currentTarget)} onClick={() => onSel(i)}><i style={{ width: 3 + rankOf(d.ops) * 1.6, height: 3 + rankOf(d.ops) * 1.6 }} /></span>)}
          </div>
          <div className="pa-row pa-late" style={grid} aria-hidden="true">
            <span className="pa-row__l">Après cut-off</span>
            {days.map((d, i) => <span key={d.date} className={`pa-late__c${i === cur ? " is-cur" : ""}`} onMouseEnter={(e) => over(i, e.currentTarget)} onClick={() => onSel(i)}><i className="pa-late__b" style={{ height: `${((d.late_pct ?? 0) / lateMax) * 100}%` }} /></span>)}
          </div>
          <div className="pa-hm" aria-hidden="true">
            {desks.map((k) => (
              <div key={k} className="pa-row pa-hm__r" style={grid}>
                <span className="pa-row__l">{k}</span>
                {days.map((d, i) => {
                  const v = arr(d.desks).find((x) => x.desk === k)?.pct;
                  return <span key={d.date} className={`pa-hm__c${v == null ? " is-empty" : ""}${i === cur ? " is-cur" : ""}`} style={v == null ? undefined : { background: goldRamp(v / deskMax) }}
                    onMouseEnter={(e) => over(i, e.currentTarget)} onClick={() => onSel(i)} title={v == null ? undefined : `${k} · ${dShort(d.date)} · ${fp(v)}`} />;
                })}
              </div>
            ))}
          </div>
          <div className="pa-row pa-xax" style={grid} aria-hidden="true">
            <span />
            {days.map((d, i) => <span key={d.date} className="pa-xax__t">{months[i] ? <b>{months[i]}</b> : i % 5 === 0 ? dDay(d.date) : ""}</span>)}
          </div>
        </div>
      </div>
      {tipDay && hov != null && (
        <div className="pa-dc__tip" style={{ left: tipX }} aria-hidden="true">
          <div className="city__tip pa-tip pa-tip--static">
            <div className="city__tip-f">{dLong(tipDay.date)}</div>
            {[...arr(tipDay.sens)].sort((a, b) => sensRank(a.sens) - sensRank(b.sens)).map((s) => (
              <div key={s.sens} className="pa-tip__row"><span className="dot" style={{ background: sensColor(s.sens) }} /><span>{s.sens}</span><b className="num">{fp(s.pct)}</b></div>
            ))}
            <div className="city__tip-s small">Après cut-off&nbsp;: {fp(tipDay.late_pct)} · {tr(tipDay.ops, "opérations")}</div>
          </div>
        </div>
      )}
      <div className="pa-dc__legend">
        <ul className="pa-legend">
          {SENS_ORDER.map((s) => <li key={s}><span className="pa-sw" style={{ background: sensColor(s) }} />{s}</li>)}
        </ul>
        <div className="pa-dc__scale small"><span>Activité du desk dans la journée</span><span className="pa-dc__grad" aria-hidden="true" /><span className="num">0 → {fp(deskMax)}</span></div>
      </div>
    </div>
  );
}

function DayCard({ d, i, n, onNav, preview }: { d: Day; i: number; n: number; onNav: (k: number) => void; preview: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    gsap.fromTo(el.querySelectorAll(".pa-dy__anim"), { opacity: 0.25, y: 6 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.025, ease: "power2.out", clearProps: "opacity,transform" });
  }, [d?.date]);
  if (!d) return null;
  const sens = [...arr(d.sens)].sort((a, b) => sensRank(a.sens) - sensRank(b.sens));
  const groups = [...arr(d.groups)].sort((a, b) => b.pct - a.pct).slice(0, 8);
  const sensMax = Math.max(1, ...sens.map((s) => s.pct));
  return (
    <aside className={`pa-dy${preview ? " is-preview" : ""}`} ref={ref} aria-live="polite" aria-label="Fiche du jour">
      <div className="pa-dy__top">
        <span className="eyebrow">{preview ? "Aperçu · cliquer pour fixer" : "Fiche du jour"}</span>
        <span className="pa-dy__nav">
          <button type="button" className="pa-dy__b" onClick={() => onNav(i - 1)} disabled={i <= 0} aria-label="Journée précédente"><I.ArrowLeft size={15} /></button>
          <button type="button" className="pa-dy__b" onClick={() => onNav(i + 1)} disabled={i >= n - 1} aria-label="Journée suivante"><I.Arrow size={15} /></button>
        </span>
      </div>
      <h3 className="pa-dy__d pa-dy__anim">{dLong(d.date)}</h3>
      <div className="pa-dy__kv pa-dy__anim">
        <span><span className="small muted">Opérations</span><b>{tr(d.ops)}</b></span>
        <span><span className="small muted">Après cut-off</span><b className="num">{fp(d.late_pct)}</b></span>
      </div>
      <div className="pa-dy__h small muted pa-dy__anim">Part du volume par sens · côte à côte, sans compensation</div>
      <ul className="pa-dy__sens">
        {sens.map((s) => (
          <li key={s.sens} className="pa-dy__anim">
            <span className="pa-sw" style={{ background: sensColor(s.sens) }} />
            <span className="pa-dy__sl">{s.sens}</span>
            <span className="pa-dy__track"><span style={{ width: `${(s.pct / sensMax) * 100}%`, background: sensColor(s.sens) }} /></span>
            <b className="num">{fp(s.pct)}</b>
            <span className="small muted pa-dy__st">{tr(s.tranche)}</span>
          </li>
        ))}
      </ul>
      {groups.length > 0 && (
        <>
          <div className="pa-dy__h small muted pa-dy__anim">Groupes principaux</div>
          <ul className="pa-dy__g">
            {groups.map((g, k) => (
              <li key={k} className="pa-dy__anim">
                <span className="pa-sw" style={{ background: sensColor(g.sens) }} title={g.sens} />
                <span className="pa-dy__gl"><b>{g.desk}</b> · {classFr(g.classe_actif)}<span className="small muted"> · {g.sens}{g.statut ? ` · ${g.statut}` : ""}{g.devise ? ` · ${g.devise}` : ""}</span></span>
                <b className="num">{fp(g.pct)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

// ================================================================== lecture des tables sources
const FIELD_FR: Record<string, string> = {
  date: "Date", compte: "Compte", isin: "Code ISIN", classe_actif: "Classe d'actifs", desk: "Desk de gestion", devise: "Devise",
  montant: "Montant", sens: "Sens de l'opération", statut: "Statut",
};
const FIELD_ORDER = ["date", "compte", "isin", "sens", "statut", "classe_actif", "desk", "devise", "montant"];
const fieldIdx = (k: string) => { const i = FIELD_ORDER.indexOf(k); return i < 0 ? 99 : i; };

export function MappingSection({ m, residual }: { m: PassifResp["mapping"]; residual: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const rows = el.querySelectorAll(".pa-map__r, .pa-rule");
    gsap.set(rows, { opacity: 0, x: -10 });
    return onVisible(el, () => gsap.to(rows, { opacity: 1, x: 0, duration: 0.6, stagger: 0.03, ease: "power2.out", clearProps: "opacity,transform" }));
  }, []);
  return (
    <section className="section reveal pa-mapsec" aria-labelledby="h-lecture">
      <Head id="lecture" eyebrow="Transparence" title="Lecture des tables sources"
        lede={<>Les tables Fabric n'ont que des colonnes génériques (<code>_c0</code> … <code>_cN</code>). Le rôle de chaque colonne est reconnu automatiquement, à partir de formes et de vocabulaires, sans jamais afficher une valeur.</>} />
      <div ref={ref}>
        <div className="pa-map">
          <MapCard title="Table des positions" t={m?.position} env="APP_PASSIF_MAP_POSITION" />
          <MapCard title="Table des transactions" t={m?.transaction} env="APP_PASSIF_MAP_TRANSACTION" />
        </div>
        <div className="pa-rules">
          <div className="pa-rule"><span className="pa-rule__n">5</span><div><b>Seuil de 5.</b> Aucun groupe de moins de 5 comptes, positions ou opérations n'est montré{residual != null ? <> ; leur poids forme la part résiduelle ({fp(residual)} de l'encours)</> : null}.</div></div>
          <div className="pa-rule"><span className="pa-rule__n">%</span><div><b>Aucun montant.</b> Seules des parts (en %) et des tranches d'effectifs sont publiées ; les tranches sont des ordres de grandeur, pas des nombres exacts.</div></div>
          <div className="pa-rule"><span className="pa-rule__n">±</span><div><b>Pas de flux nets.</b> Souscriptions et rachats sont des parts du volume absolu, montrées côte à côte, jamais soustraites.</div></div>
          <div className="pa-rule"><span className="pa-rule__n">Σ</span><div><b>Agrégats calculés dans Fabric.</b> Aucune ligne de compte, de client ou d'opération ne quitte la source : l'application ne reçoit que des agrégats.</div></div>
        </div>
      </div>
    </section>
  );
}

function confWord(c: number | null | undefined) {
  if (c == null) return { w: "Non évaluée", k: 0 };
  if (c >= 0.9) return { w: "Reconnue", k: 3 };
  if (c >= 0.5) return { w: "Probable", k: 2 };
  return { w: "À confirmer", k: 1 };
}

function MapCard({ title, t, env }: { title: string; t: MapTable | null | undefined; env: string }) {
  const fields = Object.entries(t?.fields ?? {}).sort((a, b) => fieldIdx(a[0]) - fieldIdx(b[0]));
  const pinned = fields.map(([k, f]) => `${k}=${f.col}`).join(",");
  const toConfirm = fields.filter(([, f]) => (f.confidence ?? 0) < 0.9).length;
  return (
    <div className="pa-mapc">
      <div className="pa-mapc__h">
        <h3 className="pa-sub__t">{title}</h3>
        <span className="small muted">{tr(t?.rows, "lignes")}{toConfirm ? <> · <span className="pa-warn">{toConfirm} à confirmer</span></> : null}</span>
      </div>
      {!fields.length ? <p className="small muted">Aucune colonne reconnue.</p> : (
        <ul className="pa-map__list">
          {fields.map(([k, f]) => {
            const c = confWord(f.confidence);
            return (
              <li key={k} className="pa-map__r">
                <span className="pa-map__f">{FIELD_FR[k] ?? k}{k === "montant" && <span className="small muted"> · sert aux parts, jamais affiché</span>}</span>
                <span className="pa-map__arrow" aria-hidden="true">←</span>
                <code className="pa-map__col">{f.col}</code>
                <span className="pa-map__how small muted">{f.how ?? "—"}</span>
                <span className={`pa-conf pa-conf--${c.k}`} title={f.confidence != null ? `confiance ${Math.round(f.confidence * 100)} %` : undefined}>
                  <span className="pa-conf__m" aria-hidden="true"><i /><i /><i /></span>{c.w}
                </span>
                {f.note && <span className="pa-map__note small"><I.Alert size={13} /> {f.note}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {arr(t?.unmapped).length > 0 && (
        <div className="pa-map__un small"><span className="muted">Colonnes non utilisées&nbsp;:</span> {arr(t?.unmapped).map((c) => <code key={c}>{c}</code>)}</div>
      )}
      <div className="pa-map__env small">
        <span className="muted">Pour imposer la correspondance&nbsp;:</span>
        <code className="pa-map__code">{env}="{pinned || "date=_c0,montant=_c10,…"}"</code>
      </div>
    </div>
  );
}
