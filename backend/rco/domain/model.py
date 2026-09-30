"""Modèle en mémoire : jointures JUMP × Product Info et matrices d'encours.

Règles clés (toutes couvertes par des tests) :
- Rattachement d'une part JUMP au référentiel : ID_PI_PART = pi_shareid, sinon CODE_ISIN_PART = ISIN_Code.
- Rattachement au fonds : PI_OUT_Share.ProductID = pi_productid, sinon JUMP.ID_PI_FONDS.
- L'encours d'un fonds est la SOMME DES PARTS (ACTIF_NET_PART_EURO) ; ACTIF_NET_TOTAL_EURO, répété sur
  chaque part, ne sert qu'au contrôle de cohérence (jamais additionné).
- Encours « à date » : dernière VL connue à cette date, tant qu'elle date de moins de `stale_days` jours.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from decimal import Decimal
from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd

from ..data import schema as S
from . import labels as L
from .numeric import numeric_series, safe_float

log = logging.getLogger(__name__)

AUM_COLS = ["ID_JUMP_FONDS", "ID_PI_FONDS", "ID_JUMP_PART", "ID_PI_PART", "CODE_ISIN_PART", "NOM_PART", "DATE_VL",
            "VL_UNITAIRE", "NOMBRE_PARTS", "DEVISE_VL", "COEFFICIENT_OST", "DEVISE_FONDS", "ACTIF_NET_PART_DEVISE_FONDS",
            "ACTIF_NET_TOTAL_DEVISE_FONDS", "NOM_BENCH", "VL_BENCH", "DIVIDEND_AMOUNT", "DIVIDEND_DEVISE",
            "ACTIF_NET_TOTAL_EURO", "ACTIF_NET_PART_EURO", "DATE_MAJ"]


def _clean(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, float) and np.isnan(v):
        return None
    if isinstance(v, (np.floating,)):
        return None if np.isnan(v) else float(v)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, Decimal):
        return safe_float(v)  # DECIMAL SQL (mssql-python) : float fini, ou None si non fini
    if isinstance(v, pd.Timestamp):
        return None if pd.isna(v) else v.date().isoformat() if v.hour == 0 and v.minute == 0 else v.isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if v is pd.NaT:
        return None
    return v


def records(df: pd.DataFrame) -> list[dict]:
    return [{k: _clean(v) for k, v in r.items()} for r in df.to_dict("records")]


def link_shares(aum: pd.DataFrame, shares: pd.DataFrame, products: pd.DataFrame) -> pd.DataFrame:
    """Une ligne par part JUMP : identifiants de rattachement au référentiel et au fonds.

    Colonnes : ID_JUMP_PART, ID_JUMP_FONDS, NOM_PART, pi_shareid, link (id|isin|none), fund_id, fund_linked.
    """
    last = (aum.sort_values("DATE_VL").groupby("ID_JUMP_PART", as_index=False).last()
            [["ID_JUMP_PART", "ID_JUMP_FONDS", "ID_PI_FONDS", "ID_PI_PART", "CODE_ISIN_PART", "NOM_PART"]])
    share_ids = set(shares["pi_shareid"].dropna())
    isin_counts = shares["ISIN_Code"].dropna().value_counts()
    isin_to_share = (shares.dropna(subset=["ISIN_Code"])
                     .loc[lambda d: d["ISIN_Code"].map(isin_counts) == 1]
                     .set_index("ISIN_Code")["pi_shareid"])
    by_id = last["ID_PI_PART"].where(last["ID_PI_PART"].isin(share_ids))
    by_isin = last["CODE_ISIN_PART"].map(isin_to_share)
    last["pi_shareid"] = by_id.fillna(by_isin)
    last["link"] = np.where(by_id.notna(), "id", np.where(by_isin.notna(), "isin", "none"))
    share_product = shares.set_index("pi_shareid")["ProductID"]
    product_ids = set(products["pi_productid"].dropna())
    via_share = last["pi_shareid"].map(share_product)
    via_share = via_share.where(via_share.isin(product_ids))
    via_jump = last["ID_PI_FONDS"].where(last["ID_PI_FONDS"].isin(product_ids))
    last["fund_id"] = via_share.fillna(via_jump)
    last["fund_linked"] = last["fund_id"].notna()
    last["fund_id"] = last["fund_id"].fillna("J:" + last["ID_JUMP_FONDS"].astype(str))
    return last.drop(columns=["ID_PI_PART", "ID_PI_FONDS"])


def asof_matrix(pivot: pd.DataFrame, stale_days: int) -> pd.DataFrame:
    """Reporte la dernière valeur connue de chaque colonne tant qu'elle a moins de `stale_days` jours."""
    idx = pivot.index
    obs_date = pd.DataFrame(np.where(pivot.notna().to_numpy(), idx.to_numpy()[:, None], np.datetime64("NaT")),
                            index=idx, columns=pivot.columns).ffill()
    filled = pivot.ffill()
    age = (idx.to_numpy()[:, None] - obs_date.to_numpy().astype("datetime64[ns]"))
    too_old = age > np.timedelta64(stale_days, "D")
    return filled.mask(too_old)


