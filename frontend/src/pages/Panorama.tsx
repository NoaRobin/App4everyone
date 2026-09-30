import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, eurParts, monthYear, pct, plural } from "../lib/format";
import { FAMILY_LABEL, FAMILY_ORDER, FAMILY_SHORT, famHex, famVar } from "../lib/families";
import { prefersReducedMotion, useReducedMotion, webglAvailable } from "../lib/motion";
import { gsap, ScrollTrigger } from "../lib/gsap";
import type { CityData, FamilyKey, Overview } from "../lib/types";
import { Delta, useReveal } from "../components/ui";
import { Sparkline } from "../components/charts";
import * as I from "../components/Icon";
import type { CityScene as CitySceneT, Shot } from "../three/CityScene";

type Dist = { countries: { country: string; iso: string; n_shares: number; n_funds: number; aum_registered: number }[]; n_shares_registered: number };

/** Les chapitres du récit. `h` = hauteur en vh : c'est aussi l'unité de la frise de caméra. */
const CHAPTERS: { key: string; h: number; label: string }[] = [
  { key: "maison", h: 100, label: "La maison" },
  { key: "temps", h: 240, label: "Quatre ans" },
  { key: "aid", h: 105, label: "Actions int. & diversifiée" },
  { key: "ae", h: 105, label: "Actions européennes" },
  { key: "fi", h: 105, label: "Fixed Income" },
  { key: "ao", h: 105, label: "Architecture ouverte" },
  { key: "croissance", h: 115, label: "La croissance" },
  { key: "monde", h: 115, label: "Le monde" },
  { key: "fin", h: 100, label: "Explorer" },
];
const STARTS = CHAPTERS.reduce<number[]>((a, _c, i) => (a.push(i ? a[i - 1] + CHAPTERS[i - 1].h : 0), a), []);
const TOTAL = STARTS[STARTS.length - 1] + CHAPTERS[CHAPTERS.length - 1].h - 100;
const T = CHAPTERS.findIndex((c) => c.key === "temps");

