/**
 * Système de mouvement (GSAP + ScrollTrigger + SplitText).
 * Règles : décalages courts (8–16 px), titres courts seulement pour SplitText, déclenchement une seule fois,
 * jamais de contenu laissé invisible, rien du tout si l'utilisateur préfère réduire les animations.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { CustomEase } from "gsap/CustomEase";
import { prefersReducedMotion } from "./motion";

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase);
CustomEase.create("rco", "M0,0 C0.16,0.84 0.28,1 1,1");
CustomEase.create("rcoIn", "M0,0 C0.6,0 0.8,0.3 1,1");
gsap.defaults({ ease: "rco" });

export { gsap, ScrollTrigger, SplitText };

const done = new WeakSet<Element>();

/**
 * Lance `play` quand `el` devient visible. Contrairement à un ScrollTrigger « once », aucune position n'est calculée
 * à l'avance : un contenu chargé plus haut dans la page (graphiques, tableaux) ne peut plus décaler le déclenchement
 * et laisser un bloc invisible (le « trou » observé dans la fiche fonds).
 */
export function onVisible(el: Element, play: () => void, rootMargin = "0px 0px -10% 0px"): () => void {
  if (typeof IntersectionObserver === "undefined") { play(); return () => undefined; }
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) { io.disconnect(); play(); }
  }, { rootMargin });
  io.observe(el);
  return () => io.disconnect();
}

/** Anime ce qui vient d'apparaître dans la page (appelé après chaque chargement de données). */
export function animatePage(root: ParentNode = document): () => void {
  const ctx = gsap.context(() => {});
  if (prefersReducedMotion()) {
    root.querySelectorAll<HTMLElement>(".reveal").forEach((e) => e.classList.add("is-in"));
    return () => ctx.revert();
  }
  const splits: SplitText[] = [];
  const marked: Element[] = [];
  const watchers: (() => void)[] = [];
  /** Tween créé en pause (état de départ appliqué), joué quand son déclencheur devient visible. */
  const when = (trigger: Element | null | undefined, tw: gsap.core.Tween | gsap.core.Timeline, margin?: string) => {
    if (!trigger) { tw.play(); return; }
    watchers.push(onVisible(trigger, () => tw.play(), margin));
  };
  ctx.add(() => {
    const fresh = <T extends Element>(sel: string) => Array.from(root.querySelectorAll<T>(sel)).filter((e) => !done.has(e) && (done.add(e), marked.push(e), true));

    // Sections : fondu court
    fresh<HTMLElement>(".reveal").forEach((sec) => {
      sec.classList.add("is-in");
      when(sec, gsap.fromTo(sec, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9, paused: true, clearProps: "opacity,transform" }), "0px 0px -6% 0px");
    });

    // Titres de section : lignes révélées derrière un masque
    fresh<HTMLElement>(".section__head .h2, .motion-title").forEach((el) => {
      if ((el.textContent ?? "").split(/\s+/).length > 9) return;
      const split = new SplitText(el, { type: "lines", mask: "lines", linesClass: "st-line" });
      splits.push(split);
      when(el, gsap.from(split.lines, { yPercent: 105, duration: 1.05, stagger: 0.09, ease: "rco", paused: true, onComplete: () => split.revert() }));
    });

    // Grands titres de page : lettres qui montent derrière un masque, à l'arrivée
    fresh<HTMLElement>(".hero-title").forEach((el) => {
      if ((el.textContent ?? "").length > 60) return;
      const split = new SplitText(el, { type: "words,chars", mask: "words" });
      splits.push(split);
      gsap.from(split.chars, { yPercent: 110, duration: 1.15, stagger: 0.022, ease: "rco", delay: 0.15, onComplete: () => split.revert() });
    });
    fresh<HTMLElement>("main .h1").forEach((el) => {
      if (el.classList.contains("hero-title") || (el.textContent ?? "").split(/\s+/).length > 9) return;
      const split = new SplitText(el, { type: "lines", mask: "lines" });
      splits.push(split);
      gsap.from(split.lines, { yPercent: 105, duration: 1.1, stagger: 0.1, delay: 0.1, onComplete: () => split.revert() });
    });

    // Sur-titres : l'interlettrage se resserre
    fresh<HTMLElement>(".section__head .eyebrow").forEach((el) => {
      when(el, gsap.from(el, { letterSpacing: "0.42em", opacity: 0, duration: 1.2, paused: true }), "0px 0px -4% 0px");
    });

    // Courbes : tracé progressif
    fresh<SVGPathElement>(".chart path.draw").forEach((p) => {
      const len = p.getTotalLength?.() ?? 0;
      if (!len) return;
      when(p.closest(".chart") ?? p, gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len },
        { strokeDashoffset: 0, duration: 1.8, ease: "power2.inOut", paused: true, onComplete: () => { p.style.strokeDasharray = "none"; } }));
    });
    fresh<SVGPathElement>(".chart path.area").forEach((p) => {
      when(p.closest(".chart") ?? p, gsap.from(p, { opacity: 0, duration: 1.4, delay: 0.5, paused: true }));
    });

    // Barres horizontales : poussée depuis la gauche
    fresh<HTMLElement>(".barlist").forEach((list) => {
      when(list, gsap.fromTo(list.querySelectorAll(".barlist__bar"), { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: 1.1, stagger: 0.04, ease: "power3.out", paused: true, clearProps: "transform" }));
    });

    // Ruban et classement : le ruban se déploie, puis les barres poussent ligne après ligne
    fresh<HTMLElement>(".rbn").forEach((r) => {
      const tl = gsap.timeline({ paused: true });
      tl.fromTo(r.querySelectorAll(".rbn__seg"), { scaleY: 0 }, { scaleY: 1, duration: 0.7, stagger: 0.03, ease: "back.out(1.7)", clearProps: "transform" })
        .fromTo(r.querySelectorAll(".rbn__bar i"), { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: 1.1, stagger: 0.04, ease: "expo.out", clearProps: "transform" }, 0.2)
        .fromTo(r.querySelectorAll(".rbn__row"), { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.035, clearProps: "opacity,transform" }, 0.15);
      when(r, tl);
    });

    // Pont des encours : chaque étape se construit à son tour
    fresh<SVGElement>(".bridge svg").forEach((svg) => {
      if (svg.closest("[data-scrub]")) return;
      const steps = svg.querySelectorAll(":scope > g[tabindex]");
      when(svg, gsap.fromTo(steps, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.16, paused: true, clearProps: "opacity,transform" }));
    });

    // Tableaux : lignes en cascade (les 18 premières seulement)
    fresh<HTMLTableSectionElement>(".t tbody").forEach((tb) => {
      const rows = Array.from(tb.rows).slice(0, 18);
      when(tb, gsap.fromTo(rows, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.025, paused: true, clearProps: "opacity,transform" }));
    });

    // Cartes de parts, tuiles pays (fromTo explicite : ces cartes ont une transition CSS d'opacité, qui fausse
    // la valeur d'arrivée lue par un simple from et les laissait invisibles — le « trou » de la fiche fonds)
    fresh<HTMLElement>(".shares, .tiles__grid, .grid-4").forEach((g) => {
      when(g, gsap.fromTo(g.children, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.05, paused: true, clearProps: "opacity,transform" }));
    });
  });
  requestAnimationFrame(() => ScrollTrigger.refresh());
  return () => { watchers.forEach((w) => w()); splits.forEach((s) => s.revert()); ctx.revert(); marked.forEach((e) => done.delete(e)); };
}

