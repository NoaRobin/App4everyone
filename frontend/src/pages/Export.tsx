/**
 * Export — le studio de rapports. On compose un classeur Excel complet : un modèle de départ, des onglets à ajouter ou
 * retirer (données, colonnes, filtres, graphiques), un style, une page de garde ; l'aperçu se met à jour en direct.
 * Tout est généré dans le navigateur à partir des API de l'application (lecture seule) : rien n'est écrit côté serveur.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/context";
import { date as fdate } from "../lib/format";
import { FAMILY_LABEL } from "../lib/families";
import type { FamilyKey } from "../lib/types";
import { PageHero } from "../components/Editorial";
import * as I from "../components/Icon";
import { download, toCsv, type ExportCol } from "../lib/xlsx";
import { buildReport, sheetName, type DataSheet, type Unit } from "../lib/report/engine";
import { fmtValue, renderChart, type ChartSpec } from "../lib/report/charts";
import { THEMES, themeById, css, type Theme } from "../lib/report/themes";
import { DATASETS, DEFAULT_PARAMS, DIMS, datasetById, loadKpis, clearCache, type Loaded, type Params } from "../lib/report/datasets";
import "../styles/studio.css";

// ------------------------------------------------------------------ configuration
type Item = { uid: string; ds: string; on: boolean; name: string; cols: string[]; charts: string[]; params: Params; open?: boolean };
type Config = {
  preset: string; title: string; subtitle: string; author: string; diffusion: string; theme: string; units: Unit;
  cover: boolean; dashboard: boolean; about: boolean; totals: boolean; zebra: boolean; hero: string; items: Item[];
};
const uid = () => Math.random().toString(36).slice(2, 9);
const item = (ds: string, over: Partial<Omit<Item, "params">> & { params?: Partial<Params> } = {}): Item => {
  const d = datasetById(ds);
  return { uid: uid(), ds, on: true, name: d.sheet, cols: [...d.defaults], charts: d.charts.filter((c) => c.on).map((c) => c.id), ...over, params: { ...DEFAULT_PARAMS, ...(over.params ?? {}) } };
};
const PRESETS: { id: string; label: string; desc: string; title: string; make: () => Item[] }[] = [
  { id: "complet", label: "Rapport de gestion complet", desc: "Tout : fonds, encours, répartitions, revenus, risque, distribution, portefeuilles", title: "Rapport de gestion",
    make: () => [item("fonds"), item("evolution"), item("repartition"), item("repartition", { name: "Par gamme", params: { dim: "range" } }), item("revenus"), item("risque"), item("clientele"), item("pays"), item("plateformes"), item("chronologie"), item("portefeuilles")] },
  { id: "comite", label: "Comité encours & collecte", desc: "L'encours, sa variation, la collecte et l'effet marché", title: "Encours et collecte",
    make: () => [item("evolution", { charts: ["aum", "decomp", "fam"] }), item("repartition"), item("fonds", { cols: ["name", "family", "aum", "delta_YTD", "var_YTD", "flows_1M", "flows_YTD", "perf_YTD"] })] },
  { id: "distribution", label: "Distribution", desc: "Clientèles × pays, pays, plateformes, chronologie", title: "Distribution",
    make: () => [item("clientele"), item("pays"), item("plateformes"), item("chronologie")] },
  { id: "revenus", label: "Revenus", desc: "Revenus estimés par axe et par fonds", title: "Revenus de gestion estimés",
    make: () => [item("revenus", { charts: ["trend", "fam", "range"] }), item("fonds", { name: "Revenus par fonds", cols: ["name", "family", "range", "aum", "rate", "revenue", "revenue_12m", "d_revenue_1y", "share"], params: { sort: "revenue" }, charts: ["top"] })] },
  { id: "risque", label: "Risque & portefeuilles", desc: "SRI, volatilité, concentration, lignes en portefeuille", title: "Risque et portefeuilles",
    make: () => [item("risque", { charts: ["sri", "vol"] }), item("portefeuilles", { charts: ["class", "ccy"] })] },
  { id: "libre", label: "Sur mesure", desc: "Partir d'une page blanche et ajouter ses onglets", title: "Export", make: () => [] },
];
const DIFFUSION = ["Usage interne", "Confidentiel", "Diffusion restreinte", "Strictement confidentiel"];
const initial = (): Config => {
  try { const s = localStorage.getItem("export-studio"); if (s) return JSON.parse(s) as Config; } catch { /* stockage indisponible */ }
  const p = PRESETS[0];
  return { preset: p.id, title: p.title, subtitle: "Rothschild & Co Asset Management", author: "", diffusion: DIFFUSION[0], theme: "institutionnel", units: "M€",
    cover: true, dashboard: true, about: true, totals: true, zebra: true, hero: "evo-aum", items: p.make() };
};

