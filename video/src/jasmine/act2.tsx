/**
 * La fiche répond (mesures 13 → 20) et l'export (mesures 20 → 31).
 */
import type React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Ambient, Grain } from "../components/Chrome";
import { COLOR, EASE, FONT, TYPE, VIDEO } from "../theme";
import { mix, prog } from "../lib/anim";
import { AppCam, CamKey, Caption, Chapter, ClickRing, cropAt, Flash, Note, Shade, Slam, Sweep, Thread } from "./kit";
import { BAR, BEAT, bar, beat, from, pulse, S } from "./timeline";

const W = VIDEO.width, H = VIDEO.height, CX = W / 2, CY = H / 2;

// ================================================================== 4. La fiche répond (mesures 13 → 20) — prise « jfiche »
const QUESTIONS = ["ISIN", "Cut-off", "SFDR", "Dépositaire", "Gérant"];
const ANSWERS = ["Les codes de chaque part.", "Heure limite et règlement.", "La classification, les labels.", "Dépositaire, conservateur.", "Le gérant, son suppléant."];

export const Fiche: React.FC = () => {
  const f = useCurrentFrame();
  const k = Math.min(QUESTIONS.length - 1, Math.floor(f / BAR));
  const q0 = bar(S.fiche[0] + k) - from("fiche");
  const inQ = f < bar(S.fiche[0] + QUESTIONS.length) - from("fiche");
  const side = k % 2 ? -1 : 1;
  const snap = prog(f, q0, 9, EASE.signature);
  const prevSide = -side;
  const s = k === 0 ? side : mix(prevSide, side, snap);
  const enterK = prog(f, 0, 14, EASE.signature);
  const ry = s * 15, tx = s * 170;
  const crop = { x: 226 - 6 * Math.sin(f / 40), y: 500, w: mix(720, 680, prog(f - q0, 0, BAR, EASE.premium)) };
  const tilt = `perspective(2400px) translateX(${tx}px) translateY(${mix(500, 40, enterK)}px) rotateY(${ry}deg) rotateX(7deg) scale(${1 + 0.012 * pulse(f, BEAT)})`;
  // fin : « Tous les champs Product Info. Une seule question. »
  const t2 = bar(S.fiche[0] + 5) - from("fiche");
  const out = prog(f, t2 - 6, 8, EASE.exit);
  return (
    <AbsoluteFill>
      <Ambient glow={1.1} />
      {inQ && (
        <>
          {/* le mot de la question, géant, en filigrane derrière l'écran */}
          <div style={{ position: "absolute", left: 0, width: W, top: 120, textAlign: "center", opacity: 0.9 }}>
            <Slam key={k} at={q0} dur={8} style={{ fontFamily: FONT.serif, fontSize: 330, lineHeight: 1, color: "transparent",
              WebkitTextStroke: `2px rgba(220,179,109,0.55)`, whiteSpace: "nowrap", transform: `translateX(${-(f - q0) * 1.2 * side}px)` }}>{QUESTIONS[k]}</Slam>
          </div>
          <div style={{ opacity: 1 - out }}>
            <AppCam name="jfiche" trim={6} crop={crop} w={1180} h={664} cx={CX} cy={CY + 70} tilt={tilt} frameGlow={0.35 + 0.65 * pulse(f, BAR, 12)} />
          </div>
          <Chapter n="02" label="Comprendre" at={2} out={t2 - 8} />
          <div style={{ position: "absolute", right: 144, top: 66, ...TYPE.eyebrow, fontSize: 21, color: COLOR.ink2, opacity: enterK * (1 - out) }}>
            Europe Valeur · la fiche
          </div>
          <Caption key={`a${k}`} eyebrow={`« ${QUESTIONS[k].toLowerCase()} »`} title={ANSWERS[k]} at={q0 + Math.round(BEAT)} out={q0 + bar(1) - 6} y={900} size={58} x={side > 0 ? 144 : 144} />
          <Note />
        </>
      )}
      {f >= t2 - 2 && <ProductInfo t={f - t2} />}
      <Grain />
    </AbsoluteFill>
  );
};

