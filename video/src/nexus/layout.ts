/**
 * Disposition du clavier 3D de l'application (frontend/src/three/KeyboardScene.ts) : mêmes touches AZERTY, mêmes
 * proportions. Les positions de repos sont calculées une fois, pour que chaque plan puisse déplacer une touche précise.
 */
export type KeyDef = { code: string; label: string; sub?: string; w?: number };
const R = (defs: [string, string, string?, number?][]): KeyDef[] => defs.map((d) => ({ code: d[0], label: d[1], sub: d[2], w: d[3] }));

export const LAYOUT: KeyDef[][] = [
  R([["Backquote", "²"], ["Digit1", "1", "&"], ["Digit2", "2", "é"], ["Digit3", "3", '"'], ["Digit4", "4", "'"], ["Digit5", "5", "("], ["Digit6", "6", "-"],
    ["Digit7", "7", "è"], ["Digit8", "8", "_"], ["Digit9", "9", "ç"], ["Digit0", "0", "à"], ["Minus", "°", ")"], ["Equal", "+", "="], ["Backspace", "⌫", undefined, 2]]),
  R([["Tab", "⇥", undefined, 1.5], ["KeyQ", "A"], ["KeyW", "Z"], ["KeyE", "E"], ["KeyR", "R"], ["KeyT", "T"], ["KeyY", "Y"], ["KeyU", "U"], ["KeyI", "I"],
    ["KeyO", "O"], ["KeyP", "P"], ["BracketLeft", "¨", "^"], ["BracketRight", "£", "$"], ["Enter", "↵", undefined, 1.5]]),
  R([["CapsLock", "⇪", undefined, 1.75], ["KeyA", "Q"], ["KeyS", "S"], ["KeyD", "D"], ["KeyF", "F"], ["KeyG", "G"], ["KeyH", "H"], ["KeyJ", "J"], ["KeyK", "K"],
    ["KeyL", "L"], ["Semicolon", "M"], ["Quote", "%", "ù"], ["Backslash", "µ", "*"], ["NumpadEnter", "", undefined, 1.25]]),
  R([["ShiftLeft", "⇧", undefined, 1.25], ["IntlBackslash", ">", "<"], ["KeyZ", "W"], ["KeyX", "X"], ["KeyC", "C"], ["KeyV", "V"], ["KeyB", "B"], ["KeyN", "N"],
    ["KeyM", "?", ","], ["Comma", ".", ";"], ["Period", "/", ":"], ["Slash", "§", "!"], ["ShiftRight", "⇧", undefined, 2.75]]),
  R([["ControlLeft", "ctrl", undefined, 1.5], ["AltLeft", "alt", undefined, 1.5], ["Space", "", undefined, 8.5], ["AltRight", "alt gr", undefined, 1.5], ["ControlRight", "ctrl", undefined, 2]]),
];

export const U = 1.9;       // pas d'une touche
export const GAP = 0.2;
export const KEY_H = 0.62;

export type KeyInfo = KeyDef & { index: number; row: number; x: number; z: number; width: number };

const rowW = (r: KeyDef[]) => r.reduce((s, k) => s + (k.w ?? 1), 0) * U;
export const BOARD_W = Math.max(...LAYOUT.map(rowW));
export const BOARD_D = LAYOUT.length * U;

export const KEYS: KeyInfo[] = (() => {
  const out: KeyInfo[] = [];
  LAYOUT.forEach((row, ri) => {
    let x = -rowW(row) / 2;
    const z = -BOARD_D / 2 + ri * U + U / 2;
    row.forEach((def) => {
      const w = def.w ?? 1;
      out.push({ ...def, index: out.length, row: ri, x: x + (w * U) / 2, z, width: w });
      x += w * U;
    });
  });
  return out;
})();
export const KEY_BY_CODE = new Map(KEYS.map((k) => [k.code, k]));

/** Touche frappée pour un caractère (AZERTY de l'application). */
const CHAR: Record<string, string> = { " ": "Space", "?": "KeyM", ",": "KeyM", ".": "Comma", "'": "Digit4", "-": "Digit6", "é": "Digit2", "è": "Digit7",
  "à": "Digit0", "ç": "Digit9", "ù": "Quote", ":": "Period", "!": "Slash", "↵": "Enter" };
export const codeForChar = (c: string): string | undefined => {
  const l = c.toLowerCase();
  if (CHAR[l]) return CHAR[l];
  if (/[0-9]/.test(l)) return `Digit${l}`;
  return KEYS.find((k) => k.label.toLowerCase() === l && /^Key|^Semicolon$/.test(k.code))?.code;
};
