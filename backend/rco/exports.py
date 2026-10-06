"""Extractions « une ligne par enregistrement » pour l'onglet Export (à retravailler dans Excel, avec Copilot).

Chaque extraction renvoie un tableau en colonnes : {"columns": [...], "rows": [[...], ...], "grain": "…", "n": N}.
Les valeurs sont celles du modèle (lecture seule) : rien n'est inventé, une valeur absente reste vide.
Au-delà de MAX_ROWS lignes, l'extraction est refusée avec le nombre de lignes qu'elle aurait produit, pour inviter à
choisir un pas de temps plus large, une période plus courte ou moins d'entités.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from .domain import analytics as A
from .domain import holdings as H
from .domain import labels as L

MAX_ROWS = 250_000
LEVELS = ("maison", "famille", "gamme", "classe", "fonds", "part")


def _v(x: Any) -> Any:
    """Valeur JSON propre : NaN/inf → None, numpy → Python, dates → ISO."""
    if x is None:
        return None
    if isinstance(x, (float, np.floating)):
        return None if not math.isfinite(float(x)) else round(float(x), 6)
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.bool_,)):
        return bool(x)
    if isinstance(x, pd.Timestamp):
        return None if pd.isna(x) else x.date().isoformat()
    if x is pd.NaT:
        return None
    if isinstance(x, str):
        s = x.strip()
        return s or None
    try:
        if pd.isna(x):
            return None
    except (TypeError, ValueError):
        pass
    return x


def _table(columns: list[str], rows: list[list], grain: str, **meta) -> dict:
    return {"columns": columns, "rows": [[_v(c) for c in r] for r in rows], "n": len(rows), "grain": grain, **meta}


def _too_many(n: int, grain: str) -> dict:
    return {"columns": [], "rows": [], "n": 0, "grain": grain, "too_many": int(n), "limit": MAX_ROWS}


def _parse(d: str | None) -> pd.Timestamp | None:
    if not d:
        return None
    try:
        return pd.Timestamp(d[:10])
    except (ValueError, TypeError):
        raise ValueError(f"Date invalide : {d}") from None


def _str(v: Any) -> str | None:
    v = _v(v)
    return v if isinstance(v, str) else (None if v is None else str(v))


# ------------------------------------------------------------------ encours par période et par entité
def encours(svc, d: str | None, level: str = "fonds", freq: str = "M", start: str | None = None, end: str | None = None,
            funds: list[str] | None = None, families: list[str] | None = None) -> dict:
    """Encours en fin de période, variation, collecte nette estimée et effet marché, pour chaque entité du niveau choisi.

    Même calcul que la courbe de l'onglet Encours (analytics.period_points), appliqué colonne par colonne : chaque point est
    la dernière date disponible de la période ; la collecte est l'écart de collecte cumulée entre deux points.
    """
    if level not in LEVELS:
        raise ValueError(f"Niveau inconnu : {level}")
    if freq not in A.FREQS:
        raise ValueError(f"Pas de temps inconnu : {freq}")
    m = svc.m
    last_d = svc.end(end) if end else svc.end(d)
    first_d = _parse(start)
    grain = {"maison": "une ligne par date", "famille": "une ligne par famille et par date", "gamme": "une ligne par gamme et par date",
             "classe": "une ligne par classe d'actifs et par date", "fonds": "une ligne par fonds et par date",
             "part": "une ligne par part et par date"}[level]
    funds_df = m.funds
    fam = funds_df["family"] if "family" in funds_df else pd.Series("nc", index=funds_df.index)
    cols = list(m.fund_aum.columns)
    if families:
        cols = [c for c in cols if fam.get(c, "nc") in set(families)]
    if funds:
        cols = [c for c in cols if c in set(funds)]

    def ref(fid: str, col: str) -> str | None:
        return _str(funds_df.at[fid, col]) if fid in funds_df.index and col in funds_df.columns else None

    if level == "part":
        lk = m.link.set_index("ID_JUMP_PART") if "ID_JUMP_PART" in m.link else m.link
        parts = [jp for jp in m.share_aum.columns if lk["fund_id"].get(jp) in set(cols)]
        aum, fc = m.share_aum[parts], m.share_flow_cum[parts]
        names = svc._share_refs()
        keys = []
        for jp in parts:
            fid = lk["fund_id"].get(jp)
            sid = lk["pi_shareid"].get(jp)
            r = names.get(sid, {}) if isinstance(sid, str) else {}
            keys.append([jp, _str(r.get("Share_Name")) or _str(lk["NOM_PART"].get(jp)), _str(r.get("ISIN_Code")) or _str(lk["CODE_ISIN_PART"].get(jp)),
                         _str(r.get("Subscription_Currency")), fid, ref(fid, "name"), svc._family_label(fam.get(fid, "nc"))])
        key_cols = ["id_part", "part", "isin", "devise_part", "id_fonds", "fonds", "famille"]
    elif level == "fonds":
        aum, fc = m.fund_aum[cols], m.fund_flow_cum[cols]
        keys = [[c, ref(c, "name"), svc._family_label(fam.get(c, "nc")), ref(c, "Fund_Range"), ref(c, "Asset_Class"), ref(c, "Domiciliation")] for c in cols]
        key_cols = ["id_fonds", "fonds", "famille", "gamme", "classe_actifs", "domicile"]
    elif level == "maison":
        aum = m.fund_aum[cols].sum(axis=1, min_count=1).to_frame("Maison")
        fc = m.fund_flow_cum[cols].sum(axis=1).to_frame("Maison")
        keys, key_cols = [["Toute la maison"]], ["perimetre"]
    else:
        src = {"famille": fam.map(svc._family_label), "gamme": funds_df.get("Fund_Range"), "classe": funds_df.get("Asset_Class")}[level]
        g = (src.reindex(cols) if src is not None else pd.Series(None, index=cols, dtype=object)).map(lambda v: _str(v) or "Non renseigné")
        aum = m.fund_aum[cols].T.groupby(g).sum(min_count=1).T
        fc = m.fund_flow_cum[cols].T.groupby(g).sum().T
        keys = [[k] for k in aum.columns]
        key_cols = [{"famille": "famille", "gamme": "gamme", "classe": "classe_actifs"}[level]]

    idx = m.dates[m.dates <= last_d]
    code = A.FREQS[freq]
    if len(idx) == 0 or aum.shape[1] == 0:
        return _table(["date", "debut_periode", *key_cols, "encours", "variation", "variation_pct", "collecte_estimee", "effet_marche"], [], grain)
    if code is None:
        last, p0 = idx, idx
    else:
        per = idx.to_period(code)
        pos = pd.Series(np.arange(len(idx)), index=idx).groupby(per.asi8).last().to_numpy()
        last, p0 = idx[pos], per[pos].start_time
    a = aum.reindex(last).to_numpy(dtype=float)
    f = fc.sort_index().ffill().reindex(last, method="ffill").fillna(0.0).to_numpy(dtype=float)
    delta = np.vstack([np.full((1, a.shape[1]), np.nan), np.diff(a, axis=0)])
    flows = np.vstack([np.full((1, a.shape[1]), np.nan), np.diff(f, axis=0)])
    prev = np.vstack([np.full((1, a.shape[1]), np.nan), a[:-1]])
    with np.errstate(divide="ignore", invalid="ignore"):
        pct = np.where(prev > 0, delta / prev, np.nan)
    market = delta - flows
    flows = np.where(np.isnan(delta), np.nan, flows)
    # Collecte JUMP neutralisée : ni collecte ni effet marché pour les fonds ou parts concernés
    fo = getattr(m, "flows_off", None) or {}
    off = set(fo.get("parts", [])) if level == "part" else set(fo.get("funds", [])) if level == "fonds" else set()
    if off:
        idx_off = [j for j, c in enumerate(aum.columns) if c in off]
        flows[:, idx_off] = np.nan
        market[:, idx_off] = np.nan
    keep_t = np.ones(len(last), dtype=bool) if first_d is None else (last >= first_d)
    ti = np.flatnonzero(keep_t)
    present = ~np.isnan(a[ti])
    n = int(present.sum())
    if n > MAX_ROWS:
        return _too_many(n, grain)
    rows = []
    dl = [x.date().isoformat() for x in last]
    pl = [pd.Timestamp(x).date().isoformat() for x in p0]
    for t in ti:
        for j in np.flatnonzero(~np.isnan(a[t])):
            rows.append([dl[t], pl[t], *keys[j], a[t, j], delta[t, j], pct[t, j], flows[t, j], market[t, j]])
    return _table(["date", "debut_periode", *key_cols, "encours", "variation", "variation_pct", "collecte_estimee", "effet_marche"], rows, grain,
                  start=dl[ti[0]] if len(ti) else None, end=dl[ti[-1]] if len(ti) else None, level=level, freq=freq)


# ------------------------------------------------------------------ parts
def parts(svc, d: str | None) -> dict:
    """Une ligne par part (JUMP, et parts du référentiel sans VL), avec le fonds et l'encours à la date."""
    m, end = svc.m, svc.end(d)
    fam = m.funds["family"] if "family" in m.funds else pd.Series("nc", index=m.funds.index)
    cols = ["id_part", "id_jump", "part", "isin", "classe_part", "devise", "couverte", "affectation", "souscripteurs", "souscription_min",
            "frais_courants", "frais_gestion_max", "commission_surperformance", "cut_off", "reglement", "notation_morningstar", "part_principale",
            "statut", "encours", "collecte_ytd", "vl", "date_vl", "id_fonds", "fonds", "famille", "gamme", "classe_actifs", "domicile", "rattachement"]
    rows = []
    for fid in m.funds.index:
        briefs = [svc._share_brief(jp, end) for jp in A.fund_jump_parts(m, fid)]
        known = {b["id"] for b in briefs}
        if "ProductID" in m.shares:
            for sid in m.shares.index[m.shares["ProductID"] == fid]:
                if sid not in known:
                    briefs.append(svc._share_brief_ref(sid))
        f = m.funds.loc[fid]
        for b in sorted(briefs, key=lambda x: -(x.get("aum") or 0)):
            rows.append([b["id"], b.get("jump"), b.get("name"), b.get("isin"), b.get("class"), b.get("ccy"), b.get("hedged"), b.get("distribution"),
                         b.get("investor"), b.get("min_sub"), b.get("ongoing"), b.get("mgmt_fee"), b.get("perf_fee"), b.get("cutoff"), b.get("settlement"),
                         b.get("rating"), b.get("main"), b.get("status"), b.get("aum"), b.get("flows_YTD"), b.get("nav"), b.get("nav_date"),
                         fid, _str(f.get("name")), svc._family_label(fam.get(fid, "nc")), _str(f.get("Fund_Range")), _str(f.get("Asset_Class")),
                         _str(f.get("Domiciliation")), {"id": "identifiant", "isin": "ISIN", "ref": "référentiel seul"}.get(b.get("link"), b.get("link"))])
    return _table(cols, rows, "une ligne par part", date=end.date().isoformat())


