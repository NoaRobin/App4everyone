"""Construction de petits jeux de données au schéma exact, calculables à la main."""
from __future__ import annotations

from datetime import date

import pandas as pd

from rco.data import schema as S
from rco.domain.model import AUM_COLS, assemble


def frame(table: str, rows: list[dict]) -> pd.DataFrame:
    cols = S.columns(table)
    for r in rows:
        unknown = set(r) - set(cols)
        assert not unknown, f"colonnes hors schéma {unknown}"
    return pd.DataFrame.from_records(rows, columns=cols)


def aum_row(fund, part, d, parts, vl, eur=None, pi_part=None, isin=None, pi_fund=None, coef=1.0, div=None, bench=None, total=None):
    an = parts * vl
    return dict(ID_JUMP_FONDS=fund, ID_PI_FONDS=pi_fund, ID_JUMP_PART=part, ID_PI_PART=pi_part, CODE_ISIN_PART=isin,
                NOM_PART=f"{fund} {part}", DATE_VL=pd.Timestamp(d).date(), VL_UNITAIRE=vl, NOMBRE_PARTS=parts,
                DEVISE_VL="EUR", COEFFICIENT_OST=coef, DEVISE_FONDS="EUR", ACTIF_NET_PART_DEVISE_FONDS=an,
                ACTIF_NET_TOTAL_DEVISE_FONDS=total, NOM_BENCH="Indice" if bench else None, VL_BENCH=bench,
                DIVIDEND_AMOUNT=div, DIVIDEND_DEVISE="EUR" if div else None, ACTIF_NET_TOTAL_EURO=total,
                ACTIF_NET_PART_EURO=an if eur is None else eur, DATE_MAJ=pd.Timestamp("2026-01-01"))


def product(pid, name, level1="Actions européennes", **kw):
    return dict(Id=pid, pi_productid=pid, Product_Name=name, Management_Expertise_Level_1=level1, **kw)


def share(sid, pid, isin, name, **kw):
    return dict(Id=sid, pi_shareid=sid, ProductID=pid, ISIN_Code=isin, Share_Name=name, **kw)


def build(aum_rows, products, shares, countries=(), holdings=(), stale_days=12):
    aum = frame(S.AUM, aum_rows)[AUM_COLS]
    return assemble(date(2026, 1, 1), frame(S.PRODUCT, products), frame(S.SHARE, shares),
                    frame(S.COUNTRY, list(countries)), aum, frame(S.HOLDINGS, list(holdings)),
                    frame(S.DQ, []), stale_days=stale_days)
