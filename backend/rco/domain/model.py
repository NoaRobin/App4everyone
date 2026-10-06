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
from . import ids as IDS
from . import linking as LK
from .numeric import numeric_series, safe_float

log = logging.getLogger(__name__)

# Colonnes lues dans JUMP_portfolio_aum (voir data/aum.py : faits numériques + libellés de part)
AUM_COLS = AQ.AUM_READ_COLS
# Colonnes des inventaires utilisées par l'application (les autres ne sont pas lues)
HOLDINGS_COLS = ["ID_JUMP_FONDS", "ID_PI_FONDS", "NOM_FONDS", "DATE_INVENTAIRE", "ID_JUMP_INSTRUMENT", "CODE_ISIN_INSTRUMENT",
                 "CODE_BLOOMBERG", "NOM_INSTRUMENT", "CODE_TYPE_INSTRUMENT", "DEVISE_INSTRUMENT", "CLASSE_ACTIF", "TYPE_HOLDING",
                 "TYPE_DETTE", "CODE_AIM_FONDS", "DEVISE_FONDS", "MONTANT_DEVISE_FONDS", "EXPOSITION_DEVISE_FONDS", "POIDS_LIGNE_EXPO"]


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


def link_shares(aum: pd.DataFrame, shares: pd.DataFrame, products: pd.DataFrame, report: dict | None = None,
                holdings: pd.DataFrame | None = None, raw_shapes: dict | None = None) -> pd.DataFrame:
    """Une ligne par part JUMP : rattachement à la part du référentiel puis au fonds (règles : domain/linking.py).

    `aum` : lignes JUMP (table complète ou seulement les changements de libellés : pour chaque libellé, sa dernière
    valeur renseignée). Colonnes : ID_JUMP_PART, ID_JUMP_FONDS, NOM_PART, CODE_ISIN_PART, pi_shareid,
    link (id|isin|none), fund_id, fund_link, fund_linked, part_reason, fund_reason. `report` reçoit le diagnostic.
    """
    last = AQ.latest_attributes(aum)
    for c in ("ID_JUMP_FONDS", "ID_PI_FONDS", "ID_PI_PART", "CODE_ISIN_PART", "NOM_PART"):
        if c not in last:
            last[c] = None
    last = last[["ID_JUMP_PART", "ID_JUMP_FONDS", "ID_PI_FONDS", "ID_PI_PART", "CODE_ISIN_PART", "NOM_PART"]]
    link, rep = LK.link(last, shares, products, holdings=holdings, raw_shapes=raw_shapes)
    if report is not None:
        report.update(rep)
    return link


def find_duplicate_funds(funds: pd.DataFrame, fund_aum: pd.DataFrame, end) -> list[dict]:
    """Doublons restant après consolidation : même nom normalisé porté par plusieurs fonds affichés.

    Signalés, jamais fusionnés (un nom ne suffit pas à prouver qu'il s'agit du même produit).
    """
    if funds.empty:
        return []
    aum = fund_aum.loc[end] if len(fund_aum) else pd.Series(dtype=float)
    names = funds["name"].map(lambda n: L.norm(n) if isinstance(n, str) else "")
    out = []
    for key, g in funds.assign(_k=names.to_numpy()).groupby("_k"):
        if not key or len(g) < 2:
            continue
        out.append({"name": str(g["name"].iloc[0]), "funds": [
            {"id": fid, "referenced": bool(r["referenced"]), "aum": safe_float(aum.get(fid))} for fid, r in g.iterrows()]})
    return out


def _matrix(values: np.ndarray, rows: np.ndarray, cols: np.ndarray, index: pd.DatetimeIndex, columns: pd.Index) -> pd.DataFrame:
    """Matrice dates × parts remplie directement (équivalent de pivot().reindex(), sans tri ni copie intermédiaire)."""
    out = np.full((len(index), len(columns)), np.nan)
    out[rows, cols] = values
    return pd.DataFrame(out, index=index, columns=columns)


