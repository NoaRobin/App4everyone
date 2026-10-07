/**
 * Ouverture, recherche et frais (mesures 0 → 13).
 */
import type React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Ambient, GoldPoint, Grain } from "../components/Chrome";
import { COLOR, EASE, FONT, NUMERIC, TYPE, VIDEO } from "../theme";
import { hash, mix, prog } from "../lib/anim";
import { AppCam, Caption, ClickRing, cropAt, CamKey, Flash, Letters, Mark, Note, Shade, Slam, Sweep, Thread } from "./kit";
import { BEAT, beat, from, pulse, S } from "./timeline";

const W = VIDEO.width, H = VIDEO.height, CX = W / 2, CY = H / 2;
/** Image locale du k-ième temps d'un plan. */
const lb = (id: keyof typeof S, k: number) => beat(S[id][0] * 4 + k) - from(id);

// ================================================================== 1. Ouverture (mesures 0 → 5)
const WORDS = ["Un fonds.", "Une part.", "Un ISIN.", "Des frais.", "Un cut-off.", "Un gérant.", "Une réponse."];
const FIELDS = [
  "FRAIS DE GESTION MAXIMUM", "HEURE LIMITE (CUT-OFF)", "CLASSIFICATION SFDR", "CODE ISIN", "DÉPOSITAIRE", "GÉRANT PRINCIPAL",
  "SRRI", "DEVISE DE RÉFÉRENCE", "FRAIS DE GESTION RÉELS", "COMMISSION DE SURPERFORMANCE", "VALORISATION", "CODE LEI",
  "INDICATEUR DE RÉFÉRENCE", "DURÉE RECOMMANDÉE", "FORME JURIDIQUE", "PAYS DE DOMICILIATION",
];

