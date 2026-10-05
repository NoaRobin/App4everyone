/**
 * « Entrée » — la publicité Nexus (découpage dans timeline.ts). Le clavier 3D de l'application, l'application elle-même,
 * et l'extraction qui tourne pendant tout le film.
 *
 * Bande son : public/nexus/bande-son.wav (music/mixage_nexus.py) — « From Page to Practice » (FreePD, domaine public CC0)
 * et la voix off, déjà mixées.
 */
import type React from "react";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { prog } from "../lib/anim";
import { EASE } from "../theme";
import { ActOne } from "./act1";
import { ActTwo } from "./act2";
import { Compte, NexusEnd } from "./act3";
import { bar, EXTRACT_START, from, len } from "./timeline";
import { ExtractHud, Subtitles } from "./ui";

const Hud: React.FC = () => {
  const f = useCurrentFrame();
  if (f < EXTRACT_START + 20 || f >= from("nexus")) return null;
  const big = prog(f, from("compte"), 30, EASE.signature);
  const o = prog(f, EXTRACT_START + 20, 20) * (f < bar(40) ? 0.85 : 0.75 + 0.25 * big) * (1 - prog(f, from("nexus") - 14, 14));
  return (
    // pendant l'acte I, le compteur vit dans la bande noire du bas, comme un code temporel
    <ExtractHud frame={f} opacity={o} big={big} />
  );
};

export const Nexus: React.FC = () => {
  const f = useCurrentFrame();
  const letterbox = 1 - prog(f, bar(40), 6, EASE.premium);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sequence name="I · La question" durationInFrames={bar(41)} premountFor={30}><ActOne /></Sequence>
      <Sequence name="II · Tout" from={bar(41)} durationInFrames={bar(72) - bar(41)} premountFor={30}><ActTwo /></Sequence>
      <Sequence name="III · Le compte" from={from("compte")} durationInFrames={len("compte")} premountFor={30}><Compte /></Sequence>
      <Sequence name="III · Nexus" from={from("nexus")} durationInFrames={len("nexus")} premountFor={30}><NexusEnd /></Sequence>
      <Hud />
      <Subtitles letterbox={letterbox} />
      <Audio src={staticFile("nexus/bande-son.wav")} />
    </AbsoluteFill>
  );
};
