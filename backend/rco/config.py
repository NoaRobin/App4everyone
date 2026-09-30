"""Configuration lue exclusivement dans l'environnement (aucun secret dans le code)."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    # "mock" (défaut) : données fictives au schéma exact ; "fabric" : Lakehouse via pyodbc.
    data_source: str
    fabric_server: str | None
    fabric_database: str | None
    odbc_driver: str
    # Profondeur d'historique chargée (années) pour les encours / VL.
    history_years: int
    # Nombre de jours calendaires au-delà duquel une VL n'est plus reportée.
    stale_days: int
    # Repérage des fonds Rothschild Martin Maurel (« RMM ») : aucune colonne dédiée dans le référentiel,
    # on cherche ce motif dans ces colonnes produit. À valider sur les données réelles.
    rmm_pattern: str = r"\bRMM\b|martin\s*maurel"
    rmm_columns: tuple[str, ...] = ("Sponsoring_Entity", "Investment_Manager", "Owning_Business_Unit", "Owning_Team",
                                    "Fund_Range", "Umbrella_Name", "Product_Name")


def load_settings() -> Settings:
    return Settings(
        data_source=os.getenv("APP_DATA_SOURCE", "mock").strip().lower(),
        fabric_server=os.getenv("FABRIC_SQL_SERVER"),
        fabric_database=os.getenv("FABRIC_SQL_DATABASE"),
        odbc_driver=os.getenv("FABRIC_ODBC_DRIVER", "ODBC Driver 18 for SQL Server"),
        history_years=int(os.getenv("APP_HISTORY_YEARS", "4")),
        stale_days=int(os.getenv("APP_STALE_DAYS", "12")),
        **({"rmm_pattern": os.environ["APP_RMM_PATTERN"]} if os.getenv("APP_RMM_PATTERN") else {}),
        **({"rmm_columns": tuple(c.strip() for c in os.environ["APP_RMM_COLUMNS"].split(",") if c.strip())} if os.getenv("APP_RMM_COLUMNS") else {}),
    )
