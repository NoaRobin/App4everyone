"""Rattachement JUMP ↔ Product Info : parts, puis fonds, avec un diagnostic complet (identifiants seulement).

Part JUMP → part du référentiel (PI_OUT_Share) :
  1. ID_PI_PART = pi_shareid (forme canonique : casse, espaces, insécables, accolades, 12345.0, zéros de tête…) ;
     à défaut, la même valeur trouvée dans une autre clé technique de la part (Id, Share_ID_Global), si elle y
     désigne une seule part et ne se confond avec aucun pi_shareid ;
  2. pour les parts encore non rattachées, CODE_ISIN_PART = ISIN_Code, seulement si l'ISIN désigne une seule part
     active du référentiel, une seule part JUMP encore à rattacher, et une part que l'identifiant n'a pas déjà prise.

Part JUMP → fonds (pi_out_product_active) :
  1. ProductID de la part rattachée, fonds actif du référentiel. Si l'ISIN est porté par plusieurs parts actives
     appartenant toutes au même fonds, ce fonds est démontré même si la part exacte ne l'est pas ;
  2. ID_PI_FONDS de JUMP (encours ; à défaut, inventaires du même fonds JUMP s'ils désignent un seul fonds) ;
     même logique de clés alternatives que pour les parts (Id, Product_Global_ID) ; puis CODE_AIM_FONDS des
     inventaires = AIM_Portfolio_Code, s'il est unique ;
  3. propagation : le fonds unique auquel sont rattachées les autres parts du même fonds JUMP.
Jamais de rapprochement sur le nom. Ce qui ne peut pas être démontré reste un fonds « JUMP seul » (J:…).
"""
from __future__ import annotations

import os
import re
from collections import Counter, defaultdict
from typing import Any

import numpy as np
import pandas as pd

from . import ids as IDS
from . import labels as L

_INACTIVE = {"inactive", "inactif", "desactive", "deactivated", "closed", "ferme", "fermee",
             "liquidee", "liquidated", "liquide", "supprime", "deleted"}
SHARE_KEYS = ("pi_shareid", "Id", "Share_ID_Global", "BOne_Share_ID")
# Codes techniques de la part que JUMP peut porter dans ID_JUMP_PART (code du teneur de registre, identifiant global)
JUMP_PART_KEYS = ("BOne_Share_ID", "FIC_Code", "Share_ID_Global")
# Codes de portefeuille du fonds que JUMP peut porter dans ID_JUMP_FONDS (administrateur de fonds, AIM)
PORTFOLIO_KEYS = ("Fund_Administrator_Portfolio_Code", "AIM_Portfolio_Code")
PRODUCT_KEYS = ("pi_productid", "Id", "Product_Global_ID")
LINK_COLS = ["ID_JUMP_PART", "ID_JUMP_FONDS", "NOM_PART", "CODE_ISIN_PART", "pi_shareid", "link", "fund_id",
             "fund_link", "fund_linked", "part_reason", "fund_reason"]
# Méthodes de rattachement au fonds : (compteur, rang). Rang : meilleure méthode d'un fonds JUMP parmi ses parts.
METHODS = {"product_id": ("by_product_id", 0), "product_id_isin": ("by_product_id", 0),
           "pi_fonds": ("by_id_pi_fonds", 1), "pi_fonds_inventaires": ("by_id_pi_fonds", 1),
           "code_aim_inventaires": ("by_id_pi_fonds", 1), "code_portefeuille": ("by_id_pi_fonds", 1),
           "propagation": ("by_propagation", 2), "none": ("unlinked", 3)}


def is_active(df: pd.DataFrame) -> pd.Series:
    """Enregistrement actif du référentiel (état et statut Dataverse) ; colonne absente ou vide → actif."""
    ok = pd.Series(True, index=df.index)
    for c in ("statecodename", "statuscodename"):
        if c in df:
            ok &= ~df[c].map(lambda v: L.norm(v) if isinstance(v, str) else "").isin(_INACTIVE)
    return ok