def flow_matrix(an_eur: pd.DataFrame, parts: pd.DataFrame, coef: pd.DataFrame, aum_asof: pd.DataFrame) -> pd.DataFrame:
    """Collecte nette estimée par part et par date d'observation, en euros.

    flux_t = (parts_t − parts_{t−1} × coef_OST_t) × VL_EUR_t, avec VL_EUR_t = actif net EUR / parts.
    Lancement d'une part (après le début de l'historique) : souscription initiale = encours.
    Disparition d'une part (VL non reportée au-delà du délai) : rachat de l'encours restant.
    """
    parts_prev = parts.ffill().shift(1)
    vl_eur = an_eur / parts.replace(0, np.nan)
    flows = (parts - parts_prev * coef.fillna(1.0)) * vl_eur
    flows = flows.where(parts.notna())
    first_date = an_eur.index[0]
    for col in an_eur.columns:
        s = an_eur[col]
        fv = s.first_valid_index()
        if fv is not None and fv > first_date + pd.Timedelta(days=7):
            flows.at[fv, col] = s.at[fv]
    # Sorties : la valeur reportée devient NaN alors qu'elle existait la veille
    present = aum_asof.notna()
    exited = present.shift(1, fill_value=False) & ~present
    prev_val = aum_asof.shift(1)
    flows = flows.fillna(0.0)
    flows = flows.where(~exited, flows - prev_val.where(exited, 0.0))
    return flows.fillna(0.0)


@dataclass
class Model:
    reference_date: date
    products: pd.DataFrame        # une ligne par fonds actif du référentiel (index pi_productid)
    shares: pd.DataFrame          # une ligne par part du référentiel (index pi_shareid)
    countries: pd.DataFrame
    holdings: pd.DataFrame
    dq: pd.DataFrame
    link: pd.DataFrame            # une ligne par part JUMP
    dates: pd.DatetimeIndex
    aum_raw: pd.DataFrame         # lignes JUMP utiles (triées)
    share_aum: pd.DataFrame       # dates × ID_JUMP_PART (EUR, à date)
    share_flow_cum: pd.DataFrame  # dates × ID_JUMP_PART (collecte cumulée EUR)
    funds: pd.DataFrame           # une ligne par fonds (référentiel + fonds JUMP non rattachés)
    fund_aum: pd.DataFrame        # dates × fund_id
    fund_flow_cum: pd.DataFrame   # dates × fund_id
    stale_days: int
    is_mock: bool

    # ---------------------------------------------------------------- dates
    def date_index(self, d: date | str | None) -> int:
        """Position de la dernière date de calcul ≤ d (d par défaut : dernière date disponible)."""
        if d is None:
            return len(self.dates) - 1
        ts = pd.Timestamp(d)
        pos = int(self.dates.searchsorted(ts, side="right")) - 1
        return max(pos, 0)

    def as_of(self, d: date | str | None) -> pd.Timestamp:
        return self.dates[self.date_index(d)]

    def period_start(self, end: pd.Timestamp, period: str) -> pd.Timestamp | None:
        """Date de départ d'une période (valeur prise à la dernière date ≤ départ)."""
        e = end.date()
        starts = {
            "1J": None, "1S": e - timedelta(days=7), "1M": (pd.Timestamp(e) - pd.DateOffset(months=1)).date(),
            "3M": (pd.Timestamp(e) - pd.DateOffset(months=3)).date(), "YTD": date(e.year - 1, 12, 31),
            "1A": (pd.Timestamp(e) - pd.DateOffset(years=1)).date(), "3A": (pd.Timestamp(e) - pd.DateOffset(years=3)).date(),
        }
        if period == "1J":
            pos = self.date_index(e) - 1
            return self.dates[pos] if pos >= 0 else None
        s = starts[period]
        if pd.Timestamp(s) < self.dates[0]:
            return None
        return self.as_of(s)


PERIODS = ["1J", "1S", "1M", "3M", "YTD", "1A", "3A"]


_NUMERIC_SQL = {"decimal", "numeric", "money", "smallmoney", "float", "real"}


def _financial(df: pd.DataFrame, table: str) -> pd.DataFrame:
    """Convertit en float64 les colonnes numériques (d'après le schéma) d'une table ; les colonnes texte sont inchangées."""
    if df is None or df.empty:
        return df
    types = S.dtypes(table)
    cols = [c for c in df.columns if types.get(c) in _NUMERIC_SQL]
    if not cols:
        return df
    df = df.copy()
    for c in cols:
        df[c] = numeric_series(df[c], name=f"{table}.{c}")
    return df


def _load(source: Any, name: str, columns: list[str], since: tuple[str, Any] | None = None) -> pd.DataFrame:
    """Lit une table en journalisant sa durée et sa volumétrie (jamais son contenu)."""
    t0 = time.perf_counter()
    df = source.table(name, columns, since=since) if since else source.table(name, columns)
    log.info("Table %s : %d lignes × %d colonnes en %.1f s", name, len(df), df.shape[1], time.perf_counter() - t0)
    return df


