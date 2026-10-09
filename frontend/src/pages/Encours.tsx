import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { date as fdate, eur, eurParts, pct, plural } from "../lib/format";
import { CATEGORICAL, OTHER, famVar } from "../lib/families";
import type { Breakdown, CityData, FamilyKey, Group, Overview } from "../lib/types";
import { FAMILY_LABEL, FAMILY_ORDER, FAMILY_SHORT, famHex } from "../lib/families";
import { monthYear } from "../lib/format";
import { useReducedMotion, webglAvailable } from "../lib/motion";
import { Equation, Money } from "../components/Story";
import type { CityScene as CitySceneT } from "../three/CityScene";
import { Delta, ErrorState, Loading, useReveal } from "../components/ui";
import { Sparkline, StackedArea } from "../components/charts";
import { Mosaic, divColor, DivLegend } from "../components/viz";
import { Head, PageHero } from "../components/Editorial";
import { AumCurve } from "../components/AumCurve";
import * as I from "../components/Icon";

const AXES: { key: string; label: string; group: "Fonds" | "Parts" }[] = [
  { key: "family", label: "Famille de gestion", group: "Fonds" }, { key: "range", label: "Gamme", group: "Fonds" },
  { key: "asset_class", label: "Classe d'actifs", group: "Fonds" }, { key: "expertise", label: "Expertise", group: "Fonds" },
  { key: "manager", label: "Gérant", group: "Fonds" }, { key: "sfdr", label: "SFDR", group: "Fonds" }, { key: "sri", label: "SRI", group: "Fonds" },
  { key: "domicile", label: "Domicile", group: "Fonds" }, { key: "legal_form", label: "Forme juridique", group: "Fonds" }, { key: "currency", label: "Devise du fonds", group: "Fonds" },
  { key: "share_ccy", label: "Devise de part", group: "Parts" }, { key: "distribution", label: "Capi. / distri.", group: "Parts" },
  { key: "investor", label: "Souscripteurs", group: "Parts" }, { key: "hedged", label: "Couverture de change", group: "Parts" },
];

/** Montant signé découpé pour les grands chiffres : { value: "+2,98", unit: "Md€" }. */
function signed(v: number | null | undefined) {
  const s = eur(v, { signed: true });
  const i = s.lastIndexOf("\u202f");
  return { value: i < 0 ? s : s.slice(0, i), unit: i < 0 ? "" : s.slice(i + 1), aria: s };
}

