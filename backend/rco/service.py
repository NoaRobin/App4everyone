"""Service applicatif : assemble les réponses de l'API à partir du modèle en mémoire."""
from __future__ import annotations

import math
from datetime import timedelta
from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd

from .config import Settings
from .domain import analytics as A
from .domain import fields as F
from .domain import holdings as H
from .domain import labels as L
from .domain.numeric import fmt_meur, numeric_series, safe_divide, safe_float
from .domain.model import PERIODS, Model, _clean

FUND_DIMS = {
    "family": ("Famille de gestion", "family"), "range": ("Gamme", "Fund_Range"), "asset_class": ("Classe d'actifs", "Asset_Class"),
    "expertise": ("Expertise", "Management_Expertise_Level_2"), "manager": ("Gérant principal", "Portfolio_Manager"),
    "sfdr": ("Classification SFDR", "ESG_SFDR_Article"), "sri": ("Indicateur de risque (SRI)", "Official_Risk_Scale"),
    "domicile": ("Domiciliation", "Domiciliation"), "legal_form": ("Forme juridique", "Legal_Form"),
    "currency": ("Devise du fonds", "Accounting_Currency"), "amf": ("Catégorie AMF", "ESG_AMF_Category"),
}
SHARE_DIMS = {
    "share_ccy": ("Devise de la part", "Subscription_Currency"), "distribution": ("Affectation des revenus", "Income_Distribution"),
    "investor": ("Souscripteurs", "Investor_Type"), "hedged": ("Couverture de change", "Share_Hedged_Against_FX_Exposure"),
}


def _num(x: Any) -> float | None:
    """Valeur numérique finie ou None (Decimal, NumPy, pandas NA ; voir domain/numeric.py)."""
    return safe_float(x)


def _str(x: Any) -> str | None:
    x = _clean(x)
    if x is None:
        return None
    return str(x)


def _rebase(bench: pd.Series | None) -> pd.Series | None:
    """Indicateur de référence en base 100 sur sa première valeur valide (None si aucune valeur valide non nulle)."""
    if bench is None:
        return None
    b = numeric_series(bench)
    first = b.dropna()
    b0 = safe_float(first.iloc[0]) if len(first) else None
    return b / b0 * 100 if b0 else None


