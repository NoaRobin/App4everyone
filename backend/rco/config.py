"""Configuration lue exclusivement dans l'environnement (aucun secret dans le code)."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class Settings:
    # "mock" (défaut) : données fictives au schéma exact ; "fabric" : Lakehouse (SQL analytics endpoint).
    data_source: str
    fabric_server: str | None
    fabric_database: str | None
    odbc_driver: str
    # Profondeur d'historique chargée (années) pour les encours / VL.
    history_years: int
    # Nombre de jours calendaires au-delà duquel une VL n'est plus reportée.
    stale_days: int
    # Client SQL : "mssql-python" (défaut, rien à installer hors pip) ou "pyodbc" (pilote ODBC 18 requis).
    fabric_client: str = "mssql-python"
    # Délais (secondes) : connexion (fenêtre Microsoft comprise) et exécution d'une requête.
    fabric_login_timeout: int = 120
    fabric_query_timeout: int = 600
    # Données fictives démultipliées (essais de volumétrie : 17 ≈ 75 millions de cellules lues), 1 par défaut
    mock_scale: int = 1
    # Repérage des fonds Rothschild Martin Maurel (« RMM ») : aucune colonne dédiée dans le référentiel,
    # on cherche ce motif dans ces colonnes produit. À valider sur les données réelles.
    rmm_pattern: str = r"\bRMM\b|martin\s*maurel"
    rmm_columns: tuple[str, ...] = ("Sponsoring_Entity", "Investment_Manager", "Owning_Business_Unit", "Owning_Team",
                                    "Fund_Range", "Umbrella_Name", "Product_Name")


def _int(env: Mapping[str, str], key: str, default: int) -> int:
    try:
        return int(str(env.get(key) or default).strip())
    except ValueError:
        return default


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    """Lit la configuration dans `env` (par défaut : les variables d'environnement du processus)."""
    e = os.environ if env is None else env
    get = lambda k, d=None: (e.get(k) or d)  # noqa: E731
    return Settings(
        data_source=(get("APP_DATA_SOURCE", "mock") or "mock").strip().lower(),
        fabric_server=(get("FABRIC_SQL_SERVER") or "").strip() or None,
        fabric_database=(get("FABRIC_SQL_DATABASE") or "").strip() or None,
        odbc_driver=get("FABRIC_ODBC_DRIVER", "ODBC Driver 18 for SQL Server"),
        history_years=_int(e, "APP_HISTORY_YEARS", 6),          # 6 : performances et collecte sur 5 ans
        stale_days=_int(e, "APP_STALE_DAYS", 12),
        fabric_client=(get("FABRIC_CLIENT", "mssql-python") or "mssql-python").strip().lower(),
        fabric_login_timeout=_int(e, "FABRIC_LOGIN_TIMEOUT", 120),
        fabric_query_timeout=_int(e, "FABRIC_QUERY_TIMEOUT", 600),
        mock_scale=max(1, _int(e, "APP_MOCK_SCALE", 1)),
        **({"rmm_pattern": e["APP_RMM_PATTERN"]} if get("APP_RMM_PATTERN") else {}),
        **({"rmm_columns": tuple(c.strip() for c in e["APP_RMM_COLUMNS"].split(",") if c.strip())} if get("APP_RMM_COLUMNS") else {}),
    )


# Valeurs d'exemple qu'il ne faut jamais envoyer à Fabric (copiées telles quelles depuis la documentation)
_PLACEHOLDER = re.compile(r"[<>{}]|(?:^|[.:_-])x{3,}(?:$|[.,_-])|\.\.\.|votre|your[-_ ]?|serveur|server[-_ ]?name|exemple|example|changeme|placeholder|todo|nom[-_ ]du", re.I)


def fabric_config_problems(s: Settings) -> list[str]:
    """Problèmes bloquants de la configuration Fabric (liste vide si elle est utilisable). Aucun accès réseau."""
    out: list[str] = []
    server, db = (s.fabric_server or "").strip(), (s.fabric_database or "").strip()
    if not server:
        out.append("FABRIC_SQL_SERVER n'est pas défini.")
    elif _PLACEHOLDER.search(server):
        out.append(f"FABRIC_SQL_SERVER contient une valeur d'exemple ({server!r}) : collez l'adresse réelle du SQL analytics endpoint "
                   "(Fabric → Lakehouse → SQL analytics endpoint → Paramètres → chaîne de connexion SQL).")
    else:
        host = re.sub(r"^tcp:", "", server, flags=re.I).split(",")[0]
        if " " in host or "." not in host:
            out.append(f"FABRIC_SQL_SERVER ne ressemble pas à une adresse de serveur ({server!r}) : attendu "
                       "« xxxxxxxx.datawarehouse.fabric.microsoft.com », sans « https:// » ni chemin.")
        elif "://" in server or "/" in host:
            out.append("FABRIC_SQL_SERVER doit être un nom d'hôte seul, sans « https:// » ni chemin.")
    if not db:
        out.append("FABRIC_SQL_DATABASE n'est pas défini (nom du Lakehouse, par exemple LKH_RFPTeam_Bronze).")
    elif _PLACEHOLDER.search(db):
        out.append(f"FABRIC_SQL_DATABASE contient une valeur d'exemple ({db!r}).")
    if s.fabric_client not in ("mssql-python", "pyodbc"):
        out.append(f"FABRIC_CLIENT inconnu ({s.fabric_client!r}) : utilisez mssql-python (défaut) ou pyodbc.")
    return out
