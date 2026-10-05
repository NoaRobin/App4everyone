"""
« Dix minutes » — partition originale du teaser (synthèse, libre de droits).

Une musique douce et lumineuse, sans bruit ni bourdonnement : pas de rumeur, de souffle, d'impact, de batterie ni de basse
continue ; seul le tic-tac de l'extraction JUMP bat pendant l'attente et pendant le compte. Piano feutré et nappes
chaudes (grave coupé sous 110 Hz), en ré majeur, un accord toutes les 4 secondes (deux mesures à 120 battements
par minute, donc les coupes du montage tombent toujours sur un temps).

I.   L'attente : quelques notes de piano, posées, sur une nappe très légère. La rupture : la nappe se retire, une seule
     note, la question, puis l'harmonie s'ouvre doucement.
II.  Toutes les informations métiers : le piano se met à couler en croches, la nappe s'élargit ; un accord qui fleurit
     sur 50,3 Md€ et sur R-co Valor, des clochettes pour la tour, un peu plus d'élan sur le mur.
III. Le compte : retour au calme, puis l'accord chaud de la fin, la signature, et un dernier accord pour « Nexus ».

    python3 music/teaser.py          # écrit public/teaser.wav ; calage repris de src/teaser/timeline.ts
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from synth import SR, Mix, clock, midi, pad, piano, rng

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


# ------------------------------------------------------------------ timbres doux
def _lowpass(x: np.ndarray, cut: float, low: float = 110.0) -> np.ndarray:
    """Passe-bas doux, et coupe-bas sous `low` : rien qui bourdonne dans le grave."""
    f = np.maximum(np.fft.rfftfreq(len(x), 1 / SR), 1.0)
    return np.fft.irfft(np.fft.rfft(x) / np.sqrt(1 + (f / cut) ** 4) / np.sqrt(1 + (low / f) ** 4), len(x))


def felt(m: float, dur: float = 4.0, vel: float = 0.4) -> np.ndarray:
    """Piano feutré : marteau adouci, aigus retirés."""
    y = _lowpass(piano(m, dur, vel), 1800 + 900 * vel)
    k = int(0.008 * SR)
    y[:k] *= np.linspace(0, 1, k)
    return y


def bell(m: float, dur: float = 3.0, vel: float = 0.3) -> np.ndarray:
    """Clochette ronde (sinus et une partielle), pour les accents."""
    t = np.arange(int(dur * SR)) / SR
    f = midi(m)
    y = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2.0 * f * t) * np.exp(-t * 3)
    return y * np.exp(-t * 1.6) * (1 - np.exp(-t / 0.004)) * vel


def warm(notes: list[int], dur: float, a: float = 2.0, r: float = 3.0) -> np.ndarray:
    """Nappe chaude : peu d'harmoniques, désaccord léger, sans grain."""
    return _lowpass(pad(notes, dur, bright=0.12, a=a, r=r, det_c=3.5), 2400)