class Service:
    def __init__(self, model: Model, rmm_columns: tuple[str, ...] | None = None, rmm_pattern: str | None = None):
        self.m = model
        self._registrations = self._build_registrations()
        cfg = Settings.__dataclass_fields__
        self.rmm_columns = rmm_columns or cfg["rmm_columns"].default
        self.rmm_pattern = rmm_pattern or cfg["rmm_pattern"].default
        self.rmm = L.rmm_funds(model.funds, self.rmm_columns, self.rmm_pattern)

    # ------------------------------------------------------------------ utilitaires
    def end(self, d: str | None) -> pd.Timestamp:
        return self.m.as_of(d)

    def _family_label(self, key: str) -> str:
        return L.FAMILY_BY_KEY.get(key, L.UNCLASSIFIED)["label"]

    def fund_ref(self, fid: str) -> dict:
        f = self.m.funds.loc[fid]
        return {"id": fid, "name": f["name"], "family": f["family"]}

    def _share_key(self, jp: str) -> str:
        sid = self.m.link.at[jp, "pi_shareid"]
        return sid if isinstance(sid, str) else f"J:{jp}"

    def _jp_for_share(self, share_key: str) -> list[str]:
        if share_key.startswith("J:"):
            return [share_key[2:]] if share_key[2:] in self.m.link.index else []
        return self.m.link.index[self.m.link["pi_shareid"] == share_key].tolist()

    # ------------------------------------------------------------------ méta
    def meta(self) -> dict:
        m = self.m
        dq = m.dq
        refresh = None
        if not dq.empty and "RefreshTimestamp" in dq:
            ts = pd.to_datetime(dq["RefreshTimestamp"], errors="coerce", utc=True).dropna()
            refresh = ts.min().isoformat() if len(ts) else None
        maj = pd.to_datetime(m.aum_raw["DATE_MAJ"], errors="coerce").max() if "DATE_MAJ" in m.aum_raw else None
        return {
            "is_mock": m.is_mock, "first_date": m.dates[0].date().isoformat(), "last_date": m.dates[-1].date().isoformat(),
            "refresh": refresh, "jump_updated": maj.isoformat() if maj is not None and not pd.isna(maj) else None,
            "families": [{"key": f["key"], "label": f["label"], "short": f["short"]} for f in L.FAMILIES] + [
                {"key": "nc", "label": "Non classé", "short": "Non classé"}],
            "periods": PERIODS, "dims": {k: v[0] for k, v in {**FUND_DIMS, **SHARE_DIMS}.items()},
        }

    # ------------------------------------------------------------------ vue maison
    @lru_cache(maxsize=16)
    def overview(self, d: str | None) -> dict:
        m, end = self.m, self.end(d)
        aum, fc = A.house_series(m)
        rows = A.fund_summary_rows(m, end)
        live = rows[rows["aum"].fillna(0) > 0]
        fam = []
        for key in [f["key"] for f in L.FAMILIES] + ["nc"]:
            ids = live[live["family"] == key]["id"].tolist()
            if not ids:
                continue
            fa = m.fund_aum[ids].sum(axis=1, min_count=1)
            ff = m.fund_flow_cum[ids].sum(axis=1)
            fam.append({"key": key, "label": self._family_label(key), "aum": _num(fa.get(end)), "n_funds": len(ids),
                        "var": {p: A.variation(fa, ff, m.period_start(end, p), end) for p in ("1M", "YTD", "1A")},
                        "series": A.monthly_points(fa, end)})
        movers = live.dropna(subset=["delta_1M"]).sort_values("delta_1M")
        flows = live.dropna(subset=["flows_YTD"]).sort_values("flows_YTD")
        cols = ["id", "name", "family", "aum", "delta_1M", "var_1M", "flows_YTD", "flows_1M"]
        n_parts = int((m.share_aum.loc[end].fillna(0) > 0).sum())
        return {
            "date": end.date().isoformat(), "aum": _num(aum.get(end)), "n_funds": int(len(live)), "n_parts": n_parts,
            "var": A.variations(m, aum, fc, end), "series": A.monthly_points(aum, end),
            "families": fam,
            "top_up": _records(movers.tail(5).iloc[::-1][cols]), "top_down": _records(movers.head(5)[cols]),
            "top_inflows": _records(flows.tail(5).iloc[::-1][cols]), "top_outflows": _records(flows.head(5)[cols]),
        }

    @lru_cache(maxsize=16)
    def city(self, d: str | None) -> dict:
        m, end = self.m, self.end(d)
        rows = A.fund_summary_rows(m, end)
        # Points mensuels de toute la période (pour rejouer l'évolution de la ville)
        s = m.fund_aum[:end]
        month_end = s.groupby([s.index.year, s.index.month]).tail(1)
        months = [x.date().isoformat() for x in month_end.index]
        funds = []
        for _, r in rows.iterrows():
            if r["id"] not in m.fund_aum.columns:
                continue
            series = month_end[r["id"]].fillna(0).round(0).tolist()
            if max(series + [0]) <= 0:
                continue
            funds.append({"id": r["id"], "name": r["name"], "family": r["family"], "aum": _num(r["aum"]) or 0.0,
                          "var_1M": _num(r.get("var_1M")), "var_YTD": _num(r.get("var_YTD")),
                          "manager": r.get("manager"), "range": r.get("range"), "sfdr": r.get("sfdr"), "series": series})
        return {"date": end.date().isoformat(), "months": months, "funds": funds}

    # ------------------------------------------------------------------ listes & filtres
    @lru_cache(maxsize=16)
    def _fund_table(self, d: str | None) -> pd.DataFrame:
        end = self.end(d)
        df = A.add_perf(self.m, A.fund_summary_rows(self.m, end), end)
        regs = self._registrations
        by_fund = regs[regs["active"]].groupby("fund_id")["country_fr"].apply(lambda s: sorted(set(s)))
        df["countries"] = df["id"].map(by_fund).apply(lambda v: v if isinstance(v, list) else [])
        return df

    def funds(self, d: str | None, filters: dict[str, str]) -> dict:
        df = self._fund_table(d)
        df = self._apply_filters(df, filters)
        live = df[df["aum"].fillna(0) > 0]
        total = float(live["aum"].sum())
        end = self.end(d)
        ids = live["id"].tolist()
        agg = None
        if ids:
            fa = self.m.fund_aum[ids].sum(axis=1, min_count=1)
            ff = self.m.fund_flow_cum[ids].sum(axis=1)
            agg = {"var": A.variations(self.m, fa, ff, end), "series": A.monthly_points(fa, end)}
        out = df.sort_values("aum", ascending=False, na_position="last")
        return {"date": end.date().isoformat(), "filters": filters, "labels": self._filter_labels(filters),
                "total_aum": total, "n_funds": len(live), "aggregate": agg, "funds": _records(out.drop(columns=[]))}

    def _apply_filters(self, df: pd.DataFrame, f: dict[str, str]) -> pd.DataFrame:
        for k, v in f.items():
            if not v:
                continue
            if k == "manager":
                n = L.norm(v)
                df = df[df["manager"].map(L.norm).eq(n) | df["backup"].map(L.norm).eq(n) | df["id"].isin(self._managed_by(v))]
            elif k == "country":
                n = L.country(v)[0]
                df = df[df["countries"].apply(lambda c: n in c)]
            elif k == "q":
                n = L.norm(v)
                df = df[df["name"].map(L.norm).str.contains(n, regex=False)]
            elif k in df.columns:
                n = L.norm(v)
                df = df[df[k].map(lambda x: L.norm(x) == n)]
        return df

    def _managed_by(self, name: str) -> list[str]:
        n = L.norm(name)
        cols = [c for c in ("Portfolio_Manager", "Portfolio_Manager_backup_1", "Portfolio_Manager_backup_2", "Portfolio_Manager_backup_3") if c in self.m.funds]
        mask = np.zeros(len(self.m.funds), dtype=bool)
        for c in cols:
            mask |= self.m.funds[c].map(L.norm).eq(n).to_numpy()
        return self.m.funds.index[mask].tolist()

    def _filter_labels(self, f: dict[str, str]) -> list[dict]:
        names = {**{k: v[0] for k, v in FUND_DIMS.items()}, "country": "Pays de commercialisation", "q": "Nom contient"}
        out = []
        for k, v in f.items():
            if not v:
                continue
            val = self._family_label(v) if k == "family" else (L.country(v)[0] if k == "country" else v)
            out.append({"key": k, "label": names.get(k, k), "value": val})
        return out

    # ------------------------------------------------------------------ répartitions
    @lru_cache(maxsize=64)
    def breakdown(self, d: str | None, dim: str) -> dict:
        m, end = self.m, self.end(d)
        if dim in SHARE_DIMS:
            return self._share_breakdown(end, dim)
        label, col = FUND_DIMS[dim]
        funds = m.funds
        key = funds["family"] if col == "family" else funds[col] if col in funds else pd.Series(index=funds.index, dtype=object)
        key = key.map(lambda v: _str(v) or "Non renseigné")
        cols = [c for c in m.fund_aum.columns if c in key.index]
        groups = key.reindex(cols)
        g_aum = m.fund_aum[cols].T.groupby(groups).sum(min_count=1).T
        g_flow = m.fund_flow_cum[cols].T.groupby(groups).sum().T
        return self._groups_payload(end, dim, label, g_aum, g_flow, groups)

    def _share_breakdown(self, end: pd.Timestamp, dim: str) -> dict:
        m = self.m
        label, col = SHARE_DIMS[dim]
        def val(jp):
            sid = m.link.at[jp, "pi_shareid"]
            if isinstance(sid, str) and sid in m.shares.index:
                v = m.shares.at[sid, col]
                if dim == "hedged":
                    b = L.to_bool(v)
                    return "Part couverte" if b else ("Part non couverte" if b is False else "Non renseigné")
                return _str(v) or "Non renseigné"
            return "Non renseigné"
        groups = pd.Series({jp: val(jp) for jp in m.share_aum.columns})
        g_aum = m.share_aum.T.groupby(groups).sum(min_count=1).T
        g_flow = m.share_flow_cum.T.groupby(groups).sum().T
        return self._groups_payload(end, dim, label, g_aum, g_flow, None)

    def _groups_payload(self, end, dim, label, g_aum, g_flow, groups) -> dict:
        m = self.m
        tot = float(g_aum.loc[end].fillna(0).sum())
        out = []
        for g in g_aum.columns:
            a = _num(g_aum.at[end, g])
            if not a:
                continue
            n = None
            if groups is not None:
                ids = groups[groups == g].index
                n = int((m.fund_aum.loc[end, ids].fillna(0) > 0).sum())
            out.append({"key": g, "label": self._family_label(g) if dim == "family" else g, "aum": a, "weight": a / tot if tot else None,
                        "n_funds": n, "var": {p: A.variation(g_aum[g], g_flow[g], m.period_start(end, p), end) for p in ("1M", "YTD", "1A")},
                        "series": A.monthly_points(g_aum[g], end)})
        out.sort(key=lambda x: -x["aum"])
        return {"date": end.date().isoformat(), "dim": dim, "label": label, "total": tot, "groups": out,
                "filterable": dim in FUND_DIMS}

    # ------------------------------------------------------------------ fiche fonds
    @lru_cache(maxsize=64)
    def fund(self, fid: str, d: str | None) -> dict | None:
        m, end = self.m, self.end(d)
        if fid not in m.funds.index:
            return None
        f = m.funds.loc[fid]
        row = f.to_dict()
        has_aum = fid in m.fund_aum.columns
        aum = m.fund_aum[fid] if has_aum else pd.Series(dtype=float)
        fc = m.fund_flow_cum[fid] if has_aum else pd.Series(dtype=float)
        jps = A.fund_jump_parts(m, fid)
        main = A.main_part(m, fid, end)
        perf = A.share_performance(m, main, end) if main else None
        perf_payload = None
        if perf:
            idx, bench = perf.pop("_index"), perf.pop("_bench")
            b = _rebase(bench)
            perf_payload = {**perf, "share": self._share_brief(main, end),
                            "index": A.daily_points(idx, end), "bench_index": A.daily_points(b, end) if b is not None else []}
        shares = [self._share_brief(jp, end) for jp in jps]
        # Parts du référentiel sans VL dans JUMP
        known = {s["id"] for s in shares}
        if row.get("referenced"):
            for sid, s in m.shares[m.shares["ProductID"] == fid].iterrows():
                if sid not in known:
                    shares.append(self._share_brief_ref(sid))
        shares.sort(key=lambda s: -(s.get("aum") or 0))
        regs = self._registrations
        fregs = regs[(regs["fund_id"] == fid)]
        countries = (fregs[fregs["active"]].groupby(["country_fr", "iso"]).agg(n=("pi_shareid", "nunique"))
                     .reset_index().sort_values("country_fr"))
        share_names = {s["id"]: s["name"] for s in shares}
        matrix = [{"share_id": sid, "share": share_names.get(sid, sid), "countries": sorted(set(g[g["active"]]["country_fr"]))}
                  for sid, g in fregs.groupby("pi_shareid")]
        comp = H.fund_composition(m, fid, end)
        payload = {
            "id": fid, "name": f["name"], "family": f["family"], "family_label": self._family_label(f["family"]),
            "referenced": bool(f["referenced"]), "date": end.date().isoformat(),
            "headline": {k: _str(row.get(c)) for k, c in (("range", "Fund_Range"), ("asset_class", "Asset_Class"), ("expertise", "Management_Expertise_Level_2"),
                                                         ("manager", "Portfolio_Manager"), ("backup", "Portfolio_Manager_backup_1"), ("sfdr", "ESG_SFDR_Article"),
                                                         ("sri", "Official_Risk_Scale"), ("sri_prev", "Previous_month_SRI"), ("domicile", "Domiciliation"),
                                                         ("legal_form", "Legal_Form"), ("currency", "Accounting_Currency"), ("creation", "Creation_Date"),
                                                         ("benchmark", "Benchmark_Name"), ("objective", "Investment_objective_FR"),
                                                         ("horizon", "Recommended_Investment_Period"), ("amf", "ESG_AMF_Category"), ("maturity", "Maturity_date"))},
            "aum": _num(aum.get(end)) if has_aum else None,
            "var": A.variations(m, aum, fc, end) if has_aum else None,
            "aum_series": A.daily_points(aum, end) if has_aum else [],
            "flows_monthly": _monthly_flows(fc, end) if has_aum else [],
            "performance": perf_payload,
            "shares": shares,
            "composition": comp,
            "esg": {"fields": F.render_list(row, F.ESG_FIELDS), "exclusions": F.render_flags(row, F.EXCLUSIONS), "pai": F.render_flags(row, F.PAI)},
            "distribution": {"countries": _records(countries), "matrix": matrix},
            "sections": F.render_sections(row, F.FUND_SECTIONS) if f["referenced"] else [],
            "validations": F.render_flags(row, F.VALIDATIONS) if f["referenced"] else [],
            "controls": [{"title": c["title"], "severity": c["severity"],
                          "details": [it["detail"] for it in c["items"] if it.get("fund_id") == fid]}
                         for c in self.controls(d)["controls"] if any(it.get("fund_id") == fid for it in c["items"])],
        }
        return payload

    def _share_brief(self, jp: str, end: pd.Timestamp) -> dict:
        m = self.m
        sid = m.link.at[jp, "pi_shareid"]
        ref = m.shares.loc[sid].to_dict() if isinstance(sid, str) and sid in m.shares.index else {}
        a = _num(m.share_aum.at[end, jp]) if jp in m.share_aum.columns else None
        start = m.period_start(end, "YTD")
        v = A.variation(m.share_aum[jp], m.share_flow_cum[jp], start, end)
        nav = A.nav_rows(m, jp)
        nav = nav[nav["DATE_VL"] <= end].tail(1)
        return {
            "id": self._share_key(jp), "jump": jp, "name": ref.get("Share_Name") or m.link.at[jp, "NOM_PART"],
            "isin": ref.get("ISIN_Code") or m.link.at[jp, "CODE_ISIN_PART"], "link": m.link.at[jp, "link"],
            "class": _str(ref.get("Share_Class")), "ccy": _str(ref.get("Subscription_Currency")) or (nav["DEVISE_VL"].iloc[0] if len(nav) else None),
            "hedged": L.to_bool(ref.get("Share_Hedged_Against_FX_Exposure")), "distribution": _str(ref.get("Income_Distribution")),
            "investor": _str(ref.get("Investor_Type")), "min_sub": _num(ref.get("Initial_Subscription_Minimum_Amount")),
            "ongoing": _num(ref.get("Ongoing_Charges_ex_post")), "mgmt_fee": _num(ref.get("Max_Financial_Management_Fees")),
            "perf_fee": L.to_bool(ref.get("Performance_fees")), "cutoff": _str(ref.get("Subscription_cut_off_time")),
            "settlement": _str(ref.get("Subscription_Settlement_Date")), "rating": _num(ref.get("Morningstar_rating")),
            "main": L.to_bool(ref.get("Main_Share")), "aum": a, "flows_YTD": v["flows"],
            "nav": _num(nav["VL_UNITAIRE"].iloc[0]) if len(nav) else None,
            "nav_date": nav["DATE_VL"].iloc[0].date().isoformat() if len(nav) else None,
            "status": _str(ref.get("Lifecycle")),
        }

    def _share_brief_ref(self, sid: str) -> dict:
        r = self.m.shares.loc[sid].to_dict()
        return {"id": sid, "jump": None, "name": r.get("Share_Name"), "isin": r.get("ISIN_Code"), "link": "ref",
                "class": _str(r.get("Share_Class")), "ccy": _str(r.get("Subscription_Currency")),
                "hedged": L.to_bool(r.get("Share_Hedged_Against_FX_Exposure")), "distribution": _str(r.get("Income_Distribution")),
                "investor": _str(r.get("Investor_Type")), "min_sub": _num(r.get("Initial_Subscription_Minimum_Amount")),
                "ongoing": _num(r.get("Ongoing_Charges_ex_post")), "mgmt_fee": _num(r.get("Max_Financial_Management_Fees")),
                "perf_fee": L.to_bool(r.get("Performance_fees")), "cutoff": _str(r.get("Subscription_cut_off_time")),
                "settlement": _str(r.get("Subscription_Settlement_Date")), "rating": _num(r.get("Morningstar_rating")),
                "main": L.to_bool(r.get("Main_Share")), "aum": None, "flows_YTD": None, "nav": None, "nav_date": None,
                "status": _str(r.get("Lifecycle"))}

    # ------------------------------------------------------------------ fiche part
    @lru_cache(maxsize=64)
    def share(self, share_key: str, d: str | None) -> dict | None:
        m, end = self.m, self.end(d)
        jps = self._jp_for_share(share_key)
        ref = m.shares.loc[share_key].to_dict() if share_key in m.shares.index else None
        if not jps and ref is None:
            return None
        jp = jps[0] if jps else None
        fid = m.link.at[jp, "fund_id"] if jp else (ref.get("ProductID") if ref and ref.get("ProductID") in m.funds.index else None)
        brief = self._share_brief(jp, end) if jp else self._share_brief_ref(share_key)
        perf = A.share_performance(m, jp, end) if jp else None
        perf_payload = None
        if perf:
            idx, bench = perf.pop("_index"), perf.pop("_bench")
            b = _rebase(bench)
            nav = A.share_nav_frame(m, jp)[:end]["VL_UNITAIRE"]
            perf_payload = {**perf, "index": A.daily_points(idx, end), "bench_index": A.daily_points(b, end) if b is not None else [],
                            "nav_series": A.daily_points(nav, end)}
        regs = self._registrations
        sregs = regs[regs["pi_shareid"] == share_key].sort_values("country_fr")
        return {
            **brief, "fund": self.fund_ref(fid) if fid in m.funds.index else None, "date": end.date().isoformat(),
            "var": A.variations(m, m.share_aum[jp], m.share_flow_cum[jp], end) if jp else None,
            "aum_series": A.daily_points(m.share_aum[jp], end) if jp else [],
            "performance": perf_payload,
            "sections": F.render_sections(ref, F.SHARE_SECTIONS) if ref else [],
            "platforms": F.render_flags(ref, F.PLATFORMS) if ref else [],
            "registrations": [{"country": r["country_fr"], "iso": r["iso"], "active": bool(r["active"]), "date": _str(r["Registration_Date"]),
                               "finma": L.to_bool(r["FINMA_Autorization"]), "comment": _str(r["Comment"])} for _, r in sregs.iterrows()],
        }

    # ------------------------------------------------------------------ distribution
    def _build_registrations(self) -> pd.DataFrame:
        m = self.m
        c = m.countries.copy()
        if c.empty:
            return pd.DataFrame(columns=["pi_shareid", "fund_id", "country_fr", "iso", "active"])
        lab = c["Country"].map(L.country)
        c["country_fr"] = lab.map(lambda t: t[0])
        c["iso"] = lab.map(lambda t: t[1])
        st = c["statecodename"].map(L.norm)
        stt = c["statuscodename"].map(L.norm)
        c["active"] = ~(st.isin(["inactive", "inactif"]) | stt.isin(["inactive", "inactif", "deregistered", "retire"]))
        c["fund_id"] = c["pi_shareid"].map(m.shares["ProductID"]) if "ProductID" in m.shares else None
        return c

    def _active_regs(self, exclude_rmm: bool) -> pd.DataFrame:
        regs = self._registrations
        act = regs[regs["active"]]
        return act[~act["fund_id"].isin(self.rmm)] if exclude_rmm else act

    @lru_cache(maxsize=16)
    def distribution(self, d: str | None, exclude_rmm: bool = False) -> dict:
        m, end = self.m, self.end(d)
        act = self._active_regs(exclude_rmm)
        share_aum = self._share_aum_by_ref(end)
        out = []
        for (cty, iso), g in act.groupby(["country_fr", "iso"]):
            sids = set(g["pi_shareid"])
            out.append({"country": cty, "iso": iso, "n_shares": len(sids), "n_funds": int(g["fund_id"].nunique()),
                        "aum_registered": float(sum(share_aum.get(s, 0.0) for s in sorted(sids, key=str)))})
        out.sort(key=lambda x: -x["n_shares"])
        shares = m.shares
        if exclude_rmm and "ProductID" in shares:
            shares = shares[~shares["ProductID"].isin(self.rmm)]
        plat = []
        for col, lab in F.PLATFORMS:
            if col in shares:
                flags = shares[col].map(L.to_bool)
                sids = shares.index[flags.fillna(False).astype(bool)]
                plat.append({"label": lab, "n_shares": int(len(sids)), "aum": float(sum(share_aum.get(s, 0.0) for s in sids))})
        rmm_live = [f for f in self.rmm if f in m.funds.index]
        return {"date": end.date().isoformat(), "countries": out, "platforms": plat,
                "n_shares_registered": int(act["pi_shareid"].nunique()), "n_funds_registered": int(act["fund_id"].nunique()),
                "sankey": self._sankey(act), "routes": self._routes(act), "timeline": self._timeline(act), "exclude_rmm": exclude_rmm,
                "rmm": {"n_funds": len(rmm_live), "funds": sorted(m.funds.loc[rmm_live, "name"].astype(str).tolist()),
                        "rule": {"columns": list(self.rmm_columns), "pattern": self.rmm_pattern}}}

    def _timeline(self, act: pd.DataFrame) -> dict:
        """Ouverture au fil des ans : enregistrements actifs par année d'enregistrement et pays ouverts cette année-là."""
        if act.empty:
            return {"years": [], "undated": 0}
        y = pd.to_datetime(act["Registration_Date"], errors="coerce").dt.year
        df = pd.DataFrame({"y": y.values, "cty": act["country_fr"].values, "iso": act["iso"].values, "fid": act["fund_id"].values})
        undated = int(df["y"].isna().sum())
        df = df.dropna(subset=["y"])
        df["y"] = df["y"].astype(int)
        first = df.groupby("cty")["y"].min()
        years, cum = [], 0
        for yr in range(int(df["y"].min()), int(df["y"].max()) + 1) if len(df) else []:
            g = df[df["y"] == yr]
            cum += len(g)
            years.append({"year": yr, "new": int(len(g)), "cumulative": cum, "n_funds": int(g["fid"].nunique()),
                          "opened": sorted(first[first == yr].index.tolist())})
        return {"years": years, "undated": undated}

    def _routes(self, act: pd.DataFrame) -> list[dict]:
        """Pour la carte : enregistrements actifs par pays de domiciliation du fonds et pays d'enregistrement."""
        m = self.m
        if act.empty or "Domiciliation" not in m.funds:
            return []
        dom = act["fund_id"].map(m.funds["Domiciliation"].map(_str))
        df = pd.DataFrame({"sid": act["pi_shareid"].values, "fid": act["fund_id"].values, "cty": act["country_fr"].values,
                           "iso": act["iso"].values, "dom": dom.values}).dropna(subset=["dom"])
        out = []
        for (d, c, iso), g in df.groupby(["dom", "cty", "iso"]):
            out.append({"domicile": d, "domicile_iso": L.country(d)[1], "country": c, "iso": iso,
                        "value": int(len(g)), "n_funds": int(g["fid"].nunique())})
        return sorted(out, key=lambda r: -r["value"])

    def _sankey(self, act: pd.DataFrame, top: int = 11) -> dict:
        """
        Flux famille de gestion → domiciliation du fonds → pays d'enregistrement.
        Unité : un enregistrement actif (une part autorisée dans un pays). Additive d'une colonne à l'autre,
        contrairement aux encours qui, eux, ne se répartissent pas par pays dans les données.
        """
        m = self.m
        if act.empty:
            return {"unit": "enregistrements", "nodes": [], "links": []}
        df = pd.DataFrame({"sid": act["pi_shareid"].values, "fid": act["fund_id"].values, "cty": act["country_fr"].values, "iso": act["iso"].values})
        df["fam"] = df["fid"].map(m.funds["family"]).fillna("nc")
        dom = m.funds["Domiciliation"].map(_str) if "Domiciliation" in m.funds else pd.Series(dtype=object)
        df["dom"] = df["fid"].map(dom).fillna("Domiciliation non renseignée")
        counts = df.groupby("cty")["sid"].count().sort_values(ascending=False)
        keep = set(counts.index[:top])
        n_other = int(counts.index.size - len(keep))
        df["dest"] = df["cty"].where(df["cty"].isin(keep), "Autres pays")
        iso = dict(zip(df["cty"], df["iso"]))
        nodes, index = [], {}

        def node(key: str, label: str, col: int, **kw):
            if key not in index:
                index[key] = len(nodes)
                nodes.append({"id": key, "label": label, "col": col, **kw})
            return index[key]

        fam_order = [f["key"] for f in L.FAMILIES] + ["nc"]
        for k in fam_order:
            g = df[df["fam"] == k]
            if len(g):
                node(f"f:{k}", self._family_label(k), 0, family=k, value=int(len(g)), n_funds=int(g["fid"].nunique()), n_shares=int(g["sid"].nunique()))
        for dname, g in df.groupby("dom"):
            node(f"d:{dname}", dname, 1, value=int(len(g)), n_funds=int(g["fid"].nunique()), n_shares=int(g["sid"].nunique()))
        for cname in [*counts.index[:top], "Autres pays"]:
            g = df[df["dest"] == cname]
            if len(g):
                node(f"c:{cname}", cname if cname != "Autres pays" else f"{n_other} autres pays", 2, iso=iso.get(cname), value=int(len(g)),
                     n_funds=int(g["fid"].nunique()), n_shares=int(g["sid"].nunique()), other=cname == "Autres pays")
        links = []
        for (a, b), g in df.groupby(["fam", "dom"]):
            links.append({"source": index[f"f:{a}"], "target": index[f"d:{b}"], "value": int(len(g)), "family": a,
                          "n_funds": int(g["fid"].nunique()), "n_shares": int(g["sid"].nunique())})
        for (a, b, f), g in df.groupby(["dom", "dest", "fam"]):
            links.append({"source": index[f"d:{a}"], "target": index[f"c:{b}"], "value": int(len(g)), "family": f,
                          "n_funds": int(g["fid"].nunique()), "n_shares": int(g["sid"].nunique())})
        return {"unit": "enregistrements", "nodes": nodes, "links": links}

    def _share_aum_by_ref(self, end: pd.Timestamp) -> dict[str, float]:
        m = self.m
        a = m.share_aum.loc[end].fillna(0)
        sid = m.link["pi_shareid"].reindex(a.index)
        return a.groupby(sid).sum().to_dict()

    @lru_cache(maxsize=64)
    def country(self, name: str, d: str | None, exclude_rmm: bool = False) -> dict:
        m, end = self.m, self.end(d)
        label = L.country(name)[0]
        regs = self._registrations
        g = regs[regs["country_fr"] == label]
        if exclude_rmm:
            g = g[~g["fund_id"].isin(self.rmm)]
        share_aum = self._share_aum_by_ref(end)
        rows = []
        for _, r in g.iterrows():
            sid = r["pi_shareid"]
            s = m.shares.loc[sid] if sid in m.shares.index else None
            fid = r["fund_id"]
            rows.append({"share_id": sid, "share": s["Share_Name"] if s is not None else sid, "isin": s["ISIN_Code"] if s is not None else None,
                         "ccy": _str(s["Subscription_Currency"]) if s is not None else None,
                         "investor": _str(s["Investor_Type"]) if s is not None else None,
                         "fund_id": fid if fid in m.funds.index else None,
                         "fund": m.funds.at[fid, "name"] if fid in m.funds.index else None,
                         "family": m.funds.at[fid, "family"] if fid in m.funds.index else "nc",
                         "active": bool(r["active"]), "date": _str(r["Registration_Date"]), "finma": L.to_bool(r["FINMA_Autorization"]),
                         "comment": _str(r["Comment"]), "aum": share_aum.get(sid), "rmm": fid in self.rmm})
        rows.sort(key=lambda x: (not x["active"], x["fund"] or "", x["share"] or ""))
        return {"date": end.date().isoformat(), "country": label, "iso": L.country(name)[1], "rows": rows, "exclude_rmm": exclude_rmm,
                "n_funds": len({r["fund_id"] for r in rows if r["active"]}), "n_shares": sum(r["active"] for r in rows)}

    # ------------------------------------------------------------------ portefeuilles
    @lru_cache(maxsize=16)
    def holdings(self, d: str | None) -> dict:
        end = self.end(d)
        out = H.house_holdings(self.m, end)
        for it in out.get("instruments", []):
            it["amount_eur"] = _num(it.get("amount_eur"))
            it["n_funds"] = int(it.get("n_funds") or 0)
        return {"date": end.date().isoformat(), **out}

    def instrument(self, key: str, d: str | None) -> dict | None:
        return H.instrument_detail(self.m, key, self.end(d))

    # ------------------------------------------------------------------ risques
    @lru_cache(maxsize=16)
    def risk(self, d: str | None) -> dict:
        m, end = self.m, self.end(d)
        df = self._fund_table(d)
        live = df[df["aum"].fillna(0) > 0]
        rows = []
        for _, r in live.iterrows():
            fid = r["id"]
            f = m.funds.loc[fid]
            jp = A.main_part(m, fid, end)
            p = A.share_performance(m, jp, end) if jp else None
            comp = H.fund_composition(m, fid, end)
            rows.append({
                "id": fid, "name": r["name"], "family": r["family"], "aum": r["aum"],
                "sri": _str(f.get("Official_Risk_Scale")), "sri_prev": _str(f.get("Previous_month_SRI")),
                "vol": p["risk"]["vol"] if p else None, "mdd": p["risk"]["mdd"] if p else None, "te": p["risk"]["te"] if p else None,
                "top10": comp["top10_weight"] if comp else None, "cash": comp["cash_weight"] if comp else None,
                "derivatives": comp["derivatives_expo"] if comp else None, "n_lines": comp["n_lines"] if comp else None,
                "global_exposure": _str(f.get("Global_Exposure_Calculation")),
                "leverage": L.to_bool(f.get("Leveraged_Financial_or_Contingent_Liability_Instr")),
                "liquidity": L.to_bool(f.get("Liquidity_risk")), "credit": L.to_bool(f.get("Credit_risk")),
                "counterparty": L.to_bool(f.get("Counterparty_risk")),
            })
        sri_dist = {}
        for r in rows:
            k = r["sri"] or "?"
            sri_dist.setdefault(k, {"sri": k, "aum": 0.0, "n": 0})
            sri_dist[k]["aum"] += r["aum"] or 0
            sri_dist[k]["n"] += 1
        return {"date": end.date().isoformat(), "funds": rows, "sri": sorted(sri_dist.values(), key=lambda x: x["sri"])}

    # ------------------------------------------------------------------ contrôles
    @lru_cache(maxsize=16)
    def controls(self, d: str | None) -> dict:
        m, end = self.m, self.end(d)
        out = []
        prods = m.funds[m.funds["referenced"]]
        name = lambda fid: m.funds.at[fid, "name"] if fid in m.funds.index else fid

        def add(key, title, audience, severity, description, items):
            out.append({"key": key, "title": title, "audience": audience, "severity": severity,
                        "description": description, "items": items, "count": len(items)})

        # 1. Changement de SRI
        items = []
        for fid, f in prods.iterrows():
            a, b = _str(f.get("Official_Risk_Scale")), _str(f.get("Previous_month_SRI"))
            if a and b and a != b:
                items.append({"fund_id": fid, "name": f["name"], "detail": f"SRI passé de {b} à {a}"})
        add("sri", "Indicateur de risque modifié ce mois-ci", "Risques", "warning",
            "Fonds dont le SRI diffère de celui du mois précédent.", items)

        # 2. Mandats des commissaires aux comptes
        items = []
        horizon = end + pd.DateOffset(months=12)
        for fid, f in prods.iterrows():
            t = pd.to_datetime(f.get("Auditors_Mandate_Termination_Date"), errors="coerce")
            if pd.notna(t) and t <= horizon:
                state = "échu" if t < end else "arrive à échéance"
                items.append({"fund_id": fid, "name": f["name"], "detail": f"Mandat de {f.get('Commissaire_Aux_Comptes') or 'CAC'} {state} le {t.strftime('%d/%m/%Y')}", "date": t.date().isoformat()})
        items.sort(key=lambda x: x["date"])
        add("auditor", "Mandats de commissaire aux comptes à renouveler", "Conformité", "info",
            "Mandats échus ou arrivant à échéance dans les 12 mois.", items)

        # 3. Circuit de validation incomplet
        items = []
        for fid, f in prods.iterrows():
            missing = [lab for col, lab in F.VALIDATIONS if col in f and L.to_bool(f.get(col)) is False]
            if missing:
                items.append({"fund_id": fid, "name": f["name"], "detail": "Validation manquante : " + ", ".join(missing)})
        for sid, s in m.shares.iterrows():
            missing = [lab for col, lab in F.VALIDATIONS if col in s and L.to_bool(s.get(col)) is False]
            if missing and s.get("ProductID") in m.funds.index:
                items.append({"fund_id": s["ProductID"], "share_id": sid, "name": s.get("Share_Name"),
                              "detail": f"Part {s.get('Share_Class') or ''} — validation manquante : " + ", ".join(missing)})
        add("validation", "Circuit de validation incomplet", "Conformité", "warning",
            "Fonds ou parts dont au moins une étape de validation du référentiel n'est pas cochée.", items)

        # 4. Parts avec encours sans pays d'enregistrement actif
        regs = self._registrations
        registered = set(regs[regs["active"]]["pi_shareid"])
        items = []
        a = m.share_aum.loc[end]
        for jp, v in a.items():
            if not v or np.isnan(v):
                continue
            sid = m.link.at[jp, "pi_shareid"]
            if isinstance(sid, str) and sid in m.shares.index and sid not in registered:
                fid = m.link.at[jp, "fund_id"]
                items.append({"fund_id": fid, "share_id": sid, "name": m.shares.at[sid, "Share_Name"],
                              "detail": f"{m.shares.at[sid, 'Share_Name']} ({m.shares.at[sid, 'ISIN_Code']}) — aucun pays d'enregistrement actif", "aum": float(v)})
        add("registration", "Parts investies sans pays d'enregistrement", "Conformité", "serious",
            "Parts portant des encours mais sans enregistrement actif dans le référentiel.", items)

        # 5. Qualité du rattachement JUMP ↔ référentiel
        items = []
        for jp, r in m.link.iterrows():
            v = a.get(jp)
            if r["link"] == "isin":
                items.append({"fund_id": r["fund_id"], "share_id": r["pi_shareid"], "name": r["NOM_PART"],
                              "detail": f"{r['NOM_PART']} rattachée par son ISIN ({r['CODE_ISIN_PART']}) : identifiant référentiel absent dans JUMP", "aum": _num(v)})
            elif r["link"] == "none":
                items.append({"fund_id": r["fund_id"] if r["fund_linked"] else None, "name": r["NOM_PART"],
                              "detail": f"{r['NOM_PART']} ({r['CODE_ISIN_PART']}) : part absente du référentiel produits", "aum": _num(v)})
        add("link", "Rattachement des parts JUMP au référentiel", "Données", "serious" if any(m.link["link"] == "none") else "info",
            "Parts rattachées uniquement par l'ISIN, ou introuvables dans le référentiel produits.", items)

        # 6. Cohérence des totaux JUMP
        items = []
        last = m.aum_raw[m.aum_raw["DATE_VL"] <= end]
        last = last[last["DATE_VL"] == last.groupby("ID_JUMP_FONDS")["DATE_VL"].transform("max")]
        for jf, g in last.groupby("ID_JUMP_FONDS"):
            parts = safe_float(numeric_series(g["ACTIF_NET_PART_EURO"]).sum(min_count=1))
            tot_s = numeric_series(g["ACTIF_NET_TOTAL_EURO"]).dropna()
            tot = safe_float(tot_s.iloc[0]) if len(tot_s) else None
            gap = safe_divide(abs(parts - tot), abs(tot)) if parts is not None and tot else None
            if gap is not None and gap > .005:
                fid = m.link[m.link["ID_JUMP_FONDS"] == jf]["fund_id"].iloc[0]
                items.append({"fund_id": fid, "name": name(fid),
                              "detail": f"Somme des parts {fmt_meur(parts)} ≠ actif net total {fmt_meur(tot)}"})
        add("totals", "Cohérence de l'actif net total", "Données", "warning",
            "Écart de plus de 0,5 % entre la somme des parts et l'actif net total publié.", items)

        # 7. VL en retard
        items = []
        lastnav = m.aum_raw[m.aum_raw["DATE_VL"] <= end].groupby("ID_JUMP_PART")["DATE_VL"].max()
        for jp, dt in lastnav.items():
            sid = m.link.at[jp, "pi_shareid"]
            freq = L.norm(m.shares.at[sid, "NAV_Frequency"]) if isinstance(sid, str) and sid in m.shares.index else ""
            status = L.norm(m.shares.at[sid, "statecodename"]) if isinstance(sid, str) and sid in m.shares.index else ""
            if status == "inactive":
                continue
            limit = 9 if "hebdo" in freq or "week" in freq else 4
            lag = (end - dt).days
            if lag > limit:
                items.append({"fund_id": m.link.at[jp, "fund_id"], "name": m.link.at[jp, "NOM_PART"],
                              "detail": f"{m.link.at[jp, 'NOM_PART']} — dernière VL au {dt.strftime('%d/%m/%Y')} ({lag} jours)"})
        add("stale", "VL non publiées récemment", "Middle office", "warning",
            "Parts actives dont la dernière VL date de plus de 4 jours (9 jours en valorisation hebdomadaire).", items)

        # 8. SFDR : engagements minimum non renseignés
        items = []
        for fid, f in prods.iterrows():
            art = L.norm(f.get("ESG_SFDR_Article"))
            if "9" in art and _num(f.get("PerCent_Min_SI_EET_20420")) is None:
                items.append({"fund_id": fid, "name": f["name"], "detail": "Article 9 sans part minimale d'investissements durables renseignée"})
            if "8" in art and _num(f.get("PerCent_Min_with_ES_Characteristics_EET_20400")) is None:
                items.append({"fund_id": fid, "name": f["name"], "detail": "Article 8 sans part minimale alignée E/S renseignée"})
        add("sfdr", "Engagements SFDR non renseignés", "Conformité", "warning",
            "Fonds article 8 ou 9 dont les engagements minimum EET sont vides.", items)

        # 9. Parts sans ISIN
        items = [{"fund_id": s.get("ProductID") if s.get("ProductID") in m.funds.index else None, "share_id": sid, "name": s.get("Share_Name"),
                  "detail": f"{s.get('Share_Name')} — ISIN non renseigné"} for sid, s in m.shares.iterrows() if not _str(s.get("ISIN_Code"))]
        add("isin", "Parts sans code ISIN", "Données", "warning", "Parts du référentiel dont le code ISIN est vide.", items)

        # 10. Qualité des chargements du Lakehouse
        items = []
        for _, r in m.dq.iterrows():
            v = _num(pd.to_numeric(r.get("TotalViolations"), errors="coerce"))
            dropped = _num(pd.to_numeric(r.get("TotalRowsDropped"), errors="coerce"))
            if (v or 0) > 0 or (dropped or 0) > 0:
                items.append({"fund_id": None, "name": r.get("MLVName"),
                              "detail": f"{_business_table(r.get('MLVName'))} : {int(v or 0)} violation(s), {int(dropped or 0)} ligne(s) écartée(s) au chargement du {_fr_date(r.get('RefreshDate'))}"})
        add("dq", "Contrôles qualité du chargement", "Données", "info", "Résultats des contrôles qualité du Lakehouse.", items)
        sev_order = {"serious": 0, "warning": 1, "info": 2}
        out.sort(key=lambda c: (c["count"] == 0, sev_order.get(c["severity"], 3)))
        return {"date": end.date().isoformat(), "controls": out}

    # ------------------------------------------------------------------ recherche
    @lru_cache(maxsize=4)
    def search_index(self, d: str | None) -> dict:
        m, end = self.m, self.end(d)
        df = self._fund_table(d)
        entries: list[dict] = []
        for _, r in df.iterrows():
            f = m.funds.loc[r["id"]]
            terms = [_str(f.get(c)) for c in ("Product_Global_ID", "LEI_Code", "AMF_Code", "CSSF_Code", "AIM_Portfolio_Code", "Umbrella_Name")]
            entries.append({"t": "fonds", "id": r["id"], "label": r["name"], "family": r["family"], "aum": _num(r["aum"]),
                            "sub": _join(r.get("range"), r.get("manager"), L.sfdr_short(_str(r.get("sfdr")))),
                            "terms": [x for x in terms if x],
                            "attrs": {k: _str(r.get(k)) for k in ("range", "asset_class", "expertise", "manager", "backup", "sfdr", "domicile", "legal_form", "sri")}
                            | {"countries": r.get("countries") or []}})
        for jp in m.link.index:
            b = self._share_brief(jp, end)
            fid = m.link.at[jp, "fund_id"]
            sid = m.link.at[jp, "pi_shareid"]
            extra = []
            if isinstance(sid, str) and sid in m.shares.index:
                s = m.shares.loc[sid]
                extra = [_str(s.get(c)) for c in ("Bloomberg_Ticker", "Wkn_Number", "Sedol_Code", "Code_RIC", "Swiss_Valor_Number")]
            entries.append({"t": "part", "id": b["id"], "label": b["name"], "family": m.funds.at[fid, "family"] if fid in m.funds.index else "nc",
                            "aum": b["aum"], "sub": _join(b["isin"], b["ccy"], b["distribution"]),
                            "terms": [x for x in [b["isin"], *extra] if x], "fund_id": fid})
        def facet(t, key, values, counter=None):
            for v, n in values.items():
                if not v:
                    continue
                entries.append({"t": t, "id": str(v), "label": str(v), "key": key, "sub": f"{n} fonds", "terms": []})
        live = df[df["aum"].fillna(0) > 0]
        managers: dict[str, int] = {}
        for c in ("manager", "backup"):
            for v in live[c].map(_str).dropna():
                managers[v] = managers.get(v, 0) + 1
        facet("gérant", "manager", managers)
        facet("gamme", "range", live["range"].value_counts().to_dict())
        facet("classe d'actifs", "asset_class", live["asset_class"].value_counts().to_dict())
        facet("expertise", "expertise", live["expertise"].value_counts().to_dict())
        facet("SFDR", "sfdr", live["sfdr"].value_counts().to_dict())
        facet("domicile", "domicile", live["domicile"].value_counts().to_dict())
        facet("forme juridique", "legal_form", live["legal_form"].value_counts().to_dict())
        for fam in L.FAMILIES:
            n = int((live["family"] == fam["key"]).sum())
            if n:
                entries.append({"t": "famille", "id": fam["key"], "label": fam["label"], "key": "family", "family": fam["key"], "sub": f"{n} fonds", "terms": [fam["short"]]})
        regs = self._registrations
        for cty, g in regs[regs["active"]].groupby("country_fr"):
            entries.append({"t": "pays", "id": cty, "label": cty, "key": "country", "sub": f"{g['fund_id'].nunique()} fonds commercialisés",
                            "terms": list({str(x) for x in g["Country"].dropna()})})
        inst = H.instruments_for_search(m, end)
        for _, r in inst.iterrows():
            entries.append({"t": "ligne", "id": r["instr_key"], "label": r["name"], "sub": f"Détenue par {r['n_funds']} fonds",
                            "terms": [x for x in [_str(r["isin"])] if x], "aum": _num(r["amount_eur"])})
        return {"date": end.date().isoformat(), "entries": entries}


