/**
 * Acte III — le cas pratique (49 → 71 s), l'export Excel en accéléré (71 → 75 s), le final sur les trois derniers
 * accords (75 → 82 s), puis l'épilogue : silence, tic-tac, JUMP n'aurait pas terminé.
 */
import type React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Ambient, Grain } from "../components/Chrome";
import { BRAND, COLOR, EASE, FONT, NUMERIC, TYPE, VIDEO } from "../theme";
import { mix, prog } from "../lib/anim";
import { AppCam, CamKey, cropAt, Flash, Letters, Mark, MarkStatic, Note, Slam, Thread } from "../jasmine/kit";
import { BEAT, JUMP_S, JUMP_START, len, lb, mmss, pulse, sec, from } from "./timeline";
import FONDS from "../jasmine/fonds.json";

const W = VIDEO.width, CX = W / 2, CY = VIDEO.height / 2;
const loc = (id: Parameters<typeof from>[0], s: number) => sec(s) - from(id);

/** La question de la voix off, en grand, posée en haut de l'image. */
const Question: React.FC<{ at: number; out?: number; children: React.ReactNode; size?: number; y?: number }> = ({ at, out, children, size = 82, y = 70 }) => (
  <div style={{ position: "absolute", left: 120, right: 120, top: y, textAlign: "center" }}>
    <Slam at={at} out={out} dur={8} style={{ ...TYPE.title, fontSize: size, color: COLOR.ink, textShadow: "0 6px 40px rgba(0,0,0,0.95)" }}>{children}</Slam>
  </div>
);
const BottomShade = () => <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 300, background: "linear-gradient(to top, rgba(4,7,14,0.94), rgba(4,7,14,0.55) 60%, transparent)" }} />;
/** La question, sobre, en bas à gauche (voix off). */
const Caption: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => (
  <div style={{ position: "absolute", left: 144, bottom: 104 }}>
    <Slam at={at} dur={12} style={{ ...TYPE.title, fontSize: 64, color: COLOR.ink, textShadow: "0 4px 30px rgba(0,0,0,0.9)" }}>{children}</Slam>
  </div>
);
const TopShade = () => <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 320, background: "linear-gradient(to bottom, rgba(4,7,14,0.95), rgba(4,7,14,0.6) 60%, transparent)" }} />;

