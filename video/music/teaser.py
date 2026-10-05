"""
« Dix minutes » — partition originale du teaser (synthèse, libre de droits).

I.   L'attente : pièce froide, tic-tac de l'extraction JUMP, nappe grave qui bat, une fenêtre qui passe = un souffle ;
     la tension monte, puis coupe franche à la rupture. Une seule note, la question, un point d'or.
II.  Toutes les informations métiers : 120 battements par minute, ré majeur, chaque plan a son accent (impacts sur
     50,3 Md€ et R-co Valor, clics de l'application, frappe au clavier, mur final en double croches).
III. Le compte : silence, seul le tic-tac revient ; accord chaud sur « L'application, elle, vous a tout montré. »

    python3 music/teaser.py          # écrit public/teaser.wav ; calage repris de src/teaser/timeline.ts
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from synth import Mix, bass, boom, clock, drone, hat, kick, pad, piano, reverse_swell, riser, rng, tick, whoosh

FPS = 30
SHOTS = dict(launch=210, ritual=390, rupture=180, fabric=540, manifesto=240, aum=360, valor=330, courbe=360, revenus=330,
             distribution=330, passif=270, perf=300, search=390, wall=240, count=360, sign=300)
START, _t = {}, 0
for _k, _d in SHOTS.items():
    START[_k] = _t / FPS
    _t += _d
TOTAL = _t / FPS
JUMP_START = 60 / FPS
at = lambda shot, frame: START[shot] + frame / FPS
mix = Mix(TOTAL)
P = mix.place

CH = {"D": (38, [50, 57, 62, 66, 69]), "Bm": (35, [47, 54, 62, 66, 71]), "G": (31, [43, 50, 59, 62, 67]),
      "A": (33, [45, 52, 61, 64, 69]), "Dfin": (26, [38, 50, 57, 62, 66, 69, 76])}

# ============================================================== I. l'attente
P(drone([26, 33], START["rupture"] + 0.4), 0.0, gain=0.5, wet=0.3)                 # ré et la graves, battement lent
room = np.convolve(rng.normal(0, 1, int(START["rupture"] * 44100)), np.ones(60) / 60, mode="same")
P(room, 0.0, gain=0.04, wet=0.1)                                                      # rumeur de bureau
for s in np.arange(JUMP_START, START["rupture"], 1.0):                                # le tic-tac de l'extraction
    P(clock(), s, gain=0.18 + 0.1 * (s / START["rupture"]), pan=0.3, wet=0.2)
for i, ch in enumerate("> extraction JUMP lancée"):                                   # frappe
    if ch != " ":
        P(tick(rng.uniform(2500, 4200), 0.025), at("launch", 34 + i * 1.2), gain=0.05, pan=-0.3, wet=0.15)
# les fenêtres qui passent devant la caméra (même calendrier que act1.tsx)
for i in range(30):
    spawn = round(330 * (1 - (1 - i / 30) ** 1.9))
    P(whoosh(0.7, bright=2200), at("ritual", spawn + 88), gain=0.05 + 0.02 * rng.random(), pan=rng.uniform(-0.7, 0.7), wet=0.3)
for f, m in ((18, 38), (66, 41), (126, 38), (174, 43), (240, 45), (306, 50)):          # une note grave par phrase
    P(piano(m, 3.0, 0.5), at("ritual", f), gain=0.45, wet=0.5)
    P(piano(m + 12, 3.0, 0.35), at("ritual", f), gain=0.3, wet=0.5)
for b in np.arange(START["ritual"] + 1.0, START["rupture"], 1.0):                      # pouls qui s'installe
    P(kick(0.35 + 0.35 * (b - START["ritual"]) / 13), b, gain=0.28, wet=0.05)
P(riser(3.0), START["rupture"] - 3.0, gain=0.16, wet=0.4)
# la rupture : coupe franche, puis la question
P(boom(4.0), at("rupture", 6), gain=0.25, wet=0.5)
P(piano(74, 5.0, 0.4), at("rupture", 56), gain=0.5, pan=0.1, wet=0.75)
P(piano(81, 5.0, 0.35), at("rupture", 118), gain=0.42, pan=-0.2, wet=0.8)
P(reverse_swell(CH["D"][1], START["fabric"] - at("rupture", 120)), at("rupture", 120), gain=0.55, wet=0.6)

# ============================================================== II. tout, au même endroit (dès « Comment ça marche »)
T0, T1 = START["fabric"], START["count"]
prog_ = ["D", "Bm", "G", "A"]
for k, t in enumerate(np.arange(T0, T1, 4.0)):
    name = prog_[k % 4]
    root, notes = CH[name]
    P(pad(notes, 4.0 + 1.8, bright=0.55 + 0.25 * (t > START["wall"] - 1)), t - 0.3, gain=0.5, wet=0.5)
    for e in np.arange(t, min(t + 4.0, T1), 0.5):                                        # basse en croches
        P(bass(root + (12 if (e - t) % 2 >= 1.5 else 0), 0.42), e, gain=0.15, wet=0.05)

def drums(t0: float, t1: float, kick_every: float = 1.0, hats: float = 0.25, vel: float = 0.5) -> None:
    for b in np.arange(t0, t1 - 1e-6, kick_every):
        P(kick(vel), b, gain=0.32, wet=0.04)
    for h in np.arange(t0, t1 - 1e-6, hats):
        P(hat(), h + (0.0 if hats >= 0.25 else 0), gain=0.12 if (h - t0) % 0.5 else 0.07, pan=0.35, wet=0.1)

def arp(t0: float, t1: float, step: float, vel: float, octave: int = 12, pan: float = 0.3) -> None:
    t, i = t0, 0
    while t < t1 - 1e-6:
        k = int((t - T0) // 4.0)
        notes = sorted(n + octave for n in CH[prog_[k % 4]][1][1:])
        seq = notes + notes[-2:0:-1]
        P(piano(seq[i % len(seq)], 2.2, vel * (0.9 + 0.2 * rng.random())), t, gain=0.45, pan=pan * np.sin(i * 1.7), wet=0.42)
        t += step
        i += 1

# comment ça marche : pulsation légère, scintillement quand les flux rejoignent Fabric, souffle du faisceau
for m in (50, 57, 62):
    P(piano(m, 5.0, 0.5), T0, gain=0.3, wet=0.6)
arp(T0 + 1.0, START["manifesto"], 0.5, 0.22, octave=12)
for j in range(10):
    P(piano([74, 76, 78, 81, 83, 86, 88, 90, 93, 95][j], 1.6, 0.25), at("fabric", 80) + j * 0.11, gain=0.32, pan=-0.5 + j * 0.1, wet=0.6)
P(whoosh(1.4, bright=3500), at("fabric", 330), gain=0.07, wet=0.5)
for b in np.arange(at("fabric", 300), START["manifesto"] - 0.5, 1.0):
    P(kick(0.3), b, gain=0.25, wet=0.05)
P(riser(1.5), START["manifesto"] - 1.5, gain=0.1, wet=0.4)
# manifeste
TM = START["manifesto"]
P(boom(), TM, gain=0.42, wet=0.4)
for m in (38, 50, 57, 62, 66):
    P(piano(m, 5.0, 0.65), TM, gain=0.3, wet=0.5)
arp(TM + 2.0, START["aum"], 0.5, 0.3)
drums(TM + 4.0, START["aum"] - 1.5, 1.0, 0.5, 0.4)
P(riser(1.5), START["aum"] - 1.5, gain=0.12, wet=0.4)
# 50,3 Md€
P(boom(3.5), START["aum"], gain=0.5, wet=0.4)
P(whoosh(4.5, bright=1800), START["aum"], gain=0.08, wet=0.5)                         # la traversée
drums(START["aum"] + 1.0, START["valor"] - 0.5, 1.0, 0.25, 0.5)
P(tick(2600, 0.06), at("aum", 150), gain=0.14, wet=0.3)
for m in (62, 66, 69, 74):
    P(piano(m, 4.0, 0.55), at("aum", 150), gain=0.32, wet=0.55)
arp(at("aum", 150), START["valor"], 0.25, 0.22, octave=24)
# R-co Valor
P(boom(3.0), START["valor"], gain=0.4, wet=0.4)
for j, m in enumerate([50, 52, 54, 57, 59, 62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86]):   # la tour monte
    P(piano(m, 1.8, 0.3), at("valor", 60) + j * 0.14, gain=0.4, pan=-0.6 + j * 0.08, wet=0.55)
P(piano(86, 4.0, 0.5), at("valor", 120), gain=0.45, pan=0.4, wet=0.65)
for i in range(5):
    P(tick(1800 + 300 * i, 0.04), at("valor", 158 + i * 3), gain=0.08, wet=0.25)
drums(START["valor"] + 2.0, START["courbe"], 1.0, 0.25, 0.5)
# l'application : courbe, revenus, distribution, passif, performance, recherche
drums(START["courbe"], START["passif"], 1.0, 0.25, 0.55)
arp(START["courbe"], START["passif"], 0.25, 0.2, octave=12, pan=0.4)
for f in (110, 170, 250):
    P(tick(1900, 0.05), at("courbe", f), gain=0.12, pan=0.2, wet=0.2)                  # clics
P(whoosh(1.6), at("revenus", 20), gain=0.08, wet=0.5)                                   # mise au point
P(whoosh(1.0), START["distribution"], gain=0.07, pan=-0.5, wet=0.4)
P(whoosh(1.0), at("distribution", 26), gain=0.07, pan=0.5, wet=0.4)
# passif : respiration, sans batterie pendant 4 s
arp(START["passif"], START["passif"] + 4.0, 0.5, 0.25, octave=24)
drums(START["passif"] + 4.0, START["search"], 1.0, 0.25, 0.55)
arp(START["passif"] + 4.0, START["search"], 0.25, 0.2, octave=12, pan=0.4)
P(riser(3.5), at("perf", 10), gain=0.08, wet=0.4)                                       # la table se redresse
# recherche : la rayure, puis la frappe dans l'application
P(whoosh(0.5, bright=6000), at("search", 26), gain=0.14, wet=0.3)
for k in range(14):
    P(tick(rng.uniform(2600, 4200), 0.025), at("search", 118 + 3 * k), gain=0.07, pan=0.1, wet=0.15)
for k in range(16):
    P(tick(rng.uniform(2600, 4200), 0.025), at("search", 266 + 3 * k), gain=0.07, pan=0.1, wet=0.15)
drums(START["search"], START["wall"], 1.0, 0.25, 0.5)
arp(START["search"], START["wall"], 0.5, 0.22)
# le mur : double croches, un accent par mot
drums(START["wall"], at("wall", 214), 0.5, 0.125, 0.6)
arp(START["wall"], at("wall", 214), 0.125, 0.2, octave=12, pan=0.5)
for f in range(0, 214, 15):
    root, notes = CH[prog_[int((at("wall", f) - T0) // 4) % 4]]
    P(pad(notes, 0.45, bright=0.9, a=0.005, r=0.2), at("wall", f), gain=0.35, wet=0.3)
P(reverse_swell(CH["A"][1], START["count"] - at("wall", 196)), at("wall", 196), gain=0.6, wet=0.5)

# ============================================================== III. le compte
for s in np.arange(np.ceil(START["count"]), START["sign"], 1.0):
    P(clock(), s, gain=0.24, pan=0.3, wet=0.25)
P(drone([26, 33], START["sign"] - START["count"] + 0.5), START["count"], gain=0.35, wet=0.3)
P(piano(62, 4.0, 0.35), at("count", 40), gain=0.4, wet=0.7)
P(piano(57, 4.0, 0.35), at("count", 76), gain=0.4, wet=0.7)
P(pad(CH["D"][1], 6.0, bright=0.7, a=1.2), at("count", 190), gain=0.6, wet=0.6)
for m in (50, 57, 62, 66, 69):
    P(piano(m, 5.0, 0.5), at("count", 196), gain=0.3, wet=0.6)
P(whoosh(1.8, bright=4000), at("count", 300), gain=0.06, wet=0.6)
# signature
for j, m in enumerate([26, 38, 45, 50, 54, 57, 62, 66, 69, 76]):
    P(piano(m, 7.0, 0.6), START["sign"] + j * 0.045, gain=0.34, pan=-0.4 + j * 0.08, wet=0.6)
P(pad(CH["Dfin"][1], TOTAL - START["sign"] + 1.0, bright=0.6, a=2.0, r=3.0), START["sign"], gain=0.6, wet=0.6)
P(piano(81, 5.0, 0.42), at("sign", 176), gain=0.42, pan=0.3, wet=0.7)

import json
VO = json.loads((Path(__file__).resolve().parents[1] / "src" / "teaser" / "vo.json").read_text())
voice = [(START[v["shot"]] + v["at"] / FPS, START[v["shot"]] + (v["at"] + v["frames"]) / FPS) for v in VO]
out = Path(__file__).resolve().parents[1] / "public" / "teaser.wav"
# coupes franches : le silence de la rupture, et celui du compte
mix.render(TOTAL, out, fade_out=2.2, duck=[(at("rupture", 6), at("rupture", 8), 0.25), (START["count"], START["count"] + 0.04, 0.0)], voice=voice)
print(f"{out} · {TOTAL:.1f} s")