def _ffill(a: np.ndarray) -> np.ndarray:
    """Report vers le bas de la dernière valeur non NaN, colonne par colonne (numpy, sans copie pandas)."""
    n = a.shape[0]
    idx = np.where(np.isnan(a), 0, np.arange(n)[:, None])
    np.maximum.accumulate(idx, axis=0, out=idx)
    return a[idx, np.arange(a.shape[1])]                   # avant la première valeur : a[0] (NaN)


def _shift(a: np.ndarray) -> np.ndarray:
    out = np.empty_like(a)
    out[0] = np.nan
    out[1:] = a[:-1]
    return out


def observation_gap_days(pivot: pd.DataFrame) -> np.ndarray:
    """Écart moyen (jours) entre deux observations de chaque colonne : ~1,4 pour une VL quotidienne (jours ouvrés),
    ~7 hebdomadaire, ~30 mensuelle. Colonne observée une seule fois : 1. Vectorisé (aucune boucle par part)."""
    days = pivot.index.to_numpy().astype("datetime64[D]").astype(np.int64).astype(float)
    ok = pivot.notna().to_numpy()
    n = ok.sum(axis=0)
    first = np.where(n > 0, days[ok.argmax(axis=0)], 0.0)
    last = np.where(n > 0, days[len(days) - 1 - ok[::-1].argmax(axis=0)], 0.0)
    return np.where(n > 1, (last - first) / np.maximum(n - 1, 1), 1.0)


def stale_limits(pivot: pd.DataFrame, stale_days: int) -> np.ndarray:
    """Délai de péremption par part : `stale_days`, allongé pour les VL hebdomadaires ou mensuelles (3 × l'écart
    habituel entre deux VL, 100 jours au plus). Sans cela, une part mensuelle « disparaît » entre deux VL."""
    return np.maximum(float(stale_days), np.minimum(3.0 * observation_gap_days(pivot), 100.0))


def asof_matrix(pivot: pd.DataFrame, stale_days: int, limits: np.ndarray | None = None) -> pd.DataFrame:
    """Reporte la dernière valeur connue de chaque colonne tant qu'elle n'est pas périmée (voir stale_limits)."""
    idx = pivot.index
    lim = stale_limits(pivot, stale_days) if limits is None else limits
    obs_date = pd.DataFrame(np.where(pivot.notna().to_numpy(), idx.to_numpy()[:, None], np.datetime64("NaT")),
                            index=idx, columns=pivot.columns).ffill()
    filled = pivot.ffill()
    age = (idx.to_numpy()[:, None] - obs_date.to_numpy().astype("datetime64[ns]")) / np.timedelta64(1, "D")
    too_old = age > lim[None, :]
    return filled.mask(too_old)


