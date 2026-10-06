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


# ------------------------------------------------------------------ Product Info : tout le référentiel
_KIND = {"text": "text", "long": "text", "date": "date", "pct": "pct", "pct_int": "pct", "bool": "bool", "int": "int", "num": "num",
         "money": "num", "stars": "int", "code": "code"}
_TECH = {"Id", "SinkCreatedOn", "SinkModifiedOn", "MlvLastModified", "statecodename", "statuscodename", "pi_productid", "pi_shareid", "ProductID"}


def _guess_kind(name: str, s: pd.Series) -> str:
    """Nature d'une colonne non cataloguée, déduite de ses valeurs (jamais d'une hypothèse sur son sens)."""
    v = s.dropna()
    v = v[v.map(lambda x: not (isinstance(x, str) and not x.strip()))]
    if v.empty:
        return "text"
    if v.map(lambda x: isinstance(x, (bool, np.bool_))).all():
        return "bool"
    num = pd.to_numeric(v, errors="coerce")
    if num.notna().all():
        return "num"
    if "date" in name.lower():
        d = pd.to_datetime(v.astype(str), errors="coerce")
        if d.notna().mean() > 0.9:
            return "date"
    return "text"


def _cell(kind: str, x: Any) -> Any:
    x = _v(x)
    if x is None:
        return None
    if kind == "bool":
        return L.to_bool(x)
    if kind in ("pct",):
        try:
            return float(x) / 100.0                     # valeurs du référentiel en points de % → fraction
        except (TypeError, ValueError):
            return x
    if kind in ("num", "int"):
        try:
            return float(x)
        except (TypeError, ValueError):
            return x
    if kind == "date":
        t = pd.to_datetime(str(x), errors="coerce")
        return None if pd.isna(t) else t.date().isoformat()
    return x if isinstance(x, (int, float, bool)) else str(x)


