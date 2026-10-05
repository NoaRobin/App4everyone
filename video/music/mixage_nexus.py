"""
Bande son de la publicité « Nexus » : la musique (« From Page to Practice », FreePD, domaine public CC0) et la voix off.

La musique est recalée de 0,02 s pour que ses mesures tombent sur la grille du montage (une mesure = 45 images) ; elle
s'efface doucement sous chaque phrase (−6 dB, rampes de 0,3 s, sans effet de pompe). Rééchantillonnage de la voix sans
repliement (mixage.resample).

    python3 music/mixage_nexus.py           # → public/nexus/bande-son.wav
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import imageio_ffmpeg
import numpy as np
import soundfile as sf

from mixage import resample

ROOT = Path(__file__).resolve().parents[1]
SR, FPS, OFFSET, END = 44100, 30, 0.020, 4050 / 30


def main() -> None:
    raw = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-v", "error", "-i", str(ROOT / "public" / "nexus" / "from-page-to-practice.mp3"),
                          "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    music = np.frombuffer(raw, np.float32).reshape(-1, 2)[int(OFFSET * SR):].copy()
    n = int(END * SR)
    music = np.pad(music, ((0, max(0, n - len(music))), (0, 0)))[:n]
    vo = json.loads((ROOT / "src" / "nexus" / "vo.json").read_text())
    g = np.ones(n)
    t = np.arange(n) / SR
    for v in vo:
        a, b = v["at"] / FPS, (v["at"] + v["frames"]) / FPS
        g[(t >= a - 0.15) & (t < b + 0.25)] = 0.5
    k = int(0.3 * SR)
    g = np.convolve(g, np.ones(k) / k, mode="same")
    mix = music * g[:, None]
    low = []
    for v in vo:
        x, vsr = sf.read(ROOT / "public" / v["file"], dtype="float32")
        x = (resample(x, vsr, SR) if vsr != SR else x) * 1.0
        a = int(round(v["at"] / FPS * SR))
        b = min(n, a + len(x))
        d = 20 * np.log10(np.sqrt((x[: b - a] ** 2).mean()) / (np.sqrt((mix[a:b].mean(1) ** 2).mean()) + 1e-9))
        if d < 4:
            low.append((v["id"], round(float(d), 1)))
        mix[a:b] += x[: b - a, None]
    mix *= 0.95 / np.abs(mix).max()
    out = ROOT / "public" / "nexus" / "bande-son.wav"
    sf.write(out, mix.astype(np.float32), SR, subtype="PCM_16")
    print(f"{out} · {n / SR:.1f} s · voix à moins de 4 dB au-dessus de la musique : {low or 'aucune'}")


if __name__ == "__main__":
    main()
