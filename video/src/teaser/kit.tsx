/**
 * Éléments du film « Dix minutes » : bandes cinéma, compteur d'extraction JUMP, mentions, écran 3D qui diffuse une prise
 * de l'application, texte extrudé en couches.
 */
import type React from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { COLOR, FONT, LAYOUT, NUMERIC, TYPE, VIDEO } from "../theme";
import { prog } from "../lib/anim";
import { JUMP_DURATION_S, jumpElapsed, mmss } from "./timeline";

/** Bandes noires (format cinéma) : `k` = 1 fermées, 0 ouvertes. */
export const Letterbox: React.FC<{ k: number }> = ({ k }) => {
  const h = 128 * k;
  if (h < 0.5) return null;
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: h, background: "#000" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, background: "#000" }} />
    </>
  );
};

/** Compteur d'extraction JUMP (temps du film depuis le lancement), en bas à droite. */
export const JumpHud: React.FC<{ globalFrame: number; opacity?: number }> = ({ globalFrame, opacity = 1 }) => {
  const s = jumpElapsed(globalFrame);
  const p = Math.min(1, s / JUMP_DURATION_S);
  const blink = Math.floor(globalFrame / 15) % 2 === 0;
  return (
    <div style={{ position: "absolute", right: LAYOUT.safeX, bottom: 44, display: "flex", alignItems: "center", gap: 16, opacity,
      padding: "10px 16px", background: "rgba(0,0,0,0.55)", border: `1px solid ${COLOR.line2}` }}>
      <span style={{ width: 10, height: 10, background: blink ? COLOR.down : "transparent", border: `1.5px solid ${COLOR.down}` }} />
      <span style={{ fontFamily: FONT.mono, fontSize: 20, color: COLOR.ink3, letterSpacing: "0.08em" }}>EXTRACTION JUMP</span>
      <span style={{ fontFamily: FONT.mono, fontSize: 22, color: COLOR.ink, ...NUMERIC }}>{mmss(s)} / 10:00</span>
      <span style={{ position: "relative", width: 140, height: 6, background: "rgba(214,209,202,0.14)" }}>
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${p * 100}%`, background: COLOR.ink2 }} />
      </span>
      <span style={{ fontFamily: FONT.mono, fontSize: 20, color: COLOR.ink3, ...NUMERIC, width: 48, textAlign: "right" }}>{Math.floor(p * 100)} %</span>
    </div>
  );
};

/** Mention de source, en bas à gauche. */
export const Note: React.FC<{ children: React.ReactNode; opacity?: number }> = ({ children, opacity = 1 }) => (
  <div style={{ position: "absolute", left: LAYOUT.safeX, bottom: 52, display: "flex", alignItems: "center", gap: 12, opacity: 0.9 * opacity }}>
    <span style={{ width: 10, height: 10, border: `1.5px solid ${COLOR.ink3}` }} />
    <span style={{ ...TYPE.tick, fontSize: 21, color: COLOR.ink3, letterSpacing: "0.04em" }}>{children}</span>
  </div>
);
export const NOTE_APP = "Images de l'application, enregistrée sur son jeu de données fictif";
export const NOTE_FACTS = "Encours et R-co Valor : chiffres communiqués";

/** Une prise de l'application (public/rec/<nom>.mp4), muette. */
export const Rec: React.FC<{ name: string; style?: React.CSSProperties; rate?: number; trim?: number }> = ({ name, style, rate = 1, trim = 0 }) => (
  <Video src={staticFile(`rec/${name}.mp4`)} muted playbackRate={rate} trimBefore={trim}
    style={{ width: VIDEO.width, height: VIDEO.height, display: "block", objectFit: "cover", ...style }} />
);

/** Écran 3D : une prise posée dans l'espace, filet d'or, ombre portée, reflet au sol. */
export const Screen3D: React.FC<{ name: string; transform: string; scale?: number; rate?: number; trim?: number; glow?: number; reflection?: boolean; children?: React.ReactNode }> = ({ name, transform, scale = 0.62, rate, trim, glow = 1, reflection = true, children }) => {
  const w = VIDEO.width * scale, h = VIDEO.height * scale;
  return (
    <div style={{ position: "absolute", left: (VIDEO.width - w) / 2, top: (VIDEO.height - h) / 2, width: w, height: h, transformStyle: "preserve-3d", transform }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", border: `2px solid rgba(220,179,109,${0.35 + 0.4 * glow})`,
        boxShadow: `0 50px 120px -30px rgba(0,0,0,0.95), 0 0 ${60 * glow}px rgba(204,159,83,${0.18 * glow})` }}>
        <div style={{ width: VIDEO.width, height: VIDEO.height, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
          <Rec name={name} rate={rate} trim={trim} />
        </div>
        {children}
      </div>
      {reflection && (
        <div style={{ position: "absolute", left: 0, top: h + 6, width: w, height: h * 0.45, overflow: "hidden", transform: "scaleY(-1)", transformOrigin: "50% 0",
          opacity: 0.16, maskImage: "linear-gradient(to top, rgba(0,0,0,0.9), transparent 70%)", WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.9), transparent 70%)" }}>
          <div style={{ width: VIDEO.width, height: VIDEO.height, transform: `scale(${scale})`, transformOrigin: "0 0", marginTop: -h * 0.55 }}>
            <Rec name={name} rate={rate} trim={trim} />
          </div>
        </div>
      )}
    </div>
  );
};

/** Texte extrudé : la même graphie empilée en couches dans la profondeur (vrai volume en perspective CSS). */
export const Extruded: React.FC<{ text: string; size: number; depth?: number; layers?: number; color?: string; side?: string; style?: React.CSSProperties }> = ({ text, size, depth = 90, layers = 28, color = COLOR.ink, side = "#7a5a26", style }) => (
  <div style={{ position: "relative", transformStyle: "preserve-3d", ...style }}>
    {Array.from({ length: layers }, (_, i) => {
      const k = i / (layers - 1);
      return (
        <div key={i} style={{ position: i === 0 ? "relative" : "absolute", left: 0, top: 0, transform: `translateZ(${-k * depth}px)`,
          fontFamily: FONT.serif, fontSize: size, lineHeight: 1, whiteSpace: "nowrap", color: i === 0 ? color : side,
          opacity: i === 0 ? 1 : 0.5 + 0.5 * (1 - k), filter: i === 0 ? "drop-shadow(0 0 30px rgba(220,179,109,0.25))" : undefined, ...NUMERIC }}>
          {text}
        </div>
      );
    })}
  </div>
);

/** Titre de plan : surtitre + titre, montée courte. */
export const ShotTitle: React.FC<{ eyebrow?: string; title: React.ReactNode; at?: number; out?: number; x?: number; y?: number; size?: number; align?: "left" | "center"; width?: number }> = ({ eyebrow, title, at = 8, out, x = LAYOUT.safeX, y = 150, size = 112, align = "left", width }) => {
  const frame = useCurrentFrame();
  const i = prog(frame, at, 20);
  const o = out == null ? 0 : prog(frame, out, 12);
  return (
    <div style={{ position: "absolute", left: align === "center" ? 0 : x, width: align === "center" ? VIDEO.width : width, top: y, textAlign: align,
      opacity: i * (1 - o), transform: `translateY(${(1 - i) * 28 - o * 16}px)` }}>
      {eyebrow && <div style={{ ...TYPE.eyebrow, color: COLOR.goldInk, marginBottom: 22 }}>{eyebrow}</div>}
      <div style={{ ...TYPE.title, fontSize: size, color: COLOR.ink, textShadow: "0 4px 40px rgba(0,0,0,0.85)" }}>{title}</div>
    </div>
  );
};

/** Fond noir bleuté avec un halo, partagé par les plans du film. */
export const Night: React.FC<{ glow?: number; cold?: boolean }> = ({ glow = 1, cold }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const b = 0.85 + 0.15 * Math.sin((frame / fps) * 0.8);
  return (
    <AbsoluteFill style={{ background: cold ? "#07090d" : COLOR.paper }}>
      <AbsoluteFill style={{ background: cold
        ? `radial-gradient(70% 60% at 50% 40%, rgba(120,130,150,${0.08 * glow * b}), transparent 70%)`
        : `radial-gradient(70% 60% at 60% 35%, rgba(204,159,83,${0.09 * glow * b}), transparent 65%), radial-gradient(60% 50% at 20% 85%, rgba(28,53,94,${0.4 * glow}), transparent 70%)` }} />
      <AbsoluteFill style={{ background: "radial-gradient(120% 120% at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)" }} />
    </AbsoluteFill>
  );
};
