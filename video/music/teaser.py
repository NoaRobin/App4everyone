"""
« Dix minutes » — partition originale du teaser, jouée par de vrais instruments échantillonnés (aucune synthèse).

Instruments (python3 music/echantillons.py, licence CC-BY 3.0) :
  piano à queue Salamander (Alexander Holm) ; violons, violoncelle, contrebasse, harpe, cor (tonejs-instruments,
  Nicholaus Brosowsky).

Écriture : un thème de piano original en ré majeur sur la progression I – V6 – vi – IV (ré, la/do♯, si mineur, sol),
un accord toutes les 4 secondes : deux mesures à 120 battements par minute, donc les coupes du montage tombent sur un temps.

I.   L'attente : piano seul, le thème posé, des violons très doux ; le tic-tac de l'extraction, joué par la harpe, discret.
II.  « Et si tout était déjà là ? » : tout se retire, une note, puis les cordes s'ouvrent. Le piano se met à couler, le
     violoncelle chante, la harpe scintille ; le cor sur les grands moments (manifeste, 50,3 Md€, R-co Valor, le mur).
III. Le compte : piano seul et tic-tac, puis le thème une dernière fois, et un dernier accord pour « Nexus ».

    python3 music/echantillons.py    # une fois
    python3 music/teaser.py          # écrit public/teaser.wav ; calage repris de src/teaser/timeline.ts
"""
from __future__ import annotations

import json
import re
import subprocess
from functools import lru_cache
from pathlib import Path

import imageio_ffmpeg
import numpy as np

from synth import SR, Mix, rng
from echantillons import CACHE

from montage import FPS, SHOTS
START, _t = {}, 0
for _k, _d in SHOTS.items():
    START[_k] = _t / FPS
    _t += _d
TOTAL = _t / FPS
JUMP_START = 60 / FPS
at = lambda shot, frame: START[shot] + frame / FPS
mix = Mix(TOTAL)
P = mix.place

# ------------------------------------------------------------------ échantillonneur
_NAMES = {"C": 0, "Cs": 1, "D": 2, "Ds": 3, "E": 4, "F": 5, "Fs": 6, "G": 7, "Gs": 8, "A": 9, "As": 10, "B": 11}


def _midi_of(stem: str) -> int:
    n, o = re.fullmatch(r"([A-G]s?)(\d)", stem).groups()
    return 12 * (int(o) + 1) + _NAMES[n]


@lru_cache(maxsize=None)
def _bank(inst: str) -> dict[int, np.ndarray]:
    files = sorted((CACHE / inst).glob("*.mp3"))
    if not files:
        raise SystemExit("Échantillons absents : lancer d'abord python3 music/echantillons.py")
    out = {}
    for f in files:
        raw = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-v", "error", "-i", str(f), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                             capture_output=True, check=True).stdout
        x = np.frombuffer(raw, np.float32).astype(np.float64)
        loud = np.flatnonzero(np.abs(x) > 0.02 * np.abs(x).max())          # attaque au début exact du fichier
        x = x[max(0, loud[0] - 64):] if len(loud) else x
        out[_midi_of(f.stem)] = x / (np.sqrt(np.mean(x[: SR] ** 2)) + 1e-9) * 0.1   # niveaux égalisés d'une note à l'autre
    return out


def _lowpass(x: np.ndarray, cut: float) -> np.ndarray:
    f = np.maximum(np.fft.rfftfreq(len(x), 1 / SR), 1.0)
    return np.fft.irfft(np.fft.rfft(x) / np.sqrt(1 + (f / cut) ** 4) / np.sqrt(1 + (45 / f) ** 4), len(x))


@lru_cache(maxsize=None)
def note(inst: str, m: int, dur: float, vel: float = 0.6, attack: float = 0.0, release: float = 0.6) -> np.ndarray:
    """Une note : l'échantillon le plus proche, transposé ; jouée plus doucement = plus sombre ; durée et extinction."""
    bank = _bank(inst)
    src = min(bank, key=lambda k: (abs(k - m), k < m))
    x = bank[src]
    ratio = 2 ** ((m - src) / 12)
    n_need = int((dur + release) * SR)
    pos = np.arange(min(n_need, int((len(x) - 1) / ratio))) * ratio
    y = np.interp(pos, np.arange(len(x)), x)
    if len(y) < n_need:
        y = np.pad(y, (0, n_need - len(y)))
    t = np.arange(len(y)) / SR
    env = np.ones(len(y))
    if attack:
        env *= np.minimum(1, t / attack) ** 1.5
    env *= np.clip(1 - (t - dur) / release, 0, 1) ** 2
    y = _lowpass(y * env, 1500 + 9000 * vel ** 1.6)
    return y * vel


