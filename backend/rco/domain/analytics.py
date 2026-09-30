"""Calculs métier : variations d'encours, collecte estimée, performances, risques."""
from __future__ import annotations

import logging
import math
from typing import Any

import numpy as np
import pandas as pd

from . import labels as L
from .model import PERIODS, Model
from .numeric import finite_or_none, numeric_series, return_between, safe_divide, safe_float

log = logging.getLogger(__name__)


def _f(x: Any) -> float | None:
    """Valeur numérique finie ou None (Decimal, NumPy, pandas NA acceptés ; booléens refusés)."""
    return safe_float(x)


# ------------------------------------------------------------------ encours & variations
def variation(aum: pd.Series, flow_cum: pd.Series, start: pd.Timestamp | None, end: pd.Timestamp) -> dict:
    """Variation d'encours entre deux dates, décomposée en collecte nette estimée et effet marché.

    `aum` et `flow_cum` sont des séries indexées par date (un fonds, une part ou un agrégat).
    ΔEncours = Collecte nette estimée + Effet marché.
    """
    end_v = _f(aum.get(end))
    if start is None:
        return {"start": None, "aum_start": None, "aum_end": end_v, "delta": None, "pct": None, "flows": None, "market": None}
    start_v = _f(aum.get(start))
    a0, a1 = start_v or 0.0, end_v or 0.0
    flows = float(flow_cum.get(end, 0.0) - flow_cum.get(start, 0.0))
    delta = a1 - a0
    return {
        "start": start.date().isoformat(), "aum_start": start_v, "aum_end": end_v,
        "delta": delta, "pct": safe_divide(delta, start_v),
        "flows": flows, "market": delta - flows,
    }


def variations(m: Model, aum: pd.Series, flow_cum: pd.Series, end: pd.Timestamp) -> dict[str, dict]:
    return {p: variation(aum, flow_cum, m.period_start(end, p), end) for p in PERIODS}


def house_series(m: Model) -> tuple[pd.Series, pd.Series]:
    return m.fund_aum.sum(axis=1, min_count=1), m.fund_flow_cum.sum(axis=1)


def monthly_points(series: pd.Series, end: pd.Timestamp) -> list[dict]:
    """Fin de mois (dernière date disponible de chaque mois) jusqu'à `end` inclus."""
    s = series[:end].dropna()
    if s.empty:
        return []
    last = s.groupby([s.index.year, s.index.month]).tail(1)
    return [{"d": d.date().isoformat(), "v": float(v)} for d, v in last.items()]


def daily_points(series: pd.Series, end: pd.Timestamp, start: pd.Timestamp | None = None) -> list[dict]:
    s = series[start:end] if start is not None else series[:end]
    s = s.dropna()
    return [{"d": d.date().isoformat(), "v": round(float(v), 6)} for d, v in s.items()]


# ------------------------------------------------------------------ performance
def nav_rows(m: Model, jump_part: str) -> pd.DataFrame:
    """Lignes JUMP d'une part (index par part calculé une seule fois)."""
    groups = getattr(m, "_nav_groups", None)
    if groups is None:
        groups = {k: g for k, g in m.aum_raw.groupby("ID_JUMP_PART", sort=False)}
        m._nav_groups = groups
    return groups.get(jump_part, m.aum_raw.iloc[0:0])


def share_nav_frame(m: Model, jump_part: str) -> pd.DataFrame:
    df = nav_rows(m, jump_part)[
        ["DATE_VL", "VL_UNITAIRE", "COEFFICIENT_OST", "DIVIDEND_AMOUNT", "VL_BENCH", "NOM_BENCH", "DEVISE_VL", "NOMBRE_PARTS"]]
    return df.dropna(subset=["VL_UNITAIRE"]).set_index("DATE_VL").sort_index()


