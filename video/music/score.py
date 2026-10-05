"""
« Le fil d'or » — partition originale, synthétisée (aucun échantillon, aucune œuvre tierce : libre de droits).

Nappe de cordes et piano retenus, 60 battements par minute, en si mineur résolu en ré majeur. Chaque accent tombe sur
une image de la vidéo : apparition du point, compteurs qui se figent, crans de granularité, termes de l'équation,
entrée dans la cité, palettes du tableau des départs, signature. Le rythme du piano suit la granularité de la scène 4
(plus la période est fine, plus les notes sont serrées).

    python3 music/score.py            # écrit public/music.wav (44,1 kHz, stéréo, 16 bits)

Le calage reprend les durées de src/Video.tsx (SCENES, WIPE, FADE) : à mettre à jour si le montage change.
"""
from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

SR = 44100
FPS = 30
# Montage (src/Video.tsx) : débuts de scène en images, transitions déduites
SCENES = dict(point=120, noise=150, curve=240, granularity=180, equation=180, city=240, departures=180, holders=150, app=180, signature=120)
WIPE, FADE = 24, 18
_starts, _t = {}, 0
for _k, _d in SCENES.items():
    if _k == "city":
        _t -= WIPE
    if _k == "departures":
        _t -= FADE
    if _k == "holders":
        _t -= WIPE
    _starts[_k] = _t
    _t += _d
TOTAL_S = _t / FPS
S = {k: v / FPS for k, v in _starts.items()}          # début de chaque scène, en secondes
at = lambda scene, frame: S[scene] + frame / FPS      # image locale d'une scène → secondes

rng = np.random.default_rng(1798)                     # graine fixe : rendu reproductible
N = int(TOTAL_S * SR) + SR
L = np.zeros(N)
R = np.zeros(N)
WET_L = np.zeros(N)
WET_R = np.zeros(N)