def play(inst: str, m: int, t0: float, dur: float, vel: float = 0.6, gain: float = 1.0, pan: float = 0.0, wet: float = 0.3,
         attack: float = 0.0, release: float = 0.6) -> None:
    P(note(inst, int(m), round(dur, 3), round(vel, 2), attack, release), t0, gain=gain, pan=pan, wet=wet)


# ------------------------------------------------------------------ harmonie et thème
BAR = 4.0
CHORDS = [  # (basse, accord pour les cordes, arpège du piano)
    (38, [62, 66, 69], [50, 57, 62, 66, 69, 66, 62, 57]),       # ré
    (37, [61, 64, 69], [49, 57, 61, 64, 69, 64, 61, 57]),       # la / do♯
    (35, [62, 66, 71], [47, 54, 59, 62, 66, 62, 59, 54]),       # si mineur
    (31, [62, 67, 71], [43, 50, 55, 59, 62, 59, 55, 50]),       # sol
]
# le thème : (temps en secondes depuis le début de la mesure, note, durée), une phrase par accord
THEME_A = [
    [(0.0, 78, 1.0), (1.0, 76, 0.5), (1.5, 74, 0.5), (2.0, 69, 2.0)],
    [(0.0, 76, 1.0), (1.0, 74, 0.5), (1.5, 73, 0.5), (2.0, 69, 2.0)],
    [(0.0, 74, 1.0), (1.0, 73, 0.5), (1.5, 71, 0.5), (2.0, 66, 2.0)],
    [(0.0, 71, 1.0), (1.0, 69, 0.5), (1.5, 67, 0.5), (2.0, 69, 1.0), (3.0, 74, 1.0)],
]
THEME_B = [   # la même idée, plus haut, plus ouverte
    [(0.0, 81, 1.5), (1.5, 78, 0.5), (2.0, 76, 1.0), (3.0, 74, 1.0)],
    [(0.0, 76, 1.5), (1.5, 73, 0.5), (2.0, 69, 2.0)],
    [(0.0, 78, 1.5), (1.5, 74, 0.5), (2.0, 73, 1.0), (3.0, 71, 1.0)],
    [(0.0, 74, 1.0), (1.0, 71, 1.0), (2.0, 69, 1.0), (3.0, 76, 1.0)],
]
chord_index = lambda t: int(max(0.0, t + 1e-6) // BAR) % 4


def theme(t0: float, t1: float, phrases, vel: float = 0.5, octave: int = 0, wet: float = 0.35) -> None:
    """Le thème au piano, de t0 à t1, recalé sur la grille des accords."""
    b0 = np.ceil(t0 / BAR - 1e-6) * BAR
    for k, bar in enumerate(np.arange(b0, t1 - 1e-6, BAR)):
        for dt, m, d in phrases[chord_index(bar)]:
            if bar + dt < t1:
                play("piano", m + octave, bar + dt, d * 1.6, vel * (0.92 + 0.1 * rng.random()), gain=0.9, pan=0.1, wet=wet, release=1.6)


def flow(t0: float, t1: float, step: float = 0.5, vel: float = 0.32, octave: int = 0, pan: float = 0.25) -> None:
    """Main gauche du piano : l'accord en croches, qui coule."""
    t = np.ceil(t0 / step - 1e-6) * step
    while t < t1 - 1e-6:
        arp = CHORDS[chord_index(t)][2]
        i = int(round((t % BAR) / step)) % len(arp)
        accent = 1.0 if i % 4 == 0 else 0.85
        play("piano", arp[i] + octave, t, step * 2.2, vel * accent * (0.93 + 0.1 * rng.random()), gain=0.75, pan=-pan, wet=0.3, release=1.2)
        t += step


def strings(t0: float, t1: float, vel: float = 0.35, octave: int = 0, cello: bool = False, bass: bool = False) -> None:
    """Cordes tenues, un accord par mesure, attaques et relâchements lents (aucune nappe synthétique)."""
    b0 = np.floor(t0 / BAR) * BAR
    for bar in np.arange(b0, t1 - 1e-6, BAR):
        s, e = max(bar, t0), min(bar + BAR, t1)
        if e - s < 0.5:
            continue
        root, ch, _ = CHORDS[chord_index(bar)]
        for j, m in enumerate(ch):
            play("violin", m + octave, s, e - s + 0.3, vel, gain=0.55, pan=-0.35 + 0.35 * j, wet=0.45, attack=0.7, release=1.4)
        if cello:
            play("cello", root + 12, s, min(3.2, e - s + 0.2), vel * 0.9, gain=0.7, pan=-0.2, wet=0.4, attack=0.25, release=1.2)
        if bass:
            play("contrabass", root, s, e - s + 0.2, vel * 0.7, gain=0.45, pan=0.0, wet=0.3, attack=0.3, release=1.0)


def harp_arp(t0: float, notes: list[int], step: float = 0.09, vel: float = 0.45, gain: float = 0.6) -> None:
    for j, m in enumerate(notes):
        play("harp", m, t0 + j * step, 2.5, vel, gain=gain, pan=-0.6 + 1.2 * j / max(1, len(notes) - 1), wet=0.5, release=1.5)


def horn(t0: float, notes: list[int], dur: float, vel: float = 0.4) -> None:
    for j, m in enumerate(notes):
        play("french-horn", m, t0, dur, vel, gain=0.5, pan=-0.2 + 0.4 * j, wet=0.55, attack=0.9, release=1.8)


def tictac(t0: float, t1: float, gain: float) -> None:
    """Le tic-tac de l'extraction, joué par la harpe étouffée : deux notes très brèves, dans la tonalité."""
    for k, s in enumerate(np.arange(t0, t1, 1.0)):
        play("harp", 81 if k % 2 == 0 else 76, s, 0.05, 0.35, gain=gain, pan=0.3, wet=0.15, release=0.09)


# ============================================================== I. l'attente
TR = START["rupture"]
tictac(JUMP_START, TR - 0.5, 0.35)
play("piano", 50, 0.6, 6.0, 0.4, gain=0.8, wet=0.4, release=2.0)                       # une note grave pour ouvrir
theme(BAR, TR - 1.0, THEME_A, vel=0.38, wet=0.4)                                         # le thème, seul, posé
flow(START["ritual"], TR - 1.0, step=1.0, vel=0.24)                                      # la main gauche, lente
strings(START["ritual"], TR - 0.5, vel=0.22)
# la rupture : tout se retire, une note, la question, puis les cordes s'ouvrent
play("piano", 74, at("rupture", 56), 4.0, 0.42, gain=0.9, pan=0.1, wet=0.55, release=2.5)
play("piano", 81, at("rupture", 118), 4.0, 0.36, gain=0.85, pan=-0.2, wet=0.6, release=2.5)
for j, m in enumerate([62, 66, 69]):
    play("violin", m, at("rupture", 110), START["fabric"] - at("rupture", 110) + 1.0, 0.3, gain=0.55, pan=-0.35 + 0.35 * j, wet=0.5, attack=1.6, release=1.2)

# ============================================================== II. tout, au même endroit
T0, TC = START["fabric"], START["count"]
# comment ça marche : le piano coule, le violoncelle entre ; la harpe quand les flux rejoignent Fabric
flow(T0, START["manifesto"], 0.5, 0.28)
strings(T0, START["manifesto"], vel=0.26, cello=True)
harp_arp(at("fabric", 80), [62, 66, 69, 74, 78, 81, 86], 0.12, 0.4)
theme(at("fabric", 300), START["manifesto"], THEME_A, vel=0.34)
# manifeste : le thème s'élève, le cor
harp_arp(START["manifesto"], [50, 57, 62, 66, 69, 74, 78], 0.07, 0.5)
horn(START["manifesto"], [50, 57], 6.0, 0.36)
theme(START["manifesto"], START["revenus"], THEME_B, vel=0.42)
flow(START["manifesto"], START["revenus"], 0.5, 0.3)
strings(START["manifesto"], TC, vel=0.3, cello=True, bass=True)
# l'application : le piano coule plus vite, le thème revient par moments
horn(START["revenus"], [57, 62], 4.5, 0.34)
flow(START["revenus"], START["passif"], 0.25, 0.24)
theme(START["revenus"], START["distribution"], THEME_A, vel=0.36)
theme(START["distribution"], START["passif"], THEME_B, vel=0.36)
flow(START["passif"], START["passif"] + 4.0, 0.5, 0.26, octave=12)                       # passif : respiration
flow(START["passif"] + 4.0, START["search"], 0.25, 0.24)
theme(START["perf"], START["search"], THEME_A, vel=0.36)
flow(START["search"], START["wall"], 0.5, 0.28)
harp_arp(at("search", 272), [74, 78, 81, 86], 0.1, 0.4)                                  # la réponse s'affiche
# le mur : l'élan, le thème haut, une note de harpe par mot
flow(START["wall"], at("wall", 214), 0.25, 0.3)
theme(START["wall"], at("wall", 214), THEME_B, vel=0.46, octave=12)
horn(START["wall"], [50, 57, 62], 7.0, 0.4)
strings(START["wall"], at("wall", 214), vel=0.36, octave=12)
for f in (8, 38, 68, 98, 128, 164):
    play("harp", CHORDS[chord_index(at("wall", f))][1][-1] + 12, at("wall", f), 1.8, 0.45, gain=0.6, pan=0.3, wet=0.5, release=1.2)

# ============================================================== III. le compte
TS = START["sign"]
tictac(np.ceil(TC), at("count", 186), 0.3)
play("piano", 62, at("count", 40), 4.0, 0.36, gain=0.9, wet=0.55, release=2.0)
play("piano", 57, at("count", 76), 4.0, 0.34, gain=0.9, wet=0.55, release=2.0)
for j, m in enumerate([62, 66, 69]):
    play("violin", m, at("count", 150), TS - at("count", 150) + 0.5, 0.26, gain=0.55, pan=-0.35 + 0.35 * j, wet=0.5, attack=1.8, release=1.5)
harp_arp(at("count", 196), [50, 57, 62, 66, 69, 74], 0.09, 0.42)
play("piano", 74, at("count", 196) + 0.6, 3.0, 0.38, gain=0.85, wet=0.5, release=2.0)
# signature : le thème une dernière fois, entier, puis l'accord final
theme(TS, at("sign", 300), THEME_A, vel=0.4, wet=0.45)
flow(TS, at("sign", 300), 0.5, 0.26)
strings(TS, at("sign", 300), vel=0.28, cello=True, bass=True)
horn(TS, [50, 57], 6.0, 0.3)
# Nexus : le dernier accord s'ouvre
NX = at("sign", 330)
for j, m in enumerate([38, 50, 57, 62, 66, 69, 74]):
    play("piano", m, NX + j * 0.05, 6.0, 0.42, gain=0.75, pan=-0.4 + 0.13 * j, wet=0.5, release=3.0)
harp_arp(NX + 0.4, [62, 66, 69, 74, 78, 81, 86], 0.1, 0.38)
for j, m in enumerate([62, 66, 69, 74]):
    play("violin", m, NX, TOTAL - NX, 0.26, gain=0.5, pan=-0.35 + 0.25 * j, wet=0.55, attack=1.2, release=2.0)
play("contrabass", 38, NX, TOTAL - NX, 0.2, gain=0.35, wet=0.3, attack=0.5, release=2.0)

VO = json.loads((Path(__file__).resolve().parents[1] / "src" / "teaser" / "vo.json").read_text())
voice = [(START[v["shot"]] + v["at"] / FPS, START[v["shot"]] + (v["at"] + v["frames"]) / FPS) for v in VO]
out = Path(__file__).resolve().parents[1] / "public" / "teaser.wav"
# la musique se retire un instant à la rupture, et se pose doucement sous la voix (sans effet de pompe)
mix.render(TOTAL, out, fade_out=3.0, duck=[(at("rupture", 0), at("rupture", 50), 0.3)], voice=voice, voice_level=0.6)
print(f"{out} · {TOTAL:.1f} s")
