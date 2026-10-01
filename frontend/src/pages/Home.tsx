import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur } from "../lib/format";
import { FAMILY_LABEL, FAMILY_ORDER, famVar } from "../lib/families";
import { prefersReducedMotion, useReducedMotion } from "../lib/motion";
import { gsap, ScrollTrigger } from "../lib/gsap";
import type { Overview } from "../lib/types";
import { Board, Money, type BoardRow } from "../components/Story";
import type { FlowScene, Formation } from "../three/FlowScene";
import * as I from "../components/Icon";

/** Histoire de Rothschild & Co Asset Management (public/histoire/am.json : faits publics sourcés). */
type Stat = { value: string; unit: string; label: string };
type Chapter = { year: string; kicker: string; title: string; text: string; stat: Stat | null; source?: string };
type Figure = Stat & { source?: string };
type AmHistory = { chapters: Chapter[]; figures: Figure[]; principles: string[] };
type Dist = { countries: BoardRow[]; n_shares_registered: number };

const Y0 = 1982, Y1 = 2026;

/** Figure de la nuée pour un chapitre : le chiffre du chapitre, sinon une forme liée à son sujet. */
function formationOf(c: Chapter): Formation {
  const t = `${c.kicker} ${c.title}`;
  if (/quatre marques/i.test(t)) return { kind: "four" };
  if (/record|collecte/i.test(t) && /2023/.test(c.year)) return { kind: "bars" };
  if (c.stat) return { kind: "text", text: `${c.stat.value}${c.stat.unit ? ` ${c.stat.unit}` : ""}` };
  if (/datés|échéance/i.test(t)) return { kind: "rings" };
  if (/rapprochement|naissance de/i.test(t)) return { kind: "union" };
  if (/scission|dédiée|témoin/i.test(t)) return { kind: "split" };
  if (/4change|durable|net zero|climat|expansion/i.test(t)) return { kind: "globe" };
  if (/chantiers|eltif/i.test(t)) return { kind: "constellation" };
  if (/phare|valor/i.test(t)) return { kind: "ribbon" };
  return { kind: "core" };
}

export default function Home() {
  const { api, meta } = useApp();
  const [h, setH] = useState<AmHistory | null>(null);
  const ov = useApi<Overview>(api("/api/overview"));
  const dist = useApi<Dist>(api("/api/distribution"));
  const scene = useRef<FlowScene | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/histoire/am.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((j) => alive && setH(j)).catch(() => alive && setH(null));
    return () => { alive = false; };
  }, []);
  const o = ov.data;
  return (
    <div className="home">
      <Grain />
      <div className="am__stage">
        <Flow onReady={(s) => { scene.current = s; setReady(true); }} />
        <Overture scene={ready ? scene.current : null} />
        {h && h.chapters.length > 0 && <Film chapters={h.chapters} scene={ready ? scene.current : null} />}
      </div>
      {h && <Credits figures={h.figures} principles={h.principles} />}
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

// ------------------------------------------------------------------ nuée de particules (fond de l'ouverture et du film)
function Flow({ onReady }: { onReady: (s: FlowScene) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let s: FlowScene | null = null, alive = true;
    // WebGL indisponible : l'accueil reste lisible sans la nuée
    import("../three/FlowScene").then(({ FlowScene }) => {
      if (!alive) return;
      try {
        s = new FlowScene(el, { reduced });
        onReady(s);
      } catch { el.style.display = "none"; }
    });
    const io = new IntersectionObserver(([e]) => s?.setVisible(e.isIntersecting));
    io.observe(el);
    return () => { alive = false; io.disconnect(); s?.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
  return <div className="am__flow" aria-hidden="true"><canvas ref={ref} /></div>;
}

// ------------------------------------------------------------------ ouverture
function Overture({ scene }: { scene: FlowScene | null }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    scene?.set({ kind: "nebula" }, 3.4, 0);
    scene?.setZoom(34);
  }, [scene]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const chars = gsap.utils.toArray<HTMLElement>(".am__title .ch");
      const tl = gsap.timeline({ defaults: { ease: "rco" } });
      tl.from(".am__bars i", { scaleY: 0, duration: 1.2, ease: "power3.inOut" })
        .from(chars, { rotateX: -100, yPercent: 60, opacity: 0, z: -200, duration: 1.4, stagger: { each: 0.035, from: "center" } }, 0.35)
        .from(".am__span i", { scaleX: 0, duration: 1.4, ease: "power3.inOut" }, 0.9)
        .from(".am__span b", { opacity: 0, y: 10, duration: 0.8, stagger: 0.15 }, 1.2)
        .from(".am__ov .home__eyebrow, .am__sub, .home__cue", { opacity: 0, y: 14, filter: "blur(8px)", duration: 1, stagger: 0.12 }, 1.3);
      // Au défilement : les lettres se dispersent dans la profondeur, la nuée vient à nous
      const st = { trigger: el, start: "top top", end: "bottom top", scrub: 0.6 };
      gsap.to(chars, {
        x: () => gsap.utils.random(-700, 700), y: () => gsap.utils.random(-420, 420), z: () => gsap.utils.random(-600, 500),
        rotateX: () => gsap.utils.random(-180, 180), rotateY: () => gsap.utils.random(-180, 180), opacity: 0, ease: "power1.in",
        stagger: { each: 0.01, from: "random" }, scrollTrigger: st,
      });
      gsap.to(".am__ov .home__eyebrow, .am__sub, .am__span, .home__cue", { opacity: 0, y: -40, filter: "blur(10px)", ease: "none", scrollTrigger: st });
    }, el);
    return () => ctx.revert();
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || !scene || prefersReducedMotion()) return;
    const st = ScrollTrigger.create({ trigger: el, start: "top top", end: "bottom top", onUpdate: (s) => scene.setZoom(34 - s.progress * 16) });
    return () => st.kill();
  }, [scene]);
  const split = (s: string) => s.split("").map((c, i) => <span key={i} className="ch">{c === " " ? " " : c}</span>);
  return (
    <section className="am__ov" ref={ref} aria-labelledby="h-home">
      <div className="am__bars" aria-hidden="true"><i /><i /></div>
      <div className="am__ov-in">
        <div className="eyebrow home__eyebrow">Paris · 29 avenue de Messine · depuis {Y0}</div>
        <h1 className="am__title" id="h-home">
          <span className="am__l1">{split("Rothschild & Co")}</span>
          <span className="am__l2">{split("Asset Management")}</span>
        </h1>
        <div className="am__span num" aria-label={`De ${Y0} à ${Y1}`}><b>{Y0}</b><i /><b>{Y1}</b></div>
        <p className="am__sub">De Rothschild &amp; Cie Gestion à 50&nbsp;milliards d'euros d'encours&nbsp;: quarante ans de gestion de conviction, racontés en dix-huit plans.</p>
      </div>
      <div className="home__cue" aria-hidden="true"><span>Faire défiler</span><i /></div>
    </section>
  );
}

