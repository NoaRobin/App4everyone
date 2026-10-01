"""Lecture compacte de JUMP_portfolio_aum (table de loin la plus volumineuse).

Chaque ligne quotidienne d'une part répète les mêmes libellés (fonds, ISIN, nom de la part, devise, indicateur de
référence) : lus tels quels, ils représentent l'essentiel du volume transféré et de la mémoire. La table est donc lue
en deux requêtes SELECT :

- **faits** : une ligne par part et par date, uniquement l'identifiant de la part, les dates et les montants
  (convertis en FLOAT côté SQL : 8 octets au lieu d'un DECIMAL, et aucun objet decimal.Decimal côté Python) ;
- **attributs** : seulement les lignes où l'un des libellés d'une part change (première ligne de chaque part comprise),
  calculées par le moteur SQL (fonctions de fenêtre LAG / ROW_NUMBER).

`join_attributes` reconstitue ensuite, pour chaque ligne de faits, les libellés exacts qu'elle portait dans la table.
`split_aum` produit les deux mêmes jeux à partir d'une table complète (données fictives, tests, repli).
"""
from __future__ import annotations

from datetime import date
from typing import Any

import numpy as np
import pandas as pd

AUM = "JUMP_portfolio_aum"
KEY = "ID_JUMP_PART"
DATE = "DATE_VL"
MAJ = "DATE_MAJ"

# Montants et cours utilisés par l'application (DECIMAL en SQL)
FACT_NUMERIC = ["VL_UNITAIRE", "NOMBRE_PARTS", "COEFFICIENT_OST", "ACTIF_NET_TOTAL_DEVISE_FONDS", "VL_BENCH",
                "DIVIDEND_AMOUNT", "ACTIF_NET_TOTAL_EURO", "ACTIF_NET_PART_EURO"]
FACT_COLS = [KEY, DATE, MAJ, *FACT_NUMERIC]
# Libellés d'une part (texte), quasi constants dans le temps
ATTR_COLS = ["ID_JUMP_FONDS", "ID_PI_FONDS", "ID_PI_PART", "CODE_ISIN_PART", "NOM_PART", "DEVISE_VL", "NOM_BENCH"]
# Libellés nécessaires ligne à ligne après reconstitution (contrôles, change des inventaires, fiche part)
ROW_ATTRS = ["ID_JUMP_FONDS", "DEVISE_VL", "NOM_BENCH"]
# Toutes les colonnes lues (diagnostic --fabric-check)
AUM_READ_COLS = [KEY, *ATTR_COLS[:4], ATTR_COLS[4], DATE, *FACT_NUMERIC[:3], ATTR_COLS[5], *FACT_NUMERIC[3:5],
                 ATTR_COLS[6], *FACT_NUMERIC[5:], MAJ]

# Ordre chronologique d'une part ; à date égale (doublons de chargement), DATE_MAJ croissante, NULL en dernier,
# comme le tri pandas utilisé pour le dédoublonnage (la ligne gardée est la dernière).
_ORDER = f"[{DATE}], CASE WHEN [{MAJ}] IS NULL THEN 1 ELSE 0 END, [{MAJ}]"


def facts_sql() -> str:
    cols = ", ".join([f"[{KEY}]", f"[{DATE}]", f"[{MAJ}]"] + [f"CAST([{c}] AS FLOAT) AS [{c}]" for c in FACT_NUMERIC])
    return f"SELECT {cols} FROM [dbo].[{AUM}] WHERE [{DATE}] >= ?"


def attributes_sql(probe: bool = False) -> str:
    """Changements de libellés par part. `probe` : même requête sans aucune ligne renvoyée (diagnostic --fabric-check)."""
    win = f"OVER (PARTITION BY [{KEY}] ORDER BY {_ORDER})"
    lags = ", ".join(f"LAG([{c}]) {win} AS [p_{c}]" for c in ATTR_COLS)
    inner = (f"SELECT [{KEY}], [{DATE}], [{MAJ}], " + ", ".join(f"[{c}]" for c in ATTR_COLS)
             + f", ROW_NUMBER() {win} AS [rn], {lags} FROM [dbo].[{AUM}] WHERE [{DATE}] >= ?")
    changed = " OR ".join(f"COALESCE([p_{c}], CHAR(1)) <> COALESCE([{c}], CHAR(1))" for c in ATTR_COLS)
    outer = ", ".join(f"[{c}]" for c in [KEY, DATE, MAJ, *ATTR_COLS])
    sql = f"SELECT {outer} FROM ({inner}) AS [t] WHERE ([rn] = 1 OR {changed})"
    return sql + " AND 1 = 0" if probe else sql


def count_sql() -> str:
    return f"SELECT COUNT_BIG(*) AS [n] FROM [dbo].[{AUM}] WHERE [{DATE}] >= ?"


# ---------------------------------------------------------------- côté pandas
def _dates(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, errors="coerce").astype("datetime64[ns]")


