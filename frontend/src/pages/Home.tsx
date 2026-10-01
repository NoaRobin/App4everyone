import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { geoConicConformal, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, Geometry } from "geojson";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur } from "../lib/format";
import { FAMILY_LABEL, FAMILY_ORDER, famVar } from "../lib/families";
import { prefersReducedMotion, useReducedMotion } from "../lib/motion";
import { gsap, ScrollTrigger } from "../lib/gsap";
import type { Overview } from "../lib/types";
import { Board, Money, type BoardRow } from "../components/Story";
import * as I from "../components/Icon";

type Entry = { year: string; title: string; text: string; source?: string; image?: string | null };
type Img = { file: string; caption?: string; author?: string; licence?: string; source?: string };
type Histoire = { timeline: Entry[]; images?: Img[]; facts?: { aum?: string; staff?: string; other?: string[] } };
type Dist = { countries: BoardRow[]; n_shares_registered: number };

/** Les époques de la fresque (bornes incluses) : elles rythment le rail et le décor des planches. */
const ERAS: { key: string; label: string; from: number; to: number }[] = [
  { key: "origines", label: "Les origines", from: 1700, to: 1830 },
  { key: "rails", label: "Le siècle de l'industrie", from: 1831, to: 1900 },
  { key: "refondation", label: "La refondation", from: 1901, to: 1990 },
  { key: "gestion", label: "La gestion d'actifs", from: 1991, to: 2020 },
  { key: "aujourdhui", label: "Aujourd'hui", from: 2021, to: 2100 },
];
const eraOf = (y: string) => ERAS.find((e) => parseInt(y, 10) >= e.from && parseInt(y, 10) <= e.to) ?? ERAS[ERAS.length - 1];

/** Les cinq maisons fondées par les fils de Mayer Amschel (1810–1821). */
const HOUSES = [
  { city: "Francfort", who: "Amschel", lon: 8.68, lat: 50.11, year: "1810" },
  { city: "Londres", who: "Nathan", lon: -0.09, lat: 51.51, year: "1809" },
  { city: "Paris", who: "James", lon: 2.35, lat: 48.86, year: "1812" },
  { city: "Vienne", who: "Salomon", lon: 16.37, lat: 48.21, year: "1820" },
  { city: "Naples", who: "Carl", lon: 14.27, lat: 40.85, year: "1821" },
];

