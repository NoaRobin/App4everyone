/**
 * Comparateur de fonds : trajectoires base 100 en 3D, tableau des indicateurs, podium et carte risque / rendement.
 * La sélection (2 à 6 fonds) et la période sont mémorisées dans l'adresse : /comparateur?ids=a,b,c&p=3A
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, pct } from "../lib/format";
import { FAMILY_LABEL, FAMILY_ORDER, famVar } from "../lib/families";
import { useReducedMotion, webglAvailable } from "../lib/motion";
import { gsap, onVisible } from "../lib/gsap";
import type { FamilyKey } from "../lib/types";
import { ErrorState, Loading, useReveal } from "../components/ui";
import { Head, PageHero } from "../components/Editorial";
import * as I from "../components/Icon";
import type { CompareScene as SceneT, CmpCursor } from "../three/CompareScene";
import type { ComparePodium as PodiumT } from "../three/ComparePodium";
import {
  ALL_ROWS, Flat2D, IndTable, RankBars, Readout, RiskMap, SLOT_COLORS, b100, fmtTime, letterOf, ranked,
  type CFund, type CursorRead, type Ind, type Share, lineDash } from "./CompareCharts";
import "../styles/compare.css";

type FundLite = { id: string; name: string; family: FamilyKey; aum: number | null; perf_1A?: number | null; vol_1A?: number | null; referenced?: boolean; expertise?: string | null };
type FundsResp = { date: string; funds: FundLite[] };
type CmpResp = { date: string; period: string; start: string; funds: { id: string; name: string; family: FamilyKey; series: { d: string; v: number }[]; share: Share; ind: Partial<Ind> }[] };

const PERIODS = [{ k: "1A", l: "1 an" }, { k: "3A", l: "3 ans" }, { k: "5A", l: "5 ans" }, { k: "origine", l: "Origine" }] as const;
type Period = (typeof PERIODS)[number]["k"];
const MAX = 6;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tOf = (d: string) => Date.parse(d.slice(0, 10) + "T00:00:00Z");

// ------------------------------------------------------------------ préréglages
function biggestDistinct(funds: FundLite[], n: number): string[] {
  const out: FundLite[] = [];
  [...funds].filter((f) => f.aum).sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0)).forEach((f) => {
    if (out.length < n && !out.some((o) => o.family === f.family)) out.push(f);
  });
  return out.map((f) => f.id);
}
const PRESETS: { k: string; l: string; pick: (f: FundLite[]) => string[] }[] = [
  { k: "big", l: "Les 3 plus gros fonds", pick: (f) => [...f].sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0)).slice(0, 3).map((x) => x.id) },
  { k: "fam", l: "Un par famille", pick: (f) => FAMILY_ORDER.map((k) => [...f].filter((x) => x.family === k).sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0))[0]).filter(Boolean).map((x) => x.id) },
  { k: "top", l: "Meilleures performances 1 an", pick: (f) => [...f].filter((x) => x.perf_1A != null).sort((a, b) => b.perf_1A! - a.perf_1A!).slice(0, 4).map((x) => x.id) },
  { k: "calm", l: "Les moins volatils", pick: (f) => [...f].filter((x) => x.vol_1A != null && x.aum).sort((a, b) => a.vol_1A! - b.vol_1A!).slice(0, 3).map((x) => x.id) },
];

function useNarrow(q = "(max-width: 760px)") {
  const [v, setV] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setV(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [q]);
  return v;
}

export default function Compare() {
  const { api } = useApp();
  const [sp] = useSearchParams();
  const { data: list, error: listErr } = useApi<FundsResp>(api("/api/funds"));
  const funds = useMemo(() => list?.funds ?? [], [list]);
  const byId = useMemo(() => new Map(funds.map((f) => [f.id, f])), [funds]);
  const period = (PERIODS.some((p) => p.k === sp.get("p")) ? sp.get("p") : "3A") as Period;
  const rawIds = useMemo(() => (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean), [sp]);
  const ids = useMemo(() => (funds.length ? rawIds.filter((id, i) => byId.has(id) && rawIds.indexOf(id) === i).slice(0, MAX) : rawIds.slice(0, MAX)), [rawIds, byId, funds.length]);

  // Adresse lisible (virgules non échappées) : /comparateur?ids=a,b,c&p=3A
  const navTo = useNavigate();
  const setSel = (next: string[], p: Period = period) => {
    const rest = new URLSearchParams(sp);
    rest.delete("ids"); rest.delete("p");
    const extra = rest.toString();
    navTo(`/comparateur?${next.length ? `ids=${next.map(encodeURIComponent).join(",")}&` : ""}p=${p}${extra ? "&" + extra : ""}`, { replace: true });
  };

  // Sélection par défaut : les 3 plus gros fonds de familles différentes
  useEffect(() => {
    if (!funds.length) return;
    if (!rawIds.length) setSel(biggestDistinct(funds, 3));
    else if (ids.length !== rawIds.length) setSel(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funds.length, rawIds.join(",")]);

  // Couleur attachée au fonds, pas à son rang : un fonds garde sa teinte (et sa lettre) quand on en retire un autre
  const slotsRef = useRef(new Map<string, number>());
  const slots = useMemo(() => {
    const m = slotsRef.current;
    [...m.keys()].forEach((k) => { if (!ids.includes(k)) m.delete(k); });
    ids.forEach((id) => {
      if (m.has(id)) return;
      const used = new Set(m.values());
      let s = 0; while (used.has(s)) s++;
      m.set(id, s);
    });
    return new Map(m);
  }, [ids]);

  const url = ids.length ? api(`/api/compare?ids=${ids.join(",")}&period=${period}`) : null;
  const { data, error } = useApi<CmpResp>(url);
  const [last, setLast] = useState<CmpResp | null>(null);
  useEffect(() => { if (data) setLast(data); }, [data]);
  const d = data ?? last;
  const loading = !!url && !data;

  const cfunds: CFund[] = useMemo(() => {
    if (!d) return [];
    const end = tOf(d.date), start = tOf(d.start);
    return d.funds.filter((f) => slots.has(f.id)).map((f) => {
      const seen = new Map<number, number>();
      (f.series ?? []).forEach((p) => { const t = tOf(p.d); if (isFinite(t) && isFinite(p.v) && t <= end) seen.set(t, p.v); });
      let pts = [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
      if (pts.length > 1 && pts[0].t > start && isFinite(start)) pts = [{ t: start, v: 100 }, ...pts];
      const slot = slots.get(f.id) ?? 0;
      return { id: f.id, name: f.name, family: f.family, slot, color: SLOT_COLORS[slot], letter: letterOf(slot), pts, share: f.share, ind: f.ind ?? {} };
    }).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  }, [d, slots, ids]);

  const [focus, setFocus] = useState<string | null>(null);
  useReveal(list ? 1 : null);

  if (listErr) return <div className="page"><ErrorState error={listErr} /></div>;
  if (!list) return <div className="page"><Loading h={520} /></div>;

  const pLabel = PERIODS.find((p) => p.k === period)!.l;
  const live = cfunds.filter((f) => f.pts.length > 1);
  const bestPerf = ranked(ALL_ROWS.find((r) => r.k === "perf_period")!, cfunds)[0];
  const lowVol = ranked(ALL_ROWS.find((r) => r.k === "vol")!, cfunds)[0];
  return (
    <div className="cmp">
      <PageHero
        eyebrow={<>Comparateur · au {fdate(d?.date ?? list.date)}</>}
        title="Comparer nos fonds, côte à côte"
        lede={<>Jusqu'à six fonds sur une même base 100, à la même date de départ&nbsp;: leurs trajectoires en relief, puis les indicateurs qui les départagent — performance, risque, efficacité et chiffres clés.</>}
        aside={<ShareLink />}
        figures={[
          { label: "Fonds comparés", value: d ? String(ids.length) : "—", sub: `sur ${funds.length} fonds référencés` },
          { label: "Point de départ", value: d ? fdate(d.start) : "—", sub: `période : ${pLabel.toLowerCase()}` },
          { label: "En tête sur la période", value: bestPerf?.ind.perf_period != null ? pct(bestPerf.ind.perf_period) : "—", sub: bestPerf?.ind.perf_period != null ? bestPerf.name : "aucune donnée" },
          { label: "Volatilité la plus basse", value: lowVol?.ind.vol != null ? pct(lowVol.ind.vol, { signed: false }) : "—", sub: lowVol?.ind.vol != null ? lowVol.name : "aucune donnée" },
        ]}
      />
      <Picker funds={funds} ids={ids} slots={slots} period={period}
        onIds={(n) => setSel(n)} onPeriod={(p) => setSel(ids, p)} />
      <div className={`page cmp__page${loading ? " is-loading" : ""}`}>
        {error && !d ? <ErrorState error={error} /> : (
          <>
            <Trajectories funds={cfunds} live={live} focus={focus} onFocus={setFocus} start={d?.start} end={d?.date} periodLabel={pLabel} ready={!!d} few={ids.length < 2}
              onRemove={(rm) => setSel(ids.filter((x) => !rm.includes(x)))} />
            <section className="section reveal" aria-labelledby="h-ind">
              <Head id="ind" eyebrow="Indicateurs" title="Ce qui les départage"
                lede={<>Calculés sur la période retenue ({pLabel.toLowerCase()}), sauf mention de durée. La meilleure valeur de chaque ligne est signalée en or&nbsp;; flèche ↑&nbsp;: la plus haute l'emporte, ↓&nbsp;: la plus basse.</>} />
              {cfunds.length ? <IndTable funds={cfunds} focus={focus} onFocus={setFocus} /> : <Loading h={420} />}
            </section>
            <section className="section reveal" aria-labelledby="h-pod">
              <Head id="pod" eyebrow="Classement" title="Le podium, indicateur par indicateur"
                lede="Choisissez un indicateur : les fonds se reclassent du meilleur au moins bon. À droite, la carte du couple risque / rendement." />
              {cfunds.length ? (
                <div className="cmp-pod__grid">
                  <PodiumBlock funds={cfunds} focus={focus} onFocus={setFocus} />
                  <div className="cmp-rr">
                    <div className="cmp-rr__h"><span className="eyebrow">Risque / rendement · {pLabel}</span></div>
                    <RiskMap funds={cfunds} focus={focus} onFocus={setFocus} periodLabel={pLabel.toLowerCase()} />
                  </div>
                </div>
              ) : <Loading h={420} />}
            </section>
            <Definitions />
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ sélecteur
function Picker({ funds, ids, slots, period, onIds, onPeriod }:
  { funds: FundLite[]; ids: string[]; slots: Map<string, number>; period: Period; onIds: (ids: string[]) => void; onPeriod: (p: Period) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(funds.map((f) => [f.id, f])), [funds]);
  const full = ids.length >= MAX;
  const results = useMemo(() => {
    const nq = norm(q.trim());
    return funds.filter((f) => !ids.includes(f.id) && (!nq || norm(f.name).includes(nq) || norm(FAMILY_LABEL[f.family] ?? "").includes(nq) || norm(f.expertise ?? "").includes(nq)))
      .sort((a, b) => (nq ? Number(!norm(a.name).startsWith(nq)) - Number(!norm(b.name).startsWith(nq)) : 0) || (b.aum ?? 0) - (a.aum ?? 0)).slice(0, 8);
  }, [q, funds, ids]);
  useEffect(() => {
    const out = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", out);
    return () => document.removeEventListener("pointerdown", out);
  }, []);
  useEffect(() => setAct(0), [q]);
  const add = (id: string) => { if (!full) onIds([...ids, id]); setQ(""); setAct(0); input.current?.focus(); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setAct((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && open && results[act]) { e.preventDefault(); add(results[act].id); }
    else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Backspace" && !q && ids.length) onIds(ids.slice(0, -1));
  };
  const presetOn = (p: (typeof PRESETS)[number]) => { const s = p.pick(funds); return s.length === ids.length && s.every((x) => ids.includes(x)); };
  return (
    <div className="cmp-pick" role="region" aria-label="Sélection des fonds et de la période">
      <div className="cmp-pick__in">
        <div className="cmp-pick__row">
          <span className="cmp-pick__count eyebrow"><span className="num">{ids.length}</span>/{MAX} fonds</span>
          <ul className="cmp-pick__chips" aria-label="Fonds comparés">
            {ids.map((id) => {
              const f = byId.get(id);
              const s = slots.get(id) ?? 0;
              return (
                <li key={id} className="cmp-chip">
                  <span className="cmp-badge" style={{ background: SLOT_COLORS[s] }} aria-hidden="true">{letterOf(s)}</span>
                  <Link to={`/fonds/${id}`} className="cmp-chip__n" title={f ? FAMILY_LABEL[f.family] : undefined}>{f?.name ?? id}</Link>
                  <button type="button" className="cmp-chip__x" onClick={() => onIds(ids.filter((x) => x !== id))} aria-label={`Retirer ${f?.name ?? "ce fonds"} de la comparaison`}><I.Close size={14} /></button>
                </li>
              );
            })}
          </ul>
          <div className="cmp-search" ref={box}>
            <I.Search size={16} className="cmp-search__i" />
            <input ref={input} type="search" value={q} placeholder={full ? "Six fonds au plus — retirez-en un" : ids.length < 2 ? "Ajoutez un fonds à comparer…" : "Ajouter un fonds…"}
              disabled={full} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={key}
              role="combobox" aria-expanded={open && results.length > 0} aria-controls="cmp-results" aria-autocomplete="list"
              aria-activedescendant={open && results[act] ? `cmp-opt-${results[act].id}` : undefined} aria-label="Rechercher un fonds à ajouter" />
            {open && !full && results.length > 0 && (
              <ul id="cmp-results" className="cmp-search__list" role="listbox" aria-label="Fonds">
                {results.map((f, i) => (
                  <li key={f.id} id={`cmp-opt-${f.id}`} role="option" aria-selected={i === act} className={i === act ? "is-act" : ""}
                    onPointerDown={(e) => { e.preventDefault(); add(f.id); }} onPointerEnter={() => setAct(i)}>
                    <span className="dot" style={{ background: famVar(f.family, true) }} />
                    <span className="cmp-search__n">{f.name}<span className="cmp-search__f">{FAMILY_LABEL[f.family] ?? "Non classé"}</span></span>
                    <span className="cmp-search__a num">{eur(f.aum)}</span>
                  </li>
                ))}
              </ul>
            )}
            {open && !full && q && results.length === 0 && <div className="cmp-search__list cmp-search__none small muted">Aucun fonds ne correspond à «&nbsp;{q}&nbsp;».</div>}
          </div>
        </div>
        <div className="cmp-pick__row cmp-pick__row--2">
          <div className="cmp-pick__presets" role="group" aria-label="Préréglages">
            {PRESETS.map((p) => (
              <button key={p.k} type="button" className="chip" aria-pressed={presetOn(p)} onClick={() => onIds(p.pick(funds).slice(0, MAX))}>{p.l}</button>
            ))}
          </div>
          <div className="seg cmp-pick__per" role="radiogroup" aria-label="Période">
            {PERIODS.map((p) => (
              <button key={p.k} type="button" role="radio" className="seg__b" aria-checked={period === p.k} onClick={() => onPeriod(p.k)}>{p.l}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ trajectoires 3D
function Trajectories({ funds, live, focus, onFocus, start, end, periodLabel, ready, few, onRemove }:
  { funds: CFund[]; live: CFund[]; focus: string | null; onFocus: (id: string | null) => void; start?: string; end?: string; periodLabel: string; ready: boolean; few: boolean; onRemove: (ids: string[]) => void }) {
  const reduced = useReducedMotion();
  const narrow = useNarrow();
  const [gl] = useState(() => webglAvailable());
  const [failed, setFailed] = useState(false);
  const use3d = gl && !narrow && !failed;
  const [flat, setFlat] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneT | null>(null);
  const [cur, setCur] = useState<CmpCursor | null>(null);
  const nav = useNavigate();
  const navRef = useRef(nav); navRef.current = nav;
  const focusRef = useRef(onFocus); focusRef.current = onFocus;
  const toSeries = (fs: CFund[]) => fs.map((f) => ({ id: f.id, name: f.name, color: f.color, slot: f.slot, pts: f.pts }));
  const liveRef = useRef(live); liveRef.current = live;
  const hasLive = live.length > 0;
  const sig = live.map((f) => `${f.id}:${f.slot}:${f.pts.length}:${f.pts[0]?.t}:${f.pts[f.pts.length - 1]?.v}`).join("|");

  useEffect(() => {
    if (!use3d || !ready || !hasLive || !host.current || !labels.current) return;
    let alive = true;
    import("../three/CompareScene").then(({ CompareScene }) => {
      if (!alive || !host.current || !labels.current) return;
      try {
        scene.current = new CompareScene(host.current, toSeries(liveRef.current), {
          reduced, labelLayer: labels.current,
          onCursor: (c) => setCur(c),
          onHover: (id) => focusRef.current(id),
          onSelect: (id) => navRef.current(`/fonds/${id}`),
          fmtTick: (v) => String(Math.round(v * 100) / 100).replace(".", ","),
          fmtEnd: (v) => b100(v),
          fmtTime,
        });
        if (flat) scene.current.setFlat(true);
      } catch { setFailed(true); }
    }).catch(() => setFailed(true));
    return () => { alive = false; scene.current?.dispose(); scene.current = null; setCur(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [use3d, ready, reduced, hasLive]);
  useEffect(() => { scene.current?.setData(toSeries(live)); setCur(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sig]);
  useEffect(() => { scene.current?.setFlat(flat); }, [flat]);
  useEffect(() => { scene.current?.focus(focus); }, [focus]);

  const read: CursorRead | null = cur ? { t: cur.t, idx: live.map((_, i) => cur.idx[i] ?? null) } : null;
  const missing = funds.filter((f) => f.pts.length < 2);
  // Fonds dont la dernière VL est ancienne (échus, liquidés) : ce sont eux qui repoussent le point de départ commun
  const stale = funds.filter((f) => f.share?.nav_date && end && tOf(f.share.nav_date) < tOf(end) - 45 * 86400000);
  const flip = cur ? cur.x > cur.w * 0.58 : false;

  // Légende : apparition en cascade quand la sélection change
  const legend = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!legend.current || reduced || !legend.current.children.length) return;
    const tw = gsap.fromTo(legend.current.children, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.05, clearProps: "opacity,transform" });
    return () => { tw.kill(); };
  }, [sig, reduced]);

  return (
    <section className="section cmp-traj reveal" aria-labelledby="h-traj">
      <Head id="traj" eyebrow={`Trajectoires · ${periodLabel}`} title="Cent euros placés au même jour"
        lede={<>Base 100 au {start ? fdate(start) : "—"}, part principale, dividendes réinvestis. {use3d ? <>Un fonds par plan&nbsp;: faites pivoter la scène, survolez un ruban pour l'isoler, déplacez la souris pour lire les valeurs à une date. Cliquer un ruban ouvre la fiche du fonds.</> : <>Touchez ou survolez le graphique pour lire les valeurs à une date.</>}</>}
        right={use3d && hasLive ? (
          <div className="cmp-traj__tools">
            <button type="button" className="btn btn--ghost" aria-pressed={flat} onClick={() => setFlat((v) => !v)}>
              {flat ? <><I.Cube size={16} /> Vue en relief</> : <><I.List size={16} /> Vue de face</>}
            </button>
          </div>
        ) : undefined} />
      {few && <p className="cmp-note small"><I.Info size={16} /> Ajoutez au moins un second fonds pour comparer.</p>}
      {missing.length > 0 && (
        <div className="cmp-note small"><I.Info size={16} />
          <span>Sans historique commun sur la période&nbsp;: <strong>{missing.map((f) => f.name).join(", ")}</strong>. Le point de départ commun est la date la plus récente des fonds comparés&nbsp;; un fonds échu ou trop récent peut la repousser — retirez-le ou choisissez une autre période.
            {stale.length > 0 && <> {stale.map((f) => `${f.name} n'a plus de valeur liquidative depuis le ${fdate(f.share!.nav_date!)}`).join(" ; ")}.{" "}
              <button type="button" className="cmp-note__b" onClick={() => onRemove(stale.map((f) => f.id))}>Retirer {stale.length > 1 ? "ces fonds" : stale[0].name}</button></>}
          </span>
        </div>
      )}
      {ready && !hasLive ? (
        <div className="empty cmp-empty">Aucune trajectoire commune à afficher sur cette période.</div>
      ) : use3d ? (
        <div className={`cmp3d${flat ? " is-flat" : ""}`}>
          <div className="cmp3d__canvas" ref={host} data-cursor="Explorer" />
          <div className="cmp3d__labels" ref={labels} aria-hidden="true" />
          {!ready && <div className="cmp3d__wait"><Loading h={560} /></div>}
          {read && cur && (
            <Readout funds={live} read={read} className="cmp-read--float"
              style={{ left: flip ? cur.x - 18 : cur.x + 18, top: Math.max(12, Math.min(cur.y, cur.h - 260)), transform: flip ? "translateX(-100%)" : undefined }} />
          )}
          <div className="cmp3d__hint small" aria-hidden="true">{flat ? "Vue de face · lecture 2D" : "Glisser pour pivoter · survoler pour lire"}</div>
        </div>
      ) : (
        ready ? <Flat2D funds={funds} focus={focus} onFocus={onFocus} compact={narrow} /> : <Loading h={narrow ? 320 : 440} />
      )}
      <ul className="cmp-legend" ref={legend} aria-label="Légende : valeur base 100 et performance en fin de période">
        {funds.map((f) => {
          const lastV = f.pts.length > 1 ? f.pts[f.pts.length - 1].v : null;
          return (
            <li key={f.id}>
              <button type="button" className={`cmp-legend__b${focus === f.id ? " is-on" : ""}${focus && focus !== f.id ? " is-dim" : ""}`}
                onMouseEnter={() => onFocus(f.id)} onMouseLeave={() => onFocus(null)} onFocus={() => onFocus(f.id)} onBlur={() => onFocus(null)}
                onClick={() => nav(`/fonds/${f.id}`)} aria-label={`${f.name} : ${b100(lastV)} en base 100, ${lastV != null ? pct(lastV / 100 - 1) : "pas de donnée"}. Ouvrir la fiche`}>
                <svg className="cmp-legend__k" width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><line x1="1" x2="25" y1="5" y2="5" stroke={f.color} strokeWidth="2.4" strokeLinecap="round" strokeDasharray={lineDash(f.letter)} /></svg>
                <span className="cmp-badge" style={{ background: f.color }} aria-hidden="true">{f.letter}</span>
                <span className="cmp-legend__n">{f.name}</span>
                <span className="cmp-legend__v num">{b100(lastV)}</span>
                <span className="cmp-legend__p num">{lastV != null ? pct(lastV / 100 - 1) : "—"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ podium
const POD_KEYS = ["perf_period", "perf_ann", "vol", "mdd", "ratio", "sortino", "pos_months", "aum", "flows_1A", "ongoing"] as const;
const POD_SHORT: Record<string, string> = {
  perf_period: "Performance", perf_ann: "Perf. annualisée", vol: "Volatilité", mdd: "Perte max.", ratio: "Ratio rdt / risque",
  sortino: "Sortino", pos_months: "Mois en hausse", aum: "Encours", flows_1A: "Collecte 1 an", ongoing: "Frais courants",
};

function PodiumBlock({ funds, focus, onFocus }: { funds: CFund[]; focus: string | null; onFocus: (id: string | null) => void }) {
  const [k, setK] = useState<string>(() => { try { return sessionStorage.getItem("rco.cmp.pod") ?? "perf_period"; } catch { return "perf_period"; } });
  const row = ALL_ROWS.find((r) => r.k === k) ?? ALL_ROWS[0];
  const reduced = useReducedMotion();
  const narrow = useNarrow();
  const [gl] = useState(() => webglAvailable());
  const [failed, setFailed] = useState(false);
  const use3d = gl && !narrow && !failed;
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const pod = useRef<PodiumT | null>(null);
  const nav = useNavigate();
  const navRef = useRef(nav); navRef.current = nav;
  const focusRef = useRef(onFocus); focusRef.current = onFocus;
  const bars = () => ranked(row, funds).map((f) => ({ id: f.id, name: f.name, color: f.color, slot: f.slot, value: row.val(f), text: row.fmt(f) }));
  const barsRef = useRef(bars); barsRef.current = bars;
  const sig = funds.map((f) => `${f.id}:${row.val(f)}`).join("|") + k;
  const allNull = funds.every((f) => row.val(f) == null);
  const pick = (v: string) => { setK(v); try { sessionStorage.setItem("rco.cmp.pod", v); } catch { /* stockage indisponible */ } };

  useEffect(() => {
    if (!use3d || !host.current || !labels.current) return;
    let alive = true;
    let undo: (() => void) | undefined;
    import("../three/ComparePodium").then(({ ComparePodium }) => {
      if (!alive || !host.current || !labels.current) return;
      try {
        pod.current = new ComparePodium(host.current, { reduced, labelLayer: labels.current, onHover: (id) => focusRef.current(id), onSelect: (id) => navRef.current(`/fonds/${id}`) });
        // Les colonnes poussent quand le podium entre à l'écran
        const p = pod.current;
        if (reduced) p.setBars(barsRef.current(), false);
        else undo = onVisible(host.current, () => p.setBars(barsRef.current(), true), "0px 0px -15% 0px");
      } catch { setFailed(true); }
    }).catch(() => setFailed(true));
    return () => { alive = false; undo?.(); pod.current?.dispose(); pod.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [use3d, reduced]);
  useEffect(() => { pod.current?.setBars(bars(), true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sig]);
  useEffect(() => { pod.current?.focus(focus); }, [focus]);

  return (
    <div className="cmp-pod">
      <div className="cmp-pod__keys" role="radiogroup" aria-label="Indicateur du classement">
        {POD_KEYS.map((key) => (
          <button key={key} type="button" role="radio" aria-checked={k === key} className="chip" onClick={() => pick(key)}>{POD_SHORT[key]}</button>
        ))}
      </div>
      <p className="small muted cmp-pod__sub">
        {row.label} · {row.dir === "up" ? "la plus haute valeur l'emporte" : row.dir === "down" ? "la plus basse valeur l'emporte" : "sans sens de classement"}
      </p>
      {allNull && <p className="cmp-note small cmp-pod__none"><I.Info size={16} /> Aucune valeur disponible pour cet indicateur sur la période.</p>}
      {use3d ? (
        <div className={`pod3d${allNull ? " is-empty" : ""}`}>
          <div className="pod3d__canvas" ref={host} data-cursor="Ouvrir" />
          <div className="pod3d__labels" ref={labels} aria-hidden="true" />
          <ol className="sr-only">
            {ranked(row, funds).map((f) => <li key={f.id}>{f.name} : {row.fmt(f)}</li>)}
          </ol>
        </div>
      ) : !allNull && <RankBars funds={funds} row={row} focus={focus} onFocus={onFocus} />}
    </div>
  );
}

// ------------------------------------------------------------------ définitions
function Definitions() {
  const items: [string, string][] = [
    ["Base 100", "Chaque courbe vaut 100 à la date de départ commune — la plus récente des dates de début d'historique des fonds comparés, dans la limite de la période. 119,5 signifie +19,5 %."],
    ["Part principale", "Les historiques, la valeur liquidative et les frais sont ceux de la part de référence de chaque fonds (code indiqué en tête de colonne)."],
    ["Dividendes réinvestis", "Les distributions sont réintégrées dans la performance : une part de distribution se compare à une part de capitalisation."],
    ["Volatilité annualisée", "Écart type des rendements périodiques, ramené à un an. Mesure l'amplitude des variations."],
    ["Perte maximale", "Plus forte baisse, d'un plus haut à un plus bas ultérieur, sur la période."],
    ["Ratio rendement / risque", "Performance annualisée divisée par la volatilité annualisée, sans déduction d'un taux sans risque. Sortino : même rapport avec la seule volatilité des baisses ; Calmar : rapporté à la perte maximale."],
  ];
  return (
    <aside className="cmp-defs reveal" aria-labelledby="h-defs">
      <div className="eyebrow" id="h-defs">Méthode et définitions</div>
      <dl>
        {items.map(([t, dd]) => <div key={t}><dt>{t}</dt><dd>{dd}</dd></div>)}
      </dl>
      <p className="small muted">Les performances passées ne préjugent pas des performances futures. Revenus de gestion : estimation annuelle à partir des encours et du taux de frais de gestion.</p>
    </aside>
  );
}

// ------------------------------------------------------------------ partage
function ShareLink() {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* presse-papiers indisponible */ }
  };
  return (
    <div className="cmp-share">
      <button type="button" className="btn btn--ghost" onClick={copy} aria-live="polite">
        {done ? <><I.Check size={16} /> Lien copié</> : <><I.Copy size={16} /> Copier le lien de la comparaison</>}
      </button>
      <span className="small">La sélection et la période sont dans l'adresse.</span>
    </div>
  );
}
