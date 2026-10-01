import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { gsap } from "../lib/gsap";
import { prefersReducedMotion } from "../lib/motion";
import { eur, pct } from "../lib/format";
import { famVar } from "../lib/families";
import type { FundRow } from "../lib/types";

/**
 * Curseur : un point exact et un anneau qui suit avec inertie ; l'anneau s'agrandit sur ce qui est cliquable
 * et affiche une intention (« Ouvrir », « Voir »). Souris uniquement, jamais en mode « animations réduites ».
 */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion() || !matchMedia("(pointer: fine)").matches) return;
    setOn(true);
    document.documentElement.classList.add("has-cursor");
    const d = dot.current!, r = ring.current!;
    const dx = gsap.quickTo(d, "x", { duration: 0.08, ease: "power2.out" }), dy = gsap.quickTo(d, "y", { duration: 0.08, ease: "power2.out" });
    const rx = gsap.quickTo(r, "x", { duration: 0.45, ease: "power3.out" }), ry = gsap.quickTo(r, "y", { duration: 0.45, ease: "power3.out" });
    let hot: Element | null = null;
    let seen = false;
    gsap.set([d, r], { opacity: 0 });
    const move = (e: PointerEvent) => {
      if (!seen) { seen = true; gsap.set([d, r], { x: e.clientX, y: e.clientY }); gsap.to([d, r], { opacity: 1, duration: 0.3 }); }
      dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
      const t = (e.target as Element)?.closest?.("a, button, [role=option], tr.clickable, .mosaic__t, .sharecard, canvas, [data-cursor]");
      if (t !== hot) {
        hot = t;
        const txt = t?.getAttribute("data-cursor") ?? (t?.matches("tr.clickable, .sharecard, .mosaic__t, [role=option]") ? "Ouvrir" : t?.tagName === "CANVAS" ? "Explorer" : "");
        label.current!.textContent = txt;
        gsap.to(r, { scale: t ? (txt ? 2.3 : 1.6) : 1, backgroundColor: t ? "rgba(204,159,83,.12)" : "rgba(204,159,83,0)", duration: 0.35, ease: "power3.out" });
        gsap.to(d, { scale: t ? 0 : 1, duration: 0.2 });
      }
    };
    const down = () => gsap.to(r, { scale: "-=0.25", duration: 0.12, yoyo: true, repeat: 1 });
    const leave = () => gsap.to([d, r], { opacity: 0, duration: 0.2 });
    const enter = () => gsap.to([d, r], { opacity: 1, duration: 0.2 });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down);
    document.addEventListener("pointerleave", leave);
    document.addEventListener("pointerenter", enter);
    return () => {
      document.documentElement.classList.remove("has-cursor");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerleave", leave);
      document.removeEventListener("pointerenter", enter);
    };
  }, []);
  if (!on && typeof window !== "undefined" && (prefersReducedMotion() || !matchMedia("(pointer: fine)").matches)) return null;
  return (
    <>
      <div ref={ring} className="cur cur--ring" aria-hidden="true"><span ref={label} className="cur__l" /></div>
      <div ref={dot} className="cur cur--dot" aria-hidden="true" />
    </>
  );
}

const ROUTE_NAMES: [RegExp, string][] = [
  [/^\/$/, "Accueil"], [/^\/metiers/, "Espace métiers"], [/^\/fonds$/, "Fonds"], [/^\/encours/, "Encours"], [/^\/selection/, "Sélection"], [/^\/portefeuilles/, "Portefeuilles"],
  [/^\/distribution/, "Distribution"],
];

/**
 * Transition de page : un rideau bleu Rothschild, un filet d'or, le nom de la destination.
 * N'intercepte jamais la navigation : la nouvelle page se monte immédiatement sous le rideau qui se lève (≈ 0,7 s).
 */