def midi(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def place(sig: np.ndarray, t0: float, gain: float = 1.0, pan: float = 0.0, wet: float = 0.35) -> None:
    """Ajoute un signal mono à t0 (s), panoramique −1…1, part envoyée dans la réverbération."""
    i = int(t0 * SR)
    if i >= N or i + len(sig) <= 0:
        return
    s = sig[max(0, -i): N - i] * gain
    i = max(0, i)
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    L[i:i + len(s)] += s * gl * (1 - wet * 0.5)
    R[i:i + len(s)] += s * gr * (1 - wet * 0.5)
    WET_L[i:i + len(s)] += s * gl * wet
    WET_R[i:i + len(s)] += s * gr * wet


def env_adsr(n: int, a: float, r: float) -> np.ndarray:
    t = np.arange(n) / SR
    dur = n / SR
    e = np.minimum(1, t / max(a, 1e-3))
    e *= np.clip((dur - t) / max(r, 1e-3), 0, 1)
    return e * e * (3 - 2 * e)


# ------------------------------------------------------------------ instruments
def piano(m: float, dur: float = 3.2, vel: float = 0.6) -> np.ndarray:
    f = midi(m)
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    B = 0.00035
    for k in range(1, 14):
        fk = f * k * np.sqrt(1 + B * k * k)
        if fk > 15000:
            break
        amp = (1 / k ** 1.15) * (0.55 + 0.45 * vel) ** (k * 0.35)
        dec = np.exp(-t * (0.6 + 0.42 * k) * (1.0 + (m - 60) / 60))
        for det in (-0.7, 0.7):                                   # deux cordes légèrement désaccordées
            y += 0.5 * amp * dec * np.sin(2 * np.pi * fk * (1 + det / 1731) * t + rng.uniform(0, 6.28))
    y *= 1 - np.exp(-t / 0.003)
    hammer = rng.normal(0, 1, min(n, int(0.012 * SR))) * np.exp(-np.arange(min(n, int(0.012 * SR))) / (0.002 * SR))
    y[: len(hammer)] += np.diff(np.r_[0, hammer]) * 0.03
    y *= env_adsr(n, 0.002, 0.25)
    return y * vel


def pad(notes: list[int], dur: float, bright: float = 0.5, a: float = 1.6, r: float = 2.2) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for m in notes:
        f = midi(m)
        for det in (-7, 0, 7):                                    # trois voix : chorus de cordes
            ph = rng.uniform(0, 6.28)
            vib = 1 + 0.0018 * np.sin(2 * np.pi * (4.6 + rng.uniform(-0.4, 0.4)) * t + ph)
            for k in range(1, 11):
                if f * k > 9000:
                    break
                amp = (1 / k ** (2.1 - bright)) / len(notes)
                y += amp * np.sin(2 * np.pi * f * k * (1 + det / 1731) * vib * t + ph * k)
    y *= 1 + 0.12 * np.sin(2 * np.pi * 0.13 * t)
    return y * env_adsr(n, a, r) * 0.33


def bass(m: int, dur: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = midi(m)
    y = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    return y * env_adsr(n, 0.8, 1.6)


def kick(vel: float = 1.0) -> np.ndarray:
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    f = 42 + 48 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return vel * np.sin(ph) * np.exp(-t / 0.22) * (1 - np.exp(-t / 0.002))


def tick(freq: float = 3200, dur: float = 0.05) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = np.diff(np.r_[0, rng.normal(0, 1, n)]) * np.exp(-t / 0.002)
    return (0.6 * np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.012) + 0.4 * noise) * (1 - np.exp(-t / 0.0005))


def flap() -> np.ndarray:
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    x = np.diff(np.diff(np.r_[0, 0, rng.normal(0, 1, n)]))
    return x * np.exp(-t / 0.004) * 0.5 + 0.3 * np.sin(2 * np.pi * 1400 * t) * np.exp(-t / 0.006)


def onepole(x: np.ndarray, cut: np.ndarray | float) -> np.ndarray:
    """Passe-bas à un pôle, fréquence de coupure éventuellement variable (sons courts uniquement)."""
    cut = np.broadcast_to(np.asarray(cut, dtype=float), x.shape)
    a = np.exp(-2 * np.pi * cut / SR)
    y = np.empty_like(x)
    z = 0.0
    for i in range(len(x)):
        z = (1 - a[i]) * x[i] + a[i] * z
        y[i] = z
    return y


def riser(dur: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    k = t / dur
    noise = onepole(rng.normal(0, 1, n), 300 + 7000 * k ** 2) * (k ** 2.2)
    sweep = np.sin(2 * np.pi * np.cumsum(220 + 900 * k ** 2) / SR) * (k ** 3) * 0.25
    return (noise * 0.5 + sweep)


def whoosh(dur: float, rev: bool = False) -> np.ndarray:
    n = int(dur * SR)
    k = np.arange(n) / n
    e = np.sin(np.pi * k) ** 2
    y = onepole(rng.normal(0, 1, n), 400 + 3000 * e) * e
    return y[::-1] if rev else y


def boom() -> np.ndarray:
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    low = np.sin(2 * np.pi * (38 + 30 * np.exp(-t / 0.08)) * t) * np.exp(-t / 1.1)
    air = onepole(rng.normal(0, 1, n), 900) * np.exp(-t / 0.5) * 0.6
    return (low + air) * (1 - np.exp(-t / 0.003))


def reverse_swell(notes: list[int], dur: float) -> np.ndarray:
    y = pad(notes, dur, bright=0.9, a=0.05, r=0.05)
    k = np.arange(len(y)) / len(y)
    return y * k ** 3


# ------------------------------------------------------------------ harmonie (accords calés sur les scènes)
CH = {
    "Bm": (35, [47, 54, 62, 69, 73]), "G": (31, [43, 50, 59, 66, 69]), "D": (38, [50, 57, 62, 66, 76]),
    "A": (33, [45, 52, 61, 64, 71]), "Em": (40, [52, 59, 67, 71, 74]), "F#m": (30, [42, 54, 61, 69, 73]),
    "Dfin": (26, [38, 50, 57, 62, 66, 69, 76]),
}
progression = [
    (0.0, S["noise"], "Bm", 0.35), (S["noise"], S["curve"], "G", 0.4),
    (S["curve"], at("curve", 120), "D", 0.5), (at("curve", 120), S["granularity"], "A", 0.5),
    (S["granularity"], at("granularity", 84), "Bm", 0.55), (at("granularity", 84), S["equation"], "G", 0.6),
    (S["equation"], at("equation", 90), "Em", 0.45), (at("equation", 90), S["city"] + WIPE / FPS, "A", 0.55),
    (S["city"] + WIPE / FPS, at("city", 120), "D", 0.85), (at("city", 120), S["departures"], "Bm", 0.7),
    (S["departures"], at("departures", 90), "G", 0.55), (at("departures", 90), S["holders"], "A", 0.55),
    (S["holders"], at("holders", 75), "F#m", 0.45), (at("holders", 75), S["app"], "Bm", 0.5),
    (S["app"], at("app", 90), "G", 0.75), (at("app", 90), S["signature"], "A", 0.8),
    (S["signature"], TOTAL_S + 1.5, "Dfin", 0.7),
]
for t0, t1, name, bright in progression:
    root, notes = CH[name]
    dur = t1 - t0 + 1.8                                           # recouvrement : la nappe ne s'interrompt jamais
    place(pad(notes, dur, bright=bright), t0 - 0.4, gain=0.55, wet=0.5)
    place(bass(root, dur), t0 - 0.2, gain=0.22 if t0 >= S["curve"] else 0.12, wet=0.1)


def chord_at(t: float) -> list[int]:
    for t0, t1, name, _ in progression:
        if t0 <= t < t1:
            return CH[name][1]
    return CH["Dfin"][1]


def arpeggio(t0: float, t1: float, step: float, vel: float, octave: int = 12, pan: float = 0.25, vel_end: float | None = None) -> None:
    t, i = t0, 0
    while t < t1 - 1e-6:
        notes = sorted(n + octave for n in chord_at(t)[1:])
        seq = notes + notes[-2:0:-1]
        v = vel if vel_end is None else vel + (vel_end - vel) * (t - t0) / max(1e-6, t1 - t0)
        place(piano(seq[i % len(seq)], dur=2.4, vel=v * (0.9 + 0.2 * rng.random())), t, gain=0.5, pan=pan * np.sin(i * 1.7), wet=0.42)
        t += step
        i += 1


# ------------------------------------------------------------------ 01 · le point
place(piano(78, 4.0, 0.42), at("point", 12), gain=0.6, pan=0.1, wet=0.6)
place(whoosh(1.6), at("point", 44), gain=0.05, wet=0.6)
place(piano(71, 4.0, 0.35), at("point", 60), gain=0.5, pan=-0.2, wet=0.6)

# ------------------------------------------------------------------ 02 · le bruit
for k in range(4):
    place(piano([67, 74, 71, 78][k], 3.0, 0.35), S["noise"] + 0.2 + k * 0.9, gain=0.45, pan=[-0.3, 0.3, -0.1, 0.2][k], wet=0.55)
for j in range(70):                                               # grésillement des données, de plus en plus dense
    tt = S["noise"] + rng.uniform(0.1, 3.2)
    place(tick(rng.uniform(4000, 7500), 0.02), tt, gain=0.015 + 0.02 * rng.random(), pan=rng.uniform(-0.8, 0.8), wet=0.2)
place(whoosh(1.9, rev=True), at("noise", 64), gain=0.09, wet=0.5)   # aspiration vers le filet
place(piano(62, 3.5, 0.5), at("noise", 98), gain=0.45, wet=0.55)
place(piano(74, 3.5, 0.45), at("noise", 98), gain=0.4, wet=0.55)

# ------------------------------------------------------------------ 03 · la courbe
arpeggio(at("curve", 26), at("curve", 150), 0.5, 0.32, vel_end=0.55)
for b in np.arange(S["curve"], S["granularity"] - 0.01, 1.0):
    place(kick(0.5 if b < at("curve", 150) else 0.35), b, gain=0.32, wet=0.05)
place(tick(2600, 0.06), at("curve", 150), gain=0.14, wet=0.3)        # le compteur se fige
for m in (50, 57, 62, 66):
    place(piano(m, 3.6, 0.55), at("curve", 150), gain=0.32, wet=0.5)
place(whoosh(1.6), at("curve", 194), gain=0.07, wet=0.5)             # plongée

# ------------------------------------------------------------------ 04 · du jour à l'année (le rythme suit la granularité)
steps = [(0, 0.5), (30, 0.75), (56, 1.0), (84, 0.25), (112, 0.125)]
for i, (f0, stp) in enumerate(steps):
    t0 = at("granularity", f0)
    t1 = at("granularity", steps[i + 1][0]) if i + 1 < len(steps) else at("granularity", 150)
    arpeggio(t0, t1, stp, 0.3 if stp > 0.2 else 0.2, octave=12 if stp > 0.2 else 24, pan=0.4)
    if f0:
        place(tick(1900, 0.05), t0, gain=0.12, pan=0.3, wet=0.25)
place(reverse_swell(CH["Em"][1], 1.0), at("granularity", 150), gain=0.4, wet=0.6)

# ------------------------------------------------------------------ 05 · l'équation
for f, m in ((20, 76), (58, 79), (88, 83)):
    place(piano(m, 3.4, 0.5), at("equation", f), gain=0.5, pan=0.15, wet=0.55)
    place(tick(2400, 0.04), at("equation", f + 26), gain=0.08, wet=0.3)
for m in (57, 61, 64, 69, 73):
    place(piano(m, 4.0, 0.5), at("equation", 114), gain=0.3, wet=0.55)
place(riser(S["city"] + WIPE / FPS - at("equation", 140)), at("equation", 140), gain=0.12, wet=0.4)

# ------------------------------------------------------------------ 06 · la cité
T_CITY = S["city"] + WIPE / FPS
place(boom(), T_CITY, gain=0.42, wet=0.35)
for m in (38, 50, 57, 62, 66):
    place(piano(m, 5.0, 0.7), T_CITY, gain=0.3, wet=0.5)
for j, m in enumerate([62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88, 90, 93]):   # les tours montent
    place(piano(m, 2.0, 0.28), T_CITY + 0.15 + j * 0.16, gain=0.4, pan=-0.6 + j * 0.09, wet=0.55)
for b in np.arange(T_CITY + 1.0, S["departures"] - 0.2, 1.0):
    place(kick(0.42), b, gain=0.3, wet=0.05)
arpeggio(at("city", 70), at("city", 220), 0.5, 0.3, pan=0.35)
place(tick(2600, 0.06), at("city", 70), gain=0.13, wet=0.3)          # 397 M€
place(piano(81, 3.5, 0.45), at("city", 150), gain=0.4, pan=0.5, wet=0.6)

# ------------------------------------------------------------------ 07 · le tableau des départs
for r in range(9):
    for i in range(12):
        flips = 4 + int(rng.random() * 6)
        t0 = at("departures", 26 + r * 5 + i * 1.5)
        for k in range(0, flips, 2):
            place(flap(), t0 + k * 2 / FPS + rng.uniform(0, 0.01), gain=0.05 + 0.03 * rng.random(), pan=0.35 + rng.uniform(-0.3, 0.3), wet=0.15)
arpeggio(at("departures", 10), at("departures", 150), 1.0, 0.28, pan=0.2)

# ------------------------------------------------------------------ 08 · le passif
for k, t in enumerate(np.arange(S["holders"] + 0.2, at("holders", 120), 1.5)):
    place(piano(sorted(chord_at(t))[2 + k % 3] + 12, 3.5, 0.32), t, gain=0.45, pan=-0.2 + 0.2 * k, wet=0.6)
place(tick(2600, 0.06), at("holders", 84), gain=0.13, wet=0.3)       # 53 %
place(whoosh(1.0), at("holders", 128), gain=0.06, wet=0.5)

# ------------------------------------------------------------------ 09 · l'application
for i in range(6):
    place(kick(0.25), at("app", 8 + i * 5), gain=0.2, wet=0.15)
    place(tick(1500 + i * 120, 0.03), at("app", 8 + i * 5), gain=0.05, pan=0.4, wet=0.2)
arpeggio(at("app", 20), at("app", 156), 0.25, 0.22, vel_end=0.4, pan=0.4)
for b in np.arange(at("app", 30), at("app", 156), 1.0):
    place(kick(0.4), b, gain=0.3, wet=0.05)
place(whoosh(1.4), at("app", 92), gain=0.07, wet=0.5)
place(reverse_swell(CH["A"][1], S["signature"] - at("app", 150)), at("app", 150), gain=0.55, wet=0.6)

# ------------------------------------------------------------------ 10 · signature
for j, m in enumerate([26, 38, 45, 50, 54, 57, 62, 66, 69, 76]):  # accord égrené
    place(piano(m, 6.0, 0.6), S["signature"] + j * 0.045, gain=0.33, pan=-0.4 + j * 0.08, wet=0.6)
place(piano(81, 5.0, 0.42), at("signature", 26), gain=0.42, pan=0.3, wet=0.7)


# ------------------------------------------------------------------ réverbération, mixage, export
def reverb(x: np.ndarray, seed: int) -> np.ndarray:
    g = np.random.default_rng(seed)
    n = int(3.6 * SR)
    t = np.arange(n) / SR
    ir = g.normal(0, 1, n) * np.exp(-t / 0.95)
    ir[: int(0.012 * SR)] = 0                                        # pré-délai
    spec = np.fft.rfft(ir)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    spec *= 1 / (1 + (freqs / 4200) ** 2)                            # réverbération sombre
    ir = np.fft.irfft(spec, n)
    ir /= np.sqrt(np.sum(ir ** 2))
    m = 1 << int(np.ceil(np.log2(len(x) + n)))
    return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[: len(x)]


outL = L + reverb(WET_L, 7) * 1.1
outR = R + reverb(WET_R, 11) * 1.1
mix = np.stack([outL, outR], axis=1)[: int(TOTAL_S * SR)]
mix = np.tanh(mix * 1.15) / np.tanh(1.15)                             # saturation douce
n = len(mix)
fade_in = np.minimum(1, np.arange(n) / (0.4 * SR))
fade_out = np.clip((TOTAL_S - np.arange(n) / SR) / 1.6, 0, 1)
mix *= (fade_in * fade_out)[:, None]
mix *= 0.89 / np.max(np.abs(mix))

out = Path(__file__).resolve().parents[1] / "public" / "music.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(f"{out} · {TOTAL_S:.2f} s · début des scènes : " + ", ".join(f"{k} {v:.2f}" for k, v in S.items()))