// ------------------------------------------------------------------ le film : un chapitre par plan
function Film({ chapters, scene }: { chapters: Chapter[]; scene: FlowScene | null }) {
  const pin = useRef<HTMLElement>(null);
  const stRef = useRef<ScrollTrigger | null>(null);
  const [cur, setCur] = useState(0);
  const [dir, setDir] = useState(1);
  const [active, setActive] = useState(false);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const reduced = useReducedMotion();
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 900);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 900);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const linear = reduced || narrow;
  const N = chapters.length;

  // Plans épinglés : le défilement fait avancer le film, chapitre par chapitre
  useEffect(() => {
    const el = pin.current;
    if (!el || linear) return;
    const st = ScrollTrigger.create({
      trigger: el, start: "top top", end: () => `+=${N * window.innerHeight * 0.75}`, pin: true, anticipatePin: 1,
      // Le film ne pilote la nuée que pendant ses plans ; en remontant, l'ouverture retrouve sa galaxie
      onToggle: (s) => setActive(s.isActive || s.progress >= 1),
      onLeaveBack: () => { sceneRef.current?.set({ kind: "nebula" }, 2.4, 0); },
      onUpdate: (s) => {
        const i = Math.min(N - 1, Math.floor(s.progress * N));
        setCur((p) => { if (p !== i) setDir(i > p ? 1 : -1); return i; });
      },
    });
    stRef.current = st;
    return () => { st.kill(); stRef.current = null; };
  }, [N, linear]);

  // Mode linéaire (mobile, animations réduites) : chaque chapitre donne sa figure en entrant à l'écran
  useEffect(() => {
    const el = pin.current;
    if (!el || !linear) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setCur(Number((e.target as HTMLElement).dataset.i)); }), { rootMargin: "-45% 0px -45% 0px" });
    el.querySelectorAll(".am__lin").forEach((x) => io.observe(x));
    return () => io.disconnect();
  }, [linear, N]);

  useEffect(() => { if (linear) setActive(true); }, [linear]);
  useEffect(() => {
    if (!scene || !chapters[cur] || !active) return;
    scene.set(formationOf(chapters[cur]), 2.1, linear ? 0 : 7.5);
    scene.setZoom(linear ? 40 : 31);
  }, [cur, scene, chapters, linear, active]);

  const jump = (i: number) => {
    const st = stRef.current;
    if (!st) return;
    window.scrollTo({ top: st.start + ((i + 0.5) / N) * (st.end - st.start), behavior: "smooth" });
  };
  const c = chapters[cur];
  if (linear) {
    return (
      <section className="am__film am__film--linear" ref={pin} aria-labelledby="h-film">
        <div className="eyebrow home__eyebrow">L'histoire · {Y0} – {Y1}</div>
        <h2 className="home__h2" id="h-film">Une société de gestion de conviction.</h2>
        <ol className="am__list">
          {chapters.map((x, i) => (
            <li key={i} className="am__lin" data-i={i}>
              <div className="am__lin-y num">{x.year}</div>
              <div className="eyebrow home__eyebrow">{x.kicker}</div>
              <h3 className="am__t">{x.title}</h3>
              <p className="am__p">{x.text}</p>
              {x.stat && <div className="am__stat"><b className="num">{x.stat.value}</b><span>{x.stat.unit}</span><em>{x.stat.label}</em></div>}
              {x.source && <a className="am__src small" href={x.source} target="_blank" rel="noreferrer noopener">Source <I.Arrow size={12} /></a>}
            </li>
          ))}
        </ol>
      </section>
    );
  }
  return (
    <section className="am__film" ref={pin} aria-labelledby="h-film" aria-roledescription="récit">
      <h2 className="sr-only" id="h-film">L'histoire de Rothschild &amp; Co Asset Management, de {Y0} à {Y1}</h2>
      <Marquee text={c.kicker} />
      <div className="am__leak" key={`leak-${cur}`} aria-hidden="true" />
      <div className="am__reel" aria-hidden="true">
        <span className="num">{String(cur + 1).padStart(2, "0")}</span><i /><span className="num">{String(N).padStart(2, "0")}</span>
      </div>
      <div className="am__year num" aria-hidden="true"><Odometer value={c.year} /></div>
      <Scene key={cur} c={c} dir={dir} />
      <ol className="am__time" aria-label="Chapitres">
        {chapters.map((x, i) => {
          const dup = chapters.slice(0, i).filter((y) => y.year === x.year).length;
          const left = ((parseInt(x.year, 10) - Y0) / (Y1 - Y0)) * 100 + dup * 0.9;
          return (
            <li key={i} style={{ left: `${Math.min(100, left)}%` }} className={i === cur ? "is-on" : i < cur ? "is-past" : ""}>
              <button type="button" onClick={() => jump(i)} aria-label={`${x.year} — ${x.title}`} aria-current={i === cur ? "step" : undefined} />
            </li>
          );
        })}
        <span className="am__time-l" style={{ left: 0 }}>{Y0}</span>
        <span className="am__time-l" style={{ left: `${((2017 - Y0) / (Y1 - Y0)) * 100}%` }}>2017</span>
        <span className="am__time-l" style={{ right: 0 }}>{Y1}</span>
        <i className="am__head" style={{ left: `${((parseInt(c.year, 10) - Y0) / (Y1 - Y0)) * 100}%` }} />
      </ol>
    </section>
  );
}

