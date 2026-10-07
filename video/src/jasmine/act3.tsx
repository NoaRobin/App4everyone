/**
 * Le fichier Excel (mesures 31 → 35), « Chercher. Comprendre. Exporter. » (35 → 39), la signature (39 → fin).
 */
import type React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Ambient, Grain } from "../components/Chrome";
import { BRAND, COLOR, EASE, FONT, NUMERIC, TYPE, VIDEO } from "../theme";
import { mix, prog } from "../lib/anim";
import { AppCam, Flash, Letters, Mark, Note, Slam, Thread } from "./kit";
import { BAR, BEAT, beat, from, JASMINE_TOTAL, pulse, S } from "./timeline";
import FONDS from "./fonds.json";

const W = VIDEO.width, H = VIDEO.height, CX = W / 2, CY = H / 2;
const lb = (id: keyof typeof S, k: number) => beat(S[id][0] * 4 + k) - from(id);

// ================================================================== 7. Le fichier Excel (mesures 31 → 35)
type Fonds = { nom: string; famille: string; gerant: string; sfdr: string; fraisMax: number; fraisReels: number };
const ROWS = FONDS as Fonds[];
const COLS: { h: string; w: number; get: (r: Fonds) => string; num?: boolean }[] = [
  { h: "Nom du fonds", w: 330, get: (r) => r.nom },
  { h: "Famille de gestion", w: 300, get: (r) => r.famille },
  { h: "Gérant principal", w: 230, get: (r) => r.gerant },
  { h: "Classification SFDR", w: 210, get: (r) => r.sfdr },
  { h: "Frais de gestion maximum", w: 250, get: (r) => `${(r.fraisMax * 100).toFixed(2).replace(".", ",")} %`, num: true },
  { h: "Frais de gestion réels", w: 230, get: (r) => `${(r.fraisReels * 100).toFixed(2).replace(".", ",")} %`, num: true },
];
const XL = { head: "#8A1E41", ink: "#ffffff", rule: "#E8C9BA", zebra: "#F2F2F2", grid: "#d9d9d9", text: "#1d1d1f", chrome: "#f3f2f1", chrome2: "#e6e4e1" };
const ROW_H = 40, NUM_W = 54, HEAD_H = 46;

