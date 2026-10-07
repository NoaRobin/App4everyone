"""Bande son du film « Le matin » (composition `Matin`) → public/matin/bande-son.wav.

  0 → 12 s   le tic-tac de l'horloge, un grave qui monte, un coup sourd à chaque matin (aucune musique) ;
 12 → 28 s   la musique entre sur son passage sans basses (« Driving Concern », FreePD, CC0 : 86 → 102 s) ;
 28 → 30 s   le creux du morceau, une montée de souffle ;
 30 s        l'explosion (102 → 104 s du morceau : 103,97 s), un impact grave par-dessus ;
 70,7 s      coupe invisible de 16 mesures (144,69 s → 178,98 s : le morceau se répète exactement) ;
 80,9 s      les derniers accords du morceau ; puis le silence et le tic-tac reviennent : JUMP n'a pas fini.

Grille : 112 battements par minute (un temps = 0,53575 s), le temps 0 du film à 30 s tombe sur l'explosion.
"""
from __future__ import annotations

import subprocess
import wave
from pathlib import Path

import numpy as np

from synth import SR, reverb

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SRC = ROOT / "public/matin/driving-concern.mp3"
OUT = ROOT / "public/matin/bande-son.wav"

DUR = 90.0
T0 = 103.9715 - 30.0          # film = morceau − T0 (l'explosion à 30 s)
BEAT = 0.53575
CUT_A, CUT_B = 144.69, 178.98  # 16 mesures retirées : film 70,72 s
MUSIC_IN = 12.0                # film : la musique entre (morceau 85,97 s, début du passage sans basses)
rng = np.random.default_rng(612)


def ffmpeg() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def load_track() -> np.ndarray:
    raw = subprocess.run([ffmpeg(), "-v", "error", "-i", str(SRC), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def seg(track: np.ndarray, a: float, b: float) -> np.ndarray:
    return track[int(round(a * SR)): int(round(b * SR))].copy()


def fade(x: np.ndarray, fin: float = 0.0, fout: float = 0.0) -> np.ndarray:
    n = len(x)
    if fin > 0:
        k = min(n, int(fin * SR)); x[:k] *= np.linspace(0, 1, k)[:, None] ** 2
    if fout > 0:
        k = min(n, int(fout * SR)); x[n - k:] *= np.linspace(1, 0, k)[:, None] ** 1.5
    return x


def place(bus: np.ndarray, sig: np.ndarray, t: float, gain: float = 1.0, pan: float = 0.0) -> None:
    i = int(round(t * SR))
    if sig.ndim == 1:
        gl, gr = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2), np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
        sig = np.stack([sig * gl, sig * gr], 1)
    j = min(len(bus), i + len(sig))
    if j > i:
        bus[i:j] += sig[: j - i] * gain


# ------------------------------------------------------------------ sons de synthèse
def tick(high: bool) -> np.ndarray:
    """Le tic (aigu) ou le tac (grave) d'une horloge mécanique : clic de bois + résonance métallique brève."""
    n = int(0.09 * SR); t = np.arange(n) / SR
    click = rng.standard_normal(n) * np.exp(-t / 0.0016)
    f = 2850 if high else 2150
    ring = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t)) * np.exp(-t / 0.012)
    body = np.sin(2 * np.pi * (520 if high else 410) * t) * np.exp(-t / 0.02)
    return (0.55 * click + 0.35 * ring + 0.5 * body) * 0.5


def boom(dur: float = 2.6, f0: float = 62, f1: float = 34) -> np.ndarray:
    """Coup sourd : sinus grave qui descend, un souffle bref en attaque."""
    n = int(dur * SR); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.18)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t / (dur * 0.38)) + 0.25 * np.sin(2 * ph) * np.exp(-t / 0.25)
    s += rng.standard_normal(n) * np.exp(-t / 0.03) * 0.25
    return np.tanh(s * 1.4) * 0.8


def drone(dur: float) -> np.ndarray:
    """Nappe grave : quinte à 49 / 73,5 Hz légèrement désaccordée, souffle filtré, qui enfle."""
    n = int(dur * SR); t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * f * t + p) for f, p in [(49, 0), (49.3, 1.1), (73.5, 0.4), (98.2, 2.0)])
    noise = np.convolve(rng.standard_normal(n), np.ones(220) / 220, mode="same") * 3
    env = np.clip(t / dur, 0, 1) ** 1.6
    return (s * 0.22 + noise * 0.4) * env


