"""
Affinage de la voix off hors ligne (Kokoro, voix française) : sans clé ni service externe.

1. Chaque phrase est synthétisée en plusieurs variantes (graphies des noms propres, débit) ; une reconnaissance vocale
   (Whisper small, via sherpa-onnx) retranscrit chaque variante, et la plus intelligible l'emporte.
2. Traitement « studio » de toute la voix : coupe-bas, chaleur dans le grave, présence, douceur des aigus, compression
   légère, petite acoustique de pièce, crête à −1 dBFS.
3. Les débuts de phrase (`at` de src/teaser/vo.json) ne bougent pas : sous-titres et montage restent valables, seule la
   bande son change. Le script vérifie qu'aucune phrase ne déborde sur la suivante ni sur la fin de son plan.

    KOKORO_DIR=<kokoro-v1.0.fp16.onnx, voices-v1.0.bin> WHISPER_DIR=<sherpa-onnx-whisper-small> python3 music/affiner_voix.py

Modèles : github.com/thewh1teagle/kokoro-onnx (releases model-files-v1.0) et github.com/k2-fsa/sherpa-onnx
(releases asr-models, sherpa-onnx-whisper-small). Non versionnés.
"""
from __future__ import annotations

import json
import os
import re
import unicodedata
from pathlib import Path

import numpy as np
import sherpa_onnx
import soundfile as sf
from kokoro_onnx import Kokoro

from montage import SHOTS

ROOT = Path(__file__).resolve().parents[1]
VO_JSON = ROOT / "src" / "teaser" / "vo.json"

# Graphies essayées pour les mots que la synthèse prononce mal (le sous-titre garde toujours le texte exact)
VARIANTS = {
    "JUMP": ["djeumpe", "djomp"],
    "Product Info": ["Prodeuct Info", "Prodakt Info"],
    "Doc Info": ["Doc Info", "Dock Info", "Doc, Info"],
    "Centaure": ["Centaure", "Sentaure"],
    "R-co Valor": ["Ère-co Valor", "Erre-co Valor", "R co Valor"],
    "Rothschild & Co Asset Management": ["Rotchild and Co Asset Management", "Rotchild and Co, Asset Management", "Rotchild and Co, Assète Managemente"],
    "Rothschild & Co": ["Rotchild and Co"],
    "Fabric": ["Fabrique"],
    "Encours.": ["Encours.", "En-cours.", "Les encours."],
}
SPEEDS = [0.93, 0.87]
OVERLAP = 8   # images : une fin de mot peut chevaucher le début de la phrase suivante (inaudible sous la voix)


def candidates(text: str) -> list[str]:
    outs = [text]
    for term, alts in VARIANTS.items():
        if term not in text:
            continue
        nxt = []
        for o in outs:
            if term in o:
                nxt += [o.replace(term, a) for a in alts]
            else:
                nxt.append(o)
        outs = nxt
    # phrases très courtes : un léger appui en tête et en fin aide la synthèse à articuler
    if len(text) < 26:
        outs += [f"… {o}" for o in outs]
    return list(dict.fromkeys(outs))[:12]


def norm(t: str) -> str:
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").replace("&", " and ").replace("r-co", "rco")
    t = re.sub(r"\b50\b", "cinquante", t)
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", t).split())


def cer(ref: str, hyp: str) -> float:
    r, h = norm(ref), norm(hyp)
    d = list(range(len(h) + 1))
    for i, a in enumerate(r, 1):
        p, d[0] = d[0], i
        for j, b in enumerate(h, 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (a != b))
    return d[-1] / max(1, len(r))


# ------------------------------------------------------------------ traitement studio
def _shelf(f: np.ndarray, fc: float, gain_db: float, low: bool) -> np.ndarray:
    x = (fc / np.maximum(f, 1.0)) ** 2 if low else (np.maximum(f, 1.0) / fc) ** 2
    return 10 ** (gain_db / 20 * x / (1 + x))


