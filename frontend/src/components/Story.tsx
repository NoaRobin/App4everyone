/** Éléments de récit partagés par l'Accueil et les Encours : montants animés, équation de la variation, tableau à palettes. */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { date as fdate, eur, eurParts, plural } from "../lib/format";
import { prefersReducedMotion } from "../lib/motion";
import { gsap, onVisible, ScrollTrigger } from "../lib/gsap";
import { Flag } from "./Flag";
import type { Overview } from "../lib/types";

export type BoardRow = { country: string; iso: string; n_shares: number; n_funds: number };

/**
 * Montant qui se compte jusqu'à sa valeur quand il entre à l'écran (dans l'unité finale : pas de saut M€ → Md€).
 * `live` : suit la valeur en continu (frise des quatre ans). Accessible : l'étiquette porte la valeur exacte.
 */
export function Money({ v, big, immediate, live }: { v: number | null | undefined; big?: boolean; immediate?: boolean; live?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const p = eurParts(v);
  const dec = (p.value.split(",")[1] ?? "").length;
  const target = Number(p.value.replace(/\s| | /g, "").replace("−", "-").replace(",", "."));
  const fmt = (x: number) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(x);
  useEffect(() => {
    const el = ref.current;
    if (!el || v == null || live) return;
    if (prefersReducedMotion()) { el.textContent = p.value; return; }
    const o = { x: 0 };
    el.textContent = fmt(0);
    const tw = gsap.to(o, { x: target, duration: 2.2, ease: "expo.out", paused: true, onUpdate: () => { el.textContent = fmt(o.x); } });
    const st = immediate ? null : ScrollTrigger.create({ trigger: el, start: "top 80%", once: true, onEnter: () => tw.play() });
    if (immediate) tw.delay(0.4).play();
    return () => { st?.kill(); tw.kill(); el.textContent = p.value; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, live]);
  if (v == null) return <span>—</span>;
  return (
    <span className={big ? "money money--big" : "money"} role="text" aria-label={eur(v)}>
      <span ref={ref} aria-hidden="true">{p.value}</span><span className="money__u" aria-hidden="true">{p.unit}</span>
    </span>
  );
}

/** L'équation de l'année : encours de départ + collecte + effet marché = encours d'arrivée, avec des barres proportionnelles. */
export function Equation({ v, end }: { v: NonNullable<Overview["var"][string]>; end: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const max = Math.max(v.aum_start ?? 0, v.aum_end ?? 0, 1);
  const rows: { l: string; x: number | null; kind: "base" | "flow" | "mkt" | "end" }[] = [
    { l: `Encours au ${fdate(v.start)}`, x: v.aum_start, kind: "base" },
    { l: "Collecte nette estimée", x: v.flows, kind: "flow" },
    { l: "Effet marché", x: v.market, kind: "mkt" },
    { l: `Encours au ${fdate(end)}`, x: v.aum_end, kind: "end" },
  ];
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const bars = el.querySelectorAll(".eq__bar > span");
    const tw = gsap.from(bars, { scaleX: 0, duration: 1.3, stagger: 0.22, ease: "power3.out", paused: true });
    const st = ScrollTrigger.create({ trigger: el, start: "top 75%", once: true, onEnter: () => tw.play() });
    return () => { st.kill(); tw.revert(); };
  }, []);
  // Les flux sont mis à l'échelle de l'encours de départ, en partant de la fin de la barre précédente
  let run = v.aum_start ?? 0;
  return (
    <div className="eq" ref={ref} data-a="">
      {rows.map((r, i) => {
        const x = r.x ?? 0;
        let left = 0, width = 0;
        if (r.kind === "base" || r.kind === "end") { left = 0; width = x / max; }
        else { const a = run, b = run + x; left = Math.min(a, b) / max; width = Math.abs(x) / max; run = b; }
        return (
          <div key={i} className={`eq__row eq__row--${r.kind}`}>
            <span className="eq__op" aria-hidden="true">{i === 0 ? "" : i === 3 ? "=" : x >= 0 ? "+" : "−"}</span>
            <span className="eq__l">{r.l}</span>
            <span className="eq__v num">{r.kind === "base" || r.kind === "end" ? eur(x) : eur(x, { signed: true })}</span>
            <span className="eq__bar" aria-hidden="true"><span className={x < 0 ? "is-neg" : ""} style={{ left: `${left * 100}%`, width: `${Math.max(width * 100, 0.6)}%` }} /></span>
          </div>
        );
      })}
    </div>
  );
}

const FLAP_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Tableau des départs (façon aéroport) : drapeau qui pivote, palettes qui défilent lettre à lettre, horloge.
 *  Une ligne = un pays de commercialisation ; « vol » = rang du pays, « porte » = nombre de fonds. */
export function Board({ rows, title = "Départs", subtitle = "Pays de commercialisation" }: { rows: BoardRow[]; title?: string; subtitle?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 15000); return () => window.clearInterval(t); }, []);
  const W = Math.min(16, Math.max(8, ...rows.map((r) => (r.country ?? "").length)));
  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "." : s.padEnd(n, " "));
  const up = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const cells = Array.from(el.querySelectorAll<HTMLElement>(".flap"));
    const flags = Array.from(el.querySelectorAll<HTMLElement>(".board__flag"));
    const rowsEl = Array.from(el.querySelectorAll<HTMLElement>(".board__row"));
    gsap.set(flags, { rotateX: -90, opacity: 0 });
    const run = () => {
      gsap.fromTo(rowsEl, { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.6, stagger: 0.06, ease: "power3.out", clearProps: "opacity,transform" });
      gsap.to(flags, { rotateX: 0, opacity: 1, duration: 0.9, stagger: 0.09, delay: 0.25, ease: "back.out(2.2)" });
      cells.forEach((c, k) => {
        const fin = c.dataset.c ?? " ";
        if (fin === " ") return;
        const o = { t: 0 };
        const n = 6 + ((k * 7) % 9);
        gsap.to(o, { t: n, duration: 0.05 * n, delay: 0.2 + (k % 40) * 0.012 + Math.floor(k / 40) * 0.08, ease: "none",
          onUpdate: () => { const i = Math.floor(o.t); c.textContent = i >= n ? fin : FLAP_CHARS[(k * 13 + i * 5) % FLAP_CHARS.length]; },
          onComplete: () => { c.textContent = fin; gsap.fromTo(c, { scaleY: 0.82 }, { scaleY: 1, duration: 0.25, ease: "back.out(3)" }); } });
      });
    };
    return onVisible(el, run, "0px 0px -15% 0px");
  }, [rows]);
  const cells = (s: string) => s.split("").map((ch, i) => <span key={i} className="flap" data-c={ch}>{ch}</span>);
  const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="board" ref={ref}>
      <div className="board__top" aria-hidden="true">
        <span className="board__plane"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" fill="currentColor" /></svg></span>
        <b>{title}</b><span className="board__en">Departures</span><span className="board__sub">{subtitle}</span>
        <span className="board__clock num">{time}</span>
      </div>
      <table className="board__t">
        <caption className="sr-only">{subtitle}, classés par nombre de parts enregistrées</caption>
        <thead><tr><th scope="col">Vol</th><th scope="col"><span className="sr-only">Drapeau</span></th><th scope="col">Destination</th><th scope="col">Code</th>
          <th scope="col" className="n">Fonds</th><th scope="col" className="n">Parts</th><th scope="col">Statut</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.iso} className="board__row">
              <td className="board__vol num">RC {String(101 + i)}</td>
              <td><span className="board__flag"><Flag iso={r.iso} title={`Drapeau : ${r.country}`} /></span></td>
              <th scope="row"><Link to={`/distribution/${encodeURIComponent(r.country)}`} aria-label={r.country}><span aria-hidden="true">{cells(pad(up(r.country), W))}</span></Link></th>
              <td><span aria-hidden="true">{cells(pad(r.iso, 2))}</span><span className="sr-only">{r.iso}</span></td>
              <td className="n"><span aria-hidden="true">{cells(String(r.n_funds).padStart(2, " "))}</span><span className="sr-only">{plural(r.n_funds, "fonds", "fonds")}</span></td>
              <td className="n"><span aria-hidden="true">{cells(String(r.n_shares).padStart(3, " "))}</span><span className="sr-only">{plural(r.n_shares, "part")}</span></td>
              <td><span className="board__st"><i />Commercialisé</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
