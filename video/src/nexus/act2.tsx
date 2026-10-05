/**
 * Acte II — « Tout ». Après la touche Entrée, l'application déferle : une coupe toutes les quatre mesures, une commande
 * tapée au début de chaque section, une impulsion sur chaque temps. Les prises sont celles de l'application, enregistrée
 * sur son jeu de données fictif ; seuls l'encours (50,3 Md€) et R-co Valor (10 Md€) sont des chiffres communiqués.
 */
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { COLOR, EASE, LAYOUT, TYPE } from "../theme";
import { hash, mix, prog } from "../lib/anim";
import { Extruded, Night, Note, NOTE_APP, NOTE_FACTS, Screen3D } from "../teaser/kit";
import { CameraRig, GlowSprite, Keyboard3D, useKeyboardAssets } from "./Keyboard3D";
import { KEY_BY_CODE } from "./layout";
import { BAR, FACTS } from "./timeline";
import { beatPunch, Command } from "./ui";

/** Une prise de l'application sur un écran 3D qui glisse, avec sa commande et sa mention. */
const AppShot: React.FC<{ name: string; cmd: string; trim?: number; rate?: number; from?: [number, number, number]; to?: [number, number, number]; scale?: number }> =
  ({ name, cmd, trim, rate, from = [-16, 6, -160], to = [-7, 2, 30], scale = 0.74 }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = prog(f, 0, durationInFrames, EASE.premium);
  const ry = mix(from[0], to[0], t), rx = mix(from[1], to[1], t), tz = mix(from[2], to[2], t);
  const inO = prog(f, 0, 5);
  return (
    <AbsoluteFill>
      <Night glow={1.2} />
      <AbsoluteFill style={{ perspective: 2200, opacity: inO, transform: `scale(${beatPunch(f)})` }}>
        <Screen3D name={name} trim={trim} rate={rate} scale={scale} transform={`translateZ(${tz}px) rotateY(${ry}deg) rotateX(${rx}deg)`} />
      </AbsoluteFill>
      <Command text={cmd} at={0} frame={f} />
      <Note>{NOTE_APP}</Note>
    </AbsoluteFill>
  );
};

/** 50,3 Md€ : le chiffre, en relief. */
const AumShot: React.FC = () => {
  const f = useCurrentFrame();
  const t = prog(f, 0, 40, EASE.signature);
  return (
    <AbsoluteFill>
      <Night glow={1.6} />
      <AbsoluteFill style={{ perspective: 1800, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", transform: `scale(${beatPunch(f, 0.02)})` }}>
        <div style={{ ...TYPE.eyebrow, fontSize: 30, color: COLOR.goldInk, marginBottom: 40, opacity: prog(f, 6, 14), letterSpacing: "0.3em" }}>Encours sous gestion</div>
        <div style={{ transform: `rotateY(${mix(-28, -10, t)}deg) rotateX(${mix(12, 4, t)}deg) scale(${mix(1.25, 1, t)})`, transformStyle: "preserve-3d", filter: `blur(${mix(14, 0, prog(f, 0, 14))}px)` }}>
          <Extruded text={FACTS.aum} size={300} depth={110} layers={30} />
        </div>
      </AbsoluteFill>
      <Command text="encours" at={0} frame={f} />
      <Note>{NOTE_FACTS}</Note>
    </AbsoluteFill>
  );
};

/** R-co Valor : la touche V devient une tour d'or ; les autres touches s'élèvent à peine (décor). */
const VALOR = KEY_BY_CODE.get("KeyV")!;
const ValorShot: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const assets = useKeyboardAssets();
  const rise = prog(f, 8, 64, EASE.signature);
  const t = prog(f, 0, 180, EASE.premium);
  const tower = 1 + 12 * rise;
  if (!assets) return <AbsoluteFill style={{ background: "#000" }} />;
  return (
    <AbsoluteFill style={{ background: "#020409" }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }}>
        <CameraRig cam={{ pos: [VALOR.x + mix(15, 11, t), mix(3.2, 6, t), VALOR.z + mix(21, 18, t)], target: [VALOR.x - 3.5, mix(3.4, 4.6, t), VALOR.z - 1], fov: 36 }} />
        <Keyboard3D ambient={0.8} pose={(k) => {
          if (k.code === "KeyV") return { height: tower, glow: 0.35 + 0.6 * rise };
          const d = Math.hypot(k.x - VALOR.x, k.z - VALOR.z);
          const r = prog(f, 8 + d * 1.4, 40, EASE.signature);
          return { height: 1 + 2.4 * hash(k.index * 13 + 5) * r, glow: 0.08 * r };
        }} />
        <GlowSprite pos={[VALOR.x, 0.62 * tower + 0.4, VALOR.z]} size={7} opacity={0.7 * rise} />
      </ThreeCanvas>
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 250, opacity: prog(f, 30, 16), transform: `translateY(${(1 - prog(f, 30, 20)) * 20}px)` }}>
        <div style={{ ...TYPE.eyebrow, fontSize: 28, color: COLOR.goldInk, letterSpacing: "0.28em" }}>Le plus gros fonds</div>
        <div style={{ ...TYPE.display, fontSize: 140, color: COLOR.ink, marginTop: 18 }}>R-co Valor</div>
        <div style={{ ...TYPE.display, fontSize: 120, color: COLOR.goldInk, fontStyle: "italic", marginTop: 6 }}>{FACTS.valor}</div>
      </div>
      <Command text="r-co valor" at={0} frame={f} />
      <Note>{NOTE_FACTS}</Note>
    </AbsoluteFill>
  );
};

/** Le globe, puis le Sankey : coupe à la moitié de la section. */
const PaysShot: React.FC = () => (
  <>
    <Sequence durationInFrames={BAR * 2}><AppShot name="globe" cmd="distribution · pays" rate={0.9} from={[14, 4, -120]} to={[6, 0, 20]} /></Sequence>
    <Sequence from={BAR * 2}><AppShot name="sankey" cmd="distribution · clients" rate={0.9} from={[-12, 4, -60]} to={[-4, 0, 40]} /></Sequence>
  </>
);

export const ActTwo: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Sequence durationInFrames={BAR * 3} premountFor={30}><AumShot /></Sequence>
    <Sequence from={BAR * 3} durationInFrames={BAR * 4} premountFor={30}><AppShot name="courbe" cmd="encours · jour, semaine, mois" from={[16, 6, -140]} to={[6, 1, 30]} /></Sequence>
    <Sequence from={BAR * 7} durationInFrames={BAR * 4} premountFor={30}><ValorShot /></Sequence>
    <Sequence from={BAR * 11} durationInFrames={BAR * 4} premountFor={30}><AppShot name="home" cmd="revenus estimés" /></Sequence>
    <Sequence from={BAR * 15} durationInFrames={BAR * 4} premountFor={30}><PaysShot /></Sequence>
    <Sequence from={BAR * 19} durationInFrames={BAR * 4} premountFor={30}><AppShot name="passif" cmd="passif · détenteurs" from={[14, 6, -120]} to={[5, 1, 30]} /></Sequence>
    <Sequence from={BAR * 23} durationInFrames={BAR * 4} premountFor={30}><AppShot name="comparateur" cmd="performances · comparer" rate={0.8} /></Sequence>
    <Sequence from={BAR * 27} durationInFrames={BAR * 4} premountFor={30}><AppShot name="recherche" cmd="fiche · frais de gestion" trim={170} from={[12, 5, -100]} to={[4, 0, 40]} /></Sequence>
  </AbsoluteFill>
);
