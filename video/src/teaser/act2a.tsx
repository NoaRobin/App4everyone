/**
 * Acte II, ouverture — le manifeste (un anneau de rubriques en orbite), puis les deux chiffres communiqués :
 * 50,3 milliards d'euros d'encours, en chiffres extrudés traversés par la caméra ; R-co Valor, 10 Md€, la tour d'or qui
 * sort du plateau de la gamme : près d'un euro sur cinq.
 */
import type React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { GoldPoint, Grain } from "../components/Chrome";
import { hash, mix, prog } from "../lib/anim";
import { COLOR, EASE, FONT, LAYOUT, NUMERIC, TYPE, VIDEO } from "../theme";
import { Extruded, Night, Note, NOTE_FACTS } from "./kit";
import { FACTS } from "./timeline";
import { voAt } from "./vo";

const fr = (v: number, d: number) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

// ------------------------------------------------------------------ manifeste
const WORDS = ["Encours", "Revenus", "Distribution", "Passif", "Performance", "Portefeuilles", "Fiches", "Collecte", "Risques", "Contrôles", "Pays", "Parts"];

export const Manifesto: React.FC = () => {
  const frame = useCurrentFrame();
  const spin = frame * 0.42 - 40;
  const ringIn = prog(frame, 0, 40, EASE.premium);
  const t1 = prog(frame, voAt("manifesto", 0) + 14, 22), t2 = prog(frame, voAt("manifesto", 0) + 58, 22);
  const out = prog(frame, 222, 16, EASE.exit);
  const R = 980;
  return (
    <AbsoluteFill>
      <Night glow={1.1} />
      <div style={{ position: "absolute", inset: 0, perspective: 1800, perspectiveOrigin: "50% 40%" }}>
        <div style={{ position: "absolute", left: VIDEO.width / 2, top: 560, transformStyle: "preserve-3d", transform: `rotateX(-14deg) rotateY(${spin}deg) scale(${mix(0.6, 1, ringIn)})`, opacity: ringIn * (1 - out) }}>
          {WORDS.map((w, i) => {
            const a = (i / WORDS.length) * 360;
            const facing = Math.cos(((a + spin) * Math.PI) / 180);
            return (
              <div key={w} style={{ position: "absolute", left: 0, top: 0, transform: `rotateY(${a}deg) translateZ(${R}px) translate(-50%, -50%)`, backfaceVisibility: "hidden",
                ...TYPE.eyebrow, fontSize: 52, letterSpacing: "0.28em", whiteSpace: "nowrap", color: facing > 0.6 ? COLOR.goldInk : COLOR.ink3, opacity: 0.35 + 0.65 * Math.max(0, facing) }}>
                {w}
              </div>
            );
          })}
          {/* l'anneau lui-même : un filet d'or en carré, angles vifs */}
          <div style={{ position: "absolute", left: -R, top: -R, width: 2 * R, height: 2 * R, transform: "rotateX(90deg) translateZ(-60px)", border: `1.5px solid rgba(204,159,83,0.35)` }} />
        </div>
      </div>
      <GoldPoint x={VIDEO.width / 2} y={560} size={12} glow={1.4} style={{ opacity: 1 - t1 }} />
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 360, textAlign: "center", opacity: t1 * (1 - out), transform: `translateY(${(1 - t1) * 26}px)` }}>
        <div style={{ ...TYPE.display, fontSize: 140, color: COLOR.ink, textShadow: "0 8px 60px rgba(0,0,0,0.9)" }}>Toutes les informations métiers.</div>
      </div>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 540, textAlign: "center", opacity: t2 * (1 - out), transform: `translateY(${(1 - t2) * 26}px)` }}>
        <div style={{ ...TYPE.display, fontSize: 140, fontStyle: "italic", color: COLOR.goldInk, textShadow: "0 8px 60px rgba(0,0,0,0.9)" }}>Au même endroit.</div>
      </div>
      <Grain />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ 50,3 milliards