def benchmark_series(nav: pd.DataFrame) -> pd.Series:
    """Niveaux de l'indicateur de référence en float64 ; un niveau nul ou négatif est invalide (NaN, jamais remplacé)."""
    b = numeric_series(nav["VL_BENCH"])
    bad = b <= 0
    if bad.any():
        log.warning("Indicateur de référence : %d niveau(x) nul(s) ou négatif(s) écarté(s)", int(bad.sum()))
        b = b.mask(bad)
    return b


def adjusted_index(nav: pd.DataFrame) -> pd.Series:
    """Indice de performance (base 100) : VL corrigée des opérations sur titres et dividendes réinvestis.

    r_t = (VL_t + dividende_t) × coefficient_OST_t / VL_{t−1} − 1

    Règle de validité : un rapport élémentaire non fini, ou un rendement élémentaire ≤ −100 % (rapport ≤ 0),
    rend la chaîne multiplicative non calculable à partir de ce point : l'indice vaut NaN à partir de cette date,
    et les mesures qui en dépendent sont indisponibles (None). Aucune performance valide n'est écrêtée.
    """
    vl = numeric_series(nav["VL_UNITAIRE"])
    div = numeric_series(nav["DIVIDEND_AMOUNT"]).fillna(0.0)  # pas de dividende ce jour-là
    coef = numeric_series(nav["COEFFICIENT_OST"]).fillna(1.0).replace(0, 1.0)  # pas d'opération sur titres
    prev = vl.shift(1).mask(vl.shift(1) == 0.0)  # VL précédente nulle : rapport incalculable (NaN, pas inf)
    ratio = (vl + div) * coef / prev
    ratio.iloc[0] = 1.0
    bad = ~np.isfinite(ratio.to_numpy()) | (ratio.to_numpy() <= 0)
    out = pd.Series(np.nan, index=ratio.index, dtype="float64")
    stop = int(bad.argmax()) if bad.any() else len(ratio)
    if stop < len(ratio):
        log.warning("Indice de performance non calculable à partir de l'observation %d sur %d (rendement invalide ou ≤ −100 %%)",
                    stop + 1, len(ratio))
    if stop:
        with np.errstate(over="ignore"):  # dépassement éventuel traité juste après, localement
            chain = 100 * ratio.iloc[:stop].cumprod()
        fin = np.isfinite(chain.to_numpy())
        if not fin.all():
            cut = int((~fin).argmax())
            log.warning("Indice de performance : dépassement numérique à l'observation %d, chaîne interrompue", cut + 1)
            chain = chain.iloc[:cut]
        out.iloc[: len(chain)] = chain.to_numpy()
    return out


def _value_at(s: pd.Series, d: pd.Timestamp | None) -> float | None:
    if d is None:
        return None
    sub = s[:d].dropna()
    return safe_float(sub.iloc[-1]) if len(sub) else None


def _last_observation(s: pd.Series, d: pd.Timestamp | None) -> float | None:
    """Valeur à la dernière observation ≤ d, sans remonter au-delà d'une interruption de l'indice (NaN → None)."""
    if d is None:
        return None
    sub = s[:d]
    return safe_float(sub.iloc[-1]) if len(sub) else None


def _periods_per_year(idx: pd.DatetimeIndex) -> float:
    if len(idx) < 3:
        return 252.0
    gap = float(np.median(np.diff(idx.values).astype("timedelta64[D]").astype(float)))
    return 52.0 if gap >= 5 else 252.0


def perf_block(m: Model, series: pd.Series, end: pd.Timestamp, first_date: pd.Timestamp, strict: bool = False) -> dict[str, float | None]:
    """Performances par période. `strict` (indice du fonds) : si l'indice est interrompu, pas de valeur de fin."""
    out: dict[str, float | None] = {}
    v1 = _last_observation(series, end) if strict else _value_at(series, end)
    obs = series[:end].dropna()
    last_obs = obs.index[-1] if len(obs) else None
    for p in ["1M", "3M", "YTD", "1A", "3A"]:
        start = m.period_start(end, p)
        if start is None or start < first_date or last_obs is None or last_obs <= start:
            out[p] = None
            continue
        v0 = _value_at(series, start)
        r = return_between(v1, v0)
        if r is not None and p == "3A":
            r = (1 + r) ** (1 / 3) - 1 if 1 + r > 0 else None  # annualisée
        out[p] = finite_or_none(r)
    s0 = series.dropna()
    out["origine"] = return_between(v1, s0.iloc[0]) if len(s0) else None
    return out


