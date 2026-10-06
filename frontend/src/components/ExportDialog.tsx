/**
 * Exporter : fenêtre de choix des colonnes, puis classeur Excel institutionnel (ou CSV), généré dans le navigateur.
 *
 *   à gauche   toutes les colonnes disponibles, par groupe, filtrables, avec leur définition ;
 *   à droite   les colonnes du fichier, dans l'ordre du fichier (glisser-déposer, flèches, retrait) ;
 *   en bas     un aperçu des premières lignes, les options (totaux, onglet « À propos ») et le téléchargement.
 * Le choix est mémorisé par tableau (stockage local du navigateur, aucune donnée : seulement des noms de colonnes).
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/context";
import { norm } from "../lib/search";
import { buildWorkbook, cellValue, download, toCsv, type ExportCol } from "../lib/xlsx";
import * as I from "./Icon";
import "../styles/export.css";

type Props<R> = {
  id: string;                         // identifiant du tableau (mémorisation du choix)
  title: string; subtitle?: string; filename: string;
  rows: R[]; columns: ExportCol<R>[];
  shown?: string[];                   // colonnes affichées à l'écran (préréglage par défaut)
  essential?: string[];
  context?: { label: string; value: string }[];
  label?: string;
};

const KIND_LABEL: Record<string, string> = { text: "Texte", code: "Code", int: "Entier", num: "Nombre", eur: "€", pct: "%", date: "Date", bool: "Oui/Non" };
const store = {
  get: (k: string): string[] | null => { try { const v = localStorage.getItem(`export:${k}`); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k: string, v: string[]) => { try { localStorage.setItem(`export:${k}`, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

export function ExportButton<R>(p: Props<R>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn--ghost" onClick={() => setOpen(true)} aria-haspopup="dialog"><I.Download size={16} /> {p.label ?? "Exporter"}</button>
      {open && <ExportDialog {...p} onClose={() => setOpen(false)} />}
    </>
  );
}

function ExportDialog<R>({ id, title, subtitle, filename, rows, columns, shown, essential, context, onClose }: Props<R> & { onClose: () => void }) {
  const { meta } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const searchId = useId();
  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const valid = (ks: string[] | null | undefined) => (ks ?? []).filter((k) => byKey.has(k));
  const presets = {
    shown: valid(shown).length ? valid(shown) : columns.slice(0, 8).map((c) => c.key),
    essential: valid(essential).length ? valid(essential) : valid(shown).slice(0, 5),
    all: columns.map((c) => c.key),
  };
  const [sel, setSel] = useState<string[]>(() => valid(store.get(id)).length ? valid(store.get(id)) : presets.shown);
  const [q, setQ] = useState("");
  const [totals, setTotals] = useState(true);
  const [about, setAbout] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal?.();
    document.documentElement.classList.add("has-modal");
    return () => document.documentElement.classList.remove("has-modal");
  }, []);
  useEffect(() => { store.set(id, sel); }, [id, sel]);

  const groups = useMemo(() => {
    const qq = norm(q);
    const g = new Map<string, ExportCol<R>[]>();
    columns.filter((c) => !qq || norm(c.label).includes(qq) || norm(c.desc ?? "").includes(qq))
      .forEach((c) => { const k = c.group ?? "Colonnes"; g.set(k, [...(g.get(k) ?? []), c]); });
    return [...g.entries()];
  }, [columns, q]);
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const move = (i: number, d: number) => setSel((s) => { const t = [...s]; const j = i + d; if (j < 0 || j >= t.length) return s; [t[i], t[j]] = [t[j], t[i]]; return t; });
  const cols = sel.map((k) => byKey.get(k)!).filter(Boolean);
  const isSet = (ks: string[]) => ks.length === sel.length && ks.every((k, i) => sel[i] === k);
  const ctx = [...(context ?? [])];

  const go = async (fmt: "xlsx" | "csv") => {
    if (!cols.length) return;
    setBusy(true);
    try {
      const base = filename.replace(/\.(csv|xlsx)$/i, "");
      if (fmt === "csv") download(toCsv(rows, cols), `${base}.csv`);
      else download(await buildWorkbook({ title, subtitle, filename, rows, columns: cols, context: ctx, mock: !!meta?.is_mock, totals, about }), `${base}.xlsx`);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <dialog ref={ref} className="xd" aria-labelledby={`${searchId}-t`} onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="xd__in">
        <header className="xd__head">
          <div>
            <div className="eyebrow">Exporter · classeur Excel</div>
            <h2 id={`${searchId}-t`} className="xd__title">{title}</h2>
            <p className="small muted">{rows.length.toLocaleString("fr-FR")} lignes{ctx.length ? " · " + ctx.map((c) => `${c.label} : ${c.value}`).join(" · ") : ""}</p>
          </div>
          <button type="button" className="xd__close" onClick={onClose} aria-label="Fermer"><I.Close size={18} /></button>
        </header>

        <div className="xd__presets" role="group" aria-label="Préréglages de colonnes">
          <span className="small muted">Partir de</span>
          <button type="button" className={`chip${isSet(presets.shown) ? " chip--on" : ""}`} onClick={() => setSel(presets.shown)}>Colonnes affichées · {presets.shown.length}</button>
          <button type="button" className={`chip${isSet(presets.essential) ? " chip--on" : ""}`} onClick={() => setSel(presets.essential)}>Essentiel · {presets.essential.length}</button>
          <button type="button" className={`chip${isSet(presets.all) ? " chip--on" : ""}`} onClick={() => setSel(presets.all)}>Toutes · {presets.all.length}</button>
        </div>

        <div className="xd__body">
          <section className="xd__pane" aria-label="Colonnes disponibles">
            <div className="xd__ph"><span className="eyebrow">Colonnes disponibles</span><span className="small muted num">{columns.length}</span></div>
            <label className="xd__search" htmlFor={searchId}>
              <I.Search size={15} />
              <input id={searchId} type="search" placeholder="Filtrer les colonnes (ex. frais, ISIN, encours)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </label>
            <div className="xd__avail">
              {groups.map(([g, cs]) => (
                <fieldset key={g} className="xd__grp">
                  <legend className="xd__grp-h">
                    <span>{g}</span>
                    <button type="button" className="xd__all" onClick={() => {
                      const ks = cs.map((c) => c.key);
                      const allOn = ks.every((k) => sel.includes(k));
                      setSel((s) => (allOn ? s.filter((k) => !ks.includes(k)) : [...s, ...ks.filter((k) => !s.includes(k))]));
                    }}>{cs.every((c) => sel.includes(c.key)) ? "Tout retirer" : "Tout ajouter"}</button>
                  </legend>
                  {cs.map((c) => {
                    const on = sel.includes(c.key);
                    return (
                      <label key={c.key} className={`xd__opt${on ? " is-on" : ""}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(c.key)} />
                        <span className="xd__box" aria-hidden="true">{on && <I.Check size={12} />}</span>
                        <span className="xd__ol">{c.label}{c.desc && <span className="xd__od">{c.desc}</span>}</span>
                        <span className="xd__kind">{KIND_LABEL[c.kind ?? "text"]}</span>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
              {!groups.length && <p className="small muted xd__none">Aucune colonne ne contient « {q} ». <button type="button" className="link" onClick={() => setQ("")}>Effacer le filtre</button></p>}
            </div>
          </section>

          <section className="xd__pane xd__pane--sel" aria-label="Colonnes du fichier, dans l'ordre">
            <div className="xd__ph"><span className="eyebrow">Votre fichier</span><span className="small muted num">{cols.length} colonne{cols.length > 1 ? "s" : ""}</span></div>
            <p className="small muted xd__hint">Glissez pour réordonner — la première colonne reste figée dans Excel.</p>
            <ol className="xd__sel">
              {cols.map((c, i) => (
                <li key={c.key} draggable className={`xd__it${drag === i ? " is-drag" : ""}`}
                  onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { e.preventDefault(); if (drag === null || drag === i) return; setSel((s) => { const t = [...s]; const [x] = t.splice(drag, 1); t.splice(i, 0, x); return t; }); setDrag(i); }}
                  onDragEnd={() => setDrag(null)}>
                  <span className="xd__grip" aria-hidden="true" />
                  <span className="xd__n num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="xd__il">{c.label}</span>
                  <span className="xd__kind">{KIND_LABEL[c.kind ?? "text"]}</span>
                  <span className="xd__act">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter ${c.label}`}><I.Up size={12} /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === cols.length - 1} aria-label={`Descendre ${c.label}`}><I.Down size={12} /></button>
                    <button type="button" onClick={() => toggle(c.key)} aria-label={`Retirer ${c.label}`}><I.Close size={12} /></button>
                  </span>
                </li>
              ))}
              {!cols.length && <li className="xd__empty small muted">Choisissez au moins une colonne à gauche.</li>}
            </ol>
          </section>
        </div>

        <section className="xd__prev" aria-label="Aperçu des premières lignes">
          <div className="xd__ph"><span className="eyebrow">Aperçu</span><span className="small muted">3 premières lignes, telles qu'elles seront écrites</span></div>
          <div className="xd__sheet">
            <table>
              <thead><tr>{cols.map((c) => <th key={c.key} className={["int", "num", "eur", "pct"].includes(c.kind ?? "") ? "n" : ""}>{c.label}</th>)}</tr></thead>
              <tbody>{rows.slice(0, 3).map((r, k) => (
                <tr key={k}>{cols.map((c) => <td key={c.key} className={["int", "num", "eur", "pct"].includes(c.kind ?? "") ? "n" : ""}>{preview(c, r)}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <footer className="xd__foot">
          <div className="xd__opts">
            <label><input type="checkbox" checked={totals} onChange={(e) => setTotals(e.target.checked)} /> Ligne de totaux (suit les filtres)</label>
            <label><input type="checkbox" checked={about} onChange={(e) => setAbout(e.target.checked)} /> Onglet « À propos » : définitions et source</label>
          </div>
          <div className="xd__go">
            <button type="button" className="btn btn--ghost" onClick={() => go("csv")} disabled={!cols.length || busy}>CSV</button>
            <button type="button" className="btn btn--gold" onClick={() => go("xlsx")} disabled={!cols.length || busy}>
              <I.Download size={16} /> {busy ? "Préparation…" : "Télécharger le classeur Excel"}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

function preview<R>(c: ExportCol<R>, r: R): string {
  const v = cellValue(c, r);
  if (v == null) return "";
  if (v instanceof Date) return v.toLocaleDateString("fr-FR", { timeZone: "UTC" });
  if (typeof v === "number") {
    if (c.kind === "pct") return (v * 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
    if (c.kind === "eur") return Math.round(v).toLocaleString("fr-FR") + " €";
    if (c.kind === "int") return Math.round(v).toLocaleString("fr-FR");
    return v.toLocaleString("fr-FR", { maximumFractionDigits: c.digits ?? 2 });
  }
  return v;
}