# ------------------------------------------------------------------ autorisations de commercialisation
def enregistrements(svc, d: str | None, actifs: bool = True, exclude_rmm: bool = False) -> dict:
    """Une ligne par part et par pays d'enregistrement : statut, date, FINMA, commentaire, client de la part."""
    m, end = svc.m, svc.end(d)
    regs = svc._registrations
    if actifs:
        regs = regs[regs["active"]]
    if exclude_rmm:
        regs = regs[~regs["fund_id"].isin(svc.rmm)]
    label, kind = svc._client_kind()
    share_aum = svc._share_aum_by_ref(end)
    fam = m.funds["family"] if "family" in m.funds else pd.Series("nc", index=m.funds.index)
    sh = m.shares
    cols = ["pays", "code_pays", "actif", "date_enregistrement", "autorisation_finma", "commentaire", "id_part", "part", "isin", "devise_part",
            "clientele", "nature_clientele", "encours_part", "id_fonds", "fonds", "famille", "fonds_rmm"]
    rows = []
    for r in regs.itertuples(index=False):
        sid, fid = getattr(r, "pi_shareid"), getattr(r, "fund_id")
        s = sh.loc[sid] if isinstance(sid, str) and sid in sh.index else None
        rows.append([r.country_fr, r.iso, bool(r.active), _str(getattr(r, "Registration_Date", None)), L.to_bool(getattr(r, "FINMA_Autorization", None)),
                     _str(getattr(r, "Comment", None)), sid, _str(s["Share_Name"]) if s is not None and "Share_Name" in sh else None,
                     _str(s["ISIN_Code"]) if s is not None and "ISIN_Code" in sh else None,
                     _str(s["Subscription_Currency"]) if s is not None and "Subscription_Currency" in sh else None,
                     label.get(sid) if isinstance(sid, str) else None, kind.get(sid) if isinstance(sid, str) else None,
                     share_aum.get(sid), fid if fid in m.funds.index else None,
                     _str(m.funds.at[fid, "name"]) if fid in m.funds.index else None,
                     svc._family_label(fam.get(fid, "nc")) if fid in m.funds.index else None, fid in svc.rmm])
    rows.sort(key=lambda x: (x[0] or "", x[14] or "", x[7] or ""))
    return _table(cols, rows, "une ligne par part et par pays", date=end.date().isoformat())