def _fr_date(v: Any) -> str:
    t = pd.to_datetime(v, errors="coerce")
    return t.strftime("%d/%m/%Y") if pd.notna(t) else str(v or "")


def _join(*xs: Any) -> str:
    return " · ".join(v for v in (_str(x) for x in xs) if v)


def _business_table(name: Any) -> str:
    return {"JUMP_portfolio_aum": "Encours et VL", "JUMP_portfolio_holdings": "Inventaires", "PI_OUT_Share": "Référentiel des parts",
            "pi_out_product_active": "Référentiel des fonds", "PI_OUT_CountryOfRegistration": "Pays d'enregistrement"}.get(str(name), "Chargement")


def _monthly_flows(fc: pd.Series, end: pd.Timestamp) -> list[dict]:
    s = fc[:end]
    if s.empty:
        return []
    last = s.groupby([s.index.year, s.index.month]).tail(1)
    diff = last.diff()
    diff.iloc[0] = np.nan
    return [{"d": d.date().isoformat(), "v": float(v)} for d, v in diff.dropna().items()][-24:]


def _records(df: pd.DataFrame) -> list[dict]:
    out = []
    for r in df.to_dict("records"):
        rec = {}
        for k, v in r.items():
            if isinstance(v, list):
                rec[k] = v
            else:
                rec[k] = _clean(v)
                if isinstance(rec[k], float) and (math.isnan(rec[k]) or math.isinf(rec[k])):
                    rec[k] = None
        out.append(rec)
    return out