def best_rows(df: pd.DataFrame, key: str, prefer: list | None = None) -> pd.DataFrame:
    """Une ligne par identifiant (forme canonique) : la plus fiable plutôt que la première venue — critères `prefer`
    (booléens, par ordre d'importance), puis la plus renseignée, puis l'ordre d'origine. Un doublon de chargement
    inactif ou sans ProductID ne masque plus l'enregistrement complet. Aucune valeur n'est fusionnée entre lignes."""
    if df.empty:
        return df
    canon = IDS.ids(df[key]).to_numpy()
    filled = df.notna().sum(axis=1).to_numpy()
    keys = [np.arange(len(df)), -filled] + [-np.asarray(s, dtype=int) for s in reversed(prefer or [])]
    order = np.lexsort(keys)
    seen: set = set()
    keep = []
    for i in order:
        k = canon[i]
        if k is None or k in seen:
            continue
        seen.add(k)
        keep.append(i)
    return df.iloc[sorted(keep)]


class KeyIndex:
    """Résout un identifiant venu de JUMP vers la clé primaire du référentiel (pi_shareid, pi_productid).

    Clé primaire d'abord ; puis les clés techniques alternatives, uniquement si la valeur y désigne un seul
    enregistrement et ne se confond avec aucune clé primaire. Comparaison sur la forme canonique (domain/ids.py)."""

    def __init__(self, df: pd.DataFrame, keys: tuple[str, ...], primary: str | None = None):
        primary = primary or keys[0]
        pk = df[primary].to_numpy()
        self.primary = set(x for x in pk if x is not None)
        self.maps: list[tuple[str, dict]] = []
        for key in keys:
            if key not in df:
                continue
            canon = IDS.ids(df[key]).to_numpy()
            seen: dict[str, Any] = {}
            clash: set[str] = set()
            for c, p in zip(canon, pk):
                if c is None or p is None:
                    continue
                if c in seen and seen[c] != p:
                    clash.add(c)
                seen.setdefault(c, p)
            if key != primary:                   # valeur alternative de même forme qu'une clé primaire d'un autre enregistrement
                prim = self.maps[0][1] if self.maps and self.maps[0][0] == primary else {}
                clash |= {c for c in seen if c in prim and prim[c] != seen[c]}
            for c in clash:
                seen.pop(c, None)
            self.maps.append((key, seen))

    def resolve(self, series: pd.Series) -> tuple[pd.Series, pd.Series]:
        """(clé primaire ou None, nom de la clé ayant permis la résolution ou None)."""
        canon = IDS.ids(series)
        out = pd.Series([None] * len(series), index=series.index, dtype=object)
        via = pd.Series([None] * len(series), index=series.index, dtype=object)
        for key, m in self.maps:
            todo = out.isna() & canon.notna()
            if not todo.any():
                break
            got = canon[todo].map(m)
            got = got[got.notna()]
            out[got.index] = got
            via[got.index] = key
        return out, via


def _unique_per(keys: pd.Series, values: pd.Series) -> tuple[pd.Series, pd.Series]:
    """Par clé : la valeur unique (Series clé → valeur) et les clés qui en ont plusieurs (Series clé → liste)."""
    d = pd.DataFrame({"k": keys.to_numpy(), "v": values.to_numpy()}).dropna().drop_duplicates()
    if d.empty:
        return pd.Series(dtype=object), pd.Series(dtype=object)
    per = d.groupby("k")["v"].agg(lambda x: sorted(x))
    return per[per.map(len) == 1].map(lambda x: x[0]), per[per.map(len) > 1]


