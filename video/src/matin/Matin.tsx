/**
 * « Le matin » — film de 1 min 30 (voir timeline.ts). Bande son unique (musique, voix off, tic-tac) : music/matin.py.
 */
import type React from "react";
import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { Fabric, Gap, Mornings, Tools } from "./act1";
import { Drop, More, Reel } from "./act2";
import { Carnet, Cutoff, Epilogue, Excel, Fees, Finale, Rank } from "./act3";
import { from, len, ShotId } from "./timeline";

const SHOTS: [ShotId, React.FC][] = [
  ["mornings", Mornings], ["tools", Tools], ["fabric", Fabric], ["gap", Gap], ["drop", Drop], ["more", More], ["reel", Reel],
  ["fees", Fees], ["cutoff", Cutoff], ["rank", Rank], ["carnet", Carnet], ["excel", Excel], ["finale", Finale], ["epilogue", Epilogue],
];

export const Matin: React.FC = () => (
  <AbsoluteFill style={{ background: "#020305" }}>
    {SHOTS.map(([id, C]) => (
      <Sequence key={id} name={id} from={from(id)} durationInFrames={len(id)} premountFor={30}>
        <C />
      </Sequence>
    ))}
    <Audio src={staticFile("matin/bande-son.wav")} />
  </AbsoluteFill>
);