# ------------------------------------------------------------------ lignes d'inventaire
def inventaires(svc, d: str | None, funds: list[str] | None = None) -> dict:
    """Dernier inventaire de chaque fonds (≤ date) : une ligne par fonds et par instrument."""
    m, end = svc.m, svc.end(d)
    inv = H.latest_inventory(m, end)
    cols = ["id_fonds", "fonds", "famille", "date_inventaire", "instrument", "isin_instrument", "code_bloomberg", "type_instrument",
            "classe_actifs", "devise_instrument", "type_detention", "type_dette", "devise_fonds", "montant_devise_fonds", "montant_eur",
            "exposition_eur", "poids"]
    if inv is None or inv.empty:
        return _table(cols, [], "une ligne par fonds et par instrument")
    if funds:
        inv = inv[inv["fund_id"].isin(set(funds))]
    if len(inv) > MAX_ROWS:
        return _too_many(len(inv), "une ligne par fonds et par instrument")
    fam = m.funds["family"] if "family" in m.funds else pd.Series("nc", index=m.funds.index)
    names = m.funds["name"] if "name" in m.funds else pd.Series(dtype=object)

    def col(c: str) -> pd.Series:
        return inv[c] if c in inv else pd.Series(None, index=inv.index, dtype=object)
    df = pd.DataFrame({
        "id_fonds": inv["fund_id"], "fonds": inv["fund_id"].map(names).fillna(col("NOM_FONDS")),
        "famille": inv["fund_id"].map(lambda f: svc._family_label(fam.get(f, "nc")) if isinstance(f, str) else None),
        "date_inventaire": col("DATE_INVENTAIRE"), "instrument": col("NOM_INSTRUMENT"), "isin_instrument": col("CODE_ISIN_INSTRUMENT"),
        "code_bloomberg": col("CODE_BLOOMBERG"), "type_instrument": col("CODE_TYPE_INSTRUMENT"), "classe_actifs": col("CLASSE_ACTIF"),
        "devise_instrument": col("DEVISE_INSTRUMENT"), "type_detention": col("TYPE_HOLDING"), "type_dette": col("TYPE_DETTE"),
        "devise_fonds": col("DEVISE_FONDS"), "montant_devise_fonds": pd.to_numeric(col("MONTANT_DEVISE_FONDS"), errors="coerce"),
        "montant_eur": col("amount_eur"), "exposition_eur": col("expo_eur"), "poids": col("weight"),
    })
    df = df.sort_values(["fonds", "montant_eur"], ascending=[True, False], na_position="last")
    return _table(cols, df[cols].to_numpy(dtype=object).tolist(), "une ligne par fonds et par instrument", date=end.date().isoformat())
