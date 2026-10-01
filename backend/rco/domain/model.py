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
from dataclasses import dataclass, field
from decimal import Decimal
from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd

from ..data import aum as AQ
from ..data import schema as S
from . import labels as L
from .numeric import numeric_series, safe_float

log = logging.getLogger(__name__)

# Colonnes lues dans JUMP_portfolio_aum (voir data/aum.py : faits numériques + libellés de part)
AUM_COLS = AQ.AUM_READ_COLS
# Colonnes des inventaires utilisées par l'application (les autres ne sont pas lues)
HOLDINGS_COLS = ["ID_JUMP_FONDS", "ID_PI_FONDS", "NOM_FONDS", "DATE_INVENTAIRE", "ID_JUMP_INSTRUMENT", "CODE_ISIN_INSTRUMENT",
                 "CODE_BLOOMBERG", "NOM_INSTRUMENT", "CODE_TYPE_INSTRUMENT", "DEVISE_INSTRUMENT", "CLASSE_ACTIF", "TYPE_HOLDING",
                 "TYPE_DETTE", "DEVISE_FONDS", "MONTANT_DEVISE_FONDS", "EXPOSITION_DEVISE_FONDS", "POIDS_LIGNE_EXPO"]


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


def rows_of(df: pd.DataFrame, cols) -> list[tuple[Any, dict]]:
    """(index, ligne) pour les seules colonnes demandées présentes : équivalent rapide de df.iterrows() sur une table
    très large (434 colonnes pour le référentiel produits), avec les mêmes valeurs Python."""
    present = [c for c in dict.fromkeys(cols) if c in df.columns]
    return list(zip(df.index, df[present].astype(object).to_dict("records")))


def link_shares(aum: pd.DataFrame, shares: pd.DataFrame, products: pd.DataFrame) -> pd.DataFrame:
    """Une ligne par part JUMP : identifiants de rattachement au référentiel et au fonds.

    `aum` : lignes JUMP (table complète ou seulement les changements de libellés, même résultat : pour chaque
    libellé, sa dernière valeur renseignée dans l'ordre chronologique).
    Colonnes : ID_JUMP_PART, ID_JUMP_FONDS, NOM_PART, pi_shareid, link (id|isin|none), fund_id, fund_linked.
    """
    last = AQ.latest_attributes(aum)
    for c in ("ID_JUMP_FONDS", "ID_PI_FONDS", "ID_PI_PART", "CODE_ISIN_PART", "NOM_PART"):
        if c not in last:
            last[c] = None
    last = last[["ID_JUMP_PART", "ID_JUMP_FONDS", "ID_PI_FONDS", "ID_PI_PART", "CODE_ISIN_PART", "NOM_PART"]].copy()
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


def _matrix(values: np.ndarray, rows: np.ndarray, cols: np.ndarray, index: pd.DatetimeIndex, columns: pd.Index) -> pd.DataFrame:
    """Matrice dates × parts remplie directement (équivalent de pivot().reindex(), sans tri ni copie intermédiaire)."""
    out = np.full((len(index), len(columns)), np.nan)
    out[rows, cols] = values
    return pd.DataFrame(out, index=index, columns=columns)


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
    # Mémos calculés à la demande (bornes de période, parts d'un fonds, positions des lignes d'une part…)
    memo: dict = field(default_factory=dict, repr=False)

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
        key = ("period_start", end, period)
        if key not in self.memo:
            self.memo[key] = self._period_start(end, period)
        return self.memo[key]

    def _period_start(self, end: pd.Timestamp, period: str) -> pd.Timestamp | None:
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


def memo(m: Any) -> dict:
    """Mémo de calculs attaché au modèle (créé au besoin, y compris sur un modèle simplifié de test)."""
    d = getattr(m, "memo", None)
    if d is None:
        d = {}
        m.memo = d
    return d


_NUMERIC_SQL = {"decimal", "numeric", "money", "smallmoney", "float", "real"}


def _financial(df: pd.DataFrame, table: str) -> pd.DataFrame:
    """Convertit en float64 les colonnes numériques (d'après le schéma) d'une table ; les colonnes texte sont inchangées.

    Le tableau est reconstruit en une fois (pas d'affectations colonne par colonne, coûteuses sur des millions de lignes).
    """
    if df is None or df.empty:
        return df
    types = S.dtypes(table)
    cols = {c for c in df.columns if types.get(c) in _NUMERIC_SQL}
    if not cols or all(df[c].dtype == np.float64 for c in cols):
        return df
    return pd.DataFrame({c: (numeric_series(df[c], name=f"{table}.{c}") if c in cols else df[c]) for c in df.columns},
                        index=df.index)


def _log_table(name: str, df: pd.DataFrame, t0: float) -> None:
    log.info("Table %s : %d lignes × %d colonnes en %.1f s", name, len(df), df.shape[1], time.perf_counter() - t0)


_TABLE_LABELS = {S.PRODUCT: "référentiel des fonds", S.SHARE: "référentiel des parts", S.COUNTRY: "pays d'enregistrement",
                 S.AUM: "encours et VL", S.HOLDINGS: "inventaires", S.DQ: "contrôles qualité"}