export default function Home() {
  const { api, meta } = useApp();
  const [h, setH] = useState<Histoire | null>(null);
  const ov = useApi<Overview>(api("/api/overview"));
  const dist = useApi<Dist>(api("/api/distribution"));
  useEffect(() => {
    let alive = true;
    fetch("/histoire/histoire.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((j) => alive && setH(j)).catch(() => alive && setH(null));
    return () => { alive = false; };
  }, []);
  const o = ov.data;
  return (
    <div className="home">
      <Grain />
      <Overture />
      {h && <Fresque entries={h.timeline} images={h.images ?? []} />}
      <Houses />
      {h?.facts && <Today facts={h.facts} />}
      {o && <Living o={o} mock={!!meta?.is_mock} />}
      {dist.data && (
        <section className="home__world" aria-labelledby="h-world">
          <Rise><div className="eyebrow home__eyebrow">Départs · distribution</div></Rise>
          <Rise><h2 className="home__h2" id="h-world">Commercialisés dans {dist.data.countries.length}&nbsp;pays.</h2></Rise>
          <Board rows={[...dist.data.countries].sort((a, b) => b.n_shares - a.n_shares).slice(0, 9)} />
          <Rise><p className="home__lede">{dist.data.n_shares_registered} parts disposent d'au moins un enregistrement actif. <Link className="link" to="/distribution">Voir le globe des autorisations</Link></p></Rise>
        </section>
      )}
      <section className="home__close" aria-labelledby="h-close">
        <div className="home__close-in">
          <Rise><div className="eyebrow home__eyebrow">Espace métiers</div></Rise>
          <Rise><h2 className="home__h1" id="h-close">Chaque fonds, dans le détail.</h2></Rise>
          <Rise><p className="home__lede">Fiches, parts, performances, portefeuilles, pays d'enregistrement, risques et contrôles&nbsp;: tout est à une recherche.</p></Rise>
          <Rise>
            <div className="home__cta">
              <Link to="/metiers" className="btn btn--gold btn--lg">Entrer dans l'espace métiers <I.Arrow size={18} /></Link>
              <Link to="/fonds" className="btn btn--ghost btn--lg"><I.Search size={18} /> Rechercher un fonds</Link>
            </div>
          </Rise>
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ ouverture
function Overture() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "rco" } });
      tl.from(".home__bars i", { scaleY: 0, duration: 1.1, ease: "power3.inOut" })
        .fromTo(".arrows path", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.6, stagger: 0.12, ease: "power2.inOut" }, 0.2)
        .from(".arrows circle", { scale: 0, transformOrigin: "50% 50%", duration: 0.8, ease: "back.out(2)" }, 1.1)
        .from(".home__title .ch", { yPercent: 115, duration: 1.1, stagger: 0.028 }, 0.7)
        .from(".home__sub, .home__motto, .home__cue", { opacity: 0, y: 14, duration: 0.9, stagger: 0.12 }, 1.4);
      // Au défilement : l'ouverture s'éloigne (échelle, flou de profondeur simulé par l'opacité)
      gsap.to(".home__ov-in", { scale: 0.92, opacity: 0, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: true } });
    }, el);
    return () => ctx.revert();
  }, []);
  const split = (s: string) => s.split("").map((c, i) => <span key={i} className="ch">{c === " " ? " " : c}</span>);
  return (
    <section className="home__ov" ref={ref} aria-labelledby="h-home">
      <div className="home__bars" aria-hidden="true"><i /><i /></div>
      <div className="home__ov-in">
        <Arrows />
        <h1 className="home__title" id="h-home">
          <span className="home__title-l"><span className="home__mask">{split("Rothschild & Co")}</span></span>
          <span className="home__title-l home__title-l--2"><span className="home__mask">{split("Asset Management")}</span></span>
        </h1>
        <p className="home__sub">Une maison familiale et indépendante depuis plus de deux siècles. Son histoire, de la Judengasse de Francfort à la gestion d'actifs d'aujourd'hui.</p>
        <p className="home__motto" aria-label="Devise de la famille : Concordia, Integritas, Industria">Concordia <span>·</span> Integritas <span>·</span> Industria</p>
      </div>
      <div className="home__cue" aria-hidden="true"><span>Faire défiler</span><i /></div>
    </section>
  );
}

/** Les cinq flèches liées des armoiries (les cinq frères), dessinées au trait. */
function Arrows({ small }: { small?: boolean }) {
  const a = [-36, -18, 0, 18, 36];
  return (
    <svg className={`arrows${small ? " arrows--s" : ""}`} viewBox="-60 -70 120 140" aria-hidden="true">
      {a.map((deg) => (
        <g key={deg} transform={`rotate(${deg})`}>
          <path pathLength={1} d="M0 52 L0 -52 M-6 -40 L0 -54 L6 -40 M-5 50 L0 44 L5 50 M-5 56 L0 50 L5 56" />
        </g>
      ))}
      <circle r="9" cx="0" cy="12" />
    </svg>
  );
}