export const Open: React.FC = () => {
  const f = useCurrentFrame();
  // le point (temps 0), le fil qui s'allonge d'un cran à chaque temps (temps 1 → 8)
  const pIn = prog(f, 0, 14, EASE.premium);
  const steps = Math.min(8, Math.max(0, (f - 6) / BEAT));
  const stepE = Math.floor(steps) + prog(f % BEAT, 0, 7, EASE.signature) * (steps < 8 && f > 6 ? 1 : 0);
  const half = Math.min(1, stepE / 8) * (W / 2 - 120);
  // le fil se replie vers le centre quand les pétales arrivent (mesure 3)
  const gather = prog(f, beat(12), 14, EASE.exit);
  const threadHalf = half * (1 - gather);
  const lift = prog(f, beat(16), 20, EASE.signature);       // mesure 4 : le logo monte, le nom arrive
  const markY = mix(CY, CY - 170, lift);
  const markSize = mix(440, 280, lift);
  // pétales sur les croches de la mesure 3
  const fly = [0, 1, 2, 3, 4].map((i) => prog(f, beat(12) + Math.round(i * BEAT / 2), 12, EASE.signature));
  const fold = [0, 1, 2, 3, 4].map((i) => prog(f, beat(12) + Math.round(i * BEAT / 2) + 8, 12, EASE.premium));
  const heart = prog(f, beat(15), 6, EASE.signature);
  const outro = prog(f, from("search") - 10, 10, EASE.exit);

  return (
    <AbsoluteFill>
      <Ambient glow={mix(0.15, 1, prog(f, beat(8), 30))} />
      {/* mesures 0–2 : un mot par temps, alternativement au-dessus et au-dessous du fil */}
      {WORDS.map((w, i) => {
        const at = beat(i + 1);
        const up = i % 2 === 0;
        const x = CX + (hash(i + 3) - 0.5) * 520;
        return (
          <div key={i} style={{ position: "absolute", left: x, top: up ? CY - 230 : CY + 40, transform: "translateX(-50%)" }}>
            <Slam at={at} out={at + Math.round(BEAT) - 5} dur={6} outDur={5} from={up ? "below" : "above"}
              style={{ ...TYPE.display, fontSize: 168, color: i === WORDS.length - 1 ? COLOR.goldInk : COLOR.ink, whiteSpace: "nowrap" }}>{w}</Slam>
          </div>
        );
      })}
      {/* mesure 2 : la levée — les champs Product Info défilent sur le fil, une étiquette par croche */}
      {FIELDS.map((t, i) => {
        const at = beat(8) + Math.round(i * BEAT / 2);
        const k = prog(f, at, 30, EASE.signature);
        if (f < at || f > beat(12) + 6) return null;
        const side = i % 2 ? 1 : -1;
        const x = CX + side * mix(80, 820, k);
        const y = CY + (i % 4 < 2 ? -1 : 1) * (36 + (i % 3) * 34);
        const o = Math.min(1, k * 5) * Math.min(1, (1 - k) * 2.2) * (1 - prog(f, beat(12), 6));
        return (
          <div key={t} style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -50%) scale(${mix(0.7, 1.25, k)})`, opacity: o,
            fontFamily: FONT.mono, fontSize: 27, letterSpacing: "0.12em", color: i % 3 === 0 ? COLOR.goldInk : COLOR.ink, whiteSpace: "nowrap" }}>{t}</div>
        );
      })}
      {f >= beat(8) && f < beat(12) && (
        <div style={{ position: "absolute", left: 0, width: W, top: CY - 170, textAlign: "center" }}>
          <Slam at={beat(8)} out={beat(12) - 6} style={{ ...TYPE.display, fontSize: 120, color: COLOR.ink }}>Toute la donnée fonds.</Slam>
        </div>
      )}
      <Thread x0={CX - threadHalf} x1={CX + threadHalf} y={CY} opacity={pIn * (1 - outro)} thick={mix(1.5, 3, prog(f, beat(8), 20))} />
      {f < beat(12) + 4 && <GoldPoint x={CX} y={CY} size={(12 + 6 * pulse(f)) * pIn * (1 - gather)} glow={pIn} />}
      {/* mesure 3 : le jasmin se plie, pétale par pétale */}
      {f >= beat(12) && (
        <div style={{ position: "absolute", left: CX - markSize / 2, top: markY - markSize / 2, opacity: 1 - outro,
          transform: `rotate(${mix(-24, 0, prog(f, beat(12), 50, EASE.signature))}deg) scale(${1 + 0.04 * pulse(f) * heart})` }}>
          <Mark size={markSize} fly={fly} fold={fold} heart={heart} glow={0.6 + 0.6 * heart} />
        </div>
      )}
      <Flash at={beat(15)} peak={0.28} dur={10} />
      {/* mesure 4 : le nom */}
      {f >= beat(16) - 1 && (
        <div style={{ position: "absolute", left: 0, width: W, top: CY + 10, display: "flex", flexDirection: "column", alignItems: "center", opacity: 1 - outro }}>
          <Letters text="Jasmine" at={beat(16)} every={Math.round(BEAT / 2)} style={{ ...TYPE.hero, fontSize: 210, color: COLOR.ink, letterSpacing: "-0.01em" }} />
          <div style={{ marginTop: 18 }}>
            <Slam at={beat(19)} style={{ ...TYPE.eyebrow, fontSize: 26, color: COLOR.goldInk, letterSpacing: "0.32em" }}>La donnée fonds, en une frappe</Slam>
          </div>
        </div>
      )}
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 2. Chercher (mesures 5 → 11) — prise « jcherche »
// Repères de la prise (images de la prise = images locales du plan) : frappe 16 → 55, Échap 108, question 122 → 182,
// Entrée 246 (= temps 36 du film), fiche ensuite.
const SEARCH_KEYS: CamKey[] = [
  { f: 0, c: { x: 0, y: 0, w: 1920 } },
  { f: 46, c: { x: 330, y: 30, w: 920 }, cut: true },   // à droite des résultats : les encours, hors champ
  { f: 100, c: { x: 350, y: 34, w: 890 } },
  { f: 108, c: { x: 520, y: 30, w: 900 }, cut: true },
  { f: 196, c: { x: 560, y: 60, w: 820 } },
  { f: 246, c: { x: 180, y: 70, w: 960 }, cut: true },
  { f: 296, c: { x: 200, y: 90, w: 900 } },
  { f: 308, c: { x: 226, y: 486, w: 690 }, cut: true },
  { f: 369, c: { x: 238, y: 500, w: 640 } },
];

export const Search: React.FC = () => {
  const f = useCurrentFrame();
  const crop = cropAt(SEARCH_KEYS, f);
  // premier temps du plan : l'écran est posé dans l'espace, à droite ; puis il remplit l'image
  const intro = 1 - prog(f, 40, 6, EASE.signature);
  const swing = prog(f, 0, 46, EASE.premium);
  const tilt = intro > 0 ? `perspective(2200px) translateX(${mix(420, 300, swing)}px) rotateY(${mix(-30, -20, swing)}deg) rotateX(${mix(10, 6, swing)}deg) scale(${mix(0.62, 0.66, swing)})` : undefined;
  const punch = 1 + 0.01 * pulse(f, BEAT * 2);
  return (
    <AbsoluteFill style={{ background: COLOR.paper }}>
      {intro > 0 && <Ambient />}
      <AbsoluteFill style={{ transform: intro > 0 ? undefined : `scale(${punch})` }}>
        <AppCam name="jcherche" crop={crop} tilt={tilt} frameGlow={intro} />
      </AbsoluteFill>
      {intro > 0 && <Caption eyebrow="01 · Chercher" title={<>Trouver un fonds.<br />En une frappe.</>} at={2} out={38} y={380} size={104} />}
      <Shade on={f >= 46} h={520} />
      <Caption eyebrow="Recherche tolérante" title="Un nom, un ISIN, un gérant." at={lb("search", 3)} out={lb("search", 6) - 6} y={800} size={78} />
      <Caption eyebrow="Ou une question" title="« frais de gestion europe valeur »" at={lb("search", 7)} out={lb("search", 11) - 4} y={820} size={70} />
      <ClickRing at={246} x={W / 2} y={H / 2} size={240} />
      <Flash at={246} peak={0.55} dur={9} />
      <Caption eyebrow="La fiche répond" title="Frais de gestion." at={lb("search", 15)} out={lb("search", 21)} y={800} size={86} align="right" />
      <Note />
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 3. Les frais (mesures 11 → 13)
export const Fees: React.FC = () => {
  const f = useCurrentFrame();
  const k1 = lb("fees", 0), k2 = lb("fees", 2), k3 = lb("fees", 4), end = lb("fees", 8);
  const shift = prog(f, k2, 12, EASE.signature);
  const rise = prog(f, k3, 14, EASE.signature);
  const out = prog(f, end - 8, 8, EASE.exit);
  const count = (to: number, at: number) => to * prog(f, at, 18, EASE.count);
  const pct = (v: number) => `${v.toFixed(v >= 1.95 ? 0 : 1).replace(".", ",")}`;
  const numStyle: React.CSSProperties = { ...TYPE.hero, fontSize: 380, color: COLOR.ink, ...NUMERIC };
  const unit: React.CSSProperties = { fontFamily: FONT.serif, fontSize: 180, color: COLOR.goldInk, marginLeft: 12 };
  return (
    <AbsoluteFill>
      <Ambient glow={1.2} />
      <div style={{ position: "absolute", left: 0, width: W, top: 150, textAlign: "center", opacity: 1 - out }}>
        <Slam at={k1} style={{ ...TYPE.eyebrow, fontSize: 28, color: COLOR.goldInk, letterSpacing: "0.3em" }}>Frais de gestion · Europe Valeur</Slam>
      </div>
      <div style={{ position: "absolute", top: mix(330, 270, rise), left: 0, width: W, height: 420, opacity: 1 - out }}>
        <div style={{ position: "absolute", left: mix(CX, CX - 420, shift), top: 0, transform: "translateX(-50%)", textAlign: "center" }}>
          <Slam at={k1} dur={7}><span style={numStyle}>{pct(count(2, k1))}</span><span style={unit}>%</span></Slam>
          <div style={{ ...TYPE.label, fontSize: 34, color: COLOR.ink2, marginTop: -6, opacity: prog(f, k1 + 6, 10) }}>maximum</div>
        </div>
        <div style={{ position: "absolute", left: CX + 420, top: 0, transform: "translateX(-50%)", textAlign: "center", opacity: f >= k2 ? 1 : 0 }}>
          <Slam at={k2} dur={7}><span style={numStyle}>{pct(count(1.6, k2))}</span><span style={unit}>%</span></Slam>
          <div style={{ ...TYPE.label, fontSize: 34, color: COLOR.ink2, marginTop: -6, opacity: prog(f, k2 + 6, 10) }}>réels</div>
        </div>
        <div style={{ position: "absolute", left: CX - 1, top: 40, width: 2, height: 300 * prog(f, k2, 10), background: COLOR.line2 }} />
      </div>
      <Thread x0={mix(CX, 220, prog(f, k1, 20, EASE.signature))} x1={mix(CX, W - 220, prog(f, k1, 20, EASE.signature))} y={760} opacity={1 - out} />
      <div style={{ position: "absolute", left: 0, width: W, top: 800, textAlign: "center", opacity: 1 - out }}>
        <Slam at={k3} style={{ ...TYPE.title, fontSize: 84, color: COLOR.ink }}>Directement depuis Product Info.</Slam>
      </div>
      <Note>Valeurs du jeu de données fictif</Note>
      <Sweep at={end - 10} dur={10} />
      <Grain />
    </AbsoluteFill>
  );
};
