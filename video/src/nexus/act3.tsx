/**
 * Acte III — le compte, puis le nom. L'extraction lancée au début du film n'en est qu'à un sixième : l'application,
 * elle, a tout montré. Puis, sur le piano, les touches N, E, X, U, S s'allument une à une, se lèvent du clavier et
 * s'alignent face à la caméra.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { COLOR, EASE, TYPE, VIDEO } from "../theme";
import { mix, prog, tracking } from "../lib/anim";
import { Night } from "../teaser/kit";
import { Grain } from "../components/Chrome";
import { CameraRig, GlowSprite, Keyboard3D, KeyPose, useKeyboardAssets, V3 } from "./Keyboard3D";
import { KEY_BY_CODE, KeyInfo } from "./layout";
import { add, pressPose, Press } from "./keys";
import { BAR, from, vo } from "./timeline";

/** Le compte : deux phrases sous le compteur (le compteur lui-même est le calque global, agrandi au centre). */
export const Compte: React.FC = () => {
  const f = useCurrentFrame();
  const a = vo("compte").at - from("compte"), b = vo("montre").at - from("compte");
  return (
    <AbsoluteFill>
      <Night cold glow={0.8} />
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 640, textAlign: "center", opacity: prog(f, a - 4, 14) }}>
        <span style={{ ...TYPE.title, fontSize: 60, color: COLOR.ink2 }}>Pendant ce film, une extraction JUMP n'aurait pas fini.</span>
      </div>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 740, textAlign: "center", opacity: prog(f, b - 4, 14), transform: `translateY(${(1 - prog(f, b - 4, 20)) * 16}px)` }}>
        <span style={{ ...TYPE.display, fontSize: 84, fontStyle: "italic", color: COLOR.goldInk }}>L'application, elle, vous a tout montré.</span>
      </div>
      <Grain />
    </AbsoluteFill>
  );
};

const WORD = ["KeyN", "KeyE", "KeyX", "KeyU", "KeyS"];
const SLOT = (i: number): V3 => [(i - 2) * 3.15, 6.6, 5];
const FACE = 1.29;   // inclinaison qui tourne le dessus des touches vers la caméra

export const NexusEnd: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const assets = useKeyboardAssets();
  const presses: Press[] = WORD.map((code, i) => ({ code, at: i * BAR, force: 1 }));
  const nom = vo("nom").at - from("nexus");
  const sig = vo("signature").at - from("nexus");
  const all = prog(f, WORD.length * BAR + 10, 40, EASE.premium);
  const flare = f >= nom ? Math.exp(-(f - nom) / 30) : 0;
  const t = prog(f, 0, durationInFrames, EASE.premium);
  const pose = (k: KeyInfo): KeyPose => {
    const i = WORD.indexOf(k.code);
    const base = add(pressPose(k, presses, f), { legend: mix(1, 0.3, all), glow: 0 });
    if (i < 0) return { ...base, opacity: mix(1, 0.85, all) };
    const lift = prog(f, i * BAR + 5, 44, EASE.signature);
    const home = KEY_BY_CODE.get(k.code)!;
    const s = SLOT(i);
    const hover = 0.12 * Math.sin((f - i * 9) / 22) * lift;
    return { ...base, legend: 1, glow: Math.min(1.6, (base.glow ?? 0) + 0.55 * lift + 0.9 * flare),
      offset: [(s[0] - home.x) * lift, (s[1] + hover) * lift, (s[2] - home.z) * lift], rot: [FACE * lift, 0, 0], scale: mix(1, 1.75, lift) };
  };
  const tag = prog(f, sig - 4, 16) * (1 - prog(f, 412, 16));
  const house = prog(f, 428, 18);
  const soon = prog(f, 470, 18);
  const black = prog(f, durationInFrames - 42, 40, EASE.premium);
  if (!assets) return <AbsoluteFill style={{ background: "#000" }} />;
  return (
    <AbsoluteFill style={{ background: "#020409" }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }}>
        <CameraRig cam={{ pos: [0, mix(13, 11.6, t), mix(26, 22.5, t)], target: [0, mix(4.2, 4.8, t), 0], fov: 32 }} />
        <Keyboard3D pose={pose} ambient={mix(0.75, 0.42, all)} />
        <GlowSprite pos={[0, 6.6, 5.3]} size={26} opacity={0.18 * all + 0.35 * flare} />
      </ThreeCanvas>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 790, textAlign: "center", opacity: tag }}>
        <span style={{ ...TYPE.title, fontSize: 60, color: COLOR.ink }}>Toutes les informations métiers. </span>
        <span style={{ ...TYPE.title, fontSize: 60, color: COLOR.goldInk, fontStyle: "italic" }}>Au même endroit.</span>
      </div>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 780, textAlign: "center", opacity: house }}>
        <div style={{ ...TYPE.display, fontSize: 72, color: COLOR.ink }}>Rothschild &amp; Co</div>
        <div style={{ ...TYPE.eyebrow, fontSize: 26, color: COLOR.goldInk, marginTop: 14, letterSpacing: tracking(f, 428, 50, 0.6, 0.38) }}>Asset Management</div>
      </div>
      <div style={{ position: "absolute", right: 144, top: 980, opacity: soon }}>
        <span style={{ ...TYPE.display, fontSize: 52, fontStyle: "italic", color: COLOR.goldInk }}>Bientôt.</span>
      </div>
      <Grain />
      <AbsoluteFill style={{ background: "#000", opacity: black }} />
    </AbsoluteFill>
  );
};
