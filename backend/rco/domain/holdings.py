"""Inventaires : composition des fonds, lignes transverses, mouvements."""
from __future__ import annotations

import pandas as pd

from .model import Model

CASH_CLASSES = {"liquidites", "liquidités", "cash"}


def _prepared(m: Model) -> pd.DataFrame:
    h = getattr(m, "_holdings_prepared", None)
    if h is not None:
        return h
    h = m.holdings.copy()
    if h.empty:
        m._holdings_prepared = h
        return h
    h["DATE_INVENTAIRE"] = pd.to_datetime(h["DATE_INVENTAIRE"])
    # Rattachement au fonds : ID_PI_FONDS = pi_productid, sinon via l'identifiant JUMP du fonds
    jump_to_fund = m.link.drop_duplicates("ID_JUMP_FONDS").set_index("ID_JUMP_FONDS")["fund_id"]
    fid = h["ID_PI_FONDS"].where(h["ID_PI_FONDS"].isin(m.funds.index))
    h["fund_id"] = fid.fillna(h["ID_JUMP_FONDS"].map(jump_to_fund))
    # Montant en euros : taux devise du fonds → EUR déduit de JUMP (actif net EUR / actif net devise fonds)
    a = m.aum_raw.drop_duplicates(["ID_JUMP_FONDS", "DATE_VL"])[["ID_JUMP_FONDS", "DATE_VL", "ACTIF_NET_TOTAL_EURO", "ACTIF_NET_TOTAL_DEVISE_FONDS"]]
    a = a.assign(fx=a["ACTIF_NET_TOTAL_EURO"] / a["ACTIF_NET_TOTAL_DEVISE_FONDS"]).dropna(subset=["fx"]).sort_values("DATE_VL")
    h = h.sort_values("DATE_INVENTAIRE")
    h = pd.merge_asof(h, a[["ID_JUMP_FONDS", "DATE_VL", "fx"]], left_on="DATE_INVENTAIRE", right_on="DATE_VL",
                      by="ID_JUMP_FONDS", direction="backward")
    h["fx"] = h["fx"].fillna(1.0)
    h["amount_eur"] = h["MONTANT_DEVISE_FONDS"].astype(float) * h["fx"]
    h["expo_eur"] = h["EXPOSITION_DEVISE_FONDS"].astype(float) * h["fx"]
    h["instr_key"] = h["ID_JUMP_INSTRUMENT"].fillna(h["CODE_ISIN_INSTRUMENT"]).fillna(h["NOM_INSTRUMENT"])
    h["weight"] = h["POIDS_LIGNE_EXPO"].astype(float)
    m._holdings_prepared = h
    return h


def latest_inventory(m: Model, end: pd.Timestamp, fund_id: str | None = None) -> pd.DataFrame:
    """Dernier inventaire de chaque fonds antérieur ou égal à `end`."""
    h = _prepared(m)
    if h.empty:
        return h
    h = h[h["DATE_INVENTAIRE"] <= end]
    if fund_id is not None:
        h = h[h["fund_id"] == fund_id]
    last = h.groupby("fund_id")["DATE_INVENTAIRE"].transform("max")
    return h[h["DATE_INVENTAIRE"] == last]


def previous_inventory(m: Model, fund_id: str, current: pd.Timestamp) -> pd.DataFrame:
    h = _prepared(m)
    h = h[(h["fund_id"] == fund_id) & (h["DATE_INVENTAIRE"] < current)]
    if h.empty:
        return h
    return h[h["DATE_INVENTAIRE"] == h["DATE_INVENTAIRE"].max()]


def _breakdown(inv: pd.DataFrame, col: str) -> list[dict]:
    g = inv.groupby(inv[col].fillna("Non renseigné"))["weight"].sum().sort_values(ascending=False)
    return [{"label": k, "weight": float(v)} for k, v in g.items()]


def fund_composition(m: Model, fund_id: str, end: pd.Timestamp) -> dict | None:
    inv = latest_inventory(m, end, fund_id)
    if inv.empty:
        return None
    d = inv["DATE_INVENTAIRE"].iloc[0]
    is_cash = inv["CLASSE_ACTIF"].fillna("").str.lower().isin(CASH_CLASSES)
    is_deriv = inv["TYPE_HOLDING"].fillna("").str.lower().str.startswith("d") & ~is_cash
    titles = inv[~is_cash & ~is_deriv].sort_values("weight", ascending=False)
    lines = [{
        "key": r["instr_key"], "name": r["NOM_INSTRUMENT"], "isin": r["CODE_ISIN_INSTRUMENT"], "ccy": r["DEVISE_INSTRUMENT"],
        "asset_class": r["CLASSE_ACTIF"], "type": r["CODE_TYPE_INSTRUMENT"], "debt": r["TYPE_DETTE"],
        "weight": float(r["weight"]), "amount_eur": float(r["amount_eur"]) if pd.notna(r["amount_eur"]) else None,
    } for _, r in titles.iterrows()]
    prev = previous_inventory(m, fund_id, d)
    if not prev.empty:
        prev_w = prev.groupby("instr_key")["weight"].sum()
        for l in lines:
            pw_ = prev_w.get(l["key"])
            l["prev_weight"] = None if pw_ is None or pd.isna(pw_) else float(pw_)
            l["is_new"] = pw_ is None or pd.isna(pw_)
    moves = []
    if not prev.empty:
        pw = prev.groupby("instr_key")["weight"].sum()
        cw = titles.groupby("instr_key")["weight"].sum()
        names = pd.concat([prev, titles]).drop_duplicates("instr_key").set_index("instr_key")["NOM_INSTRUMENT"]
        for k in cw.index.difference(pw.index):
            moves.append({"key": k, "name": names.get(k), "kind": "entrée", "weight": float(cw[k]), "change": float(cw[k])})
        for k in pw.index.difference(cw.index):
            if str(k).startswith("CASH"):
                continue
            moves.append({"key": k, "name": names.get(k), "kind": "sortie", "weight": 0.0, "change": -float(pw[k])})
        both = cw.index.intersection(pw.index)
        chg = (cw[both] - pw[both]).sort_values(key=abs, ascending=False).head(6)
        for k, v in chg.items():
            if abs(v) >= .25:
                moves.append({"key": k, "name": names.get(k), "kind": "renforcement" if v > 0 else "allègement", "weight": float(cw[k]), "change": float(v)})
    top10 = sum(l["weight"] for l in lines[:10])
    hhi = float(((titles["weight"] / 100) ** 2).sum())
    return {
        "date": d.date().isoformat(), "n_lines": len(lines), "lines": lines,
        "top10_weight": top10, "hhi": hhi,
        "cash_weight": float(inv.loc[is_cash, "weight"].sum()),
        "derivatives_expo": float(inv.loc[is_deriv, "weight"].sum()) if is_deriv.any() else 0.0,
        "by_class": _breakdown(inv, "CLASSE_ACTIF"), "by_ccy": _breakdown(inv, "DEVISE_INSTRUMENT"),
        "by_debt": _breakdown(inv[inv["TYPE_DETTE"].notna()], "TYPE_DETTE") if inv["TYPE_DETTE"].notna().any() else [],
        "previous_date": prev["DATE_INVENTAIRE"].iloc[0].date().isoformat() if not prev.empty else None,
        "moves": moves,
    }


