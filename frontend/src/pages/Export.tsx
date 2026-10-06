/**
 * Export — la fonction prioritaire : sortir des données propres pour les retravailler dans Excel (avec Copilot).
 *
 *   Données (mode principal)  une source, son niveau de détail et sa période, des filtres, des colonnes (ordre, intitulés) ;
 *                             aperçu en direct ; classeur Excel « propre » (tableau structuré en A1, une ligne par
 *                             enregistrement, dictionnaire, paramètres), CSV, ou copie directe dans Excel. Modèles enregistrés.
 *   Rapport (second plan)     le studio de rapports mis en forme (graphiques, styles, page de garde) et sa version PDF.
 * Tout est généré dans le navigateur à partir des API de l'application (lecture seule) : rien n'est écrit côté serveur.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../lib/context";
import { useApi } from "../lib/api";
import { date as fdate } from "../lib/format";
import { gsap } from "../lib/gsap";
import { prefersReducedMotion } from "../lib/motion";
import type { FundRow } from "../lib/types";
import { buildWorkbook, cellValue, download, toCsv, toTsv, uniqueHeaders, KIND_LABEL, type ExportCol } from "../lib/xlsx";
import { DEFAULT_SRC, FAMILY_CHOICES, FREQS, LEVELS, SOURCES, SPANS, periodBounds, sourceById, type Loaded, type Row, type SrcParams } from "../lib/export/sources";
import { EMPTY, applyFilters, applySort, defaultFilter, describe, facet, isActive, type Filter, type Sort } from "../lib/export/filters";
import { DIMS } from "../lib/report/datasets";
import * as I from "../components/Icon";
import { ReportStudio } from "./ExportReport";
import "../styles/xport.css";

type Cfg = { src: string; p: SrcParams; cols: string[]; names: Record<string, string>; filters: Filter[]; sort: Sort; format: "xlsx" | "csv"; dico: boolean; totals: boolean; file: string };
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
    <div className="xp">
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
  const [cfg, setCfg] = useState<Cfg>(() => { const c = store.get<Cfg | null>(KEY, null); return c && SOURCES.some((s) => s.id === c.src) ? { ...fresh(c.src), ...c, p: { ...DEFAULT_SRC, ...c.p } } : fresh("encours"); });
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
  const rows = res?.key === loadKey ? res.data?.rows ?? [] : [];

  // colonnes disponibles : celles de la source présentes dans les lignes (le niveau de détail en ajoute ou en retire)
  const avail = useMemo(() => {
    if (!rows.length) return src.columns;
    const keys = new Set(Object.keys(rows[0]));
    return src.columns.filter((c) => c.get || keys.has(c.key));
  }, [rows, src]);
  const byKey = useMemo(() => new Map(avail.map((c) => [c.key, c])), [avail]);
  const cols = cfg.cols.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!);
  const headers = uniqueHeaders(cols.map((c) => cfg.names[c.key]?.trim() || c.label));
  const filtered = useMemo(() => applySort(applyFilters(rows, cfg.filters, byKey), cfg.sort, byKey), [rows, cfg.filters, cfg.sort, byKey]);

  const bounds = periodBounds(cfg.p, asOf ?? null);
  const grain = src.grain(cfg.p);
  const context = [
    ...(asOf ? [{ label: "Date de valeur", value: fdate(asOf) }] : []),
    ...(src.controls.includes("level") ? [{ label: "Niveau de détail", value: LEVELS.find((l) => l.id === cfg.p.level)!.label }] : []),
    ...(src.controls.includes("freq") ? [{ label: "Pas de temps", value: FREQS.find((f) => f.id === cfg.p.freq)!.label }] : []),
    ...(src.controls.includes("period") ? [{ label: "Période", value: res?.data?.period?.from ? `du ${fdate(res.data.period.from)} au ${fdate(res.data.period.to ?? asOf ?? "")}` : SPANS.find((s) => s.id === cfg.p.span)!.label }] : []),
    ...(src.controls.includes("families") && cfg.p.families.length ? [{ label: "Familles", value: cfg.p.families.map((f) => FAMILY_CHOICES.find((x) => x.id === f)?.label ?? f).join(", ") }] : []),
    ...(src.controls.includes("funds") && cfg.p.funds.length ? [{ label: "Fonds", value: `${cfg.p.funds.length} fonds choisis` }] : []),
    ...(src.controls.includes("rmm") ? [{ label: "Fonds RMM", value: cfg.p.rmm ? "inclus" : "exclus" }] : []),
    ...(src.controls.includes("actifs") ? [{ label: "Enregistrements", value: cfg.p.actifs ? "actifs uniquement" : "actifs et inactifs" }] : []),
    ...(src.controls.includes("dim") ? [{ label: "Axe", value: DIMS.find((d) => d.key === cfg.p.dim)?.label ?? cfg.p.dim }] : []),
    ...(src.controls.includes("top") ? [{ label: "Clients", value: `${cfg.p.top} premiers par encours` }] : []),
    ...cfg.filters.filter(isActive).map((f) => ({ label: "Filtre", value: describe(f, byKey.get(f.col)) })),
    ...(cfg.sort && byKey.has(cfg.sort.col) ? [{ label: "Tri", value: `${byKey.get(cfg.sort.col)!.label} ${cfg.sort.dir === 1 ? "croissant" : "décroissant"}` }] : []),
  ];
  const fname = (cfg.file.trim() || `${slug(src.label)}-${slug(grain.replace(/^une ligne par /, ""))}-${(asOf ?? new Date().toISOString()).slice(0, 10)}`).replace(/\.(xlsx|csv)$/i, "");
  const exportCols: ExportCol<Row>[] = cols.map((c, i) => ({ ...c, label: headers[i] }));

  const go = async () => {
    setBusy("file");
    try {
      if (cfg.format === "csv") download(toCsv(filtered, exportCols, headers), `${fname}.csv`);
      else download(await buildWorkbook({ title: src.label, subtitle: src.description, grain: cap(grain), filename: fname, sheet: src.label,
        rows: filtered, columns: exportCols, context, mock: !!meta?.is_mock, totals: cfg.totals, about: cfg.dico }), `${fname}.xlsx`);
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
    const name = window.prompt("Nom de ce modèle d'export", `${src.label} · ${grain.replace(/^une ligne par /, "")}`);
    if (!name) return;
    setModels((m) => [{ id: Math.random().toString(36).slice(2, 9), name, cfg, at: new Date().toISOString() }, ...m].slice(0, 24));
    setFlash("Modèle enregistré");
  };
  const pickSource = (id: string) => set((c) => (c.src === id ? c : fresh(id, { ...c.p })));
  const levelChange = (l: SrcParams["level"]) => set((c) => ({ ...c, p: { ...c.p, level: l }, cols: sourceById(c.src).defaults({ ...c.p, level: l }) }));

  return (
    <div className="xd2">
      <div className="xd2__cfg">
        {models.length > 0 && (
          <section className="xs xs--models" aria-label="Mes modèles d'export">
            <div className="xs__h"><span className="eyebrow">Mes modèles</span></div>
            <ul className="xm">
              {models.map((m) => (
                <li key={m.id}>
                  <button type="button" className="xm__b" onClick={() => setCfg({ ...fresh(m.cfg.src), ...m.cfg })}><b>{m.name}</b><span>{sourceById(m.cfg.src).label}</span></button>
                  <button type="button" className="xm__x" aria-label={`Supprimer le modèle ${m.name}`} onClick={() => setModels((x) => x.filter((y) => y.id !== m.id))}><I.Close size={12} /></button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Step n="01" title="Source" sub={cap(grain)}>
          <div className="xsrc">
            {(["Gestion", "Distribution", "Portefeuilles", "Passif"] as const).map((g) => (
              <div key={g} className="xsrc__g" role="radiogroup" aria-label={g}>
                <div className="xsrc__gh">{g}</div>
                {SOURCES.filter((s) => s.group === g).map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={cfg.src === s.id} className={`xsrc__b${cfg.src === s.id ? " is-on" : ""}`} onClick={() => pickSource(s.id)} title={s.description}>
                    <b>{s.label}</b><i>{cap(s.grain(cfg.src === s.id ? cfg.p : DEFAULT_SRC))}</i>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <p className="xsrc__d small">{src.description}.</p>
          {src.nominative && <p className="xs__warn small"><I.Alert size={14} /> Données nominatives, usage interne : calculées à la demande dans la source.</p>}
        </Step>

        {src.controls.length > 0 && (
          <Step n="02" title="Niveau de détail et période" sub={context.filter((c) => c.label !== "Filtre" && c.label !== "Tri" && c.label !== "Date de valeur").map((c) => c.value).join(" · ")}>
            {src.controls.includes("level") && (
              <Field label="Niveau de détail">
                <Seg value={cfg.p.level} onChange={levelChange} options={LEVELS.map((l) => [l.id, l.label])} />
              </Field>
            )}
            {src.controls.includes("freq") && <Field label="Pas de temps"><Seg value={cfg.p.freq} onChange={(v) => setP("freq", v)} options={FREQS.map((f) => [f.id, f.label])} /></Field>}
            {src.controls.includes("period") && (
              <Field label="Période">
                <Seg value={cfg.p.span} onChange={(v) => setP("span", v)} options={SPANS.map((s) => [s.id, s.label])} wrap />
                {cfg.p.span === "perso" && (
                  <div className="xs__dates">
                    <label>Du <input type="date" value={cfg.p.from} max={asOf ?? undefined} onChange={(e) => setP("from", e.target.value)} /></label>
                    <label>au <input type="date" value={cfg.p.to} max={asOf ?? undefined} onChange={(e) => setP("to", e.target.value)} /></label>
                  </div>
                )}
                {cfg.p.span !== "perso" && <p className="small muted xs__hint">{bounds.from ? `Du ${fdate(bounds.from)} au ${fdate(asOf ?? "")}` : "Tout l'historique disponible"}</p>}
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
              <Field label="Axe de répartition">
                <select className="xs__sel" value={cfg.p.dim} onChange={(e) => setP("dim", e.target.value)}>{DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
              </Field>
            )}
            {src.controls.includes("rmm") && <Toggle on={cfg.p.rmm} set={(v) => setP("rmm", v)} label="Inclure les fonds Rothschild Martin Maurel" />}
            {src.controls.includes("actifs") && <Toggle on={!cfg.p.actifs} set={(v) => setP("actifs", !v)} label="Inclure les enregistrements inactifs" />}
            {src.controls.includes("top") && <Field label="Clients"><Seg value={String(cfg.p.top)} onChange={(v) => setP("top", Number(v))} options={[["60", "60 premiers"], ["150", "150 premiers"], ["300", "300 premiers"]]} /></Field>}
          </Step>
        )}

        <Step n={src.controls.length ? "03" : "02"} title="Filtres" sub={cfg.filters.filter(isActive).length ? `${cfg.filters.filter(isActive).length} actif(s) · ${filtered.length.toLocaleString("fr-FR")} lignes sur ${rows.length.toLocaleString("fr-FR")}` : "Aucun : toutes les lignes"}>
          <Filters rows={rows} cols={avail} filters={cfg.filters} onChange={(f) => set((c) => ({ ...c, filters: f }))} />
        </Step>

        <Step n={src.controls.length ? "04" : "03"} title="Colonnes" sub={`${cols.length} sur ${avail.length} · glisser pour réordonner, cliquer un intitulé pour le renommer`}>
          <Columns avail={avail} sel={cfg.cols.filter((k) => byKey.has(k))} names={cfg.names} defaults={src.defaults(cfg.p).filter((k) => byKey.has(k))}
            onSel={(s) => set((c) => ({ ...c, cols: s }))} onName={(k, v) => set((c) => ({ ...c, names: { ...c.names, [k]: v } }))} />
        </Step>

        <Step n={src.controls.length ? "05" : "04"} title="Fichier" sub={cfg.format === "xlsx" ? "Classeur Excel · tableau structuré" : "CSV · séparateur point-virgule"}>
          <Field label="Format">
            <Seg value={cfg.format} onChange={(v) => set((c) => ({ ...c, format: v }))} options={[["xlsx", "Excel (.xlsx)"], ["csv", "CSV (.csv)"]]} />
          </Field>
          <Field label="Tri">
            <div className="xs__sort">
              <select className="xs__sel" value={cfg.sort?.col ?? ""} onChange={(e) => set((c) => ({ ...c, sort: e.target.value ? { col: e.target.value, dir: c.sort?.dir ?? -1 } : null }))}>
                <option value="">Ordre de la source</option>
                {cols.map((c, i) => <option key={c.key} value={c.key}>{headers[i]}</option>)}
              </select>
              {cfg.sort && <Seg value={String(cfg.sort.dir)} onChange={(v) => set((c) => ({ ...c, sort: c.sort && { ...c.sort, dir: Number(v) as 1 | -1 } }))} options={[["1", "Croissant"], ["-1", "Décroissant"]]} />}
            </div>
          </Field>
          {cfg.format === "xlsx" && (
            <>
              <Toggle on={cfg.dico} set={(v) => set((c) => ({ ...c, dico: v }))} label="Onglets « Dictionnaire » et « Paramètres »" sub="Définition de chaque colonne ; source, période et filtres du fichier" />
              <Toggle on={cfg.totals} set={(v) => set((c) => ({ ...c, totals: v }))} label="Ligne de totaux du tableau" sub="Reconnue comme telle par Excel : elle suit les filtres et n'est pas lue comme une donnée" />
            </>
          )}
          <Field label="Nom du fichier">
            <input className="xs__in" value={cfg.file} placeholder={fname} onChange={(e) => set((c) => ({ ...c, file: e.target.value }))} />
          </Field>
        </Step>
      </div>

      {/* ---------------------------------------------------------- aperçu et sortie */}
      <div className="xd2__out">
        <div className="xpv">
          <div className="xpv__bar">
            <span className="xpv__dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="xpv__file mono">{fname}.{cfg.format}</span>
            <span className="xpv__meta small" aria-live="polite">{loading ? "Chargement…" : `${filtered.length.toLocaleString("fr-FR")} lignes × ${cols.length} colonnes`}</span>
          </div>
          <div className="xpv__grain"><b>{cap(grain)}</b>{cfg.format === "xlsx" ? <> · tableau Excel <code>T_{slug(src.label).replace(/-/g, "_")}</code> en A1</> : null}</div>
          <div className="xpv__sheet">
            {res?.error && res.key === loadKey ? <div className="xpv__msg"><I.Alert size={18} /> {res.error}</div>
              : res?.data?.tooMany ? <div className="xpv__msg"><I.Info size={18} /> Cette extraction produirait {res.data.tooMany.n.toLocaleString("fr-FR")} lignes (limite&nbsp;: {res.data.tooMany.limit.toLocaleString("fr-FR")}). Choisissez un pas de temps plus large, une période plus courte ou moins de fonds.</div>
              : loading ? <div className="xpv__msg xpv__msg--load"><span className="xpv__spin" aria-hidden="true" /> Préparation des lignes…</div>
              : !cols.length ? <div className="xpv__msg">Choisissez au moins une colonne.</div>
              : <Preview rows={filtered} cols={cols} headers={headers} sort={cfg.sort} onSort={(k) => set((c) => ({ ...c, sort: c.sort?.col === k ? (c.sort.dir === -1 ? { col: k, dir: 1 } : null) : { col: k, dir: -1 } }))} />}
          </div>
          {!loading && filtered.length > 0 && (
            <Totals rows={filtered} cols={cols} headers={headers} />
          )}
        </div>
        <div className="xgo">
          <div className="xgo__ctx small muted">{context.slice(0, 6).map((c) => `${c.label} : ${c.value}`).join(" · ")}{meta?.is_mock ? " · données fictives" : ""}</div>
          <div className="xgo__b">
            {flash && <span className="xgo__flash small" role="status"><I.Check size={14} /> {flash}</span>}
            <button type="button" className="btn btn--ghost" onClick={saveModel} title="Retrouver ces réglages en un clic">Enregistrer le modèle</button>
            <button type="button" className="btn btn--ghost" onClick={copy} disabled={loading || !filtered.length || !cols.length || !!busy} title="Copier les lignes (100 000 au plus) pour les coller dans Excel">{busy === "copy" ? "Copie…" : "Copier pour Excel"}</button>
            <button type="button" className="btn btn--gold xgo__main" onClick={go} disabled={loading || !filtered.length || !cols.length || !!busy}>
              <I.Download size={16} /> {busy === "file" ? "Génération…" : `Télécharger · ${filtered.length.toLocaleString("fr-FR")} lignes`}
            </button>
          </div>
        </div>
        <p className="xtip small muted"><I.Info size={14} /> Dans Excel, le tableau structuré se filtre, se trie et alimente un tableau croisé dynamique sans retouche ; Copilot l'utilise tel quel («&nbsp;Quels fonds ont la plus forte collecte cette année&nbsp;?&nbsp;»).</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pièces