def studio(s: np.ndarray, sr: int) -> np.ndarray:
    """Traitement discret : la clarté prime (chaque réglage a été vérifié à la retranscription)."""
    s = s - s.mean()
    X = np.fft.rfft(s)
    f = np.fft.rfftfreq(len(s), 1 / sr)
    X *= 1 / (1 + (70 / np.maximum(f, 1.0)) ** 4)                    # coupe-bas 70 Hz
    X *= _shelf(f, 200, 2.0, low=True)                               # chaleur
    X *= 1 + 0.10 * np.exp(-0.5 * ((f - 3500) / 1200) ** 2)          # présence
    X *= _shelf(f, 9500, -1.5, low=False)                            # aigus adoucis
    x = np.fft.irfft(X, len(s))
    # compression douce (enveloppe RMS 15 ms, seuil −22 dB sous la crête, rapport 2)
    k = int(0.015 * sr)
    env = np.sqrt(np.convolve(x ** 2, np.ones(k) / k, mode="same") + 1e-12)
    lvl = 20 * np.log10(env / (np.max(np.abs(x)) + 1e-12))
    gain_db = np.where(lvl > -22, (lvl + 22) * (1 / 2 - 1), 0.0)
    x = x * 10 ** (np.convolve(gain_db, np.ones(k) / k, mode="same") / 20)
    # silence de tête limité à 60 ms, queue intacte
    loud = np.flatnonzero(np.abs(x) > 0.01 * np.max(np.abs(x)))
    if len(loud) and loud[0] > int(0.15 * sr):
        x = x[loud[0] - int(0.06 * sr):]
    f8 = int(0.004 * sr)
    x[:f8] *= np.linspace(0, 1, f8)
    x[-f8 * 4:] *= np.linspace(1, 0, f8 * 4)
    return (x / (np.max(np.abs(x)) + 1e-12) * 0.89).astype(np.float32)


def main() -> None:
    kd, wd = Path(os.environ.get("KOKORO_DIR", ".")), Path(os.environ.get("WHISPER_DIR", "."))
    k = Kokoro(str(kd / "kokoro-v1.0.fp16.onnx"), str(kd / "voices-v1.0.bin"))
    rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=str(wd / "small-encoder.int8.onnx"), decoder=str(wd / "small-decoder.int8.onnx"),
                                                     tokens=str(wd / "small-tokens.txt"), language="fr", task="transcribe", num_threads=4)

    def asr(x: np.ndarray, sr: int) -> str:
        st = rec.create_stream()
        st.accept_waveform(sr, x)
        rec.decode_stream(st)
        return st.result.text

    meta = json.loads(VO_JSON.read_text())
    out = ROOT / "public" / "vo"
    # créneau de chaque phrase : jusqu'au début de la suivante (ou la fin du plan), en images
    slot = {}
    for shot, n in SHOTS.items():
        lines = sorted((m for m in meta if m["shot"] == shot), key=lambda m: m["at"])
        for a, b in zip(lines, lines[1:] + [None]):
            slot[a["file"]] = (b["at"] + OVERLAP if b else n - 4) - a["at"]
    clips, before, after = {}, [], []
    for v in meta:
        old, osr = sf.read(out / Path(v["file"]).name, dtype="float32")
        c_old = cer(v["text"], asr(old, osr))
        x0 = studio(old, osr)
        tries = [(cer(v["text"], asr(x0, osr)), x0, osr, "version d'origine", None)]
        for text in candidates(v["text"]):
            for speed in SPEEDS:
                s, sr = k.create(text, voice="ff_siwis", speed=speed, lang="fr-fr")
                x = studio(np.asarray(s, dtype=np.float32), sr)
                tries.append((cer(v["text"], asr(x, sr)), x, sr, text, speed))
        fits = [t for t in tries if np.ceil(len(t[1]) / t[2] * 30) <= slot[v["file"]]] or [min(tries, key=lambda t: len(t[1]) / t[2])]
        best = min(fits, key=lambda t: t[0] + (0.01 if t[4] not in (None, SPEEDS[0]) else 0))
        before.append(c_old)
        after.append(best[0])
        clips[v["file"]] = (best[1], best[2])
        v["frames"] = int(np.ceil(len(best[1]) / best[2] * 30))
        print(f"{v['file']:22s} {c_old * 100:5.1f} % → {best[0] * 100:5.1f} %  ({best[4] or '—'}) {best[3]}")
    # contrôle : débuts inchangés, rien ne déborde
    ok = True
    for shot, n in SHOTS.items():
        lines = sorted((m for m in meta if m["shot"] == shot), key=lambda m: m["at"])
        for a, b in zip(lines, lines[1:]):
            if a["at"] + a["frames"] > b["at"] + OVERLAP:
                ok = False
                print(f"  ! {a['file']} déborde sur {b['file']}")
        if lines and lines[-1]["at"] + lines[-1]["frames"] + 4 > n:
            ok = False
            print(f"  ! {lines[-1]['file']} dépasse la fin du plan {shot}")
    if not ok:
        raise SystemExit("débordement : rien n'a été écrit")
    for f, (x, sr) in clips.items():
        sf.write(ROOT / "public" / f, x, sr)
    VO_JSON.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
    print(f"intelligibilité (erreur de retranscription) : {np.mean(before) * 100:.1f} % → {np.mean(after) * 100:.1f} %")


if __name__ == "__main__":
    main()
