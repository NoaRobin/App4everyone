"""Normalisation numérique des valeurs financières.

mssql-python renvoie les colonnes SQL DECIMAL/NUMERIC en `decimal.Decimal` : pandas les stocke alors en colonnes
« objet », et tout mélange avec des `float` échoue (Decimal / float, float * Decimal). Ces fonctions convertissent
explicitement, au moment du calcul ou du formatage, sans jamais inventer de valeur : une donnée absente, non numérique
ou non finie devient None (valeur isolée) ou NaN (série), jamais zéro.
"""
from __future__ import annotations

import logging
import math
from decimal import Decimal
from numbers import Number
from typing import Any

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

UNAVAILABLE = "indisponible"


def safe_float(value: Any) -> float | None:
    """Valeur financière en float fini, sinon None.

    Accepte Decimal, int, float, entiers et flottants NumPy, chaînes numériques (« 12.5 », « 1e6 »).
    Renvoie None pour None, pandas NA/NaT, NaN, ±inf, chaînes non numériques et booléens : un booléen n'est
    pas une valeur financière (True ne doit pas devenir 1,0).
    """
    if value is None or value is pd.NaT:
        return None
    if isinstance(value, (bool, np.bool_)):
        return None
    try:
        if value is pd.NA:
            return None
    except TypeError:  # pragma: no cover
        pass
    if isinstance(value, Decimal):
        if not value.is_finite():
            return None
        x = float(value)
    elif isinstance(value, (int, float, np.integer, np.floating)):
        x = float(value)
    elif isinstance(value, str):
        s = value.strip().replace(" ", "").replace(" ", "")
        if not s:
            return None
        try:
            x = float(s)
        except ValueError:
            return None
    elif isinstance(value, Number):
        try:
            x = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError, OverflowError):
            return None
    else:
        return None
    return x if math.isfinite(x) else None


def finite_or_none(value: Any) -> float | None:
    """Résultat de calcul (performance, ratio…) prêt à sérialiser : NaN, inf et -inf deviennent None."""
    return safe_float(value)


def safe_divide(numerator: Any, denominator: Any) -> float | None:
    """numérateur / dénominateur, ou None si l'un est indisponible ou si le dénominateur est nul.

    Le dénominateur nul n'est jamais remplacé par 1 ou par une autre valeur.
    """
    n, d = safe_float(numerator), safe_float(denominator)
    if n is None or d is None or d == 0.0:
        return None
    return finite_or_none(n / d)


def return_between(v1: Any, v0: Any) -> float | None:
    """Performance simple v1 / v0 − 1, ou None si v0 est absent, non numérique, non fini ou nul."""
    r = safe_divide(v1, v0)
    return None if r is None else r - 1.0


# Types (pandas.api.types.infer_dtype) convertibles en bloc sans risque : aucun booléen possible.
_VECTOR_KINDS = {"empty", "floating", "integer", "mixed-integer-float", "decimal", "string"}


def _is_bool(x: Any) -> bool:
    return isinstance(x, (bool, np.bool_))


def numeric_series(series: pd.Series, name: str | None = None) -> pd.Series:
    """Série float64 homogène : Decimal, chaînes numériques et nombres convertis ; le reste en NaN.

    ±inf deviennent NaN. Les booléens ne sont pas des montants : NaN. Si `name` est fourni, le nombre de valeurs
    renseignées mais écartées (non numériques ou infinies) est journalisé — jamais les valeurs elles-mêmes.
    """
    if pd.api.types.is_bool_dtype(series.dtype):
        out = pd.Series(np.nan, index=series.index, dtype="float64")
    elif pd.api.types.is_numeric_dtype(series.dtype):
        out = series if series.dtype == np.float64 else series.astype("float64")
    else:
        obj = series.astype(object)
        kind = pd.api.types.infer_dtype(obj, skipna=True)
        if kind in _VECTOR_KINDS:
            # Cas courant (Decimal de mssql-python, nombres, chaînes numériques) : conversion vectorisée.
            # Decimal NaN/Infinity deviennent NaN/±inf, ramenés à NaN ci-dessous.
            out = pd.to_numeric(obj, errors="coerce").astype("float64")
        else:
            # Mélange avec des booléens ou des objets inattendus : examen valeur par valeur
            obj = obj.map(lambda x: np.nan if _is_bool(x) else (float(x) if isinstance(x, Decimal) and x.is_finite()
                                                                 else (np.nan if isinstance(x, Decimal) else x)))
            out = pd.to_numeric(obj, errors="coerce").astype("float64")
    inf = np.isinf(out.to_numpy())
    if inf.any():
        out = out.mask(inf)
    if name:
        dropped = int((series.notna() & out.isna()).sum())
        if dropped:
            log.warning("%s : %d valeur(s) non numérique(s) ou infinie(s) écartée(s)", name, dropped)
    return out


def ratio_series(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    """Quotient terme à terme en float64 : dénominateur nul ou indisponible → NaN (jamais 1, jamais 0)."""
    n, d = numeric_series(numerator), numeric_series(denominator)
    d = d.mask(d == 0.0)
    q = n / d
    return q.mask(np.isinf(q.to_numpy()))


def fmt_meur(value: Any, digits: int = 1) -> str:
    """Montant en millions d'euros au format français (« 1 234,5 M€ »), ou « indisponible »."""
    x = safe_float(value)
    if x is None:
        return UNAVAILABLE
    return f"{x / 1e6:,.{digits}f} M€".replace(",", " ").replace(".", ",")


def to_json_number(value: Any) -> Any:
    """Decimal → float fini ou None (sérialisation JSON) ; les autres valeurs sont renvoyées telles quelles."""
    if isinstance(value, Decimal):
        return safe_float(value)
    return value


__all__ = ["UNAVAILABLE", "safe_float", "finite_or_none", "safe_divide", "return_between", "numeric_series",
           "ratio_series", "fmt_meur", "to_json_number"]
