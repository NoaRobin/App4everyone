/**
 * Export — la fonction prioritaire : sortir des données propres pour les retravailler dans Excel (avec Copilot).
 *
 *   Données (mode principal)  une source, son niveau de détail et sa période, des filtres, des colonnes (ordre, intitulés) ;
 *                             aperçu en direct ; classeur Excel « propre » (tableau structuré en A1, une ligne par
 *                             enregistrement, dictionnaire, paramètres), CSV, ou copie directe dans Excel. Modèles enregistrés.
 *   Rapport (second plan)     le studio de rapports mis en forme (graphiques, styles, page de garde) et sa version PDF.
 * Tout est généré dans le navigateur à partir des API de l'application (lecture seule) : rien n'est écrit côté serveur.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../lib/context";
import { useApi } from "../lib/api";
import { date as fdate } from "../lib/format";
import { gsap } from "../lib/gsap";
import { prefersReducedMotion } from "../lib/motion";
import type { FundRow } from "../lib/types";
import { buildWorkbook, cellValue, download, toCsv, toTsv, uniqueHeaders, xstyle, KIND_LABEL, XSTYLES, type ExportCol } from "../lib/xlsx";
import { DEFAULT_SRC, FAMILY_CHOICES, FREQS, LEVELS, SOURCES, SPANS, periodBounds, sourceById, type Loaded, type Pack, type Row, type SrcParams } from "../lib/export/sources";
import { EMPTY, applyFilters, applySort, defaultFilter, describe, facet, isActive, type Filter, type Sort } from "../lib/export/filters";
import { DIMS } from "../lib/report/datasets";
import * as I from "../components/Icon";
import { ReportStudio } from "./ExportReport";
import "../styles/xport.css";

type Cfg = { src: string; p: SrcParams; cols: string[]; names: Record<string, string>; filters: Filter[]; sort: Sort; format: "xlsx" | "csv"; dico: boolean; totals: boolean; file: string; style?: string };
type Model = { id: string; name: string; cfg: Cfg; at: string };
const KEY = "export-data", MODELS = "export-models";
const store = {
  get<T>(k: string, d: T): T { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};
const fresh = (src: string, p: SrcParams = DEFAULT_SRC): Cfg => ({ src, p, cols: sourceById(src).defaults(p), names: {}, filters: [], sort: null, format: "xlsx", dico: true, totals: false, file: "" });
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
const NUMK = new Set(["int", "num", "eur", "pct"]);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ExportPage() {
  const [params, setParams] = useSearchParams();
  const mode = params.get("mode") === "rapport" ? "rapport" : "donnees";
  const setMode = (m: string) => { const p = new URLSearchParams(params); if (m === "rapport") p.set("mode", "rapport"); else p.delete("mode"); setParams(p, { replace: true }); };
  const hero = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = hero.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.timeline({ defaults: { ease: "expo.out" } })
        .fromTo(".xp-h__t span", { yPercent: 105 }, { yPercent: 0, duration: 1, stagger: 0.07 })
        .fromTo(".xp-h__l, .xp-mode", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, clearProps: "transform" }, 0.25);
    }, el);
    return () => ctx.revert();
  }, []);
  return (
    <div className="xpage">
      <header className="xp-h" ref={hero}>
        <div className="xp-h__in">
          <div>
            <div className="eyebrow xp-h__e">Export</div>
            {mode === "rapport" ? (
              <><h1 className="xp-h__t"><span>Des rapports</span> <span>mis en forme.</span></h1>
              <p className="xp-h__l">Un classeur soigné — page de garde, indicateurs, graphiques, onglets de données — ou sa version PDF, pour un comité ou une diffusion. Pour retravailler les chiffres, préférez le mode Données.</p></>
            ) : (<><h1 className="xp-h__t"><span>Vos données,</span> <span>prêtes pour Excel.</span></h1>
            <p className="xp-h__l">Choisissez la source, le niveau de détail, la période, les filtres et les colonnes&nbsp;: le fichier sort propre — une ligne par enregistrement, des en-têtes explicites, de vrais nombres et de vraies dates, un tableau structuré que Copilot lit directement.</p></>)}
          </div>
          <div className="xp-mode" role="tablist" aria-label="Type d'export">
            <button type="button" role="tab" aria-selected={mode === "donnees"} className={mode === "donnees" ? "is-on" : ""} onClick={() => setMode("donnees")}>
              <I.List size={16} /><span><b>Données</b><i>Pour retravailler dans Excel</i></span></button>
            <button type="button" role="tab" aria-selected={mode === "rapport"} className={mode === "rapport" ? "is-on" : ""} onClick={() => setMode("rapport")}>
              <I.Copy size={16} /><span><b>Rapport mis en forme</b><i>Classeur soigné ou PDF</i></span></button>
          </div>
        </div>
      </header>
      {mode === "donnees" ? <DataExport /> : <div className="xp-rep"><ReportStudio /></div>}
    </div>
  );
}

// ================================================================== mode « Données »
function DataExport() {
  const { api, asOf, meta } = useApp();
  const [cfg, setCfg] = useState<Cfg>(() => { const c = store.get<Cfg | null>(KEY, null); return c && SOURCES.some((s) => s.id === c.src) ? { ...fresh(c.src), ...c, p: { ...DEFAULT_SRC, ...c.p } } : fresh("fonds"); });
  const [models, setModels] = useState<Model[]>(() => store.get<Model[]>(MODELS, []));
  const [res, setRes] = useState<{ key: string; data?: Loaded; error?: string } | null>(null);
  const [busy, setBusy] = useState<"" | "file" | "copy">("");
  const [flash, setFlash] = useState("");
  useEffect(() => store.set(KEY, cfg), [cfg]);
  useEffect(() => store.set(MODELS, models), [models]);
  const src = sourceById(cfg.src);
  const set = (f: (c: Cfg) => Cfg) => setCfg(f);
  const setP = <K extends keyof SrcParams>(k: K, v: SrcParams[K]) => set((c) => ({ ...c, p: { ...c.p, [k]: v } }));

  // chargement (côté serveur : source, niveau, pas, période, périmètre)
  const loadKey = JSON.stringify([cfg.src, src.controls.map((k) => k === "period" ? [cfg.p.span, cfg.p.from, cfg.p.to] : cfg.p[k as keyof SrcParams]), asOf]);
  useEffect(() => {
    let alive = true;
    setRes((r) => (r?.key === loadKey ? r : { key: loadKey }));
    src.load(api, cfg.p, asOf ?? null)
      .then((data) => { if (alive) setRes({ key: loadKey, data }); })
      .catch((e) => { if (alive) setRes({ key: loadKey, error: String(e?.message ?? e) }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey, api]);
  const loading = !res || res.key !== loadKey || (!res.data && !res.error);
  const data = res?.key === loadKey ? res.data : undefined;
  const rows = data?.rows ?? [];

  // Champs : Product Info d'abord (référentiel complet), puis les mesures de l'application présentes dans les lignes
  const avail = useMemo(() => {
    const keys = rows.length ? new Set(Object.keys(rows[0])) : null;
    const own = src.columns.filter((c) => !keys || c.get || keys.has(c.key));
    return [...(data?.columns ?? []), ...own];
  }, [rows, src, data]);
  const byKey = useMemo(() => new Map(avail.map((c) => [c.key, c])), [avail]);
  const packs = data?.packs ?? [];
  const cols = cfg.cols.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!);
  const headers = uniqueHeaders(cols.map((c) => cfg.names[c.key]?.trim() || c.label));
  const filtered = useMemo(() => applySort(applyFilters(rows, cfg.filters, byKey), cfg.sort, byKey), [rows, cfg.filters, cfg.sort, byKey]);
  const setCols = (k: string[]) => set((c) => ({ ...c, cols: k }));
  const toggleCol = (k: string) => setCols(cfg.cols.includes(k) ? cfg.cols.filter((x) => x !== k) : [...cfg.cols, k]);

  const bounds = periodBounds(cfg.p, asOf ?? null);
  const grain = src.grain(cfg.p);
  const st = xstyle(cfg.style);
  const context = [
    ...(asOf ? [{ label: "Date de valeur", value: fdate(asOf) }] : []),
    ...(src.controls.includes("level") ? [{ label: "Niveau de détail", value: LEVELS.find((l) => l.id === cfg.p.level)!.label }] : []),
    ...(src.controls.includes("freq") ? [{ label: "Pas de temps", value: FREQS.find((f) => f.id === cfg.p.freq)!.label }] : []),
    ...(src.controls.includes("period") ? [{ label: "Période", value: data?.period?.from ? `du ${fdate(data.period.from)} au ${fdate(data.period.to ?? asOf ?? "")}` : SPANS.find((x) => x.id === cfg.p.span)!.label }] : []),
    ...(src.controls.includes("families") && cfg.p.families.length ? [{ label: "Familles", value: cfg.p.families.map((f) => FAMILY_CHOICES.find((x) => x.id === f)?.label ?? f).join(", ") }] : []),
    ...(src.controls.includes("funds") && cfg.p.funds.length ? [{ label: "Fonds", value: `${cfg.p.funds.length} fonds choisis` }] : []),
    ...(src.controls.includes("rmm") ? [{ label: "Fonds RMM", value: cfg.p.rmm ? "inclus" : "exclus" }] : []),
    ...(src.controls.includes("actifs") ? [{ label: "Enregistrements", value: cfg.p.actifs ? "actifs uniquement" : "actifs et inactifs" }] : []),
    ...(src.controls.includes("dim") ? [{ label: "Axe", value: DIMS.find((d) => d.key === cfg.p.dim)?.label ?? cfg.p.dim }] : []),
    ...(src.controls.includes("top") ? [{ label: "Clients", value: `${cfg.p.top} premiers par encours` }] : []),
    ...cfg.filters.filter(isActive).map((f) => ({ label: "Filtre", value: describe(f, byKey.get(f.col)) })),
    ...(cfg.sort && byKey.has(cfg.sort.col) ? [{ label: "Tri", value: `${byKey.get(cfg.sort.col)!.label} ${cfg.sort.dir === 1 ? "croissant" : "décroissant"}` }] : []),
  ];
  const fname = (cfg.file.trim() || `${slug(src.label)}-${(asOf ?? new Date().toISOString()).slice(0, 10)}`).replace(/\.(xlsx|csv)$/i, "");
  const exportCols: ExportCol<Row>[] = cols.map((c, i) => ({ ...c, label: headers[i] }));

  const go = async () => {
    setBusy("file");
    try {
      if (cfg.format === "csv") download(toCsv(filtered, exportCols, headers), `${fname}.csv`);
      else download(await buildWorkbook({ title: src.label, subtitle: src.description, grain: cap(grain), filename: fname, sheet: src.label,
        rows: filtered, columns: exportCols, context, mock: !!meta?.is_mock, totals: cfg.totals, about: cfg.dico, style: cfg.style }), `${fname}.xlsx`);
      setFlash(`${filtered.length.toLocaleString("fr-FR")} lignes exportées`);
    } finally { setBusy(""); }
  };
  const copy = async () => {
    setBusy("copy");
    try { await navigator.clipboard.writeText(toTsv(filtered.slice(0, 100_000), exportCols, headers)); setFlash("Copié : collez dans Excel (Ctrl V)"); }
    catch { setFlash("Copie refusée par le navigateur : utilisez le téléchargement"); }
    finally { setBusy(""); }
  };
  useEffect(() => { if (!flash) return; const t = window.setTimeout(() => setFlash(""), 3200); return () => window.clearTimeout(t); }, [flash]);
  const saveModel = () => {
    const name = window.prompt("Nom de ce modèle d'export", `${src.label} · ${cols.length} champs`);
    if (!name) return;
    setModels((m) => [{ id: Math.random().toString(36).slice(2, 9), name, cfg, at: new Date().toISOString() }, ...m].slice(0, 24));
    setFlash("Modèle enregistré");
  };
  const pickSource = (id: string) => set((c) => (c.src === id ? c : { ...fresh(id, { ...c.p }), style: c.style, format: c.format, dico: c.dico }));
  const levelChange = (l: SrcParams["level"]) => set((c) => ({ ...c, p: { ...c.p, level: l }, cols: sourceById(c.src).defaults({ ...c.p, level: l }) }));
  const featured = SOURCES.filter((x) => x.featured);
  const others = SOURCES.filter((x) => !x.featured);

  return (
    <div className="xw">
      {/* ------------------------------------------------ 1. la source */}
      <section className="xw__src" aria-label="Que voulez-vous exporter ?">
        <div className="xw__h"><span className="xw__n num">01</span><h2>Que voulez-vous exporter&nbsp;?</h2>
          {models.length > 0 && (
            <div className="xw__models" aria-label="Mes modèles">
              <span className="small muted">Mes modèles</span>
              {models.slice(0, 6).map((m) => (
                <span key={m.id} className="xw__model">
                  <button type="button" onClick={() => setCfg({ ...fresh(m.cfg.src), ...m.cfg })}>{m.name}</button>
                  <button type="button" aria-label={`Supprimer le modèle ${m.name}`} onClick={() => setModels((x) => x.filter((y) => y.id !== m.id))}><I.Close size={11} /></button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="xw__srcs" role="radiogroup" aria-label="Source">
          {featured.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={cfg.src === x.id} className={`xf1${cfg.src === x.id ? " is-on" : ""}`} onClick={() => pickSource(x.id)}>
              <span className="xf1__tag">Product Info{cfg.src === x.id && data?.columns ? ` · ${data.columns.length} champs` : " · tous les champs"}</span>
              <b>{x.label}</b><span className="xf1__d">{x.description}</span><i>{cap(x.grain(DEFAULT_SRC))}</i>
            </button>
          ))}
          <div className="xw__others">
            {(["Gestion", "Distribution", "Portefeuilles", "Passif"] as const).map((g) => others.some((x) => x.group === g) && (
              <div key={g} className="xw__og"><span>{g}</span>
                {others.filter((x) => x.group === g).map((x) => (
                  <button key={x.id} type="button" role="radio" aria-checked={cfg.src === x.id} className={`xf2${cfg.src === x.id ? " is-on" : ""}`} onClick={() => pickSource(x.id)} title={`${x.description} — ${x.grain(DEFAULT_SRC)}`}>{x.label}</button>
                ))}
              </div>
            ))}
          </div>
        </div>
        {src.nominative && <p className="xs__warn small"><I.Alert size={14} /> Données nominatives, usage interne : calculées à la demande dans la source.</p>}
      </section>

      {/* ------------------------------------------------ 2. périmètre (seulement les réglages utiles à la source) */}
      {src.controls.length > 0 && (
        <section className="xw__scope" aria-label="Périmètre">
          {src.controls.includes("level") && <Field label="Niveau de détail"><Seg value={cfg.p.level} onChange={levelChange} options={LEVELS.map((l) => [l.id, l.label])} /></Field>}
          {src.controls.includes("freq") && <Field label="Pas de temps"><Seg value={cfg.p.freq} onChange={(v) => setP("freq", v)} options={FREQS.map((f) => [f.id, f.label])} /></Field>}
          {src.controls.includes("period") && (
            <Field label={`Période${cfg.p.span !== "perso" ? ` · ${bounds.from ? `du ${fdate(bounds.from)} au ${fdate(asOf ?? "")}` : "tout l'historique"}` : ""}`}>
              <Seg value={cfg.p.span} onChange={(v) => setP("span", v)} options={SPANS.map((x) => [x.id, x.label])} wrap />
              {cfg.p.span === "perso" && (
                <div className="xs__dates">
                  <label>Du <input type="date" value={cfg.p.from} max={asOf ?? undefined} onChange={(e) => setP("from", e.target.value)} /></label>
                  <label>au <input type="date" value={cfg.p.to} max={asOf ?? undefined} onChange={(e) => setP("to", e.target.value)} /></label>
                </div>
              )}
            </Field>
          )}
          {src.controls.includes("families") && (
            <Field label="Familles de gestion">
              <div className="xchips">
                {FAMILY_CHOICES.map((f) => {
                  const on = cfg.p.families.includes(f.id);
                  return <button key={f.id} type="button" aria-pressed={on} className={`chip${on ? " chip--on" : ""}`} onClick={() => setP("families", on ? cfg.p.families.filter((x) => x !== f.id) : [...cfg.p.families, f.id])}>{f.label}</button>;
                })}
                {cfg.p.families.length > 0 && <button type="button" className="link small" onClick={() => setP("families", [])}>Toutes</button>}
              </div>
            </Field>
          )}
          {src.controls.includes("funds") && <Field label="Fonds"><FundPicker value={cfg.p.funds} onChange={(v) => setP("funds", v)} /></Field>}
          {src.controls.includes("dim") && (
            <Field label="Axe de répartition"><select className="xs__sel" value={cfg.p.dim} onChange={(e) => setP("dim", e.target.value)}>{DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select></Field>
          )}
          {src.controls.includes("rmm") && <Toggle on={cfg.p.rmm} set={(v) => setP("rmm", v)} label="Fonds Rothschild Martin Maurel inclus" />}
          {src.controls.includes("actifs") && <Toggle on={!cfg.p.actifs} set={(v) => setP("actifs", !v)} label="Enregistrements inactifs inclus" />}
          {src.controls.includes("top") && <Field label="Clients"><Seg value={String(cfg.p.top)} onChange={(v) => setP("top", Number(v))} options={[["60", "60 premiers"], ["150", "150 premiers"], ["300", "300 premiers"]]} /></Field>}
        </section>
      )}

      {/* ------------------------------------------------ 3. les champs, la feuille, le fichier */}
      <div className="xw__main">
        <FieldLibrary avail={avail} packs={packs} sel={cfg.cols} loading={loading} onToggle={toggleCol} onSet={setCols} />
        <div className="xw__stage">
          <div className="xw__bar">
            <span className="xw__n num">03</span>
            <div className="xw__grain"><b>{cap(grain)}</b><span className="small muted">{loading ? "Chargement…" : `${filtered.length.toLocaleString("fr-FR")} lignes${filtered.length !== rows.length ? ` sur ${rows.length.toLocaleString("fr-FR")}` : ""} × ${cols.length} colonnes`}</span></div>
            <Filters rows={rows} cols={avail} filters={cfg.filters} onChange={(f) => set((c) => ({ ...c, filters: f }))} />
          </div>
          <div className="xw__sheet" style={{ ["--h-bg" as string]: `#${st.head}`, ["--h-ink" as string]: `#${st.ink}`, ["--h-rule" as string]: `#${st.rule}`, ["--z" as string]: st.zebra ? `#${st.zebra}` : "#fff" }}>
            {res?.error && res.key === loadKey ? <div className="xpv__msg"><I.Alert size={18} /> {res.error}</div>
              : data?.tooMany ? <div className="xpv__msg"><I.Info size={18} /> Cette extraction produirait {data.tooMany.n.toLocaleString("fr-FR")} lignes (limite&nbsp;: {data.tooMany.limit.toLocaleString("fr-FR")}). Choisissez un pas de temps plus large, une période plus courte ou moins de fonds.</div>
              : loading ? <div className="xpv__msg xpv__msg--load"><span className="xpv__spin" aria-hidden="true" /> Préparation des lignes…</div>
              : !cols.length ? (
                <div className="xw__empty">
                  <b>Votre tableau est vide.</b>
                  <span>Commencez par un pack de champs, ou cochez des champs à gauche.</span>
                  <div className="xw__emptyp">{packs.slice(0, 6).map((p) => <button key={p.id} type="button" onClick={() => setCols(p.keys.filter((k) => byKey.has(k)))}>{p.label}</button>)}
                    <button type="button" onClick={() => setCols(src.defaults(cfg.p).filter((k) => byKey.has(k)))}>Sélection conseillée</button></div>
                </div>
              ) : (
                <Sheet rows={filtered} cols={cols} headers={headers} names={cfg.names} sort={cfg.sort} zebra={!!st.zebra}
                  onSort={(k) => set((c) => ({ ...c, sort: c.sort?.col === k ? (c.sort.dir === -1 ? { col: k, dir: 1 } : null) : { col: k, dir: -1 } }))}
                  onMove={(from, to) => { const t = cfg.cols.filter((k) => byKey.has(k)); const [x] = t.splice(from, 1); t.splice(to, 0, x); setCols(t); }}
                  onRemove={(k) => toggleCol(k)} onRename={(k, v) => set((c) => ({ ...c, names: { ...c.names, [k]: v } }))} />
              )}
          </div>

          {/* ---------------------------------------------- le fichier */}
          <div className="xdock">
            <div className="xdock__styles" role="radiogroup" aria-label="Style du tableau">
              {XSTYLES.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={cfg.style === x.id || (!cfg.style && x.id === "rco")} className="xdock__st" onClick={() => set((c) => ({ ...c, style: x.id }))} title={x.note}>
                  <span className="xdock__sw" aria-hidden="true"><i style={{ background: `#${x.head}`, borderBottomColor: `#${x.rule}` }} /><i style={{ background: x.zebra ? `#${x.zebra}` : "#fff" }} /><i /></span>
                  <span>{x.label}</span>
                </button>
              ))}
            </div>
            <div className="xdock__opts">
              <Seg value={cfg.format} onChange={(v) => set((c) => ({ ...c, format: v }))} options={[["xlsx", "Excel"], ["csv", "CSV"]]} />
              {cfg.format === "xlsx" && <>
                <Toggle on={cfg.dico} set={(v) => set((c) => ({ ...c, dico: v }))} label="Dictionnaire et paramètres" />
                <Toggle on={cfg.totals} set={(v) => set((c) => ({ ...c, totals: v }))} label="Ligne de totaux" />
              </>}
              <label className="xdock__file"><span className="small muted">Fichier</span><input value={cfg.file} placeholder={fname} onChange={(e) => set((c) => ({ ...c, file: e.target.value }))} /><span className="small muted">.{cfg.format}</span></label>
            </div>
            <div className="xdock__go">
              {flash && <span className="xgo__flash small" role="status"><I.Check size={14} /> {flash}</span>}
              <button type="button" className="btn btn--ghost" onClick={saveModel} title="Retrouver ces réglages en un clic">Enregistrer le modèle</button>
              <button type="button" className="btn btn--ghost" onClick={copy} disabled={loading || !filtered.length || !cols.length || !!busy}>{busy === "copy" ? "Copie…" : "Copier pour Excel"}</button>
              <button type="button" className="btn btn--gold xgo__main" onClick={go} disabled={loading || !filtered.length || !cols.length || !!busy}>
                <I.Download size={16} /> {busy === "file" ? "Génération…" : `Télécharger · ${filtered.length.toLocaleString("fr-FR")} lignes`}
              </button>
            </div>
          </div>
          <p className="xtip small muted"><I.Info size={14} /> Glissez un en-tête pour déplacer une colonne, double-cliquez pour le renommer, cliquez pour trier. Le fichier contient un tableau Excel structuré en A1&nbsp;: filtres, tableaux croisés et Copilot l'utilisent tel quel.</p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ bibliothèque de champs
function FieldLibrary({ avail, packs, sel, loading, onToggle, onSet }: {
  avail: ExportCol<Row>[]; packs: Pack[]; sel: string[]; loading: boolean; onToggle: (k: string) => void; onSet: (k: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const keys = useMemo(() => new Set(avail.map((c) => c.key)), [avail]);
  const fold = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const groups = useMemo(() => {
    const g = new Map<string, ExportCol<Row>[]>();
    const f = fold(q.trim());
    avail.filter((c) => !f || fold(`${c.label} ${c.desc ?? ""} ${c.group ?? ""}`).includes(f)).forEach((c) => g.set(c.group ?? "Champs", [...(g.get(c.group ?? "Champs") ?? []), c]));
    return [...g.entries()];
  }, [avail, q]);
  const nPi = avail.filter((c) => c.key.startsWith("pi.")).length;
  const selSet = new Set(sel);
  return (
    <aside className="xlib" aria-label="Champs">
      <div className="xlib__h">
        <span className="xw__n num">02</span>
        <div><h2>Les champs</h2><span className="small muted">{loading ? "…" : `${avail.length} champs${nPi ? `, dont ${nPi} Product Info` : ""}`}</span></div>
        {sel.length > 0 && <button type="button" className="link small" onClick={() => onSet([])}>Vider ({sel.filter((k) => keys.has(k)).length})</button>}
      </div>
      {packs.length > 0 && (
        <div className="xlib__packs" aria-label="Packs de champs">
          <div className="xlib__k">Packs prêts à l'emploi</div>
          <div className="xpk">
            {packs.map((p) => {
              const ks = p.keys.filter((k) => keys.has(k));
              const n = ks.filter((k) => selSet.has(k)).length;
              const state = n === 0 ? "" : n === ks.length ? " is-on" : " is-part";
              return (
                <button key={p.id} type="button" className={`xpk__b${state}`} aria-pressed={n === ks.length && n > 0} title={p.desc}
                  onClick={() => {
                    if (n !== ks.length) { onSet([...sel, ...ks.filter((k) => !selSet.has(k))]); return; }
                    // retirer le pack sans retirer les champs qu'un autre pack entièrement choisi utilise aussi
                    const kept = new Set(packs.filter((o) => o.id !== p.id).map((o) => o.keys.filter((k) => keys.has(k))).filter((o) => o.length && o.every((k) => selSet.has(k))).flat());
                    onSet(sel.filter((k) => !ks.includes(k) || kept.has(k)));
                  }}>
                  <span className="xpk__c" aria-hidden="true">{n === ks.length && n > 0 ? <I.Check size={12} /> : "+"}</span>
                  <b>{p.label}</b><i className="num">{ks.length}</i>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <label className="xs__search xlib__search"><I.Search size={14} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un champ : frais, ISIN, SFDR, gérant…" aria-label="Chercher un champ" /></label>
      <div className="xlib__groups">
        {groups.map(([g, cs], gi) => {
          const n = cs.filter((c) => selSet.has(c.key)).length;
          const isPi = g.startsWith("Product Info");
          const isOpen = q.trim() ? true : open[g] ?? (gi < 2 && !g.includes("Autres"));
          return (
            <section key={g} className={`xlg${isOpen ? " is-open" : ""}`}>
              <button type="button" className="xlg__h" onClick={() => setOpen((o) => ({ ...o, [g]: !isOpen }))} aria-expanded={isOpen}>
                {isPi && <span className="xlg__pi">PI</span>}
                <span className="xlg__t">{g.replace(/^Product Info · |^Mesures · /, "")}</span>
                <span className={`xlg__n num${n ? " is-on" : ""}`}>{n ? `${n}/` : ""}{cs.length}</span>
                <span className="xlg__c" aria-hidden="true">{isOpen ? <I.Up size={12} /> : <I.Down size={12} />}</span>
              </button>
              {isOpen && (
                <div className="xlg__b">
                  <button type="button" className="xlg__all" onClick={() => onSet(n === cs.length ? sel.filter((k) => !cs.some((c) => c.key === k)) : [...sel, ...cs.map((c) => c.key).filter((k) => !selSet.has(k))])}>
                    {n === cs.length ? "Tout retirer" : "Tout ajouter"}</button>
                  {cs.slice(0, q.trim() ? 80 : 400).map((c) => (
                    <label key={c.key} className={`xlf${selSet.has(c.key) ? " is-on" : ""}`} title={c.desc}>
                      <input type="checkbox" checked={selSet.has(c.key)} onChange={() => onToggle(c.key)} />
                      <span className="xlf__l">{c.label}</span>
                      <span className="xlf__k">{KIND_SHORT[c.kind ?? "text"]}</span>
                    </label>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        {!groups.length && <p className="small muted">Aucun champ ne correspond à « {q} ».</p>}
      </div>
    </aside>
  );
}
const KIND_SHORT: Record<string, string> = { text: "Aa", code: "#", int: "123", num: "1,2", eur: "€", pct: "%", date: "jj/mm", bool: "O/N" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="xf"><div className="xf__l">{label}</div><div className="xf__v">{children}</div></div>;
}
function Seg<T extends string>({ value, onChange, options, wrap }: { value: T; onChange: (v: T) => void; options: [T, string][]; wrap?: boolean }) {
  return (
    <div className={`xseg${wrap ? " xseg--wrap" : ""}`} role="radiogroup">
      {options.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? "is-on" : ""} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}
function Toggle({ on, set, label, sub }: { on: boolean; set: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`xt${on ? " is-on" : ""}`} onClick={() => set(!on)}>
      <span className="xt__sw" aria-hidden="true"><i /></span>
      <span className="xt__l"><b>{label}</b>{sub && <span>{sub}</span>}</span>
    </button>
  );
}

function FundPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { api } = useApp();
  const { data } = useApi<{ funds: FundRow[] }>(api("/api/funds"));
  const [q, setQ] = useState("");
  const funds = useMemo(() => [...(data?.funds ?? [])].sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0)), [data]);
  const name = new Map(funds.map((f) => [f.id, f.name]));
  const hits = funds.filter((f) => !value.includes(f.id) && (!q || f.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 8);
  return (
    <div className="xfp">
      <div className="xchips">
        {value.length === 0 && <span className="small muted">Tous les fonds</span>}
        {value.map((id) => <button key={id} type="button" className="chip chip--on" onClick={() => onChange(value.filter((x) => x !== id))}>{name.get(id) ?? id} <I.Close size={11} /></button>)}
        {value.length > 0 && <button type="button" className="link small" onClick={() => onChange([])}>Tous</button>}
      </div>
      <label className="xs__search"><I.Search size={14} /><input type="search" placeholder="Ajouter un fonds…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {q && (
        <ul className="xfp__list">
          {hits.map((f) => <li key={f.id}><button type="button" onClick={() => { onChange([...value, f.id]); setQ(""); }}>{f.name}</button></li>)}
          {!hits.length && <li className="small muted">Aucun fonds.</li>}
        </ul>
      )}
    </div>
  );
}

function Filters({ rows, cols, filters, onChange }: { rows: Row[]; cols: ExportCol<Row>[]; filters: Filter[]; onChange: (f: Filter[]) => void }) {
  const byKey = new Map(cols.map((c) => [c.key, c]));
  const [adding, setAdding] = useState(false);
  const setF = (i: number, f: Filter) => onChange(filters.map((x, k) => (k === i ? f : x)));
  return (
    <div className="xfl">
      {filters.map((f, i) => byKey.has(f.col) && (
        <FilterEditor key={`${f.col}-${i}`} f={f} c={byKey.get(f.col)!} rows={rows} onChange={(x) => setF(i, x)} onRemove={() => onChange(filters.filter((_, k) => k !== i))} />
      ))}
      {adding ? (
        <select className="xs__sel" autoFocus defaultValue="" onBlur={() => setAdding(false)} onChange={(e) => {
          const c = byKey.get(e.target.value);
          if (c) onChange([...filters, defaultFilter(rows, c)]);
          setAdding(false);
        }}>
          <option value="" disabled>Filtrer sur la colonne…</option>
          {cols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      ) : (
        <button type="button" className="btn btn--ghost xfl__add" onClick={() => setAdding(true)} disabled={!rows.length}><span aria-hidden="true">＋</span> Ajouter un filtre</button>
      )}
    </div>
  );
}

function FilterEditor({ f, c, rows, onChange, onRemove }: { f: Filter; c: ExportCol<Row>; rows: Row[]; onChange: (f: Filter) => void; onRemove: () => void }) {
  const [q, setQ] = useState("");
  const vals = useMemo(() => (f.op === "in" ? facet(rows, c) : []), [rows, c, f.op]);
  const pct = c.kind === "pct";
  const toIn = (v: number | null) => (v == null ? "" : String(pct ? +(v * 100).toFixed(6) : v));
  const fromIn = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")) / (pct ? 100 : 1));
  return (
    <div className={`xfe${isActive(f) ? " is-on" : ""}`}>
      <div className="xfe__h"><b>{c.label}</b><span className="small muted">{KIND_LABEL[c.kind ?? "text"]}</span><button type="button" className="xfe__x" onClick={onRemove} aria-label={`Retirer le filtre ${c.label}`}><I.Close size={12} /></button></div>
      {f.op === "in" && (
        <>
          {vals.length > 8 && <label className="xs__search"><I.Search size={13} /><input type="search" placeholder="Chercher une valeur…" value={q} onChange={(e) => setQ(e.target.value)} /></label>}
          <div className="xfe__vals">
            {vals.filter((v) => !q || v.value.toLowerCase().includes(q.toLowerCase())).slice(0, 60).map((v) => {
              const on = f.values.includes(v.value);
              return (
                <label key={v.value} className={`xfe__v${on ? " is-on" : ""}`}>
                  <input type="checkbox" checked={on} onChange={() => onChange({ ...f, values: on ? f.values.filter((x) => x !== v.value) : [...f.values, v.value] })} />
                  <span className={v.value === EMPTY ? "muted" : ""}>{v.value}</span><i className="num">{v.n.toLocaleString("fr-FR")}</i>
                </label>
              );
            })}
          </div>
          {f.values.length > 0 && <button type="button" className="link small" onClick={() => onChange({ ...f, values: [] })}>Tout désélectionner</button>}
        </>
      )}
      {f.op === "text" && <input className="xs__in" placeholder="Contient…" value={f.q} onChange={(e) => onChange({ ...f, q: e.target.value })} />}
      {f.op === "range" && (
        <div className="xfe__range">
          <label>Min <input inputMode="decimal" className="xs__in" value={toIn(f.min)} onChange={(e) => onChange({ ...f, min: fromIn(e.target.value) })} placeholder="—" /></label>
          <label>Max <input inputMode="decimal" className="xs__in" value={toIn(f.max)} onChange={(e) => onChange({ ...f, max: fromIn(e.target.value) })} placeholder="—" /></label>
          {pct && <span className="small muted">en %</span>}
          {c.kind === "eur" && <span className="small muted">en euros</span>}
        </div>
      )}
      {f.op === "dates" && (
        <div className="xfe__range">
          <label>Du <input type="date" className="xs__in" value={f.from ?? ""} onChange={(e) => onChange({ ...f, from: e.target.value || null })} /></label>
          <label>au <input type="date" className="xs__in" value={f.to ?? ""} onChange={(e) => onChange({ ...f, to: e.target.value || null })} /></label>
        </div>
      )}
    </div>
  );
}

function fmtCell(c: ExportCol<Row>, r: Row): string {
  const v = cellValue(c, r);
  if (v == null) return "";
  if (v instanceof Date) return v.toLocaleDateString("fr-FR", { timeZone: "UTC" });
  if (typeof v === "number") {
    if (c.kind === "pct") return `${(v * 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
    if (c.kind === "eur") return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (c.kind === "int") return Math.round(v).toLocaleString("fr-FR");
    return v.toLocaleString("fr-FR", { maximumFractionDigits: c.digits ?? 2 });
  }
  return v;
}

// ------------------------------------------------------------------ la feuille : les en-têtes se manipulent directement
function Sheet({ rows, cols, headers, names, sort, zebra, onSort, onMove, onRemove, onRename }: {
  rows: Row[]; cols: ExportCol<Row>[]; headers: string[]; names: Record<string, string>; sort: Sort; zebra: boolean;
  onSort: (k: string) => void; onMove: (from: number, to: number) => void; onRemove: (k: string) => void; onRename: (k: string, v: string) => void;
}) {
  const N = 120;
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const letter = (i: number) => { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  return (
    <div className={`xtab xtab--live${zebra ? "" : " is-plain"}`} role="region" aria-label="Aperçu du tableau exporté" tabIndex={0}>
      <table>
        <thead>
          <tr><th className="xtab__rn" aria-hidden="true" />{cols.map((c, i) => <th key={c.key} className="xtab__col" aria-hidden="true">{letter(i)}</th>)}</tr>
          <tr>
            <th className="xtab__rn">1</th>
            {cols.map((c, i) => (
              <th key={c.key} className={`xh${NUMK.has(c.kind ?? "") ? " n" : ""}${drag === i ? " is-drag" : ""}${over === i && drag !== null && drag !== i ? " is-over" : ""}`}
                draggable={edit !== c.key} aria-sort={sort?.col === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.key); }}
                onDragOver={(e) => { e.preventDefault(); setOver(i); }} onDragLeave={() => setOver((o) => (o === i ? null : o))}
                onDrop={(e) => { e.preventDefault(); if (drag !== null && drag !== i) onMove(drag, i); setDrag(null); setOver(null); }}
                onDragEnd={() => { setDrag(null); setOver(null); }}>
                {edit === c.key ? (
                  <input className="xh__in" autoFocus defaultValue={headers[i]} aria-label={`Intitulé de la colonne ${c.label}`}
                    onBlur={(e) => { onRename(c.key, e.target.value.trim() === c.label ? "" : e.target.value); setEdit(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEdit(null); }} />
                ) : (
                  <span className="xh__w">
                    <button type="button" className="xh__l" onClick={() => onSort(c.key)} onDoubleClick={() => setEdit(c.key)} title={`${c.label}${names[c.key] ? ` (renommé)` : ""} — clic : trier · double-clic : renommer · glisser : déplacer`}>
                      {headers[i]}{sort?.col === c.key && <span aria-hidden="true">{sort.dir === 1 ? " ↑" : " ↓"}</span>}
                    </button>
                    <button type="button" className="xh__x" onClick={() => onRemove(c.key)} aria-label={`Retirer la colonne ${headers[i]}`}>×</button>
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, N).map((r, k) => (
            <tr key={k}><td className="xtab__rn">{k + 2}</td>{cols.map((c) => <td key={c.key} className={NUMK.has(c.kind ?? "") ? "n" : c.kind === "code" ? "code" : ""}>{fmtCell(c, r)}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {rows.length > N && <div className="xtab__more small muted">… et {(rows.length - N).toLocaleString("fr-FR")} lignes de plus dans le fichier</div>}
    </div>
  );
}
