/**
 * 07 — Partout où nous sommes autorisés. Un tableau des départs à palettes (angles vifs, drapeaux SVG locaux) :
 * chaque destination est un pays de commercialisation, avec son nombre de parts enregistrées.
 */
import type React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import * as FLAGS from "country-flag-icons/string/3x2";
import { Ambient, ChapterMark, Grain, Illustrative } from "../components/Chrome";
import { enter, hash, prog } from "../lib/anim";
import { SAMPLE } from "../data/sample";
import { COLOR, EASE, FONT, LAYOUT, NUMERIC, TYPE, VIDEO } from "../theme";

const ROWS = SAMPLE.countries.slice(0, 9);
const BOARD_X = 1000, BOARD_TOP = 300, ROW_H = 68;
const TILE_W = 38, TILE_H = 54, TILE_GAP = 4, TILES = 12;
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const OUT = 148;
const flag = (iso: string) => ((FLAGS as Record<string, string>)[iso] ?? "").replace("<svg", '<svg width="100%" height="100%" preserveAspectRatio="none"');

const Tile: React.FC<{ ch: string; flipping: boolean; dim: boolean }> = ({ ch, flipping, dim }) => (
  <div style={{ position: "relative", width: TILE_W, height: TILE_H, background: COLOR.paper2, border: `1px solid ${COLOR.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <span style={{ fontFamily: FONT.mono, fontSize: 32, color: dim ? COLOR.ink3 : COLOR.ink, opacity: ch === " " ? 0 : 1 }}>{ch}</span>
    <div style={{ position: "absolute", left: 0, right: 0, top: TILE_H / 2 - 0.5, height: 1, background: "rgba(0,0,0,0.65)" }} />
    {flipping && <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: TILE_H / 2, background: "rgba(0,0,0,0.35)" }} />}
  </div>
);

export const S07Departures: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Ambient />
      <ChapterMark n={6} label="Commercialisation" out={OUT} />
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 150, maxWidth: 760, ...enter(frame, 6, { dur: 22, out: OUT }) }}>
        <div style={{ ...TYPE.eyebrow, color: COLOR.goldInk, marginBottom: 22 }}>Pays de commercialisation</div>
        <div style={{ ...TYPE.title, color: COLOR.ink }}>Partout où nous sommes autorisés.</div>
      </div>
      <div style={{ position: "absolute", left: LAYOUT.safeX, top: 600, display: "flex", gap: 72, alignItems: "stretch" }}>
        {[
          { v: SAMPLE.countries.length, l: "pays", at: 30 },
          { v: SAMPLE.sharesRegistered, l: "parts enregistrées", at: 40 },
        ].map((s, i) => (
          <div key={s.l} style={{ ...enter(frame, s.at, { dur: 20, out: OUT }), paddingLeft: i ? 72 : 0, borderLeft: i ? `${LAYOUT.hairline}px solid ${COLOR.line2}` : undefined }}>
            <div style={{ ...TYPE.hero, fontSize: 200, color: COLOR.ink, ...NUMERIC }}>{Math.round(s.v * prog(frame, s.at, 40, EASE.count))}</div>
            <div style={{ ...TYPE.eyebrow, fontSize: 22, color: COLOR.ink3, marginTop: 12 }}>{s.l}</div>
          </div>
        ))}
      </div>
      {/* le tableau */}
      <div style={{ position: "absolute", left: BOARD_X, top: BOARD_TOP - 56, width: VIDEO.width - LAYOUT.safeX - BOARD_X, display: "flex", ...TYPE.eyebrow, fontSize: 20, color: COLOR.ink3, opacity: prog(frame, 14, 16) * (1 - prog(frame, OUT, 12, EASE.exit)) }}>
        <span style={{ marginLeft: 74 }}>Destination</span>
        <span style={{ marginLeft: "auto" }}>Parts</span>
      </div>
      {ROWS.map((c, r) => {
        const start = 26 + r * 5;
        const out = prog(frame, OUT + r * 2, 10, EASE.exit);
        const name = c.name.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").padEnd(TILES, " ").slice(0, TILES);
        let settledAll = true;
        const tiles = name.split("").map((ch, i) => {
          const flips = 4 + Math.floor(hash(r * 31 + i) * 6);
          const t0 = start + i * 1.5;
          const settle = t0 + flips * 2;
          if (frame < t0) { settledAll = false; return <Tile key={i} ch=" " flipping={false} dim />; }
          if (frame >= settle) return <Tile key={i} ch={ch} flipping={false} dim={false} />;
          settledAll = false;
          const step = Math.floor((frame - t0) / 2);
          const rnd = ALPHA[Math.floor(hash(r * 97 + i * 13 + step) * ALPHA.length)];
          return <Tile key={i} ch={rnd} flipping={(frame - t0) % 2 < 1} dim={false} />;
        });
        return (
          <div key={c.iso} style={{ position: "absolute", left: BOARD_X, top: BOARD_TOP + r * ROW_H, width: VIDEO.width - LAYOUT.safeX - BOARD_X, display: "flex", alignItems: "center", gap: TILE_GAP, opacity: prog(frame, start - 6, 8) * (1 - out) }}>
            <div style={{ width: 54, height: 36, marginRight: 16, border: `1px solid ${COLOR.line}`, overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: flag(c.iso) }} />
            {tiles}
            <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 32, color: settledAll ? COLOR.goldInk : COLOR.ink3, ...NUMERIC }}>{settledAll ? String(c.shares).padStart(3, " ") : "···"}</span>
          </div>
        );
      })}
      <Illustrative from={0} to={OUT + 20} />
      <Grain />
    </AbsoluteFill>
  );
};
