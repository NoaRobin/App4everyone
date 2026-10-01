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
    print_links(svc.links())
    mem = peak_memory_mb()
    print(f"Mémoire maximale            : {mem:,.0f} Mo".replace(",", " ") if mem else "Mémoire maximale            : indisponible")
    close = getattr(src, "close", None)
    if close:
        close()
    return 0


def print_links(rep: dict) -> None:
    """Diagnostic du rattachement JUMP ↔ Product Info : comptes, raisons, formes d'identifiants et identifiants
    techniques seulement (ni nom de fonds, ni montant : les encours sont donnés en part du total)."""
    p, f = rep["parts"], rep["funds"]
    line = lambda k, v: print(f"{k:<28s}: {v}")  # noqa: E731
    print("\nRattachement JUMP ↔ Product Info")
    line("Parts JUMP distinctes", f"{p['total']} · {p['by_pi_shareid']} par pi_shareid · {p['by_isin']} par ISIN unique · "
         f"{p['unlinked']} non rattachées" + (f" (dont {p['by_alternate_share_key']} par clé alternative)" if p.get("by_alternate_share_key") else ""))
    line("Fonds JUMP", f"{f['total']} · {f['by_product_id']} par ProductID · {f['by_id_pi_fonds']} par ID_PI_FONDS · "
         f"{f['by_propagation']} par propagation · {f['unlinked']} non rattachés")
    line("Fonds non rattachés", f"{f.get('unlinked_with_aum', 0)} avec encours · {f['unlinked_multi_parts']} avec plusieurs parts · "
         f"{f['split_across_products']} fonds JUMP répartis sur plusieurs produits")
    causes = rep.get("ambiguous_isin_causes") or {}
    line("ISIN ambigus", f"{len(rep['ambiguous_isins'])}" + (" (" + ", ".join(f"{k} : {v}" for k, v in causes.items()) + ")" if causes else ""))
    line("Doublons après consolidation", f"{rep.get('exact_duplicates', 0)} exacts (même identifiant) · {len(rep['duplicates'])} de même nom")
    a = rep.get("aum") or {}
    tot = (a.get("linked") or 0) + (a.get("unlinked") or 0)
    if tot:
        line("Encours", f"{100 * a['linked'] / tot:.2f} % rattachés · {100 * a['unlinked'] / tot:.2f} % non rattachés "
             "(montants : /api/diagnostics/links)")
    nc = rep.get("family_nc") or {}
    line("Famille nc", f"{nc.get('referenced', 0)} fonds du référentiel · {nc.get('jump_only', 0)} fonds JUMP seuls")
    rd = rep.get("referential_duplicates") or {}
    line("Doublons du référentiel", f"{rd.get('shares', 0)} parts · {rd.get('products', 0)} fonds (ligne la plus fiable conservée)")
    line("Référentiel", f"{rep.get('shares_referential')} parts · {rep.get('products_active')} fonds actifs · "
         f"{rep.get('parts_without_product')} parts sans ProductID · {rep.get('parts_with_inactive_product')} parts d'un fonds hors référentiel actif")
    print("  Méthodes (parts)          : " + ", ".join(f"{k} = {v}" for k, v in rep.get("methods", {}).items()))
    for title, key in (("Raisons (parts non rattachées)", "part_reasons"), ("Raisons (parts sans fonds)", "fund_reasons")):
        if rep.get(key):
            print(f"  {title} :")
            for k, v in rep[key].items():
                print(f"    {v:>6d}  {k}")
    print("  Jointures (renseignés · égalité brute · après normalisation) :")
    for k, v in rep.get("joins", {}).items():
        print(f"    {k} : " + " · ".join(f"{a} {b}" for a, b in v.items()))
    print("  Formes des identifiants (valeurs jamais affichées) :")
    for k, v in rep.get("shapes", {}).items():
        print(f"    {k} : " + ", ".join(f"{a} {b}" for a, b in list(v.items())[:6]))
    if rep.get("probes"):
        print("  Sondes (identifiants non résolus retrouvés dans une autre colonne) :")
        for k, v in rep["probes"].items():
            hits = {a: b for a, b in v.items() if b and a != "renseignés"}
            print(f"    {k} ({v['renseignés']}) : " + (", ".join(f"{a} {b}" for a, b in hits.items()) or "aucune"))
    watch = rep.get("watch") or []
    if watch:
        import re as _re
        print("  Fonds suivis (APP_LINK_WATCH ; identifiants seulement) :")
        for w in watch:
            pat = _re.search(r"valor|4\s*change", str(w.get("name")), _re.I)
            tag = pat.group(0).lower().replace(" ", "") if pat else "motif"
            missing = [k for k, ok in w["fields"].items() if not ok]
            print(f"    [{tag}] {w['fund_id']} · {'référentiel' if w['referenced'] else 'JUMP seul'} · {w['parts']} parts · "
                  f"parts {w['part_links']} · fonds {w['fund_links']}" + (f" · champs vides : {', '.join(missing)}" if missing else "")
                  + (f" · raisons : {'; '.join(w['reasons'])}" if w["reasons"] else ""))
    ex = rep.get("unlinked_funds_examples") or []
    if ex:
        print("  Fonds JUMP non rattachés (20 premiers, identifiants techniques) :")
        for e in ex:
            print(f"    {e['ID_JUMP_FONDS']} · {e['parts']} parts · " + "; ".join(f"{k} ×{v}" for k, v in e["raisons_fonds"].items()))
            for pe in e["parts_exemples"]:
                print(f"      part {pe['ID_JUMP_PART']} · ID_PI_PART {pe['forme_ID_PI_PART']} · ID_PI_FONDS {pe['forme_ID_PI_FONDS']}"
                      f" · ISIN {pe['ISIN'] or '—'} · {pe['raison_part'] or 'part rattachée'}")


if __name__ == "__main__":
    sys.exit(main())
