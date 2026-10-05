"""
Voix off du teaser « Dix minutes » : une réplique par plan, synthèse vocale neuronale hors ligne (Kokoro, voix française).
Voix provisoire : le texte et les durées sont prêts pour l'enregistrement d'une voix professionnelle (voir VOIX_OFF.md).

    KOKORO_DIR=<dossier du modèle> python3 music/voiceover.py   # écrit public/vo/<plan>.wav et src/teaser/vo.json

Le modèle (kokoro-v1.0.fp16.onnx, voices-v1.0.bin) est publié sur github.com/thewh1teagle/kokoro-onnx ; il n'est pas
versionné ici.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[1]

# Répliques par plan : (image de départ dans le plan, ou None = à la suite de la précédente, texte du sous-titre).
# Le texte prononcé applique PRONONCIATION ; chaque phrase est synthétisée seule, d'où un horodatage exact.
GAP = 9   # images de silence entre deux phrases enchaînées
SEGMENTS: dict[str, list[tuple[int | None, str]]] = {
    "launch": [(18, "Chaque matin, la même scène."), (None, "On lance une extraction JUMP."), (None, "Dix minutes d'attente.")],
    "ritual": [(24, "Pendant ce temps, on cherche."), (None, "Une fiche dans Product Info."), (None, "Un document dans Doc Info."),
               (None, "Puis Centaure, puis Adjuto."), (None, "Chaque outil détient une partie de la réponse.")],
    "rupture": [(56, "Et si tout était déjà là ?")],
    "fabric": [(16, "Toutes ces données existent déjà."), (None, "Elles sont réunies dans Fabric, la plateforme de données de Microsoft :"),
               (None, "un seul endroit, mis à jour chaque jour."), (300, "Notre application lit ces données, sans jamais les modifier."),
               (None, "Elle les relie, les calcule, et les met en forme.")],
    "manifesto": [(56, "Résultat : toutes les informations métiers, au même endroit.")],
    "aum": [(150, "Plus de cinquante milliards d'euros d'encours, suivis au jour le jour.")],
    "valor": [(64, "Notre plus gros fonds, R-co Valor : dix milliards."), (None, "Près d'un euro sur cinq.")],
    "courbe": [(30, "L'encours de chaque fonds, par jour, par semaine, par mois ou par année."), (None, "En un clic.")],
    "revenus": [(40, "Les fonds qui nous font gagner le plus,"), (None, "estimés à partir des encours et des frais de gestion.")],
    "distribution": [(40, "Où chaque fonds est autorisé à la vente, pays par pays,"), (None, "et pour quels clients.")],
    "passif": [(24, "Qui détient nos fonds : par type de client, par teneur de compte, par pays.")],
    "perf": [(60, "Les performances, comparées côte à côte, sur la même période.")],
    "search": [(22, "Plus besoin de chercher dans Product Info."), (120, "Une question sur un fonds ? Les frais, le dépositaire, un pays ?"),
               (272, "La réponse s'affiche, directement sur la fiche.")],
    "wall": [(8, "Encours."), (38, "Revenus."), (68, "Distribution."), (98, "Passif."), (128, "Performance."), (164, "Tout est relié.")],
    "count": [(40, "Pendant ce film, une extraction JUMP n'aurait pas fini."), (196, "L'application, elle, vous a tout montré.")],
    "sign": [(24, "Rothschild & Co Asset Management."), (96, "Toutes les informations métiers, au même endroit.")],
}
PRONONCIATION = {
    "JUMP": "djeumpe", "R-co Valor": "Ère-co Valor", "Rothschild & Co": "Rotchild and Co", "Product Info": "Prodeuct Info",
    "Fabric": "Fabrique",
}


def spoken(text: str) -> str:
    for a, b in PRONONCIATION.items():
        text = text.replace(a, b)
    return text


def main() -> None:
    d = Path(os.environ.get("KOKORO_DIR", "."))
    k = Kokoro(str(d / "kokoro-v1.0.fp16.onnx"), str(d / "voices-v1.0.bin"))
    out = ROOT / "public" / "vo"
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.wav"):
        old.unlink()
    meta = []
    for shot, segs in SEGMENTS.items():
        t = 0
        for i, (at, text) in enumerate(segs):
            samples, sr = k.create(spoken(text), voice="ff_siwis", speed=0.93, lang="fr-fr")
            s = np.asarray(samples, dtype=np.float32)
            # léger traitement « studio » : retrait du continu, normalisation, attaque et queue adoucies
            s = s - s.mean()
            s = s / (np.max(np.abs(s)) + 1e-9) * 0.9
            f = int(0.01 * sr)
            s[:f] *= np.linspace(0, 1, f)
            s[-f:] *= np.linspace(1, 0, f)
            name = f"{shot}-{i}"
            sf.write(out / f"{name}.wav", s, sr)
            frames = int(np.ceil(len(s) / sr * 30))
            start = at if at is not None else t
            meta.append({"shot": shot, "i": i, "file": f"vo/{name}.wav", "at": start, "frames": frames, "text": text})
            t = start + frames + GAP
            print(f"{name:15s} @{start:4d} +{frames:3d}  {text}")
    (ROOT / "src" / "teaser" / "vo.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")


if __name__ == "__main__":
    main()
