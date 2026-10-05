"""Instruments de synthèse partagés par les partitions (aucun échantillon : tout est calculé, donc libre de droits)."""
from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

SR = 44100
rng = np.random.default_rng(1798)


def midi(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


class Mix:
    """Bus stéréo sec + envoi réverbération."""

    def __init__(self, seconds: float):
        self.n = int(seconds * SR) + SR
        self.L, self.R = np.zeros(self.n), np.zeros(self.n)
        self.WL, self.WR = np.zeros(self.n), np.zeros(self.n)

    def place(self, sig: np.ndarray, t0: float, gain: float = 1.0, pan: float = 0.0, wet: float = 0.35) -> None:
        i = int(t0 * SR)
        if i >= self.n or i + len(sig) <= 0:
            return
        s = sig[max(0, -i): self.n - i] * gain
        i = max(0, i)
        gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sl = slice(i, i + len(s))
        self.L[sl] += s * gl * (1 - wet * 0.5)
        self.R[sl] += s * gr * (1 - wet * 0.5)
        self.WL[sl] += s * gl * wet
        self.WR[sl] += s * gr * wet

    def render(self, seconds: float, out: Path, fade_out: float = 1.6, duck: list[tuple[float, float, float]] | None = None,
               voice: list[tuple[float, float]] | None = None, voice_level: float = 0.42) -> None:
        l = self.L + reverb(self.WL, 7) * 1.1
        r = self.R + reverb(self.WR, 11) * 1.1
        m = np.stack([l, r], axis=1)[: int(seconds * SR)]
        if duck:                                                   # silences francs : (début, fin, niveau)
            t = np.arange(len(m)) / SR
            g = np.ones(len(m))
            for a, b, lvl in duck:
                g[(t >= a) & (t < b)] = lvl
            k = int(0.03 * SR)
            g = np.convolve(g, np.ones(k) / k, mode="same")
            m *= g[:, None]
        if voice:                                                  # la musique s'efface sous la voix off
            t = np.arange(len(m)) / SR
            g = np.ones(len(m))
            for a, b in voice:
                g[(t >= a - 0.12) & (t < b + 0.2)] = voice_level
            k = int(0.25 * SR)
            g = np.convolve(g, np.ones(k) / k, mode="same")
            m *= g[:, None]
        m = np.tanh(m * 1.15) / np.tanh(1.15)
        n = len(m)
        m *= (np.minimum(1, np.arange(n) / (0.3 * SR)) * np.clip((seconds - np.arange(n) / SR) / fade_out, 0, 1))[:, None]
        m *= 0.89 / np.max(np.abs(m))
        with wave.open(str(out), "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((m * 32767).astype("<i2").tobytes())


def env_adsr(n: int, a: float, r: float) -> np.ndarray:
    t = np.arange(n) / SR
    dur = n / SR
    e = np.minimum(1, t / max(a, 1e-3)) * np.clip((dur - t) / max(r, 1e-3), 0, 1)
    return e * e * (3 - 2 * e)


def piano(m: float, dur: float = 3.2, vel: float = 0.6) -> np.ndarray:
    f = midi(m)
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for k in range(1, 14):
        fk = f * k * np.sqrt(1 + 0.00035 * k * k)
        if fk > 15000:
            break
        amp = (1 / k ** 1.15) * (0.55 + 0.45 * vel) ** (k * 0.35)
        dec = np.exp(-t * (0.6 + 0.42 * k) * (1.0 + (m - 60) / 60))
        for det in (-0.7, 0.7):
            y += 0.5 * amp * dec * np.sin(2 * np.pi * fk * (1 + det / 1731) * t + rng.uniform(0, 6.28))
    y *= 1 - np.exp(-t / 0.003)
    return y * env_adsr(n, 0.002, 0.25) * vel


def pad(notes: list[int], dur: float, bright: float = 0.5, a: float = 1.6, r: float = 2.2, det_c: float = 7) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for m in notes:
        f = midi(m)
        for det in (-det_c, 0, det_c):
            ph = rng.uniform(0, 6.28)
            vib = 1 + 0.0018 * np.sin(2 * np.pi * (4.6 + rng.uniform(-0.4, 0.4)) * t + ph)
            for k in range(1, 11):
                if f * k > 9000:
                    break
                y += (1 / k ** (2.1 - bright)) / len(notes) * np.sin(2 * np.pi * f * k * (1 + det / 1731) * vib * t + ph * k)
    y *= 1 + 0.12 * np.sin(2 * np.pi * 0.13 * t)
    return y * env_adsr(n, a, r) * 0.33


def bass(m: int, dur: float, a: float = 0.02, r: float = 0.2) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = midi(m)
    y = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    return y * env_adsr(n, a, r)


def kick(vel: float = 1.0) -> np.ndarray:
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    f = 42 + 52 * np.exp(-t / 0.035)
    return vel * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.24) * (1 - np.exp(-t / 0.002))


def hat(dur: float = 0.05) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.diff(np.diff(np.r_[0, 0, rng.normal(0, 1, n)]))
    return x * np.exp(-t / 0.012) * 0.25


def tick(freq: float = 3200, dur: float = 0.05) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = np.diff(np.r_[0, rng.normal(0, 1, n)]) * np.exp(-t / 0.002)
    return (0.6 * np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.012) + 0.4 * noise) * (1 - np.exp(-t / 0.0005))


