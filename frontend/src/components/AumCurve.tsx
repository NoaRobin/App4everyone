/**
 * Courbe des encours en 3D, du jour à l'année : granularité, fenêtre, total ou décomposition par famille.
 * Chaque point est la dernière date disponible de sa période ; sous la courbe, la collecte nette estimée de chaque
 * période (souscriptions − rachats), sur sa propre échelle. Lecture au curseur (souris, toucher ou flèches du clavier),
 * tableau des données à la demande, graphique 2D si WebGL est indisponible.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, longDate, monthYear, pct, plural } from "../lib/format";
import { famHex } from "../lib/families";
import type { FamilyKey } from "../lib/types";
import { useReducedMotion, webglAvailable } from "../lib/motion";
import type { AumCursor, AumData, AumScene as AumSceneT } from "../three/AumScene";
import { TimeChart } from "./charts";
import { Head } from "./Editorial";
import { Loading } from "./ui";
import * as I from "./Icon";

export type Freq = "J" | "S" | "M" | "T" | "A";
export type Win = "1M" | "3M" | "YTD" | "1A" | "3A" | "Tout";
export type SeriesPoint = { d: string; p: string; aum: number | null; delta: number | null; pct: number | null; flows: number | null; market: number | null };
export type SeriesResp = {
  date: string; freq: Freq; range: Win; start: string | null;
  scope: { kind: "house" | "family" | "fund"; label?: string; name?: string };
  points: SeriesPoint[];
  families: { key: string; label: string; values: number[] }[];
  summary?: { aum_start: number | null; aum_end: number | null; delta: number | null; pct: number | null; flows: number | null; market: number | null;
    high: { d: string; v: number | null }; low: { d: string; v: number | null }; n: number; n_up: number; n_down: number };
};

const FREQS: { k: Freq; l: string; per: string }[] = [
  { k: "J", l: "Jour", per: "jour" }, { k: "S", l: "Semaine", per: "semaine" }, { k: "M", l: "Mois", per: "mois" },
  { k: "T", l: "Trimestre", per: "trimestre" }, { k: "A", l: "Année", per: "année" },
];
const WINS: { k: Win; l: string }[] = [
  { k: "1M", l: "1 mois" }, { k: "3M", l: "3 mois" }, { k: "YTD", l: "Depuis le 1er janv." }, { k: "1A", l: "1 an" }, { k: "3A", l: "3 ans" }, { k: "Tout", l: "Tout" },
];
/** Granularités lisibles pour une fenêtre (au moins trois points), et celle retenue par défaut. */
const ALLOWED: Record<Win, Freq[]> = { "1M": ["J", "S"], "3M": ["J", "S", "M"], YTD: ["J", "S", "M"], "1A": ["J", "S", "M", "T"], "3A": ["J", "S", "M", "T", "A"], Tout: ["J", "S", "M", "T", "A"] };
const DEFAULT: Record<Win, Freq> = { "1M": "J", "3M": "J", YTD: "S", "1A": "S", "3A": "M", Tout: "M" };
const GOLD = "#cc9f53";
const tOf = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");

/** Libellé de la période d'un point : « 5 octobre 2026 », « semaine du 28 septembre 2026 », « T3 2026 »… */
export function periodLabel(p: SeriesPoint, f: Freq): string {
  if (f === "J") return longDate(p.d);
  if (f === "S") return `Semaine du ${longDate(p.p)}`;
  if (f === "M") return monthYear(p.p, true).replace(/^./, (c) => c.toUpperCase());
  if (f === "T") return `T${Math.floor(Number(p.p.slice(5, 7)) / 3) + 1} ${p.p.slice(0, 4)}`;
  return p.p.slice(0, 4);
}

/** Graduation d'encours : « 34,5 Md€ », « 820 M€ » (sans décimales inutiles). */
export function tickEur(v: number): string {
  const a = Math.abs(v), nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
  const s = a >= 1e9 ? `${nf.format(a / 1e9)} Md€` : a >= 1e6 ? `${nf.format(a / 1e6)} M€` : a >= 1e3 ? `${nf.format(a / 1e3)} k€` : `${nf.format(a)} €`;
  return (v < 0 ? "−" : "") + s;
}

