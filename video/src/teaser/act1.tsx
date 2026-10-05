/**
 * Acte I — L'attente. Une extraction JUMP est lancée ; pendant qu'elle tourne, les fenêtres d'un matin ordinaire
 * (recherches, fichiers, mails) foncent vers la caméra, de plus en plus vite. Puis tout s'arrête : « Et si tout était
 * déjà là ? ». Univers froid et gris : l'or n'apparaît qu'à la rupture.
 */
import type React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { GoldPoint, Grain } from "../components/Chrome";
import { hash, mix, prog } from "../lib/anim";
import { COLOR, EASE, FONT, LAYOUT, NUMERIC, TYPE, VIDEO } from "../theme";
import { Letterbox, Night } from "./kit";
import { JUMP_DURATION_S, JUMP_START, jumpElapsed, mmss, SHOTS, START } from "./timeline";
import { voAt } from "./vo";

const GREY = { win: "#0f1318", bar: "#161b22", line: "#2a313b", ink: "#9aa1ad", dim: "#5d6470" };

// ------------------------------------------------------------------ 1. lancement
export const Launch: React.FC = () => {
  const frame = useCurrentFrame();
  const g = START.launch + frame;
  const s = jumpElapsed(g);
  const p = s / JUMP_DURATION_S;
  const line2 = "> extraction JUMP lancée";
  const typed = line2.slice(0, Math.max(0, Math.floor((frame - 34) / 1.2)));
  const barW = 2600;
  const drift = mix(0, -220, prog(frame, 0, SHOTS.launch, EASE.premium));
  return (
    <AbsoluteFill>
      <Night cold glow={0.6} />
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 176, fontFamily: FONT.mono, fontSize: 26, color: GREY.ink, lineHeight: 1.7, opacity: prog(frame, 6, 12) }}>
        <div style={{ color: GREY.dim }}>lundi · 08:12</div>
        <div>{typed}<span style={{ opacity: Math.floor(frame / 10) % 2 ? 0 : 1 }}>▌</span></div>
        {frame > 96 && <div style={{ color: GREY.dim }}>{"> temps estimé : 10 min"}</div>}
      </div>
      {/* le chronomètre */}
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 360, textAlign: "center", opacity: prog(frame, JUMP_START - 6, 10) }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 170, color: COLOR.ink2, letterSpacing: "0.04em", ...NUMERIC }}>{mmss(s)}</div>
        <div style={{ ...TYPE.eyebrow, fontSize: 22, color: GREY.dim, marginTop: 8 }}>sur 10:00 · {(p * 100).toFixed(1).replace(".", ",")} %</div>
      </div>
      {/* la barre de progression, interminable, qui fuit dans la profondeur */}
      <div style={{ position: "absolute", left: 0, top: 690, width: VIDEO.width, height: 200, perspective: 1100, perspectiveOrigin: "50% 0%" }}>
        <div style={{ position: "absolute", left: 360 + drift, top: 30, width: barW, height: 34, transformOrigin: "0 50%", transform: "rotateY(62deg)", transformStyle: "preserve-3d", opacity: prog(frame, JUMP_START, 20) }}>
          <div style={{ position: "absolute", inset: 0, background: "#141920", border: `1px solid ${GREY.line}` }} />
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: Math.max(2, p * barW), background: GREY.ink }} />
          {Array.from({ length: 11 }, (_, i) => (
            <div key={i} style={{ position: "absolute", left: (i / 10) * barW, top: 46, fontFamily: FONT.mono, fontSize: 26, color: GREY.dim, transform: "translateX(-50%)" }}>{i * 10} %</div>
          ))}
        </div>
      </div>
      <Letterbox k={1} />
      <Grain />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ 2. le rituel
type WinKind = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const TITLES: Record<WinKind, string> = {
  0: "Product Info — Recherche", 1: "Product Info — Recherche", 2: "Export JUMP — encours_fin_de_mois.xlsx",
  3: "Extraction JUMP", 4: "Doc Info — Documents", 5: "Centaure", 6: "Adjuto",
};

