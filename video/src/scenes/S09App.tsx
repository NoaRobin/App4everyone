/**
 * 09 — Une seule application. Le filet vertical (fin de la scène 8) libère les écrans de l'application, captés sur son
 * jeu fictif : ils se rangent en pile 3D à angles vifs, puis se déploient de face en planche 3 × 2. Sortie : la planche
 * se replie sur un filet horizontal (raccord avec la signature).
 */
import type React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { Ambient, ChapterMark, Grain, Illustrative } from "../components/Chrome";
import { enter, mix, prog } from "../lib/anim";
import { COLOR, EASE, LAYOUT, TYPE, VIDEO } from "../theme";

const SCREENS = [
  { f: "accueil", l: "Accueil" }, { f: "encours", l: "Encours" }, { f: "fonds", l: "Fiche fonds" },
  { f: "distribution", l: "Distribution" }, { f: "passif", l: "Passif" }, { f: "comparateur", l: "Comparateur" },
];
const IW = 1600, IH = 1000;
const GRID = { scale: 0.25, gap: 48, top: 330 };
const GW = IW * GRID.scale, GH = IH * GRID.scale;
const GRID_X = (VIDEO.width - (3 * GW + 2 * GRID.gap)) / 2;
const FAN_AT = 96, FOLD_AT = 156;
export const FOLD_LINE = { x0: GRID_X, x1: VIDEO.width - GRID_X, y: VIDEO.height / 2 };

export const S09App: React.FC = () => {
  const frame = useCurrentFrame();
  const fold = prog(frame, FOLD_AT, 22, EASE.exit);
  const vline = 1 - prog(frame, 6, 18, EASE.exit);
  const lineH = prog(frame, FOLD_AT + 8, 14, EASE.signature);
  return (
    <AbsoluteFill>
      <Ambient glow={1.1} />
      <ChapterMark n={8} label="L'application" out={FOLD_AT - 4} />
      {/* raccord : le filet vertical de la scène 8 s'efface quand le premier écran en sort */}
      <div style={{ position: "absolute", left: VIDEO.width / 2 - 1, top: 0, width: 2, height: VIDEO.height, background: COLOR.gold, opacity: vline }} />
      <div style={{ position: "absolute", inset: 0, perspective: 2600, perspectiveOrigin: "60% 45%", transform: `scaleY(${1 - fold * 0.995})`, transformOrigin: `50% ${FOLD_LINE.y}px` }}>
        {SCREENS.map((s, i) => {
          const a = prog(frame, 8 + i * 5, 22, EASE.signature);
          // pile : décalés en profondeur, tournés de trois quarts
          const sx = 820 + i * 90, sy = 320 + i * 22, sz = -i * 170;
          const stack = { x: sx + (1 - a) * 260, y: sy, z: sz, ry: -28, rx: 6, s: 0.46 };
          // planche 3 × 2 de face
          const col = i % 3, row = Math.floor(i / 3);
          const grid = { x: GRID_X + col * (GW + GRID.gap), y: GRID.top + row * (GH + GRID.gap), z: 0, ry: 0, rx: 0, s: GRID.scale };
          const fi = prog(frame, FAN_AT + (5 - i) * 2, 30, EASE.premium);
          const x = mix(stack.x, grid.x, fi), y = mix(stack.y, grid.y, fi), z = mix(stack.z, grid.z, fi);
          const ry = mix(stack.ry, grid.ry, fi), rx = mix(stack.rx, grid.rx, fi), sc = mix(stack.s, grid.s, fi);
          return (
            <div key={s.f} style={{ position: "absolute", left: 0, top: 0, width: IW, height: IH, transformOrigin: "0 0",
              transform: `translate3d(${x}px, ${y}px, ${z}px) rotateY(${ry}deg) rotateX(${rx}deg) scale(${sc})`, opacity: a, zIndex: 10 - i }}>
              <Img src={staticFile(`app/${s.f}.jpg`)} style={{ width: IW, height: IH, display: "block", border: `3px solid ${COLOR.line2}`, boxShadow: "0 60px 120px -40px rgba(0,0,0,0.9)" }} />
              <div style={{ position: "absolute", left: 0, top: IH + 36, ...TYPE.eyebrow, fontSize: 64, color: COLOR.ink2, opacity: prog(frame, FAN_AT + 22, 16) }}>
                <span style={{ color: COLOR.goldInk }}>{String(i + 1).padStart(2, "0")}</span>&nbsp;&nbsp;{s.l}
              </div>
            </div>
          );
        })}
      </div>
      {/* raccord : le filet horizontal de la signature */}
      <div style={{ position: "absolute", left: FOLD_LINE.x0, width: FOLD_LINE.x1 - FOLD_LINE.x0, top: FOLD_LINE.y - 1, height: 2, background: COLOR.gold, opacity: lineH, boxShadow: "0 0 14px rgba(220,179,109,0.5)" }} />

      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 150, ...enter(frame, 10, { dur: 22, out: FOLD_AT - 6 }) }}>
        <div style={{ ...TYPE.eyebrow, color: COLOR.goldInk, marginBottom: 22 }}>Encours · fonds · distribution · passif · comparateur</div>
        <div style={{ ...TYPE.title, color: COLOR.ink, }}>Une seule application.</div>
      </div>
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 360, maxWidth: 560, ...enter(frame, 30, { dur: 20, out: FAN_AT - 8 }) }}>
        <div style={{ ...TYPE.lede, fontSize: 44, color: COLOR.ink2 }}>Toutes les données de la gestion, lues au même endroit, du jour à l'année.</div>
      </div>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: GRID.top + 2 * GH + GRID.gap + 46, textAlign: "center", ...TYPE.eyebrow, fontSize: 24, color: COLOR.goldInk, ...enter(frame, FAN_AT + 30, { dur: 18, out: FOLD_AT - 6 }) }}>
        Locale&nbsp;&nbsp;·&nbsp;&nbsp;En lecture seule&nbsp;&nbsp;·&nbsp;&nbsp;Sans service externe
      </div>
      <Illustrative from={10} to={FOLD_AT} />
      <Grain />
    </AbsoluteFill>
  );
};