// ------------------------------------------------------------------ fresque
function Fresque({ entries, images }: { entries: Entry[]; images: Img[] }) {
  const pin = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const yearRef = useRef<HTMLSpanElement>(null);
  const [cur, setCur] = useState(0);
  const reduced = useReducedMotion();
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 900);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 900);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const linear = reduced || narrow;
  const imgOf = useMemo(() => new Map(images.map((i) => [i.file, i])), [images]);

  useEffect(() => {
    const el = pin.current, tr = track.current;
    if (!el || !tr || linear) return;
    const ctx = gsap.context(() => {
      const dist = () => tr.scrollWidth - window.innerWidth;
      const tween = gsap.to(tr, { x: () => -dist(), ease: "none" });
      const st = ScrollTrigger.create({
        trigger: el, start: "top top", end: () => `+=${dist()}`, pin: true, scrub: 0.8, animation: tween, invalidateOnRefresh: true, anticipatePin: 1,
        onUpdate: (self) => {
          const i = Math.min(entries.length - 1, Math.round(self.progress * (entries.length - 1)));
          setCur(i);
        },
      });
      // Chaque planche : l'image se rapproche (effet Ken Burns), le texte monte
      gsap.utils.toArray<HTMLElement>(".fr__plate").forEach((p) => {
        gsap.fromTo(p.querySelector(".fr__img"), { scale: 1.18, xPercent: 6 }, { scale: 1, xPercent: -6, ease: "none",
          scrollTrigger: { trigger: p, containerAnimation: tween, start: "left right", end: "right left", scrub: true } });
        gsap.from(p.querySelectorAll(".fr__t, .fr__p, .fr__src"), { y: 40, opacity: 0, stagger: 0.08, duration: 0.8,
          scrollTrigger: { trigger: p, containerAnimation: tween, start: "left 70%", toggleActions: "play none none reverse" } });
      });
      return () => st.kill();
    }, el);
    return () => ctx.revert();
  }, [entries.length, linear]);

  // L'année géante du fond défile jusqu'à celle de la planche
  useEffect(() => {
    const el = yearRef.current;
    if (!el || !entries[cur]) return;
    const target = parseInt(entries[cur].year, 10);
    if (prefersReducedMotion()) { el.textContent = entries[cur].year; return; }
    const from = parseInt(el.textContent || String(target), 10) || target;
    const o = { y: from };
    const tw = gsap.to(o, { y: target, duration: 0.7, ease: "power3.out", onUpdate: () => { el.textContent = String(Math.round(o.y)); },
      onComplete: () => { el.textContent = entries[cur].year; } });
    return () => { tw.kill(); };
  }, [cur, entries]);

  const era = eraOf(entries[cur]?.year ?? "2026");
  return (
    <section className={`fr${linear ? " fr--linear" : ""}`} ref={pin} aria-labelledby="h-fresque" data-era={era.key}>
      <div className="fr__head">
        <div className="eyebrow home__eyebrow">La fresque · 1744 – aujourd'hui</div>
        <h2 className="home__h2" id="h-fresque">Deux siècles et demi, une même maison.</h2>
      </div>
      {!linear && (
        <>
          <div className="fr__year num" aria-hidden="true"><span ref={yearRef}>{entries[0]?.year}</span></div>
          <ol className="fr__rail" aria-hidden="true">
            {ERAS.map((e) => <li key={e.key} className={e.key === era.key ? "is-on" : ""}><span>{e.label}</span></li>)}
          </ol>
          <div className="fr__prog" aria-hidden="true"><i style={{ transform: `scaleX(${entries.length > 1 ? cur / (entries.length - 1) : 1})` }} /></div>
        </>
      )}
      <div className="fr__track" ref={track}>
        {entries.map((e, i) => {
          const img = e.image ? imgOf.get(e.image) : undefined;
          const er = eraOf(e.year);
          return (
            <article key={i} className={`fr__plate fr__plate--${er.key}${i === cur ? " is-cur" : ""}`} aria-label={`${e.year} — ${e.title}`}>
              <div className="fr__frame">
                <div className="fr__img">{e.image ? <Photo file={e.image} alt={img?.caption ?? e.title} era={motifOf(e)} year={e.year} /> : <Plate era={motifOf(e)} year={e.year} />}</div>
                {img && <div className="fr__credit small">{img.caption}{img.author ? ` · ${img.author}` : ""}{img.licence ? ` · ${img.licence}` : ""}</div>}
              </div>
              <div className="fr__body">
                <div className="fr__y num">{e.year}</div>
                <h3 className="fr__t">{e.title}</h3>
                <p className="fr__p">{e.text}</p>
                {e.source && <a className="fr__src small" href={e.source} target="_blank" rel="noreferrer noopener">Source <I.Arrow size={12} /></a>}
              </div>
            </article>
          );
        })}
        <div className="fr__end" aria-hidden="true" />
      </div>
    </section>
  );
}

