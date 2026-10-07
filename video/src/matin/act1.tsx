/**
 * Acte I — le matin (0 → 30 s) : l'horloge et l'extraction JUMP, les jours qui passent ; les outils éparpillés ;
 * le schéma dans Fabric ; le creux avant l'explosion.
 */
import type React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Grain, GoldPoint } from "../components/Chrome";
import { COLOR, EASE, FONT, NUMERIC, TYPE, VIDEO } from "../theme";
import { mix, prog } from "../lib/anim";
import { Slam, Thread } from "../jasmine/kit";
import { B, from, sec, S } from "./timeline";

const W = VIDEO.width, H = VIDEO.height, CX = W / 2, CY = H / 2;
const loc = (id: keyof typeof S, s: number) => sec(s) - from(id);

/** Fond de l'acte I : presque noir, une lumière froide qui tombe d'en haut. */
const Cold: React.FC<{ k?: number }> = ({ k = 1 }) => (
  <AbsoluteFill style={{ background: "#040609" }}>
    <AbsoluteFill style={{ background: `radial-gradient(60% 55% at 50% 38%, rgba(120,140,170,${0.1 * k}), transparent 70%)` }} />
    <AbsoluteFill style={{ background: "radial-gradient(130% 120% at 50% 50%, transparent 50%, rgba(0,0,0,0.75) 100%)" }} />
  </AbsoluteFill>
);

/** Une ligne de voix off, en grand, qui se pose sur son temps et s'efface. */
const Said: React.FC<{ at: number; out: number; children: React.ReactNode; y?: number; size?: number; color?: string; italic?: boolean }> = ({ at, out, children, y = 760, size = 84, color = COLOR.ink, italic }) => (
  <div style={{ position: "absolute", left: 0, width: W, top: y, textAlign: "center" }}>
    <Slam at={at} out={out} dur={10} outDur={8} style={{ ...TYPE.title, fontSize: size, color, fontStyle: italic ? "italic" : undefined, textShadow: "0 6px 40px rgba(0,0,0,0.9)" }}>{children}</Slam>
  </div>
);

// ================================================================== 1. Chaque matin (0 → 12 s)
const DAYS = [
  { d: "Lundi", t: 2.0, h: [8, 2, 0] },
  { d: "Mardi", t: 5.0, h: [8, 1, 3] },
  { d: "Mercredi", t: 7.0, h: [8, 3, 2] },
  { d: "Jeudi", t: 8.5, h: [8, 2, 1] },
  { d: "Vendredi", t: 9.5, h: [8, 0, 4] },
];

