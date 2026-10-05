"""
Bande son finale du teaser : musique (public/teaser.wav) + voix off (public/vo, calée par src/teaser/vo.json).

Les phrases (24 kHz) sont rééchantillonnées à 44,1 kHz par FFT, sans repliement : une simple interpolation linéaire
ajouterait un souffle aigu (12–22 kHz) qui n'existe pas dans la voix.

    python3 music/mixage.py out/mix.wav     # puis ffmpeg -i out/dix-minutes.mp4 -i out/mix.wav -map 0:v -map 1:a -c:v copy …
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

from montage import FPS, SHOTS

ROOT = Path(__file__).resolve().parents[1]


def resample(x: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    """Rééchantillonnage limité en bande (FFT, avec une marge de silence pour éviter le bouclage)."""
    pad = sr_in // 10
    x = np.pad(x, (pad, pad))
    n_out = int(round(len(x) * sr_out / sr_in))
    X = np.fft.rfft(x)
    Y = np.zeros(n_out // 2 + 1, dtype=complex)
    k = min(len(X), len(Y))
    Y[:k] = X[:k]
    y = np.fft.irfft(Y, n_out) * (n_out / len(x))
    p = int(round(pad * sr_out / sr_in))
    return y[p: n_out - p].astype(np.float32)


def main(out: Path) -> None:
    music, sr = sf.read(ROOT / "public" / "teaser.wav", dtype="float32")
    mix = music.copy()
    start, t = {}, 0
    for k, n in SHOTS.items():
        start[k] = t
        t += n
    low = []
    for v in json.loads((ROOT / "src" / "teaser" / "vo.json").read_text()):
        x, vsr = sf.read(ROOT / "public" / v["file"], dtype="float32")
        x = resample(x, vsr, sr) * 0.95 if vsr != sr else x * 0.95
        a = int(round((start[v["shot"]] + v["at"]) / FPS * sr))
        b = min(len(mix), a + len(x))
        mix[a:b] += x[: b - a, None]
        d = 20 * np.log10(np.sqrt((x ** 2).mean()) / (np.sqrt((music[a:b].mean(1) ** 2).mean()) + 1e-9))
        if d < 3:
            low.append(v["file"])
    mix *= 0.98 / np.abs(mix).max()
    sf.write(out, mix, sr)
    print(f"{out} · voix au-dessus de la musique de 3 dB au moins : " + ("toutes les phrases" if not low else f"sauf {low}"))


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "out" / "mix.wav")
