/**
 * Graphiques du classeur, dessinés en Canvas 2D (2× pour la netteté) puis intégrés au fichier Excel en PNG.
 * Formes de la charte : barres et colonnes à l'équerre, pas de disques ni de camemberts ; légende toujours écrite
 * (l'identité n'est jamais portée par la seule couleur) ; une seule échelle par graphique.
 */
import type { Theme } from "./themes";

export type ChartKind = "barh" | "col" | "line" | "stack" | "flows";
export type ChartSpec = {
  id: string; kind: ChartKind; title: string; unit: "eur" | "pct" | "int" | "num";
  labels: string[];
  series: { name: string; values: (number | null)[] }[];
  note?: string;
};

export const CHART_W = 640, CHART_H = 340;   // taille d'affichage (px) ; le PNG est dessiné à 2×

export function fmtValue(v: number | null | undefined, unit: ChartSpec["unit"], short = true): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "pct") return `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
  if (unit === "int") return Math.round(v).toLocaleString("fr-FR");
  if (unit === "num") return v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const a = Math.abs(v);
  if (!short) return `${Math.round(v).toLocaleString("fr-FR")} €`;
  if (a >= 1e9) return `${(v / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Md€`;
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M€`;
  if (a >= 1e3) return `${(v / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} k€`;
  return `${Math.round(v)} €`;
}

const hex = (h: string, a = 1) => {
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const ellipsis = (g: CanvasRenderingContext2D, s: string, w: number) => {
  if (g.measureText(s).width <= w) return s;
  let t = s;
  while (t.length > 1 && g.measureText(t + "…").width > w) t = t.slice(0, -1);
  return t + "…";
};
function niceTicks(min: number, max: number, n = 4): number[] {
  if (min === max) { max = min + 1; }
  const span = max - min, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n + 1) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** Dessine le graphique et renvoie une image PNG (data URL). */
export function renderChart(spec: ChartSpec, theme: Theme, scale = 2): string {
  const W = CHART_W, H = CHART_H;
  const c = document.createElement("canvas");
  c.width = W * scale; c.height = H * scale;
  const g = c.getContext("2d")!;
  g.scale(scale, scale);
  const T = theme.chart, sans = `"Inter Tight", ${theme.sans}, sans-serif`, serif = `"Instrument Serif", ${theme.serif}, serif`;
  g.fillStyle = hex(T.bg); g.fillRect(0, 0, W, H);
  // cadre : coin d'or en haut à gauche
  g.fillStyle = hex(theme.brand); g.fillRect(0, 0, 44, 2);
  g.fillStyle = hex(T.ink); g.font = `400 21px ${serif}`; g.textBaseline = "alphabetic";
  g.fillText(ellipsis(g, spec.title, W - 36), 18, 34);
  if (spec.note) { g.fillStyle = hex(T.muted); g.font = `400 11px ${sans}`; g.fillText(ellipsis(g, spec.note, W - 36), 18, 52); }
  const top = spec.note ? 70 : 58;
  const pal = T.palette;
  const multi = spec.series.length > 1;
  // légende
  let legendH = 0;
  if (multi && spec.kind !== "stack") {
    const names = spec.series.map((s) => s.name);
    g.font = `500 11px ${sans}`;
    let x = 18, y = H - 14;
    names.forEach((nm, i) => {
      const w = g.measureText(nm).width + 26;
      if (x + w > W - 12) { x = 18; y -= 18; }
      g.fillStyle = hex(pal[i % pal.length]); g.fillRect(x, y - 9, 10, 10);
      g.fillStyle = hex(T.muted); g.fillText(nm, x + 15, y);
      x += w + 8;
    });
    legendH = H - y + 18;
  }
  const bottom = H - 18 - legendH;

  if (spec.kind === "barh") {
    const vals = spec.series[0].values.map((v) => v ?? 0);
    const n = vals.length, max = Math.max(...vals.map(Math.abs), 1e-9), hasNeg = vals.some((v) => v < 0);
    g.font = `500 12px ${sans}`;
    const labW = Math.min(210, Math.max(...spec.labels.map((l) => g.measureText(l).width)) + 10);
    const x0 = 18 + labW, x1 = W - 92;
    const zero = hasNeg ? x0 + (x1 - x0) / 2 : x0, half = hasNeg ? (x1 - x0) / 2 : x1 - x0;
    const row = (bottom - top) / n, bh = Math.min(18, row * 0.62);
    vals.forEach((v, i) => {
      const y = top + i * row + (row - bh) / 2;
      g.fillStyle = hex(T.ink); g.textAlign = "right"; g.textBaseline = "middle";
      g.fillText(ellipsis(g, spec.labels[i], labW - 10), x0 - 10, y + bh / 2);
      const w = (Math.abs(v) / max) * half;
      g.fillStyle = hex(v < 0 ? T.neg : pal[0], 1);
      g.fillRect(v < 0 ? zero - w : zero, y, Math.max(1, w), bh);
      if (i === 0 && !hasNeg) { g.fillStyle = hex(theme.brand); g.fillRect(zero, y, 2, bh); }
      g.fillStyle = hex(T.muted); g.textAlign = "left";
      g.fillText(fmtValue(v, spec.unit), Math.max(zero + (v < 0 ? 0 : w), zero) + 8, y + bh / 2);
    });
    if (hasNeg) { g.fillStyle = hex(T.grid); g.fillRect(zero, top - 4, 1, bottom - top + 8); }
  } else if (spec.kind === "stack") {
    const keep = spec.series[0].values.map((v, i) => [v ?? 0, i] as const).filter(([v]) => v > 0).map(([, i]) => i);
    spec = { ...spec, labels: keep.map((i) => spec.labels[i]), series: [{ ...spec.series[0], values: keep.map((i) => spec.series[0].values[i]) }] };
    const vals = spec.series[0].values.map((v) => Math.max(0, v ?? 0));
    const tot = vals.reduce((a, b) => a + b, 0) || 1;
    const y = top + 30, h = 46, x0 = 18, x1 = W - 18;
    let x = x0;
    vals.forEach((v, i) => {
      const w = ((x1 - x0) * v) / tot;
      g.fillStyle = hex(pal[i % pal.length]); g.fillRect(x, y, Math.max(0, w - 2), h);
      if (w > 64) {
        g.fillStyle = hex(i === 0 || pal[i % pal.length] === "1C355E" || pal[i % pal.length] === "8A1E41" || pal[i % pal.length] === "222222" || pal[i % pal.length] === "1F2937" ? "FFFFFF" : "111111");
        g.font = `600 13px ${sans}`; g.textBaseline = "middle"; g.textAlign = "left";
        g.fillText(fmtValue(v / tot, "pct"), x + 10, y + h / 2);
      }
      x += w;
    });
    g.textAlign = "left"; g.fillStyle = hex(T.muted); g.font = `500 12px ${sans}`; g.textBaseline = "alphabetic";
    spec.labels.forEach((l, i) => {
      const yy = y + h + 30 + i * 20;
      if (yy > bottom) return;
      g.fillStyle = hex(pal[i % pal.length]); g.fillRect(18, yy - 9, 10, 10);
      g.fillStyle = hex(T.ink); g.fillText(`${l}`, 34, yy);
      g.fillStyle = hex(T.muted); g.textAlign = "right"; g.fillText(`${fmtValue(vals[i], spec.unit)} · ${fmtValue(vals[i] / tot, "pct")}`, W - 18, yy); g.textAlign = "left";
    });
  } else {
    // axes communs (col, flows, line)
    const all = spec.series.flatMap((s) => s.values.filter((v): v is number => v != null));
    let mn = Math.min(0, ...all), mx = Math.max(0, ...all);
    if (spec.kind === "line") { mn = Math.min(...all); mx = Math.max(...all); const pad = (mx - mn) * 0.08 || Math.abs(mx) * 0.05 || 1; mn -= pad; mx += pad; }
    const ticks = niceTicks(mn, mx, 4);
    mn = Math.min(mn, ticks[0]); mx = Math.max(mx, ticks[ticks.length - 1]);
    g.font = `500 11px ${sans}`;
    const axW = Math.max(...ticks.map((t) => g.measureText(fmtValue(t, spec.unit)).width)) + 12;
    const x0 = 18 + axW, x1 = W - 18, y0 = bottom - 22, y1 = top + 6;
    const Y = (v: number) => y0 - ((v - mn) / (mx - mn || 1)) * (y0 - y1);
    ticks.forEach((t) => {
      g.fillStyle = hex(T.grid); g.fillRect(x0, Math.round(Y(t)), x1 - x0, t === 0 ? 1.4 : 1);
      g.fillStyle = hex(T.muted); g.textAlign = "right"; g.textBaseline = "middle"; g.fillText(fmtValue(t, spec.unit), x0 - 8, Y(t));
    });
    const n = spec.labels.length, step = (x1 - x0) / Math.max(1, n);
    const every = Math.ceil(n / 12);
    g.textAlign = "center"; g.textBaseline = "top"; g.fillStyle = hex(T.muted);
    spec.labels.forEach((l, i) => { if (i % every === 0 || i === n - 1) g.fillText(ellipsis(g, l, step * every - 4), x0 + step * (i + 0.5), y0 + 7); });
    if (spec.kind === "line") {
      spec.series.forEach((s, k) => {
        g.strokeStyle = hex(pal[k % pal.length]); g.lineWidth = k === 0 ? 2.4 : 1.8; g.lineJoin = "round";
        g.beginPath();
        let started = false;
        s.values.forEach((v, i) => { if (v == null) return; const x = x0 + step * (i + 0.5), y = Y(v); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); });
        g.stroke();
        if (k === 0 && !multi) {   // aire sous la courbe principale
          g.lineTo(x0 + step * (n - 0.5), y0); g.lineTo(x0 + step * 0.5, y0); g.closePath();
          const grd = g.createLinearGradient(0, y1, 0, y0); grd.addColorStop(0, hex(pal[0], 0.22)); grd.addColorStop(1, hex(pal[0], 0));
          g.fillStyle = grd; g.fill();
        }
        const lastI = s.values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop();
        if (lastI != null) { g.fillStyle = hex(pal[k % pal.length]); g.fillRect(x0 + step * (lastI + 0.5) - 3.5, Y(s.values[lastI]!) - 3.5, 7, 7); }
      });
    } else {
      const m = spec.series.length, bw = Math.min(28, (step * 0.72) / m);
      spec.series.forEach((s, k) => s.values.forEach((v, i) => {
        if (v == null) return;
        const x = x0 + step * (i + 0.5) - (bw * m) / 2 + k * bw;
        const yv = Y(v), yz = Y(0);
        g.fillStyle = hex(spec.kind === "flows" && !multi ? (v < 0 ? T.neg : T.pos) : pal[k % pal.length]);
        g.fillRect(x, Math.min(yv, yz), Math.max(1, bw - 2), Math.max(1, Math.abs(yz - yv)));
      }));
    }
  }
  return c.toDataURL("image/png");
}