export const Mornings: React.FC = () => {
  const f = useCurrentFrame();
  const s = f / 30;
  const di = DAYS.reduce((a, d, i) => (s >= d.t ? i : a), -1);
  const day = di >= 0 ? DAYS[di] : null;
  // l'horloge : avant lundi, 08:01:58 → 08:02:00 ; ensuite l'heure du jour + les secondes écoulées
  const base = day ? day.h[0] * 3600 + day.h[1] * 60 + day.h[2] + Math.floor(s - day.t) : 8 * 3600 + 60 + 58 + Math.floor(s);
  const hh = String(Math.floor(base / 3600)).padStart(2, "0"), mm = String(Math.floor((base % 3600) / 60)).padStart(2, "0"), ss = String(base % 60).padStart(2, "0");
  const tickFlash = Math.exp(-(f % 30) / 4);
  const boom = day ? Math.exp(-(s - day.t) * 3) : 0;
  const pushIn = mix(1, 1.08, prog(f, 0, 360, EASE.premium));
  const stack = prog(f, loc("mornings", 10.4), 18, EASE.signature);
  const appear = prog(f, 6, 24, EASE.premium);
  // barre de progression du jour : elle n'avance presque pas
  const pct = day ? Math.min(1.6, (s - day.t) * 0.45) : 0;
  return (
    <AbsoluteFill>
      <Cold k={0.6 + 0.6 * boom} />
      <AbsoluteFill style={{ transform: `scale(${pushIn})` }}>
        {/* le jour */}
        <div style={{ position: "absolute", left: 0, width: W, top: 250, textAlign: "center", opacity: day ? 1 - stack : 0 }}>
          {day && <Slam key={day.d} at={sec(day.t)} dur={6} style={{ ...TYPE.eyebrow, fontSize: 30, letterSpacing: "0.5em", color: COLOR.ink2 }}>{day.d}</Slam>}
        </div>
        {/* l'heure, en grand, qui bat la seconde */}
        <div style={{ position: "absolute", left: 0, width: W, top: 300, textAlign: "center", opacity: appear * (1 - stack * 0.85),
          fontFamily: FONT.mono, fontSize: 210, letterSpacing: "0.02em", color: COLOR.ink, ...NUMERIC,
          textShadow: `0 0 ${30 + 40 * tickFlash}px rgba(200,215,240,${0.12 + 0.18 * tickFlash})` }}>
          {hh}<span style={{ opacity: 0.35 + 0.65 * tickFlash }}>:</span>{mm}<span style={{ opacity: 0.35 + 0.65 * tickFlash }}>:</span>{ss}
        </div>
        {/* le lancement de l'extraction */}
        {day && (
          <div style={{ position: "absolute", left: CX - 520, width: 1040, top: 590, opacity: 1 - stack }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT.mono, fontSize: 24, color: COLOR.ink2, letterSpacing: "0.06em" }}>
              <span>› Lancement de l'extraction JUMP</span><span style={NUMERIC}>{pct.toFixed(1).replace(".", ",")} %</span>
            </div>
            <div style={{ position: "relative", height: 6, marginTop: 16, background: "rgba(214,209,202,0.12)" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: COLOR.ink2 }} />
            </div>
            <div style={{ marginTop: 14, fontFamily: FONT.mono, fontSize: 20, color: COLOR.ink3, letterSpacing: "0.06em" }}>temps estimé ≈ 10 min</div>
          </div>
        )}
        {/* la semaine : cinq barres empilées, toutes à zéro */}
        {stack > 0 && DAYS.map((d, i) => {
          const k = prog(f, loc("mornings", 10.4) + i * 2, 12, EASE.signature);
          return (
            <div key={d.d} style={{ position: "absolute", left: CX - 520, width: 1040, top: 330 + i * 64, opacity: k, transform: `translateY(${(1 - k) * 20}px)` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT.mono, fontSize: 21, color: COLOR.ink3, letterSpacing: "0.06em" }}>
                <span>{d.d.toUpperCase()} · {String(d.h[0]).padStart(2, "0")}:{String(d.h[1]).padStart(2, "0")} · extraction JUMP</span><span>en cours</span>
              </div>
              <div style={{ height: 4, marginTop: 10, background: "rgba(214,209,202,0.1)" }}><div style={{ height: 4, width: "1.2%", background: COLOR.ink2 }} /></div>
            </div>
          );
        })}
      </AbsoluteFill>
      <Said at={loc("mornings", 2.27)} out={loc("mornings", 4.3)} y={800} size={72}>Chaque matin, à la même heure…</Said>
      <Said at={loc("mornings", 5.13)} out={loc("mornings", 6.9)} y={800} size={72}>on lance l'extraction.</Said>
      <Said at={loc("mornings", 8.0)} out={sec(12) - 8} y={800} size={96} color={COLOR.ink2} italic>Et l'on attend.</Said>
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 2. Éparpillée (12 → 21,96 s)
const TOOLS = [
  { name: "Product Info", at: 15.9, x: -560, y: -170, z: -200, r: 14 },
  { name: "JUMP", at: 17.27, x: 560, y: -120, z: -380, r: -16 },
  { name: "Centaure", at: 18.4, x: -440, y: 210, z: -520, r: 18 },
  { name: "Doc Info", at: 19.6, x: 470, y: 230, z: -260, r: -12 },
];

/** Une fenêtre d'outil : angles vifs, verre bleu nuit, lignes de données floues. */
const ToolPanel: React.FC<{ name: string; k: number; glow?: number }> = ({ name, k, glow = 0 }) => (
  <div style={{ width: 520, height: 300, background: "linear-gradient(160deg, rgba(21,35,59,0.95), rgba(8,14,26,0.95))",
    border: `1.5px solid rgba(214,209,202,${0.18 + 0.5 * glow})`, boxShadow: `0 40px 90px -20px rgba(0,0,0,0.9), 0 0 ${50 * glow}px rgba(204,159,83,${0.35 * glow})`, opacity: k, overflow: "hidden" }}>
    <div style={{ height: 44, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", borderBottom: `1px solid ${COLOR.line2}` }}>
      <span style={{ width: 10, height: 10, background: glow > 0.3 ? COLOR.gold : COLOR.ink3 }} />
      <span style={{ fontFamily: FONT.sans, fontSize: 22, fontWeight: 600, color: COLOR.ink }}>{name}</span>
    </div>
    {Array.from({ length: 7 }, (_, i) => (
      <div key={i} style={{ display: "flex", gap: 14, padding: "12px 18px 0" }}>
        <span style={{ height: 8, width: 120 + ((i * 53) % 90), background: "rgba(214,209,202,0.16)" }} />
        <span style={{ height: 8, width: 60 + ((i * 37) % 70), background: "rgba(214,209,202,0.1)" }} />
        <span style={{ height: 8, flex: 1, background: "rgba(214,209,202,0.06)" }} />
      </div>
    ))}
  </div>
);

export const Tools: React.FC = () => {
  const f = useCurrentFrame();
  const drift = f / 30;
  return (
    <AbsoluteFill>
      <Cold k={0.8} />
      <AbsoluteFill style={{ perspective: 1600 }}>
        <AbsoluteFill style={{ transformStyle: "preserve-3d", transform: `rotateY(${-6 + drift * 1.4}deg) rotateX(${4 - drift * 0.4}deg) translateZ(${drift * 25}px)` }}>
          {TOOLS.map((t) => {
            const k = prog(f, loc("tools", t.at) - 2, 14, EASE.signature);
            return (
              <div key={t.name} style={{ position: "absolute", left: CX + t.x - 260, top: CY + t.y - 150,
                transform: `translateZ(${t.z + (1 - k) * -600}px) rotateY(${t.r}deg)`, transformStyle: "preserve-3d" }}>
                <ToolPanel name={t.name} k={k} glow={Math.exp(-Math.max(0, f - loc("tools", t.at)) / 10)} />
              </div>
            );
          })}
        </AbsoluteFill>
      </AbsoluteFill>
      <Said at={loc("tools", 12.33)} out={loc("tools", 14.0)} y={470} size={96}>La réponse existe déjà.</Said>
      <Said at={loc("tools", 14.1)} out={loc("tools", 15.75)} y={470} size={96} color={COLOR.ink2} italic>Mais elle est éparpillée.</Said>
      {TOOLS.map((t) => (
        <Said key={t.name} at={loc("tools", t.at)} out={loc("tools", t.at) + 30} y={480} size={68} color={COLOR.ink2}>Dans {t.name}.</Said>
      ))}
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 3. Le schéma dans Fabric (21,96 → 27,86 s)
const TABLES = [
  { name: "Product Info", x: -620, y: -230 },
  { name: "JUMP", x: 620, y: -230 },
  { name: "Centaure", x: -620, y: 230 },
  { name: "Doc Info", x: 620, y: 230 },
];

export const Fabric: React.FC = () => {
  const f = useCurrentFrame();
  const L = from("gap") - from("fabric");
  const draw = prog(f, 14, 60, EASE.draw);
  const lit = prog(f, loc("fabric", 24.6) + 0, 20, EASE.signature);
  const collapse = prog(f, L - 22, 22, EASE.exit);
  const node = { x: CX, y: CY + 10 };
  return (
    <AbsoluteFill>
      <Cold k={0.6} />
      <AbsoluteFill style={{ background: `radial-gradient(40% 40% at 50% 52%, rgba(204,159,83,${0.12 * lit}), transparent 70%)` }} />
      <AbsoluteFill style={{ transform: `scale(${mix(1, 0.15, collapse)})`, opacity: 1 - collapse * 0.9 }}>
        {/* les liens : des tables vers le nœud Fabric */}
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          {TABLES.map((t, i) => {
            const x0 = CX + t.x - Math.sign(t.x) * 170, y0 = CY + t.y;   // bord intérieur de la table
            const len = Math.hypot(node.x - x0, node.y - y0);
            return (
              <line key={i} x1={x0} y1={y0} x2={node.x} y2={node.y} stroke={COLOR.goldGlow} strokeWidth={2}
                strokeDasharray={len} strokeDashoffset={len * (1 - prog(f, 10 + i * 5, 40, EASE.draw))} opacity={0.85}
                style={{ filter: "drop-shadow(0 0 6px rgba(220,179,109,0.8))" }} />
            );
          })}
        </svg>
        {TABLES.map((t, i) => {
          const k = prog(f, i * 4, 16, EASE.signature);
          return (
            <div key={t.name} style={{ position: "absolute", left: CX + t.x - 170, top: CY + t.y - 95, width: 340, opacity: k,
              border: `1.5px solid rgba(220,179,109,${0.4 + 0.5 * draw})`, background: "rgba(8,14,26,0.92)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.9)" }}>
              <div style={{ padding: "10px 16px", background: "rgba(204,159,83,0.16)", fontFamily: FONT.sans, fontWeight: 600, fontSize: 22, color: COLOR.ink }}>{t.name}</div>
              {[0, 1, 2, 3].map((j) => (
                <div key={j} style={{ padding: "11px 16px", display: "flex", gap: 12, alignItems: "center", borderTop: `1px solid ${COLOR.line}`, opacity: prog(f, 8 + i * 4 + j * 2, 10) }}>
                  <span style={{ width: 8, height: 8, background: j === 0 ? COLOR.gold : "transparent", border: `1.5px solid ${j === 0 ? COLOR.gold : COLOR.ink3}` }} />
                  <span style={{ height: 7, width: 90 + ((i * 41 + j * 67) % 110), background: "rgba(214,209,202,0.2)" }} />
                </div>
              ))}
            </div>
          );
        })}
        {/* le nœud */}
        <div style={{ position: "absolute", left: node.x - 110, top: node.y - 46, width: 220, height: 92, border: `2px solid ${COLOR.goldGlow}`,
          background: "rgba(6,11,21,0.95)", display: "flex", alignItems: "center", justifyContent: "center", opacity: prog(f, 30, 14),
          boxShadow: `0 0 ${30 + 60 * lit}px rgba(220,179,109,${0.3 + 0.4 * lit})` }}>
          <span style={{ fontFamily: FONT.serif, fontSize: 52, color: COLOR.ink }}>Fabric</span>
        </div>
      </AbsoluteFill>
      <Said at={0} out={loc("fabric", 24.2)} y={110} size={88}>Et si tout était au même endroit&nbsp;?</Said>
      <Said at={loc("fabric", 24.6)} out={L - 20} y={880} size={76} color={COLOR.goldInk} italic>Relié, dans Fabric.</Said>
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 4. Le creux (27,86 → 30 s)
export const Gap: React.FC = () => {
  const f = useCurrentFrame();
  const L = from("drop") - from("gap");
  const p = prog(f, 0, L, EASE.premium);
  return (
    <AbsoluteFill style={{ background: "#020305" }}>
      <GoldPoint x={CX} y={CY + 40} size={8 + 18 * p} glow={0.5 + 1.5 * p} />
      <Thread x0={CX - 400 * p} x1={CX + 400 * p} y={CY + 40} opacity={p} />
      <Said at={2} out={L + 4} y={CY - 110} size={92}>Une seule application.</Said>
      <Grain />
    </AbsoluteFill>
  );
};

export { B };
