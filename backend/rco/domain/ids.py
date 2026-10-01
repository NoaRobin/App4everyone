"""Normalisation des identifiants avant jointure (JUMP ↔ Product Info).

Les deux systèmes ne transportent pas leurs identifiants sous la même forme : GUID en majuscules d'un côté et en
minuscules de l'autre, accolades, guillemets, espaces de début/fin, insécables ou invisibles, tirets typographiques,
identifiants numériques lus en nombre (12345.0, 1.2345E4) ou en texte avec zéros de tête, chaînes vides ou « NULL ».
Comparés tels quels, ils ne se rejoignent pas. Ces fonctions ramènent chaque identifiant à une forme canonique, sans
jamais inventer de correspondance : une valeur vide ou illisible devient None.
"""
from __future__ import annotations

import math
import re
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

import numpy as np
import pandas as pd

_EMPTY = {"", "null", "none", "nan", "nat", "n/a", "na", "n.a.", "-", "--", "#n/a", "0x0", "?", "nd", "n.d.", "undefined"}
# Espaces (dont insécables et fines) et caractères invisibles (zéro largeur, BOM)
_WS = re.compile("[\\s     ​‌‍⁠﻿]+")
_DASH = re.compile("[‐‑‒–—−]")
_QUOTES = "\"'`«»‘’“”"
_SCI = re.compile(r"^[+-]?\d+(\.\d+)?[eE][+-]?\d+$")
_DEC0 = re.compile(r"^(\d+)\.0+$")
_ISIN = re.compile(r"^[A-Z0-9]{2,}$")


def _text(v: Any) -> str | None:
    """Valeur brute → texte débarrassé des espaces, invisibles, guillemets et accolades englobants (casse conservée)."""
    if v is None or v is pd.NA or v is pd.NaT:
        return None
    if isinstance(v, (bool, np.bool_)):
        return None
    if isinstance(v, (bytes, bytearray)) and len(v) == 16:
        return str(uuid.UUID(bytes_le=bytes(v)))          # GUID binaire (uniqueidentifier)
    if isinstance(v, uuid.UUID):
        return str(v)
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
    s = _WS.sub("", str(v))
    s = _DASH.sub("-", s).strip(_QUOTES).strip("{}()[]").strip(_QUOTES)
    if not s:
        return None
    m = _DEC0.match(s)
    if m:
        s = m.group(1)
    elif _SCI.match(s):
        try:
            d = Decimal(s)
            if d == d.to_integral_value():
                s = str(int(d))
        except InvalidOperation:
            pass
    return None if s.lower() in _EMPTY else s


def norm_id(v: Any) -> str | None:
    """Identifiant canonique de comparaison : texte nettoyé, en minuscules ; numérique sans zéros de tête."""
    s = _text(v)
    if s is None:
        return None
    s = s.lower()
    if s.isdigit():
        s = s.lstrip("0") or "0"
    return s


def norm_isin(v: Any) -> str | None:
    """ISIN canonique (majuscules, sans espaces ni séparateurs) ; None si vide ou non alphanumérique."""
    s = _text(v)
    if s is None:
        return None
    s = s.upper().replace("-", "").replace(".", "").replace("/", "")
    return s if _ISIN.match(s) and s.lower() not in _EMPTY else None


def norm_jump(v: Any) -> str | None:
    """Identifiant nettoyé, casse d'origine conservée (affiché tel quel) : espaces, accolades, 1000.0 → « 1000 »."""
    return _text(v)


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
    forme canonique (casse, espaces, type, zéros de tête). Un identifiant absent du référentiel est seulement nettoyé.
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


# ---------------------------------------------------------------- audit des formats (aucune valeur, des comptes)
_GUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def shape(v: Any) -> str:
    """Forme technique d'une valeur brute d'identifiant (pour l'audit) : jamais la valeur elle-même."""
    if v is None or v is pd.NA or v is pd.NaT or (isinstance(v, float) and math.isnan(v)):
        return "null"
    if isinstance(v, (int, np.integer)):
        return "entier"
    if isinstance(v, (float, np.floating, Decimal)):
        return "nombre décimal"
    if isinstance(v, (bytes, bytearray)):
        return "binaire"
    s = str(v)
    t = _text(v)
    if t is None:
        return "vide ou N/A"
    tags = []
    if s != s.strip() or re.search("[    ]", s):
        tags.append("espaces")
    if re.search("[​‌‍⁠﻿]", s):
        tags.append("invisibles")
    if "{" in s:
        tags.append("accolades")
    if _GUID.match(t):
        base = "GUID minuscules" if t == t.lower() else "GUID majuscules" if t == t.upper() else "GUID casse mixte"
    elif t.isdigit():
        base = "numérique zéros de tête" if len(t) > 1 and t.startswith("0") else "numérique"
    elif _DEC0.match(_WS.sub("", s)) or _SCI.match(_WS.sub("", s)):
        base = "numérique au format décimal"
    elif re.match(r"^[A-Z]{2}[A-Z0-9]{9}\d$", t.upper()):
        base = "ISIN" + (" minuscules" if t != t.upper() else "")
    else:
        base = "texte"
    return base + (f" ({', '.join(tags)})" if tags else "")


def shapes(series: pd.Series) -> dict[str, int]:
    """Répartition des formes d'une colonne d'identifiants (valeurs distinctes pondérées par leur nombre de lignes)."""
    if series is None or not len(series):
        return {}
    vc = series.astype(object).value_counts(dropna=False)
    out: dict[str, int] = {}
    for v, n in vc.items():
        k = shape(v)
        out[k] = out.get(k, 0) + int(n)
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))
