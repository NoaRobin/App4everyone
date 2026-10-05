"""
Télécharge les échantillons d'instruments réels de la partition du teaser (une seule fois, non versionnés).

  piano      Salamander Grand Piano, Alexander Holm — CC-BY 3.0 (github.com/Tonejs/audio)
  orchestre  tonejs-instruments, Nicholaus Brosowsky — CC-BY 3.0 (github.com/nbrosowsky/tonejs-instruments)

    python3 music/echantillons.py          # → .cache/echantillons/<instrument>/<note>.mp3
"""
from __future__ import annotations

import concurrent.futures as cf
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "echantillons"
SOURCES = {
    "piano": "https://raw.githubusercontent.com/Tonejs/audio/master/salamander/{n}.mp3",
    **{i: f"https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples/{i}/{{n}}.mp3"
       for i in ("cello", "violin", "contrabass", "harp", "french-horn")},
}
NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"]


def note_names() -> list[str]:
    return [f"{n}{o}" for o in range(0, 9) for n in NAMES]


def fetch(inst: str, n: str) -> str | None:
    dest = CACHE / inst / f"{n}.mp3"
    if dest.exists():
        return n
    for attempt in range(4):
        try:
            with urllib.request.urlopen(SOURCES[inst].format(n=n), timeout=30) as r:
                data = r.read()
            break
        except urllib.error.HTTPError:
            return None
        except (urllib.error.URLError, ConnectionError, OSError):   # coupure réseau : on réessaie
            time.sleep(2 ** attempt)
    else:
        return None
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return n


def main() -> None:
    with cf.ThreadPoolExecutor(6) as ex:
        for inst in SOURCES:
            got = [n for n in ex.map(lambda n: fetch(inst, n), note_names()) if n]
            print(f"{inst:12s} {len(got):3d} notes")


if __name__ == "__main__":
    main()