def build_model(source: Any, stale_days: int = 12, history_years: int = 4, is_mock: bool = False) -> Model:
    ref = getattr(source, "reference_date", date.today())
    since = date(ref.year - history_years, 1, 1)
    products = _load(source, S.PRODUCT, S.columns(S.PRODUCT))
    shares = _load(source, S.SHARE, S.columns(S.SHARE))
    countries = _load(source, S.COUNTRY, S.columns(S.COUNTRY))
    aum = _load(source, S.AUM, AUM_COLS, since=("DATE_VL", since))
    holdings = _load(source, S.HOLDINGS, S.columns(S.HOLDINGS), since=("DATE_INVENTAIRE", ref - timedelta(days=200)))
    dq = _load(source, S.DQ, S.columns(S.DQ))
    return assemble(ref, products, shares, countries, aum, holdings, dq, stale_days, is_mock)


def assemble(ref: date, products: pd.DataFrame, shares: pd.DataFrame, countries: pd.DataFrame, aum: pd.DataFrame,
             holdings: pd.DataFrame, dq: pd.DataFrame, stale_days: int = 12, is_mock: bool = False) -> Model:
    products = products.drop_duplicates("pi_productid").copy()
    shares = shares.drop_duplicates("pi_shareid").copy()
    # Colonnes financières des tables JUMP (DECIMAL en SQL, decimal.Decimal via mssql-python) : float64 homogène
    # avant tout calcul. Valeur non numérique ou infinie → NaN (comptée dans le journal), jamais zéro.
    aum = _financial(aum, S.AUM)
    holdings = _financial(holdings, S.HOLDINGS)
    aum = aum.copy()
    aum["DATE_VL"] = pd.to_datetime(aum["DATE_VL"])
    # Doublons éventuels (rechargements) : on garde la ligne la plus récemment mise à jour
    if "DATE_MAJ" in aum:
        aum = aum.sort_values(["DATE_MAJ"]).drop_duplicates(["ID_JUMP_PART", "DATE_VL"], keep="last")
    aum = aum.sort_values(["ID_JUMP_PART", "DATE_VL"]).reset_index(drop=True)

    link = link_shares(aum, shares, products)

    # Calendrier de calcul : jours ouvrés entre la première et la dernière VL
    dates = pd.bdate_range(aum["DATE_VL"].min(), aum["DATE_VL"].max())
    dates = dates.union(pd.DatetimeIndex(aum["DATE_VL"].unique()))

    def pivot(col: str) -> pd.DataFrame:
        return aum.pivot(index="DATE_VL", columns="ID_JUMP_PART", values=col).reindex(dates)

    an_eur = pivot("ACTIF_NET_PART_EURO").astype(float)
    parts = pivot("NOMBRE_PARTS").astype(float)
    coef = pivot("COEFFICIENT_OST").astype(float)
    share_aum = asof_matrix(an_eur, stale_days)
    flows = flow_matrix(an_eur, parts, coef, share_aum)
    share_flow_cum = flows.cumsum()

    # ------------------------------------------------------------ fonds
    fam = {pid: L.family_of(r) for pid, r in zip(products["pi_productid"], products.to_dict("records"))}
    fund_rows = products.copy()
    fund_rows["fund_id"] = fund_rows["pi_productid"]
    fund_rows["family"] = fund_rows["pi_productid"].map(fam)
    fund_rows["name"] = fund_rows["Product_Name"]
    fund_rows["referenced"] = True
    unlinked = link[~link["fund_linked"]]
    extra = []
    for fid, g in unlinked.groupby("fund_id"):
        names = g["NOM_PART"].dropna().tolist()
        prefix = _common_prefix(names) or (names[0] if names else fid)
        extra.append({"fund_id": fid, "name": prefix, "family": "nc", "referenced": False,
                      "Product_Name": prefix})
    if extra:
        fund_rows = pd.concat([fund_rows, pd.DataFrame(extra)], ignore_index=True)
    fund_rows = fund_rows.set_index("fund_id", drop=False)

    col_fund = link.set_index("ID_JUMP_PART")["fund_id"]
    groups = col_fund.reindex(share_aum.columns)
    fund_aum = share_aum.T.groupby(groups).sum(min_count=1).T
    fund_flow_cum = share_flow_cum.T.groupby(groups).sum().T

    shares = shares.set_index("pi_shareid", drop=False)
    products_ix = products.set_index("pi_productid", drop=False)
    return Model(reference_date=ref, products=products_ix, shares=shares, countries=countries, holdings=holdings,
                 dq=dq, link=link.set_index("ID_JUMP_PART", drop=False), dates=dates, aum_raw=aum,
                 share_aum=share_aum, share_flow_cum=share_flow_cum, funds=fund_rows, fund_aum=fund_aum,
                 fund_flow_cum=fund_flow_cum, stale_days=stale_days, is_mock=is_mock)


def _common_prefix(names: list[str]) -> str:
    if not names:
        return ""
    words = [n.split() for n in names]
    out = []
    for tup in zip(*words):
        if all(w == tup[0] for w in tup):
            out.append(tup[0])
        else:
            break
    if len(names) == 1 and len(out) > 1:
        out = out[:-1]
    return " ".join(out)
