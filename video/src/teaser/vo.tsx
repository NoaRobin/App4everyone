/**
 * Voix off et sous-titres. Les répliques (src/teaser/vo.json, écrit par music/voiceover.py) sont placées au début de leur
 * plan + `at` ; le sous-titre suit exactement la phrase prononcée.
 */
import type React from "react";
import { Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import VO from "./vo.json";
import { COLOR, TYPE, VIDEO } from "../theme";
import { prog } from "../lib/anim";
import { START, type Shot } from "./timeline";

export type VoLine = { shot: Shot; i: number; file: string; at: number; frames: number; text: string };
export const LINES = VO as VoLine[];
/** Début (image locale au plan) d'une réplique. */
export const voAt = (shot: Shot, i: number) => LINES.find((l) => l.shot === shot && l.i === i)?.at ?? 0;
export const voEnd = (shot: Shot, i: number) => { const l = LINES.find((x) => x.shot === shot && x.i === i); return l ? l.at + l.frames : 0; };

export const VoiceOver: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      {LINES.map((l) => (
        <Sequence key={l.file} name={`Voix · ${l.text.slice(0, 28)}`} from={START[l.shot] + l.at} durationInFrames={l.frames + 6} premountFor={fps}>
          <Audio src={staticFile(l.file)} volume={1} />
        </Sequence>
      ))}
    </>
  );
};

/** Plans où le texte à l'écran dit déjà la réplique : pas de sous-titre en double. */
const ON_SCREEN: Shot[] = ["rupture", "manifesto", "wall", "count", "sign"];

/** Sous-titres : sobres, centrés, au-dessus des mentions de bas de cadre. */
export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const l = LINES.find((x) => !ON_SCREEN.includes(x.shot) && frame >= START[x.shot] + x.at - 2 && frame < START[x.shot] + x.at + x.frames + 8);
  if (!l) return null;
  const s = START[l.shot] + l.at;
  const o = prog(frame, s - 2, 5) * (1 - prog(frame, s + l.frames + 3, 5));
  return (
    <div style={{ position: "absolute", left: 0, width: VIDEO.width, bottom: 112, display: "flex", justifyContent: "center", opacity: o }}>
      <span style={{ ...TYPE.label, fontSize: 34, fontWeight: 400, color: COLOR.ink, background: "rgba(0,0,0,0.62)", padding: "10px 22px", maxWidth: 1300, textAlign: "center", lineHeight: 1.35 }}>
        {l.text}
      </span>
    </div>
  );
};
