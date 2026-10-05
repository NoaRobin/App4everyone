/**
 * Transition « balayage d'or » : un filet d'or vertical traverse l'image de gauche à droite et découvre la scène
 * suivante derrière lui. C'est le fil du film qui fait la coupe.
 */
import type React from "react";
import { AbsoluteFill } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { COLOR } from "../theme";

type Props = Record<string, never>;

const GoldWipeComponent: React.FC<TransitionPresentationComponentProps<Props>> = ({ children, presentationDirection, presentationProgress }) => {
  const p = presentationProgress;
  if (presentationDirection === "exiting") {
    return <AbsoluteFill style={{ opacity: 1 - 0.35 * p }}>{children}</AbsoluteFill>;
  }
  const x = p * 100;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }}>{children}</AbsoluteFill>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${x}% - 1px)`, width: 2, background: COLOR.goldGlow,
        boxShadow: "0 0 24px 6px rgba(220,179,109,0.45), 0 0 80px 20px rgba(204,159,83,0.18)", opacity: p < 0.98 ? 1 : 0 }} />
    </AbsoluteFill>
  );
};

export const goldWipe = (): TransitionPresentation<Props> => ({ component: GoldWipeComponent, props: {} });