/** Le plan d'un chapitre : titre qui monte derrière un masque, texte qui sort du flou, chiffre qui défile. */
function Scene({ c, dir }: { c: Chapter; dir: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "rco" } });
      tl.from(".am__k", { opacity: 0, x: -30 * dir, duration: 0.7 })
        .from(".am__t .w", { yPercent: 110 * dir, rotate: 4 * dir, duration: 1, stagger: 0.04 }, 0.05)
        .from(".am__p", { opacity: 0, filter: "blur(14px)", y: 16 * dir, duration: 1.1 }, 0.3)
        .from(".am__stat", { opacity: 0, scale: 0.9, duration: 0.9 }, 0.45)
        .from(".am__src", { opacity: 0, duration: 0.6 }, 0.8);
      const num = el.querySelector<HTMLElement>(".am__stat b");
      if (num && c.stat) {
        const target = parseFloat(c.stat.value.replace(",", "."));
        const dec = c.stat.value.includes(",") ? 1 : 0;
        const o = { v: 0 };
        tl.to(o, { v: target, duration: 1.6, ease: "expo.out", onUpdate: () => { num.textContent = o.v.toFixed(dec).replace(".", ","); } }, 0.45);
      }
    }, el);
    return () => ctx.revert();
  }, [c, dir]);
  return (
    <div className="am__scene" ref={ref}>
      <div className="eyebrow home__eyebrow am__k">{c.kicker}</div>
      <h3 className="am__t">{c.title.split(" ").map((w, i) => <Fragment key={i}><span className="am__wm"><span className="w">{w}</span></span>{" "}</Fragment>)}</h3>
      <p className="am__p">{c.text}</p>
      {c.stat && <div className="am__stat"><b className="num">{c.stat.value}</b><span>{c.stat.unit}</span><em>{c.stat.label}</em></div>}
      {c.source && <a className="am__src small" href={c.source} target="_blank" rel="noreferrer noopener">Source <I.Arrow size={12} /></a>}
    </div>
  );
}