def ost_factor(coef: np.ndarray, vl: np.ndarray, prev_vl: np.ndarray, parts: np.ndarray, prev_parts: np.ndarray) -> np.ndarray:
    """Facteur d'opération sur titres k du jour (parts de la veille × k = parts équivalentes du jour).

    JUMP transporte COEFFICIENT_OST sous des conventions variables selon les sources : 1 ou vide hors événement,
    parfois 0 ; coefficient du jour ou cumulé (répété chaque jour après l'événement) ; division ou multiplication.
    Seule la continuité de la VL tranche sans ambiguïté : après une division par k, VL_t × k ≈ VL_{t−1}.
    - coefficient vide, nul ou négatif : aucun événement ;
    - coefficient ≠ 1 : parmi {c, 1/c, 1}, celui qui rend la VL continue (1 si le coefficient est cumulé et répété) ;
    - coefficient 1 mais VL et nombre de parts qui sautent en sens inverse du même facteur (≥ 1,6) : division non
      déclarée, k = VL_{t−1} / VL_t.
    """
    k = np.ones(coef.shape, dtype=float)
    # Jours avec un coefficient renseigné ≠ 1 (rares) : le candidat qui rend la VL continue
    ev = np.flatnonzero(np.isfinite(coef.ravel()) & (coef.ravel() > 0) & (coef.ravel() != 1.0))
    if len(ev):
        c = coef.ravel()[ev]
        with np.errstate(divide="ignore", invalid="ignore"):
            base = vl.ravel()[ev] / prev_vl.ravel()[ev]
        known = np.isfinite(base) & (base > 0)
        cands = np.stack([c, 1.0 / c, np.ones_like(c)])
        err = np.abs(np.log(np.where(known, base, 1.0)[None] * cands))
        best = cands[err.argmin(axis=0), np.arange(len(c))]
        k.ravel()[ev] = np.where(known, best, c)
    # Division non déclarée : VL et nombre de parts sautent en sens inverse du même facteur
    with np.errstate(divide="ignore", invalid="ignore"):
        r = prev_vl / vl
    jump = np.flatnonzero(((r > 1.6) | (r < 0.625)).ravel())
    if len(jump):
        flat_k = k.ravel()
        jump = jump[flat_k[jump] == 1.0]
        with np.errstate(divide="ignore", invalid="ignore"):
            q = parts.ravel()[jump] / prev_parts.ravel()[jump]
        rr = r.ravel()[jump]
        ok = np.isfinite(q) & (q > 0) & (np.abs(np.log(np.where(q > 0, q, 1.0) / rr)) < 0.1)
        flat_k[jump[ok]] = rr[ok]
    return k