function fmtTime(t: number, span: number): string {
  const d = new Date(t);
  if (span < 62 * 86400000) return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
  if (span > 2.5 * 365.25 * 86400000) return String(d.getUTCFullYear());
  return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function AumCurve({ fonds, famille, families = false, head, height }:
  { fonds?: string; famille?: string; families?: boolean; head?: { id: string; eyebrow: string; title: string; lede?: ReactNode }; height?: number }) {
  const { api } = useApp();
  const [win, setWin] = useState<Win>("1A");
  const [freq, setFreq] = useState<Freq>("S");
  const [split, setSplit] = useState(false);
  const [flat, setFlat] = useState(false);
  const qs = new URLSearchParams({ freq, range: win, ...(fonds ? { fonds } : {}), ...(famille ? { famille } : {}) });
  const { data, error, loading } = useApi<SeriesResp>(api(`/api/encours/series?${qs.toString()}`));
  const pickWin = (w: Win) => { setWin(w); if (!ALLOWED[w].includes(freq)) setFreq(DEFAULT[w]); };
  const per = FREQS.find((f) => f.k === (data?.freq ?? freq))!;
  const stacked = families && split && !!data?.families.length;
  const s = data?.summary;

  return (
    <div className="aumc">
      {head && <Head id={head.id} eyebrow={head.eyebrow} title={head.title} lede={head.lede} />}
      <div className="aumc__ctl">
        <div className="aumc__grp">
          <span className="aumc__l" id={`aumc-f-${head?.id ?? fonds ?? "x"}`}>Un point par</span>
          <div className="seg seg--s" role="radiogroup" aria-labelledby={`aumc-f-${head?.id ?? fonds ?? "x"}`}>
            {FREQS.map((f) => {
              const ok = ALLOWED[win].includes(f.k);
              return <button key={f.k} type="button" role="radio" aria-checked={freq === f.k} disabled={!ok} className="seg__b" onClick={() => setFreq(f.k)}
                title={ok ? undefined : "Trop peu de points sur cette fenêtre"}>{f.l}</button>;
            })}
          </div>
        </div>
        <div className="aumc__grp">
          <span className="aumc__l" id={`aumc-w-${head?.id ?? fonds ?? "x"}`}>Fenêtre</span>
          <div className="seg seg--s" role="radiogroup" aria-labelledby={`aumc-w-${head?.id ?? fonds ?? "x"}`}>
            {WINS.map((w) => <button key={w.k} type="button" role="radio" aria-checked={win === w.k} className="seg__b" onClick={() => pickWin(w.k)}>{w.l}</button>)}
          </div>
        </div>
        {families && (
          <div className="aumc__grp">
            <span className="aumc__l" id="aumc-v">Lecture</span>
            <div className="seg seg--s" role="radiogroup" aria-labelledby="aumc-v">
              <button type="button" role="radio" aria-checked={!split} className="seg__b" onClick={() => setSplit(false)}>Total</button>
              <button type="button" role="radio" aria-checked={split} className="seg__b" onClick={() => setSplit(true)}>Par famille</button>
            </div>
          </div>
        )}
      </div>

      {s && data && (
        <dl className="aumc__sum" aria-live="polite">
          <div><dt>Encours au {fdate(data.date)}</dt><dd className="num">{eur(s.aum_end)}</dd></div>
          <div><dt>Variation depuis le {fdate(data.start)}</dt><dd className="num">{eur(s.delta, { signed: true })} <small>{pct(s.pct)}</small></dd></div>
          <div><dt>dont collecte nette estimée</dt><dd className="num gold-t">{eur(s.flows, { signed: true })}</dd></div>
          <div><dt>dont effet marché</dt><dd className="num">{eur(s.market, { signed: true })}</dd></div>
          <div><dt>Plus haut · plus bas</dt><dd className="num aumc__hl">{eur(s.high.v)} <small>{fdate(s.high.d)}</small> · {eur(s.low.v)} <small>{fdate(s.low.d)}</small></dd></div>
        </dl>
      )}

      {error ? <div className="empty">Courbe indisponible : {error.message}</div>
        : !data ? <Loading h={height ?? 560} label="Chargement de la courbe des encours" />
        : !data.points.length ? <div className="empty">Aucun encours sur cette fenêtre.</div>
        : <Stage data={data} stacked={stacked} flat={flat} onFlat={setFlat} per={per.per} loading={loading} height={height} />}

      {data && data.points.length > 0 && <DataTable data={data} stacked={stacked} />}
    </div>
  );
}

function Stage({ data, stacked, flat, onFlat, per, loading, height }:
  { data: SeriesResp; stacked: boolean; flat: boolean; onFlat: (v: boolean) => void; per: string; loading: boolean; height?: number }) {
  const reduced = useReducedMotion();
  const [gl] = useState(() => webglAvailable());
  const [failed, setFailed] = useState(false);
  const use3d = gl && !failed;
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<AumSceneT | null>(null);
  const [cur, setCur] = useState<AumCursor | null>(null);
  const pts = data.points;

  const sceneData: AumData = useMemo(() => ({
    ts: pts.map((p) => tOf(p.d)),
    flows: pts.map((p) => p.flows),
    stacked,
    layers: stacked
      ? data.families.map((f) => ({ key: f.key, color: famHex(f.key as FamilyKey), values: f.values }))
      : [{ key: "total", color: GOLD, values: pts.map((p) => p.aum ?? 0) }],
  }), [data, stacked, pts]);
  const dataRef = useRef(sceneData); dataRef.current = sceneData;

  useEffect(() => {
    if (!use3d || !host.current || !labels.current) return;
    let alive = true;
    import("../three/AumScene").then(({ AumScene }) => {
      if (!alive || !host.current || !labels.current) return;
      try {
        scene.current = new AumScene(host.current, dataRef.current, {
          reduced, labelLayer: labels.current, onCursor: setCur,
          fmtValue: tickEur, fmtFlow: (v) => eur(v, { signed: true }), fmtTime,
        });
        if (flat) scene.current.setFlat(true);
      } catch { setFailed(true); }
    }).catch(() => setFailed(true));
    return () => { alive = false; scene.current?.dispose(); scene.current = null; setCur(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [use3d, reduced]);
  useEffect(() => { scene.current?.setData(sceneData); }, [sceneData]);
  useEffect(() => { scene.current?.setFlat(flat); }, [flat]);

  const onKey = (e: React.KeyboardEvent) => {
    const n = pts.length, k = cur?.k ?? null;
    const go = (x: number) => { e.preventDefault(); scene.current?.cursorAt(Math.max(0, Math.min(n - 1, x))); };
    if (e.key === "ArrowLeft") go(k == null ? n - 1 : k - 1);
    else if (e.key === "ArrowRight") go(k == null ? n - 1 : k + 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(n - 1);
    else if (e.key === "Escape") scene.current?.cursorAt(null);
  };

  const s = data.summary;
  const aria = `Courbe des encours, un point par ${per}, du ${fdate(data.start)} au ${fdate(data.date)} : de ${eur(s?.aum_start)} à ${eur(s?.aum_end)}. `
    + `Sous la courbe, la collecte nette estimée de chaque ${per}. Flèches gauche et droite pour lire période par période.`;

  if (!use3d) {
    return <div className="card card--flat"><TimeChart series={[{ key: "aum", label: "Encours", color: "var(--gold)", fill: true, points: pts.filter((p) => p.aum != null).map((p) => ({ d: p.d, v: p.aum! })) }]} height={320} ariaLabel={aria} /></div>;
  }
  const p = cur ? pts[cur.k] : null;
  const flip = cur ? cur.x > cur.w * 0.6 : false;
  return (
    <div className={`aum3d${flat ? " is-flat" : ""}${loading ? " is-loading" : ""}`} style={height ? { height } : undefined}>
      <div className="aum3d__canvas" ref={host} tabIndex={0} role="img" aria-label={aria} onKeyDown={onKey}
        onFocus={() => { if (!cur) scene.current?.cursorAt(pts.length - 1); }} onBlur={() => scene.current?.cursorAt(null)} />
      <div className="aum3d__labels" ref={labels} aria-hidden="true" />
      <div className="aum3d__cap aum3d__cap--a" aria-hidden="true">Encours{stacked ? " par famille" : ""}
        {stacked && (
          <ul className="aum3d__legend">
            {[...data.families].reverse().map((f) => <li key={f.key}><i style={{ background: famHex(f.key as FamilyKey) }} />{f.label}</li>)}
          </ul>
        )}
      </div>
      <div className="aum3d__tools">
        <button type="button" className="btn btn--ghost" aria-pressed={flat} onClick={() => onFlat(!flat)}>
          {flat ? <><I.Cube size={16} /> Vue en relief</> : <><I.List size={16} /> Vue de face</>}
        </button>
      </div>
      {p && cur && (
        <div className="aum3d__tip" aria-hidden="true"
          style={{ left: flip ? cur.x - 18 : cur.x + 18, top: cur.y > 270 ? cur.y - 28 : Math.min(cur.y + 28, cur.h - 230),
            transform: `${flip ? "translateX(-100%)" : ""} ${cur.y > 270 ? "translateY(-100%)" : ""}` }}>
          <div className="aum3d__tip-h">{periodLabel(p, data.freq)}{data.freq !== "J" && <small> · au {fdate(p.d)}</small>}</div>
          <div className="aum3d__tip-v num">{eur(p.aum)}</div>
          <dl>
            <div><dt>Variation</dt><dd className="num">{p.delta == null ? "—" : <>{eur(p.delta, { signed: true })} <small>{pct(p.pct)}</small></>}</dd></div>
            <div><dt>Collecte nette estimée</dt><dd className="num gold-t">{eur(p.flows, { signed: true })}</dd></div>
            <div><dt>Effet marché</dt><dd className="num">{eur(p.market, { signed: true })}</dd></div>
          </dl>
          {stacked && (
            <ul className="aum3d__tip-f">
              {[...data.families].reverse().map((f) => (
                <li key={f.key}><i style={{ background: famHex(f.key as FamilyKey) }} />{f.label}<b className="num">{eur(f.values[cur.k])}</b></li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="aum3d__key small" aria-hidden="true">
        <span><i className="is-up" /> souscriptions nettes</span><span><i className="is-down" /> rachats nets</span>
        <span className="muted">collecte nette estimée par {per}</span>
      </div>
      <div className="sr-only" aria-live="polite">{p ? `${periodLabel(p, data.freq)} : encours ${eur(p.aum)}, variation ${eur(p.delta, { signed: true })}, collecte nette estimée ${eur(p.flows, { signed: true })}, effet marché ${eur(p.market, { signed: true })}.` : ""}</div>
      <div className="aum3d__hint small" aria-hidden="true">{flat ? "Vue de face · lecture 2D" : "Glisser pour pivoter · survoler pour lire · ← → au clavier"}</div>
    </div>
  );
}

function DataTable({ data, stacked }: { data: SeriesResp; stacked: boolean }) {
  const [open, setOpen] = useState(false);
  const rows = [...data.points].reverse();
  return (
    <details className="aumc__table" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Voir les données · {plural(data.points.length, "période")}</summary>
      {open && (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th scope="col">Période</th><th scope="col">Date du point</th><th scope="col" className="n">Encours</th><th scope="col" className="n">Variation</th>
              <th scope="col" className="n">Collecte nette estimée</th><th scope="col" className="n">Effet marché</th>
              {stacked && data.families.map((f) => <th key={f.key} scope="col" className="n">{f.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((p, i) => {
                const k = data.points.length - 1 - i;
                return (
                  <tr key={p.d}>
                    <th scope="row" className="aumc__rh">{periodLabel(p, data.freq)}</th><td>{fdate(p.d)}</td><td className="n">{eur(p.aum)}</td>
                    <td className="n">{eur(p.delta, { signed: true })}</td><td className="n">{eur(p.flows, { signed: true })}</td><td className="n">{eur(p.market, { signed: true })}</td>
                    {stacked && data.families.map((f) => <td key={f.key} className="n">{eur(f.values[k])}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