def riser(dur: float) -> np.ndarray:
    """Souffle qui monte (passe-haut glissant) et se coupe net."""
    n = int(dur * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n); lp = 0.0
    for i in range(n):  # filtre passe-bas d'ordre 1 dont la coupure monte
        a = 0.02 + 0.6 * (t[i] / dur) ** 2
        lp += a * (x[i] - lp); out[i] = x[i] - lp * (1 - t[i] / dur)
    return out * (t / dur) ** 2.2 * 0.5


def main() -> None:
    track = load_track()
    N = int(DUR * SR) + SR
    music = np.zeros((N, 2)); fx = np.zeros((N, 2)); wet = np.zeros((N, 2))

    # ---- musique : entrée sur le passage sans basses, coupe invisible, fin du morceau
    a = seg(track, MUSIC_IN + T0, CUT_A)
    a = fade(a, fin=1.8)
    place(music, a, MUSIC_IN)
    b = seg(track, CUT_B, 192.2)
    x = int(0.03 * SR)  # fondu enchaîné de 30 ms sur la coupe (sur un temps fort)
    b[:x] *= np.linspace(0, 1, x)[:, None]
    tail = music[int((CUT_A - T0) * SR) - x: int((CUT_A - T0) * SR)]
    tail *= np.linspace(1, 0, x)[:, None]
    place(music, b, CUT_A - T0 - x / SR)

    # ---- acte I : l'horloge (un tic par seconde), les matins, la nappe
    for s in range(1, 30):
        place(fx, tick(s % 2 == 1), s - 0.004, 0.9 if s < 12 else 0.6, pan=0.12 if s % 2 else -0.12)
    for t in [2.0, 5.0, 7.0, 8.5, 9.5]:  # Lundi, Mardi, Mercredi, Jeudi, Vendredi
        place(fx, boom(), t, 0.42)
    place(fx, drone(13.0), 0.0, 0.32)
    place(fx, riser(2.0), 28.0, 0.55)
    place(fx, boom(3.2, 70, 30), 30.0, 1.0)          # l'explosion
    for t in [78.75, 79.82, 80.89]:                   # les trois derniers accords, renforcés
        place(fx, boom(1.6, 66, 38), t, 0.55)
    # ---- épilogue : silence, le tic-tac revient
    for k, t in enumerate(np.arange(83.0, 89.6, 1.0)):
        place(fx, tick(k % 2 == 0), t, 0.95, pan=0.12 if k % 2 == 0 else -0.12)
    place(fx, boom(3.0, 58, 30), 89.0, 0.7)

    # ---- voix off (music/voix_matin.py) : la musique s'efface de 7 dB sous chaque phrase
    import json
    import soundfile as sf
    voice = np.zeros((N, 2)); duck = np.ones(N)
    for line in json.loads((ROOT / "src/matin/vo.json").read_text()):
        x, vsr = sf.read(ROOT / "public" / line["file"], dtype="float64")
        if x.ndim > 1:
            x = x.mean(1)
        x = np.interp(np.arange(int(len(x) * SR / vsr)) * vsr / SR, np.arange(len(x)), x)
        t = line["at"] / 30
        place(voice, x, t, 1.0)
        i0, i1 = int((t - 0.15) * SR), int((t + len(x) / SR + 0.35) * SR)
        duck[max(0, i0):i1] = np.minimum(duck[max(0, i0):i1], 10 ** (-7 / 20))
    k = int(0.12 * SR)
    duck = np.convolve(duck, np.ones(k) / k, mode="same")
    music *= duck[:, None]
    vpk = np.max(np.abs(voice)) or 1.0
    voice *= 0.62 / vpk
    wet += voice * 0.18 + fx * 0.35
    fx += voice
    rv = np.stack([reverb(wet[:, 0], 5), reverb(wet[:, 1], 5)], 1)[:N]
    mix = music * 0.92 + fx + rv * 0.8
    # limiteur doux
    peak = np.max(np.abs(mix)); mix = np.tanh(mix / max(1e-9, peak) * 1.15) / np.tanh(1.15) * 0.93
    mix = mix[: int(DUR * SR)]
    k = int(0.4 * SR); mix[-k:] *= np.linspace(1, 0, k)[:, None]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(mix, -1, 1) * 32767).astype("<i2").tobytes())
    print(f"→ {OUT} ({DUR:.1f} s)")


if __name__ == "__main__":
    main()
