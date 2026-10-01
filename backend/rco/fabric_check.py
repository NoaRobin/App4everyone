"""Diagnostic de la connexion Fabric, sans charger le modèle : `python -m rco.fabric_check`.

Étapes : configuration → connecteur → connexion et SELECT 1 → existence des tables et colonnes (SELECT TOP 0 : aucune
ligne lue). N'affiche jamais de données, seulement des noms de tables et de colonnes.
Codes de sortie : 0 tout est prêt · 1 table ou colonne manquante · 2 configuration · 3 connecteur · 4 connexion ou authentification.
"""
from __future__ import annotations

import argparse
import importlib.util
import logging
import sys
import time
import warnings
from datetime import date

from .config import fabric_config_problems, load_settings
from .data import schema as S
from .data.fabric import FabricError, FabricQueryError, FabricSource
from .data import aum as AQ
from .domain.model import AUM_COLS, HOLDINGS_COLS


def _p(ok: bool | None, msg: str) -> None:
    mark = {True: "OK ", False: "ÉCHEC", None: "   "}[ok]
    print(f"[{mark}] {msg}", flush=True)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m rco.fabric_check")
    ap.add_argument("--quick", action="store_true", help="s'arrêter après SELECT 1 (ne pas vérifier les tables)")
    a = ap.parse_args(argv)
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    logging.basicConfig(level=logging.WARNING)
    for noisy in ("azure", "msal", "rco.data.fabric"):
        logging.getLogger(noisy).setLevel(logging.CRITICAL)
    warnings.filterwarnings("ignore", module="msal")

    s = load_settings()
    print(f"Client : {s.fabric_client} · serveur : {s.fabric_server or '—'} · base : {s.fabric_database or '—'}")
    print(f"Délais : connexion {s.fabric_login_timeout} s · requête {s.fabric_query_timeout} s")
    problems = fabric_config_problems(s)
    if problems:
        for pb in problems:
            _p(False, pb)
        return 2
    _p(True, "Configuration")

    mod = "pyodbc" if s.fabric_client == "pyodbc" else "mssql_python"
    if importlib.util.find_spec(mod) is None:
        _p(False, f"Connecteur {s.fabric_client} absent de cet environnement Python ({sys.executable})")
        return 3
    _p(True, f"Connecteur {s.fabric_client} présent" + ("" if mod == "pyodbc" else " (aucun pilote ODBC requis)"))
    if mod == "mssql_python":
        if importlib.util.find_spec("pyarrow") is not None:
            _p(True, "pyarrow présent : lecture des grandes tables en colonnes")
        else:
            _p(None, "pyarrow absent : lecture par lots de lignes, plus lente (python -m pip install -r backend/requirements-arrow.txt)")

    src = FabricSource(s)
    print("Connexion à Fabric : une fenêtre Microsoft peut s'ouvrir…", flush=True)
    t0 = time.perf_counter()
    try:
        ms = src.ping()
    except FabricError as e:
        _p(False, f"{e.message}")
        if e.detail:
            print(f"        détail : {e.detail}")
        print(f"        conseil : {e.hint}")
        return 4 if e.code in ("fabric_connection", "fabric_auth", "fabric_timeout") else 3
    _p(True, f"Connexion et SELECT 1 ({time.perf_counter() - t0:.1f} s, requête {ms:.0f} ms)")
    if a.quick:
        src.close()
        return 0

    tables = [(S.PRODUCT, S.columns(S.PRODUCT)), (S.SHARE, S.columns(S.SHARE)), (S.COUNTRY, S.columns(S.COUNTRY)),
              (S.AUM, AUM_COLS), (S.HOLDINGS, HOLDINGS_COLS), (S.DQ, S.columns(S.DQ))]
    bad = 0
    for name, cols in tables:
        t = time.perf_counter()
        try:
            src.check_table(name, cols)
            _p(True, f"Table {name} : {len(cols)} colonnes présentes ({time.perf_counter() - t:.1f} s)")
        except FabricQueryError as e:
            bad += 1
            _p(False, f"Table {name} : {e.message}")
        except FabricError as e:
            bad += 1
            _p(False, f"Table {name} : {e.message}")
    if not bad:
        # Requête compacte des encours (fonctions de fenêtre) : exécutée sans renvoyer de ligne
        t = time.perf_counter()
        try:
            src.query(AQ.attributes_sql(probe=True), [date(2000, 1, 1)], table=S.AUM)
            _p(True, f"Lecture compacte des encours acceptée par Fabric ({time.perf_counter() - t:.1f} s)")
        except FabricError as e:
            _p(None, f"Lecture compacte des encours refusée ({e.code}) : l'application lira les libellés ligne à ligne (plus lent)")
    src.close()
    if bad:
        print("Des tables ou colonnes manquent : transmettez les noms ci-dessus pour adapter l'application.")
        return 1
    print("Fabric est prêt : lancez python run.py --fabric")
    return 0


if __name__ == "__main__":
    sys.exit(main())