def risk_stats(idx: pd.Series, bench: pd.Series | None, end: pd.Timestamp) -> dict[str, float | None]:
    start = end - pd.DateOffset(years=1)
    none = {"vol": None, "mdd": None, "te": None, "bench_vol": None}
    window = numeric_series(idx[start:end])
    if window.isna().any() and window.notna().any() and window.last_valid_index() != window.index[-1]:
        return none  # indice interrompu dans la fenêtre : mesures non calculables sur un an
    s = window.dropna()
    if len(s) < 20:
        return none
    ppy = _periods_per_year(s.index)
    r = s.pct_change(fill_method=None).dropna()
    vol = finite_or_none(r.std() * math.sqrt(ppy))
    mdd = finite_or_none((s / s.cummax() - 1).min())
    te = bvol = None
    if bench is not None:
        b = numeric_series(bench).reindex(s.index).ffill()
        if b.notna().sum() > 20:
            rb = b.pct_change(fill_method=None)
            rb = rb.mask(np.isinf(rb.to_numpy())).dropna()
            common = r.index.intersection(rb.index)
            if len(common) > 20:
                te = finite_or_none((r[common] - rb[common]).std() * math.sqrt(ppy))
                bvol = finite_or_none(rb[common].std() * math.sqrt(ppy))
    return {"vol": vol, "mdd": mdd, "te": te, "bench_vol": bvol}


def share_performance(m: Model, jump_part: str, end: pd.Timestamp) -> dict | None:
    nav = share_nav_frame(m, jump_part)
    nav = nav[:end]
    if len(nav) < 2:
        return None
    idx = adjusted_index(nav)
    bench = benchmark_series(nav)
    has_bench = bench.notna().sum() >= 2
    first = nav.index[0]
    return {
        "first_nav": first.date().isoformat(),
        "nav": _f(nav["VL_UNITAIRE"].iloc[-1]), "nav_date": nav.index[-1].date().isoformat(),
        "nav_ccy": nav["DEVISE_VL"].iloc[-1],
        "bench_name": nav["NOM_BENCH"].dropna().iloc[-1] if nav["NOM_BENCH"].notna().any() else None,
        "fund": perf_block(m, idx, end, first, strict=True),
        "bench": perf_block(m, bench, end, first) if has_bench else None,
        "risk": risk_stats(idx, bench if has_bench else None, end),
        "_index": idx, "_bench": bench if has_bench else None,
        "dividends": [{"d": d.date().isoformat(), "v": v} for d, v in
                      ((d, safe_float(x)) for d, x in numeric_series(nav["DIVIDEND_AMOUNT"]).dropna().items()) if v],
        "calendar": calendar_years(idx, bench if has_bench else None, end),
    }


def calendar_years(idx: pd.Series, bench: pd.Series | None, end: pd.Timestamp) -> list[dict]:
    """Performances par année civile (l'année en cours est « depuis le 1er janvier », la première est partielle)."""
    full = numeric_series(idx[:end])       # indice du fonds : NaN à partir d'une interruption éventuelle
    s = full.dropna()
    if s.empty:
        return []
    out = []
    first = s.index[0]
    for year in range(first.year, end.year + 1):
        prev = s[: pd.Timestamp(year - 1, 12, 31)]
        cur_all = full[: pd.Timestamp(year, 12, 31)]
        if s[: pd.Timestamp(year, 12, 31)].empty:
            continue
        v0 = prev.iloc[-1] if len(prev) else s.iloc[0]
        v1 = cur_all.iloc[-1]                 # dernière observation de l'année (None si l'indice est interrompu)
        rec = {"year": year, "fund": return_between(v1, v0), "partial": (not len(prev)) or year == end.year, "ytd": year == end.year}
        if bench is not None:
            b = numeric_series(bench[:end]).dropna()
            bp, bc = b[: pd.Timestamp(year - 1, 12, 31)], b[: pd.Timestamp(year, 12, 31)]
            if len(bc):
                b0 = bp.iloc[-1] if len(bp) else b.iloc[0]
                rec["bench"] = return_between(bc.iloc[-1], b0)
        out.append(rec)
    return out