function Step({ n, title, sub, children }: { n: string; title: string; sub?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return (
    <section className={`xs${open ? " is-open" : ""}`} aria-labelledby={id}>
      <button type="button" className="xs__h" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="xs__n num">{n}</span>
        <span className="xs__t" id={id}>{title}</span>
        {sub && <span className="xs__s small">{sub}</span>}
        <span className="xs__c" aria-hidden="true">{open ? <I.Up size={14} /> : <I.Down size={14} />}</span>
      </button>
      {open && <div className="xs__b">{children}</div>}
    </section>
  );
}
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

function Columns({ avail, sel, names, defaults, onSel, onName }: {
  avail: ExportCol<Row>[]; sel: string[]; names: Record<string, string>; defaults: string[];
  onSel: (s: string[]) => void; onName: (k: string, v: string) => void;
}) {
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const byKey = new Map(avail.map((c) => [c.key, c]));
  const groups = useMemo(() => {
    const g = new Map<string, ExportCol<Row>[]>();
    avail.filter((c) => !q || `${c.label} ${c.desc ?? ""}`.toLowerCase().includes(q.toLowerCase())).forEach((c) => g.set(c.group ?? "Colonnes", [...(g.get(c.group ?? "Colonnes") ?? []), c]));
    return [...g.entries()];
  }, [avail, q]);
  const toggle = (k: string) => onSel(sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]);
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= sel.length) return; const t = [...sel]; [t[i], t[j]] = [t[j], t[i]]; onSel(t); };
  return (
    <div className="xc">
      <div className="xchips xc__pre">
        <button type="button" className="chip" onClick={() => onSel(defaults)}>Par défaut</button>
        <button type="button" className="chip" onClick={() => onSel(avail.map((c) => c.key))}>Toutes · {avail.length}</button>
        <button type="button" className="chip" onClick={() => onSel([])}>Aucune</button>
      </div>
      <ol className="xc__sel">
        {sel.map((k, i) => {
          const c = byKey.get(k)!;
          const label = names[k]?.trim() || c.label;
          return (
            <li key={k} draggable={edit !== k} className={`xc__it${drag === i ? " is-drag" : ""}`}
              onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); if (drag === null || drag === i) return; const t = [...sel]; const [x] = t.splice(drag, 1); t.splice(i, 0, x); onSel(t); setDrag(i); }}
              onDragEnd={() => setDrag(null)}>
              <span className="xc__grip" aria-hidden="true" />
              <span className="xc__n num">{String(i + 1).padStart(2, "0")}</span>
              {edit === k ? (
                <input className="xc__edit" autoFocus defaultValue={label} aria-label={`Intitulé de la colonne ${c.label}`}
                  onBlur={(e) => { onName(k, e.target.value === c.label ? "" : e.target.value); setEdit(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEdit(null); }} />
              ) : (
                <button type="button" className="xc__l" onClick={() => setEdit(k)} title="Renommer l'en-tête">{label}{names[k]?.trim() && <span className="xc__orig small muted"> · {c.label}</span>}</button>
              )}
              <span className="xc__k small">{KIND_LABEL[c.kind ?? "text"].split(" (")[0]}</span>
              <span className="xc__act">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter ${label}`}><I.Up size={12} /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === sel.length - 1} aria-label={`Descendre ${label}`}><I.Down size={12} /></button>
                <button type="button" onClick={() => toggle(k)} aria-label={`Retirer ${label}`}><I.Close size={12} /></button>
              </span>
            </li>
          );
        })}
        {!sel.length && <li className="small muted xc__none">Aucune colonne : ajoutez-en ci-dessous.</li>}
      </ol>
      <details className="xc__add" open={sel.length < 3}>
        <summary>Ajouter ou retirer des colonnes</summary>
        <label className="xs__search"><I.Search size={14} /><input type="search" placeholder="Chercher une colonne (frais, ISIN, collecte…)" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {groups.map(([g, cs]) => (
          <fieldset key={g} className="xc__grp">
            <legend>{g}</legend>
            {cs.map((c) => (
              <label key={c.key} className={`xc__opt${sel.includes(c.key) ? " is-on" : ""}`} title={c.desc}>
                <input type="checkbox" checked={sel.includes(c.key)} onChange={() => toggle(c.key)} />
                <span>{c.label}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </details>
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

function Preview({ rows, cols, headers, sort, onSort }: { rows: Row[]; cols: ExportCol<Row>[]; headers: string[]; sort: Sort; onSort: (k: string) => void }) {
  const N = 150;
  return (
    <div className="xtab" role="region" aria-label="Aperçu des lignes exportées" tabIndex={0}>
      <table>
        <thead>
          <tr><th className="xtab__rn" aria-hidden="true" />{cols.map((c, i) => <th key={c.key} className="xtab__col" aria-hidden="true">{String.fromCharCode(65 + (i % 26))}{i >= 26 ? Math.floor(i / 26) : ""}</th>)}</tr>
          <tr>
            <th className="xtab__rn">1</th>
            {cols.map((c, i) => (
              <th key={c.key} className={NUMK.has(c.kind ?? "") ? "n" : ""} aria-sort={sort?.col === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => onSort(c.key)} title="Trier">{headers[i]}{sort?.col === c.key && <span aria-hidden="true">{sort.dir === 1 ? " ↑" : " ↓"}</span>}</button>
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

function Totals({ rows, cols, headers }: { rows: Row[]; cols: ExportCol<Row>[]; headers: string[] }) {
  const sums = cols.map((c, i) => ({ c, h: headers[i] })).filter(({ c }) => c.sum && (c.kind === "eur" || c.kind === "int"));
  if (!sums.length) return null;
  return (
    <div className="xsum small">
      {sums.slice(0, 4).map(({ c, h }) => {
        const s = rows.reduce((a, r) => { const v = cellValue(c, r); return a + (typeof v === "number" ? v : 0); }, 0);
        return <span key={c.key}><i>Σ {h}</i> <b className="num">{c.kind === "eur" ? `${(s / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M€` : Math.round(s).toLocaleString("fr-FR")}</b></span>;
      })}
    </div>
  );
}