export const Excel: React.FC = () => {
  const f = useCurrentFrame();
  const k0 = lb("excel", 0);
  const win = prog(f, k0, 22, EASE.signature);
  const rowAt = (i: number) => lb("excel", 2) + Math.round(i * BEAT / 2);
  const sel = prog(f, lb("excel", 9), 8, EASE.signature);               // la cellule active part sur « réels »
  const selRow = Math.min(ROWS.length - 1, Math.max(0, Math.floor((f - lb("excel", 9)) / (BEAT / 2))));
  const active = f >= lb("excel", 9) ? ROWS[selRow] : ROWS[0];
  const tableW = NUM_W + COLS.reduce((a, c) => a + c.w, 0);
  const out = prog(f, lb("excel", 16) - 8, 8, EASE.exit);
  const rx = mix(28, 6, win), ty = mix(380, 40, win);
  return (
    <AbsoluteFill>
      <Ambient glow={1.1} />
      <AbsoluteFill style={{ perspective: 2600 }}>
        <div style={{ position: "absolute", left: CX - (tableW + 40) / 2, top: 150, width: tableW + 40, height: 800, background: "#fff",
          transform: `translateY(${ty}px) rotateX(${rx}deg) rotateY(${mix(-8, -3, win) + 2 * Math.sin(f / 60)}deg) scale(${(1 - 0.06 * out)})`, transformOrigin: "50% 100%",
          opacity: Math.min(1, win * 2) * (1 - out), boxShadow: "0 80px 160px -30px rgba(0,0,0,0.95), 0 0 0 1.5px rgba(220,179,109,0.55)", overflow: "hidden" }}>
          {/* barre de titre */}
          <div style={{ height: 50, background: BRAND.blue, display: "flex", alignItems: "center", padding: "0 20px", gap: 14, color: "#fff",
            fontFamily: FONT.sans, fontSize: 19 }}>
            <span style={{ width: 14, height: 14, background: COLOR.gold }} />
            <span style={{ fontWeight: 600 }}>fonds-2026-09-29.xlsx</span>
            <span style={{ opacity: 0.6 }}>· Tableau T_Fonds · {ROWS.length} lignes</span>
            <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 16, opacity: 0.65 }}>Jasmine · export</span>
          </div>
          {/* barre de formule */}
          <div style={{ height: 44, background: XL.chrome, display: "flex", alignItems: "center", gap: 14, padding: "0 14px", borderBottom: `1px solid ${XL.chrome2}`, fontFamily: FONT.sans, fontSize: 18, color: XL.text }}>
            <span style={{ width: 70, padding: "4px 8px", background: "#fff", border: `1px solid ${XL.grid}`, fontFamily: FONT.mono, fontSize: 16 }}>F{selRow + 2}</span>
            <span style={{ fontStyle: "italic", color: "#777" }}>fx</span>
            <span style={{ flex: 1, padding: "4px 10px", background: "#fff", border: `1px solid ${XL.grid}`, fontFamily: FONT.mono, fontSize: 17, ...NUMERIC }}>
              {`${String(+(active.fraisReels * 100).toFixed(2)).replace(".", ",")}%`}
            </span>
          </div>
          {/* lettres de colonnes */}
          <div style={{ display: "flex", height: 28, background: XL.chrome, borderBottom: `1px solid ${XL.grid}`, fontFamily: FONT.sans, fontSize: 15, color: "#666" }}>
            <span style={{ width: NUM_W }} />
            {COLS.map((c, j) => <span key={j} style={{ width: c.w, textAlign: "center", lineHeight: "28px", borderLeft: `1px solid ${XL.grid}`, background: j === 5 && sel > 0 ? "#e2dccf" : undefined }}>{"ABCDEF"[j]}</span>)}
          </div>
          {/* en-tête du tableau */}
          <div style={{ display: "flex", height: HEAD_H, fontFamily: FONT.sans, fontSize: 18, fontWeight: 650 }}>
            <span style={{ width: NUM_W, background: XL.chrome, color: "#666", textAlign: "center", lineHeight: `${HEAD_H}px`, fontWeight: 400, fontSize: 15 }}>1</span>
            {COLS.map((c, j) => {
              const t = prog(f, lb("excel", 1) + j * 3, 10, EASE.signature);
              return (
                <span key={j} style={{ width: c.w, background: XL.head, color: XL.ink, borderBottom: `3px solid ${XL.rule}`, padding: "0 12px", lineHeight: `${HEAD_H - 3}px`,
                  textAlign: c.num ? "right" : "left", whiteSpace: "nowrap", overflow: "hidden", opacity: t, transform: `translateY(${(1 - t) * -12}px)` }}>{c.h}</span>
              );
            })}
          </div>
          {/* les lignes, une par croche */}
          {ROWS.map((r, i) => {
            const t = prog(f, rowAt(i), 8, EASE.signature);
            if (t <= 0) return null;
            return (
              <div key={i} style={{ display: "flex", height: ROW_H, fontFamily: FONT.sans, fontSize: 18, color: XL.text, opacity: t, transform: `translateX(${(1 - t) * 40}px)` }}>
                <span style={{ width: NUM_W, background: XL.chrome, color: "#666", textAlign: "center", lineHeight: `${ROW_H}px`, fontSize: 15, borderTop: `1px solid ${XL.grid}` }}>{i + 2}</span>
                {COLS.map((c, j) => {
                  const on = sel > 0 && j === 5 && i === selRow;
                  return (
                    <span key={j} style={{ width: c.w, padding: "0 12px", lineHeight: `${ROW_H - 1}px`, whiteSpace: "nowrap", overflow: "hidden", textAlign: c.num ? "right" : "left",
                      background: i % 2 ? XL.zebra : "#fff", borderTop: `1px solid ${XL.grid}`, borderLeft: `1px solid ${XL.grid}`, ...NUMERIC,
                      outline: on ? `3px solid ${COLOR.gold}` : undefined, outlineOffset: -3, fontWeight: j === 0 ? 600 : 400 }}>{c.get(r)}</span>
                  );
                })}
              </div>
            );
          })}
          {/* onglets */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 40, background: XL.chrome, borderTop: `1px solid ${XL.grid}`, display: "flex", alignItems: "stretch", fontFamily: FONT.sans, fontSize: 17 }}>
            <span style={{ padding: "0 26px", lineHeight: "40px", background: "#fff", borderBottom: `3px solid ${XL.head}`, fontWeight: 600, color: XL.text }}>Fonds</span>
            <span style={{ padding: "0 26px", lineHeight: "40px", color: "#555" }}>Dictionnaire</span>
          </div>
        </div>
      </AbsoluteFill>
      {/* les phrases, au-dessus de la feuille */}
      <div style={{ position: "absolute", left: 0, width: W, top: 58, textAlign: "center", opacity: 1 - out }}>
        <Slam at={lb("excel", 2)} out={lb("excel", 8) - 5} style={{ ...TYPE.title, fontSize: 76, color: COLOR.ink }}>Une ligne par fonds.</Slam>
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: 58, textAlign: "center", opacity: 1 - out }}>
        <Slam at={lb("excel", 8)} out={lb("excel", 12) - 5} style={{ ...TYPE.title, fontSize: 76, color: COLOR.ink }}>De vrais nombres, sans cellule fusionnée.</Slam>
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: 58, textAlign: "center", opacity: 1 - out }}>
        <Slam at={lb("excel", 12)} style={{ ...TYPE.title, fontSize: 76, color: COLOR.goldInk, fontStyle: "italic" }}>Prêt pour Excel et Copilot.</Slam>
      </div>
      <Flash at={0} peak={0.6} dur={14} />
      <Note>Fichier d'exemple · jeu de données fictif</Note>
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 8. Chercher. Comprendre. Exporter. (mesures 35 → 39)
const RECAP = [
  { word: "Chercher.", name: "jcherche", trim: 140, crop: { x: 520, y: 80, w: 900 } },
  { word: "Comprendre.", name: "jfiche", trim: 30, crop: { x: 226, y: 500, w: 700 } },
  { word: "Exporter.", name: "jexport", trim: 470, crop: { x: 594, y: 140, w: 1000 } },
];