/** Photographie d'archive (si elle a été déposée dans /histoire/) ; à défaut, une planche gravée. */
function Photo({ file, alt, era, year }: { file: string; alt: string; era: string; year: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <Plate era={era} year={year} />;
  return <img src={`/histoire/${encodeURIComponent(file)}`} alt={alt} loading="lazy" onError={() => setOk(false)} />;
}

/** Motif de la planche gravée selon le sujet de l'étape (à défaut, celui de son époque). */
const MOTIFS: [RegExp, string][] = [
  [/manchester|textile/i, "fil"], [/londres|new court/i, "facade"], [/paris|james|frères/i, "paris"], [/wellington|armée|or\b/i, "pieces"],
  [/vienne|naples|maisons/i, "cinq"], [/baron|flèches|armoiries/i, "blason"], [/chemin de fer|nord|orléans/i, "rails"], [/suez|canal/i, "vagues"],
  [/nationalis/i, "colonnes"], [/refondation|banque/i, "colonnes"], [/valor|fonds|gestion/i, "courbe"], [/martin maurel|fusion/i, "union"],
  [/présidence|génération/i, "lignee"], [/cote|concordia/i, "globe"], [/record|milliards|encours/i, "barres"], [/naissance|francfort|société/i, "origines"],
];
function motifOf(e: Entry): string {
  const t = `${e.title} ${e.text}`;
  return MOTIFS.find(([re]) => re.test(e.title))?.[1] ?? MOTIFS.find(([re]) => re.test(t))?.[1] ?? eraOf(e.year).key;
}

/** Planche gravée : un motif propre à chaque époque, à la manière des gravures d'archives (illustration, pas une photographie). */
function Plate({ era, year }: { era: string; year: string }) {
  const id = `h-${era}-${year.replace(/\W/g, "")}`;
  const motif: Record<string, ReactNode> = {
    origines: <g className="pl__m">{[-36, -18, 0, 18, 36].map((d) => <path key={d} transform={`translate(200 250) rotate(${d})`} d="M0 120 L0 -120 M-12 -96 L0 -124 L12 -96" />)}<circle cx="200" cy="275" r="20" /></g>,
    rails: <g className="pl__m">{Array.from({ length: 9 }, (_, k) => <path key={k} d={`M${200 - 8 - k * 26} 500 L196 170 M${200 + 8 + k * 26} 500 L204 170`} />)}{Array.from({ length: 12 }, (_, k) => <path key={`t${k}`} d={`M${186 - k * 9} ${480 - k * 26} L${214 + k * 9} ${480 - k * 26}`} />)}</g>,
    refondation: <g className="pl__m">{Array.from({ length: 6 }, (_, k) => <path key={k} d={`M${80 + k * 48} 430 L${80 + k * 48} 190`} />)}<path d="M60 190 L200 110 L340 190 Z M50 430 L350 430 M50 446 L350 446" /></g>,
    gestion: <g className="pl__m"><path d="M50 420 C120 400 150 330 200 320 C260 306 280 230 350 170" />{Array.from({ length: 9 }, (_, k) => <path key={k} d={`M${70 + k * 34} 440 L${70 + k * 34} ${430 - k * 26}`} />)}</g>,
    fil: <g className="pl__m">{Array.from({ length: 7 }, (_, k) => <g key={k}><ellipse cx={80 + k * 40} cy="300" rx="14" ry="60" /><path d={`M${80 + k * 40} 200 L${80 + k * 40} 400`} /></g>)}<path d="M40 210 L360 210 M40 390 L360 390" /></g>,
    facade: <g className="pl__m"><path d="M70 420 L330 420 M80 400 L320 400 M90 190 L310 190 L200 120 Z" />{Array.from({ length: 6 }, (_, k) => <path key={k} d={`M${105 + k * 38} 205 L${105 + k * 38} 395`} />)}<path d="M180 400 L180 330 Q200 310 220 330 L220 400" /></g>,
    paris: <g className="pl__m"><path d="M60 420 L340 420 M70 260 L330 260 L310 200 L90 200 Z M120 200 L120 170 L150 170 L150 200 M250 200 L250 170 L280 170 L280 200" />{Array.from({ length: 5 }, (_, k) => <g key={k}><rect x={88 + k * 48} y="285" width="28" height="44" /><rect x={88 + k * 48} y="350" width="28" height="44" /></g>)}</g>,
    pieces: <g className="pl__m">{Array.from({ length: 6 }, (_, k) => <ellipse key={k} cx="200" cy={400 - k * 34} rx="90" ry="22" />)}<circle cx="200" cy="190" r="56" /><circle cx="200" cy="190" r="42" /></g>,
    cinq: <g className="pl__m">{[[200, 230], [110, 180], [150, 270], [290, 260], [270, 380]].map(([x, y], k) => <g key={k}><circle cx={x} cy={y} r={k ? 9 : 13} />{k > 0 && <path d={`M200 230 Q${(200 + x) / 2} ${Math.min(230, y) - 60} ${x} ${y}`} />}</g>)}</g>,
    blason: <g className="pl__m"><path d="M110 150 L290 150 L290 290 Q290 380 200 420 Q110 380 110 290 Z" />{[-30, -15, 0, 15, 30].map((d) => <path key={d} transform={`translate(200 285) rotate(${d})`} d="M0 90 L0 -90 M-8 -72 L0 -94 L8 -72" />)}</g>,
    vagues: <g className="pl__m">{Array.from({ length: 6 }, (_, k) => <path key={k} d={`M40 ${300 + k * 26} Q80 ${285 + k * 26} 120 ${300 + k * 26} T200 ${300 + k * 26} T280 ${300 + k * 26} T360 ${300 + k * 26}`} />)}<path d="M150 290 L250 290 L235 250 L165 250 Z M200 250 L200 160 L250 240" /></g>,
    colonnes: <g className="pl__m">{Array.from({ length: 6 }, (_, k) => <path key={k} d={`M${80 + k * 48} 430 L${80 + k * 48} 190`} />)}<path d="M60 190 L200 110 L340 190 Z M50 430 L350 430 M50 446 L350 446" /></g>,
    courbe: <g className="pl__m"><path d="M50 420 C120 400 150 330 200 320 C260 306 280 230 350 170" />{Array.from({ length: 9 }, (_, k) => <path key={k} d={`M${70 + k * 34} 440 L${70 + k * 34} ${430 - k * 26}`} />)}</g>,
    union: <g className="pl__m"><circle cx="160" cy="300" r="90" /><circle cx="240" cy="300" r="90" /><path d="M200 222 L200 378" /></g>,
    lignee: <g className="pl__m"><path d="M200 440 L200 330 M200 330 L120 260 M200 330 L280 260 M120 260 L80 200 M120 260 L160 200 M280 260 L240 200 M280 260 L320 200" />{[[80, 200], [160, 200], [240, 200], [320, 200], [120, 260], [280, 260], [200, 330]].map(([x, y], k) => <circle key={k} cx={x} cy={y} r="10" />)}<circle cx="200" cy="150" r="22" /></g>,
    barres: <g className="pl__m">{Array.from({ length: 8 }, (_, k) => <rect key={k} x={70 + k * 34} y={430 - (60 + k * 30)} width="20" height={60 + k * 30} />)}<path d="M60 430 L350 430" /></g>,
    globe: <g className="pl__m"><circle cx="200" cy="300" r="140" />{[-60, -30, 0, 30, 60].map((d) => <ellipse key={d} cx="200" cy="300" rx={140 * Math.cos((d * Math.PI) / 180)} ry="140" />)}</g>,
    aujourdhui: <g className="pl__m"><circle cx="200" cy="300" r="140" />{[-60, -30, 0, 30, 60].map((d) => <ellipse key={d} cx="200" cy="300" rx={140 * Math.cos((d * Math.PI) / 180)} ry="140" />)}{[-90, -45, 0, 45, 90].map((y) => <path key={y} d={`M${200 - Math.sqrt(140 ** 2 - y ** 2)} ${300 + y} L${200 + Math.sqrt(140 ** 2 - y ** 2)} ${300 + y}`} />)}</g>,
  };
  return (
    <svg className={`pl pl--${era}`} viewBox="0 0 400 500" role="img" aria-label="Illustration">
      <defs>
        <pattern id={`${id}-hatch`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0 L0 7" /></pattern>
        <radialGradient id={`${id}-v`} cx="50%" cy="45%" r="70%"><stop offset="0" stopColor="#15233b" /><stop offset="1" stopColor="#060b15" /></radialGradient>
      </defs>
      <rect width="400" height="500" fill={`url(#${id}-v)`} />
      <rect width="400" height="500" fill={`url(#${id}-hatch)`} className="pl__hatch" />
      {motif[era] ?? motif.aujourdhui}
      <rect x="14" y="14" width="372" height="472" className="pl__frame" />
      <text x="200" y="470" textAnchor="middle" className="pl__y">{year}</text>
    </svg>
  );
}

// ------------------------------------------------------------------ cinq maisons
function Houses() {
  const ref = useRef<HTMLElement>(null);
  const [paths, setPaths] = useState<string[] | null>(null);
  const W = 900, H = 620;
  const proj = useMemo(() => geoConicConformal().rotate([-10, 0]).center([0, 48]).parallels([40, 58]).scale(1750).translate([W / 2, H / 2 + 20]), []);
  useEffect(() => {
    let alive = true;
    import("world-atlas/countries-110m.json").then((m) => {
      if (!alive) return;
      const topo = ((m as unknown as { default?: unknown }).default ?? m) as never;
      const fc = feature(topo, (topo as { objects: { countries: never } }).objects.countries) as unknown as { features: Feature<Geometry>[] };
      const path = geoPath(proj);
      setPaths(fc.features.map((f) => path(f) ?? "").filter((d) => d.length > 0));
    });
    return () => { alive = false; };
  }, [proj]);
  const pts = HOUSES.map((h) => ({ ...h, xy: proj([h.lon, h.lat]) ?? [0, 0] }));
  const fr = pts[0].xy;
  useEffect(() => {
    const el = ref.current;
    if (!el || !paths || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top top", end: "+=140%", pin: true, scrub: 0.8 } });
      tl.from(".hs__land", { opacity: 0, duration: 0.4 })
        .fromTo(".hs__arc", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1, stagger: 0.25 }, 0.3)
        .from(".hs__pt", { scale: 0, transformOrigin: "50% 50%", duration: 0.4, stagger: 0.25 }, 0.25)
        .from(".hs__lab", { opacity: 0, y: 8, duration: 0.4, stagger: 0.25 }, 0.45)
        .from(".hs__copy > *", { opacity: 0, y: 20, duration: 0.5, stagger: 0.12 }, 0);
    }, el);
    return () => ctx.revert();
  }, [paths]);
  return (
    <section className="hs" ref={ref} aria-labelledby="h-houses">
      <div className="hs__copy">
        <div className="eyebrow home__eyebrow">1809 – 1821</div>
        <h2 className="home__h2" id="h-houses">Cinq frères, cinq maisons.</h2>
        <p className="home__lede">Depuis Francfort, les fils de Mayer Amschel s'établissent à Londres, Paris, Vienne et Naples. Les cinq flèches liées des armoiries disent la force de leur union.</p>
        <Arrows small />
      </div>
      <svg className="hs__map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Carte des cinq maisons : Francfort, Londres, Paris, Vienne, Naples">
        <g className="hs__land">{(paths ?? []).map((d, i) => <path key={i} d={d} />)}</g>
        {pts.slice(1).map((p) => {
          const [x, y] = p.xy, mx = (fr[0] + x) / 2, my = Math.min(fr[1], y) - 60 - Math.hypot(x - fr[0], y - fr[1]) * 0.18;
          return <path key={p.city} className="hs__arc" pathLength={1} d={`M${fr[0]} ${fr[1]} Q${mx} ${my} ${x} ${y}`} />;
        })}
        {pts.map((p) => (
          <g key={p.city} transform={`translate(${p.xy[0]} ${p.xy[1]})`}>
            <circle className="hs__pt" r={p.city === "Francfort" ? 7 : 5.5} />
            <g className="hs__lab"><text x="12" y="-6" className="hs__city">{p.city}</text><text x="12" y="12" className="hs__who">{p.who} · {p.year}</text></g>
          </g>
        ))}
      </svg>
    </section>
  );
}