export default function Panorama() {
  const { api } = useApp();
  const ov = useApi<Overview>(api("/api/overview"));
  const city = useApi<CityData>(api("/api/city"));
  const dist = useApi<Dist>(api("/api/distribution"));
  const reduced = useReducedMotion();
  const nav = useNavigate();
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const story = useRef<HTMLDivElement>(null);
  const prog = useRef<HTMLDivElement>(null);
  const scene = useRef<CitySceneT | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);
  const [month, setMonth] = useState<number | null>(null);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const [gl] = useState(() => webglAvailable());
  const data = city.data;
  const last = data ? data.months.length - 1 : 0;
  const mi = month ?? last;
  useReveal(ov.data && data ? 1 : null);

  // La ville, en mode récit
  useEffect(() => {
    if (!data || !host.current || !labels.current || !gl) return;
    let alive = true;
    import("../three/CityScene").then(({ CityScene }) => {
      if (!alive || !host.current || !labels.current) return;
      const colors = Object.fromEntries((["aid", "ae", "fi", "ao", "nc"] as FamilyKey[]).map((k) => [k, { day: famHex(k), night: famHex(k, true) }]));
      scene.current = new CityScene(host.current, {
        funds: data.funds, monthIndex: data.months.length - 1, reduced, colors, story: true,
        familyLabels: FAMILY_SHORT, labelLayer: labels.current, formatAum: eur,
        onHover: (f, x, y) => setTip(f ? { id: f.id, x, y } : null),
        onSelect: (f) => nav(`/fonds/${encodeURIComponent(f.id)}`),
      });
      setReady(true);
    });
    return () => { alive = false; setReady(false); scene.current?.dispose(); scene.current = null; };
  }, [data, reduced, gl, nav]);

  // La frise : défilement → caméra, chapitre actif, mois de la ville
  useEffect(() => {
    const el = story.current;
    if (!el || !data) return;
    const sc = scene.current;
    const shots = sc?.shots();
    const shotOf = (key: string): Shot | undefined => {
      if (!shots) return undefined;
      const turn = (s: Shot, a: number, k = 1) => sc!.orbit(s, a, k);
      if (key === "maison") return shots.home;
      if (key === "temps") return turn(shots.home, -0.55, 0.92);
      if (key === "croissance") return shots.high;
      if (key === "monde") return shots.low;
      if (key === "fin") return turn(shots.home, 0.7, 1.05);
      return shots.fam[key] ?? shots.home;
    };
    const list = CHAPTERS.map((c) => shotOf(c.key));
    let cur = -1;
    const onScroll = (s: number) => {
      let a = 0;
      STARTS.forEach((t, i) => { if (s >= t - 45) a = i; });
      if (a !== cur) {
        cur = a;
        setActive(a);
        const k = CHAPTERS[a].key;
        sc?.setFocus(FAMILY_ORDER.includes(k as FamilyKey) ? k : null);
        if (prefersReducedMotion() && list[a]) sc?.cut(list[a]!);
      }
      if (!prefersReducedMotion()) {
        const t0 = STARTS[T] - 30, t1 = STARTS[T] + CHAPTERS[T].h - 110;
        if (s < t0 || s > t1 + 8) setMonth(null);
        else setMonth(Math.round(Math.min(1, Math.max(0, (s - t0) / (t1 - t0))) * last));
      }
      if (s > 4) sc?.endIntro();
    };
    const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });
    if (sc && !prefersReducedMotion()) {
      const rig = sc.rig;
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1]!, b = list[i]!;
        const at = STARTS[i] - 82, d = 76;
        tl.fromTo(rig.pos, { x: a.pos.x, y: a.pos.y, z: a.pos.z }, { x: b.pos.x, y: b.pos.y, z: b.pos.z, duration: d, immediateRender: false }, at);
        tl.fromTo(rig.target, { x: a.target.x, y: a.target.y, z: a.target.z }, { x: b.target.x, y: b.target.y, z: b.target.z, duration: d, immediateRender: false }, at);
      }
    }
    tl.set({}, {}, TOTAL);
    const st = ScrollTrigger.create({
      trigger: el, start: "top top", end: "bottom bottom", animation: tl, scrub: prefersReducedMotion() ? false : 1.1,
      onUpdate: (self) => {
        onScroll(self.progress * TOTAL);
        if (prog.current) prog.current.style.transform = `scaleX(${self.progress})`;
      },
    });
    onScroll(st.progress * TOTAL);
    return () => { st.kill(); tl.kill(); };
  }, [data, ready, last]);

  useEffect(() => { scene.current?.setMonth(mi); }, [mi]);

  const goTo = (i: number) => {
    const top = (story.current?.getBoundingClientRect().top ?? 0) + window.scrollY + (STARTS[i] / 100) * window.innerHeight + 2;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const o = ov.data;
  const fams = useMemo(() => (o ? FAMILY_ORDER.map((k) => o.families.find((f) => f.key === k)).filter(Boolean) as Overview["families"] : []), [o]);
  const totalAt = data ? data.funds.reduce((s, f) => s + (f.series[mi] ?? 0), 0) : null;
  const tipFund = tip && data?.funds.find((f) => f.id === tip.id);

  return (
    <div className={`pano${active ? " is-moving" : ""}`} data-chapter={CHAPTERS[active].key}>
      <div className="pano__stage" aria-hidden={!gl}>
        <div className="pano__city" ref={host} />
        <div className="city__labels pano__labels" ref={labels} aria-hidden="true" />
        <div className="pano__scrim" aria-hidden="true" />
        {!gl && <div className="pano__fallback" aria-hidden="true" />}
        {tipFund && (
          <div className="city__tip" style={{ transform: tip!.y < 260 ? `translate(-50%, 0) translate(${tip!.x}px, ${tip!.y + 40}px)` : `translate(-50%, -100%) translate(${tip!.x}px, ${tip!.y - 14}px)` }} role="status">
            <div className="city__tip-f"><span className="dot" style={{ background: famVar(tipFund.family, true) }} />{FAMILY_LABEL[tipFund.family]}</div>
            <div className="city__tip-n">{tipFund.name}</div>
            <div className="city__tip-v num">{eur(tipFund.series[mi])}</div>
            <div className="city__tip-go small">Cliquer pour ouvrir la fiche</div>
          </div>
        )}
      </div>
      {/* Hors de #contenu : la transition de page le transforme, ce qui décalerait ces éléments fixes */}
      {createPortal(<>
      <div className="pano__prog" aria-hidden="true"><div ref={prog} /></div>
      <nav className="pano__rail" aria-label="Chapitres du panorama">
        <ol>
          {CHAPTERS.map((c, i) => (
            <li key={c.key}>
              <button type="button" className={i === active ? "is-on" : ""} aria-current={i === active ? "step" : undefined} onClick={() => goTo(i)}
                style={FAMILY_ORDER.includes(c.key as FamilyKey) ? { ["--rc" as string]: famVar(c.key, true) } : undefined}>
                <span className="pano__rail-n num">{String(i + 1).padStart(2, "0")}</span>
                <span className="pano__rail-l">{c.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      </>, document.body)}

      <div className="pano__story" ref={story}>
        {/* 01 — La maison */}
        <Chapter i={0}>
          <div className="eyebrow pano__eyebrow">Rothschild &amp; Co Asset Management{o && <> · au {fdate(o.date)}</>}</div>
          <h1 className="pano__h1 hero-title">Encours sous gestion</h1>
          <div className="pano__mega num" aria-live="off">{o ? <Money v={o.aum} big immediate /> : <span className="skeleton" style={{ display: "inline-block", width: "6ch", height: "1em" }} />}</div>
          {o && (
            <div className="pano__facts" data-a="">
              <Fact v={String(o.n_funds)} l="fonds ouverts" />
              <Fact v={String(o.n_parts)} l="parts investies" />
              <Fact v="4" l="familles de gestion" />
              <Fact v={<Delta v={o.var.YTD?.pct} />} l="depuis le 1er janvier" />
            </div>
          )}
          <p className="pano__lede" data-a="">Chaque immeuble est un fonds, son volume est proportionnel à son encours. Faites défiler&nbsp;: la ville raconte la maison.</p>
          <div className="pano__cue" aria-hidden="true"><span /></div>
        </Chapter>

        {/* 02 — Quatre ans */}
        <Chapter i={1} sticky>
          <div className="eyebrow pano__eyebrow">Quatre ans d'histoire</div>
          <h2 className="pano__h2 motion-title">La ville a grandi, mois après mois.</h2>
          {data && o && (
            <>
              <div className="pano__year num" aria-hidden="true">{monthYear(data.months[mi], true)}</div>
              <div className="pano__big num"><Money v={month == null ? o.aum : totalAt} live /></div>
              <div className="pano__track" aria-hidden="true"><span style={{ transform: `scaleX(${mi / Math.max(1, last)})` }} /></div>
              <p className="pano__lede">
                {eur(data.funds.reduce((s, f) => s + (f.series[0] ?? 0), 0))} à fin {monthYear(data.months[0], true)}, {eur(o.aum)} aujourd'hui&nbsp;:
                {" "}{pct(o.aum / Math.max(1, data.funds.reduce((s, f) => s + (f.series[0] ?? 0), 0)) - 1)} en {Math.round(last / 12)} ans.
              </p>
              <div className="pano__spark" data-a=""><Sparkline points={o.series} color="var(--gold)" width={420} height={70} /></div>
            </>
          )}
        </Chapter>

        {/* 03–06 — Les quatre familles */}
        {fams.map((f, k) => {
          const top = (data?.funds ?? []).filter((x) => x.family === f.key).sort((a, b) => b.aum - a.aum).slice(0, 3);
          return (
            <Chapter key={f.key} i={2 + k} fam={f.key}>
              <div className="eyebrow pano__eyebrow"><span className="pano__fnum num">{String(k + 1).padStart(2, "0")}/04</span> Famille de gestion</div>
              <h2 className="pano__h2 pano__fam motion-title">{FAMILY_LABEL[f.key]}</h2>
              <div className="pano__big num"><Money v={f.aum} /></div>
              <div className="pano__share" data-a="">
                <span className="pano__share-bar"><span style={{ ["--w" as string]: `${(f.aum / (o?.aum || 1)) * 100}%` }} /></span>
                <span className="small"><b className="num">{pct(f.aum / (o?.aum || 1), { signed: false, digits: 0 })}</b> des encours de la maison</span>
              </div>
              <dl className="pano__kv" data-a="">
                <div><dt>Fonds</dt><dd className="num">{f.n_funds}</dd></div>
                <div><dt>Variation YTD</dt><dd><Delta v={f.var.YTD?.pct} /></dd></div>
                <div><dt>Collecte YTD</dt><dd><Delta v={f.var.YTD?.flows} kind="eur" /></dd></div>
              </dl>
              <ol className="pano__top" data-a="">
                {top.map((t, j) => (
                  <li key={t.id}>
                    <Link to={`/fonds/${encodeURIComponent(t.id)}`} onMouseEnter={() => scene.current?.highlight(t.id)} onMouseLeave={() => scene.current?.highlight(null)}
                      onFocus={() => scene.current?.highlight(t.id)} onBlur={() => scene.current?.highlight(null)}>
                      <span className="pano__top-r num">{j + 1}</span><span className="pano__top-n">{t.name}</span><span className="pano__top-v num">{eur(t.aum)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
              <Link to={`/selection?family=${f.key}`} className="arrow-link" data-a="">Voir les {f.n_funds} fonds <I.Arrow size={16} /></Link>
            </Chapter>
          );
        })}

        {/* 07 — La croissance */}
        <Chapter i={6}>
          <div className="eyebrow pano__eyebrow">Depuis le 1er janvier</div>
          <h2 className="pano__h2 motion-title">D'où vient la croissance&nbsp;?</h2>
          {o?.var.YTD && <Equation v={o.var.YTD} end={o.date} />}
          {o && (
            <div className="pano__movers" data-a="">
              <div className="eyebrow">Plus fortes collectes</div>
              <ol>{o.top_inflows.slice(0, 3).map((r) => (
                <li key={r.id}><Link to={`/fonds/${encodeURIComponent(r.id)}`}><span className="dot" style={{ background: famVar(r.family, true) }} />{r.name}<Delta v={r.flows_YTD} kind="eur" /></Link></li>
              ))}</ol>
            </div>
          )}
        </Chapter>

        {/* 08 — Le monde */}
        <Chapter i={7} wide>
          <div className="eyebrow pano__eyebrow">Distribution</div>
          <h2 className="pano__h2 motion-title">{dist.data ? <>Commercialisés dans {dist.data.countries.length}&nbsp;pays.</> : "Commercialisés dans le monde."}</h2>
          {dist.data && <Board rows={[...dist.data.countries].sort((a, b) => b.n_shares - a.n_shares).slice(0, 9)} />}
          {dist.data && <p className="pano__lede" data-a="">{dist.data.n_shares_registered} parts disposent d'au moins un enregistrement actif. <Link className="link" to="/distribution">Voir tous les pays</Link></p>}
        </Chapter>

        {/* 09 — Explorer */}
        <Chapter i={8} center>
          <div className="eyebrow pano__eyebrow">Espace métiers</div>
          <h2 className="pano__h1 motion-title">Chaque fonds, dans le détail.</h2>
          <p className="pano__lede" data-a="">Fiches, parts, performances, portefeuilles, pays d'enregistrement, contrôles&nbsp;: tout est à une recherche.</p>
          <div className="pano__cta" data-a="">
            <Link to="/metiers" className="btn btn--gold btn--lg">Entrer dans l'espace métiers <I.Arrow size={18} /></Link>
            <Link to="/fonds" className="btn btn--ghost btn--lg"><I.Search size={18} /> Rechercher un fonds</Link>
          </div>
        </Chapter>
      </div>
    </div>
  );
}

function Chapter({ i, children, sticky, fam, wide, center }: { i: number; children: ReactNode; sticky?: boolean; fam?: string; wide?: boolean; center?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const c = CHAPTERS[i];
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const items = el.querySelectorAll("[data-a], .pano__big, .pano__eyebrow");
    const tw = gsap.fromTo(items, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.07, ease: "rco", paused: true });
    const st = ScrollTrigger.create({ trigger: el, start: "top 62%", onEnter: () => tw.play(), onLeaveBack: () => tw.reverse() });
    return () => { st.kill(); tw.revert(); };
  }, []);
  return (
    <section ref={ref} className={`chap chap--${c.key}${sticky ? " chap--sticky" : ""}${wide ? " chap--wide" : ""}${center ? " chap--center" : ""}`}
      style={{ ["--h" as string]: c.h, ...(fam ? { ["--fc" as string]: famVar(fam, true) } : {}) }} aria-label={`${String(i + 1).padStart(2, "0")} — ${c.label}`} id={`chapitre-${c.key}`}>
      <div className="chap__panel">{children}</div>
    </section>
  );
}

function Fact({ v, l }: { v: ReactNode; l: string }) {
  return <div className="pano__fact"><div className="pano__fact-v num">{v}</div><div className="pano__fact-l">{l}</div></div>;
}

/**
 * Montant qui se compte jusqu'à sa valeur quand il entre à l'écran (dans l'unité finale : pas de saut M€ → Md€).
 * `live` : suit la valeur en continu (frise des quatre ans). Accessible : l'étiquette porte la valeur exacte.
 */
function Money({ v, big, immediate, live }: { v: number | null | undefined; big?: boolean; immediate?: boolean; live?: boolean }) {
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
function Equation({ v, end }: { v: NonNullable<Overview["var"][string]>; end: string }) {
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

/** Tableau à palettes (façon hall de gare) : les pays de commercialisation s'affichent lettre à lettre. */
function Board({ rows }: { rows: Dist["countries"] }) {
  const ref = useRef<HTMLTableElement>(null);
  const W = Math.max(8, ...rows.map((r) => r.country.length));
  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "." : s.padEnd(n, " "));
  const up = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const cells = Array.from(el.querySelectorAll<HTMLElement>(".flap"));
    const run = () => cells.forEach((c, k) => {
      const fin = c.dataset.c ?? " ";
      if (fin === " ") return;
      const o = { t: 0 };
      const n = 6 + ((k * 7) % 9);
      gsap.to(o, { t: n, duration: 0.05 * n, delay: (k % 40) * 0.012 + Math.floor(k / 40) * 0.08, ease: "none",
        onUpdate: () => { const i = Math.floor(o.t); c.textContent = i >= n ? fin : FLAP_CHARS[(k * 13 + i * 5) % FLAP_CHARS.length]; },
        onComplete: () => { c.textContent = fin; gsap.fromTo(c, { scaleY: 0.82 }, { scaleY: 1, duration: 0.25, ease: "back.out(3)" }); } });
    });
    const st = ScrollTrigger.create({ trigger: el, start: "top 78%", once: true, onEnter: run });
    return () => st.kill();
  }, [rows]);
  const cells = (s: string) => s.split("").map((ch, i) => <span key={i} className="flap" data-c={ch}>{ch}</span>);
  return (
    <table className="board" ref={ref} data-a="">
      <caption className="sr-only">Pays de commercialisation, classés par nombre de parts enregistrées</caption>
      <thead><tr><th scope="col">Pays</th><th scope="col">Code</th><th scope="col" className="n">Fonds</th><th scope="col" className="n">Parts</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.iso}>
            <th scope="row"><Link to={`/distribution/${encodeURIComponent(r.country)}`} aria-label={r.country}><span aria-hidden="true">{cells(pad(up(r.country), W))}</span></Link></th>
            <td><span aria-hidden="true">{cells(pad(r.iso, 2))}</span><span className="sr-only">{r.iso}</span></td>
            <td className="n"><span aria-hidden="true">{cells(String(r.n_funds).padStart(2, " "))}</span><span className="sr-only">{plural(r.n_funds, "fonds", "fonds")}</span></td>
            <td className="n"><span aria-hidden="true">{cells(String(r.n_shares).padStart(3, " "))}</span><span className="sr-only">{plural(r.n_shares, "part")}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