export const Aum: React.FC = () => {
  const frame = useCurrentFrame();
  const fly = prog(frame, 0, 150, EASE.premium);
  const camZ = mix(2600, 0, fly);
  const ry = mix(-58, -14, fly), rx = mix(18, 4, fly);
  const settle = prog(frame, 150, 60, EASE.premium);
  const sub = prog(frame, 150, 24), sub2 = prog(frame, 190, 24);
  const out = prog(frame, 340, 18, EASE.exit);
  const counter = FACTS.aumMdEur * 1000 * prog(frame, 150, 80, EASE.count);
  return (
    <AbsoluteFill>
      <Night glow={1.3} />
      {/* sol : quadrillage d'or en perspective */}
      <div style={{ position: "absolute", inset: 0, perspective: 1400, perspectiveOrigin: "50% 30%" }}>
        <div style={{ position: "absolute", left: -1200, width: 4320, top: 640, height: 3000, transform: `rotateX(78deg) translateY(${(-frame * 6) % 120}px)`, transformOrigin: "50% 0",
          backgroundImage: "linear-gradient(rgba(204,159,83,0.16) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(204,159,83,0.16) 1.5px, transparent 1.5px)", backgroundSize: "120px 120px",
          maskImage: "linear-gradient(to bottom, transparent, black 30%, black 60%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, transparent, black 30%, black 60%, transparent)", opacity: 1 - out }} />
      </div>
      {/* les chiffres extrudés, traversés par la caméra */}
      <div style={{ position: "absolute", inset: 0, perspective: 1600, perspectiveOrigin: "50% 45%" }}>
        <div style={{ position: "absolute", left: VIDEO.width / 2, top: 470, transformStyle: "preserve-3d",
          transform: `translateZ(${camZ}px) rotateX(${rx}deg) rotateY(${mix(ry, -6, settle)}deg) translate(-50%, -50%)`, opacity: 1 - out }}>
          <Extruded text="50,3" size={460} depth={150} layers={36} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 770, textAlign: "center", opacity: sub * (1 - out), transform: `translateY(${(1 - sub) * 20}px)` }}>
        <div style={{ ...TYPE.title, fontSize: 92, color: COLOR.ink }}>milliards d'euros d'encours.</div>
      </div>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 150, textAlign: "center", opacity: sub2 * (1 - out) }}>
        <span style={{ ...TYPE.eyebrow, fontSize: 26, color: COLOR.goldInk }}>Encours sous gestion</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 28, color: COLOR.ink2, marginLeft: 26, ...NUMERIC }}>{fr(Math.round(counter), 0)}&nbsp;M€</span>
      </div>
      <Note opacity={sub2 * (1 - out)}>{NOTE_FACTS}</Note>
      <Grain />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ R-co Valor
const COS = Math.cos(Math.PI / 6), SIN = Math.sin(Math.PI / 6);