/** Année en compteur mécanique : chaque chiffre roule jusqu'au suivant, avec flou de mouvement. */
function Odometer({ value }: { value: string }) {
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    setRolling(true);
    const t = window.setTimeout(() => setRolling(false), 1000);
    return () => window.clearTimeout(t);
  }, [value]);
  return (
    <span className={`odo${rolling ? " is-rolling" : ""}`}>
      {value.split("").map((d, i) => (/\d/.test(d) ? (
        <span key={i} className="odo__col">
          <span className="odo__w">{d}</span>
          <span className="odo__strip" style={{ transform: `translateY(${-Number(d) * 10}%)`, transitionDelay: `${i * 80}ms` }}>
            {Array.from({ length: 10 }, (_, k) => <span key={k}>{k}</span>)}
          </span>
        </span>
      ) : <span key={i}>{d}</span>))}
    </span>
  );
}

/** Mot du chapitre en très grand, au trait, qui glisse lentement derrière le plan. */
function Marquee({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  const [out, setOut] = useState(false);
  useEffect(() => {
    if (text === shown) return;
    setOut(true);
    const t = window.setTimeout(() => { setShown(text); setOut(false); }, 380);
    return () => window.clearTimeout(t);
  }, [text, shown]);
  const line = `${shown} · `.repeat(4);
  return <div className={`am__mq${out ? " is-out" : ""}`} aria-hidden="true"><div className="am__mq-in"><span>{line}</span><span>{line}</span></div></div>;
}

// ------------------------------------------------------------------ générique : chiffres et principes
function Credits({ figures, principles }: { figures: Figure[]; principles: string[] }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      // Principes : les mots s'allument au fil du défilement
      gsap.utils.toArray<HTMLElement>(".am__pr").forEach((p) => {
        gsap.fromTo(p.querySelectorAll(".w"), { opacity: 0.12 }, { opacity: 1, stagger: 0.05, ease: "none",
          scrollTrigger: { trigger: p, start: "top 85%", end: "bottom 45%", scrub: true } });
      });
      gsap.from(".am__fig", { yPercent: 30, opacity: 0, stagger: 0.12, duration: 1.2, scrollTrigger: { trigger: ".am__figs", start: "top 80%", once: true } });
    }, el);
    return () => ctx.revert();
  }, [figures.length, principles.length]);
  return (
    <section className="am__credits" ref={ref} aria-labelledby="h-credits">
      <Rise><div className="eyebrow home__eyebrow">Rothschild &amp; Co Asset Management aujourd'hui</div></Rise>
      <Rise><h2 className="home__h2" id="h-credits">Une maison de convictions, à l'échelle européenne.</h2></Rise>
      <div className="am__figs">
        {figures.map((f) => <Counter key={f.label} f={f} />)}
      </div>
      <div className="am__prs">
        {principles.map((p, i) => (
          <p key={i} className="am__pr"><span className="am__pr-n num">{String(i + 1).padStart(2, "0")}</span>{p.split(" ").map((w, k) => <span key={k} className="w">{w} </span>)}</p>
        ))}
      </div>
      <p className="today__src small">Faits et chiffres publics communiqués par Rothschild &amp; Co Asset Management et la presse spécialisée (sources citées à chaque chapitre). Les chiffres de l'application, ci-dessous, sont calculés sur ses propres données.</p>
    </section>
  );
}

function Counter({ f }: { f: Figure }) {
  const ref = useRef<HTMLSpanElement>(null);
  const target = parseFloat(f.value.replace(",", "."));
  const dec = f.value.includes(",") ? 1 : 0;
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !Number.isFinite(target)) return;
    const o = { x: 0 };
    el.textContent = "0";
    const tw = gsap.to(o, { x: target, duration: 2.2, ease: "expo.out", paused: true, onUpdate: () => { el.textContent = o.x.toFixed(dec).replace(".", ","); } });
    const st = ScrollTrigger.create({ trigger: el, start: "top 85%", once: true, onEnter: () => tw.play() });
    return () => { st.kill(); tw.kill(); el.textContent = f.value; };
  }, [target, dec, f.value]);
  return (
    <div className="am__fig">
      <div className="am__fig-v num"><span ref={ref}>{f.value}</span><span className="am__fig-u">{f.unit}</span></div>
      <div className="am__fig-l">{f.label}</div>
      {f.source && <a className="am__src small" href={f.source} target="_blank" rel="noreferrer noopener">Source <I.Arrow size={12} /></a>}
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
