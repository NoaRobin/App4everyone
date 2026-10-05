/**
 * Frappes du clavier, calculées à partir de l'image courante (aucune animation autonome) : enfoncement de la touche,
 * lueur, et l'onde qui se propage aux touches voisines — le même effet que dans l'application.
 */
import { codeForChar, KEY_BY_CODE, KeyInfo } from "./layout";
import type { KeyPose } from "./Keyboard3D";

export type Press = { code: string; at: number; force?: number };

/** Les frappes d'un texte tapé à partir de l'image `at`, un caractère toutes les `step` images (avec un peu de jeu). */
export function typed(text: string, at: number, step = 4): Press[] {
  const out: Press[] = [];
  let t = at;
  [...text].forEach((c, i) => {
    const code = codeForChar(c);
    if (code) out.push({ code, at: Math.round(t) });
    t += step * (0.75 + 0.5 * (((i * 7919) % 13) / 12));
  });
  return out;
}
export const typedEnd = (text: string, at: number, step = 4) => at + [...text].reduce((t, _, i) => t + step * (0.75 + 0.5 * (((i * 7919) % 13) / 12)), 0);

/** Texte visible à l'image f (pour la ligne de saisie à l'écran). */
export function typedText(text: string, at: number, f: number, step = 4): string {
  let t = at;
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (f >= t) n = i + 1;
    t += step * (0.75 + 0.5 * (((i * 7919) % 13) / 12));
  }
  return f < at ? "" : text.slice(0, n);
}

const env = (dt: number) => (dt < 0 ? 0 : dt < 3 ? dt / 3 : Math.max(0, 1 - (dt - 3) / 9));

/** Enfoncement et lueur d'une touche sous une série de frappes. */
export function pressPose(k: KeyInfo, presses: Press[], f: number): KeyPose {
  let press = 0;
  let glow = 0;
  for (const p of presses) {
    const dt = f - p.at;
    if (dt < -1 || dt > 70) continue;
    const force = p.force ?? 1;
    if (p.code === k.code) {
      press = Math.max(press, env(dt) * force);
      glow += dt >= 0 ? 1.1 * force * Math.exp(-dt / 16) : 0;
      continue;
    }
    const o = KEY_BY_CODE.get(p.code);
    if (!o) continue;
    const d = Math.hypot(o.x - k.x, o.z - k.z);
    if (d > 16) continue;
    const dw = dt - d * 0.55;
    if (dw < 0) continue;
    glow += 0.26 * force * (1 - d / 16) * Math.exp(-dw / 12);
    press = Math.max(press, 0.22 * force * (1 - d / 16) * env(dw));
  }
  return { press, glow: Math.min(1.6, glow) };
}

/** Onde de choc : toutes les touches, depuis une touche d'origine, à une vitesse donnée (unités par image). */
export function shock(k: KeyInfo, origin: string, at: number, f: number, speed = 1.6, strength = 1.3): KeyPose {
  const o = KEY_BY_CODE.get(origin)!;
  const d = Math.hypot(o.x - k.x, o.z - k.z);
  const dt = f - at - d / speed;
  if (dt < 0) return { glow: 0, press: 0 };
  return { glow: strength * Math.exp(-dt / 20), press: 0.45 * env(dt * 0.8), offset: [0, 0.9 * Math.exp(-dt / 7) * (dt < 2 ? dt / 2 : 1), 0] };
}

export const add = (a: KeyPose, b: KeyPose): KeyPose => ({
  ...a, ...b,
  press: Math.max(a.press ?? 0, b.press ?? 0),
  glow: Math.min(1.6, (a.glow ?? 0) + (b.glow ?? 0)),
  offset: a.offset || b.offset ? [(a.offset?.[0] ?? 0) + (b.offset?.[0] ?? 0), (a.offset?.[1] ?? 0) + (b.offset?.[1] ?? 0), (a.offset?.[2] ?? 0) + (b.offset?.[2] ?? 0)] : undefined,
});