export const Valor: React.FC = () => {
  const frame = useCurrentFrame();
  const th = ((-20 + 26 * prog(frame, 0, 330, EASE.premium)) * Math.PI) / 180;
  const ct = Math.cos(th), st = Math.sin(th);
  const S = 46, CX = 1180, CY = 700;
  const P = (x: number, y: number, z: number) => { const rx = x * ct - y * st, ry = x * st + y * ct; return [CX + (rx - ry) * COS * S, CY + (rx + ry) * SIN * S - z * S, rx + ry] as const; };
  const plate = prog(frame, 6, 40, EASE.signature);
  const rise = prog(frame, 60, 70, EASE.signature);
  const H = 12 * rise;                                  // la tour d'or
  const lab = prog(frame, 120, 22), five = prog(frame, 158, 24), out = prog(frame, 312, 16, EASE.exit);
  // le plateau de la gamme : blocs abstraits (pas des fonds réels), tous de même faible hauteur, légère houle
  const blocks: { x: number; y: number }[] = [];
  for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) if (Math.abs(i) + Math.abs(j) > 0 && Math.hypot(i, j) < 6.8) blocks.push({ x: i * 1.1, y: j * 1.1 });
  const box = (x: number, y: number, w: number, h: number, top: string, l: string, r: string, key: string, op = 1) => {
    const c = [[x - w, y - w], [x + w, y - w], [x + w, y + w], [x - w, y + w]];
    const T = c.map(([a, b]) => P(a, b, h)), B = c.map(([a, b]) => P(a, b, 0));
    const faces: React.ReactNode[] = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const ex = c[j][0] - c[i][0], ey = c[j][1] - c[i][1];
      // normale sortante (contour dans le sens trigonométrique), tournée avec la caméra ; visible si orientée vers +x+y
      const vx = ey * ct + ex * st, vy = ey * st - ex * ct;
      if (vx + vy <= 0) continue;
      faces.push(<polygon key={`${key}${i}`} points={[B[i], B[j], T[j], T[i]].map((p) => `${p[0]},${p[1]}`).join(" ")} fill={vx - vy > 0 ? r : l} opacity={op} />);
    }
    faces.push(<polygon key={`${key}t`} points={T.map((p) => `${p[0]},${p[1]}`).join(" ")} fill={top} opacity={op} />);
    return { depth: P(x, y, 0)[2], faces };
  };
  const items = blocks.map((b, k) => {
    const h = (0.35 + 0.25 * hash(k)) * plate + 0.08 * Math.sin(frame / 14 + k);
    return box(b.x, b.y, 0.42, Math.max(0.02, h), "#2a3346", "#151b27", "#1d2534", `b${k}`, 0.9);
  });
  items.push(box(0, 0, 0.5, Math.max(0.02, H), "#f3dcaa", "#8a6a33", "#b88d48", "valor"));
  items.sort((a, b) => a.depth - b.depth);
  const top = P(0, 0, H);
  return (
    <AbsoluteFill>
      <Night glow={1.2} />
      <svg width={VIDEO.width} height={VIDEO.height} style={{ position: "absolute", inset: 0, opacity: 1 - out }}>
        <defs><linearGradient id="vbeam" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor={COLOR.goldGlow} stopOpacity={0.9} /><stop offset="100%" stopColor={COLOR.goldGlow} stopOpacity={0} /></linearGradient></defs>
        {items.flatMap((it) => it.faces)}
        {rise > 0.9 && <line x1={top[0]} y1={top[1]} x2={top[0]} y2={top[1] - 260} stroke="url(#vbeam)" strokeWidth={2.5} opacity={0.6 + 0.3 * Math.sin(frame / 6)} />}
        {lab > 0 && <path d={`M ${top[0]} ${top[1] - 10} L ${top[0]} ${top[1] - 60} L ${top[0] + 90} ${top[1] - 60}`} fill="none" stroke={COLOR.gold} strokeWidth={1.5} opacity={lab} />}
      </svg>
      <div style={{ position: "absolute", left: top[0] + 104, top: top[1] - 132, opacity: lab * (1 - out), transform: `translateX(${(1 - lab) * 20}px)` }}>
        <div style={{ ...TYPE.eyebrow, fontSize: 22, color: COLOR.goldInk, marginBottom: 10 }}>Le plus gros fonds de la gamme</div>
        <div style={{ ...TYPE.title, fontSize: 100, color: COLOR.ink }}>{FACTS.biggestFund}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 4 }}>
          <span style={{ ...TYPE.display, fontSize: 150, color: COLOR.goldInk, ...NUMERIC }}>{fr(FACTS.biggestFundMdEur * prog(frame, 120, 40, EASE.count), 0)}</span>
          <span style={{ ...TYPE.title, fontSize: 70, color: COLOR.goldInk }}>Md€</span>
        </div>
      </div>
      {/* un euro sur cinq */}
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 820, opacity: five * (1 - out) }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ width: 96, height: 16, background: i === 0 ? COLOR.gold : "rgba(214,209,202,0.16)", transform: `scaleX(${prog(frame, 158 + i * 3, 16)})`, transformOrigin: "0 50%" }} />
          ))}
        </div>
        <div style={{ ...TYPE.lede, fontSize: 44, color: COLOR.ink2 }}>
          Près d'<b style={{ color: COLOR.ink, fontWeight: 500 }}>un euro sur cinq</b> de nos encours.
        </div>
      </div>
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 150, opacity: prog(frame, 20, 20) * (1 - out) }}>
        <div style={{ ...TYPE.eyebrow, color: COLOR.goldInk }}>Encours par fonds</div>
      </div>
      <Note opacity={prog(frame, 120, 20) * (1 - out)}>{NOTE_FACTS} · le reste de la gamme est figuré</Note>
      <Grain />
    </AbsoluteFill>
  );
};
