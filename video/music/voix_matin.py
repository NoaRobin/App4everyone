"""
Voix off du film « Le matin » : la voix féminine du teaser (Kokoro, hors ligne), posée et grave.

Chaque phrase est calée en secondes sur le montage (src/matin/timeline.ts). Plusieurs graphies et débits sont essayés ;
une reconnaissance vocale (Whisper small) retient la plus intelligible qui tient dans son créneau. La voix est
assombrie d'un ton et demi par rééchantillonnage (plus grave et plus lente à la fois), puis passée au traitement studio.
Seul le texte ci-dessous est synthétisé, sur cette machine : rien n'est envoyé à un service externe.

    KOKORO_DIR=<modèle> WHISPER_DIR=<whisper> python3 music/voix_matin.py
    → public/matin/vo/<id>.wav et src/matin/vo.json
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
FPS = 30
END = 90.0
SEMITONES = -1.5    # assombrissement : la voix descend d'un ton et demi (et ralentit d'autant)

# (identifiant, seconde de départ, texte du sous-titre)
LINES = [
    ("matin", 2.25, "Chaque matin, à la même heure…"),
    ("lance", 5.15, "on lance l'extraction."),
    ("attend", 8.0, "Et l'on attend."),
    ("existe", 12.35, "La réponse existe déjà."),
    ("eparpille", 14.1, "Mais elle est éparpillée."),
    ("pi", 15.9, "Dans Product Info."),
    ("jump", 17.25, "Dans JUMP."),
    ("centaure", 18.4, "Dans Centaure."),
    ("docinfo", 19.6, "Dans Doc Info."),
    ("endroit", 21.96, "Et si tout était au même endroit ?"),
    ("fabric", 24.6, "Relié, dans Fabric."),
    ("une", 27.9, "Une seule application."),
    ("nom", 31.5, "Jasmine."),
    ("plus", 32.75, "Et plus encore."),
    ("frais", 49.6, "Les frais de gestion d'Europe Valeur ?"),
    ("cutoff", 58.1, "L'heure limite de ses parts ?"),
    ("rapporte", 62.2, "Quel fonds rapporte le plus ?"),
    ("investi", 66.5, "Et qui y est investi ?"),
    ("travaille", 70.85, "Jasmine travaille aussi."),
    ("excel", 72.6, "Vos fichiers Excel, en un clic."),
    ("pendant", 83.2, "Pendant ce film…"),
    ("pasfini", 85.0, "JUMP n'aurait pas terminé."),
    ("signature", 87.4, "Jasmine. Tout, au même endroit."),
]
EXTRA = {
    "frais": ["Les frais de gestion d'Europe Valeur ?", "Les frais de gestion, d'Europe Valeur ?"],
    "jump": ["Dans Djeump.", "Dans Djomp.", "Dans, Djeump."],
    "pasfini": ["Djeump n'aurait pas terminé.", "Djomp n'aurait pas terminé."],
    "docinfo": ["Dans Dok Info.", "Dans Doc-Info."],
    "nom": ["Jasmine.", "… Jasmine.", "Jasmîne."],
    "signature": ["Jasmine. Tout, au même endroit.", "Jasmine… Tout, au même endroit."],
}
SPEEDS = [0.97, 0.92]


def deepen(x: np.ndarray, st: float) -> np.ndarray:
    """Rééchantillonnage : hauteur et débit baissent ensemble (aucun artefact d'étirement)."""
    r = 2 ** (-st / 12)          # > 1 : plus d'échantillons
    n = int(len(x) * r)
    return np.interp(np.arange(n) / r, np.arange(len(x)), x).astype(np.float32)


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

    meta, clips, errs = [], {}, []
    for n, (name, t, text) in enumerate(LINES):
        nxt = LINES[n + 1][1] if n + 1 < len(LINES) else END
        slot = int((nxt - t) * FPS) - 4
        tries = []
        for cand in list(dict.fromkeys(candidates(text) + EXTRA.get(name, []))):
            for speed in SPEEDS:
                s, sr = k.create(cand, voice="ff_siwis", speed=speed, lang="fr-fr")
                x = studio(deepen(np.asarray(s, dtype=np.float32), SEMITONES), sr)
                tries.append((cer(text, asr(x, sr)), x, sr, cand, speed))
        fits = [c for c in tries if np.ceil(len(c[1]) / c[2] * FPS) <= slot] or [min(tries, key=lambda c: len(c[1]))]
        best = min(fits, key=lambda c: c[0] + (0.01 if c[4] != SPEEDS[0] else 0))
        frames = int(np.ceil(len(best[1]) / best[2] * FPS))
        clips[name] = (best[1], best[2])
        errs.append(best[0])
        meta.append({"id": name, "file": f"matin/vo/{name}.wav", "at": round(t * FPS), "frames": frames, "text": text})
        print(f"{name:10s} @{t:5.2f}s +{frames:3d}/{slot:3d}  {best[0] * 100:5.1f} %  ({best[4]}) {best[3]}")
    out = ROOT / "public" / "matin" / "vo"
    out.mkdir(parents=True, exist_ok=True)
    for name, (x, sr) in clips.items():
        sf.write(out / f"{name}.wav", x, sr)
    dest = ROOT / "src" / "matin" / "vo.json"
    dest.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
    print(f"{len(meta)} phrases · erreur de retranscription moyenne {np.mean(errs) * 100:.1f} %")


if __name__ == "__main__":
    main()
