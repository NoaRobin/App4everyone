/**
 * Acte III — Le compte. Silence. La barre d'extraction revient, au temps exact écoulé depuis le début du film : elle
 * n'est pas finie. « L'application, elle, vous a tout montré. » La barre se défait en fil d'or, puis la signature.
 */
import type React from "react";
import { MarkStatic } from "../jasmine/kit";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { GoldPoint, Grain } from "../components/Chrome";
import { mix, prog, tracking } from "../lib/anim";
import { COLOR, EASE, FONT, NUMERIC, TYPE, VIDEO } from "../theme";
import { Letterbox, Night } from "./kit";
import { JUMP_DURATION_S, jumpElapsed, mmss, SHOTS, START } from "./timeline";

const SIGN_END = SHOTS.sign;

export const Count: React.FC = () => {
  const frame = useCurrentFrame();
  const g = START.count + frame;
  const s = jumpElapsed(g);
  const p = s / JUMP_DURATION_S;
  const box = prog(frame, 0, 24, EASE.premium);
  const l1 = prog(frame, 40, 20), l2 = prog(frame, 76, 20), l3 = prog(frame, 196, 26);
  const unravel = prog(frame, 300, 50, EASE.premium);
  const W = 1200;
  return (
    <AbsoluteFill>
      <Night cold glow={0.5} />
      <div style={{ position: "absolute", left: (VIDEO.width - W) / 2, top: 300, width: W, opacity: box }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 22, opacity: 1 - unravel }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 26, color: "#9aa1ad", letterSpacing: "0.08em" }}>EXTRACTION JUMP</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 64, color: COLOR.ink, ...NUMERIC }}>{mmss(s)} <span style={{ color: "#5d6470", fontSize: 40 }}>/ 10:00</span></span>
        </div>
        <div style={{ position: "relative", height: 26, background: unravel > 0 ? "transparent" : "#141920", border: `1px solid rgba(42,49,59,${1 - unravel})` }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${p * 100}%`, background: "#9aa1ad", opacity: 1 - unravel }} />
          {/* le fil d'or se tire hors de la barre */}
          <div style={{ position: "absolute", left: 0, top: 12, height: 2, width: `${mix(p * 100, 100, unravel)}%`, background: COLOR.gold, opacity: unravel, boxShadow: "0 0 18px rgba(220,179,109,0.6)" }} />
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 24, color: "#5d6470", marginTop: 16, opacity: 1 - unravel, ...NUMERIC }}>{(p * 100).toFixed(0)} % · encore {Math.ceil((JUMP_DURATION_S - s) / 60)} minutes environ</div>
      </div>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 540, textAlign: "center" }}>
        <div style={{ ...TYPE.title, fontSize: 84, color: COLOR.ink2, opacity: l1 * (1 - prog(frame, 186, 12)), transform: `translateY(${(1 - l1) * 18}px)` }}>Pendant ce film,</div>
        <div style={{ ...TYPE.title, fontSize: 84, color: COLOR.ink, opacity: l2 * (1 - prog(frame, 186, 12)), transform: `translateY(${(1 - l2) * 18}px)` }}>une extraction JUMP n'aurait pas fini.</div>
      </div>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: 590, textAlign: "center", opacity: l3 * (1 - prog(frame, 330, 20)), transform: `translateY(${(1 - l3) * 22}px)` }}>
        <div style={{ ...TYPE.display, fontSize: 124, fontStyle: "italic", color: COLOR.goldInk }}>L'application, elle, vous a tout montré.</div>
      </div>
      <Letterbox k={prog(frame, 0, 30, EASE.premium)} />
      <Grain />
    </AbsoluteFill>
  );
};

export const Sign: React.FC = () => {
  const frame = useCurrentFrame();
  const CY = 500;
  const line = prog(frame, 0, 36, EASE.signature);
  const half = mix(600, 300, line);
  const name = prog(frame, 14, 30), am = prog(frame, 30, 30), tag = prog(frame, 96, 26), soon = prog(frame, 176, 26);
  const black = prog(frame, 200, 30, EASE.premium);
  // le nom de l'application, sur le noir : un point d'or, un trait qui s'étire, puis le jasmin et « Jasmine »
  const NX = 222;
  const nxPoint = prog(frame, NX, 18), nxLine = prog(frame, NX + 10, 40, EASE.signature);
  const nxName = prog(frame, NX + 22, 36, EASE.premium), nxOut = prog(frame, SIGN_END - 34, 32, EASE.premium);
  const nxHalf = mix(0, 330, nxLine);
  return (
    <AbsoluteFill>
      <Night glow={1.5} />
      <div style={{ position: "absolute", left: VIDEO.width / 2 - half, width: half * 2, top: CY - 1, height: 2, background: `linear-gradient(90deg, ${COLOR.gold}, ${COLOR.goldGlow})`, boxShadow: "0 0 14px rgba(220,179,109,0.5)" }} />
      <GoldPoint x={VIDEO.width / 2 + half} y={CY} size={12} glow={1.2} style={{ opacity: line }} />
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: CY - 196, textAlign: "center", opacity: name, transform: `translateY(${(1 - name) * 26}px)` }}>
        <span style={{ ...TYPE.display, fontSize: 150, color: COLOR.ink }}>Rothschild &amp; Co</span>
      </div>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: CY + 40, textAlign: "center", ...TYPE.eyebrow, fontSize: 34, color: COLOR.goldInk, opacity: am, letterSpacing: tracking(frame, 30, 50, 0.7, 0.42) }}>
        Asset Management
      </div>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: CY + 190, textAlign: "center", opacity: tag, transform: `translateY(${(1 - tag) * 18}px)` }}>
        <span style={{ ...TYPE.title, fontSize: 64, color: COLOR.ink2 }}>Toutes les informations métiers. Au même endroit.</span>
      </div>
      <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: CY + 300, textAlign: "center", opacity: soon }}>
        <span style={{ ...TYPE.display, fontSize: 96, fontStyle: "italic", color: COLOR.goldInk }}>Bientôt.</span>
      </div>
      <Grain />
      <AbsoluteFill style={{ background: "#000", opacity: black }} />
      <AbsoluteFill style={{ opacity: 1 - nxOut }}>
        <div style={{ position: "absolute", left: 0, width: VIDEO.width, top: CY - 330, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: nxName, transform: `translateY(${(1 - nxName) * 22}px)` }}>
          <div style={{ transform: `rotate(${mix(-40, 0, nxName)}deg) scale(${mix(0.6, 1, nxName)})` }}><MarkStatic size={190} glow={0.9} /></div>
          <span style={{ ...TYPE.display, fontSize: 200, color: COLOR.ink, letterSpacing: tracking(frame, NX + 22, 60, 0.12, 0.02) }}>Jasmine</span>
        </div>
        <div style={{ position: "absolute", left: VIDEO.width / 2 - nxHalf, width: nxHalf * 2, top: CY + 96, height: 2, background: `linear-gradient(90deg, transparent, ${COLOR.gold} 30%, ${COLOR.goldGlow} 70%, transparent)`, boxShadow: "0 0 14px rgba(220,179,109,0.45)", opacity: nxLine }} />
        <GoldPoint x={VIDEO.width / 2} y={CY + 97} size={12} glow={1.2} style={{ opacity: nxPoint * (1 - 0.6 * nxLine) }} />
      </AbsoluteFill>
      <Letterbox k={prog(frame, 180, 30, EASE.premium)} />
    </AbsoluteFill>
  );
};