/** Effet magnétique discret (1 à 2 éléments par écran). */
export function magnetic(el: HTMLElement | null, strength = 0.28): () => void {
  if (!el || prefersReducedMotion() || !matchMedia("(pointer: fine)").matches) return () => undefined;
  const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
  const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    xTo((e.clientX - (r.left + r.width / 2)) * strength);
    yTo((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const leave = () => { xTo(0); yTo(0); };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerleave", leave);
  return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); gsap.set(el, { x: 0, y: 0 }); };
}

/**
 * Récit au défilement (une seule section épinglée) : le pont des encours se construit étape par étape.
 * Grand écran uniquement, jamais en mode « animations réduites ».
 */
export function bridgeStory(section: HTMLElement | null): () => void {
  if (!section) return () => undefined;
  const mm = gsap.matchMedia();
  mm.add("(min-width: 1000px) and (prefers-reduced-motion: no-preference)", () => {
    const steps = section.querySelectorAll(".bridge svg > g[tabindex]");
    const links = section.querySelectorAll(".bridge__link");
    const big = section.querySelector(".home__var-main");
    const note = section.querySelector(".home__var-note");
    const tl = gsap.timeline({ scrollTrigger: { trigger: section, start: "top top+=90", end: "+=110%", pin: true, scrub: 0.8, anticipatePin: 1 } });
    tl.from(big, { opacity: 0.15, y: 20, duration: 0.5 }, 0);
    steps.forEach((g, i) => tl.from(g, { opacity: 0, y: 26, duration: 0.6 }, 0.25 + i * 0.5));
    tl.from(links, { opacity: 0, duration: 0.4, stagger: 0.5 }, 0.6);
    if (note) tl.from(note, { opacity: 0, y: 12, duration: 0.5 }, 1.9);
  });
  return () => mm.revert();
}
