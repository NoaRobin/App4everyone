"""Normalisation des identifiants avant jointure (JUMP ↔ Product Info).

Les deux systèmes ne transportent pas leurs identifiants sous la même forme : GUID en majuscules d'un côté et en
minuscules de l'autre, accolades, espaces de début/fin ou insécables, identifiants numériques lus en nombre (12345.0)
d'un côté et en texte de l'autre, chaînes vides ou « NULL ». Comparés tels quels, ils ne se rejoignent pas et une part
JUMP retombe sur un fonds « JUMP seul » (sans référentiel), tandis que le même produit apparaît une seconde fois, sans
encours, depuis Product Info. Ces fonctions ramènent chaque identifiant à une forme canonique, sans jamais inventer de
correspondance : une valeur vide ou illisible devient None.
"""
from __future__ import annotations

import math
import re
from decimal import Decimal
from typing import Any

import numpy as np
import pandas as pd

_EMPTY = {"", "null", "none", "nan", "nat", "n/a", "na", "-", "--", "#n/a", "0x0"}
_WS = re.compile(r"[\s   ﻿]+")
_ISIN = re.compile(r"^[A-Z0-9]{2,}$")


def norm_id(v: Any) -> str | None:
    """Identifiant canonique : texte sans espaces, accolades retirées, en minuscules ; 12345.0 → « 12345 »."""
    if v is None or v is pd.NA or v is pd.NaT:
        return None
    if isinstance(v, (bool, np.bool_)):
        return None
    if isinstance(v, (int, np.integer)):
        return str(int(v))
    if isinstance(v, (float, np.floating, Decimal)):
        try:
            f = float(v)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(f):
            return None
        return str(int(f)) if f == int(f) else repr(f)
    s = _WS.sub("", str(v)).strip("{}").lower()
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    return None if s in _EMPTY else s


def norm_isin(v: Any) -> str | None:
    """ISIN canonique (majuscules, sans espaces ni séparateurs) ; None si vide ou non alphanumérique."""
    if v is None or v is pd.NA or isinstance(v, float) and math.isnan(v):
        return None
    s = _WS.sub("", str(v)).upper().replace("-", "").replace(".", "")
    return s if _ISIN.match(s) and s.lower() not in _EMPTY else None


def norm_jump(v: Any) -> str | None:
    """Identifiant JUMP (fonds, part) : espaces retirés, casse conservée (affiché tel quel), 1000.0 → « 1000 »."""
    s = norm_id(v)
    if s is None:
        return None
    if isinstance(v, str):
        raw = _WS.sub("", v).strip("{}")
        if raw.endswith(".0") and raw[:-2].isdigit():
            raw = raw[:-2]
        return raw
    return s


def _apply(series: pd.Series, fn) -> pd.Series:
    """Applique fn une fois par valeur distincte, puis redistribue par codes (rapide sur des millions de lignes)."""
    if series is None:
        return series
    codes, uniq = pd.factorize(series.astype(object), use_na_sentinel=True)
    out = [fn(u) for u in uniq]
    if (codes >= 0).all() and all(isinstance(u, str) and o == u for o, u in zip(out, uniq)):
        return series.astype(object) if series.dtype != object else series   # déjà canonique : rien à réécrire
    mapped = np.empty(len(uniq) + 1, dtype=object)
    mapped[:-1] = out
    mapped[-1] = None                                   # code −1 : valeur manquante
    return pd.Series(mapped[codes], index=series.index, dtype=object)


def ids(series: pd.Series) -> pd.Series:
    return _apply(series, norm_id)


def isins(series: pd.Series) -> pd.Series:
    return _apply(series, norm_isin)


def jump_ids(series: pd.Series) -> pd.Series:
    return _apply(series, norm_jump)


def clean_ids(series: pd.Series) -> pd.Series:
    """Identifiants nettoyés (espaces, accolades, 12345.0 → 12345, vides → None), casse d'origine conservée."""
    return _apply(series, norm_jump)


def align(series: pd.Series, reference: pd.Series) -> pd.Series:
    """Réécrit chaque identifiant sous la forme exacte qu'il a dans le référentiel, la comparaison se faisant sur la
    forme canonique (casse, espaces, type). Un identifiant absent du référentiel est seulement nettoyé.
    Si deux identifiants du référentiel ont la même forme canonique (ambigu), aucun n'est substitué."""
    ref = pd.Series(reference).dropna().astype(object).unique()
    canon: dict[str, Any] = {}
    clash: set[str] = set()
    for r in ref:
        k = norm_id(r)
        if k is None:
            continue
        if k in canon and canon[k] != r:
            clash.add(k)
        canon[k] = r
    for k in clash:
        canon.pop(k, None)

    def one(v):
        k = norm_id(v)
        if k is None:
            return None
        return canon.get(k, norm_jump(v))
    return _apply(series, one)