def flow_matrix(an_eur: pd.DataFrame, parts: pd.DataFrame, coef: pd.DataFrame, aum_asof: pd.DataFrame,
                limits: np.ndarray | None = None) -> pd.DataFrame:
    """Collecte nette estimée par part et par date d'observation, en euros.

    flux_t = (parts_t − parts_{t−1} × k_t) × VL_EUR_t, VL_EUR_t = actif net EUR / parts, k_t : facteur d'OST
    (ost_factor). Règles de robustesse (chacune évitait une collecte de signe faux sur données réelles) :
    - un trou de VL n'est jamais un rachat : seule la disparition définitive d'une part (après sa dernière VL) solde
      son encours ; un retour après un trou ne compte que la variation du nombre de parts ;
    - nombre de parts nul avec un actif net positif : valeur erronée, ignorée ; nombre de parts réellement nul
      (rachat total) : rachat des parts de la veille à la dernière VL connue ;
    - lancement (première VL bien après le début de l'historique) : souscription initiale = encours.
    """
    idx, cols = an_eur.index, an_eur.columns
    A = an_eur.to_numpy(dtype=float)
    P = parts.to_numpy(dtype=float).copy()
    C = coef.to_numpy(dtype=float)
    P[(P <= 0) & (A > 0)] = np.nan                       # zéro ou négatif avec un actif net : saisie erronée
    P[P < 0] = np.nan
    zero = P == 0
    with np.errstate(divide="ignore", invalid="ignore"):
        vl = np.where(P > 0, A / P, np.nan)
    vl_ff = _ffill(vl)
    p_ff = _ffill(P)
    prev_p, prev_vl = _shift(p_ff), _shift(vl_ff)
    k = ost_factor(C, vl, prev_vl, P, prev_p)
    vl_use = np.where(zero, prev_vl, vl)
    flows = (P - prev_p * k) * vl_use
    flows[np.isnan(P)] = np.nan
    lim = stale_limits(an_eur, 0) if limits is None else limits
    first_date = idx[0]
    obs = ~np.isnan(A) | ~np.isnan(P)
    present = aum_asof.notna().to_numpy()
    prev_val = _shift(aum_asof.to_numpy(dtype=float))
    has = obs.any(axis=0)
    fv = obs.argmax(axis=0)
    lv = len(idx) - 1 - obs[::-1].argmax(axis=0)
    days = (idx - first_date) / pd.Timedelta(days=1)
    j = np.flatnonzero(has)
    # Lancement : première VL nettement après le début de l'historique → souscription initiale = encours
    launch = j[(np.asarray(days)[fv[j]] > np.maximum(7.0, lim[j])) & np.isfinite(A[fv[j], j])]
    flows[fv[launch], launch] = A[fv[launch], launch]
    # Disparition définitive : premier jour sans valeur reportée après la dernière observation (sauf rachat total déjà compté)
    after = ~present & (np.arange(len(idx))[:, None] > lv[None, :])
    gone = j[after[:, j].any(axis=0) & ~zero[lv[j], j]]
    t = after[:, gone].argmax(axis=0)
    pv = prev_val[t, gone]
    okp = np.isfinite(pv)
    t, gone, pv = t[okp], gone[okp], pv[okp]
    flows[t, gone] = np.nan_to_num(flows[t, gone], nan=0.0) - pv
    return pd.DataFrame(np.nan_to_num(flows, nan=0.0), index=idx, columns=cols)


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
    link_report: dict = field(default_factory=dict)
    flows_off: dict = field(default_factory=dict)   # collecte JUMP neutralisée (parts, fonds, règle)
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
    # Identifiants sous forme canonique avant toute jointure (types, espaces, casse, valeurs vides : voir domain/ids.py)
    # Audit des formats bruts (formes et comptes seulement, jamais les valeurs)
    raw_shapes = {f"{t}.{c}": IDS.shapes(df[c]) for t, df, cols in (
        ("PI_OUT_Share", shares, ("pi_shareid", "ProductID", "ISIN_Code")), ("pi_out_product_active", products, ("pi_productid",)),
        ("JUMP", aum_attrs if aum_attrs is not None else aum, ("ID_JUMP_FONDS",))) for c in cols if df is not None and c in df}
    n_products, n_shares = len(products), len(shares)
    products = products.copy()
    products["pi_productid"] = IDS.clean_ids(products["pi_productid"])
    # Une ligne par identifiant : l'enregistrement actif et le plus complet, pas le premier venu
    products = products.dropna(subset=["pi_productid"])
    products = LK.best_rows(products, "pi_productid", [LK.is_active(products)])
    shares = shares.copy()
    shares["pi_shareid"] = IDS.clean_ids(shares["pi_shareid"])
    if "ProductID" in shares:
        shares["ProductID"] = IDS.align(shares["ProductID"], products["pi_productid"])
    if "ISIN_Code" in shares:
        clean = IDS.isins(shares["ISIN_Code"])
        shares["ISIN_Code"] = clean.where(clean.notna(), shares["ISIN_Code"].astype(object).where(shares["ISIN_Code"].notna(), None))
    shares = shares.dropna(subset=["pi_shareid"])
    prefer = [LK.is_active(shares)]
    if "ProductID" in shares:
        prefer.append(shares["ProductID"].isin(set(products["pi_productid"])))
    if "ISIN_Code" in shares:
        prefer.append(shares["ISIN_Code"].notna())
    shares = LK.best_rows(shares, "pi_shareid", prefer)
    if countries is not None and "pi_shareid" in countries:
        countries = countries.copy()
        countries["pi_shareid"] = IDS.align(countries["pi_shareid"], shares["pi_shareid"])
    facts, attrs = (aum, aum_attrs) if aum_attrs is not None else AQ.split_aum(aum)
    facts = facts.copy()
    facts["ID_JUMP_PART"] = IDS.jump_ids(facts["ID_JUMP_PART"])
    facts = facts.dropna(subset=["ID_JUMP_PART"])
    attrs = attrs.copy()
    for c in ("ID_JUMP_PART", "ID_JUMP_FONDS"):
        if c in attrs:
            attrs[c] = IDS.jump_ids(attrs[c])
    attrs = attrs.dropna(subset=["ID_JUMP_PART"])
    if holdings is not None and len(holdings):
        holdings = holdings.copy()
        if "ID_JUMP_FONDS" in holdings:
            holdings["ID_JUMP_FONDS"] = IDS.jump_ids(holdings["ID_JUMP_FONDS"])
        if "ID_PI_FONDS" in holdings:
            holdings["ID_PI_FONDS"] = IDS.align(holdings["ID_PI_FONDS"], products["pi_productid"])
    # Colonnes financières des tables JUMP (DECIMAL en SQL, decimal.Decimal via mssql-python) : float64 homogène
    # avant tout calcul. Valeur non numérique ou infinie → NaN (comptée dans le journal), jamais zéro.
    facts = _financial(facts, S.AUM)
    holdings = _financial(holdings, S.HOLDINGS)
    # Doublons éventuels (rechargements) : on garde la ligne la plus récemment mise à jour ; tri par part puis date
    aum = AQ.dedupe_facts(facts)
    del facts
    # Libellés nécessaires ligne à ligne (fonds JUMP, devise de la VL, indicateur de référence), tels qu'en vigueur à chaque date
    aum = AQ.join_attributes(aum, attrs, AQ.ROW_ATTRS)

    link_report: dict = {}
    link = link_shares(attrs, shares, products, report=link_report, holdings=holdings, raw_shapes=raw_shapes)
    link_report["referential_duplicates"] = {"products": int(n_products - len(products)), "shares": int(n_shares - len(shares))}
    log.info("Rattachement des parts : %(total)d parts, %(by_pi_shareid)d par pi_shareid, %(by_isin)d par ISIN, "
             "%(unlinked)d non rattachées", link_report["parts"])
    log.info("Rattachement des fonds JUMP : %(total)d fonds, %(by_product_id)d par ProductID, %(by_id_pi_fonds)d par "
             "ID_PI_FONDS, %(by_propagation)d par propagation, %(unlinked)d non rattachés", link_report["funds"])
    for cause, k in link_report["ambiguous_isin_causes"].items():
        log.warning("Rattachement : %d ISIN ambigu(s) — %s", k, cause)
    if link_report["fund_reasons"]:
        log.info("Rattachement : parts sans fonds par raison technique : %s",
                 ", ".join(f"{r} = {k}" for r, k in link_report["fund_reasons"].items()))

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
    limits = stale_limits(an_eur, stale_days)
    share_aum = asof_matrix(an_eur, stale_days, limits)
    flows = flow_matrix(an_eur, parts, coef, share_aum, limits)
    del parts, coef
    share_flow_cum = flows.cumsum()
    del flows, an_eur

    # ------------------------------------------------------------ fonds
    fam = {pid: L.family_of(r) for pid, r in zip(products["pi_productid"], products.to_dict("records"))}
    fund_rows = products.copy()
    fund_rows["fund_id"] = fund_rows["pi_productid"]
    fund_rows["family"] = fund_rows["pi_productid"].map(fam)
    # Nom : Product_Name ; s'il est vide, préfixe commun des noms de parts JUMP rattachées, sinon l'identifiant
    part_names = link.groupby("fund_id")["NOM_PART"].agg(lambda x: _common_prefix([n for n in x if isinstance(n, str) and n.strip()]))
    pname = fund_rows["Product_Name"].where(fund_rows["Product_Name"].map(lambda v: isinstance(v, str) and bool(v.strip())))
    fallback = fund_rows["pi_productid"].map(part_names).where(lambda x: x.map(lambda v: isinstance(v, str) and bool(v)))
    fund_rows["name"] = pname.fillna(fallback).fillna(fund_rows["pi_productid"].astype(str))
    fund_rows["referenced"] = True
    unlinked = link[~link["fund_linked"]]
    extra = []
    for fid, g in unlinked.groupby("fund_id"):
        names = [n for n in g["NOM_PART"].tolist() if isinstance(n, str) and n.strip()]
        prefix = _common_prefix(names) or (names[0] if names else fid)
        extra.append({"fund_id": fid, "name": prefix, "family": "nc", "referenced": False,
                      "Product_Name": prefix})
    if extra:
        fund_rows = pd.concat([fund_rows, pd.DataFrame(extra)], ignore_index=True)
    fund_rows = fund_rows.set_index("fund_id", drop=False)

    col_fund = link.set_index("ID_JUMP_PART")["fund_id"]
    groups = col_fund.reindex(share_aum.columns)
    fund_aum = share_aum.T.groupby(groups).sum(min_count=1).T

    # Collecte JUMP neutralisée sur décision métier (données JUMP erronées) : encours conservés, collecte mise à zéro
    flows_off = flows_disabled(link, shares, fund_rows)
    if flows_off["parts"]:
        cols = [c for c in flows_off["parts"] if c in share_flow_cum.columns]
        share_flow_cum[cols] = 0.0
        log.warning("Collecte JUMP neutralisée pour %d part(s) de %d fonds (règle « %s »)", len(cols), len(flows_off["funds"]), flows_off["rule"])
    fund_flow_cum = share_flow_cum.T.groupby(groups).sum().T

    shares = shares.set_index("pi_shareid", drop=False)
    products_ix = products.set_index("pi_productid", drop=False)
    return Model(reference_date=ref, products=products_ix, shares=shares, countries=countries, holdings=holdings,
                 dq=dq, link=link.set_index("ID_JUMP_PART", drop=False), dates=dates, aum_raw=aum,
                 share_aum=share_aum, share_flow_cum=share_flow_cum, funds=fund_rows, fund_aum=fund_aum,
                 fund_flow_cum=fund_flow_cum, stale_days=stale_days, is_mock=is_mock, link_report=link_report, flows_off=flows_off)


