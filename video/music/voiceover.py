"""
Voix off du teaser « Dix minutes » : une phrase après l'autre, chaque phrase horodatée dans son plan.

Deux moteurs :
  azure   voix neuronale Microsoft (Azure AI Speech), masculine, grave et calme — moteur de diffusion.
          Seul le texte de la voix off est envoyé au service. La clé est lue dans l'environnement, jamais affichée.
            AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=francecentral python3 music/voiceover.py
            python3 music/voiceover.py --voice fr-FR-HenriNeural          # autre voix
            python3 music/voiceover.py --compare                          # comparatif de voix (out/voix-comparatif.wav)
  kokoro  synthèse hors ligne (voix française Kokoro), voix de travail :
            KOKORO_DIR=<dossier du modèle> python3 music/voiceover.py --engine kokoro

Sortie : public/vo/<plan>-<i>.wav et src/teaser/vo.json ; un contrôle vérifie que chaque phrase tient dans son plan.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from xml.sax.saxutils import escape

import numpy as np
import soundfile as sf

from montage import SHOTS

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


# ------------------------------------------------------------------ Azure AI Speech
AZURE_VOICE = "fr-FR-RemyMultilingualNeural"
# Termes anglais (prononcés à l'anglaise par une voix multilingue) et alias de prononciation pour les autres voix
EN_TERMS = ["Product Info", "Doc Info", "Fabric", "JUMP", "Asset Management"]
ALIASES = {"R-co Valor": "ère-co Valor", "Rothschild & Co": "Rothschild and Co", "JUMP": "djeump", "Fabric": "Fabrique"}


def _fr(run: str, multilingual: bool) -> str:
    out = escape(run)
    for term, alias in ALIASES.items():
        if multilingual and term in EN_TERMS:
            continue
        out = out.replace(escape(term), f'<sub alias="{escape(alias)}">{escape(term)}</sub>')
    return out.replace(" :", ' :<break time="220ms"/>').replace("…", '…<break time="300ms"/>')


def ssml(text: str, voice: str, rate: str = "-8%", pitch: str = "-3%") -> str:
    """Une phrase en SSML. Voix multilingue : segments français et anglais successifs, chacun dans son <lang>."""
    pro = lambda body: f'<prosody rate="{rate}" pitch="{pitch}">{body}</prosody>'
    if "Multilingual" in voice:
        runs: list[tuple[str, str]] = []
        rest = text
        while rest:
            hits = [(rest.find(t), t) for t in EN_TERMS if rest.find(t) >= 0]
            if not hits:
                runs.append(("fr-FR", rest))
                break
            i, t = min(hits)
            if i:
                runs.append(("fr-FR", rest[:i]))
            runs.append(("en-US", t))
            rest = rest[i + len(t):]
        body = "".join(f'<lang xml:lang="{lg}">{pro(_fr(r, True) if lg == "fr-FR" else escape(r))}</lang>' for lg, r in runs)
    else:
        body = pro(_fr(text, False))
    return ('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" '
            f'xml:lang="fr-FR"><voice name="{voice}">{body}</voice></speak>')


def azure_tts(text: str, voice: str) -> tuple[np.ndarray, int]:
    key, region = os.environ.get("AZURE_SPEECH_KEY"), os.environ.get("AZURE_SPEECH_REGION")
    if not key or not region:
        sys.exit("AZURE_SPEECH_KEY et AZURE_SPEECH_REGION doivent être définies dans l'environnement.")
    req = urllib.request.Request(f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1", data=ssml(text, voice).encode("utf-8"),
                                 method="POST", headers={"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
                                                         "X-Microsoft-OutputFormat": "riff-48khz-16bit-mono-pcm", "User-Agent": "rco-video"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
    except urllib.error.HTTPError as e:   # jamais la clé dans le message
        sys.exit(f"Azure Speech a refusé la requête : HTTP {e.code} {e.reason}")
    except urllib.error.URLError as e:
        sys.exit(f"Azure Speech injoignable ({e.reason}) : le domaine {region}.tts.speech.microsoft.com est-il autorisé ?")
    s, sr = sf.read(io.BytesIO(data), dtype="float32")
    return s, sr


def kokoro_tts_factory():
    from kokoro_onnx import Kokoro
    d = Path(os.environ.get("KOKORO_DIR", "."))
    k = Kokoro(str(d / "kokoro-v1.0.fp16.onnx"), str(d / "voices-v1.0.bin"))
    def tts(text: str) -> tuple[np.ndarray, int]:
        s, sr = k.create(spoken(text), voice="ff_siwis", speed=0.93, lang="fr-fr")
        return np.asarray(s, dtype=np.float32), sr
    return tts


def studio(s: np.ndarray, sr: int) -> np.ndarray:
    """Retrait du continu, rognage des silences de bord, normalisation, attaque et queue adoucies."""
    s = s - s.mean()
    loud = np.flatnonzero(np.abs(s) > 0.01 * (np.max(np.abs(s)) + 1e-9))
    if len(loud):
        s = s[max(0, loud[0] - int(0.03 * sr)): loud[-1] + int(0.12 * sr)]
    s = s / (np.max(np.abs(s)) + 1e-9) * 0.9
    f = int(0.01 * sr)
    s[:f] *= np.linspace(0, 1, f)
    s[-f:] *= np.linspace(1, 0, f)
    return s


def fit_check(meta: list[dict]) -> bool:
    ok = True
    for shot, n in SHOTS.items():
        lines = sorted((m for m in meta if m["shot"] == shot), key=lambda m: m["at"])
        for a, b in zip(lines, lines[1:]):
            if a["at"] + a["frames"] + 3 > b["at"]:
                print(f"  ! {shot} : « {a['text'][:40]} » déborde sur la phrase suivante de {a['at'] + a['frames'] + 3 - b['at']} images")
                ok = False
        if lines and lines[-1]["at"] + lines[-1]["frames"] + 6 > n:
            print(f"  ! {shot} : la dernière phrase dépasse le plan de {lines[-1]['at'] + lines[-1]['frames'] + 6 - n} images")
            ok = False
    return ok


def compare(voices: list[str]) -> None:
    picks = [SEGMENTS["ritual"][4][1], SEGMENTS["fabric"][1][1], SEGMENTS["count"][1][1]]
    chunks = []
    for v in voices:
        for t in picks:
            s, sr = azure_tts(t, v)
            chunks += [studio(s, sr), np.zeros(int(0.6 * sr), dtype=np.float32)]
        chunks.append(np.zeros(int(1.4 * sr), dtype=np.float32))
    out = ROOT / "out" / "voix-comparatif.wav"
    out.parent.mkdir(exist_ok=True)
    sf.write(out, np.concatenate(chunks), 48000)
    print(f"{out} : " + ", puis ".join(voices))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", choices=["azure", "kokoro"], default="azure" if os.environ.get("AZURE_SPEECH_KEY") else "kokoro")
    ap.add_argument("--voice", default=AZURE_VOICE)
    ap.add_argument("--compare", action="store_true", help="comparatif Rémy / Henri, sans toucher au film")
    ap.add_argument("--force", action="store_true", help="écrire même si une phrase déborde de son plan")
    args = ap.parse_args()
    if args.compare:
        compare([AZURE_VOICE, "fr-FR-HenriNeural"])
        return
    tts = (lambda t: azure_tts(t, args.voice)) if args.engine == "azure" else kokoro_tts_factory()
    print(f"moteur : {args.engine}" + (f" · voix {args.voice}" if args.engine == "azure" else ""))
    # Tout est synthétisé en mémoire d'abord : rien n'est remplacé si un appel échoue ou si une phrase déborde
    ap_force = args.force
    clips, meta = {}, []
    for shot, segs in SEGMENTS.items():
        t = 0
        for i, (at, text) in enumerate(segs):
            s, sr = tts(text)
            s = studio(s, sr)
            name = f"{shot}-{i}"
            clips[name] = (s, sr)
            frames = int(np.ceil(len(s) / sr * 30))
            start = at if at is not None else t
            meta.append({"shot": shot, "i": i, "file": f"vo/{name}.wav", "at": start, "frames": frames, "text": text})
            t = start + frames + GAP
            print(f"{name:15s} @{start:4d} +{frames:3d}  {text}")
    if not fit_check(meta) and not ap_force:
        sys.exit("Des phrases ne tiennent pas dans leur plan : rien n'a été remplacé. Ajuster SEGMENTS ou les durées "
                 "(timeline.ts, montage.py), ou relancer avec --force.")
    out = ROOT / "public" / "vo"
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.wav"):
        old.unlink()
    for name, (s, sr) in clips.items():
        sf.write(out / f"{name}.wav", s, sr)
    (ROOT / "src" / "teaser" / "vo.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
    print(f"{len(clips)} phrases écrites dans public/vo ; toutes tiennent dans leur plan")

if __name__ == "__main__":
    main()