def house_holdings(m: Model, end: pd.Timestamp, limit: int = 60) -> dict:
    inv = latest_inventory(m, end)
    if inv.empty:
        return {"instruments": [], "by_class": [], "by_ccy": [], "n_funds": 0}
    titles = inv[~inv["CLASSE_ACTIF"].fillna("").str.lower().isin(CASH_CLASSES) & ~inv["TYPE_HOLDING"].fillna("").str.lower().str.startswith("d")]
    g = titles.groupby("instr_key").agg(name=("NOM_INSTRUMENT", "first"), isin=("CODE_ISIN_INSTRUMENT", "first"),
                                        asset_class=("CLASSE_ACTIF", "first"), ccy=("DEVISE_INSTRUMENT", "first"),
                                        amount_eur=("amount_eur", "sum"), n_funds=("fund_id", "nunique"))
    g = g.sort_values("amount_eur", ascending=False)
    total = float(inv["amount_eur"].sum())
    by_class = inv.groupby(inv["CLASSE_ACTIF"].fillna("Non renseigné"))["amount_eur"].sum().sort_values(ascending=False)
    by_ccy = inv.groupby(inv["DEVISE_INSTRUMENT"].fillna("Non renseigné"))["amount_eur"].sum().sort_values(ascending=False)
    return {
        "total_eur": total, "n_funds": int(inv["fund_id"].nunique()), "n_instruments": int(len(g)),
        "dates": sorted({d.date().isoformat() for d in inv["DATE_INVENTAIRE"]})[-1:],
        "instruments": [{"key": k, **{kk: (None if pd.isna(vv) else vv) for kk, vv in r.items()}} for k, r in g.head(limit).iterrows()],
        "most_shared": [{"key": k, "name": r["name"], "n_funds": int(r["n_funds"]), "amount_eur": float(r["amount_eur"])}
                        for k, r in g.sort_values(["n_funds", "amount_eur"], ascending=False).head(12).iterrows()],
        "by_class": [{"label": k, "amount_eur": float(v), "weight": float(v / total * 100) if total else None} for k, v in by_class.items() if abs(v) >= 1],
        "by_ccy": [{"label": k, "amount_eur": float(v), "weight": float(v / total * 100) if total else None} for k, v in by_ccy.items()],
    }


def instrument_detail(m: Model, key: str, end: pd.Timestamp) -> dict | None:
    inv = latest_inventory(m, end)
    rows = inv[inv["instr_key"] == key]
    if rows.empty:
        return None
    r0 = rows.iloc[0]
    funds = []
    for _, r in rows.sort_values("amount_eur", ascending=False).iterrows():
        f = m.funds.loc[r["fund_id"]] if r["fund_id"] in m.funds.index else None
        funds.append({"fund_id": r["fund_id"], "name": f["name"] if f is not None else r["NOM_FONDS"],
                      "family": f["family"] if f is not None else "nc", "weight": float(r["weight"]),
                      "amount_eur": float(r["amount_eur"]), "date": r["DATE_INVENTAIRE"].date().isoformat()})
    return {"key": key, "name": r0["NOM_INSTRUMENT"], "isin": r0["CODE_ISIN_INSTRUMENT"], "ccy": r0["DEVISE_INSTRUMENT"],
            "asset_class": r0["CLASSE_ACTIF"], "type": r0["CODE_TYPE_INSTRUMENT"], "debt": r0["TYPE_DETTE"],
            "bloomberg": r0["CODE_BLOOMBERG"], "total_eur": float(rows["amount_eur"].sum()), "funds": funds}


def instruments_for_search(m: Model, end: pd.Timestamp) -> pd.DataFrame:
    inv = latest_inventory(m, end)
    if inv.empty:
        return inv
    inv = inv[~inv["CLASSE_ACTIF"].fillna("").str.lower().isin(CASH_CLASSES)]
    return inv.groupby("instr_key").agg(name=("NOM_INSTRUMENT", "first"), isin=("CODE_ISIN_INSTRUMENT", "first"),
                                        n_funds=("fund_id", "nunique"), amount_eur=("amount_eur", "sum")).reset_index()
