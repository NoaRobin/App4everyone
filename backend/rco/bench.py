"""Mesure des performances de chargement : `python run.py --bench` (ou `python -m rco.bench`).

Chronomètre la lecture de chaque table, les calculs du modèle et la préparation des vues, et mesure la mémoire
maximale du processus. Fonctionne sur la source configurée (données fictives, éventuellement démultipliées avec
APP_MOCK_SCALE, ou Fabric). N'affiche que des durées, des nombres de lignes et de colonnes : jamais de données.
"""
from __future__ import annotations

import argparse
import logging
import sys
import time

from .config import load_settings
from .data.sources import make_source
from .domain.model import build_model
from .service import Service


def peak_memory_mb() -> float | None:
    """Mémoire maximale du processus (Mo), sous Windows comme sous Linux/macOS ; None si indisponible."""
    try:
        if sys.platform == "win32":
            import ctypes
            from ctypes import wintypes

            class PMC(ctypes.Structure):
                _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD), ("PeakWorkingSetSize", ctypes.c_size_t),
                            ("WorkingSetSize", ctypes.c_size_t), ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                            ("QuotaPagedPoolUsage", ctypes.c_size_t), ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                            ("QuotaNonPagedPoolUsage", ctypes.c_size_t), ("PagefileUsage", ctypes.c_size_t),
                            ("PeakPagefileUsage", ctypes.c_size_t)]
            pmc = PMC()
            pmc.cb = ctypes.sizeof(PMC)
            h = ctypes.windll.kernel32.GetCurrentProcess()
            if ctypes.windll.psapi.GetProcessMemoryInfo(h, ctypes.byref(pmc), pmc.cb):
                return pmc.PeakWorkingSetSize / 1e6
            return None
        import resource
        r = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return r / 1e6 if sys.platform == "darwin" else r / 1e3
    except Exception:
        return None


def main(argv: list[str] | None = None) -> int:
    argparse.ArgumentParser(prog="python -m rco.bench").parse_args(argv)
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    for noisy in ("azure", "msal", "httpx"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    s = load_settings()
    what = "Fabric" if s.data_source == "fabric" else (f"données fictives × {s.mock_scale}" if s.mock_scale > 1 else "données fictives")
    print(f"Source : {what} · historique {s.history_years} an(s)")
    src = make_source(s)
    t_gen = None
    if s.data_source != "fabric" and hasattr(src, "_full"):
        # Données fictives : générées en mémoire avant la mesure (ce temps n'existe pas avec Fabric)
        from .data import schema as S
        tg = time.perf_counter()
        for t in (S.PRODUCT, S.SHARE, S.COUNTRY, S.AUM, S.HOLDINGS, S.DQ):
            src._full(t)
        t_gen = time.perf_counter() - tg
    t0 = time.perf_counter()
    model = build_model(src, stale_days=s.stale_days, history_years=s.history_years, is_mock=s.data_source != "fabric")
    t_model = time.perf_counter() - t0
    svc = Service(model, s.rmm_columns, s.rmm_pattern)
    from .api import _VIEWS
    timings = []
    for label, name in _VIEWS:
        t = time.perf_counter()
        getattr(svc, name)(None)
        timings.append((label, time.perf_counter() - t))
    total = time.perf_counter() - t0
    print()
    if t_gen is not None:
        print(f"(Génération des données fictives, hors mesure : {t_gen:.1f} s)")
    print(f"Lecture + calculs du modèle : {t_model:6.1f} s ({len(model.funds)} fonds, {len(model.link)} parts, {len(model.dates)} dates)")
    for label, dt in timings:
        print(f"  vue {label:<22s}: {dt:6.1f} s")
    print(f"Prêt en                     : {total:6.1f} s")
    rep = svc.links()
    p, f = rep["parts"], rep["funds"]
    print(f"Parts JUMP                  : {p['total']} · {p['by_pi_shareid']} par pi_shareid · {p['by_isin']} par ISIN · {p['unlinked']} non rattachées")
    print(f"Fonds JUMP                  : {f['total']} · {f['by_product_id']} par ProductID · {f['by_id_pi_fonds']} par ID_PI_FONDS · {f['unlinked']} non rattachés")
    print(f"ISIN ambigus                : {len(rep['ambiguous_isins'])} · doublons de fonds restants : {len(rep['duplicates'])} · fonds JUMP seuls : {rep['funds_jump_only']}")
    mem = peak_memory_mb()
    print(f"Mémoire maximale            : {mem:,.0f} Mo".replace(",", " ") if mem else "Mémoire maximale            : indisponible")
    close = getattr(src, "close", None)
    if close:
        close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
