"""
Voix off de la publicité « Nexus » : la voix féminine du teaser (Kokoro, hors ligne), affinée comme dans affiner_voix.py.

Chaque phrase est posée sur la grille de la musique (une mesure = 45 images à 30 i/s). Plusieurs graphies et débits
sont essayés ; une reconnaissance vocale (Whisper small) retient la plus intelligible qui tient dans son créneau.

    KOKORO_DIR=<modèle> WHISPER_DIR=<whisper> python3 music/voix_nexus.py
    → public/nexus/vo/<id>.wav et src/nexus/vo.json
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import sherpa_onnx
import soundfile as sf
from kokoro_onnx import Kokoro

from affiner_voix import candidates, cer, studio

ROOT = Path(__file__).resolve().parents[1]
BAR = 45            # images par mesure (160 battements par minute, 4 temps)
END = 4050          # fin du film, en images

# (identifiant, mesure de départ, texte du sous-titre). Une mesure peut être fractionnaire (0,25 = un temps).
LINES = [
    ("question", 1.5, "Chaque jour, on pose les mêmes questions."),
    ("disperse", 17, "Les réponses existent. Mais elles sont dispersées."),
    ("outil-1", 21, "Product Info."),
    ("outil-2", 22, "JUMP."),
    ("outil-3", 23, "Centaure."),
    ("outil-4", 24, "Doc Info."),
    ("outil-5", 25, "Adjuto."),
    ("fabric", 27, "Fabric les réunit, chaque jour."),
    ("nexus-lit", 30, "Nexus les lit, sans jamais les modifier, et les met en forme."),
    ("touche", 35.5, "Il ne reste qu'une touche."),
    ("encours", 41.5, "Cinquante milliards d'euros d'encours."),
    ("courbe", 45, "Jour après jour."),
    ("valor", 48.5, "R-co Valor : dix milliards."),
    ("revenus", 52.5, "Ce qui nous fait gagner le plus."),
    ("pays", 56.5, "Nos fonds, pays par pays."),
    ("passif", 60.5, "Et qui les détient."),
    ("perf", 64.5, "Leurs performances, côte à côte."),
    ("fiche", 68.5, "Et la réponse, sur chaque fiche."),
    ("compte", 72.5, "Pendant ce film, une extraction JUMP n'aurait pas fini."),
    ("montre", 75.5, "L'application, elle, vous a tout montré."),
    ("nom", 82, "Nexus."),
    ("signature", 83.5, "Toutes les informations métiers. Au même endroit."),
]
# graphies supplémentaires pour les noms prononcés seuls (le sous-titre garde le texte exact)
EXTRA = {
    "outil-2": ["Djeump.", "Djomp.", "Jump.", "… Djeump."],
    "outil-4": ["Dok Info.", "Doc Infos.", "Doc-Info.", "… Dok Info.", "Dock, Info."],
    "nom": ["Nexus.", "… Nexus.", "Nexusse."],
}
SPEEDS = [0.97, 0.91]


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

    starts = [round(bar * BAR) for _, bar, _ in LINES]
    meta, clips, errs = [], {}, []
    for n, (name, bar, text) in enumerate(LINES):
        at = starts[n]
        slot = (starts[n + 1] if n + 1 < len(LINES) else END) - at - 4
        tries = []
        for cand in list(dict.fromkeys(candidates(text) + EXTRA.get(name, []))):
            for speed in SPEEDS:
                s, sr = k.create(cand, voice="ff_siwis", speed=speed, lang="fr-fr")
                x = studio(np.asarray(s, dtype=np.float32), sr)
                tries.append((cer(text, asr(x, sr)), x, sr, cand, speed))
        fits = [t for t in tries if np.ceil(len(t[1]) / t[2] * 30) <= slot] or [min(tries, key=lambda t: len(t[1]))]
        best = min(fits, key=lambda t: t[0] + (0.01 if t[4] != SPEEDS[0] else 0))
        frames = int(np.ceil(len(best[1]) / best[2] * 30))
        clips[name] = (best[1], best[2])
        errs.append(best[0])
        meta.append({"id": name, "file": f"nexus/vo/{name}.wav", "at": at, "frames": frames, "text": text})
        print(f"{name:10s} @{at:5d} +{frames:3d}/{slot:3d}  {best[0] * 100:5.1f} %  ({best[4]}) {best[3]}")
    out = ROOT / "public" / "nexus" / "vo"
    out.mkdir(parents=True, exist_ok=True)
    for name, (x, sr) in clips.items():
        sf.write(out / f"{name}.wav", x, sr)
    dest = ROOT / "src" / "nexus" / "vo.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
    print(f"{len(meta)} phrases · erreur de retranscription moyenne {np.mean(errs) * 100:.1f} %")


if __name__ == "__main__":
    main()
