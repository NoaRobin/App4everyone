"""Revenus de gestion estimés : ce que chaque fonds rapporte à la société de gestion.

Revenu annuel estimé d'une part = encours EUR × taux de frais de gestion financière de la part. Taux, dans cet
ordre (le premier renseigné et positif) : frais de gestion financière réels de la part, frais maximum de la part,
frais de gestion réels du fonds, frais maximum du fonds. Une part sans aucun taux n'est pas valorisée (jamais de
taux inventé) : sa part d'encours est comptée à part (« encours sans taux »).

Les taux sont lus en pourcentage (1,5 = 1,5 %) ; une colonne entièrement exprimée en fraction (0,015) est détectée
et convertie. Estimation brute : avant rétrocessions aux distributeurs, commissions de surperformance et frais
administratifs. Une estimation « nette des rétrocessions standard » est donnée lorsque ce taux est renseigné.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .model import Model, memo
from .numeric import numeric_series

SHARE_RATES = ("Actual_Financial_Management_Fees", "Max_Financial_Management_Fees")
FUND_RATES = ("Actual_Management_Fees_PerCent", "Max_management_fee_PerCent")
RATE_LABEL = {"Actual_Financial_Management_Fees": "frais réels de la part", "Max_Financial_Management_Fees": "frais maximum de la part",
              "Actual_Management_Fees_PerCent": "frais réels du fonds", "Max_management_fee_PerCent": "frais maximum du fonds"}


def _percent(s: pd.Series) -> pd.Series:
    """Taux en pourcentage ; une colonne dont toutes les valeurs positives sont < 0,1 est une fraction (× 100)."""
    v = numeric_series(s).astype(float)
    pos = v[v > 0]
    if len(pos) >= 3 and float(pos.quantile(0.95)) < 0.1:
        v = v * 100
    return v.where((v > 0) & (v <= 10))                     # au-delà de 10 % : valeur aberrante, non retenue


def part_rates(m: Model) -> pd.DataFrame:
    """Une ligne par part JUMP : taux annuel (%) retenu, sa source, taux de rétrocession standard (% des frais)."""
    key = "revenue_rates"
    if key in memo(m):
        return memo(m)[key]
    lk = m.link
    out = pd.DataFrame(index=lk.index)
    out["rate"] = np.nan
    out["source"] = None
    sh = m.shares
    sid = lk["pi_shareid"]
    for col in SHARE_RATES:
        if col in sh:
            r = sid.map(_percent(sh[col]))
            hit = out["rate"].isna() & r.notna()
            out.loc[hit, "rate"], out.loc[hit, "source"] = r[hit], col
    fid = lk["fund_id"]
    for col in FUND_RATES:
        if col in m.products:
            r = fid.map(_percent(m.products[col]))
            hit = out["rate"].isna() & r.notna()
            out.loc[hit, "rate"], out.loc[hit, "source"] = r[hit], col
    retro = pd.Series(np.nan, index=lk.index)
    if "Standard_Trailer_Fees_Holdings" in sh:
        t = numeric_series(sh["Standard_Trailer_Fees_Holdings"]).astype(float)
        retro = sid.map(t.where((t > 1) & (t <= 100)))       # pourcentage des frais rétrocédé ; ambigu sinon
    out["retro"] = retro
    memo(m)[key] = out
    return out


def accrued(m: Model, rate: pd.Series, start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
    """Revenus courus entre deux dates par part : Σ encours_t × taux × (jours jusqu'à la date suivante) / 365."""
    a = m.share_aum.loc[start:end]
    if a.empty:
        return pd.Series(0.0, index=m.share_aum.columns)
    days = np.diff(a.index.to_numpy().astype("datetime64[D]").astype(np.int64), append=0).astype(float)
    days[-1] = 1.0
    r = rate.reindex(a.columns).to_numpy(dtype=float) / 100.0
    v = np.nansum(a.to_numpy(dtype=float) * days[:, None], axis=0) * r / 365.0
    return pd.Series(v, index=a.columns)


def revenue_view(m: Model, end: pd.Timestamp, labels: dict[str, str]) -> dict:
    """Revenus estimés à `end` : total, couverture, par fonds, par famille, gamme et classe d'actifs, tendance,
    concentration, et ce qui a fait varier les revenus sur un an (collecte ou marché)."""
    rates = part_rates(m)
    aum = m.share_aum.loc[end]
    lk = m.link
    df = pd.DataFrame({"fund_id": lk["fund_id"], "aum": aum.reindex(lk.index), "rate": rates["rate"], "retro": rates["retro"],
                       "source": rates["source"]})
    df = df[df["aum"].fillna(0) > 0]
    df["rev"] = df["aum"] * df["rate"] / 100.0
    df["net"] = df["rev"] * (1 - df["retro"].fillna(0) / 100.0)
    total_aum = float(df["aum"].sum())
    rated = df["rate"].notna()
    start = m.period_start(end, "1A")
    acc12 = accrued(m, rates["rate"], start, end) if start is not None else None

    # Variation du revenu annualisé sur un an : collecte × taux (effet collecte) et le reste (effet marché)
    def year_effect() -> pd.DataFrame:
        if start is None:
            return pd.DataFrame(columns=["fund_id", "d_rev", "flow_rev"])
        a0 = m.share_aum.loc[start].reindex(lk.index)
        fl = (m.share_flow_cum.loc[end] - m.share_flow_cum.loc[start]).reindex(lk.index)
        r = rates["rate"] / 100.0
        return pd.DataFrame({"fund_id": lk["fund_id"], "d_rev": (aum.reindex(lk.index).fillna(0) - a0.fillna(0)) * r, "flow_rev": fl * r})
    eff = year_effect().dropna(subset=["d_rev"]).groupby("fund_id")[["d_rev", "flow_rev"]].sum()

    f = m.funds
    by = df.groupby("fund_id").agg(aum=("aum", "sum"), rev=("rev", "sum"), net=("net", "sum"),
                                   rated_aum=("aum", lambda s: float(s[df.loc[s.index, "rate"].notna()].sum())))
    by = by[by["rev"] > 0]
    by["rate"] = by["rev"] / by["rated_aum"] * 100
    if acc12 is not None:
        by["rev_12m"] = acc12.reindex(lk.index).groupby(lk["fund_id"]).sum().reindex(by.index)
    by = by.join(eff, how="left")
    total_rev = float(by["rev"].sum())
    by = by.sort_values("rev", ascending=False)

    def attr(fid, col):
        v = f.at[fid, col] if (fid in f.index and col in f.columns) else None
        return v if isinstance(v, str) and v.strip() else None
    funds = []
    for fid, r in by.iterrows():
        funds.append({"id": fid, "name": str(f.at[fid, "name"]) if fid in f.index else fid,
                      "family": f.at[fid, "family"] if fid in f.index else "nc", "range": attr(fid, "Fund_Range"),
                      "asset_class": attr(fid, "Asset_Class"), "aum": float(r["aum"]), "rate": float(r["rate"]),
                      "revenue": float(r["rev"]), "revenue_net": float(r["net"]),
                      "revenue_12m": None if pd.isna(r.get("rev_12m")) else float(r["rev_12m"]),
                      "d_revenue_1y": None if pd.isna(r.get("d_rev")) else float(r["d_rev"]),
                      "flow_effect_1y": None if pd.isna(r.get("flow_rev")) else float(r["flow_rev"]),
                      "share": float(r["rev"] / total_rev) if total_rev else None})

    def group(key: str, label=lambda k: k) -> list[dict]:
        g: dict[str, dict] = {}
        for x in funds:
            k = x.get(key) or "Non renseigné"
            e = g.setdefault(k, {"key": k, "label": label(k), "revenue": 0.0, "aum": 0.0, "n": 0})
            e["revenue"] += x["revenue"]; e["aum"] += x["aum"]; e["n"] += 1
        out = sorted(g.values(), key=lambda e: -e["revenue"])
        for e in out:
            e["rate"] = e["revenue"] / e["aum"] * 100 if e["aum"] else None
            e["share"] = e["revenue"] / total_rev if total_rev else None
        return out

    # Revenu annualisé mois par mois (encours de fin de mois × taux actuel de chaque part)
    s_aum = m.share_aum.loc[:end]
    month_end = s_aum.groupby([s_aum.index.year, s_aum.index.month]).tail(1)
    r = rates["rate"].reindex(s_aum.columns).fillna(0).to_numpy() / 100.0
    trend = [{"d": d.date().isoformat(), "v": float(np.nansum(row * r))} for d, row in zip(month_end.index, month_end.to_numpy(dtype=float))][-37:]
    cum = np.cumsum([x["revenue"] for x in funds]) / total_rev if total_rev else np.array([])
    top10 = float(cum[min(9, len(cum) - 1)]) if len(cum) else None
    n80 = int(np.searchsorted(cum, 0.8) + 1) if len(cum) else None
    d1y = float(eff["d_rev"].sum()) if len(eff) else None
    fl1y = float(eff["flow_rev"].sum()) if len(eff) else None
    sources = {k: int(v) for k, v in df.loc[rated, "source"].map(RATE_LABEL).value_counts().items()}
    return {
        "date": end.date().isoformat(), "total": total_rev, "total_net": float(by["net"].sum()),
        "total_12m": float(by["rev_12m"].sum()) if "rev_12m" in by else None,
        "rate": total_rev / float(df.loc[rated, "aum"].sum()) * 100 if rated.any() else None,
        "coverage": float(df.loc[rated, "aum"].sum() / total_aum) if total_aum else None,
        "aum_without_rate": float(df.loc[~rated, "aum"].sum()), "rate_sources": sources,
        "concentration": {"top10_share": top10, "n_for_80pct": n80, "n_funds": len(funds)},
        "change_1y": {"total": d1y, "flows": fl1y, "market": (d1y - fl1y) if d1y is not None and fl1y is not None else None},
        "funds": funds, "families": group("family", lambda k: labels.get(k, k)), "ranges": group("range"),
        "asset_classes": group("asset_class"), "trend": trend,
    }
