/**
 * Sankey 2D de la distribution, en SVG : clientèles (par encours décroissant) → pays d'enregistrement → familles de gestion.
 * Épaisseur des flux : nombre d'enregistrements actifs (une part autorisée dans un pays), additive d'une colonne à l'autre.
 * Les rubans sont ordonnés à chaque nœud selon la position de l'autre extrémité, pour limiter les croisements.
 * Survol ou focus clavier d'un nœud ou d'un ruban : son parcours est isolé, le reste s'efface.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { eur, plural } from "../lib/format";
import { FAMILY_LABEL, FAMILY_ORDER, famVar } from "../lib/families";
import type { FamilyKey } from "../lib/types";

export type SkNode = {
  id: string; label: string; col: number; value: number; n_funds: number; n_shares: number;
  family?: string; iso?: string; other?: boolean; kind?: string; aum?: number; n_clients?: number;
};
export type SkLink = { source: number; target: number; value: number; family: string; n_funds: number; n_shares: number };
export type SkData = { nodes: SkNode[]; links: SkLink[]; rest?: { n_clients: number; value: number; aum: number } };

const W = 1200;
const NODE_W = 12;
const GAP = 12;
const PAD_T = 46;
const X = [300, 640, 940];          // abscisse gauche de chaque colonne de nœuds
const HEADS = ["Clientèles · par encours", "Pays d'enregistrement", "Familles de gestion"];

type LNode = SkNode & { i: number; x: number; y: number; h: number };
type LLink = SkLink & { i: number; w: number; sy: number; ty: number };
type Hot = { node?: number; link?: number } | null;

function layout(d: SkData, height: number) {
  const cols = [0, 1, 2].map((c) => d.nodes.map((n, i) => ({ ...n, i })).filter((n) => n.col === c));
  if (cols[2].length) cols[2].sort((a, b) => FAMILY_ORDER.indexOf(a.family as FamilyKey) - FAMILY_ORDER.indexOf(b.family as FamilyKey));
  const inner = height - PAD_T - 8;
  const k = Math.min(...cols.filter((c) => c.length).map((c) => (inner - GAP * (c.length - 1)) / Math.max(1, c.reduce((s, n) => s + n.value, 0))));
  const nodes: LNode[] = new Array(d.nodes.length);
  cols.forEach((c, ci) => {
    const used = c.reduce((s, n) => s + n.value * k, 0) + GAP * (c.length - 1);
    let y = PAD_T + (inner - used) / 2;
    for (const n of c) { nodes[n.i] = { ...n, x: X[ci], y, h: Math.max(1.5, n.value * k) }; y += n.value * k + GAP; }
  });
  const links: LLink[] = d.links.map((l, i) => ({ ...l, i, w: Math.max(1, l.value * k), sy: 0, ty: 0 }));
  const famRank = (f: string) => (f === "all" ? -1 : FAMILY_ORDER.indexOf(f as FamilyKey) + (f === "nc" ? 9 : 0));
  // Départs : triés selon la hauteur de la cible ; arrivées : selon la hauteur de la source
  const out = new Map<number, LLink[]>(), inn = new Map<number, LLink[]>();
  for (const l of links) {
    (out.get(l.source) ?? out.set(l.source, []).get(l.source)!).push(l);
    (inn.get(l.target) ?? inn.set(l.target, []).get(l.target)!).push(l);
  }
  out.forEach((ls, s) => {
    ls.sort((a, b) => nodes[a.target].y - nodes[b.target].y || famRank(a.family) - famRank(b.family));
    let y = nodes[s].y;
    for (const l of ls) { l.sy = y; y += l.w; }
  });
  inn.forEach((ls, t) => {
    ls.sort((a, b) => nodes[a.source].y - nodes[b.source].y || famRank(a.family) - famRank(b.family));
    let y = nodes[t].y;
    for (const l of ls) { l.ty = y; y += l.w; }
  });
  return { nodes, links };
}

function ribbon(l: LLink, nodes: LNode[]) {
  const x0 = nodes[l.source].x + NODE_W, x1 = nodes[l.target].x, xm = (x0 + x1) / 2;
  const a = l.sy, b = l.ty;
  return `M${x0},${a}C${xm},${a} ${xm},${b} ${x1},${b}L${x1},${b + l.w}C${xm},${b + l.w} ${xm},${a + l.w} ${x0},${a + l.w}Z`;
}

const clientColor = (n: SkNode) => (n.other ? "var(--ink-3)" : n.kind === "nommé" ? "var(--gold)" : "var(--brand-stone)");
const nodeColor = (n: SkNode) => (n.col === 0 ? clientColor(n) : n.col === 1 ? "var(--ink-2)" : famVar(n.family));

export function Sankey2D({ data, onOpen }: { data: SkData; onOpen?: (n: SkNode) => void }) {
  const nClients = data.nodes.filter((n) => n.col === 0).length;
  const height = Math.max(560, Math.min(860, PAD_T + nClients * 62));
  const { nodes, links } = useMemo(() => layout(data, height), [data, height]);
  const [hot, setHot] = useState<Hot>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(false);
  const rank = useMemo(() => new Map(nodes.filter((n) => n.col === 0).sort((a, b) => a.y - b.y).map((n, k) => [n.i, k + 1])), [nodes]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setLit(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setLit(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Ce qui reste allumé : le nœud et ses rubans directs (pour un pays, en amont et en aval) ; ou le ruban et ses deux nœuds
  const on = useMemo(() => {
    if (!hot) return null;
    const ls = new Set<number>(), ns = new Set<number>();
    if (hot.link != null) { const l = links[hot.link]; ls.add(l.i); ns.add(l.source); ns.add(l.target); }
    if (hot.node != null) {
      ns.add(hot.node);
      for (const l of links) if (l.source === hot.node || l.target === hot.node) { ls.add(l.i); ns.add(l.source); ns.add(l.target); }
    }
    return { ls, ns };
  }, [hot, links]);

  const move = (e: React.MouseEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const enter = (h: Hot) => (e: React.MouseEvent) => { setHot(h); move(e); };
  const leave = () => { setHot(null); setTip(null); };
  const focusNode = (n: LNode) => {
    setHot({ node: n.i });
    const r = wrap.current?.getBoundingClientRect(), svg = wrap.current?.querySelector("svg")?.getBoundingClientRect();
    if (r && svg) setTip({ x: svg.left - r.left + ((n.x + NODE_W / 2) / W) * svg.width, y: svg.top - r.top + ((n.y) / height) * svg.height });
  };

  return (
    <div ref={wrap} className={`sk2${lit ? " is-lit" : ""}${on ? " is-hot" : ""}`} onMouseLeave={leave}>
      <svg viewBox={`0 0 ${W} ${height}`} role="group" aria-label="Diagramme de Sankey : clientèles, pays d'enregistrement, familles de gestion">
        {HEADS.map((h, i) => (
          <text key={h} className="sk2__head" x={i === 0 ? X[0] + NODE_W : X[i]} y={18} textAnchor={i === 0 ? "end" : "start"}>{h}</text>
        ))}
        <g className="sk2__links">
          {links.map((l) => (
            <path key={l.i} d={ribbon(l, nodes)} className={`sk2__link${on && !on.ls.has(l.i) ? " is-dim" : ""}${on?.ls.has(l.i) ? " is-on" : ""}`}
              style={{ fill: l.family === "all" ? clientColor(nodes[l.source]) : famVar(l.family), ["--d" as string]: `${(nodes[l.source].col * 0.35 + 0.1).toFixed(2)}s` }}
              onMouseEnter={enter({ link: l.i })} onMouseMove={move} />
          ))}
        </g>
        <g className="sk2__nodes">
          {nodes.map((n) => {
            const dim = on && !on.ns.has(n.i);
            const label = n.col === 2 ? FAMILY_LABEL[n.family as FamilyKey] ?? n.label : n.label;
            const sub = n.col === 0 ? `${n.aum != null ? eur(n.aum) : "—"} · ${plural(n.value, "enreg.", "enreg.")}` : plural(n.value, "enregistrement");
            const cy = n.y + n.h / 2;
            const left = n.col === 0;
            const tx = left ? n.x - 12 : n.x + NODE_W + 10;
            const thin = n.h < 26;
            return (
              <g key={n.id} className={`sk2__node${dim ? " is-dim" : ""}${n.other ? " is-other" : ""}`} tabIndex={0} role="button"
                aria-label={`${label} : ${n.col === 0 && n.aum != null ? `encours ${eur(n.aum)}, ` : ""}${plural(n.value, "enregistrement")}, ${plural(n.n_funds, "fonds", "fonds")}, ${plural(n.n_shares, "part")}`}
                onMouseEnter={enter({ node: n.i })} onMouseMove={move} onFocus={() => focusNode(n)} onBlur={leave}
                onClick={() => onOpen?.(n)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(n); } }}>
                <rect x={n.x - 4} y={n.y - 2} width={NODE_W + 8} height={n.h + 4} fill="transparent" />
                <rect className="sk2__bar" x={n.x} y={n.y} width={NODE_W} height={n.h} style={{ fill: nodeColor(n) }} />
                {left && !n.other && <text className="sk2__rank" x={24} y={cy} dominantBaseline="middle">{String(rank.get(n.i) ?? 0).padStart(2, "0")}</text>}
                <text className="sk2__t" x={tx} y={thin ? cy : cy - 8} textAnchor={left ? "end" : "start"} dominantBaseline="middle">{label}</text>
                {!thin && <text className="sk2__s" x={tx} y={cy + 11} textAnchor={left ? "end" : "start"} dominantBaseline="middle">{sub}</text>}
              </g>
            );
          })}
        </g>
      </svg>
      {data.rest && data.rest.n_clients > 0 && (
        <p className="sk2__rest small muted">Les {data.rest.n_clients} autres clientèles ({eur(data.rest.aum)} d'encours, {plural(data.rest.value, "enregistrement")}) ne sont pas dessinées : elles figurent dans la matrice clients × pays.</p>
      )}
      {hot && tip && <SkTip hot={hot} nodes={nodes} links={links} x={tip.x} y={tip.y} />}
    </div>
  );
}

function SkTip({ hot, nodes, links, x, y }: { hot: NonNullable<Hot>; nodes: LNode[]; links: LLink[]; x: number; y: number }) {
  const style = { transform: `translate(-50%, -100%) translate(${x}px, ${y - 18}px)` };
  if (hot.node != null) {
    const n = nodes[hot.node];
    return (
      <div className="city__tip sk2__tip" style={style} role="status">
        <div className="city__tip-f">{["Clientèle", "Pays d'enregistrement", "Famille de gestion"][n.col]}{n.col === 0 && n.kind === "nommé" ? " · client nommé" : n.col === 0 && n.kind === "pool" ? " · pool" : ""}</div>
        <div className="city__tip-n">{n.col === 2 ? FAMILY_LABEL[n.family as FamilyKey] ?? n.label : n.label}</div>
        {n.col === 0 && <div className="city__tip-v num">{eur(n.aum)}<span className="small muted"> d'encours</span></div>}
        <div className="city__tip-s small">{plural(n.value, "enregistrement")} · {plural(n.n_funds, "fonds", "fonds")} · {plural(n.n_shares, "part")}</div>
        {n.col === 0 && n.other && n.n_clients ? <div className="city__tip-go small">{plural(n.n_clients, "clientèle")} regroupées</div> : null}
        {n.col > 0 && <div className="city__tip-go small">Cliquer pour ouvrir</div>}
      </div>
    );
  }
  const l = links[hot.link!];
  return (
    <div className="city__tip sk2__tip" style={style} role="status">
      <div className="city__tip-f">{l.family === "all" ? "Toutes familles" : <><span className="dot" style={{ background: famVar(l.family) }} />{FAMILY_LABEL[l.family as FamilyKey]}</>}</div>
      <div className="city__tip-n">{nodes[l.source].label} <span className="muted">→</span> {nodes[l.target].col === 2 ? FAMILY_LABEL[nodes[l.target].family as FamilyKey] : nodes[l.target].label}</div>
      <div className="city__tip-v num">{plural(l.value, "enregistrement")}</div>
      <div className="city__tip-s small">{plural(l.n_funds, "fonds", "fonds")} · {plural(l.n_shares, "part")}</div>
    </div>
  );
}

