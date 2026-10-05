/**
 * 02 — Le bruit des données brutes. Des colonnes de valeurs (toutes fictives) défilent de part et d'autre du filet,
 * puis s'y condensent : le filet s'épaissit, la lecture devient une.
 */
import type React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Ambient, ChapterMark, Grain } from "../components/Chrome";
import { enter, hash, mix, prog } from "../lib/anim";
import { int } from "../lib/format";
import { SAMPLE } from "../data/sample";
import { COLOR, EASE, FONT, LAYOUT, NUMERIC, TYPE, VIDEO } from "../theme";

const CY = VIDEO.height / 2;
const COLS = 26;
const ROWS = 40;
const ROW_H = 34;

/** Valeurs plausibles et anonymes : dates, VL, montants, quantités, codes génériques. */
function glyph(c: number, r: number): string {
  const h = hash(c * 97 + r * 13);
  const k = Math.floor(h * 6);
  const n = hash(c * 31 + r * 71);
  if (k === 0) return `2026-0${1 + Math.floor(n * 9)}-${String(10 + Math.floor(n * 18))}`;
  if (k === 1) return `${(80 + n * 140).toFixed(2).replace(".", ",")}`;
  if (k === 2) return `${n > 0.5 ? "+" : "−"}${Math.floor(n * 9000)} ${String(Math.floor(n * 999)).padStart(3, "0")}`;
  if (k === 3) return `P${String(Math.floor(n * 99999)).padStart(5, "0")}`;
  if (k === 4) return `${(n * 2).toFixed(4).replace(".", ",")}`;
  return `${Math.floor(n * 40)} ${String(Math.floor(hash(n) * 999)).padStart(3, "0")},${String(Math.floor(n * 99)).padStart(2, "0")}`;
}

export const S02Noise: React.FC = () => {
  const frame = useCurrentFrame();
  const counter = prog(frame, 6, 44, EASE.count);
  const thick = prog(frame, 78, 40, EASE.premium);
  const lineH = mix(LAYOUT.hairline, LAYOUT.stroke, thick);
  const colW = (VIDEO.width - 2 * LAYOUT.safeX) / (COLS - 1);
  const cells: React.ReactNode[] = [];
  for (let c = 0; c < COLS; c++) {
    const x = LAYOUT.safeX + c * colW;
    const speed = (0.6 + hash(c) * 1.6) * (c % 2 ? 1 : -1);
    const delay = (Math.abs(x - VIDEO.width / 2) / (VIDEO.width / 2)) * 16;
    const conv = prog(frame, 68 + delay, 30, EASE.signature);
    for (let r = 0; r < ROWS; r++) {
      const span = ROWS * ROW_H;
      let y = ((r * ROW_H + speed * frame * 2 + hash(c + 5) * span) % span + span) % span - 120;
      const dist = Math.abs(y - CY);
      if (dist < 56 || y < -30 || y > VIDEO.height + 30) continue;
      y = CY + (y - CY) * (1 - conv);
      const near = 1 - Math.min(1, dist / 520);
      const o = (0.1 + 0.22 * near + 0.12 * hash(c * r)) * prog(frame, (c % 7) * 2, 14) * (1 - conv * 0.95);
      if (o < 0.01) continue;
      cells.push(
        <div key={`${c}-${r}`} style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", fontFamily: FONT.mono, fontSize: 18, color: hash(c * 3 + r) > 0.93 ? COLOR.goldInk : COLOR.ink3, opacity: o, whiteSpace: "nowrap" }}>
          {glyph(c, r)}
        </div>,
      );
    }
  }
  return (
    <AbsoluteFill>
      <Ambient glow={mix(1, 1.4, thick)} />
      {cells}
      <AbsoluteFill style={{ background: "radial-gradient(48% 42% at 22% 22%, rgba(6,11,21,0.92), rgba(6,11,21,0) 100%)" }} />
      <div
        style={{
          position: "absolute", left: 0, width: VIDEO.width, top: CY - lineH / 2, height: lineH,
          background: `linear-gradient(90deg, rgba(204,159,83,0.15), ${COLOR.gold} 25%, ${COLOR.goldGlow} 50%, ${COLOR.gold} 75%, rgba(204,159,83,0.15))`,
          boxShadow: `0 0 ${mix(12, 30, thick)}px rgba(220,179,109,${mix(0.35, 0.6, thick)})`,
        }}
      />
      <ChapterMark n={1} label="Les données" out={132} />
      {/* Titre 1 : le volume */}
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 150, ...enter(frame, 4, { dur: 22, out: 90 }) }}>
        <div style={{ ...TYPE.eyebrow, color: COLOR.goldInk, marginBottom: 26 }}>Chaque jour, dans Fabric</div>
        <div style={{ ...TYPE.display, color: COLOR.ink, ...NUMERIC }}>
          {int(Math.round(counter * SAMPLE.cells / 1e6))} millions
          <br />
          <span style={{ color: COLOR.ink2 }}>de cellules.</span>
        </div>
      </div>
      {/* Titre 2 : la lecture */}
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: CY + 70, textAlign: "center", ...enter(frame, 98, { dur: 24, out: 132, outDur: 14 }) }}>
        <span style={{ ...TYPE.title, fontStyle: "italic", color: COLOR.ink }}>Une seule lecture.</span>
      </div>
      <Grain />
    </AbsoluteFill>
  );
};