export function Curtain() {
  const loc = useLocation();
  const el = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const last = useRef<string | null>(null);
  const clicked = useRef<string>("");
  useEffect(() => {
    const on = (e: MouseEvent) => {
      const t = (e.target as Element)?.closest?.("a, [role=option], tr.clickable, .mosaic__t, .sharecard, button.barlist__item");
      const txt = (t?.querySelector?.(".sres__label, .strong, .mosaic__n, .sharecard__n, .barlist__label, .rowlink, .rowlink-inline") ?? t)?.textContent ?? "";
      clicked.current = txt.trim().split("\n")[0].slice(0, 42);
    };
    document.addEventListener("click", on, true);
    return () => document.removeEventListener("click", on, true);
  }, []);
  useLayoutEffect(() => {
    const path = loc.pathname;
    if (last.current === null) { last.current = path; return; }
    if (last.current === path) return;
    last.current = path;
    if (prefersReducedMotion() || !el.current) return;
    const detail = /^\/(fonds|parts|distribution)\/./.test(path) || path.startsWith("/portefeuilles/ligne");
    const name = (detail && clicked.current) || ROUTE_NAMES.find(([re]) => re.test(path))?.[1] || clicked.current || "";
    word.current!.textContent = name;
    const tl = gsap.timeline();
    tl.set(el.current, { autoAlpha: 1, clipPath: "inset(0% 0% 0% 0%)" })
      .fromTo(word.current, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.32, ease: "rco" }, 0)
      .fromTo(line.current, { scaleX: 0 }, { scaleX: 1, duration: 0.42, ease: "power3.inOut" }, 0)
      .to(word.current, { yPercent: -40, opacity: 0, duration: 0.3, ease: "rcoIn" }, 0.36)
      .to(el.current, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.55, ease: "power4.inOut" }, 0.4)
      .set(el.current, { autoAlpha: 0 });
    const main = document.getElementById("contenu");
    if (main) tl.fromTo(main, { y: 24 }, { y: 0, duration: 0.8, ease: "rco", clearProps: "transform" }, 0.45);
    return () => { tl.progress(1).kill(); };
  }, [loc.pathname]);
  return (
    <div ref={el} className="curtain" aria-hidden="true">
      <span ref={word} className="curtain__w" />
      <span ref={line} className="curtain__l" />
    </div>
  );
}

/** Le fil des fonds : bandeau défilant (pause au survol et au focus), chaque fonds est un lien. */
export function Ticker({ funds }: { funds: FundRow[] }) {
  const track = useRef<HTMLDivElement>(null);
  const tween = useRef<gsap.core.Tween | null>(null);
  const items = funds.filter((f) => (f.aum ?? 0) > 0).sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0));
  useEffect(() => {
    const t = track.current;
    if (!t || prefersReducedMotion() || !items.length) return;
    tween.current = gsap.to(t, { xPercent: -50, duration: items.length * 3.2, ease: "none", repeat: -1 });
    return () => { tween.current?.kill(); gsap.set(t, { xPercent: 0 }); };
  }, [items.length]);
  if (!items.length) return null;
  const row = (dup: boolean) => items.map((f) => (
    <Link key={(dup ? "b" : "a") + f.id} to={`/fonds/${encodeURIComponent(f.id)}`} className="tick__i" tabIndex={dup ? -1 : 0} aria-hidden={dup || undefined}>
      <span className="dot" style={{ background: famVar(f.family) }} />
      <span className="tick__n">{f.name}</span>
      <span className="tick__v num">{eur(f.aum)}</span>
      <span className={`tick__d num ${(f.var_YTD ?? 0) >= 0 ? "is-up" : "is-down"}`}>{(f.var_YTD ?? 0) >= 0 ? "▲" : "▼"} {pct(f.var_YTD)}</span>
    </Link>
  ));
  return (
    <div className="tick" role="region" aria-label="Le fil des fonds : encours et variation depuis le 1er janvier"
      onMouseEnter={() => tween.current?.pause()} onMouseLeave={() => tween.current?.resume()}
      onFocus={() => tween.current?.pause()} onBlur={() => tween.current?.resume()}>
      <div ref={track} className="tick__t">{row(false)}{row(true)}</div>
    </div>
  );
}
