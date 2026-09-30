import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { eur, nav as fnav, pct, pctRaw } from "../lib/format";
import type { ShareBrief } from "../lib/types";
import { CopyCode, Stars } from "./ui";

type F = { investor: string | null; ccy: string | null; distribution: string | null };

/**
 * « Quelle part proposer ? » : bande de répartition de l'encours par part, filtres métier,
 * cartes comparatives (la part aux frais les plus bas parmi celles qui conviennent est signalée).
 */
export function ShareChooser({ shares, fundAum }: { shares: ShareBrief[]; fundAum: number | null }) {
  const nav = useNavigate();
  const [f, setF] = useState<F>({ investor: null, ccy: null, distribution: null });
  const [hover, setHover] = useState<string | null>(null);
  const opts = useMemo(() => ({
    investor: [...new Set(shares.map((s) => s.investor).filter(Boolean) as string[])],
    ccy: [...new Set(shares.map((s) => s.ccy).filter(Boolean) as string[])],
    distribution: [...new Set(shares.map((s) => s.distribution).filter(Boolean) as string[])],
  }), [shares]);
  const ok = (s: ShareBrief) => (!f.investor || s.investor === f.investor) && (!f.ccy || s.ccy === f.ccy) && (!f.distribution || s.distribution === f.distribution);
  const matching = shares.filter(ok);
  const cheapest = matching.filter((s) => s.ongoing != null).sort((a, b) => (a.ongoing ?? 99) - (b.ongoing ?? 99))[0]?.id;
  const ordered = [...matching, ...shares.filter((s) => !ok(s))];
  const total = fundAum || shares.reduce((a, s) => a + (s.aum ?? 0), 0) || 1;
  const group = (key: keyof F, label: string) => opts[key].length > 1 && (
    <div className="chooser__g" role="group" aria-label={label}>
      <span className="eyebrow">{label}</span>
      <button type="button" className="chip" aria-pressed={!f[key]} onClick={() => setF({ ...f, [key]: null })}>Toutes</button>
      {opts[key].map((o) => <button key={o} type="button" className="chip" aria-pressed={f[key] === o} onClick={() => setF({ ...f, [key]: f[key] === o ? null : o })}>{o}</button>)}
    </div>
  );
  return (
    <div className="chooser">
      <div className="strip" role="img" aria-label="Répartition de l'encours du fonds par part">
        {shares.filter((s) => (s.aum ?? 0) > 0).map((s) => {
          const w = ((s.aum ?? 0) / total) * 100;
          return (
            <Link key={s.id} to={`/parts/${encodeURIComponent(s.id)}`} className={`strip__s${hover === s.id ? " is-hover" : ""}${ok(s) ? "" : " is-off"}`} style={{ flexGrow: w }}
              onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)} title={`${s.name} : ${eur(s.aum)} (${pct(w / 100, { signed: false, digits: 0 })})`}>
              {w > 7 && <><span className="strip__c">{s.class ?? s.name}</span><span className="strip__v num">{pct(w / 100, { signed: false, digits: 0 })}</span></>}
            </Link>
          );
        })}
      </div>
      <div className="chooser__filters">
        {group("investor", "Pour quel client")}
        {group("ccy", "Devise")}
        {group("distribution", "Revenus")}
        <span className="chooser__count small">{matching.length === shares.length ? `${shares.length} parts` : `${matching.length} part${matching.length > 1 ? "s" : ""} sur ${shares.length} conviennent`}</span>
      </div>
      <div className="shares">
        {ordered.map((s) => {
          const good = ok(s);
          return (
            <article key={s.id} className={`sharecard${good ? "" : " is-off"}${hover === s.id ? " is-hover" : ""}`} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)}
              onClick={() => nav(`/parts/${encodeURIComponent(s.id)}`)}>
              <header className="sharecard__h">
                <span className="sharecard__class">{s.class ?? "—"}</span>
                <span className="sharecard__badges">
                  {s.main && <span className="tag tag--s">principale</span>}
                  {good && s.id === cheapest && matching.length > 1 && <span className="tag tag--s tag--gold">frais les plus bas</span>}
                  {s.link === "isin" && <span className="tag tag--s tag--warn">via ISIN</span>}
                  {s.link === "none" && <span className="tag tag--s tag--warn">hors référentiel</span>}
                </span>
              </header>
              <Link to={`/parts/${encodeURIComponent(s.id)}`} className="sharecard__n" onClick={(e) => e.stopPropagation()}>{s.name}</Link>
              <div onClick={(e) => e.stopPropagation()}><CopyCode code={s.isin} /></div>
              <dl className="sharecard__kv">
                <div><dt>Frais courants</dt><dd className="num">{s.ongoing != null ? pctRaw(s.ongoing) : "—"}</dd></div>
                <div><dt>Minimum</dt><dd className="num">{s.min_sub ? eur(s.min_sub) : "1 part"}</dd></div>
                <div><dt>Devise</dt><dd>{s.ccy ?? "—"}{s.hedged ? " couverte" : ""}</dd></div>
                <div><dt>Revenus</dt><dd>{s.distribution ?? "—"}</dd></div>
                <div><dt>Cut-off</dt><dd className="num">{s.cutoff ?? "—"}{s.settlement ? ` · ${s.settlement}` : ""}</dd></div>
                <div><dt>Surperformance</dt><dd>{s.perf_fee == null ? "—" : s.perf_fee ? "Oui" : "Non"}</dd></div>
                <div><dt>Morningstar</dt><dd><Stars n={s.rating} /></dd></div>
                <div><dt>VL</dt><dd className="num">{fnav(s.nav, s.ccy)}</dd></div>
              </dl>
              <footer className="sharecard__f">
                <span className="eyebrow">Encours</span>
                <b className="sharecard__aum num">{eur(s.aum)}</b>
                <span className="small muted">{fundAum && s.aum ? `${pct(s.aum / total, { signed: false, digits: 0 })} du fonds` : ""}</span>
              </footer>
              <span className="sharecard__who small">{s.investor ?? ""}</span>
            </article>
          );
        })}
      </div>
    </div>
  );
}