const LABELS = [
  "Frais de gestion maximum", "Heure limite (cut-off)", "Classification SFDR", "Code ISIN", "Dépositaire", "Gérant principal", "SRRI",
  "Devise de référence", "Frais de gestion réels", "Fréquence de valorisation", "Code LEI", "Indicateur de référence", "Durée recommandée",
  "Forme juridique", "Pays de domiciliation", "Commission de surperformance", "Label ISR", "Jour de calcul de la VL", "Conservateur", "Date de création",
];

/** Les champs Product Info qui défilent en perspective, puis la phrase. Deux mesures. */
const ProductInfo: React.FC<{ t: number }> = ({ t }) => {
  return (
    <AbsoluteFill style={{ perspective: 1400 }}>
      <AbsoluteFill style={{ transform: "rotateX(52deg) translateY(-80px)", transformOrigin: "50% 70%" }}>
        {LABELS.map((l, i) => {
          const at = Math.round(i * BEAT / 2.5);
          const p = (t - at) / (BAR * 1.6);
          if (p < 0 || p > 1) return null;
          const lane = (i % 5) - 2;
          return (
            <div key={l} style={{ position: "absolute", left: CX + lane * 300, top: mix(1300, -600, p), transform: "translateX(-50%)",
              fontFamily: FONT.mono, fontSize: 30, letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap",
              color: i % 3 === 0 ? COLOR.goldInk : COLOR.ink2, opacity: Math.min(1, p * 6) * Math.min(1, (1 - p) * 3) }}>{l}</div>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(60% 40% at 50% 46%, rgba(6,11,21,0.9), transparent 75%)" }} />
      <div style={{ position: "absolute", left: 0, width: W, top: 330, textAlign: "center" }}>
        <Slam at={0} dur={7} style={{ ...TYPE.display, fontSize: 130, color: COLOR.ink }}>Tous les champs Product Info.</Slam>
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: 520, textAlign: "center" }}>
        <Slam at={beat(4)} dur={7} style={{ ...TYPE.display, fontSize: 130, color: COLOR.goldInk, fontStyle: "italic" }}>Une seule question.</Slam>
      </div>
      <Thread x0={mix(CX, 360, prog(t, beat(4), 18, EASE.signature))} x1={mix(CX, W - 360, prog(t, beat(4), 18, EASE.signature))} y={720} />
      <Sweep at={bar(2) - 10} dur={10} />
    </AbsoluteFill>
  );
};

// ================================================================== 5. « Exporter. » (mesure 20)
export const ExportTitle: React.FC = () => {
  const f = useCurrentFrame();
  const z = mix(1.08, 1, prog(f, 0, BAR, EASE.premium));
  return (
    <AbsoluteFill>
      <Ambient glow={1.3} />
      <AbsoluteFill style={{ transform: `scale(${z})` }}>
        <div style={{ position: "absolute", left: 0, width: W, top: 250, textAlign: "center" }}>
          <Slam at={0} style={{ ...TYPE.eyebrow, fontSize: 28, color: COLOR.goldInk, letterSpacing: "0.34em" }}>03 · Exporter</Slam>
        </div>
        <div style={{ position: "absolute", left: 0, width: W, top: 330, textAlign: "center" }}>
          <Slam at={1} dur={6} style={{ ...TYPE.hero, fontSize: 250, color: COLOR.ink }}>En Excel.</Slam>
        </div>
        <div style={{ position: "absolute", left: 0, width: W, top: 590, textAlign: "center" }}>
          <Slam at={beat(2)} dur={6} style={{ ...TYPE.hero, fontSize: 250, color: COLOR.goldInk, fontStyle: "italic" }}>En un clic.</Slam>
        </div>
      </AbsoluteFill>
      <Flash at={0} peak={0.35} dur={10} />
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 6. L'export (mesures 21 → 31) — prise « jexport »
const T = (n: number) => Math.round(n * BEAT);
const EXPORT_KEYS: CamKey[] = [
  { f: 0, c: { x: 0, y: 0, w: 1920 } },
  { f: T(3), c: { x: 200, y: 330, w: 1100 }, cut: true },
  { f: T(5), c: { x: 230, y: 350, w: 1020 } },
  { f: T(6), c: { x: 0, y: 0, w: 1920 }, cut: true },
  { f: T(9) + 8, c: { x: 180, y: 70, w: 900 }, cut: true },
  { f: T(17), c: { x: 190, y: 74, w: 880 } },
  { f: T(23) + 6, c: { x: 236, y: 60, w: 1450 } },
  { f: T(25), c: { x: 560, y: 600, w: 820 }, cut: true },
  { f: T(28) + 4, c: { x: 580, y: 610, w: 780 } },
  { f: T(29), c: { x: 594, y: 140, w: 1000 }, cut: true },
  { f: T(30), c: { x: 1100, y: 720, w: 640 }, cut: true },
  { f: T(33), c: { x: 1170, y: 760, w: 560 } },
  { f: T(35), c: { x: 0, y: 0, w: 1920 }, cut: true },
  { f: 600, c: { x: 120, y: 60, w: 1700 } },
];
/** Position d'un point de la prise dans l'image, pour un cadre donné (plein écran). */
const toScreen = (c: { x: number; y: number; w: number }, x: number, y: number) => ({ x: (x - c.x) * (W / c.w), y: (y - c.y) * (W / c.w) });
const CLICKS: [number, number, number][] = [[T(5), 400, 500], [T(13), 526, 122], [T(17), 330, 214], [T(20), 326, 311], [T(23), 470, 354], [T(28), 758, 882], [T(33), 1544, 960]];

export const Export: React.FC = () => {
  const f = useCurrentFrame();
  const crop = cropAt(EXPORT_KEYS, f);
  const intro = 1 - prog(f, T(3) - 6, 6, EASE.signature);
  const sw = prog(f, 0, T(3), EASE.premium);
  const tilt = intro > 0 ? `perspective(2200px) translateX(${mix(-380, -300, sw)}px) rotateY(${mix(26, 18, sw)}deg) rotateX(${mix(10, 5, sw)}deg) scale(${mix(0.6, 0.64, sw)})` : undefined;
  return (
    <AbsoluteFill style={{ background: COLOR.paper }}>
      {intro > 0 && <Ambient />}
      <AppCam name="jexport" crop={crop} tilt={tilt} frameGlow={intro}>
        {intro <= 0 && CLICKS.map(([at, x, y], i) => { const p = toScreen(crop, x, y); return <ClickRing key={i} at={at} x={p.x} y={p.y} size={130} />; })}
      </AppCam>
      {intro > 0 && <Caption eyebrow="Vos données" title={<>Prêtes pour Excel.</>} at={2} out={T(3) - 8} y={420} size={104} align="right" />}
      {intro <= 0 && <Chapter n="03" label="Exporter" at={T(3)} />}
      <Shade on={f >= T(3)} />
      <Caption eyebrow="Fonds · Product Info" title="Une ligne par fonds." at={T(3) + 2} out={T(6) - 6} y={860} size={72} />
      <Caption eyebrow="Packs prêts à l'emploi" title="Fiche d'identité." at={T(17)} out={T(20) - 5} y={860} size={72} />
      <Caption eyebrow="Packs prêts à l'emploi" title="Frais du fonds." at={T(20)} out={T(23) - 5} y={860} size={72} />
      <Caption eyebrow="Packs prêts à l'emploi" title="Codes et identifiants." at={T(23)} out={T(25) - 4} y={860} size={72} />
      <Caption eyebrow="Le style" title="Bordeaux, filet rose." at={T(28)} out={T(30) - 4} y={860} size={72} />
      <Caption eyebrow="Le fichier" title="Télécharger." at={T(31)} out={T(35) - 4} y={860} size={72} />
      <Caption eyebrow="En-têtes explicites, vrais formats" title="Un tableau Excel propre." at={T(35) + 2} out={600 - 8} y={860} size={72} />
      <Flash at={T(33)} peak={0.5} dur={10} />
      <Flash at={600 - 4} peak={0.9} dur={20} />
      <Note />
      <Grain />
    </AbsoluteFill>
  );
};