export const Recap: React.FC = () => {
  const end = from("sign") - from("recap");
  return (
    <AbsoluteFill>
      <Ambient glow={1.2} />
      {RECAP.map((r, k) => (
        <Sequence key={k} from={Math.round(k * BAR)} durationInFrames={Math.round((k + 1) * BAR) - Math.round(k * BAR)} layout="none">
          <RecapPanel k={k} />
        </Sequence>
      ))}
      <Sequence from={Math.round(3 * BAR)} durationInFrames={end - Math.round(3 * BAR)} layout="none">
        <Triptych len={end - Math.round(3 * BAR)} />
      </Sequence>
      <Grain />
    </AbsoluteFill>
  );
};

const RecapPanel: React.FC<{ k: number }> = ({ k }) => {
  const f = useCurrentFrame();
  const r = RECAP[k];
  const side = k === 1 ? -1 : 1;
  const e = prog(f, 0, 10, EASE.signature);
  return (
    <>
      <AppCam name={r.name} trim={r.trim} crop={r.crop} w={1040} h={585} cx={CX + side * 360} cy={CY}
        tilt={`perspective(2200px) rotateY(${-side * mix(34, 20, e)}deg) translateZ(${mix(-300, 0, e)}px)`} frameGlow={0.4 + 0.6 * pulse(f, BEAT)} />
      <div style={{ position: "absolute", left: side > 0 ? 144 : undefined, right: side < 0 ? 144 : undefined, top: CY - 110, textAlign: side > 0 ? "left" : "right" }}>
        <Slam at={0} dur={6} style={{ ...TYPE.hero, fontSize: 200, color: k === 2 ? COLOR.goldInk : COLOR.ink }}>{r.word}</Slam>
      </div>
      <Note />
    </>
  );
};