// ------------------------------------------------------------------ aujourd'hui
function Today({ facts }: { facts: NonNullable<Histoire["facts"]> }) {
  const nums = [
    { v: 50, u: "Md€", l: "d'encours sous gestion (fin juin 2026)" },
    { v: 197, u: "", l: "professionnels de la gestion (fin 2025)" },
    { v: 9, u: "", l: "pays d'implantation" },
  ];
  return (
    <section className="today" aria-labelledby="h-today">
      <Rise><div className="eyebrow home__eyebrow">Rothschild &amp; Co Asset Management aujourd'hui</div></Rise>
      <Rise><h2 className="home__h2" id="h-today">Une société de gestion de conviction, à l'échelle européenne.</h2></Rise>
      <div className="today__nums">
        {nums.map((n) => <Counter key={n.l} {...n} />)}
      </div>
      {facts.other && facts.other.length > 0 && (
        <ul className="today__facts">{facts.other.slice(0, 4).map((f, i) => <Rise key={i}><li>{f}</li></Rise>)}</ul>
      )}
      <p className="today__src small">Chiffres publics communiqués par Rothschild &amp; Co Asset Management ({facts.aum ? facts.aum.replace(/^[^—]*— /, "") : "communiqués"}). Les chiffres de l'application, ci-dessous, sont calculés sur ses propres données.</p>
    </section>
  );
}