const Win: React.FC<{ kind: WinKind; t: number; seed: number }> = ({ kind, t, seed }) => {
  const bars = (n: number, w = 0.9) => Array.from({ length: n }, (_, i) => (
    <div key={i} style={{ height: 14, width: `${(0.35 + 0.6 * hash(seed + i)) * w * 100}%`, background: GREY.line, marginBottom: 16 }} />
  ));
  return (
    <div style={{ width: 1000, height: 620, background: GREY.win, border: `1px solid ${GREY.line}`, boxShadow: "0 40px 90px -20px rgba(0,0,0,0.9)" }}>
      <div style={{ height: 46, background: GREY.bar, borderBottom: `1px solid ${GREY.line}`, display: "flex", alignItems: "center", gap: 10, padding: "0 16px" }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 12, height: 12, border: `1.5px solid ${GREY.dim}` }} />)}
        <span style={{ fontFamily: FONT.mono, fontSize: 20, color: GREY.ink, marginLeft: 12, whiteSpace: "nowrap", overflow: "hidden" }}>{TITLES[kind]}</span>
      </div>
      <div style={{ padding: 40, fontFamily: FONT.sans, color: GREY.ink }}>
        {(kind === 0 || kind === 1) && (
          <>
            <div style={{ height: 64, border: `1.5px solid ${GREY.line}`, display: "flex", alignItems: "center", padding: "0 20px", fontSize: 28, fontFamily: FONT.mono }}>
              {kind === 0 ? "part I distribuante, frais courants" : "code part, ISIN, gérant…"}
            </div>
            {kind === 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 60, fontSize: 30 }}>
                <span style={{ width: 34, height: 34, border: `3px solid ${GREY.ink}`, borderRightColor: "transparent", transform: `rotate(${t * 12}deg)` }} />
                Recherche en cours…
              </div>
            ) : (
              <div style={{ marginTop: 60, fontSize: 34 }}>Aucun résultat.<div style={{ fontSize: 24, color: GREY.dim, marginTop: 12 }}>Essayez un autre code, ou une autre base.</div></div>
            )}
          </>
        )}
        {kind === 2 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 0, fontFamily: FONT.mono, fontSize: 20 }}>
            {Array.from({ length: 54 }, (_, i) => (
              <div key={i} style={{ border: `1px solid ${GREY.line}`, height: 52, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 10px", color: hash(seed + i) > 0.7 ? GREY.ink : GREY.dim }}>
                {hash(seed * 3 + i) > 0.82 ? "#####" : hash(seed + i * 7) > 0.4 ? (hash(i) * 9999).toFixed(0) : ""}
              </div>
            ))}
          </div>
        )}
        {kind === 3 && (
          <>
            <div style={{ fontSize: 30, marginBottom: 30 }}>Requête en cours…</div>
            <div style={{ height: 18, background: "#141920", border: `1px solid ${GREY.line}` }}><div style={{ width: `${3 + (seed % 5)}%`, height: "100%", background: GREY.ink }} /></div>
            <div style={{ fontFamily: FONT.mono, fontSize: 22, color: GREY.dim, marginTop: 20 }}>{3 + (seed % 5)} % · temps restant estimé : 9 min</div>
          </>
        )}
        {kind === 4 && (<><div style={{ fontSize: 26, marginBottom: 28 }}>Rechercher un document…</div>{bars(7)}</>)}
        {kind === 5 && (<><div style={{ height: 30, width: "50%", background: GREY.line, marginBottom: 34 }} />{bars(9)}</>)}
        {kind === 6 && (<><div style={{ height: 30, width: "40%", background: GREY.line, marginBottom: 34 }} />{bars(8, 0.8)}</>)}
      </div>
    </div>
  );
};

const N_WIN = 30;
const SPAWN = Array.from({ length: N_WIN }, (_, i) => Math.round(330 * (1 - Math.pow(1 - i / N_WIN, 1.9))));
const LIFE = 120;

