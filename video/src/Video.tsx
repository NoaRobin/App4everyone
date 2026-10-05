/**
 * « Le fil d'or » — montage. Raccords sur le fil entre les scènes 1 → 5 et 8 → 10 (coupes franches, géométrie identique de
 * part et d'autre) ; balayage d'or vers la cité et vers le passif ; fondu vers le tableau des départs.
 */
import type React from "react";
import { staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { goldWipe } from "./components/GoldWipe";
import { S01Point } from "./scenes/S01Point";
import { S02Noise } from "./scenes/S02Noise";
import { S03Curve } from "./scenes/S03Curve";
import { S04Granularity } from "./scenes/S04Granularity";
import { S05Equation } from "./scenes/S05Equation";
import { S06City } from "./scenes/S06City";
import { S07Departures } from "./scenes/S07Departures";
import { S08Holders } from "./scenes/S08Holders";
import { S09App } from "./scenes/S09App";
import { S10Signature } from "./scenes/S10Signature";
import { EASE } from "./theme";

/** Durées (images) — reprises par Root.tsx et par la partition (music/score.py). */
export const SCENES = {
  point: 120, noise: 150, curve: 240, granularity: 180, equation: 180, city: 240, departures: 180, holders: 150, app: 180, signature: 120,
} as const;
export const WIPE = 24;
export const FADE = 18;
export const TOTAL = Object.values(SCENES).reduce((a, b) => a + b, 0) - 2 * WIPE - FADE;

export const FilDor: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence name="01 Point" durationInFrames={SCENES.point} premountFor={fps}><S01Point /></TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="02 Bruit" durationInFrames={SCENES.noise} premountFor={fps}><S02Noise /></TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="03 Courbe" durationInFrames={SCENES.curve} premountFor={fps}><S03Curve /></TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="04 Granularité" durationInFrames={SCENES.granularity} premountFor={fps}><S04Granularity /></TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="05 Équation" durationInFrames={SCENES.equation} premountFor={fps}><S05Equation /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={goldWipe()} timing={linearTiming({ durationInFrames: WIPE, easing: EASE.premium })} />
        <TransitionSeries.Sequence name="06 Cité" durationInFrames={SCENES.city} premountFor={fps}><S06City /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: FADE, easing: EASE.premium })} />
        <TransitionSeries.Sequence name="07 Départs" durationInFrames={SCENES.departures} premountFor={fps}><S07Departures /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={goldWipe()} timing={linearTiming({ durationInFrames: WIPE, easing: EASE.premium })} />
        <TransitionSeries.Sequence name="08 Passif" durationInFrames={SCENES.holders} premountFor={fps}><S08Holders /></TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="09 Application" durationInFrames={SCENES.app} premountFor={fps}><S09App /></TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="10 Signature" durationInFrames={SCENES.signature} premountFor={fps}><S10Signature /></TransitionSeries.Sequence>
      </TransitionSeries>
      <Audio src={staticFile("music.wav")} />
    </>
  );
};
