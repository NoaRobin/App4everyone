/**
 * Acte II, l'application « en direct » : chaque rubrique est une prise réelle de l'application (jeu fictif), posée dans
 * l'espace — écran flottant, mise au point sélective, deux écrans face à face, table qui se redresse — puis le mur, où
 * tout joue en même temps.
 */
import type React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { Grain } from "../components/Chrome";
import { hash, mix, prog } from "../lib/anim";
import { COLOR, EASE, FONT, TYPE, VIDEO } from "../theme";
import { Night, Note, NOTE_APP, Rec, Screen3D, ShotTitle } from "./kit";
import { SHOTS } from "./timeline";
import { voAt } from "./vo";

const Stage: React.FC<{ children: React.ReactNode; persp?: number; origin?: string }> = ({ children, persp = 2200, origin = "50% 45%" }) => (
  <div style={{ position: "absolute", inset: 0, perspective: persp, perspectiveOrigin: origin, transformStyle: "preserve-3d" }}>{children}</div>
);

// ------------------------------------------------------------------ la courbe des encours
export const CourbeShot: React.FC = () => {
  const f = useCurrentFrame();
  const k = prog(f, 0, SHOTS.courbe, EASE.premium);
  const enter = prog(f, 0, 40, EASE.signature);
  return (
    <AbsoluteFill>
      <Night />
      <Stage>
        <Screen3D name="courbe" scale={0.7}
          transform={`translate3d(${mix(260, 180, k)}px, ${mix(80, 40, k)}px, ${mix(-900, -260, enter) + 120 * k}px) rotateY(${mix(-30, -12, k)}deg) rotateX(${mix(8, 3, k)}deg)`} />
      </Stage>
      <ShotTitle eyebrow="Encours" title={<>Du jour à l'année.<br /><span style={{ color: COLOR.goldInk, fontStyle: "italic" }}>En un clic.</span></>} at={20} out={SHOTS.courbe - 16} y={190} size={104} />
      <Note>{NOTE_APP}</Note>
      <Grain />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ les fonds qui rapportent (mise au point sélective)
export const RevenusShot: React.FC = () => {
  const f = useCurrentFrame();
  const focus = prog(f, 20, 60, EASE.premium);
  const push = mix(1.0, 1.14, prog(f, 0, SHOTS.revenus, EASE.premium));
  const mask = "radial-gradient(42% 58% at 70% 48%, black 55%, transparent 100%)";
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: "70% 45%" }}>
        <AbsoluteFill style={{ filter: `blur(${mix(18, 9, focus)}px) brightness(0.55)` }}><Rec name="home" /></AbsoluteFill>
        <AbsoluteFill style={{ filter: `blur(${mix(14, 0, focus)}px)`, maskImage: mask, WebkitMaskImage: mask }}><Rec name="home" /></AbsoluteFill>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(6,11,21,0.92) 0%, rgba(6,11,21,0.6) 34%, transparent 55%)" }} />
      <ShotTitle eyebrow="Revenus de gestion estimés" title={<>Les fonds qui nous<br />font gagner<br /><span style={{ color: COLOR.goldInk, fontStyle: "italic" }}>le plus.</span></>} at={40} out={SHOTS.revenus - 14} y={230} size={118} />
      <Note>{NOTE_APP}</Note>
      <Grain />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ distribution : deux écrans face à face
export const DistributionShot: React.FC = () => {
  const f = useCurrentFrame();
  const k = prog(f, 0, SHOTS.distribution, EASE.premium);
  const a = prog(f, 0, 36, EASE.signature), b = prog(f, 26, 36, EASE.signature);
  const open = mix(34, 22, k);
  return (
    <AbsoluteFill>
      <Night glow={1.2} />
      <Stage persp={1900} origin="50% 42%">
        <Screen3D name="globe" scale={0.5} rate={0.75}
          transform={`translate3d(${-470 - (1 - a) * 300}px, -40px, ${-200 + 140 * k}px) rotateY(${open}deg)`} glow={a} />
        <Screen3D name="sankey" scale={0.5} rate={0.75}
          transform={`translate3d(${470 + (1 - b) * 300}px, -40px, ${-200 + 140 * k}px) rotateY(${-open}deg)`} glow={b} />
      </Stage>
      <ShotTitle eyebrow="Distribution" title={<>Où nos fonds sont autorisés, <span style={{ color: COLOR.goldInk, fontStyle: "italic" }}>et pour qui.</span></>} at={56} out={SHOTS.distribution - 14} y={96} size={72} align="center" />
      <Note>{NOTE_APP}</Note>
      <Grain />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ passif : plein cadre, poussée lente
export const PassifShot: React.FC = () => {
  const f = useCurrentFrame();
  const push = mix(1.02, 1.16, prog(f, 0, SHOTS.passif, EASE.premium));
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: "60% 60%", opacity: prog(f, 0, 12) }}><Rec name="passif" /></AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(0deg, rgba(6,11,21,0.95) 0%, rgba(6,11,21,0.4) 30%, transparent 50%)" }} />
      <ShotTitle eyebrow="Passif · des parts, jamais de noms" title={<>Qui détient <span style={{ color: COLOR.goldInk, fontStyle: "italic" }}>nos fonds.</span></>} at={24} out={SHOTS.passif - 14} y={680} size={104} />
      <Note>{NOTE_APP}</Note>
      <Grain />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ performance : la table qui se redresse
export const PerfShot: React.FC = () => {
  const f = useCurrentFrame();
  const up = prog(f, 10, 120, EASE.premium);
  return (
    <AbsoluteFill>
      <Night glow={1.1} />
      <Stage persp={1700} origin="50% 20%">
        <Screen3D name="comparateur" scale={0.72} reflection={false} rate={0.75}
          transform={`translate3d(0px, ${mix(240, 40, up)}px, ${mix(-400, -120, up)}px) rotateX(${mix(64, 6, up)}deg) rotateZ(${mix(-8, 0, up)}deg)`} />
      </Stage>
      <ShotTitle eyebrow="Performance" title={<>Comparer, <span style={{ color: COLOR.goldInk, fontStyle: "italic" }}>en relief.</span></>} at={70} out={SHOTS.perf - 14} y={120} size={100} align="center" />
      <Note>{NOTE_APP}</Note>
      <Grain />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ recherche : la fin des recherches Product Info
/** La prise « recherche » démarre à l'image 84 du plan : la palette s'ouvre et se remplit pendant le premier zoom. */
export const SEARCH_REC_AT = 84;

export const SearchShot: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const strike = prog(f, 26, 18, EASE.signature);
  const oldOut = prog(f, 78, 14, EASE.exit);
  const recIn = prog(f, 84, 16);
  const zoomA = prog(f, 120, 40, EASE.premium) * (1 - prog(f, 236, 30, EASE.premium));
  const zoomB = prog(f, 266, 40, EASE.premium);
  const scale = 1 + 0.32 * zoomA + 0.28 * zoomB;
  const ox = zoomB > 0 ? "30% 74%" : "30% 64%";
  return (
    <AbsoluteFill style={{ background: COLOR.paper }}>
      {/* l'ancien geste */}
      <div style={{ position: "absolute", inset: 0, opacity: 1 - oldOut, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 1100, padding: "48px 56px", background: "#0f1318", border: "1px solid #2a313b" }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 22, color: "#9aa1ad", marginBottom: 24 }}>Product Info — Recherche</div>
          <div style={{ height: 70, border: "1.5px solid #2a313b", display: "flex", alignItems: "center", padding: "0 22px", fontFamily: FONT.mono, fontSize: 30, color: "#9aa1ad" }}>frais courants part I, cut-off, dépositaire…</div>
          <div style={{ position: "absolute", left: -40, right: -40, top: "52%", height: 6, background: COLOR.gold, transform: `scaleX(${strike})`, transformOrigin: "0 50%", boxShadow: "0 0 24px rgba(220,179,109,0.6)" }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 700, textAlign: "center", opacity: prog(f, 34, 14) * (1 - oldOut) }}>
        <span style={{ ...TYPE.title, fontSize: 96, color: COLOR.ink }}>Plus de recherches Product Info.</span>
      </div>
      {/* la nouvelle : palette, puis question à la fiche */}
      <AbsoluteFill style={{ opacity: recIn, transform: `scale(${scale})`, transformOrigin: ox }}>
        <Sequence from={SEARCH_REC_AT} premountFor={fps}><Rec name="recherche" /></Sequence>
      </AbsoluteFill>
      <ShotTitle title={<>Une question. <span style={{ color: COLOR.goldInk, fontStyle: "italic" }}>La réponse.</span></>} at={300} out={SHOTS.search - 12} y={110} size={84} align="center" />
      {f > 84 && <Note>{NOTE_APP}</Note>}
      <Grain />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ le mur : tout, en même temps
const WALL = ["courbe", "home", "globe", "passif", "comparateur", "sankey", "fiche", "ville", "recherche", "courbe", "globe", "home"];
/** Les mots du mur suivent la voix : un mot par réplique, puis « Tout est relié. » */
const FLASH = ["Encours", "Revenus", "Distribution", "Passif", "Performance", "Tout est relié."];

export const WallShot: React.FC = () => {
  const f = useCurrentFrame();
  const dolly = prog(f, 0, 170, EASE.premium);
  const flat = prog(f, 168, 40, EASE.premium);
  const collapse = prog(f, 214, 24, EASE.exit);
  let wi = -1;
  FLASH.forEach((_, i) => { if (f >= voAt("wall", i) - 2) wi = i; });
  const word = wi >= 0 ? FLASH[wi] : "";
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Stage persp={1300} origin="50% 50%">
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `translateZ(${mix(-600, 700, dolly) * (1 - flat)}px) scale(${1 - collapse})`, opacity: 1 - collapse * 0.6 }}>
          {WALL.map((n, i) => {
            const side = i % 2 ? 1 : -1, row = Math.floor(i / 2) % 2, depth = Math.floor(i / 4);
            const corridor = { x: side * 820, y: row ? 230 : -230, z: -depth * 900 - 200, ry: -side * 68 };
            const col = i % 4, r = Math.floor(i / 4);
            const grid = { x: (col - 1.5) * 470, y: (r - 1) * 268, z: 0, ry: 0 };
            const x = mix(corridor.x, grid.x, flat), y = mix(corridor.y, grid.y, flat), z = mix(corridor.z, grid.z, flat), ry = mix(corridor.ry, grid.ry, flat);
            const s = mix(0.42, 0.235, flat);
            return (
              <div key={i} style={{ position: "absolute", left: VIDEO.width / 2 - (VIDEO.width * s) / 2, top: VIDEO.height / 2 - (VIDEO.height * s) / 2, width: VIDEO.width * s, height: VIDEO.height * s,
                transform: `translate3d(${x}px, ${y}px, ${z}px) rotateY(${ry}deg)`, overflow: "hidden", border: `1.5px solid rgba(220,179,109,${0.3 + 0.4 * hash(i)})` }}>
                <div style={{ width: VIDEO.width, height: VIDEO.height, transform: `scale(${s})`, transformOrigin: "0 0" }}><Rec name={n} trim={(i * 37) % 90} /></div>
              </div>
            );
          })}
        </div>
      </Stage>
      <AbsoluteFill style={{ background: "radial-gradient(45% 40% at 50% 50%, rgba(0,0,0,0.75), transparent 80%)", opacity: 1 - flat }} />
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 470, textAlign: "center", opacity: (1 - flat * 0.85) * (1 - collapse), ...TYPE.display, fontSize: 150,
        color: wi === FLASH.length - 1 ? COLOR.goldInk : COLOR.ink, letterSpacing: "-0.01em", textShadow: "0 8px 60px rgba(0,0,0,0.95)" }}>
        {word}
      </div>
      <Note opacity={1 - collapse}>{NOTE_APP}</Note>
      <Grain />
    </AbsoluteFill>
  );
};