# ------------------------------------------------------------------ harmonie
CH = {  # (basse, voicing)
    "D":  (38, [50, 57, 62, 64, 66, 69]),    # ré majeur 9
    "Bm": (35, [47, 54, 62, 66, 69]),        # si mineur 7
    "G":  (31, [43, 50, 59, 62, 66]),        # sol majeur 7
    "A":  (33, [45, 52, 59, 61, 64]),        # la, avec la neuvième
    "Dfin": (26, [38, 50, 57, 62, 64, 66, 69, 74]),
}
PROG = ["D", "Bm", "G", "A"]
BAR = 4.0
chord_at = lambda t: PROG[int(max(0.0, t) // BAR) % 4]

# ============================================================== I. l'attente
T_R = START["rupture"]
for s_ in np.arange(JUMP_START, T_R, 1.0):                                             # le tic-tac de l'extraction
    P(clock(), s_, gain=0.18 + 0.1 * (s_ / T_R), pan=0.3, wet=0.2)
P(warm([50, 57, 62, 66], T_R + 1.0, a=4.0, r=2.5), 0.0, gain=0.32, wet=0.55)
for f, m in ((18, 62), (77, 66), (142, 64)):                                           # lancement : trois notes posées
    P(felt(m, 4.5, 0.32), at("launch", f), gain=0.42, wet=0.6)
for f, notes in ((18, [50, 62]), (66, [47, 66]), (126, [43, 62]), (174, [45, 64]), (240, [50, 66]), (306, [47, 69])):
    for j, m in enumerate(notes):                                                      # le rituel : une note grave et sa réponse
        P(felt(m, 5.0, 0.3 - 0.06 * j), at("ritual", f) + 0.35 * j, gain=0.4, pan=0.25 * (j - 0.5), wet=0.6)
# la rupture : la nappe se retire, une seule note, la question, puis l'harmonie s'ouvre
P(felt(74, 6.0, 0.34), at("rupture", 56), gain=0.45, pan=0.1, wet=0.75)
P(felt(81, 6.0, 0.28), at("rupture", 118), gain=0.38, pan=-0.2, wet=0.8)
P(warm(CH["D"][1], START["fabric"] - at("rupture", 110) + 2.0, a=4.5, r=2.0), at("rupture", 110), gain=0.35, wet=0.6)

# ============================================================== II. tout, au même endroit
T0, T1 = START["fabric"], START["count"]
for k, t in enumerate(np.arange(T0, T1, BAR)):
    _, notes = CH[PROG[k % 4]]
    lift = 1.0 + 0.25 * (t >= START["manifesto"]) + 0.15 * (t >= START["wall"])
    P(warm(notes, BAR + 2.6, a=1.4, r=2.4), t - 0.4, gain=0.30 * lift, wet=0.55)


def flow(t0: float, t1: float, step: float, vel: float, octave: int = 12, pan: float = 0.3) -> None:
    """Le piano qui coule : arpège montant puis descendant sur l'accord du moment."""
    t, i = t0, 0
    while t < t1 - 1e-6:
        notes = sorted(n + octave for n in CH[chord_at(t - T0)][1][1:])
        seq = notes + notes[-2:0:-1]
        accent = 1.0 if i % 4 == 0 else 0.82
        P(felt(seq[i % len(seq)], 2.6, vel * accent * (0.92 + 0.12 * rng.random())), t, gain=0.42, pan=pan * np.sin(i * 0.9), wet=0.5)
        t += step
        i += 1


def bloom(t: float, notes: list[int], vel: float = 0.4, top: int | None = None) -> None:
    """Un accord qui fleurit : arpégé lentement, avec une clochette au sommet."""
    for j, m in enumerate(notes):
        P(felt(m, 6.0, vel), t + j * 0.07, gain=0.3, pan=-0.3 + 0.12 * j, wet=0.65)
    if top is not None:
        P(bell(top, 4.0, 0.22), t + len(notes) * 0.07, gain=0.35, pan=0.3, wet=0.7)


# comment ça marche : le piano se met en mouvement ; une pluie de clochettes quand les flux rejoignent Fabric
flow(T0 + 1.0, START["manifesto"], 0.5, 0.2, octave=12)
for j, m in enumerate([74, 76, 78, 81, 83, 86, 88, 90]):
    P(bell(m, 2.5, 0.12), at("fabric", 80) + j * 0.16, gain=0.4, pan=-0.5 + j * 0.14, wet=0.7)
# manifeste
bloom(START["manifesto"], [50, 57, 62, 66, 69], 0.38, top=78)
flow(START["manifesto"] + 2.0, START["aum"], 0.5, 0.24)
# 50,3 Md€
bloom(at("aum", 150), [62, 66, 69, 74], 0.36, top=81)
flow(START["aum"], START["valor"], 0.5, 0.22, octave=24, pan=0.4)
# R-co Valor : la tour monte en clochettes
for j, m in enumerate([62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86]):
    P(bell(m, 2.2, 0.13), at("valor", 60) + j * 0.16, gain=0.42, pan=-0.6 + j * 0.11, wet=0.65)
P(bell(90, 4.0, 0.16), at("valor", 120), gain=0.4, pan=0.4, wet=0.75)
flow(START["valor"] + 2.0, START["courbe"], 0.5, 0.22)
# l'application : courbe, revenus, distribution, passif, performance, recherche
flow(START["courbe"], START["passif"], 0.25, 0.17, octave=12, pan=0.4)
flow(START["passif"], START["passif"] + 4.0, 0.5, 0.22, octave=24)                         # passif : respiration
flow(START["passif"] + 4.0, START["search"], 0.25, 0.17, octave=12, pan=0.4)
flow(START["search"], START["wall"], 0.5, 0.22)
P(bell(81, 3.0, 0.16), at("search", 272), gain=0.38, pan=0.2, wet=0.7)                    # la réponse s'affiche
# le mur : un peu plus d'élan, une clochette par mot
flow(START["wall"], at("wall", 214), 0.25, 0.2, octave=12, pan=0.5)
for f in (8, 38, 68, 98, 128, 164):
    top = CH[chord_at(at("wall", f) - T0)][1][-1] + 12
    P(bell(top, 2.0, 0.14), at("wall", f), gain=0.38, pan=0.2, wet=0.6)

# ============================================================== III. le compte
TC, TS = START["count"], START["sign"]
for s_ in np.arange(np.ceil(TC), TS, 1.0):                                             # seul le tic-tac revient
    P(clock(), s_, gain=0.24, pan=0.3, wet=0.25)
P(warm([50, 57, 62, 66], TS - TC + 1.5, a=2.0, r=2.5), TC, gain=0.3, wet=0.6)
P(felt(62, 5.0, 0.3), at("count", 40), gain=0.42, wet=0.7)
P(felt(57, 5.0, 0.3), at("count", 76), gain=0.42, wet=0.7)
P(warm(CH["D"][1], 6.5, a=1.2, r=2.0), at("count", 190), gain=0.38, wet=0.6)
bloom(at("count", 196), [50, 57, 62, 66, 69], 0.36, top=78)
# signature
for j, m in enumerate([26, 38, 45, 50, 54, 57, 62, 66, 69, 76]):
    P(felt(m, 8.0, 0.4), TS + j * 0.06, gain=0.32, pan=-0.4 + j * 0.08, wet=0.65)
P(warm(CH["Dfin"][1], TOTAL - TS + 1.0, a=2.0, r=3.5), TS, gain=0.36, wet=0.6)
P(bell(81, 5.0, 0.2), at("sign", 176), gain=0.4, pan=0.3, wet=0.75)
# Nexus : le nom de l'application, un dernier accord qui s'ouvre
bloom(at("sign", 334), [50, 57, 62, 66, 69, 74], 0.34, top=86)

VO = json.loads((Path(__file__).resolve().parents[1] / "src" / "teaser" / "vo.json").read_text())
voice = [(START[v["shot"]] + v["at"] / FPS, START[v["shot"]] + (v["at"] + v["frames"]) / FPS) for v in VO]
out = Path(__file__).resolve().parents[1] / "public" / "teaser.wav"
# à la rupture, la musique se retire un instant (sans coupe brutale)
mix.render(TOTAL, out, fade_out=3.0, duck=[(at("rupture", 0), at("rupture", 50), 0.35)], voice=voice, voice_level=0.5)
print(f"{out} · {TOTAL:.1f} s")
