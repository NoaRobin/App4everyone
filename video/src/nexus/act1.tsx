/**
 * Acte I — « La question ». Un seul plan-séquence, en cinémascope, du noir à la touche Entrée (mesures 0 → 41) :
 * la lumière révèle les touches ; deux questions se tapent ; cinq touches se détachent (les outils d'aujourd'hui) ;
 * des fils d'or les réunissent (Fabric) ; elles reprennent leur place ; la caméra plonge vers Entrée — l'explosion.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { EASE } from "../theme";
import { mix, prog } from "../lib/anim";
import { Letterbox } from "../teaser/kit";
import { Cam, CameraRig, FloatKey, GlowSprite, Keyboard3D, KeyPose, LabelSprite, Thread, useKeyboardAssets, V3 } from "./Keyboard3D";
import { KEY_BY_CODE, KeyInfo } from "./layout";
import { add, Press, pressPose, shock, typed, typedEnd, typedText } from "./keys";
import { bar, vo } from "./timeline";
import { Flash, TypeLine } from "./ui";

// ------------------------------------------------------------------ caméra : images clés, interpolation douce
type CamKey = [number, Cam];
const ENTER = KEY_BY_CODE.get("Enter")!;
const KEYS_CAM: CamKey[] = [
  [0, { pos: [-16, 2.3, 7.4], target: [-9.5, 0.3, -1.2], fov: 22 }],
  [bar(7.4), { pos: [7, 2.6, 7.2], target: [12, 0.3, -1.2], fov: 22 }],
  [bar(9.2), { pos: [-5, 17, 19.5], target: [0, -0.2, -3.2], fov: 30 }],
  [bar(16), { pos: [5, 15, 18], target: [0, -0.2, -3.2], fov: 30 }],
  [bar(17.5), { pos: [0, 7.2, 27], target: [0, 4.4, -1.5], fov: 34 }],
  [bar(26), { pos: [0, 7.6, 23.5], target: [0, 5, -2.5], fov: 34 }],
  [bar(29.5), { pos: [0, 9, 25], target: [0, 4.5, -2.5], fov: 34 }],
  [bar(34), { pos: [0, 21, 25], target: [0, -0.2, -2.6], fov: 30 }],
  [bar(37.5), { pos: [ENTER.x + 4, 9, ENTER.z + 12], target: [ENTER.x, 0, ENTER.z], fov: 28 }],
  [bar(40) - 4, { pos: [ENTER.x + 0.9, 2.5, ENTER.z + 4.1], target: [ENTER.x, 0.3, ENTER.z], fov: 23 }],
];
const lerp3 = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
function camAt(f: number): Cam {
  if (f >= bar(40)) {   // l'explosion : plan large, au-dessus, qui recule à peine
    const t = prog(f, bar(40), 45, EASE.signature);
    return { pos: [0, mix(19, 22, t), mix(13, 15, t)], target: [0, -1, 0.4], fov: 36 };
  }
  for (let i = 0; i < KEYS_CAM.length - 1; i++) {
    const [fa, a] = KEYS_CAM[i];
    const [fb, b] = KEYS_CAM[i + 1];
    if (f <= fb) {
      // la plongée finale accélère (tension) ; tous les autres mouvements décélèrent
      const t = i === KEYS_CAM.length - 2 ? Math.pow(Math.max(0, (f - fa) / (fb - fa)), 2.2) : prog(f, fa, fb - fa, EASE.premium);
      return { pos: lerp3(a.pos, b.pos, t), target: lerp3(a.target, b.target, t), fov: mix(a.fov, b.fov, t) };
    }
  }
  return KEYS_CAM[KEYS_CAM.length - 1][1];
}

// ------------------------------------------------------------------ frappes
const Q1 = "Où en est l'encours ?";
const Q2 = "Qui détient nos fonds ?";
const Q3 = "R-co Valor";
const Q1_AT = bar(8.3), Q2_AT = bar(12.2), Q3_AT = bar(34.6);
const PRESSES: Press[] = [
  ...typed(Q1, Q1_AT, 4), { code: "Enter", at: Math.round(typedEnd(Q1, Q1_AT, 4)) + 14 },
  ...typed(Q2, Q2_AT, 4), { code: "Enter", at: Math.round(typedEnd(Q2, Q2_AT, 4)) + 14 },
  ...typed(Q3, Q3_AT, 5),
];

// ------------------------------------------------------------------ les cinq outils
const TOOLS = [
  { code: "KeyP", letter: "P", label: "Product Info", pos: [-11, 4.6, -1] as V3, line: "outil-1" },
  { code: "KeyJ", letter: "J", label: "JUMP", pos: [-5.4, 8.1, -5] as V3, line: "outil-2" },
  { code: "KeyC", letter: "C", label: "Centaure", pos: [0.4, 3.7, 2] as V3, line: "outil-3" },
  { code: "KeyD", letter: "D", label: "Doc Info", pos: [6.2, 8.4, -6] as V3, line: "outil-4" },
  { code: "KeyQ", letter: "A", label: "Adjuto", pos: [11.4, 4.9, -1] as V3, line: "outil-5" },
];
const TOOL_W = 4;
const RISE = bar(17.2), BACK = bar(29.8), NODE: V3 = [0.4, 7, -3.5];
const BOARD_DROP = -2.2;
const boardY = (f: number) => BOARD_DROP * prog(f, RISE - 10, 50, EASE.premium) * (1 - prog(f, BACK + 20, 50, EASE.premium));

function toolState(i: number, f: number) {
  const t = TOOLS[i];
  const k = KEY_BY_CODE.get(t.code)!;
  const home: V3 = [k.x, boardY(f), k.z];
  const up = prog(f, RISE + i * 14, 70, EASE.signature);
  const down = prog(f, BACK + i * 10, 46, EASE.premium);
  const bob: V3 = [0, 0.25 * Math.sin((f + i * 40) / 38), 0];
  const air = lerp3(home, [t.pos[0], t.pos[1] + bob[1], t.pos[2]], up);
  const pos = lerp3(air, home, down);
  const morph = prog(f, RISE + 20 + i * 14, 40) * (1 - prog(f, BACK + i * 10, 30));
  const spoken = vo(t.line).at;
  const glow = 0.18 * up * (1 - down) + (f >= spoken ? 1.3 * Math.exp(-(f - spoken) / 24) : 0) + (f >= BACK + i * 10 + 46 ? 0 : 0);
  const out = up > 0.001 && down < 0.999;
  return { k, pos, morph, glow, out, landed: BACK + i * 10 + 46, rot: [1.32 * up * (1 - down), 0.16 * Math.sin((f + i * 60) / 70) * up * (1 - down), 0] as V3 };
}
const LANDINGS: Press[] = TOOLS.map((t, i) => ({ code: t.code, at: BACK + i * 10 + 46, force: 0.9 }));

// ------------------------------------------------------------------ la scène
export const ActOne: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const assets = useKeyboardAssets();
  const cam = camAt(f);
  const sweepX = mix(-19, 19, prog(f, 0, bar(7.6), EASE.premium));
  const ambient = mix(0.12, 1, prog(f, bar(5.5), bar(3), EASE.premium)) * mix(1, 0.55, prog(f, RISE, 40) * (1 - prog(f, BACK + 30, 60))) * mix(1, 0.7, prog(f, bar(37), bar(3)));
  const tools = TOOLS.map((_, i) => toolState(i, f));
  const hidden = new Set(tools.filter((t) => t.out).map((t) => t.k.code));
  const enterCharge = prog(f, bar(37.5), bar(2.5) - 6, EASE.premium);
  const enterPress = f >= bar(40) - 8 && f < bar(40) + 12 ? Math.min(1, (f - (bar(40) - 8)) / 8) * (f > bar(40) + 4 ? 1 - (f - bar(40) - 4) / 8 : 1) : 0;

  const pose = (k: KeyInfo): KeyPose => {
    if (hidden.has(k.code)) return { opacity: 0 };
    let p: KeyPose = add(pressPose(k, PRESSES, f), pressPose(k, LANDINGS, f));
    // la lumière rasante de l'ouverture
    if (f < bar(9)) p = add(p, { glow: 0.22 * Math.exp(-(((k.x - sweepX) / 3.2) ** 2)) * (1 - prog(f, bar(7.5), bar(1))) });
    if (k.code === "Enter") p = add(p, { glow: 0.9 * enterCharge, press: enterPress });
    if (f >= bar(40)) p = add(p, shock(k, "Enter", bar(40), f, 1.5, 1.4));
    return { ...p, offset: [p.offset?.[0] ?? 0, (p.offset?.[1] ?? 0) + boardY(f), p.offset?.[2] ?? 0] };
  };

  // fils d'or vers Fabric
  const threadP = (i: number) => prog(f, bar(26.3) + i * 6, 28, EASE.signature);
  const threadO = 1 - prog(f, BACK - 4, 30);
  const nodeO = prog(f, bar(27) - 4, 16) * (1 - prog(f, BACK + 40, 50));
  const pulse = 1 + 0.08 * Math.sin(f / 7);

  // ligne de saisie
  const line = f < Q2_AT - 10 ? typedText(Q1, Q1_AT, f, 4) : f < bar(17) ? typedText(Q2, Q2_AT, f, 4) : f >= Q3_AT ? typedText(Q3, Q3_AT, f, 5) : "";
  const lineO = f < bar(17) ? prog(f, Q1_AT - 6, 8) * (1 - prog(f, bar(16.4), 12)) * (f > Q2_AT - 26 && f < Q2_AT - 4 ? 1 - prog(f, Q2_AT - 26, 10) : 1)
    : prog(f, Q3_AT - 6, 8) * (1 - prog(f, bar(38.4), 14));
  const letterbox = 1 - prog(f, bar(40), 6, EASE.premium);

  if (!assets) return <AbsoluteFill style={{ background: "#000" }} />;
  return (
    <AbsoluteFill style={{ background: "#020409" }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }}>
        <CameraRig cam={cam} />
        <Keyboard3D pose={pose} ambient={ambient} board={{ pos: [0, 0, 0] }}
          sweep={f < bar(9) ? { x: sweepX, z: 1.2, y: 1.6, intensity: 60 * (1 - prog(f, bar(7.5), bar(1.5))) } : undefined} />
        {tools.map((t, i) => (
          <FloatKey key={TOOLS[i].code} pos={t.pos} rot={t.rot} width={TOOL_W} morph={t.morph} letter={TOOLS[i].letter} label={TOOLS[i].label}
            glow={t.glow} opacity={t.out ? 1 : 0} />
        ))}
        {tools.map((t, i) => (
          <Thread key={`t${i}`} a={[t.pos[0], t.pos[1] + 0.7, t.pos[2]]} b={NODE} lift={1.5} p={threadP(i)} opacity={0.9 * threadO} />
        ))}
        <GlowSprite pos={NODE} size={5.5 * pulse} opacity={0.85 * nodeO} />
        <GlowSprite pos={NODE} size={1.6} opacity={nodeO} color="#ffffff" />
        <LabelSprite pos={[NODE[0], NODE[1] + 1.9, NODE[2]]} text="Fabric" height={2.4} w={3} opacity={prog(f, vo("fabric").at, 14) * (1 - prog(f, BACK + 30, 30))} />
        {nodeO > 0 ? <pointLight position={NODE} intensity={40 * nodeO} distance={18} decay={1.5} color="#ffd9a0" /> : null}
      </ThreeCanvas>
      {line ? <TypeLine text={line} frame={f} opacity={lineO} y={f < bar(17) ? 170 : 190} size={f < bar(17) ? 84 : 96} /> : null}
      <Letterbox k={letterbox} />
      <Flash at={bar(40)} frame={f} peak={0.8} dur={16} />
    </AbsoluteFill>
  );
};
