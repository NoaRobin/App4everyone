import type { ReactNode } from "react";
import { Roll } from "./ui";

/**
 * Ossature éditoriale commune aux rubriques d'analyse (Encours, Portefeuilles, Distribution, Risques) :
 * un grand titre, une phrase qui répond à la question, puis les chiffres qui comptent, en compteur mécanique.
 */
export function PageHero({ eyebrow, title, lede, figures, aside, top }:
  { eyebrow: ReactNode; title: string; lede?: ReactNode; figures?: FigureItem[]; aside?: ReactNode; top?: ReactNode }) {
  return (
    <header className="ph">
      <div className="ph__in">
        {top}
        <div className="ph__grid">
          <div className="ph__main">
            <div className="eyebrow ph__eyebrow">{eyebrow}</div>
            <h1 className="ph__title hero-title">{title}</h1>
            {lede && <p className="ph__lede">{lede}</p>}
          </div>
          {aside && <div className="ph__aside">{aside}</div>}
        </div>
        {figures && <Figures items={figures} />}
      </div>
    </header>
  );
}

export type FigureItem = { label: string; value: string; unit?: string; sub?: ReactNode; aria?: string };

export function Figures({ items }: { items: FigureItem[] }) {
  return (
    <dl className="figs" style={{ ["--n" as string]: items.length }}>
      {items.map((f) => (
        <div key={f.label} className="fig">
          <dt className="fig__l">{f.label}</dt>
          <dd className="fig__v num" aria-label={f.aria ?? `${f.value}${f.unit ? " " + f.unit : ""}`} role="text">
            <Roll text={f.value} />{f.unit && <span className="fig__u" aria-hidden="true">{f.unit}</span>}
          </dd>
          {f.sub && <dd className="fig__s small">{f.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function Head({ id, eyebrow, title, right, lede }: { id: string; eyebrow: string; title: string; right?: ReactNode; lede?: ReactNode }) {
  return (
    <div className="section__head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="h2" id={`h-${id}`}>{title}</h2>
        {lede && <p className="small muted head__lede">{lede}</p>}
      </div>
      {right}
    </div>
  );
}

/**
 * Bande proportionnelle (100 %) : chaque segment porte son libellé quand la place le permet,
 * la légende reprend tout (identité jamais portée par la seule couleur), survol = détail.
 */
export function Strip<T>({ items, value, label, color, detail, ariaLabel }:
  { items: T[]; value: (t: T) => number; label: (t: T) => string; color: (t: T, i: number) => string; detail: (t: T) => string; ariaLabel: string }) {
  const total = items.reduce((s, x) => s + Math.max(0, value(x)), 0) || 1;
  return (
    <div className="band">
      <div className="band__bar" role="img" aria-label={ariaLabel}>
        {items.map((it, i) => {
          const w = (Math.max(0, value(it)) / total) * 100;
          return (
            <span key={label(it)} className="band__s" style={{ width: `${w}%`, ["--c" as string]: color(it, i) }} title={`${label(it)} · ${detail(it)}`}>
              {w > 9 && <span className="band__l"><span className="band__n">{label(it)}</span><span className="band__p num">{Math.round(w)} %</span></span>}
            </span>
          );
        })}
      </div>
      <ul className="band__legend">
        {items.map((it, i) => (
          <li key={label(it)}><span className="dot" style={{ background: color(it, i) }} /><span>{label(it)}</span><span className="num muted">{detail(it)}</span></li>
        ))}
      </ul>
    </div>
  );
}