def link(last: pd.DataFrame, shares: pd.DataFrame, products: pd.DataFrame,
         holdings: pd.DataFrame | None = None, raw_shapes: dict | None = None) -> tuple[pd.DataFrame, dict]:
    """`last` : une ligne par part JUMP (dernières valeurs renseignées des libellés). `shares` / `products` : référentiel
    nettoyé et dédoublonné (une ligne par clé primaire). Renvoie (rattachement, diagnostic)."""
    out = last.reset_index(drop=True).copy()
    n = len(out)

    def none() -> pd.Series:
        return pd.Series([None] * n, index=out.index, dtype=object)
    raw = {c: (out[c].astype(object) if c in out else none())
           for c in ("ID_PI_PART", "ID_PI_FONDS", "CODE_ISIN_PART", "ID_JUMP_FONDS", "ID_JUMP_PART", "NOM_PART")}
    out["NOM_PART"] = raw["NOM_PART"]

    pidx = KeyIndex(products, PRODUCT_KEYS)
    product_set = pidx.primary
    sidx = KeyIndex(shares, SHARE_KEYS)
    pid_raw = IDS.ids(shares["ProductID"]) if "ProductID" in shares else pd.Series([None] * len(shares), index=shares.index)
    sh = pd.DataFrame({"sid": shares["pi_shareid"].to_numpy(),
                       "isin": IDS.isins(shares["ISIN_Code"]).to_numpy() if "ISIN_Code" in shares else None,
                       "pid": (pidx.resolve(shares["ProductID"])[0] if "ProductID" in shares else pid_raw).to_numpy(),
                       "pid_raw": pid_raw.to_numpy(), "active": is_active(shares).to_numpy()})
    share_pid = dict(zip(sh["sid"], sh["pid"]))
    share_pid_raw = dict(zip(sh["sid"], sh["pid_raw"]))
    share_active = dict(zip(sh["sid"], sh["active"]))

    # ------------------------------------------------ 1. part par identifiant
    pi_part_c = IDS.ids(raw["ID_PI_PART"])
    by_id, by_id_key = sidx.resolve(raw["ID_PI_PART"])
    # 1 bis. ID_JUMP_PART égal à un code technique de la part (code teneur de registre…), s'il est unique
    jidx = KeyIndex(shares, JUMP_PART_KEYS, primary="pi_shareid")
    by_jp, by_jp_key = jidx.resolve(raw["ID_JUMP_PART"])
    # Jamais contre une preuve contraire : ISIN de JUMP différent de celui de la part trouvée
    isin_of = dict(zip(sh["sid"], sh["isin"]))
    j_isin0 = IDS.isins(raw["CODE_ISIN_PART"])
    contra = by_jp.map(lambda x: isin_of.get(x) if x is not None else None)
    by_jp = by_jp.where(~(j_isin0.notna() & contra.notna() & (contra != j_isin0)))
    hit = by_id.isna() & by_jp.notna()
    by_id[hit] = by_jp[hit]
    by_id_key[hit] = "ID_JUMP_PART→" + by_jp_key[hit].astype(str)
    # ------------------------------------------------ 2. part par ISIN (seulement pour les parts encore non rattachées)
    j_isin = IDS.isins(raw["CODE_ISIN_PART"])
    cand: dict[str, list[tuple[Any, Any, bool]]] = defaultdict(list)
    for s, i, p, a in sh[["sid", "isin", "pid", "active"]].itertuples(index=False):
        if isinstance(i, str):
            cand[i].append((s, p, bool(a)))
    remaining = by_id.isna() & j_isin.notna()
    jump_counts = Counter(j_isin[remaining])
    claimed = set(by_id.dropna())
    by_isin, isin_product, part_reason = none(), none(), none()
    ambiguous: dict[str, str] = {}
    for ix in out.index[remaining.to_numpy()]:
        isin = j_isin.at[ix]
        c = cand.get(isin, [])
        if not c:
            part_reason.at[ix] = "isin_inconnu_du_referentiel"
            continue
        eligible = [x for x in c if x[2]] or c                     # parts actives d'abord
        prods = {x[1] for x in eligible}
        if len(prods) == 1 and None not in prods:
            isin_product.at[ix] = next(iter(prods))               # toutes les parts candidates : même fonds
        if len(eligible) > 1:
            part_reason.at[ix] = "isin_ambigu_referentiel"
            ambiguous[isin] = "plusieurs parts actives du référentiel"
        elif jump_counts[isin] > 1:
            part_reason.at[ix] = "isin_partage_par_plusieurs_parts_jump"
            ambiguous[isin] = "plusieurs parts JUMP"
        elif eligible[0][0] in claimed:
            part_reason.at[ix] = "isin_deja_pris_par_identifiant"
            ambiguous.setdefault(isin, "part déjà rattachée par identifiant")
        else:
            by_isin.at[ix] = eligible[0][0]
    # ISIN en double dans le référentiel et présents dans JUMP : signalés même quand l'identifiant a suffi
    jump_isins = set(j_isin.dropna())
    for isin, c in cand.items():
        if len(c) > 1 and isin in jump_isins:
            ambiguous.setdefault(isin, "doublon du référentiel (sans effet : parts rattachées par identifiant)")
    no_isin = by_id.isna() & j_isin.isna()
    part_reason[no_isin & pi_part_c.isna()] = "ni_id_pi_part_ni_isin"
    part_reason[no_isin & pi_part_c.notna()] = "id_pi_part_inconnu_et_sans_isin"
    unknown_id = remaining & pi_part_c.notna() & part_reason.notna()
    part_reason[unknown_id] = "id_pi_part_inconnu + " + part_reason[unknown_id].astype(str)
    sid = by_id.where(by_id.notna(), by_isin)
    out["pi_shareid"] = sid.where(sid.notna(), None)
    out["link"] = np.where(by_id.notna(), "id", np.where(by_isin.notna(), "isin", "none"))
    out["part_reason"] = part_reason.where(out["link"] == "none", None)

    # ------------------------------------------------ 3. fonds
    jf = IDS.jump_ids(raw["ID_JUMP_FONDS"])
    via_share = out["pi_shareid"].map(lambda s: share_pid.get(s) if s is not None else None)
    pi_fund_c = IDS.ids(raw["ID_PI_FONDS"])
    via_jump, via_jump_key = pidx.resolve(raw["ID_PI_FONDS"])
    via_hold, via_aim = none(), none()
    hold_multi = pd.Series(dtype=object)
    if holdings is not None and len(holdings) and "ID_JUMP_FONDS" in holdings:
        hjf = IDS.jump_ids(holdings["ID_JUMP_FONDS"])
        if "ID_PI_FONDS" in holdings:
            single, hold_multi = _unique_per(hjf, pidx.resolve(holdings["ID_PI_FONDS"])[0])
            via_hold = jf.map(single)
        if "CODE_AIM_FONDS" in holdings and "AIM_Portfolio_Code" in products:
            aim = KeyIndex(products, ("AIM_Portfolio_Code",), primary="pi_productid")
            single_aim, _ = _unique_per(hjf, aim.resolve(holdings["CODE_AIM_FONDS"])[0])
            via_aim = jf.map(single_aim)
    # ID_JUMP_FONDS égal au code portefeuille du fonds dans le référentiel (administrateur de fonds, AIM), s'il est unique
    via_code = KeyIndex(products, PORTFOLIO_KEYS, primary="pi_productid").resolve(raw["ID_JUMP_FONDS"])[0] \
        if any(k in products for k in PORTFOLIO_KEYS) else none()
    via_code = via_code.where(~(via_jump.notna() & via_code.notna() & (via_jump != via_code)))   # contredit par ID_PI_FONDS
    fund, method = none(), pd.Series("none", index=out.index, dtype=object)
    for name, s in (("product_id", via_share), ("product_id_isin", isin_product), ("pi_fonds", via_jump),
                    ("pi_fonds_inventaires", via_hold), ("code_aim_inventaires", via_aim), ("code_portefeuille", via_code)):
        hit = fund.isna() & s.notna() & s.isin(product_set)
        fund[hit] = s[hit]
        method[hit] = name
    # Propagation : le fonds unique des autres parts du même fonds JUMP
    single, conflict = _unique_per(jf, fund)
    sibling = jf.map(single).where(fund.isna())
    hit = sibling.notna()
    fund[hit] = sibling[hit]
    method[hit] = "propagation"
    out["fund_link"] = method
    out["fund_linked"] = fund.notna()
    fallback = "J:" + jf.fillna("part-" + raw["ID_JUMP_PART"].astype(str)).astype(str)
    out["fund_id"] = fund.where(fund.notna(), fallback)

    # Raison technique de l'absence de fonds (part par part)
    linked_share = out["pi_shareid"].notna()
    no_pid = linked_share & out["pi_shareid"].map(lambda s: share_pid_raw.get(s) is None)
    fr = pd.Series("productid_hors_referentiel_actif", index=out.index, dtype=object)
    fr[~linked_share] = "part_non_rattachee"
    fr[no_pid] = "part_sans_productid"
    fr = fr + " + " + pd.Series(np.where(pi_fund_c.isna(), "id_pi_fonds_vide", "id_pi_fonds_inconnu"), index=out.index)
    fr = fr.where(~jf.isin(set(hold_multi.index)), fr + " + inventaires_sur_plusieurs_fonds")
    fr = fr.where(~jf.isin(set(conflict.index)), fr + " + fonds_jump_sur_plusieurs_produits")
    out["fund_reason"] = fr.where(~out["fund_linked"], None)
    out["CODE_ISIN_PART"] = j_isin.where(j_isin.notna(), raw["CODE_ISIN_PART"])
    out["ID_JUMP_FONDS"] = jf

    report = _report(out, raw, sh, shares, products, pidx, pi_part_c, pi_fund_c, j_isin, by_id_key,
                     via_jump_key, method, ambiguous, conflict, share_active, raw_shapes or {})
    return out[[c for c in LINK_COLS if c in out]], report