/** Le champ de fenêtres à l'image `t` du rituel ; `fall` (0 → 1) les fait basculer dans le noir. */
export const WindowField: React.FC<{ t: number; fall?: number }> = ({ t, fall = 0 }) => (
  <div style={{ position: "absolute", inset: 0, perspective: 1000, perspectiveOrigin: "50% 50%" }}>
    {SPAWN.map((s, i) => {
      const age = t - s;
      if (age < 0 || age > LIFE) return null;
      const k = age / LIFE;
      const z = mix(-2800, 760, Math.pow(k, 1.35));
      const x = (hash(i * 11) - 0.5) * 1500, y = (hash(i * 23) - 0.5) * 700;
      const ry = (hash(i * 5) - 0.5) * 22, rx = (hash(i * 9) - 0.5) * 10;
      const op = Math.min(1, age / 14) * (1 - prog(z, 300, 460)) * (1 - prog(fall, 0.15 + 0.7 * hash(i), 0.2) * 1);
      const f = prog(fall, 0.7 * hash(i), 0.3, EASE.exit);
      return (
        <div key={i} style={{ position: "absolute", left: VIDEO.width / 2 - 500 + x, top: VIDEO.height / 2 - 310 + y, opacity: op,
          transform: `translateZ(${z}px) translateY(${f * 900}px) rotateY(${ry}deg) rotateX(${rx + f * 75}deg)`, transformStyle: "preserve-3d" }}>
          <Win kind={(i % 7) as WinKind} t={t} seed={i} />
        </div>
      );
    })}
  </div>
);

/** Ce qui s'affiche pendant que la voix nomme les outils (calé sur les répliques du plan). */
const LINES: { seg: number; pre?: string; text: string; gold?: boolean }[] = [
  { seg: 0, text: "On cherche." }, { seg: 1, pre: "Une fiche dans", text: "Product Info" }, { seg: 2, pre: "Un document dans", text: "Doc Info" },
  { seg: 3, pre: "Puis", text: "Centaure, Adjuto" }, { seg: 4, text: "Chaque outil, une partie de la réponse.", gold: true },
];

export const Ritual: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Night cold glow={0.8} />
      <WindowField t={frame} />
      <AbsoluteFill style={{ background: "radial-gradient(60% 50% at 30% 55%, rgba(0,0,0,0.65), transparent 70%)" }} />
      {LINES.map((l, i) => {
        const at = voAt("ritual", l.seg);
        const next = i + 1 < LINES.length ? voAt("ritual", LINES[i + 1].seg) : SHOTS.ritual + 10;
        const o = prog(frame, at, 8) * (1 - prog(frame, next - 6, 6));
        if (o <= 0) return null;
        return (
          <div key={l.seg} style={{ position: "absolute", left: LAYOUT.safeX, top: 420, opacity: o, transform: `translateY(${(1 - prog(frame, at, 10)) * 20}px)`, textShadow: "0 6px 40px rgba(0,0,0,0.95)" }}>
            {l.pre && <div style={{ ...TYPE.lede, fontSize: 44, color: COLOR.ink2, marginBottom: 6 }}>{l.pre}</div>}
            <div style={{ ...TYPE.title, fontSize: l.pre ? 132 : 104, color: l.gold ? COLOR.goldInk : COLOR.ink }}>{l.text}</div>
          </div>
        );
      })}
      <Letterbox k={1} />
      <Grain />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ 3. la rupture
export const Rupture: React.FC = () => {
  const frame = useCurrentFrame();
  const fall = prog(frame, 6, 44, EASE.premium);
  const q = prog(frame, 56, 22, EASE.signature);
  const qOut = prog(frame, 150, 14, EASE.exit);
  const pt = prog(frame, 118, 20, EASE.premium);
  const open = 1 - prog(frame, 150, 30, EASE.premium);
  return (
    <AbsoluteFill>
      <Night cold glow={mix(0.8, 0.2, fall)} />
      <WindowField t={SHOTS.ritual - 1} fall={fall} />
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 430, textAlign: "center", opacity: q * (1 - qOut), transform: `translateY(${(1 - q) * 24}px)` }}>
        <span style={{ ...TYPE.display, fontSize: 132, fontStyle: "italic", color: COLOR.ink }}>Et si tout était déjà là&nbsp;?</span>
      </div>
      <GoldPoint x={VIDEO.width / 2} y={720} size={12 * pt} glow={pt * 1.4} style={{ opacity: pt * (1 - qOut * 0.2) }} />
      <Letterbox k={open} />
      <Grain />
    </AbsoluteFill>
  );
};