FLOWS_DISABLED_DEFAULT = r"mediobanca.*r-?co.*valor|r-?co.*valor.*mediobanca"


def _fold(v: Any) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", str(v)).encode("ascii", "ignore").decode().lower()
    return " ".join(s.replace("_", " ").split())


def flows_disabled(link: pd.DataFrame, shares: pd.DataFrame, fund_rows: pd.DataFrame, rule: str | None = None) -> dict:
    """Parts dont la collecte JUMP est neutralisée : règle APP_FLOWS_DISABLED (expression régulière, insensible à la casse et
    aux accents ; vide = aucune), appliquée au nom du fonds (toutes ses parts), au nom de la part JUMP ou du référentiel,
    et au client nommé de la part. Défaut : Mediobanca R-co Valor (collecte JUMP erronée, environ 2,5 Md€)."""
    import os
    import re
    rule = os.environ.get("APP_FLOWS_DISABLED", FLOWS_DISABLED_DEFAULT) if rule is None else rule
    out = {"rule": rule, "parts": [], "funds": [], "reason": "Collecte JUMP erronée : neutralisée sur décision métier (encours conservés)."}
    if not rule.strip():
        return out
    try:
        rx = re.compile(rule, re.I)
    except re.error:
        log.warning("APP_FLOWS_DISABLED invalide : %r", rule)
        return out
    hit = lambda v: isinstance(v, str) and bool(v.strip()) and bool(rx.search(_fold(v)))
    funds = {fid for fid, r in fund_rows.iterrows() if hit(r.get("name")) or hit(r.get("Product_Name"))}
    sh = shares.set_index("pi_shareid") if "pi_shareid" in shares.columns else shares
    parts = set()
    for r in link.itertuples(index=False):
        sid = getattr(r, "pi_shareid", None)
        ref = sh.loc[sid] if isinstance(sid, str) and sid in sh.index else None
        names = [getattr(r, "NOM_PART", None)]
        if ref is not None:
            names += [ref.get("Share_Name"), ref.get("Investor_Type_free_field")]
        if getattr(r, "fund_id", None) in funds or any(hit(n) for n in names):
            parts.add(r.ID_JUMP_PART)
    out["parts"] = sorted(parts)
    out["funds"] = sorted({f for f in link.set_index("ID_JUMP_PART").loc[sorted(parts), "fund_id"] if isinstance(f, str)}) if parts else []
    out["fund_level"] = sorted(funds)
    return out


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