def referentiel(svc, niveau: str = "fonds") -> dict:
    """Tous les champs Product Info du référentiel (fonds actifs ou parts), libellés du catalogue métier d'abord, puis
    les autres colonnes sous leur nom d'origine. Une ligne par fonds (ou par part). Packs de champs proposés."""
    from .domain import fields as F
    m = svc.m
    if niveau not in ("fonds", "parts"):
        raise ValueError(f"Niveau inconnu : {niveau}")
    df = m.products if niveau == "fonds" else m.shares
    cat: list[tuple[str, str, str, str]] = []           # (colonne, libellé, groupe, nature d'origine)
    if niveau == "fonds":
        for _, sec, items in F.FUND_SECTIONS:
            cat += [(c, lab, sec, k) for c, lab, k in items]
        cat += [(c, lab, "ESG & durabilité", k) for c, lab, k in F.ESG_FIELDS]
        cat += [(c, lab, "Exclusions ESG", "bool") for c, lab in F.EXCLUSIONS]
        cat += [(c, lab, "Principales incidences négatives", "bool") for c, lab in F.PAI]
        cat += [(c, f"Validation {lab}", "Validations", "bool") for c, lab in F.VALIDATIONS]
    else:
        for _, sec, items in F.SHARE_SECTIONS:
            cat += [(c, lab, sec, k) for c, lab, k in items]
    seen, cols = set(), []
    for c, lab, grp, k in cat:
        if c in df.columns and c not in seen:
            seen.add(c)
            cols.append({"key": f"pi.{c}", "col": c, "label": lab, "group": grp, "kind": _KIND.get(k, "text"), "desc": f"Product Info : {c}"})
    for c in df.columns:
        if c in seen or c in _TECH or str(c).startswith("_"):
            continue
        seen.add(c)
        cols.append({"key": f"pi.{c}", "col": c, "label": str(c).replace("_", " ").strip(), "group": "Autres champs Product Info",
                     "kind": _guess_kind(str(c), df[c]), "desc": f"Product Info : {c} (champ non catalogué, nom d'origine)"})
    # Colonne par colonne (référentiel réel : des centaines de colonnes × des milliers de parts)
    data = [[_cell(c["kind"], x) for x in df[c["col"]].tolist()] for c in cols]
    ids = df.index.tolist()
    if niveau == "fonds":
        lead = [ids]
        head = ["id_fonds"]
    else:
        pid = df["ProductID"].tolist() if "ProductID" in df else [None] * len(ids)
        lead = [ids, [_v(x) for x in pid]]
        head = ["id_part", "id_fonds"]
    rows = [list(r) for r in zip(*lead, *data)]
    by_group: dict[str, list[str]] = {}
    for c in cols:
        by_group.setdefault(c["group"], []).append(c["key"])
    k = lambda *names: [f"pi.{n}" for n in names if f"pi.{n}" in {c["key"] for c in cols}]
    if niveau == "fonds":
        packs = [
            {"id": "identite", "label": "Fiche d'identité", "desc": "Nom, gamme, classe d'actifs, forme, domicile, devise, création, gérant",
             "keys": ["name", "id", "family", *k("Fund_Range", "Asset_Class", "Legal_Form", "Domiciliation", "Accounting_Currency", "Creation_Date", "Portfolio_Manager")]},
            {"id": "encours", "label": "Encours & collecte", "desc": "Encours, variations et collecte nette estimée",
             "keys": ["name", "aum", "delta_1M", "delta_YTD", "var_YTD", "var_1A", "flows_1M", "flows_YTD", "flows_1A"]},
            {"id": "perf", "label": "Performance & risque", "desc": "Performances, volatilité, perte maximale, SRI",
             "keys": ["name", "perf_YTD", "perf_1A", "vol_1A", "sri", "vol", "mdd", "te", *by_group.get("Risques", [])[:6]]},
            {"id": "revenus", "label": "Revenus estimés", "desc": "Taux de frais, revenus annualisés, part des revenus",
             "keys": ["name", "aum", "rate", "revenue", "revenue_net", "revenue_12m", "d_revenue_1y", "share"]},
            {"id": "frais", "label": "Frais du fonds", "desc": "Tous les frais du référentiel", "keys": ["name", *by_group.get("Frais du fonds", [])]},
            {"id": "esg", "label": "ESG & SFDR", "desc": "Classification SFDR, labels, investissements durables", "keys": ["name", *by_group.get("ESG & durabilité", [])]},
            {"id": "regl", "label": "Réglementaire", "desc": "Réglementation, fiscalité, documents", "keys": ["name", *by_group.get("Réglementaire & fiscalité", [])]},
            {"id": "codes", "label": "Codes", "desc": "Identifiants et codes du fonds", "keys": ["name", *by_group.get("Codes", [])]},
        ]
    else:
        packs = [
            {"id": "identite", "label": "Fiche de la part", "desc": "Nom, ISIN, catégorie, devise, couverture, affectation, souscripteurs",
             "keys": ["fonds", *by_group.get("Identité de la part", [])[:8]]},
            {"id": "encours", "label": "Encours & VL", "desc": "Encours, collecte YTD, dernière VL", "keys": ["fonds", "part", "isin", "encours", "collecte_ytd", "vl", "date_vl"]},
            {"id": "frais", "label": "Frais de la part", "desc": "Frais courants, gestion, entrée, sortie, rétrocessions", "keys": ["fonds", "part", "isin", *by_group.get("Frais de la part", [])]},
            {"id": "souscription", "label": "Souscriptions & rachats", "desc": "Minimums, cut-off, règlement, VL", "keys": ["fonds", "part", "isin", *by_group.get("Souscriptions & rachats", [])]},
            {"id": "plateformes", "label": "Plateformes & diffusion", "desc": "Clearstream, Euroclear, Allfunds, diffusions", "keys": ["fonds", "part", "isin", *by_group.get("Plateformes & diffusion", [])]},
            {"id": "codes", "label": "Codes", "desc": "ISIN, Bloomberg, RIC, WKN, SEDOL, Valor", "keys": ["fonds", "part", *by_group.get("Codes", [])]},
            {"id": "fiscalite", "label": "Réglementaire & fiscalité", "desc": "MiFID II, PRIIPs, FATCA, transparences", "keys": ["fonds", "part", "isin", *by_group.get("Réglementaire & fiscalité", [])]},
        ]
    return {"niveau": niveau, "columns": [{k2: c[k2] for k2 in ("key", "label", "group", "kind", "desc")} for c in cols],
            "head": head, "rows": rows, "n": len(rows), "packs": packs, "n_fields": len(cols)}