// ------------------------------------------------------------------ page
export default function ExportStudio() {
  const { api, asOf, meta } = useApp();
  const [cfg, setCfg] = useState<Config>(initial);
  const [data, setData] = useState<Record<string, Loaded | { error: string }>>({});
  const [kpi, setKpi] = useState<Awaited<ReturnType<typeof loadKpis>> | null>(null);
  const [tab, setTab] = useState("Sommaire");
  const [busy, setBusy] = useState<"" | "xlsx" | "csv">("");
  const [adding, setAdding] = useState(false);
  const theme = themeById(cfg.theme);
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const setItem = (u: string, f: (i: Item) => Item) => setCfg((c) => ({ ...c, items: c.items.map((i) => (i.uid === u ? f(i) : i)) }));
  useEffect(() => { try { localStorage.setItem("export-studio", JSON.stringify(cfg)); } catch { /* idem */ } }, [cfg]);
  useEffect(() => { clearCache(); }, [asOf]);

  // chargement des données (une requête par source, en cache)
  const rmmAll = cfg.items.every((i) => i.params.rmm);
  useEffect(() => { loadKpis(api, rmmAll).then(setKpi); }, [api, rmmAll]);
  const keyOf = (i: Item) => JSON.stringify([i.ds, i.params, i.charts, asOf]);
  const keys = cfg.items.filter((i) => i.on).map((i) => [i.uid, keyOf(i)] as const);
  const loadedKey = useRef<Record<string, string>>({});
  useEffect(() => {
    keys.forEach(([u, k]) => {
      if (loadedKey.current[u] === k) return;
      loadedKey.current[u] = k;
      const it = cfg.items.find((i) => i.uid === u)!;
      datasetById(it.ds).load({ api, p: it.params, charts: it.charts })
        .then((r) => { if (loadedKey.current[u] === k) setData((d) => ({ ...d, [u]: r })); })
        .catch((e) => setData((d) => ({ ...d, [u]: { error: String(e?.message ?? e) } })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(keys), api]);

  // feuilles du classeur
  const sheets: DataSheet[] = useMemo(() => cfg.items.filter((i) => i.on).flatMap((i) => {
    const r = data[i.uid];
    if (!r || "error" in r) return [];
    const d = datasetById(i.ds);
    const byKey = new Map(d.columns.map((c) => [c.key, c]));
    return [{ id: i.uid, name: i.name || d.sheet, title: r.title ?? i.name ?? d.label, description: d.description, rows: r.rows, columns: i.cols.map((k) => byKey.get(k)!).filter(Boolean), charts: r.charts }];
  }), [cfg.items, data]);
  const allCharts = sheets.flatMap((s) => s.charts);
  const hero = allCharts.find((c) => c.id === cfg.hero) ?? allCharts[0] ?? null;
  const nRows = sheets.reduce((s, x) => s + x.rows.length, 0);
  const pending = cfg.items.some((i) => i.on && !data[i.uid]);
  const exclude = !rmmAll;
  const context = [
    ...(asOf ? [{ label: "Date de valeur", value: fdate(asOf) }] : []),
    { label: "Fonds RMM", value: exclude ? "exclus de la distribution" : "inclus" },
  ];
  const kpis = useMemo(() => {
    if (!kpi) return [];
    const out: { label: string; value: string; sub?: string }[] = [];
    if (kpi.ov) {
      out.push({ label: "Encours sous gestion", value: fmtValue(kpi.ov.aum, "eur"), sub: `${kpi.ov.n_funds} fonds · ${kpi.ov.n_parts} parts` });
      const y = kpi.ov.var?.YTD;
      if (y) { out.push({ label: "Variation depuis le 1er janvier", value: fmtValue(y.pct, "pct"), sub: "de l'encours" }); out.push({ label: "Collecte nette YTD", value: fmtValue(y.flows, "eur"), sub: "estimation" }); }
    }
    if (kpi.rev) out.push({ label: "Revenus annualisés", value: fmtValue(kpi.rev.total, "eur"), sub: `taux moyen ${(kpi.rev.rate).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %` });
    if (kpi.dist) {
      const named = kpi.dist.clients.filter((c) => c.kind === "nommé");
      out.push({ label: "Pays de commercialisation", value: String(kpi.dist.countries.length), sub: named.length ? `${named.length} clients nommés` : undefined });
      const pairs = (named.length ? named : kpi.dist.clients).reduce((s, c) => s + c.countries.length, 0);
      out.push({ label: "Couples client-pays", value: pairs.toLocaleString("fr-FR"), sub: "autorisations distinctes" });
    }
    return out;
  }, [kpi]);
  const spec = { title: cfg.title || "Export", subtitle: cfg.subtitle, author: cfg.author, confidentiality: cfg.diffusion, theme, units: cfg.units, cover: cfg.cover, dashboard: cfg.dashboard,
    about: cfg.about, totals: cfg.totals, zebra: cfg.zebra, sheets, kpis, context, mock: !!meta?.is_mock, heroChart: cfg.cover ? hero : null };
  const base = `${(cfg.title || "export").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}-${(asOf ?? new Date().toISOString()).slice(0, 10)}`;

  const goXlsx = async () => {
    setBusy("xlsx");
    try { download(await buildReport(spec), `${base}.xlsx`); } finally { setBusy(""); }
  };
  const goCsv = async () => {
    setBusy("csv");
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      sheets.forEach((s, i) => zip.file(`${String(i + 1).padStart(2, "0")}-${sheetName(s.name).replace(/\s+/g, "-")}.csv`, toCsv(s.rows, s.columns as ExportCol<unknown>[])));
      download(await zip.generateAsync({ type: "blob" }), `${base}-csv.zip`);
    } finally { setBusy(""); }
  };
  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    loadedKey.current = {};
    setCfg((c) => ({ ...c, preset: id, title: p.title, items: p.make() }));
    setTab("Sommaire");
  };
  const tabs = [...(cfg.cover ? ["Sommaire"] : []), ...(cfg.dashboard && allCharts.length ? ["Graphiques"] : []), ...sheets.map((s) => s.id), ...(cfg.about ? ["À propos"] : [])];
  const curTab = tabs.includes(tab) ? tab : tabs[0];

  return (
    <div className="studio">
      <PageHero eyebrow="Export" title="Le studio d'export"
        lede={<>Composez un classeur Excel complet&nbsp;: un modèle de départ, les onglets que vous voulez — données, colonnes, filtres, graphiques —, un style et une page de garde. L'aperçu suit chacun de vos choix&nbsp;; le fichier est généré dans votre navigateur.</>} />
      <div className="studio__grid">
        <div className="studio__cfg">
          {/* 1. modèle */}
          <section className="st-step" aria-labelledby="st-1">
            <h2 id="st-1" className="st-step__h"><span className="num">01</span> Modèle</h2>
            <div className="st-presets">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className={`st-preset${cfg.preset === p.id ? " is-on" : ""}`} onClick={() => applyPreset(p.id)} aria-pressed={cfg.preset === p.id}>
                  <span className="st-preset__t">{p.label}</span><span className="st-preset__d">{p.desc}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 2. onglets */}
          <section className="st-step" aria-labelledby="st-2">
            <h2 id="st-2" className="st-step__h"><span className="num">02</span> Onglets et données <span className="st-step__n small muted">{cfg.items.filter((i) => i.on).length} onglets</span></h2>
            <ol className="st-items">
              {cfg.items.map((it, k) => (
                <ItemRow key={it.uid} it={it} first={k === 0} last={k === cfg.items.length - 1} loaded={data[it.uid]}
                  onChange={(f) => setItem(it.uid, f)}
                  onMove={(d) => setCfg((c) => { const t = [...c.items]; const j = k + d; if (j < 0 || j >= t.length) return c; [t[k], t[j]] = [t[j], t[k]]; return { ...c, items: t }; })}
                  onRemove={() => setCfg((c) => ({ ...c, items: c.items.filter((x) => x.uid !== it.uid) }))}
                  onDuplicate={() => setCfg((c) => { const t = [...c.items]; t.splice(k + 1, 0, { ...it, uid: uid(), name: `${it.name} (2)`, open: true }); return { ...c, items: t }; })} />
              ))}
            </ol>
            <div className="st-add">
              <button type="button" className="btn btn--ghost" onClick={() => setAdding((a) => !a)} aria-expanded={adding}><span aria-hidden="true">＋</span> Ajouter un onglet</button>
              {adding && (
                <div className="st-add__menu" role="menu">
                  {["Gestion", "Distribution", "Portefeuilles"].map((g) => (
                    <div key={g} className="st-add__g">
                      <div className="eyebrow">{g}</div>
                      {DATASETS.filter((d) => d.group === g).map((d) => (
                        <button key={d.id} type="button" role="menuitem" onClick={() => { setCfg((c) => ({ ...c, preset: "libre", items: [...c.items, { ...item(d.id), open: true }] })); setAdding(false); }}>
                          <b>{d.label}</b><span>{d.description}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 3. mise en forme */}
          <section className="st-step" aria-labelledby="st-3">
            <h2 id="st-3" className="st-step__h"><span className="num">03</span> Mise en forme</h2>
            <div className="st-themes" role="radiogroup" aria-label="Style du classeur">
              {THEMES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={cfg.theme === t.id} className={`st-theme${cfg.theme === t.id ? " is-on" : ""}`} onClick={() => set("theme", t.id)}>
                  <ThemeSwatch t={t} />
                  <span className="st-theme__t">{t.label}</span><span className="st-theme__d">{t.note}</span>
                </button>
              ))}
            </div>
            <div className="st-row">
              <span className="st-lab">Montants</span>
              <div className="seg" role="radiogroup" aria-label="Unité des montants">
                {(["€", "k€", "M€", "Md€"] as Unit[]).map((u) => <button key={u} type="button" role="radio" aria-checked={cfg.units === u} className="seg__b" onClick={() => set("units", u)}>{u}</button>)}
              </div>
            </div>
            <div className="st-checks">
              <Check on={cfg.cover} set={(v) => set("cover", v)} label="Sommaire et indicateurs clés" sub="Page de garde, table des matières cliquable" />
              <Check on={cfg.dashboard} set={(v) => set("dashboard", v)} label="Tableau de bord" sub="Tous les graphiques réunis dans un onglet" />
              <Check on={cfg.about} set={(v) => set("about", v)} label="Onglet « À propos »" sub="Source, estimations, définition de chaque colonne" />
              <Check on={cfg.totals} set={(v) => set("totals", v)} label="Lignes de totaux" sub="SOUS.TOTAL : suivent les filtres d'Excel" />
              <Check on={cfg.zebra} set={(v) => set("zebra", v)} label="Lignes alternées" sub="Lecture facilitée des longs tableaux" />
            </div>
          </section>

          {/* 4. page de garde */}
          <section className="st-step" aria-labelledby="st-4">
            <h2 id="st-4" className="st-step__h"><span className="num">04</span> Page de garde</h2>
            <label className="st-field"><span>Titre</span><input value={cfg.title} onChange={(e) => set("title", e.target.value)} /></label>
            <label className="st-field"><span>Sous-titre</span><input value={cfg.subtitle} onChange={(e) => set("subtitle", e.target.value)} /></label>
            <label className="st-field"><span>Préparé par</span><input value={cfg.author} placeholder="Facultatif" onChange={(e) => set("author", e.target.value)} /></label>
            <label className="st-field"><span>Diffusion</span>
              <select value={cfg.diffusion} onChange={(e) => set("diffusion", e.target.value)}>{DIFFUSION.map((d) => <option key={d}>{d}</option>)}</select>
            </label>
            <label className="st-field"><span>Graphique de couverture</span>
              <select value={hero?.id ?? ""} onChange={(e) => set("hero", e.target.value)} disabled={!allCharts.length}>
                {allCharts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
          </section>
        </div>

        {/* aperçu */}
        <div className="studio__prev">
          <div className="st-book" style={themeVars(theme)}>
            <div className="st-book__bar">
              <span className="st-book__dots" aria-hidden="true"><i /><i /><i /></span>
              <span className="st-book__file mono">{base}.xlsx</span>
              <span className="st-book__meta small">{pending ? "Chargement…" : `${tabs.length} onglets · ${allCharts.length} graphiques · ${nRows.toLocaleString("fr-FR")} lignes`}</span>
            </div>
            <div className="st-book__sheet" aria-live="polite">
              {curTab === "Sommaire" ? <CoverPreview spec={spec} sheets={sheets} hero={hero} theme={theme} />
                : curTab === "Graphiques" ? <DashPreview charts={allCharts} theme={theme} />
                : curTab === "À propos" ? <AboutPreview sheets={sheets} spec={spec} />
                : <SheetPreview s={sheets.find((x) => x.id === curTab)!} units={cfg.units} zebra={cfg.zebra} totals={cfg.totals} />}
            </div>
            <div className="st-book__tabs" role="tablist" aria-label="Onglets du classeur">
              {tabs.map((t) => {
                const s = sheets.find((x) => x.id === t);
                return <button key={t} type="button" role="tab" aria-selected={curTab === t} className={curTab === t ? "is-on" : ""} onClick={() => setTab(t)}>{s ? sheetName(s.name) : t}</button>;
              })}
            </div>
          </div>
          <div className="st-go">
            <div className="small muted">{context.map((c) => `${c.label} : ${c.value}`).join(" · ")}{meta?.is_mock ? " · données fictives" : ""}</div>
            <div className="st-go__b">
              <button type="button" className="btn btn--ghost" onClick={goCsv} disabled={!sheets.length || !!busy}>{busy === "csv" ? "Préparation…" : "Pack CSV (.zip)"}</button>
              <button type="button" className="btn btn--gold" onClick={goXlsx} disabled={!sheets.length || !!busy || pending}>
                <I.Download size={16} /> {busy === "xlsx" ? "Génération du classeur…" : "Télécharger le classeur Excel"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ un onglet de la configuration
function ItemRow({ it, first, last, loaded, onChange, onMove, onRemove, onDuplicate }: {
  it: Item; first: boolean; last: boolean; loaded?: Loaded | { error: string };
  onChange: (f: (i: Item) => Item) => void; onMove: (d: number) => void; onRemove: () => void; onDuplicate: () => void;
}) {
  const d = datasetById(it.ds);
  const groups = useMemo(() => { const g = new Map<string, typeof d.columns>(); d.columns.forEach((c) => g.set(c.group ?? "Colonnes", [...(g.get(c.group ?? "Colonnes") ?? []), c])); return [...g.entries()]; }, [d]);
  const opts = loaded && !("error" in loaded) ? loaded.options ?? {} : {};
  const p = it.params;
  const setP = (k: keyof Params, v: Params[keyof Params]) => onChange((i) => ({ ...i, params: { ...i.params, [k]: v } }));
  const toggleIn = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const status = !it.on ? "désactivé" : !loaded ? "chargement…" : "error" in loaded ? "erreur" : `${loaded.rows.length.toLocaleString("fr-FR")} lignes · ${it.cols.length} colonnes · ${loaded.charts.length} graphiques`;
  return (
    <li className={`st-item${it.on ? "" : " is-off"}${it.open ? " is-open" : ""}`}>
      <div className="st-item__h">
        <button type="button" role="switch" aria-checked={it.on} className={`st-sw${it.on ? " is-on" : ""}`} onClick={() => onChange((i) => ({ ...i, on: !i.on }))} aria-label={`Inclure l'onglet ${it.name}`}><i /></button>
        <button type="button" className="st-item__t" onClick={() => onChange((i) => ({ ...i, open: !i.open }))} aria-expanded={!!it.open}>
          <span className="st-item__n">{it.name}</span>
          <span className="st-item__s small">{d.label} · {status}</span>
        </button>
        <span className="st-item__a">
          <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label="Monter"><I.Up size={12} /></button>
          <button type="button" onClick={() => onMove(1)} disabled={last} aria-label="Descendre"><I.Down size={12} /></button>
          <button type="button" onClick={onDuplicate} aria-label="Dupliquer"><I.Copy size={12} /></button>
          <button type="button" onClick={onRemove} aria-label="Retirer"><I.Close size={12} /></button>
        </span>
      </div>
      {it.open && (
        <div className="st-item__b">
          <label className="st-field st-field--s"><span>Nom de l'onglet</span><input value={it.name} maxLength={31} onChange={(e) => onChange((i) => ({ ...i, name: e.target.value }))} /></label>
          {d.params.includes("dim") && (
            <label className="st-field st-field--s"><span>Axe de répartition</span>
              <select value={p.dim} onChange={(e) => { setP("dim", e.target.value); onChange((i) => ({ ...i, name: DIMS.find((x) => x.key === e.target.value)?.label.slice(0, 31) ?? i.name })); }}>{DIMS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
            </label>
          )}
          {d.params.includes("freq") && (
            <div className="st-row"><span className="st-lab">Pas</span><div className="seg seg--s" role="radiogroup" aria-label="Pas de temps">
              {([["M", "Mois"], ["T", "Trimestre"], ["A", "Année"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={p.freq === k} className="seg__b" onClick={() => setP("freq", k)}>{l}</button>)}
            </div></div>
          )}
          {d.params.includes("range") && (
            <div className="st-row"><span className="st-lab">Période</span><div className="seg seg--s" role="radiogroup" aria-label="Période">
              {(["YTD", "1A", "3A", "Tout"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={p.range === k} className="seg__b" onClick={() => setP("range", k)}>{k === "1A" ? "1 an" : k === "3A" ? "3 ans" : k}</button>)}
            </div></div>
          )}
          {d.params.includes("sort") && (
            <div className="st-row"><span className="st-lab">Trier par</span><div className="seg seg--s" role="radiogroup" aria-label="Tri">
              {([["aum", "Encours"], ["flows_YTD", "Collecte"], ["perf_YTD", "Perf."], ["revenue", "Revenus"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={p.sort === k} className="seg__b" onClick={() => setP("sort", k)}>{l}</button>)}
            </div></div>
          )}
          {d.params.includes("top") && (
            <div className="st-row"><span className="st-lab">Graphique : premiers</span><div className="seg seg--s" role="radiogroup" aria-label="Nombre de fonds dans les graphiques">
              {[10, 15, 20].map((n) => <button key={n} type="button" role="radio" aria-checked={p.top === n} className="seg__b" onClick={() => setP("top", n)}>{n}</button>)}
            </div></div>
          )}
          {d.params.includes("rmm") && (
            <div className="st-row"><span className="st-lab">Fonds RMM</span><div className="seg seg--s" role="radiogroup" aria-label="Fonds Rothschild Martin Maurel">
              <button type="button" role="radio" aria-checked={p.rmm} className="seg__b" onClick={() => setP("rmm", true)}>Inclus</button>
              <button type="button" role="radio" aria-checked={!p.rmm} className="seg__b" onClick={() => setP("rmm", false)}>Exclus</button>
            </div></div>
          )}
          {(["family", "domicile", "sfdr", "asset_class"] as const).filter((k) => d.params.includes(k) && (opts[k]?.length ?? 0) > 0).map((k) => (
            <div key={k} className="st-filter">
              <span className="st-lab">{{ family: "Familles", domicile: "Domicile", sfdr: "SFDR", asset_class: "Classe d'actifs" }[k]}{p[k].length ? <button type="button" className="link small" onClick={() => setP(k, [])}> · toutes</button> : <span className="muted small"> · toutes</span>}</span>
              <div className="st-chips">{opts[k]!.map((v) => <button key={v} type="button" className={`chip${p[k].includes(v) ? " chip--on" : ""}`} aria-pressed={p[k].includes(v)} onClick={() => setP(k, toggleIn(p[k], v))}>{k === "family" ? FAMILY_LABEL[v as FamilyKey] ?? v : v}</button>)}</div>
            </div>
          ))}
          {d.charts.length > 0 && (
            <div className="st-filter">
              <span className="st-lab">Graphiques</span>
              <div className="st-chips">{d.charts.map((c) => <button key={c.id} type="button" className={`chip${it.charts.includes(c.id) ? " chip--on" : ""}`} aria-pressed={it.charts.includes(c.id)} onClick={() => onChange((i) => ({ ...i, charts: toggleIn(i.charts, c.id) }))}>{c.label}</button>)}</div>
            </div>
          )}
          <div className="st-cols">
            <div className="st-cols__h"><span className="st-lab">Colonnes · {it.cols.length}/{d.columns.length}</span>
              <span><button type="button" className="link small" onClick={() => onChange((i) => ({ ...i, cols: [...d.defaults] }))}>Par défaut</button> · <button type="button" className="link small" onClick={() => onChange((i) => ({ ...i, cols: d.columns.map((c) => c.key) }))}>Toutes</button></span>
            </div>
            {groups.map(([g, cs]) => (
              <div key={g} className="st-colg">
                <span className="st-colg__h">{g}</span>
                <div className="st-chips">{cs.map((c) => <button key={c.key} type="button" title={c.desc} className={`chip chip--s${it.cols.includes(c.key) ? " chip--on" : ""}`} aria-pressed={it.cols.includes(c.key)}
                  onClick={() => onChange((i) => ({ ...i, cols: i.cols.includes(c.key) ? i.cols.filter((x) => x !== c.key) : [...i.cols, c.key] }))}>{c.label}</button>)}</div>
              </div>
            ))}
          </div>
          {loaded && "error" in loaded && <p className="small st-err">Données indisponibles : {loaded.error}</p>}
        </div>
      )}
    </li>
  );
}

// ------------------------------------------------------------------ petits composants
function Check({ on, set, label, sub }: { on: boolean; set: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <label className={`st-check${on ? " is-on" : ""}`}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span className="st-check__box" aria-hidden="true">{on && <I.Check size={12} />}</span>
      <span><b>{label}</b>{sub && <span className="small muted">{sub}</span>}</span>
    </label>
  );
}
function ThemeSwatch({ t }: { t: Theme }) {
  return (
    <span className="st-sw8" aria-hidden="true" style={{ background: css(t.bg ?? "FFFFFF") }}>
      <i style={{ background: css(t.headFill), borderBottom: `2px solid ${css(t.headRule)}` }} />
      <i style={{ background: css(t.zebra ?? t.bg ?? "FFFFFF") }} /><i style={{ background: css(t.bg ?? "FFFFFF") }} /><i style={{ background: css(t.zebra ?? t.bg ?? "FFFFFF") }} />
      <span className="st-sw8__p">{t.chart.palette.slice(0, 4).map((c) => <b key={c} style={{ background: css(c) }} />)}</span>
    </span>
  );
}
const themeVars = (t: Theme) => ({
  ["--x-bg" as string]: css(t.bg ?? "FFFFFF"), ["--x-ink" as string]: css(t.ink), ["--x-muted" as string]: css(t.muted), ["--x-title" as string]: css(t.title),
  ["--x-brand" as string]: css(t.brand), ["--x-head" as string]: css(t.headFill), ["--x-head-ink" as string]: css(t.headInk), ["--x-rule" as string]: css(t.headRule),
  ["--x-zebra" as string]: css(t.zebra ?? t.bg ?? "FFFFFF"), ["--x-border" as string]: css(t.border), ["--x-kpi" as string]: css(t.kpiFill), ["--x-kpi-ink" as string]: css(t.kpiInk),
});

function useChartImg(c: ChartSpec | null, t: Theme) {
  return useMemo(() => (c ? renderChart(c, t, 1.5) : null), [c, t]);
}
function ChartImg({ c, t }: { c: ChartSpec; t: Theme }) {
  const src = useChartImg(c, t);
  return src ? <img className="st-chart" src={src} alt={`Graphique : ${c.title}`} /> : null;
}

type PrevSpec = { title: string; subtitle?: string; author?: string; confidentiality: string; kpis: { label: string; value: string; sub?: string }[]; context: { label: string; value: string }[]; dashboard: boolean; about: boolean; mock: boolean };
function CoverPreview({ spec, sheets, hero, theme }: { spec: PrevSpec; sheets: DataSheet[]; hero: ChartSpec | null; theme: Theme }) {
  return (
    <div className="xp xp--cover">
      <div className="xp__brand">ROTHSCHILD &amp; CO · ASSET MANAGEMENT</div>
      <div className="xp__title">{spec.title}</div>
      <div className="xp__sub">{spec.subtitle}</div>
      <div className="xp__meta">{[...spec.context.map((c) => `${c.label} : ${c.value}`), spec.author ? `Préparé par ${spec.author}` : null, `Édité le ${new Date().toLocaleDateString("fr-FR")}`].filter(Boolean).join("  ·  ")}</div>
      <div className="xp__rule" />
      <div className="xp__kpis">{spec.kpis.slice(0, 6).map((k) => <div key={k.label} className="xp__kpi"><span>{k.label}</span><b>{k.value}</b>{k.sub && <i>{k.sub}</i>}</div>)}</div>
      <div className="xp__toc-h">CONTENU DU CLASSEUR</div>
      <ol className="xp__toc">
        {spec.dashboard && sheets.some((s) => s.charts.length) && <li><b>Graphiques</b><span>Tableau de bord</span><em>{sheets.reduce((a, s) => a + s.charts.length, 0)} graphiques</em></li>}
        {sheets.map((s) => <li key={s.id}><b>{sheetName(s.name)}</b><span>{s.description}</span><em>{s.rows.length.toLocaleString("fr-FR")} lignes</em></li>)}
        {spec.about && <li><b>À propos</b><span>Source, contexte et définitions</span><em /></li>}
      </ol>
      {hero && <ChartImg c={hero} t={theme} />}
      <div className="xp__note">{spec.mock ? "Source : données fictives au schéma exact du Lakehouse — aucune donnée réelle." : "Source : Microsoft Fabric, Lakehouse (lecture seule)."} {spec.confidentiality}.</div>
    </div>
  );
}
function DashPreview({ charts, theme }: { charts: ChartSpec[]; theme: Theme }) {
  return (
    <div className="xp">
      <div className="xp__brand">ROTHSCHILD &amp; CO · ASSET MANAGEMENT</div>
      <div className="xp__title xp__title--s">Tableau de bord</div>
      <div className="xp__rule" />
      <div className="xp__dash">{charts.map((c) => <ChartImg key={c.id} c={c} t={theme} />)}</div>
    </div>
  );
}
function SheetPreview({ s, units, zebra, totals }: { s: DataSheet; units: Unit; zebra: boolean; totals: boolean }) {
  if (!s) return null;
  const cols = s.columns as ExportCol<unknown>[];
  const rows = s.rows.slice(0, 16);
  const NUMK = ["int", "num", "eur", "pct"];
  const show = (c: ExportCol<unknown>, r: unknown) => {
    const v = c.get ? c.get(r) : (r as Record<string, unknown>)[c.key];
    if (v == null || v === "") return "";
    if (c.kind === "eur" && typeof v === "number") { const d = { "€": 1, "k€": 1e3, "M€": 1e6, "Md€": 1e9 }[units]; return `${(v / d).toLocaleString("fr-FR", { maximumFractionDigits: units === "€" || units === "k€" ? 0 : units === "M€" ? 1 : 2, minimumFractionDigits: units === "M€" ? 1 : units === "Md€" ? 2 : 0 })} ${units}`; }
    if (c.kind === "pct" && typeof v === "number") return `${(v * 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
    if (c.kind === "date" && typeof v === "string") return fdate(v);
    if (c.kind === "bool") return v ? "Oui" : "Non";
    if (typeof v === "number") return v.toLocaleString("fr-FR", { maximumFractionDigits: c.digits ?? 2 });
    return Array.isArray(v) ? v.join(", ") : String(v);
  };
  return (
    <div className="xp">
      <div className="xp__brand">ROTHSCHILD &amp; CO · ASSET MANAGEMENT</div>
      <div className="xp__title xp__title--s">{s.title}</div>
      <div className="xp__meta">{s.description} · {s.rows.length.toLocaleString("fr-FR")} lignes</div>
      <div className="xp__rule" />
      <div className="xp__table">
        <table className={zebra ? "is-zebra" : ""}>
          <thead><tr>{cols.map((c) => <th key={c.key} className={NUMK.includes(c.kind ?? "") ? "n" : ""}>{c.label}</th>)}</tr></thead>
          <tbody>{rows.map((r, k) => <tr key={k}>{cols.map((c) => <td key={c.key} className={NUMK.includes(c.kind ?? "") ? "n" : c.kind === "code" ? "code" : ""}>{show(c, r)}</td>)}</tr>)}</tbody>
          {totals && cols.some((c) => c.sum) && <tfoot><tr>{cols.map((c, i) => <td key={c.key} className={i ? "n" : ""}>{i === 0 ? "Total (lignes filtrées)" : c.sum ? "Σ" : ""}</td>)}</tr></tfoot>}
        </table>
        {s.rows.length > rows.length && <div className="xp__more">… et {(s.rows.length - rows.length).toLocaleString("fr-FR")} autres lignes dans le fichier</div>}
      </div>
    </div>
  );
}
function AboutPreview({ sheets, spec }: { sheets: DataSheet[]; spec: PrevSpec }) {
  return (
    <div className="xp">
      <div className="xp__brand">ROTHSCHILD &amp; CO · ASSET MANAGEMENT</div>
      <div className="xp__title xp__title--s">À propos de ce classeur</div>
      <div className="xp__rule" />
      <dl className="xp__kv">
        {spec.context.map((c) => <div key={c.label}><dt>{c.label}</dt><dd>{c.value}</dd></div>)}
        <div><dt>Source</dt><dd>{spec.mock ? "Données fictives au schéma exact du Lakehouse" : "Microsoft Fabric — Lakehouse, lecture seule"}</dd></div>
        <div><dt>Diffusion</dt><dd>{spec.confidentiality}</dd></div>
      </dl>
      <div className="xp__table"><table><thead><tr><th>Onglet</th><th>Colonne</th><th>Définition</th></tr></thead>
        <tbody>{sheets.flatMap((s) => (s.columns as ExportCol<unknown>[]).map((c, i) => <tr key={s.id + c.key}><td>{i ? "" : sheetName(s.name)}</td><td>{c.label}</td><td>{c.desc ?? ""}</td></tr>)).slice(0, 40)}</tbody></table></div>
    </div>
  );
}