function Counter({ v, u, l }: { v: number; u: string; l: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const o = { x: 0 };
    el.textContent = "0";
    const tw = gsap.to(o, { x: v, duration: 2, ease: "expo.out", paused: true, onUpdate: () => { el.textContent = String(Math.round(o.x)); } });
    const st = ScrollTrigger.create({ trigger: el, start: "top 85%", once: true, onEnter: () => tw.play() });
    return () => { st.kill(); tw.kill(); el.textContent = String(v); };
  }, [v]);
  return (
    <div className="today__n">
      <div className="today__v num"><span ref={ref}>{v}</span>{u && <span className="today__u">{u}</span>}</div>
      <div className="today__l">{l}</div>
    </div>
  );
}

// ------------------------------------------------------------------ la maison dans l'application
function Living({ o, mock }: { o: Overview; mock: boolean }) {
  const tot = o.families.reduce((s, f) => s + (f.aum ?? 0), 0) || 1;
  const fams = FAMILY_ORDER.map((k) => o.families.find((f) => f.key === k)).filter(Boolean) as Overview["families"];
  return (
    <section className="living" aria-labelledby="h-living">
      <Rise><div className="eyebrow home__eyebrow">Dans cette application · au {fdate(o.date)}{mock ? " · données fictives" : ""}</div></Rise>
      <Rise><h2 className="home__h2" id="h-living">La maison, en un regard.</h2></Rise>
      <div className="living__mega num"><Money v={o.aum} big /></div>
      <Rise>
        <div className="living__facts">
          <div><b className="num">{o.n_funds}</b><span>fonds ouverts</span></div>
          <div><b className="num">{o.n_parts}</b><span>parts investies</span></div>
          <div><b className="num">4</b><span>familles de gestion</span></div>
        </div>
      </Rise>
      <div className="living__bar" role="img" aria-label={fams.map((f) => `${FAMILY_LABEL[f.key]} ${eur(f.aum)}`).join(", ")}>
        {fams.map((f) => <span key={f.key} style={{ flexGrow: (f.aum ?? 0) / tot, background: famVar(f.key, true) }} />)}
      </div>
      <ul className="living__legend">
        {fams.map((f) => (
          <li key={f.key}><Link to={`/selection?family=${f.key}`}><span className="dot" style={{ background: famVar(f.key, true) }} />{FAMILY_LABEL[f.key]}<span className="num">{eur(f.aum)}</span></Link></li>
        ))}
      </ul>
      <Rise><Link to="/encours" className="arrow-link">Explorer la ville des encours <I.Arrow size={16} /></Link></Rise>
    </section>
  );
}

// ------------------------------------------------------------------ utilitaires
/** Apparition au défilement (une fois), sans rien laisser invisible si l'animation est désactivée. */
function Rise({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const tw = gsap.fromTo(el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1, ease: "rco", paused: true });
    const st = ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => tw.play() });
    return () => { st.kill(); tw.revert(); };
  }, []);
  return <div ref={ref} className="rise">{children}</div>;
}

/** Grain de pellicule, très discret (cinéma), désactivé si l'utilisateur réduit les animations. */
function Grain() {
  return <div className="grain" aria-hidden="true" />;
}