// ================================================================== 8a. Les frais de gestion d'Europe Valeur (temps 36 → 52) — « nfrais »
const FEES_KEYS: CamKey[] = [
  { f: 0, c: { x: 500, y: 10, w: 940 } },
  { f: 196, c: { x: 540, y: 20, w: 860 } },
  { f: 232, c: { x: 210, y: 440, w: 760 }, cut: true },   // après le passage de page : la réponse
  { f: 257, c: { x: 226, y: 470, w: 700 } },
];
export const Fees: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: COLOR.paper }}>
      <AppCam name="nfrais" crop={cropAt(FEES_KEYS, f)} />
      <BottomShade />
      <Caption at={4}>Les frais de gestion d'Europe Valeur&nbsp;?</Caption>
      <Note />
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 8b. L'heure limite de ses parts (temps 52 → 60) — « ncutoff »
export const Cutoff: React.FC = () => {
  const f = useCurrentFrame();
  const t = prog(f, 0, len("cutoff"), EASE.premium);
  return (
    <AbsoluteFill style={{ background: COLOR.paper }}>
      <AppCam name="ncutoff" trim={8} crop={{ x: mix(200, 226, t), y: mix(470, 500, t), w: mix(760, 700, t) }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "30%", background: "linear-gradient(to top, #060b15 35%, rgba(6,11,21,0))" }} />
      </AppCam>
      <BottomShade />
      <Caption at={2}>L'heure limite de ses parts&nbsp;?</Caption>
      <Note />
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 8c. Le fonds qui rapporte le plus (temps 60 → 68) — « mrank »
export const Rank: React.FC = () => {
  const f = useCurrentFrame();
  const t = prog(f, 0, len("rank"), EASE.premium);   // le classement, sous le titre de l'application
  const crop = { x: mix(160, 200, t), y: mix(320, 340, t), w: mix(1360, 1240, t) };
  return (
    <AbsoluteFill style={{ background: COLOR.paper }}>
      <AppCam name="mrank" trim={20} crop={crop} />
      <BottomShade />
      <Caption at={2}>Les fonds qui rapportent le plus&nbsp;?</Caption>
      <Note />
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 8d. Qui y est investi (temps 68 → 76) — « mcarnet »
export const Carnet: React.FC = () => {
  const f = useCurrentFrame();
  // la recherche se tape, la liste des clients se resserre sur Europe Valeur
  const crop = cropAt([
    { f: 0, c: { x: 40, y: 240, w: 1180 } },
    { f: 84, c: { x: 60, y: 260, w: 1100 } },
    { f: 129, c: { x: 80, y: 300, w: 1000 } },
  ], f);
  return (
    <AbsoluteFill style={{ background: COLOR.paper }}>
      <AppCam name="ncarnet" crop={crop} />
      <BottomShade />
      <Caption at={2}>Et qui y est investi&nbsp;?</Caption>
      <Note>Images de l'application · clients synthétiques, jeu de données fictif</Note>
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 9. Jasmine travaille aussi (temps 76 → 84) — export en accéléré + la feuille
type Fonds = { nom: string; famille: string; gerant: string; sfdr: string; fraisMax: number; fraisReels: number };
const ROWS = FONDS as Fonds[];
const pc = (v: number) => `${(v * 100).toFixed(2).replace(".", ",")} %`;
export const Excel: React.FC = () => {
  const f = useCurrentFrame();
  const half = Math.round(4 * BEAT);
  const sheet = prog(f, half, 10, EASE.signature);
  return (
    <AbsoluteFill style={{ background: COLOR.paper }}>
      <Ambient glow={1.2} />
      <Sequence  durationInFrames={half} layout="none">
        <AppCam name="jexport" trim={330} crop={{ x: 120, y: 60, w: 1700 }} w={1500} h={844} cx={CX} cy={CY + 40}
          tilt={`perspective(2400px) rotateY(-8deg) rotateX(5deg)`} frameGlow={0.8} />
      </Sequence>
      {f >= half && (
        <AbsoluteFill style={{ perspective: 2400 }}>
          <div style={{ position: "absolute", left: CX - 760, top: 230, width: 1520, height: 760, background: "#fff", overflow: "hidden",
            transform: `translateY(${(1 - sheet) * 300}px) rotateX(${mix(24, 5, sheet)}deg)`, transformOrigin: "50% 100%", opacity: Math.min(1, sheet * 2),
            boxShadow: "0 80px 160px -30px rgba(0,0,0,0.95), 0 0 0 1.5px rgba(220,179,109,0.6)" }}>
            <div style={{ height: 46, background: BRAND.blue, color: "#fff", display: "flex", alignItems: "center", gap: 12, padding: "0 18px", fontFamily: FONT.sans, fontSize: 18 }}>
              <span style={{ width: 12, height: 12, background: COLOR.gold }} /><b>fonds-2026-09-29.xlsx</b><span style={{ opacity: 0.6 }}>· Tableau T_Fonds</span>
            </div>
            <div style={{ display: "flex", height: 44, background: "#8A1E41", color: "#fff", fontFamily: FONT.sans, fontWeight: 650, fontSize: 18, borderBottom: "3px solid #E8C9BA" }}>
              {["Nom du fonds", "Gérant principal", "SFDR", "Frais max.", "Frais réels"].map((h, j) => (
                <span key={h} style={{ width: [460, 330, 210, 260, 260][j], padding: "0 14px", lineHeight: "41px", textAlign: j >= 3 ? "right" : "left" }}>{h}</span>
              ))}
            </div>
            {ROWS.map((r, i) => {
              const t = prog(f, half + 6 + i * 2, 5, EASE.signature);
              return (
                <div key={i} style={{ display: "flex", height: 44, fontFamily: FONT.sans, fontSize: 19, color: "#1d1d1f", background: i % 2 ? "#F2F2F2" : "#fff", opacity: t, transform: `translateX(${(1 - t) * 60}px)`, ...NUMERIC }}>
                  {[r.nom, r.gerant, r.sfdr, pc(r.fraisMax), pc(r.fraisReels)].map((v, j) => (
                    <span key={j} style={{ width: [460, 330, 210, 260, 260][j], padding: "0 14px", lineHeight: "44px", textAlign: j >= 3 ? "right" : "left", fontWeight: j === 0 ? 600 : 400, borderTop: "1px solid #d9d9d9" }}>{v}</span>
                  ))}
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      )}
      <TopShade />
      <Question at={loc("excel", 70.87)} out={loc("excel", 72.5)} size={96}>Jasmine travaille aussi.</Question>
      <Question at={loc("excel", 72.6)} size={88}>Vos fichiers Excel, en un clic.</Question>
      <Flash at={half} peak={0.5} dur={10} />
      <Note>Fichier d'exemple · jeu de données fictif</Note>
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 10. Final (temps 84 → 82,4 s) : le couloir, puis les trois accords
const CORRIDOR = [
  { name: "mcourbe", trim: 40, crop: { x: 0, y: 0, w: 1920 } },
  { name: "nfrais", trim: 250, crop: { x: 226, y: 470, w: 700 } },
  { name: "mglobe", trim: 40, crop: { x: 240, y: 60, w: 1440 } },
  { name: "jexport", trim: 470, crop: { x: 594, y: 140, w: 1000 } },
  { name: "mcomp", trim: 40, crop: { x: 80, y: 60, w: 1760 } },
  { name: "ncarnet", trim: 120, crop: { x: 80, y: 300, w: 1000 } },
  { name: "mville", trim: 40, crop: { x: 100, y: 70, w: 1720 } },
  { name: "jfiche", trim: 30, crop: { x: 226, y: 500, w: 700 } },
];
export const Finale: React.FC = () => {
  const f = useCurrentFrame();
  const h1 = lb("finale", 91), h2 = lb("finale", 93), h3 = lb("finale", 95);
  const L = len("finale");
  const speed = prog(f, 0, h1, EASE.exit);
  return (
    <AbsoluteFill style={{ background: "#03050a" }}>
      {f < h1 && (
        <AbsoluteFill style={{ perspective: 900 }}>
          {CORRIDOR.map((c, i) => {
            const t = ((f / h1) * 1.6 + i / CORRIDOR.length) % 1;          // 0 loin → 1 traverse la caméra
            const z = mix(-3200, 700, Math.pow(t, 1.4 + speed));
            const ang = (i / CORRIDOR.length) * Math.PI * 2 + f * 0.01;
            const r = 760;
            return (
              <div key={i} style={{ position: "absolute", left: CX - 320, top: CY - 180, transform: `translate3d(${Math.cos(ang) * r}px, ${Math.sin(ang) * r * 0.55}px, ${z}px) rotateY(${-Math.cos(ang) * 30}deg)`,
                opacity: Math.min(1, t * 4) * (z > 500 ? 0 : 1) }}>
                <AppCam name={c.name} trim={c.trim} crop={c.crop} w={640} h={360} cx={320} cy={180} frameGlow={1} />
              </div>
            );
          })}
          <AbsoluteFill style={{ background: `radial-gradient(30% 30% at 50% 50%, rgba(255,240,210,${0.25 + 0.6 * speed}), transparent 70%)` }} />
        </AbsoluteFill>
      )}
      {f >= h1 && (
        <>
          <Ambient glow={1.8} />
          <AbsoluteFill style={{ background: `conic-gradient(from ${f * 0.4}deg at 50% 38%, transparent 0deg, rgba(220,179,109,0.1) 10deg, transparent 22deg, transparent 90deg, rgba(220,179,109,0.08) 100deg, transparent 112deg, transparent 180deg, rgba(220,179,109,0.1) 190deg, transparent 202deg, transparent 270deg, rgba(220,179,109,0.08) 280deg, transparent 292deg)` }} />
          <div style={{ position: "absolute", left: CX - 200, top: 150, transform: `scale(${mix(1.5, 1, prog(f, h1, 14, EASE.signature)) * (1 + 0.03 * pulse(f - h1, BEAT))}) rotate(${mix(-40, 0, prog(f, h1, 20, EASE.signature))}deg)` }}>
            <Mark size={400} fly={[0, 1, 2, 3, 4].map((i) => prog(f, h1 + i, 6))} fold={[0, 1, 2, 3, 4].map((i) => prog(f, h1 + 3 + i, 8))} heart={prog(f, h1 + 8, 6)} glow={1.5} />
          </div>
          {f >= h2 - 1 && (
            <div style={{ position: "absolute", left: 0, width: W, top: 590, display: "flex", justifyContent: "center" }}>
              <Letters text="JASMINE" at={h2} every={2} gold={[3]} style={{ fontFamily: FONT.serif, fontSize: 220, color: COLOR.ink, letterSpacing: "0.06em", lineHeight: 1 }} />
            </div>
          )}
          <Thread x0={mix(CX, CX - 420, prog(f, h3, 14, EASE.signature))} x1={mix(CX, CX + 420, prog(f, h3, 14, EASE.signature))} y={850} />
          <div style={{ position: "absolute", left: 0, width: W, top: 880, textAlign: "center" }}>
            <Slam at={h3} style={{ ...TYPE.eyebrow, fontSize: 28, color: COLOR.ink2, letterSpacing: "0.38em" }}>Rothschild &amp; Co Asset Management</Slam>
          </div>
        </>
      )}
      <Flash at={h1} peak={0.55} dur={18} />
      <Flash at={h2} peak={0.25} dur={12} />
      <Flash at={h3} peak={0.3} dur={14} />
      <AbsoluteFill style={{ background: "#000", opacity: prog(f, L - 8, 8, EASE.exit) }} />
      <Grain />
    </AbsoluteFill>
  );
};

// ================================================================== 11. Épilogue (82,4 → 90 s) : silence, tic-tac, JUMP n'a pas fini
export const Epilogue: React.FC = () => {
  const f = useCurrentFrame();
  const g = f + from("epilogue");
  const el = Math.max(0, (g - JUMP_START) / 30);
  const p = Math.min(1, el / JUMP_S);
  const tick = Math.exp(-(((g - 6) % 30 + 30) % 30) / 4);
  const sig = prog(f, loc("epilogue", 87.4), 16, EASE.signature);
  const fade = prog(f, len("epilogue") - 16, 16, EASE.premium);
  return (
    <AbsoluteFill style={{ background: "#020305" }}>
      <div style={{ opacity: (1 - fade) * prog(f, 8, 16) * (1 - 0.6 * sig) }}>
        <div style={{ position: "absolute", left: CX - 560, width: 1120, top: 330 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT.mono, fontSize: 26, color: COLOR.ink2, letterSpacing: "0.06em" }}>
            <span>› Extraction JUMP · lancée à 08:02</span>
            <span style={{ ...NUMERIC, color: COLOR.ink }}>{mmss(el)} <span style={{ opacity: 0.4 + 0.6 * tick }}>●</span></span>
          </div>
          <div style={{ position: "relative", height: 8, marginTop: 20, background: "rgba(214,209,202,0.12)" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${p * 100}%`, background: COLOR.ink2 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontFamily: FONT.mono, fontSize: 22, color: COLOR.ink3, ...NUMERIC }}>
            <span>{(p * 100).toFixed(0)} %</span><span>temps estimé ≈ 10 min</span>
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: 560, textAlign: "center", opacity: 1 - fade }}>
        <Slam at={loc("epilogue", 83.2)} out={loc("epilogue", 87.1)} style={{ ...TYPE.title, fontSize: 80, color: COLOR.ink2, fontStyle: "italic" }}>Pendant ce film…</Slam>
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: 670, textAlign: "center", opacity: 1 - fade }}>
        <Slam at={loc("epilogue", 85.0)} out={loc("epilogue", 87.1)} style={{ ...TYPE.title, fontSize: 96, color: COLOR.ink }}>JUMP n'aurait pas terminé.</Slam>
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: 560, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, opacity: sig * (1 - fade) }}>
        <MarkStatic size={120} glow={0.8} />
        <span style={{ fontFamily: FONT.serif, fontSize: 110, color: COLOR.ink }}>Jasmine</span>
        <span style={{ fontFamily: FONT.serif, fontStyle: "italic", fontSize: 40, color: COLOR.goldInk }}>Tout, au même endroit.</span>
      </div>
      <Note opacity={1 - fade}>Durée indicative · images de l'application sur jeu de données fictif · musique « Driving Concern », FreePD (CC0)</Note>
      <Grain />
    </AbsoluteFill>
  );
};

