/**
 * « Jasmine » — le film de 1 min 30 (voir timeline.ts pour la grille musicale et le découpage).
 * Musique : « Fireworks », FreePD (domaine public, CC0), extrait de 86,8 s à 176,8 s, fondu de fin.
 */
import type React from "react";
import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { COLOR } from "../theme";
import { Fees, Open, Search } from "./act1";
import { Export, ExportTitle, Fiche } from "./act2";
import { Excel, Recap, Sign } from "./act3";
import { from, len, ShotId } from "./timeline";

const SHOTS: [ShotId, React.FC][] = [
  ["open", Open], ["search", Search], ["fees", Fees], ["fiche", Fiche], ["exportTitle", ExportTitle],
  ["export", Export], ["excel", Excel], ["recap", Recap], ["sign", Sign],
];

export const Jasmine: React.FC = () => (
  <AbsoluteFill style={{ background: COLOR.paper }}>
    {SHOTS.map(([id, C]) => (
      <Sequence key={id} name={id} from={from(id)} durationInFrames={len(id)} premountFor={30}>
        <C />
      </Sequence>
    ))}
    <Audio src={staticFile("jasmine/fireworks.wav")} />
  </AbsoluteFill>
);