/** Mesure 38 : les trois écrans en triptyque, le fil les traverse, puis tout se resserre vers le centre. */
const Triptych: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  const g = prog(f, 0, 16, EASE.signature);
  const close = prog(f, len - 16, 16, EASE.exit);
  return (
    <>
      {RECAP.map((r, i) => {
        const x = CX + (i - 1) * mix(700, 560, g) * (1 - close);
        return (
          <AppCam key={i} name={r.name} trim={r.trim + 60} crop={r.crop} w={540} h={304} cx={x} cy={CY - 30}
            tilt={`perspective(1800px) rotateY(${(1 - i) * 18 * (1 - close)}deg) scale(${mix(0.9, 1, g) * (1 - 0.7 * close)})`} frameGlow={1} opacity={1 - close} />
        );
      })}
      <Thread x0={mix(CX, 120, g) + (CX - 120) * close} x1={mix(CX, W - 120, g) - (CX - 120) * close} y={CY + 170} thick={2.5} />
      {RECAP.map((r, i) => (
        <div key={i} style={{ position: "absolute", left: CX + (i - 1) * 560 - 270, width: 540, top: CY + 200, textAlign: "center", opacity: g * (1 - close) }}>
          <span style={{ ...TYPE.title, fontSize: 64, color: i === 2 ? COLOR.goldInk : COLOR.ink }}>{r.word}</span>
        </div>
      ))}
      <Flash at={len - 3} peak={0.95} dur={16} />
    </>
  );
};

// ================================================================== 9. Signature (mesure 39 → fin)
export const Sign: React.FC = () => {
  const f = useCurrentFrame();
  const fly = [0, 1, 2, 3, 4].map((i) => prog(f, beat(i * 0.5) + 2, 14, EASE.signature));
  const fold = [0, 1, 2, 3, 4].map((i) => prog(f, beat(i * 0.5) + 10, 14, EASE.premium));
  const heart = prog(f, beat(3), 8, EASE.signature);
  const end = JASMINE_TOTAL - from("sign");
  const fade = prog(f, end - 24, 24, EASE.premium);
  const rot = mix(-30, 0, prog(f, 0, 60, EASE.signature));
  return (
    <AbsoluteFill style={{ opacity: 1 - fade }}>
      <Ambient glow={1.3} />
      <AbsoluteFill style={{ background: `radial-gradient(40% 40% at 50% 36%, rgba(220,179,109,${0.12 * heart}), transparent 70%)` }} />
      <div style={{ position: "absolute", left: CX - 150, top: 170, transform: `rotate(${rot}deg) scale(${1 + 0.03 * pulse(f, BEAT) * heart})` }}>
        <Mark size={300} fly={fly} fold={fold} heart={heart} glow={0.5 + 0.8 * heart} />
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: 500, display: "flex", justifyContent: "center" }}>
        <Letters text="Jasmine" at={beat(4)} every={4} style={{ ...TYPE.hero, fontSize: 230, color: COLOR.ink }} />
      </div>
      <Thread x0={mix(CX, CX - 330, prog(f, beat(6), 20, EASE.signature))} x1={mix(CX, CX + 330, prog(f, beat(6), 20, EASE.signature))} y={770} />
      <div style={{ position: "absolute", left: 0, width: W, top: 800, textAlign: "center" }}>
        <Slam at={beat(6) + 4} style={{ ...TYPE.eyebrow, fontSize: 28, color: COLOR.ink2, letterSpacing: "0.34em" }}>Rothschild &amp; Co Asset Management</Slam>
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: 870, textAlign: "center" }}>
        <Slam at={beat(8)} style={{ fontFamily: FONT.serif, fontStyle: "italic", fontSize: 44, color: COLOR.goldInk }}>Chercher · Comprendre · Exporter</Slam>
      </div>
      <Note opacity={prog(f, beat(8), 20)}>Images de l'application · jeu de données fictif · Musique : « Fireworks », FreePD (CC0)</Note>
      <Flash at={0} peak={0.4} dur={18} />
      <Grain />
    </AbsoluteFill>
  );
};
