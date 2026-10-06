/**
 * Passif — première vue : qui est investi dans quoi. Les premiers clients par encours (Montant EUR à la date de la photo),
 * et pour le client choisi ses fonds puis ses parts, avec les encours. Vue nominative demandée par l'équipe : calculée à la
 * demande dans la source, jamais conservée par l'application ni journalisée.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/context";
import { eur, num, plural } from "../lib/format";
import { gsap } from "../lib/gsap";
import { prefersReducedMotion } from "../lib/motion";
import type { ExportCol } from "../lib/xlsx";
import { ExportButton } from "./ExportDialog";
import * as I from "./Icon";
import { dFull, fp } from "./PassifKit";

type BookShare = { isin: string | null; share: string | null; encours: number; positions: number };
type BookFund = { fund: string | null; name: string | null; linked: boolean; encours: number; pct_of_client: number | null; shares: BookShare[] };
type BookClient = { client: string; encours: number; positions: number; n_funds: number; funds: BookFund[] };
export type BookResp = { available: boolean; reason?: string; as_of?: string; clients?: BookClient[]; shown_encours?: number; total?: number | null };

type Flat = { rang: number; client: string; client_encours: number; fonds: string; fonds_id: string | null; part: string; isin: string | null; encours: number; pct_client: number; positions: number };
const FLAT_COLS: ExportCol<Flat>[] = [
  { key: "rang", label: "Rang du client", kind: "int", group: "Client", desc: "Rang du client par encours décroissant à la date de la photo." },
  { key: "client", label: "Client", group: "Client", desc: "Nom client de la table Position." },
  { key: "client_encours", label: "Encours du client (EUR)", kind: "eur", group: "Client", desc: "Somme de Montant EUR du client, toutes parts." },
  { key: "fonds", label: "Fonds", group: "Fonds et part", desc: "Fonds du référentiel rattaché par l'ISIN de la part." },
  { key: "fonds_id", label: "Identifiant fonds", kind: "code", group: "Fonds et part" },
  { key: "part", label: "Part", group: "Fonds et part" },
  { key: "isin", label: "ISIN", kind: "code", group: "Fonds et part" },
  { key: "encours", label: "Encours de la ligne (EUR)", kind: "eur", sum: true, group: "Mesures", desc: "Somme de Montant EUR du client sur cette part." },
  { key: "pct_client", label: "Part de l'encours du client", kind: "pct", group: "Mesures" },
  { key: "positions", label: "Positions", kind: "int", sum: true, group: "Mesures", desc: "Nombre de lignes de position." },
];

const TOPS = [60, 150, 300];

export function BookSection({ asOf, source }: { asOf?: string | null; source?: string }) {
  const { api } = useApp();
  const [top, setTop] = useState(60);
  const { data, loading } = useApi<BookResp>(api(`/api/passif/carnet?top=${top}`));
  const [last, setLast] = useState<BookResp | null>(null);
  useEffect(() => { if (data) setLast(data); }, [data]);
  const d = data ?? last;
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const clients = d?.clients ?? [];
  const shown = useMemo(() => {
    const f = q.trim().toLowerCase();
    return clients.map((c, i) => ({ c, rank: i + 1 })).filter(({ c }) => !f || c.client.toLowerCase().includes(f)
      || c.funds.some((x) => (x.name ?? "").toLowerCase().includes(f) || x.shares.some((s) => (s.isin ?? "").toLowerCase().includes(f))));
  }, [clients, q]);
  const cur = clients.find((c) => c.client === sel) ?? shown[0]?.c ?? null;
  const max = clients[0]?.encours || 1;
  const flat = useMemo<Flat[]>(() => clients.flatMap((c, i) => c.funds.flatMap((f) => f.shares.map((s) => ({
    rang: i + 1, client: c.client, client_encours: c.encours, fonds: f.name ?? (f.linked ? f.fund ?? "" : "Non rattaché au référentiel"), fonds_id: f.fund,
    part: s.share ?? "", isin: s.isin, encours: s.encours, pct_client: c.encours ? s.encours / c.encours : 0, positions: s.positions,
  })))), [clients]);

  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.timeline({ defaults: { ease: "expo.out" } })
        .fromTo(".pb__title span", { yPercent: 105 }, { yPercent: 0, duration: 1, stagger: 0.07 }, 0)
        .fromTo(".pb__lede, .pb__tools", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, clearProps: "transform" }, 0.3);
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section className="pb" ref={ref} aria-labelledby="h-carnet" id="carnet">
      <div className="pb__in">
        <div className="eyebrow pa-hero__eyebrow">Passif · au {dFull(d?.as_of ?? asOf)}{source === "synthétique" ? " · données synthétiques" : " · Fabric"}</div>
        <h1 className="pb__title" id="h-carnet"><span>Qui est investi</span> <span>dans quoi.</span></h1>
        <p className="pb__lede">Les clients par encours décroissant, puis leurs fonds et leurs parts. Encours&nbsp;: somme de Montant EUR à la date de la photo.</p>
        <div className="pb__tools">
          <label className="pb__search">
            <I.Search size={16} />
            <input type="search" placeholder="Client, fonds ou ISIN…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrer les clients" />
          </label>
          <div className="seg" role="radiogroup" aria-label="Nombre de clients">
            {TOPS.map((t) => <button key={t} type="button" role="radio" className="seg__b" aria-checked={top === t} onClick={() => setTop(t)}>{t} premiers</button>)}
          </div>
          {flat.length > 0 && (
            <ExportButton id="passif-carnet" title="Qui est investi dans quoi" filename={`passif-clients-fonds-parts-${d?.as_of ?? ""}.xlsx`}
              rows={flat} columns={FLAT_COLS} shown={FLAT_COLS.map((c) => c.key)} essential={["client", "fonds", "part", "isin", "encours"]}
              context={[{ label: "Date de la photo", value: dFull(d?.as_of) }, { label: "Clients", value: `${clients.length} premiers par encours` }]} />
          )}
        </div>
        <p className="pa-cli__warn small"><I.Alert size={15} /> Données nominatives, usage interne : calculées à la demande dans la source, jamais conservées par l'application.</p>

        {!d ? <div className="pb__empty small muted">{loading ? "Calcul du carnet des clients…" : "—"}</div>
          : !d.available ? <div className="pb__empty small">{d.reason ?? "Vue indisponible."}</div>
          : clients.length === 0 ? <div className="pb__empty small muted">Aucun client à la date de la photo.</div> : (
          <div className="pb__g">
            <ol className="pb__list" aria-label="Clients par encours décroissant">
              {shown.map(({ c, rank }) => (
                <li key={c.client}>
                  <button type="button" className={`pb__row${cur?.client === c.client ? " is-on" : ""}`} aria-pressed={cur?.client === c.client} onClick={() => setSel(c.client)}>
                    <span className="pb__rk num">{String(rank).padStart(2, "0")}</span>
                    <span className="pb__nm">{c.client}<span className="pb__fs small">{c.funds.filter((f) => f.linked).slice(0, 2).map((f) => f.name ?? f.fund).join(" · ")}{c.n_funds > 2 ? ` · +${c.n_funds - 2}` : ""}</span></span>
                    <span className="pb__v num">{eur(c.encours)}</span>
                    <span className="pb__bar" aria-hidden="true"><i style={{ width: `${(c.encours / max) * 100}%` }} /></span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="small muted pb__none">Aucun client ne correspond.</li>}
            </ol>
            {cur && <ClientDetail c={cur} rank={clients.indexOf(cur) + 1} />}
          </div>
        )}
        {d?.available && clients.length > 0 && (
          <p className="small muted pb__foot">{plural(clients.length, "client")} affichés · {eur(d.shown_encours)}{d.total ? ` sur ${eur(d.total)} d'encours suivi au passif (${fp((100 * (d.shown_encours ?? 0)) / d.total)})` : ""}.</p>
        )}
      </div>
    </section>
  );
}

function ClientDetail({ c, rank }: { c: BookClient; rank: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".pb__fund", { opacity: 0, x: 14 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.035, ease: "power3.out", clearProps: "transform" });
      gsap.fromTo(".pb__fbar i", { scaleX: 0 }, { scaleX: 1, duration: 0.8, stagger: 0.035, ease: "expo.out", transformOrigin: "left center" });
    }, el);
    return () => ctx.revert();
  }, [c.client]);
  const linked = c.funds.filter((f) => f.linked);
  return (
    <div className="pb__d" ref={ref} aria-live="polite">
      <div className="pb__dh">
        <div>
          <div className="eyebrow">Client n° {rank}</div>
          <h2 className="pb__dn">{c.client}</h2>
        </div>
        <dl className="pb__k">
          <div><dt>Encours</dt><dd className="num">{eur(c.encours)}</dd></div>
          <div><dt>Fonds</dt><dd className="num">{num(linked.length)}</dd></div>
          <div><dt>Positions</dt><dd className="num">{num(c.positions)}</dd></div>
        </dl>
      </div>
      <div className="pb__strip" aria-hidden="true">
        {c.funds.map((f, i) => <i key={i} style={{ flexGrow: Math.max(0.002, f.encours), opacity: f.linked ? 1 - Math.min(0.7, i * 0.08) : 0.25 }} />)}
      </div>
      <table className="t pb__t">
        <caption className="sr-only">Fonds et parts de {c.client}</caption>
        <thead><tr><th scope="col">Fonds · part</th><th scope="col">ISIN</th><th scope="col" className="n">Encours</th><th scope="col" className="n">Part du client</th></tr></thead>
        {c.funds.map((f, i) => (
          <tbody key={i} className="pb__fund">
            <tr className="pb__fr">
              <th scope="rowgroup">
                {f.linked && f.fund ? <Link className="pb__fl" to={`/fonds/${encodeURIComponent(f.fund)}`}>{f.name ?? f.fund}</Link> : <span className="muted">Parts non rattachées au référentiel</span>}
              </th>
              <td className="small muted">{plural(f.shares.length, "part")}</td>
              <td className="n num"><b>{eur(f.encours)}</b></td>
              <td className="n"><span className="pb__fbar" aria-hidden="true"><i style={{ width: `${f.pct_of_client ?? 0}%` }} /></span><span className="num">{fp(f.pct_of_client)}</span></td>
            </tr>
            {f.shares.map((s, k) => (
              <tr key={k} className="pb__sr">
                <td>{s.share ?? <span className="muted">Part sans libellé</span>}</td>
                <td><code>{s.isin ?? "—"}</code></td>
                <td className="n num">{eur(s.encours)}</td>
                <td className="n num small muted">{fp(c.encours ? (100 * s.encours) / c.encours : null)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