export default function Encours() {
  const [params, setParams] = useSearchParams();
  const axis = params.get("axe") ?? "family";
  const { api } = useApp();
  const { data, error } = useApi<Breakdown>(api(`/api/breakdown/${axis}`));
  const ov = useApi<Overview>(api("/api/overview"));
  const nav = useNavigate();
  useReveal(data);
  // La couleur suit le groupe (famille : sa couleur ; sinon, les 5 premiers groupes par encours, puis « Autres »)
  const colorFor = (g: { key: string }, i: number) => (axis === "family" ? famVar(g.key) : i < CATEGORICAL.length ? CATEGORICAL[i] : OTHER);
  const open = (key: string) => {
    if (!data?.filterable || key === "Non renseigné") return;
    nav(`/selection?${new URLSearchParams({ [axis]: key }).toString()}`);
  };
  const o = ov.data;
  const p = o ? eurParts(o.aum) : null;
  if (error) return <div className="page"><ErrorState error={error} /></div>;
  const ax = AXES.find((a) => a.key === axis);
  return (
    <div className="enc">
      <CitySection />
      <div className="enc__part" id="analyse">
        <div className="enc__pn num" aria-hidden="true">II</div>
        <div><div className="eyebrow">Deuxième partie</div><div className="enc__pt">L'analyse</div></div>
      </div>
      <PageHero
        eyebrow={<>Encours de la maison{o && <> · au {fdate(o.date)}</>}</>}
        title="Où sont nos encours ?"
        lede={<>Choisissez un angle&nbsp;: la répartition, la variation depuis le 1er janvier et sa décomposition (collecte nette estimée, effet marché) se recalculent. Chaque groupe ouvre la liste de ses fonds.</>}
        figures={o && p ? [
          { label: "Encours sous gestion", value: p.value, unit: p.unit, aria: eur(o.aum) },
          { label: "Variation depuis le 1er janvier", value: pct(o.var.YTD?.pct).replace(/\s%$/, ""), unit: "%" },
          { label: "Collecte nette estimée", ...signed(o.var.YTD?.flows), sub: "souscriptions − rachats" },
          { label: "Effet marché", ...signed(o.var.YTD?.market), sub: "VL et changes" },
        ] : undefined}
      />
      <div className="page enc__curve">
        <section className="section reveal" aria-labelledby="h-courbe">
          <AumCurve families head={{ id: "courbe", eyebrow: "La courbe des encours", title: "L'encours, du jour à l'année",
            lede: <>Un point par jour, semaine, mois, trimestre ou année&nbsp;: chaque point est la dernière valeur connue de sa période, jamais une moyenne. Sous la courbe, la <b className="gold-t">collecte nette estimée</b> de chaque période. En vue Total, l'axe des encours ne part pas de zéro&nbsp;: sa première graduation est indiquée en or.</> }} />
        </section>
      </div>
      <nav className="axbar" aria-label="Répartir les encours par">
        <div className="axbar__in" role="radiogroup" aria-label="Angle de lecture">
          {(["Fonds", "Parts"] as const).map((grp) => (
            <div key={grp} className="axbar__g">
              <span className="axbar__l">{grp === "Fonds" ? "Le fonds" : "La part"}</span>
              {AXES.filter((a) => a.group === grp).map((a) => (
                <button key={a.key} type="button" role="radio" aria-checked={axis === a.key} className="axbar__b" onClick={() => setParams({ axe: a.key }, { replace: true })}>{a.label}</button>
              ))}
            </div>
          ))}
        </div>
      </nav>
      {!data ? <div className="page"><Loading h={480} /></div> : (
        <div className="page enc__page">
          {o?.var.YTD && (
            <section className="section reveal enc__eq" aria-labelledby="h-eq">
              <Head id="eq" eyebrow="Depuis le 1er janvier" title="D'où vient la croissance ?"
                lede="Encours de départ, collecte nette estimée (souscriptions − rachats), effet marché (VL et changes) : l'équation de l'année." />
              <Equation v={o.var.YTD} end={o.date} />
            </section>
          )}
          <section className="section reveal" aria-labelledby="h-mos">
            <Head id="mos" eyebrow={`Par ${ax?.label.toLowerCase() ?? ""}`} title="Le classement des encours"
              lede={axis === "family" ? "Surface : encours. Couleur : la famille de gestion." : "Surface : encours. Couleur : variation depuis le 1er janvier, du rouge (baisse) au bleu (hausse)."}
              right={axis !== "family" ? <DivLegend span={0.25} label="Variation YTD" /> : undefined} />
            <Mosaic height={440} onSelect={(g) => open(g.key)}
              items={data.groups.map((g, i) => ({ key: g.key, label: g.label, value: g.aum, color: axis === "family" ? colorFor(g, i) : divColor(g.var.YTD?.pct, 0.25),
                sub: `${g.n_funds != null ? plural(g.n_funds, "fonds", "fonds") + " · " : ""}${pct(g.weight, { signed: false, digits: 1 })} des encours`, badge: <>YTD {pct(g.var.YTD?.pct)}</> }))} />
          </section>
          <section className="section reveal" aria-labelledby="h-grp">
            <Head id="grp" eyebrow="Groupe par groupe" title={"D'où vient la variation\u00a0?"}
              lede={<>Pour chaque groupe&nbsp;: poids, variation depuis le 1er janvier, et sa décomposition entre <b className="gold-t">collecte nette estimée</b> et <b className="blue-t">effet marché</b>. {data.filterable ? "Cliquez un groupe pour la liste des fonds." : "Répartition au niveau des parts : un fonds peut apparaître dans plusieurs groupes."}</>} />
            <GroupList groups={data.groups} colorFor={colorFor} onOpen={data.filterable ? open : undefined} />
          </section>
          <section className="section reveal" aria-labelledby="h-time">
            <TimeSection data={data} colorFor={colorFor} />
          </section>
        </div>
      )}
    </div>
  );
}

function GroupList({ groups, colorFor, onOpen }: { groups: Group[]; colorFor: (g: Group, i: number) => string; onOpen?: (k: string) => void }) {
  const maxW = Math.max(1e-9, ...groups.map((g) => g.weight ?? 0));
  const maxAbs = Math.max(1, ...groups.flatMap((g) => [Math.abs(g.var.YTD?.flows ?? 0), Math.abs(g.var.YTD?.market ?? 0)]));
  const half = (v: number | null | undefined, cls: string) => {
    const x = v ?? 0;
    const w = (Math.abs(x) / maxAbs) * 50;
    return <span className={`gl__half ${cls}${x < 0 ? " is-neg" : ""}`} style={{ left: x >= 0 ? "50%" : `${50 - w}%`, width: `${w}%` }} />;
  };
  return (
    <ol className="gl" role="list">
      <li className="gl__hd" aria-hidden="true"><span /><span>Groupe</span><span>Poids</span><span className="n">Encours</span><span className="n">YTD</span><span>Collecte · marché</span><span>24 mois</span></li>
      {groups.map((g, i) => {
        const clickable = !!onOpen && g.key !== "Non renseigné";
        const Tag = clickable ? "button" : "div";
        return (
          <li key={g.key}>
            <Tag {...(clickable ? { type: "button" as const, onClick: () => onOpen!(g.key) } : {})} className={`gl__row${clickable ? " is-click" : ""}`}>
              <span className="gl__i num">{String(i + 1).padStart(2, "0")}</span>
              <span className="gl__n"><span className="dot" style={{ background: colorFor(g, i) }} /><span><span className="gl__t">{g.label}</span>{g.n_funds != null && <span className="gl__s small">{plural(g.n_funds, "fonds", "fonds")}</span>}</span></span>
              <span className="gl__w"><span className="gl__wb"><span style={{ width: `${((g.weight ?? 0) / maxW) * 100}%`, background: colorFor(g, i) }} /></span><span className="small num">{pct(g.weight, { signed: false, digits: 1 })}</span></span>
              <span className="gl__v num">{eur(g.aum)}</span>
              <span className="gl__d n"><Delta v={g.var.YTD?.pct} /></span>
              <span className="gl__fm" aria-label={`Collecte nette estimée ${eur(g.var.YTD?.flows, { signed: true })}, effet marché ${eur(g.var.YTD?.market, { signed: true })}`}>
                <span className="gl__axis">{half(g.var.YTD?.flows, "is-flow")}</span>
                <span className="gl__axis">{half(g.var.YTD?.market, "is-mkt")}</span>
                <span className="gl__fmv small num"><span className="gold-t">{eur(g.var.YTD?.flows, { signed: true })}</span> · <span className="blue-t">{eur(g.var.YTD?.market, { signed: true })}</span></span>
              </span>
              <span className="gl__sp"><Sparkline points={g.series.slice(-24)} color={colorFor(g, i)} width={120} height={34} /></span>
              {clickable && <I.Arrow size={16} className="gl__go" />}
            </Tag>
          </li>
        );
      })}
    </ol>
  );
}

function TimeSection({ data, colorFor }: { data: Breakdown; colorFor: (g: Group, i: number) => string }) {
  const [mode, setMode] = useState<"abs" | "rel">("abs");
  const layers = useMemo(() => {
    const top = data.groups.slice(0, 5);
    const rest = data.groups.slice(5);
    const months = top[0]?.series.map((p) => p.d) ?? [];
    const L = top.map((g, i) => ({ key: g.key, label: g.label, color: colorFor(g, i), points: g.series }));
    if (rest.length) L.push({ key: "__other", label: `Autres (${rest.length})`, color: OTHER, points: months.map((d) => ({ d, v: rest.reduce((s, g) => s + (g.series.find((p) => p.d === d)?.v ?? 0), 0) })) });
    if (mode === "rel") {
      const tot = months.map((_, j) => L.reduce((s, l) => s + (l.points[j]?.v ?? 0), 0) || 1);
      L.forEach((l) => { l.points = l.points.map((p, j) => ({ d: p.d, v: p.v / tot[j] })); });
    }
    return L.reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mode]);
  return (
    <>
      <Head id="time" eyebrow="Dans le temps" title="Comment la répartition a évolué"
        lede={mode === "abs" ? "Encours mensuels empilés : les cinq premiers groupes et les autres réunis." : "Poids de chaque groupe dans le total, mois par mois."}
        right={<div className="seg" role="radiogroup" aria-label="Échelle">
          <button type="button" role="radio" aria-checked={mode === "abs"} className="seg__b" onClick={() => setMode("abs")}>Montants</button>
          <button type="button" role="radio" aria-checked={mode === "rel"} className="seg__b" onClick={() => setMode("rel")}>Poids relatifs</button>
        </div>} />
      <div className="legend" style={{ marginBottom: 10 }}>{[...layers].reverse().map((l) => <span key={l.key} className="legend__i"><span className="dot" style={{ background: l.color }} />{l.label}</span>)}</div>
      <StackedArea layers={layers} height={380} ariaLabel={`Évolution des encours par ${data.label.toLowerCase()}`} format={mode === "rel" ? (v: number) => pct(v, { signed: false, digits: 0 }) : undefined} />
    </>
  );
}


// ------------------------------------------------------------------ I — la ville des encours
/** Première partie : la ville, un immeuble par fonds, interactive (rotation, survol, clic) et rejouable mois par mois. */
function CitySection() {
  const { api } = useApp();
  const city = useApi<CityData>(api("/api/city"));
  const ov = useApi<Overview>(api("/api/overview"));
  const nav = useNavigate();
  const reduced = useReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<CitySceneT | null>(null);
  const [gl] = useState(() => webglAvailable());
  const [month, setMonth] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [fam, setFam] = useState<FamilyKey | null>(null);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const data = city.data;
  const last = data ? data.months.length - 1 : 0;
  const mi = month ?? last;

  useEffect(() => {
    if (!data || !host.current || !labels.current || !gl) return;
    let alive = true;
    import("../three/CityScene").then(({ CityScene }) => {
      if (!alive || !host.current || !labels.current) return;
      const colors = Object.fromEntries((["aid", "ae", "fi", "ao", "nc"] as FamilyKey[]).map((k) => [k, { day: famHex(k), night: famHex(k, true) }]));
      scene.current = new CityScene(host.current, {
        funds: data.funds, monthIndex: data.months.length - 1, reduced, colors,
        familyLabels: FAMILY_SHORT, labelLayer: labels.current, formatAum: eur,
        onHover: (f, x, y) => setTip(f ? { id: f.id, x, y } : null),
        onSelect: (f) => nav(`/fonds/${encodeURIComponent(f.id)}`),
      });
    });
    return () => { alive = false; scene.current?.dispose(); scene.current = null; };
  }, [data, reduced, gl, nav]);
  useEffect(() => { scene.current?.setMonth(mi); }, [mi]);
  useEffect(() => { scene.current?.setFocus(fam); }, [fam]);
  // Lecture : la ville rejoue ses quatre ans, un mois toutes les 140 ms
  useEffect(() => {
    if (!playing || !data) return;
    let i = month == null || month >= last ? 0 : month;
    setMonth(i);
    const t = window.setInterval(() => {
      i += 1;
      if (i > last) { window.clearInterval(t); setPlaying(false); setMonth(null); return; }
      setMonth(i);
    }, 140);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const total = data ? data.funds.reduce((s, f) => s + (f.series[mi] ?? 0), 0) : null;
  const tipFund = tip && data?.funds.find((f) => f.id === tip.id);
  return (
    <section className="ecity" aria-labelledby="h-city">
      <div className="ecity__stage">
        <div className="ecity__canvas" ref={host} />
        <div className="city__labels ecity__labels" ref={labels} aria-hidden="true" />
        {!gl && <div className="pano__fallback" aria-hidden="true" />}
        {tipFund && (
          <div className="city__tip" style={{ transform: `translate(-50%, -100%) translate(${tip!.x}px, ${tip!.y - 14}px)` }} role="status">
            <div className="city__tip-f"><span className="dot" style={{ background: famHex(tipFund.family, true) }} />{FAMILY_LABEL[tipFund.family]}</div>
            <div className="city__tip-n">{tipFund.name}</div>
            <div className="city__tip-v num">{eur(tipFund.series[mi])}</div>
            <div className="city__tip-go small">Cliquer pour ouvrir la fiche</div>
          </div>
        )}
      </div>
      <div className="ecity__ov">
        <div className="enc__part enc__part--in">
          <div className="enc__pn num" aria-hidden="true">I</div>
          <div><div className="eyebrow">Première partie</div><div className="enc__pt" id="h-city">La ville des encours</div></div>
        </div>
        <p className="ecity__lede">Chaque immeuble est un fonds, son volume est proportionnel à son encours. Faites pivoter la ville, survolez un immeuble, cliquez pour ouvrir sa fiche.</p>
        <div className="ecity__big num">{total != null && <Money v={month == null && ov.data ? ov.data.aum : total} live />}</div>
        <div className="ecity__when">{data ? (month == null ? <>au {ov.data ? fdate(ov.data.date) : ""}</> : <>fin {monthYear(data.months[mi], true)}</>) : null}</div>
        <div className="ecity__fams" role="group" aria-label="Mettre en avant une famille de gestion">
          <button type="button" className="chip" aria-pressed={!fam} onClick={() => setFam(null)}>Toute la maison</button>
          {FAMILY_ORDER.map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={fam === k} onClick={() => setFam(fam === k ? null : k)}>
              <span className="dot" style={{ background: famHex(k, true) }} />{FAMILY_SHORT[k]}
            </button>
          ))}
        </div>
      </div>
      {data && (
        <div className="ecity__time">
          <button type="button" className="ecity__play" onClick={() => setPlaying((p) => !p)} aria-pressed={playing} aria-label={playing ? "Arrêter la lecture" : "Rejouer l'évolution des encours"}>
            {playing ? <span className="ecity__pause" aria-hidden="true"><i /><i /></span> : <span className="ecity__tri" aria-hidden="true" />}
          </button>
          <span className="small num">{monthYear(data.months[0], true)}</span>
          <input type="range" min={0} max={last} value={mi} onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setMonth(v >= last ? null : v); }}
            aria-label="Mois affiché" aria-valuetext={monthYear(data.months[mi], true)} style={{ ["--p" as string]: `${(mi / Math.max(1, last)) * 100}%` }} />
          <span className="small num">{monthYear(data.months[last], true)}</span>
          <a href="#analyse" className="ecity__down small" onClick={(e) => { e.preventDefault(); document.getElementById("analyse")?.scrollIntoView({ behavior: "smooth" }); }}>L'analyse <I.Arrow size={13} /></a>
        </div>
      )}
    </section>
  );
}