def _load(source: Any, name: str, columns: list[str], since: tuple[str, Any] | None = None, report=None) -> pd.DataFrame:
    """Lit une table en journalisant sa durée et sa volumétrie (jamais son contenu)."""
    if report:
        report(f"Lecture : {_TABLE_LABELS.get(name, name)}")
    t0 = time.perf_counter()
    df = source.table(name, columns, since=since) if since else source.table(name, columns)
    _log_table(name, df, t0)
    return df


def _load_aum(source: Any, since: date, report=None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Encours : deux lectures compactes (faits + changements de libellés) si la source le permet, sinon table complète."""
    if report:
        report(f"Lecture : {_TABLE_LABELS[S.AUM]}")
    t0 = time.perf_counter()
    if hasattr(source, "aum_parts"):
        facts, attrs = source.aum_parts(since)
        log.info("Table %s : %d lignes de montants × %d colonnes et %d changements de libellés en %.1f s",
                 S.AUM, len(facts), facts.shape[1], len(attrs), time.perf_counter() - t0)
        return facts, attrs
    full = source.table(S.AUM, AUM_COLS, since=("DATE_VL", since))
    _log_table(S.AUM, full, t0)
    return AQ.split_aum(full)


def build_model(source: Any, stale_days: int = 12, history_years: int = 4, is_mock: bool = False, report=None) -> Model:
    """Lit les tables puis assemble le modèle. `report(libellé)` est appelé à chaque étape (bandeau de chargement)."""
    ref = getattr(source, "reference_date", date.today())
    since = date(ref.year - history_years, 1, 1)
    products = _load(source, S.PRODUCT, S.columns(S.PRODUCT), report=report)
    shares = _load(source, S.SHARE, S.columns(S.SHARE), report=report)
    countries = _load(source, S.COUNTRY, S.columns(S.COUNTRY), report=report)
    facts, attrs = _load_aum(source, since, report=report)
    holdings = _load(source, S.HOLDINGS, HOLDINGS_COLS, since=("DATE_INVENTAIRE", ref - timedelta(days=200)), report=report)
    dq = _load(source, S.DQ, S.columns(S.DQ), report=report)
    if report:
        report("Calculs : encours, collecte et rattachements")
    t0 = time.perf_counter()
    model = assemble(ref, products, shares, countries, facts, holdings, dq, stale_days, is_mock, aum_attrs=attrs)
    log.info("Calculs du modèle en %.1f s (%d dates × %d parts)", time.perf_counter() - t0, len(model.dates), len(model.link))
    return model


def assemble(ref: date, products: pd.DataFrame, shares: pd.DataFrame, countries: pd.DataFrame, aum: pd.DataFrame,
             holdings: pd.DataFrame, dq: pd.DataFrame, stale_days: int = 12, is_mock: bool = False,
             aum_attrs: pd.DataFrame | None = None) -> Model:
    """Assemble le modèle. `aum` : table JUMP complète, ou seulement ses faits si `aum_attrs` (changements de libellés)
    est fourni (lecture compacte, voir data/aum.py)."""
    products = products.drop_duplicates("pi_productid").copy()
    shares = shares.drop_duplicates("pi_shareid").copy()
    facts, attrs = (aum, aum_attrs) if aum_attrs is not None else AQ.split_aum(aum)
    # Colonnes financières des tables JUMP (DECIMAL en SQL, decimal.Decimal via mssql-python) : float64 homogène
    # avant tout calcul. Valeur non numérique ou infinie → NaN (comptée dans le journal), jamais zéro.
    facts = _financial(facts, S.AUM)
    holdings = _financial(holdings, S.HOLDINGS)
    # Doublons éventuels (rechargements) : on garde la ligne la plus récemment mise à jour ; tri par part puis date
    aum = AQ.dedupe_facts(facts)
    del facts
    # Libellés nécessaires ligne à ligne (fonds JUMP, devise de la VL, indicateur de référence), tels qu'en vigueur à chaque date
    aum = AQ.join_attributes(aum, attrs, AQ.ROW_ATTRS)

    link = link_shares(attrs, shares, products)

    # Calendrier de calcul : jours ouvrés entre la première et la dernière VL
    dates = pd.bdate_range(aum["DATE_VL"].min(), aum["DATE_VL"].max())
    dates = dates.union(pd.DatetimeIndex(aum["DATE_VL"].unique()))

    codes, uniques = pd.factorize(aum["ID_JUMP_PART"], sort=True)
    columns = pd.Index(uniques, name="ID_JUMP_PART")
    rows = dates.get_indexer(aum["DATE_VL"])

    def pivot(col: str) -> pd.DataFrame:
        return _matrix(aum[col].to_numpy(dtype=float, na_value=np.nan), rows, codes, dates, columns)

    an_eur = pivot("ACTIF_NET_PART_EURO")
    parts = pivot("NOMBRE_PARTS")
    coef = pivot("COEFFICIENT_OST")
    share_aum = asof_matrix(an_eur, stale_days)
    flows = flow_matrix(an_eur, parts, coef, share_aum)
    del parts, coef
    share_flow_cum = flows.cumsum()
    del flows, an_eur

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
