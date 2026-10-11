/**
 * Démo — les commerciaux. Les trois côte à côte sur la période choisie, puis l'un d'eux en détail : sa collecte par zone
 * et par pays (1 mois, 3 mois, YTD, 1 an), mois par mois, les fonds achetés et vendus par ses clients, l'encours de ses
 * clients par zone, et la liste de ses clients avec ce dans quoi ils sont investis. Vue nominative (passif).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchJson } from "../../lib/api";
import { useApp } from "../../lib/context";
import { date as fdate, eur, pctRaw } from "../../lib/format";
import { Flag } from "../Flag";
import { Loading } from "../ui";
import { ClientTable, Kpi, NameMatch, PeriodTabs, signed, SplitRows, tone, TwinBars, type Opt } from "./kit";
import type { HoldZone, Match, SalesView } from "./types";

type P = "1M" | "3M" | "YTD" | "1A";
export const SALES_PERIODS: Opt<P>[] = [{ key: "1M", label: "1 mois" }, { key: "3M", label: "3 mois" }, { key: "YTD", label: "YTD" }, { key: "1A", label: "1 an" }];
const LONG: Record<P, string> = { "1M": "sur un mois", "3M": "sur trois mois", YTD: "depuis le 1er janvier", "1A": "sur un an" };

function useMany<T>(urls: string[]): { data: (T | null)[]; loading: boolean } {
  const [state, setState] = useState<{ data: (T | null)[]; loading: boolean }>({ data: urls.map(() => null), loading: true });
  const key = urls.join("|");
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    Promise.all(urls.map((u) => fetchJson<T>(u).catch(() => null))).then((data) => { if (alive) setState({ data, loading: false }); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

export function Sales({ index, people }: { index: number; people: { name: string; match: Match }[] }) {
  const { api } = useApp();
  const urls = useMemo(() => people.map((p) => api(`/api/demo/commercial?nom=${encodeURIComponent(p.match.found ?? p.name)}`)), [people, api]);
  const { data, loading } = useMany<SalesView>(urls);
  const [p, setP] = useState<P>("3M");
  const [i, setI] = useState(0);
  const cur = data[i];
  const names = people.map((x, k) => data[k]?.match?.found ?? x.match.found ?? x.name);
  return (
    <section className="dm-chap" id="commerciaux" aria-labelledby="h-commerciaux">
      <header className="dm-chap__head">
        <span className="dm-chap__num" aria-hidden="true">{String(index).padStart(2, "0")}</span>
        <div className="dm-chap__title">
          <div className="eyebrow dm-eyebrow">Commerciaux · passif</div>
          <h2 className="dm-chap__name" id="h-commerciaux">{names.join(", ").replace(/, ([^,]*)$/, " et $1")}</h2>
          <p className="dm-chap__lede">La collecte de leurs clients, zone par zone, et ce dans quoi ces clients sont investis. Souscriptions et rachats lus dans la table Transaction (statuts retenus), encours dans la table Position.</p>
        </div>
        <PeriodTabs value={p} onChange={setP} options={SALES_PERIODS} />
      </header>
      {loading && !cur ? <Loading h={480} /> : (
        <>
          <div className="dm-trio" role="tablist" aria-label="Choisir un commercial">
            {people.map((x, k) => {
              const v = data[k];
              const f = v?.available ? v.periods[p] : null;
              const max = Math.max(1, ...data.map((d) => (d?.available ? Math.max(d.periods[p]?.subscriptions ?? 0, d.periods[p]?.redemptions ?? 0) : 0)));
              return (
                <button key={x.name} type="button" role="tab" aria-selected={i === k} className={`dm-trio__c${i === k ? " is-on" : ""}`} onClick={() => setI(k)}>
                  <span className="dm-trio__n">{names[k]}</span>
                  {!v?.available ? <span className="small muted">{v?.reason ?? "Introuvable dans le passif."}</span> : (
                    <>
                      <b className={`dm-trio__v num ${(f?.net ?? 0) >= 0 ? "up-t" : "down-t"}`}>{signed(f?.net)}</b>
                      <span className="dm-trio__bars" aria-hidden="true">
                        <span className="dm-trio__out"><i style={{ width: `${((f?.redemptions ?? 0) / max) * 100}%` }} /></span>
                        <span className="dm-trio__in"><i style={{ width: `${((f?.subscriptions ?? 0) / max) * 100}%` }} /></span>
                      </span>
                      <span className="dm-trio__s small">{eur(f?.subscriptions)} souscrits · {eur(f?.redemptions)} rachetés</span>
                      <span className="dm-trio__s small muted">{v.clients_count} clients · {eur(v.encours)} d'encours</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          {cur?.match && <NameMatch match={cur.match} source="la colonne Commercial du passif" />}
          {cur?.available ? <SalesDetail v={cur} p={p} /> : <div className="empty">{cur?.reason ?? "Commercial introuvable dans le passif."}</div>}
        </>
      )}
    </section>
  );
}

function SalesDetail({ v, p }: { v: SalesView; p: P }) {
  const f = v.periods[p];
  if (!v.flows_available || !f) return <div className="empty">Transactions du passif non publiées.</div>;
  return (
    <div className="dm-grid">
      <dl className="dm-kpis dm-kpis--wide dm-span-12">
        <Kpi label="Souscriptions" value={eur(f.subscriptions)} sub={`${f.n.toLocaleString("fr-FR")} opérations`} />
        <Kpi label="Rachats" value={eur(f.redemptions)} />
        <Kpi label="Collecte nette" value={signed(f.net)} tone={tone(f.net)} sub={`${LONG[p]}, depuis le ${fdate(f.start)}`} />
        <Kpi label="Clients actifs" value={f.clients.toLocaleString("fr-FR")} sub="au moins une opération" />
        <Kpi label="Encours des clients" value={eur(v.encours)} sub={`au ${fdate(v.as_of)} · ${v.clients_count} clients`} />
      </dl>
      <article className="dm-card dm-span-7">
        <div className="dm-card__head"><div><div className="eyebrow">Collecte par zone · {LONG[p]}</div><h3 className="dm-h3">Où ses clients investissent et désinvestissent</h3></div></div>
        <SplitRows rows={f.zones ?? []} expandable />
        <p className="small muted dm-note">Cliquez une zone pour le détail par pays. Pays du compte porteur.</p>
      </article>
      <article className="dm-card dm-span-5">
        <div className="dm-card__head"><div><div className="eyebrow">Mois par mois</div><h3 className="dm-h3">Souscriptions et rachats, 13 mois</h3></div></div>
        <TwinBars months={v.monthly} height={270} />
      </article>
      <article className="dm-card dm-span-5">
        <div className="dm-card__head"><div><div className="eyebrow">Encours de ses clients · par zone</div><h3 className="dm-h3">{eur(v.encours)}</h3></div></div>
        <HoldZones zones={v.holdings_zones} />
      </article>
      <article className="dm-card dm-span-7">
        <div className="dm-card__head"><div><div className="eyebrow">Fonds · {LONG[p]}</div><h3 className="dm-h3">Ce que ses clients achètent et vendent</h3></div></div>
        <SplitRows rows={(f.funds ?? []).map((x) => ({ ...x, key: x.name }))}
          label={(r) => { const fx = (f.funds ?? []).find((y) => y.name === r.key); return fx?.fund ? <Link to={`/fonds/${encodeURIComponent(fx.fund)}`}>{r.key}</Link> : r.key; }} />
      </article>
      <article className="dm-card dm-span-12">
        <div className="dm-card__head"><div><div className="eyebrow">Ses clients · au {fdate(v.as_of)}</div><h3 className="dm-h3">Qui est investi dans quoi</h3></div>
          <ul className="dm-segs">{v.segments.map((s) => <li key={s.segment}><span>{s.segment}</span><b className="num">{pctRaw(s.pct, 0)}</b></li>)}</ul></div>
        <ClientTable clients={v.clients} />
      </article>
    </div>
  );
}

export function HoldZones({ zones }: { zones: HoldZone[] }) {
  const [open, setOpen] = useState<string | null>(zones[0]?.zone ?? null);
  const max = Math.max(1, ...zones.map((z) => z.encours));
  if (!zones.length) return <div className="empty small">Aucune position.</div>;
  return (
    <div className="dm-hz">
      {zones.map((z) => (
        <div key={z.zone} className={`dm-zl${open === z.zone ? " is-open" : ""}`}>
          <button type="button" className="dm-zl__btn" onClick={() => setOpen(open === z.zone ? null : z.zone)} aria-expanded={open === z.zone}>
            <span className="dm-zl__name">{z.zone}</span>
            <span className="dm-zl__track" aria-hidden="true"><span className="dm-zl__bar is-gold" style={{ width: `${(z.encours / max) * 100}%` }} /></span>
            <b className="num">{eur(z.encours)}</b><span className="num muted">{pctRaw(z.pct, 1)}</span>
          </button>
          {open === z.zone && (
            <ul className="dm-zl__countries">
              {z.countries.map((c) => <li key={c.country}><span>{c.iso && <Flag iso={c.iso} className="dm-flag" />}{c.country}</span><span className="num">{eur(c.encours)}</span><span className="num muted">{c.clients} client{(c.clients ?? 0) > 1 ? "s" : ""}</span></li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
