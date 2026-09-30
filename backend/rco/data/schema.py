"""Schéma exact des tables du Lakehouse (noms et types de colonnes uniquement)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

AUM = "JUMP_portfolio_aum"
HOLDINGS = "JUMP_portfolio_holdings"
SHARE = "PI_OUT_Share"
PRODUCT = "pi_out_product_active"
COUNTRY = "PI_OUT_CountryOfRegistration"
CALENDAR = "calendar"
DQ = "sys_dq_metrics"


@lru_cache(maxsize=1)
def schema() -> dict[str, list[tuple[str, str]]]:
    raw = json.loads((Path(__file__).parent / "schema.json").read_text(encoding="utf-8"))
    return {t: [(c, d) for c, d in cols] for t, cols in raw.items()}


def columns(table: str) -> list[str]:
    return [c for c, _ in schema()[table]]


def dtypes(table: str) -> dict[str, str]:
    return dict(schema()[table])
