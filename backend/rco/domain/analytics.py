"""Calculs métier : variations d'encours, collecte estimée, performances, risques."""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from . import labels as L
from .model import PERIODS, Model


def _f(x: Any) -> float | None:
    if x is None:
        return None
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(x) or math.isinf(x) else x


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
        "delta": delta, "pct": (delta / a0) if a0 else None,
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


def adjusted_index(nav: pd.DataFrame) -> pd.Series:
    """Indice de performance (base 100) : VL corrigée des opérations sur titres et dividendes réinvestis.

    r_t = (VL_t + dividende_t) × coefficient_OST_t / VL_{t−1} − 1
    """
    vl = nav["VL_UNITAIRE"].astype(float)
    div = nav["DIVIDEND_AMOUNT"].astype(float).fillna(0.0)
    coef = nav["COEFFICIENT_OST"].astype(float).fillna(1.0).replace(0, 1.0)
    ratio = (vl + div) * coef / vl.shift(1)
    ratio.iloc[0] = 1.0
    return 100 * ratio.cumprod()


def _value_at(s: pd.Series, d: pd.Timestamp | None) -> float | None:
    if d is None:
        return None
    sub = s[:d].dropna()
    return float(sub.iloc[-1]) if len(sub) else None


def _periods_per_year(idx: pd.DatetimeIndex) -> float:
    if len(idx) < 3:
        return 252.0
    gap = float(np.median(np.diff(idx.values).astype("timedelta64[D]").astype(float)))
    return 52.0 if gap >= 5 else 252.0


def perf_block(m: Model, series: pd.Series, end: pd.Timestamp, first_date: pd.Timestamp) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    v1 = _value_at(series, end)
    obs = series[:end].dropna()
    last_obs = obs.index[-1] if len(obs) else None
    for p in ["1M", "3M", "YTD", "1A", "3A"]:
        start = m.period_start(end, p)
        if start is None or start < first_date or last_obs is None or last_obs <= start:
            out[p] = None
            continue
        v0 = _value_at(series, start)
        if not v0 or v1 is None:
            out[p] = None
            continue
        r = v1 / v0 - 1
        if p == "3A":
            r = (1 + r) ** (1 / 3) - 1  # annualisée
        out[p] = r
    s0 = series.dropna()
    out["origine"] = (v1 / float(s0.iloc[0]) - 1) if len(s0) and v1 else None
    return out


def risk_stats(idx: pd.Series, bench: pd.Series | None, end: pd.Timestamp) -> dict[str, float | None]:
    start = end - pd.DateOffset(years=1)
    s = idx[start:end].dropna()
    if len(s) < 20:
        return {"vol": None, "mdd": None, "te": None, "bench_vol": None}
    ppy = _periods_per_year(s.index)
    r = s.pct_change().dropna()
    vol = float(r.std() * math.sqrt(ppy))
    mdd = float((s / s.cummax() - 1).min())
    te = bvol = None
    if bench is not None:
        b = bench.reindex(s.index).ffill()
        if b.notna().sum() > 20:
            rb = b.pct_change().dropna()
            common = r.index.intersection(rb.index)
            if len(common) > 20:
                te = float((r[common] - rb[common]).std() * math.sqrt(ppy))
                bvol = float(rb[common].std() * math.sqrt(ppy))
    return {"vol": vol, "mdd": mdd, "te": te, "bench_vol": bvol}


def share_performance(m: Model, jump_part: str, end: pd.Timestamp) -> dict | None:
    nav = share_nav_frame(m, jump_part)
    nav = nav[:end]
    if len(nav) < 2:
        return None
    idx = adjusted_index(nav)
    bench = nav["VL_BENCH"].astype(float)
    has_bench = bench.notna().sum() >= 2
    first = nav.index[0]
    return {
        "first_nav": first.date().isoformat(),
        "nav": _f(nav["VL_UNITAIRE"].iloc[-1]), "nav_date": nav.index[-1].date().isoformat(),
        "nav_ccy": nav["DEVISE_VL"].iloc[-1],
        "bench_name": nav["NOM_BENCH"].dropna().iloc[-1] if nav["NOM_BENCH"].notna().any() else None,
        "fund": perf_block(m, idx, end, first),
        "bench": perf_block(m, bench, end, first) if has_bench else None,
        "risk": risk_stats(idx, bench if has_bench else None, end),
        "_index": idx, "_bench": bench if has_bench else None,
        "dividends": [{"d": d.date().isoformat(), "v": float(v)} for d, v in nav["DIVIDEND_AMOUNT"].dropna().items() if v],
        "calendar": calendar_years(idx, bench if has_bench else None, end),
    }


def calendar_years(idx: pd.Series, bench: pd.Series | None, end: pd.Timestamp) -> list[dict]:
    """Performances par année civile (l'année en cours est « depuis le 1er janvier », la première est partielle)."""
    s = idx[:end].dropna()
    if s.empty:
        return []
    out = []
    first = s.index[0]
    for year in range(first.year, end.year + 1):
        prev = s[: pd.Timestamp(year - 1, 12, 31)]
        cur = s[: pd.Timestamp(year, 12, 31)]
        if cur.empty:
            continue
        v0 = float(prev.iloc[-1]) if len(prev) else float(s.iloc[0])
        v1 = float(cur.iloc[-1])
        rec = {"year": year, "fund": v1 / v0 - 1, "partial": (not len(prev)) or year == end.year, "ytd": year == end.year}
        if bench is not None:
            b = bench[:end].dropna()
            bp, bc = b[: pd.Timestamp(year - 1, 12, 31)], b[: pd.Timestamp(year, 12, 31)]
            if len(bc):
                b0 = float(bp.iloc[-1]) if len(bp) else float(b.iloc[0])
                rec["bench"] = float(bc.iloc[-1]) / b0 - 1 if b0 else None
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