def _order(df: pd.DataFrame) -> np.ndarray:
    """Positions triées par (part, date, DATE_MAJ avec NULL en dernier) — tri stable."""
    codes, _ = pd.factorize(df[KEY], sort=True)
    day = _dates(df[DATE]).to_numpy().astype("int64")
    maj = _dates(df[MAJ]) if MAJ in df else pd.Series(pd.NaT, index=df.index, dtype="datetime64[ns]")
    maj_null = maj.isna().to_numpy()
    maj_v = maj.to_numpy().astype("int64")
    return np.lexsort((maj_v, maj_null, day, codes))


def split_aum(aum: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(faits, attributs) à partir d'une table JUMP complète, avec la même sémantique que les deux requêtes SQL."""
    aum = aum.reset_index(drop=True)
    o = _order(aum)
    s = aum.iloc[o].reset_index(drop=True)
    key = s[KEY].to_numpy(dtype=object)
    new_share = np.ones(len(s), dtype=bool)
    new_share[1:] = key[1:] != key[:-1]
    changed = new_share.copy()
    for c in ATTR_COLS:
        if c not in s:
            continue
        v = s[c].to_numpy(dtype=object)
        na = pd.isna(v)
        diff = np.zeros(len(s), dtype=bool)
        if len(s) > 1:
            same = (v[1:] == v[:-1]) | (na[1:] & na[:-1])
            diff[1:] = ~same
        changed |= diff
    attrs = s.loc[changed, [c for c in [KEY, DATE, MAJ, *ATTR_COLS] if c in s]].reset_index(drop=True)
    facts = aum[[c for c in FACT_COLS if c in aum]]
    return facts, attrs


def dedupe_facts(facts: pd.DataFrame) -> pd.DataFrame:
    """Une ligne par (part, date) : la plus récemment mise à jour (DATE_MAJ), triée par part puis date."""
    facts = facts.reset_index(drop=True)
    o = _order(facts)
    s = facts.iloc[o].reset_index(drop=True)
    codes = pd.factorize(s[KEY], sort=True)[0]
    day = _dates(s[DATE]).to_numpy()
    last = np.ones(len(s), dtype=bool)
    if len(s) > 1:
        last[:-1] = (codes[1:] != codes[:-1]) | (day[1:] != day[:-1])
    out = s.loc[last].reset_index(drop=True)
    out[DATE] = _dates(out[DATE])
    return out


def join_attributes(facts: pd.DataFrame, attrs: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """Ajoute (sur place) à chaque ligne de faits les libellés en vigueur à sa date : dernier changement de la même
    part à une date ≤ celle de la ligne. Les colonnes ajoutées sont des tableaux d'objets qui partagent les chaînes
    des attributs (aucune copie de texte par ligne).
    """
    out = facts
    n = len(out)
    a = attrs.reset_index(drop=True) if attrs is not None else pd.DataFrame(columns=[KEY, DATE])
    if n == 0 or a.empty:
        for c in columns:
            out[c] = pd.Series(np.full(n, None, dtype=object), index=out.index, dtype=object)
        return out
    a = a.iloc[_order(a)].reset_index(drop=True)      # (part, date, DATE_MAJ) : le dernier changement l'emporte
    keys = pd.Index(pd.unique(np.concatenate([a[KEY].to_numpy(dtype=object), out[KEY].to_numpy(dtype=object)])))
    a_code = keys.get_indexer(a[KEY].to_numpy(dtype=object)).astype("int64")
    f_code = keys.get_indexer(out[KEY].to_numpy(dtype=object)).astype("int64")
    a_day = _dates(a[DATE]).to_numpy().astype("int64") // 86_400_000_000_000
    f_day = _dates(out[DATE]).to_numpy().astype("int64") // 86_400_000_000_000
    rank = np.lexsort((a_day, a_code))                # tri stable : l'ordre DATE_MAJ est conservé à date égale
    a_code, a_day = a_code[rank], a_day[rank]
    base = int(min(a_day.min(), f_day.min()))
    span = int(max(a_day.max(), f_day.max())) - base + 1
    ka = a_code * span + (a_day - base)               # clé croissante (part, jour)
    kf = f_code * span + (f_day - base)
    idx = np.searchsorted(ka, kf, side="right") - 1
    ok = (idx >= 0) & (a_code[np.clip(idx, 0, None)] == f_code)
    src = a.iloc[rank].reset_index(drop=True)
    for c in columns:
        vals = src[c].to_numpy(dtype=object) if c in src else np.full(len(src), None, dtype=object)
        col = np.full(n, None, dtype=object)
        col[ok] = vals[idx[ok]]
        out[c] = pd.Series(col, index=out.index, dtype=object)
    return out


def latest_attributes(attrs: pd.DataFrame) -> pd.DataFrame:
    """Une ligne par part : pour chaque libellé, sa dernière valeur renseignée (comme groupby().last())."""
    a = attrs.iloc[_order(attrs)] if len(attrs) else attrs
    cols = [c for c in ATTR_COLS if c in a]
    return a.groupby(KEY, as_index=False, sort=True)[cols].last()


def since_param(value: Any) -> Any:
    return value if isinstance(value, (date, pd.Timestamp)) else pd.Timestamp(value).date()
