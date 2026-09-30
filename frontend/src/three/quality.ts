/**
 * Gouverneur de qualité commun aux scènes 3D : fluidité d'abord.
 * - Au repos (ni défilement, ni souris, ni clavier depuis 0,6 s), les scènes se dessinent à 30 images/s au lieu de 60.
 * - Si l'ordinateur peine (images nettement plus lentes que la cadence visée), la qualité baisse d'un cran, sans jamais remonter
 *   pendant la session : 2 = complète, 1 = résolution 1:1, 0 = sans halo lumineux ni ombres ni reflets.
 * - Les postes modestes (≤ 4 cœurs ou ≤ 4 Go) démarrent directement au cran 1.
 */
export type Level = 0 | 1 | 2;

const KEY = "rco.quality";
let lastActivity = performance.now();
if (typeof window !== "undefined") {
  const on = () => { lastActivity = performance.now(); };
  ["scroll", "pointermove", "wheel", "touchmove", "keydown", "pointerdown"].forEach((e) => window.addEventListener(e, on, { passive: true }));
}

export const activeRecently = (ms = 600) => performance.now() - lastActivity < ms;

function initialLevel(): Level {
  try {
    const s = sessionStorage.getItem(KEY);
    if (s === "0" || s === "1" || s === "2") return Number(s) as Level;
  } catch { /* stockage indisponible */ }
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return cores <= 4 || mem <= 4 ? 1 : 2;
}

export class Quality {
  level: Level = initialLevel();
  private samples: number[] = [];
  private last = 0;

  constructor(private apply: (l: Level) => void) {}

  pixelRatio(): number {
    return this.level === 2 ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
  }

  get bloom(): boolean { return this.level > 0; }

  /** À appeler à chaque requestAnimationFrame : indique s'il faut dessiner cette image. */
  gate(now: number, busy = false): boolean {
    const full = busy || activeRecently();
    const gap = full ? 0 : 1000 / 30;
    if (this.last && now - this.last < gap - 2) return false;
    if (this.last && now - this.last < 1000) this.measure((now - this.last) / (full ? 1000 / 60 : 1000 / 30));
    this.last = now;
    return true;
  }

  /** `ratio` : durée réelle de l'image rapportée à la cible (1 = cadence tenue). */
  private measure(ratio: number) {
    this.samples.push(ratio);
    if (this.samples.length < 45) return;
    // (une image de plus d'une seconde : onglet en arrière-plan, pas une mesure — écartée plus haut)
    const s = this.samples.sort((a, b) => a - b).slice(0, Math.floor(this.samples.length * 0.9));
    this.samples = [];
    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    // Plus de 1,6 fois la durée cible (≈ moins de 37 images/s en mouvement) : on allège d'un cran
    if (avg > 1.6 && this.level > 0) {
      this.level = (this.level - 1) as Level;
      try { sessionStorage.setItem(KEY, String(this.level)); } catch { /* idem */ }
      this.apply(this.level);
    }
  }
}
