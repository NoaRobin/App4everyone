/**
 * « Dix minutes » — le film. Coupes franches sur les temps ; le compteur d'extraction JUMP court en surimpression du
 * lancement jusqu'au compte final, sans jamais s'arrêter.
 */
import type React from "react";
import { AbsoluteFill, Series, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { Launch, Ritual, Rupture } from "./act1";
import { Manifesto } from "./act2a";
import { DistributionShot, PassifShot, PerfShot, RevenusShot, SearchShot, WallShot } from "./act2b";
import { Count, Sign } from "./act3";
import { FabricShot } from "./fabric";
import { JumpHud } from "./kit";
import { Subtitles, VoiceOver } from "./vo";
import { JUMP_START, SHOTS, START } from "./timeline";

const Hud: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < JUMP_START + 20 || frame >= START.count) return null;
  // discret pendant les plans de l'application, plus présent pendant l'attente
  const op = frame < START.manifesto ? 1 : 0.85;
  return <JumpHud globalFrame={frame} opacity={op} />;
};

export const Teaser: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Series>
        <Series.Sequence name="I · Lancement" durationInFrames={SHOTS.launch} premountFor={fps}><Launch /></Series.Sequence>
        <Series.Sequence name="I · Le rituel" durationInFrames={SHOTS.ritual} premountFor={fps}><Ritual /></Series.Sequence>
        <Series.Sequence name="I · La rupture" durationInFrames={SHOTS.rupture} premountFor={fps}><Rupture /></Series.Sequence>
        <Series.Sequence name="I · Comment ça marche" durationInFrames={SHOTS.fabric} premountFor={fps}><FabricShot /></Series.Sequence>
        <Series.Sequence name="II · Manifeste" durationInFrames={SHOTS.manifesto} premountFor={fps}><Manifesto /></Series.Sequence>
        <Series.Sequence name="II · Revenus" durationInFrames={SHOTS.revenus} premountFor={fps}><RevenusShot /></Series.Sequence>
        <Series.Sequence name="II · Distribution" durationInFrames={SHOTS.distribution} premountFor={fps}><DistributionShot /></Series.Sequence>
        <Series.Sequence name="II · Passif" durationInFrames={SHOTS.passif} premountFor={fps}><PassifShot /></Series.Sequence>
        <Series.Sequence name="II · Performance" durationInFrames={SHOTS.perf} premountFor={fps}><PerfShot /></Series.Sequence>
        <Series.Sequence name="II · Recherche" durationInFrames={SHOTS.search} premountFor={fps}><SearchShot /></Series.Sequence>
        <Series.Sequence name="II · Le mur" durationInFrames={SHOTS.wall} premountFor={fps}><WallShot /></Series.Sequence>
        <Series.Sequence name="III · Le compte" durationInFrames={SHOTS.count} premountFor={fps}><Count /></Series.Sequence>
        <Series.Sequence name="III · Signature" durationInFrames={SHOTS.sign} premountFor={fps}><Sign /></Series.Sequence>
      </Series>
      <Hud />
      <Subtitles />
      <VoiceOver />
      <Audio src={staticFile("teaser.wav")} />
    </AbsoluteFill>
  );
};
