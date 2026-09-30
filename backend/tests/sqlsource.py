"""Source de test qui imite mssql-python : les colonnes SQL DECIMAL/NUMERIC arrivent en decimal.Decimal (dtype objet).

Données fictives uniquement (dérivées du générateur de données de démonstration), avec des défauts réalistes injectés :
VL à zéro sur une part, indice de référence à zéro, taux de change incalculable (actif net en devise nul).
"""
from __future__ import annotations

from decimal import Decimal

import numpy as np
import pandas as pd

from rco.data import schema as S
from rco.data.mock import AS_OF, MockSource

DECIMAL_TYPES = {"decimal", "numeric", "money", "smallmoney"}


def _to_decimal(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return Decimal(str(v))


class DecimalSource:
    def __init__(self, faults: bool = True):
        self._mock = MockSource()
        self.reference_date = AS_OF
        self.faults = faults

    def table(self, name, columns, since=None):
        df = self._mock.table(name, columns, since=since).copy()
        types = S.dtypes(name)
        for c in df.columns:
            if types.get(c) in DECIMAL_TYPES:
                df[c] = df[c].astype(object).map(_to_decimal)
        if self.faults and name == S.AUM:
            df = self._inject_aum(df)
        return df

    @staticmethod
    def _inject_aum(df: pd.DataFrame) -> pd.DataFrame:
        parts = sorted(df["ID_JUMP_PART"].dropna().unique())
        # 1. Une VL à zéro au milieu de l'historique d'une part
        p0 = parts[0]
        rows = df.index[df["ID_JUMP_PART"] == p0]
        df.loc[rows[len(rows) // 2], "VL_UNITAIRE"] = Decimal("0")
        # 2. Indice de référence nul en début d'année pour une autre part
        p1 = parts[1]
        rows = df.index[(df["ID_JUMP_PART"] == p1) & df["VL_BENCH"].notna()]
        if len(rows):
            df.loc[rows[: max(3, len(rows) // 3)], "VL_BENCH"] = Decimal("0")
        # 3. Actif net total en devise du fonds nul : taux de change incalculable pour ce fonds
        f2 = df.loc[df["ID_JUMP_PART"] == parts[2], "ID_JUMP_FONDS"].iloc[0]
        df.loc[df["ID_JUMP_FONDS"] == f2, "ACTIF_NET_TOTAL_DEVISE_FONDS"] = Decimal("0")
        # 4. Actif net total publié incohérent avec la somme des parts (contrôle « totaux » déclenché)
        f3 = df.loc[df["ID_JUMP_PART"] == parts[5], "ID_JUMP_FONDS"].iloc[0]
        sel = df["ID_JUMP_FONDS"] == f3
        df.loc[sel, "ACTIF_NET_TOTAL_EURO"] = df.loc[sel, "ACTIF_NET_TOTAL_EURO"].map(lambda v: None if v is None else v * Decimal("1.1"))
        return df