def clock() -> np.ndarray:
    """Tic d'horloge mécanique : deux claquements très courts, boisés."""
    a, b = tick(2100, 0.04), tick(1500, 0.04)
    y = np.zeros(int(0.06 * SR))
    y[: len(a)] += a
    j = int(0.012 * SR)
    y[j: j + len(b)] += 0.6 * b[: len(y) - j]
    return y


def onepole(x: np.ndarray, cut) -> np.ndarray:
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
    k = np.arange(n) / n
    noise = onepole(rng.normal(0, 1, n), 300 + 7000 * k ** 2) * (k ** 2.2)
    sweep = np.sin(2 * np.pi * np.cumsum(220 + 900 * k ** 2) / SR) * (k ** 3) * 0.25
    return noise * 0.5 + sweep


def whoosh(dur: float, rev: bool = False, bright: float = 3000) -> np.ndarray:
    n = int(dur * SR)
    k = np.arange(n) / n
    e = np.sin(np.pi * k) ** 2
    y = onepole(rng.normal(0, 1, n), 400 + bright * e) * e
    return y[::-1] if rev else y


def boom(dur: float = 3.0) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    low = np.sin(2 * np.pi * (36 + 30 * np.exp(-t / 0.08)) * t) * np.exp(-t / 1.1)
    air = onepole(rng.normal(0, 1, n), 900) * np.exp(-t / 0.5) * 0.6
    return (low + air) * (1 - np.exp(-t / 0.003))


def drone(notes: list[int], dur: float, beat_hz: float = 0.3) -> np.ndarray:
    """Nappe froide : sinus graves légèrement désaccordés, battement lent."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for m in notes:
        f = midi(m)
        y += np.sin(2 * np.pi * f * t) + np.sin(2 * np.pi * (f + beat_hz) * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)
    return y / (3 * len(notes)) * env_adsr(n, 2.0, 1.5)


def reverse_swell(notes: list[int], dur: float) -> np.ndarray:
    y = pad(notes, dur, bright=0.9, a=0.05, r=0.05)
    return y * (np.arange(len(y)) / len(y)) ** 3


def reverb(x: np.ndarray, seed: int) -> np.ndarray:
    g = np.random.default_rng(seed)
    n = int(3.6 * SR)
    t = np.arange(n) / SR
    ir = g.normal(0, 1, n) * np.exp(-t / 0.95)
    ir[: int(0.012 * SR)] = 0
    spec = np.fft.rfft(ir)
    spec *= 1 / (1 + (np.fft.rfftfreq(n, 1 / SR) / 4200) ** 2)
    ir = np.fft.irfft(spec, n)
    ir /= np.sqrt(np.sum(ir ** 2))
    m = 1 << int(np.ceil(np.log2(len(x) + n)))
    return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[: len(x)]