# ------------------------------------------------------------------ parts & fonds
def fund_jump_parts(m: Model, fund_id: str) -> list[str]:
    return m.link.index[m.link["fund_id"] == fund_id].tolist()


def main_part(m: Model, fund_id: str, end: pd.Timestamp) -> str | None:
    parts = fund_jump_parts(m, fund_id)
    if not parts:
        return None
    aum = m.share_aum.loc[end, parts].fillna(0)
    for jp in parts:
        sid = m.link.at[jp, "pi_shareid"]
        if isinstance(sid, str) and sid in m.shares.index and L.to_bool(m.shares.at[sid, "Main_Share"]) and aum.get(jp, 0) > 0:
            return jp
    if aum.max() > 0:
        return str(aum.idxmax())
    # Fonds sans encours à date : part la plus récente
    return parts[0]


def fund_summary_rows(m: Model, end: pd.Timestamp) -> pd.DataFrame:
    """Une ligne par fonds avec les indicateurs de liste, à la date `end`."""
    aum_end = m.fund_aum.loc[end]
    rows = []
    starts = {p: m.period_start(end, p) for p in ("1M", "YTD", "1A")}
    for fid, f in m.funds.iterrows():
        a = _f(aum_end.get(fid))
        if fid not in m.fund_aum.columns:
            a = None
        col = m.fund_aum[fid] if fid in m.fund_aum.columns else None
        rec = {
            "id": fid, "name": f["name"], "family": f["family"], "referenced": bool(f["referenced"]), "aum": a,
        }
        if col is not None:
            fc = m.fund_flow_cum[fid]
            for p, s in starts.items():
                v = variation(col, fc, s, end)
                rec[f"var_{p}"] = v["pct"]
                rec[f"delta_{p}"] = v["delta"]
                rec[f"flows_{p}"] = v["flows"]
        for k, c in (("range", "Fund_Range"), ("asset_class", "Asset_Class"), ("expertise", "Management_Expertise_Level_2"),
                     ("manager", "Portfolio_Manager"), ("backup", "Portfolio_Manager_backup_1"), ("sfdr", "ESG_SFDR_Article"),
                     ("sri", "Official_Risk_Scale"), ("domicile", "Domiciliation"), ("legal_form", "Legal_Form"),
                     ("currency", "Accounting_Currency"), ("amf", "ESG_AMF_Category"), ("umbrella", "Umbrella_Name")):
            rec[k] = _clean_str(f.get(c)) if c in f else None
        rec["n_parts"] = len(fund_jump_parts(m, fid))
        rows.append(rec)
    return pd.DataFrame(rows)


def _clean_str(v: Any) -> Any:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    return v


def add_perf(m: Model, df: pd.DataFrame, end: pd.Timestamp) -> pd.DataFrame:
    perf_ytd, perf_1a, vol = [], [], []
    for fid in df["id"]:
        jp = main_part(m, fid, end)
        p = share_performance(m, jp, end) if jp else None
        perf_ytd.append(p["fund"]["YTD"] if p else None)
        perf_1a.append(p["fund"]["1A"] if p else None)
        vol.append(p["risk"]["vol"] if p else None)
    df = df.copy()
    df["perf_YTD"], df["perf_1A"], df["vol_1A"] = perf_ytd, perf_1a, vol
    return df