def _report(out, raw, sh, shares, products, pidx, pi_part_c, pi_fund_c, j_isin, by_id_key, via_jump_key,
            method, ambiguous, conflict, share_active, raw_shapes) -> dict:
    """Compteurs, raisons, formes des identifiants, sondes et exemples : identifiants techniques seulement."""
    parts = {"total": int(len(out)), "by_pi_shareid": int((out["link"] == "id").sum()),
             "by_isin": int((out["link"] == "isin").sum()), "unlinked": int((out["link"] == "none").sum()),
             "by_alternate_share_key": int((by_id_key.notna() & (by_id_key != "pi_shareid")).sum()),
             "linked_to_inactive_share": int(out["pi_shareid"].map(lambda s: s is not None and not share_active.get(s, True)).sum())}
    jf = out["ID_JUMP_FONDS"].fillna("part-" + raw["ID_JUMP_PART"].astype(str))
    rank = method.map(lambda m: METHODS[m][1])
    best = pd.Series(rank.to_numpy(), index=jf.to_numpy()).groupby(level=0).min()
    n_parts = jf.value_counts()
    funds = {"total": int(len(best)), "by_product_id": int((best == 0).sum()), "by_id_pi_fonds": int((best == 1).sum()),
             "by_propagation": int((best == 2).sum()), "unlinked": int((best == 3).sum()),
             "unlinked_multi_parts": int(((best == 3) & (n_parts.reindex(best.index).fillna(0) > 1)).sum()),
             "split_across_products": int(len(conflict)),
             "by_alternate_product_key": int((via_jump_key.notna() & (via_jump_key != "pi_productid") & (method == "pi_fonds")).sum())}
    methods = {k: int(v) for k, v in method.value_counts().items()}
    # Couverture du référentiel : fonds actifs du référentiel qui reçoivent au moins une part JUMP. Si elle est
    # complète alors que beaucoup de fonds JUMP restent seuls, ce ne sont pas des échecs de rattachement mais des
    # portefeuilles hors du référentiel des fonds ouverts (mandats, fonds dédiés, fonds liquidés…).
    linked_products = set(out.loc[out["fund_linked"], "fund_id"])
    coverage = {"products_active": int(len(pidx.primary)), "products_with_jump": int(len(linked_products & pidx.primary)),
                "products_without_jump": int(len(pidx.primary - linked_products)),
                "by_portfolio_code": int((best.index.isin(jf[method == "code_portefeuille"].unique())).sum())}
    part_reasons = {k: int(v) for k, v in out["part_reason"].dropna().value_counts().items()}
    fund_reasons = {k: int(v) for k, v in out.loc[~out["fund_linked"], "fund_reason"].dropna().value_counts().items()}

    sh_canon = set(IDS.ids(shares["pi_shareid"]).dropna())
    pr_canon = set(IDS.ids(products["pi_productid"]).dropna())
    sid_raw = set(shares["pi_shareid"].dropna().astype(str))
    pid_raw = set(products["pi_productid"].dropna().astype(str))
    isin_ref = set(pd.Series(sh["isin"]).dropna())
    joins = {
        "JUMP.ID_PI_PART → PI_OUT_Share.pi_shareid": {
            "renseignés": int(pi_part_c.notna().sum()), "égalité brute": int(raw["ID_PI_PART"].dropna().astype(str).isin(sid_raw).sum()),
            "après normalisation": int(pi_part_c.isin(sh_canon).sum()), "par clé alternative": parts["by_alternate_share_key"]},
        "JUMP.CODE_ISIN_PART → PI_OUT_Share.ISIN_Code": {
            "renseignés": int(j_isin.notna().sum()), "connus du référentiel": int(j_isin.isin(isin_ref).sum())},
        "JUMP.ID_PI_FONDS → pi_productid": {
            "renseignés": int(pi_fund_c.notna().sum()), "égalité brute": int(raw["ID_PI_FONDS"].dropna().astype(str).isin(pid_raw).sum()),
            "après normalisation": int(pi_fund_c.isin(pr_canon).sum()),
            "par clé alternative": int((via_jump_key.notna() & (via_jump_key != "pi_productid")).sum())},
        "PI_OUT_Share.ProductID → pi_productid": {
            "renseignés": int(pd.Series(sh["pid_raw"]).notna().sum()), "fonds actif trouvé": int(pd.Series(sh["pid"]).notna().sum())},
    }
    shapes = dict(raw_shapes)
    for k, s in (("JUMP.ID_PI_PART", raw["ID_PI_PART"]), ("JUMP.ID_PI_FONDS", raw["ID_PI_FONDS"]),
                 ("JUMP.CODE_ISIN_PART", raw["CODE_ISIN_PART"])):
        shapes.setdefault(k, IDS.shapes(s))
    # Sondes : les identifiants non résolus se trouvent-ils dans une autre colonne ? (comptes uniquement)
    targets = {"PI_OUT_Share.pi_shareid": shares.get("pi_shareid"), "PI_OUT_Share.Id": shares.get("Id"),
               "PI_OUT_Share.Share_ID_Global": shares.get("Share_ID_Global"), "PI_OUT_Share.BOne_Share_ID": shares.get("BOne_Share_ID"),
               "PI_OUT_Share.ProductID": shares.get("ProductID"), "PI_OUT_Share.ISIN_Code": shares.get("ISIN_Code"),
               "pi_out_product_active.pi_productid": products.get("pi_productid"), "pi_out_product_active.Id": products.get("Id"),
               "pi_out_product_active.Product_Global_ID": products.get("Product_Global_ID"),
               "pi_out_product_active.AIM_Portfolio_Code": products.get("AIM_Portfolio_Code"),
               "pi_out_product_active.Fund_Administrator_Portfolio_Code": products.get("Fund_Administrator_Portfolio_Code"),
               "pi_out_product_active.National_identification_code": products.get("National_identification_code"),
               "PI_OUT_Share.FIC_Code": shares.get("FIC_Code")}
    target_sets = {t: set(IDS.ids(col).dropna()) for t, col in targets.items() if col is not None}
    probes = {}
    for name, src in (("ID_PI_PART des parts non rattachées", pi_part_c[out["link"] == "none"]),
                      ("ID_PI_FONDS des parts sans fonds", pi_fund_c[~out["fund_linked"]]),
                      ("ID_JUMP_FONDS des fonds non rattachés", IDS.ids(raw["ID_JUMP_FONDS"])[~out["fund_linked"]].drop_duplicates()),
                      ("ID_JUMP_PART des parts non rattachées", IDS.ids(raw["ID_JUMP_PART"])[out["link"] == "none"])):
        src = src.dropna()
        if len(src):
            probes[name] = {"renseignés": int(len(src)), **{t: int(src.isin(s).sum()) for t, s in target_sets.items()}}
    # Exemples : fonds JUMP non rattachés, identifiants techniques et raisons seulement (ni nom, ni encours)
    examples = []
    un_jf = list(best.index[best == 3])
    for j in sorted(un_jf, key=lambda x: (-int(n_parts.get(x, 0)), str(x)))[:20]:
        rows = out[(jf == j).to_numpy()]
        examples.append({"ID_JUMP_FONDS": str(j), "parts": int(len(rows)),
                         "raisons_fonds": {k: int(v) for k, v in rows["fund_reason"].value_counts().items()},
                         "parts_exemples": [{"ID_JUMP_PART": str(r["ID_JUMP_PART"]), "forme_ID_PI_PART": IDS.shape(raw["ID_PI_PART"].at[ix]),
                                             "forme_ID_PI_FONDS": IDS.shape(raw["ID_PI_FONDS"].at[ix]),
                                             "ISIN": r["CODE_ISIN_PART"] if isinstance(r["CODE_ISIN_PART"], str) else None,
                                             "raison_part": r["part_reason"]} for ix, r in rows.head(5).iterrows()]})
    return {"parts": parts, "funds": funds, "methods": methods, "coverage": coverage, "part_reasons": part_reasons, "fund_reasons": fund_reasons,
            "ambiguous_isins": sorted(ambiguous), "ambiguous_isin_causes": dict(Counter(ambiguous.values())),
            "ambiguous_isins_in_referential": int((pd.Series(sh["isin"]).dropna().value_counts() > 1).sum()),
            "parts_without_product": int(pd.Series(sh["pid_raw"]).isna().sum()),
            "parts_with_inactive_product": int((pd.Series(sh["pid_raw"]).notna() & pd.Series(sh["pid"]).isna()).sum()),
            "products_active": int(len(pidx.primary)), "shares_referential": int(len(sh)),
            "joins": joins, "shapes": shapes, "probes": probes, "unlinked_funds_examples": examples}


WATCH_DEFAULT = r"valor|4\s*change"


def watch_pattern() -> re.Pattern:
    """Fonds suivis dans le diagnostic (motif sur le nom, affiché dans l'application, jamais journalisé)."""
    return re.compile(os.environ.get("APP_LINK_WATCH", WATCH_DEFAULT), re.I)
