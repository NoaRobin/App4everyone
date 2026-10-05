import "./index.css";
import type React from "react";
import { Composition, Folder } from "remotion";
import { FilDor, SCENES, TOTAL } from "./Video";
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
import { VIDEO } from "./theme";
import { Teaser } from "./teaser/Teaser";
import { TEASER_TOTAL } from "./teaser/timeline";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="DixMinutes" component={Teaser} durationInFrames={TEASER_TOTAL} {...VIDEO} />
      <Composition id="FilDor" component={FilDor} durationInFrames={TOTAL} {...VIDEO} />
      <Folder name="Scenes">
        <Composition id="S01-Point" component={S01Point} durationInFrames={SCENES.point} {...VIDEO} />
        <Composition id="S02-Bruit" component={S02Noise} durationInFrames={SCENES.noise} {...VIDEO} />
        <Composition id="S03-Courbe" component={S03Curve} durationInFrames={SCENES.curve} {...VIDEO} />
        <Composition id="S04-Granularite" component={S04Granularity} durationInFrames={SCENES.granularity} {...VIDEO} />
        <Composition id="S05-Equation" component={S05Equation} durationInFrames={SCENES.equation} {...VIDEO} />
        <Composition id="S06-Cite" component={S06City} durationInFrames={SCENES.city} {...VIDEO} />
        <Composition id="S07-Departs" component={S07Departures} durationInFrames={SCENES.departures} {...VIDEO} />
        <Composition id="S08-Passif" component={S08Holders} durationInFrames={SCENES.holders} {...VIDEO} />
        <Composition id="S09-Application" component={S09App} durationInFrames={SCENES.app} {...VIDEO} />
        <Composition id="S10-Signature" component={S10Signature} durationInFrames={SCENES.signature} {...VIDEO} />
      </Folder>
    </>
  );
};
