"""Page Démo : les gérants, les commerciaux et la banque privée nommés par l'équipe.

Les personnes sont désignées par un nom saisi à la main (configurable : APP_DEMO_GERANTS, APP_DEMO_COMMERCIAUX,
APP_DEMO_BANQUE_PRIVEE). Ce nom n'est jamais utilisé pour rapprocher deux sources : il sert seulement à retrouver la
valeur telle qu'elle est écrite dans la colonne qui porte la personne (Portfolio_Manager de Product Info, Commercial du
passif). La correspondance tolère accents, casse et une lettre d'écart ; la page affiche toujours le nom tel qu'il est
écrit dans la donnée, et les homonymes ou variantes proches, pour qu'une personne valide le choix.

Vues du passif (nominatives, choix explicite de l'équipe) : calculées à la demande dans la source, filtrées par
paramètres, jamais mises en cache ni journalisées.
"""
from __future__ import annotations

import os
from difflib import SequenceMatcher
from typing import Any

import pandas as pd

from . import labels as L
from .passif import ENTREES, NOT_SET, SEGMENTS, SORTIES, _label, allowed_statuts, fold, segment_of, sens_label

DEFAULT_GERANTS = (("valor", "Valor", "Yoan Ignatiew"), ("fi", "Fixed Income", "Emmanuel Petit"))
DEFAULT_COMMERCIAUX = ("Fausto", "Alecio", "Quentin")
DEFAULT_BANQUE_PRIVEE = "Alain Massiera"


def config() -> dict:
    """Personnes de la démo. APP_DEMO_GERANTS = « Valor:Yoan Ignatiew;Fixed Income:Emmanuel Petit »."""
    g = os.environ.get("APP_DEMO_GERANTS", "").strip()
    gerants = [{"key": k, "label": lab, "name": n} for k, lab, n in DEFAULT_GERANTS]
    if g:
        gerants = []
        for i, part in enumerate(x for x in g.split(";") if x.strip()):
            lab, _, n = part.partition(":")
            gerants.append({"key": f"g{i}", "label": lab.strip(), "name": (n or lab).strip()})
    c = os.environ.get("APP_DEMO_COMMERCIAUX", "").strip()
    comms = [x.strip() for x in c.split(",") if x.strip()] if c else list(DEFAULT_COMMERCIAUX)
    bp = os.environ.get("APP_DEMO_BANQUE_PRIVEE", "").strip() or DEFAULT_BANQUE_PRIVEE
    return {"gerants": gerants, "commerciaux": comms, "banque_privee": bp}


# ------------------------------------------------------------------ retrouver un nom tel qu'il est écrit dans la donnée
def _tokens(s: str) -> list[str]:
    return [t for t in fold(s).replace("-", " ").split(" ") if t]


def _phon(w: str) -> str:
    """Clé phonétique simple (français, italien) : Alecio ≈ Alessio, Fausto ≈ Fosto, Massiera ≈ Masiera."""
    import re
    w = w.replace("eau", "o").replace("au", "o").replace("ph", "f").replace("qu", "k").replace("ck", "k").replace("y", "i")
    w = re.sub(r"c(?=[eiy])", "s", w).replace("c", "k").replace("z", "s").replace("w", "v").replace("h", "")
    return re.sub(r"(.)\1+", r"\1", w)


def _score(asked: str, cand: str) -> float:
    """1 : identique (accents et casse ignorés). Sinon, chaque mot demandé est rapproché du mot le plus proche du
    candidat ; le score est le plus faible de ces rapprochements (tous les mots doivent se retrouver)."""
    a, c = _tokens(asked), _tokens(cand)
    if not a or not c:
        return 0.0
    if a == c:
        return 1.0
    best = [max(max(SequenceMatcher(None, w, x).ratio(), 0.96 if _phon(w) == _phon(x) else 0.0) for x in c) for w in a]
    return min(best) * (0.98 if len(a) == len(c) else 0.95)


def resolve(asked: str, candidates: dict[str, float], threshold: float = 0.78) -> dict:
    """Nom demandé → valeur de la donnée. `candidates` : valeur → poids (encours, nombre de fonds) pour départager."""
    scored = sorted(((_score(asked, k), float(v or 0), k) for k, v in candidates.items() if k), reverse=True)
    ok = [x for x in scored if x[0] >= threshold]
    if not ok:
        near = [{"name": k, "score": round(s, 2)} for s, _, k in scored[:3] if s >= 0.55]
        return {"asked": asked, "found": None, "exact": False, "ambiguous": False, "alternatives": near}
    top = ok[0][0]
    same = [x for x in ok if abs(x[0] - top) < 1e-9]
    pick = max(same, key=lambda x: x[1])
    return {"asked": asked, "found": pick[2], "exact": fold(pick[2]) == fold(asked), "score": round(pick[0], 2),
            "ambiguous": len(same) > 1, "alternatives": [{"name": k, "score": round(s, 2)} for s, _, k in ok if k != pick[2]][:5]}


# ------------------------------------------------------------------ zones géographiques (par code ISO)
ZONES: list[tuple[str, set[str]]] = [
    ("France", {"FR"}),
    ("Benelux", {"BE", "LU", "NL"}),
    ("Suisse & Monaco", {"CH", "MC", "LI"}),
    ("Europe du Sud", {"IT", "ES", "PT", "GR", "MT", "CY", "AD", "SM"}),
    ("Allemagne & Europe du Nord", {"DE", "AT", "SE", "DK", "NO", "FI", "IS", "PL", "CZ"}),
    ("Royaume-Uni & Irlande", {"GB", "UK", "IE", "JE", "GG", "IM"}),
    ("Amériques", {"US", "CA", "BR", "MX", "CL", "PE", "UY", "AR", "CO"}),
    ("Moyen-Orient & Afrique", {"AE", "SA", "QA", "KW", "BH", "IL", "MA", "ZA", "EG", "LB"}),
    ("Asie-Pacifique", {"SG", "HK", "JP", "CN", "AU", "NZ", "KR", "TW", "IN"}),
]
ZONE_ORDER = [z for z, _ in ZONES] + ["Autres pays", NOT_SET]


def country_info(label: Any) -> tuple[str, str | None, str]:
    """(pays en français, ISO ou None, zone)."""
    lab = _label(label)
    if lab == NOT_SET:
        return NOT_SET, None, NOT_SET
    name, iso = L.country(lab)
    if iso == "??":
        return name, None, "Autres pays"
    zone = next((z for z, s in ZONES if iso in s), "Autres pays")
    return name, iso, zone


def _norm_isin(x: Any) -> str | None:
    return str(x).strip().upper().replace(" ", "") if x is not None and str(x).strip() else None


def _f(x: Any) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0.0
    return v if v == v else 0.0


def _pct(x: float, tot: float) -> float | None:
    return round(100.0 * x / tot, 2) if tot else None


TRX_DEDUP = ["reference", "compte", "isin", "sens", "statut", "date_centralisation", "montant_eur"]
TRX_FIELDS: tuple[tuple[str, str, str], ...] = (
    ("date", "date_centralisation", "date"), ("date_vl", "date_vl", "date"), ("client", "nom_client", "text"), ("compte", "compte", "id"),
    ("commercial", "commercial", "text"), ("classification", "classification", "text"), ("teneur", "teneur", "text"), ("pays", "pays", "text"),
    ("isin", "isin", "id"), ("sens", "sens", "text"), ("statut", "statut", "text"), ("v", "montant_eur", "num"), ("devise", "devise", "text"),
    ("quantite", "quantite", "num"), ("cours", "cours", "num"), ("reference", "reference", "id"),
)


class DemoPassif:
    """Lectures du passif pour la page Démo, sur un objet Passif déjà configuré."""

    def __init__(self, passif):
        self.p = passif

    # -- état
    def _ctx(self) -> dict | None:
        ready = self.p._ready()
        if ready is None:
            return None
        d, maps, iso = ready
        t = d.get("transactions") or {}
        return {"maps": maps, "as_of": iso, "trx": t if t.get("available") else None}

    def _fund(self, isin: Any) -> tuple[str | None, str | None]:
        i = _norm_isin(isin)
        fid = self.p.isin_to_fund.get(i or "")
        return fid, self.p.fund_names.get(fid) if fid else None

    def _share(self, isin: Any) -> str | None:
        return self.p.share_names.get(_norm_isin(isin) or "")

    # -- noms des commerciaux, tels qu'écrits dans le passif (avec l'encours de leur portefeuille)
    def commercials(self) -> dict[str, float]:
        ctx = self._ctx()
        if ctx is None:
            return {}
        mp = ctx["maps"]["position"]
        if mp["fields"].get("commercial", {}).get("col") is None:
            return {}
        g = self.p.reader.group("position", mp, {"c": ("text", "commercial")}, {"v": ("sum", "montant_eur")}, [("date_eq", "date", ctx["as_of"])])
        out: dict[str, float] = {}
        for r in g.itertuples(index=False):
            if r.c:
                out[str(r.c)] = out.get(str(r.c), 0.0) + _f(r.v)
        return out

    # -- positions et transactions d'un périmètre (un ou plusieurs commerciaux, ou des ISIN)
    def _positions(self, ctx: dict, inn: dict) -> pd.DataFrame:
        mp = ctx["maps"]["position"]
        g = self.p.reader.group("position", mp, {"client": ("text", "nom_client"), "pays": ("text", "pays"), "isin": ("id", "isin"),
                                                 "classification": ("text", "classification"), "classe": ("text", "classe_actif"),
                                                 "commercial": ("text", "commercial"), "y0": ("year", "premier_trade")},
                                {"n": ("count", None), "v": ("sum", "montant_eur"), "k": ("distinct", "compte")},
                                [("date_eq", "date", ctx["as_of"])], inn=inn)
        g = g.copy()
        g["v"] = pd.to_numeric(g["v"], errors="coerce").fillna(0.0)
        return g

    def _flows(self, ctx: dict, inn: dict, start: str) -> pd.DataFrame:
        mt = ctx["maps"]["transaction"]
        g = self.p.reader.group("transaction", mt, {"d": ("date", "date_centralisation"), "client": ("text", "nom_client"), "pays": ("text", "pays"),
                                                    "isin": ("id", "isin"), "sens": ("text", "sens"), "statut": ("text", "statut"),
                                                    "classe": ("text", "classe_actif"), "commercial": ("text", "commercial")},
                                {"n": ("count", None), "v": ("sumabs", "montant_eur")},
                                [("date_ge", "date_centralisation", start)], dedup=TRX_DEDUP, inn=inn)
        if g is None or g.empty:
            return pd.DataFrame(columns=["d", "client", "pays", "isin", "sens", "statut", "classe", "commercial", "n", "v", "dir"])
        allow = {fold(x) for x in allowed_statuts()}
        g = g.loc[g["statut"].map(lambda v: fold(_label(v)) in allow).astype(bool)].copy()
        g["v"] = pd.to_numeric(g["v"], errors="coerce").fillna(0.0)
        s = g["sens"].map(sens_label)
        g["dir"] = s.map(lambda x: 1 if x in ENTREES else -1 if x in SORTIES else 0)
        return g[g["dir"] != 0]

    @staticmethod
    def _starts(end: str) -> dict[str, str]:
        e = pd.Timestamp(end)
        return {"1M": (e - pd.DateOffset(months=1)).date().isoformat(), "3M": (e - pd.DateOffset(months=3)).date().isoformat(),
                "YTD": f"{e.year}-01-01", "1A": (e - pd.DateOffset(years=1)).date().isoformat()}

    @staticmethod
    def _sums(f: pd.DataFrame) -> dict:
        sub = float(f.loc[f["dir"] > 0, "v"].sum())
        red = float(f.loc[f["dir"] < 0, "v"].sum())
        return {"subscriptions": sub, "redemptions": red, "net": sub - red, "n": int(f["n"].sum()), "clients": int(f["client"].nunique())}

    def _by(self, f: pd.DataFrame, key: str, label=None) -> list[dict]:
        if f.empty:
            return []
        x = f.assign(k=f[key].map(label) if label else f[key], s=f["v"].where(f["dir"] > 0, 0.0), r=f["v"].where(f["dir"] < 0, 0.0))
        g = x.groupby("k", dropna=False).agg(s=("s", "sum"), r=("r", "sum"), n=("n", "sum")).reset_index()
        g["net"] = g["s"] - g["r"]
        g = g.sort_values("net", ascending=False)
        return [{"key": _label(r.k), "subscriptions": float(r.s), "redemptions": float(r.r), "net": float(r.net), "n": int(r.n)} for r in g.itertuples(index=False)]

    def _monthly(self, f: pd.DataFrame, end: str, months: int = 13) -> list[dict]:
        e = pd.Timestamp(end)
        keys = [(e - pd.DateOffset(months=i)).strftime("%Y-%m") for i in range(months - 1, -1, -1)]
        m = f.assign(m=f["d"].astype(str).str[:7])
        out = []
        for k in keys:
            x = m[m["m"] == k]
            sub, red = float(x.loc[x["dir"] > 0, "v"].sum()), float(x.loc[x["dir"] < 0, "v"].sum())
            out.append({"m": k, "subscriptions": sub, "redemptions": red, "net": sub - red, "n": int(x["n"].sum())})
        return out

    def _zone_rows(self, f: pd.DataFrame) -> list[dict]:
        if f.empty:
            return []
        z = f.assign(zone=f["pays"].map(lambda v: country_info(v)[2]))
        rows = {r["key"]: r for r in self._by(z, "zone")}
        out = []
        for zone in ZONE_ORDER:
            if zone not in rows:
                continue
            sub = z[z["zone"] == zone]
            countries = []
            for c in self._by(sub, "pays", lambda v: country_info(v)[0]):
                countries.append({**c, "iso": country_info(c["key"])[1]})
            out.append({**rows[zone], "countries": countries})
        return out

    def _funds_rows(self, f: pd.DataFrame, top: int = 12) -> list[dict]:
        rows = self._by(f.assign(isin=f["isin"].map(_norm_isin)), "isin")
        out = []
        for r in rows:
            fid, name = self._fund(r["key"] if r["key"] != NOT_SET else None)
            out.append({**r, "isin": r["key"], "fund": fid, "name": name or "Fonds hors référentiel", "share": self._share(r["key"])})
        # par fonds (plusieurs parts)
        agg: dict[str, dict] = {}
        for r in out:
            k = r["fund"] or r["isin"]
            e = agg.setdefault(k, {"fund": r["fund"], "name": r["name"], "subscriptions": 0.0, "redemptions": 0.0, "net": 0.0, "n": 0})
            for x in ("subscriptions", "redemptions", "net", "n"):
                e[x] += r[x]
        lst = sorted(agg.values(), key=lambda e: -e["net"])
        return lst if len(lst) <= top * 2 else lst[:top] + lst[-top:]

    # ------------------------------------------------------------------ vue d'un commercial
    def commercial(self, name: str) -> dict:
        ctx = self._ctx()
        if ctx is None:
            return {"available": False, "reason": "Passif non publié."}
        inn = {"commercial": [name]}
        pos = self._positions(ctx, inn)
        tot = float(pos["v"].sum())
        trx = ctx["trx"]
        flows, periods, end = None, {}, None
        if trx:
            end = trx["last"]
            st = self._starts(end)
            f = self._flows(ctx, inn, min(st.values()))
            flows = f
            for p, s in st.items():
                w = f[f["d"].astype(str) >= s]
                periods[p] = {"start": s, **self._sums(w), "zones": self._zone_rows(w), "funds": self._funds_rows(w, 5)}
        clients = self._clients(pos, flows, end)
        zones_hold = self._hold_zones(pos)
        return {"available": True, "nominatif": True, "name": name, "as_of": ctx["as_of"], "flows_end": end,
                "flows_available": trx is not None, "encours": tot, "positions": int(pos["n"].sum()),
                "clients_count": int(pos["client"].nunique()), "accounts": int(pos["k"].sum()) if len(pos) else 0,
                "periods": periods, "monthly": self._monthly(flows, end) if flows is not None else [],
                "holdings_zones": zones_hold, "clients": clients,
                "segments": self._segments(pos)}

    def _hold_zones(self, pos: pd.DataFrame) -> list[dict]:
        if pos.empty:
            return []
        tot = float(pos["v"].sum())
        x = pos.assign(info=pos["pays"].map(country_info))
        x["zone"] = x["info"].map(lambda t: t[2])
        x["cn"] = x["info"].map(lambda t: t[0])
        x["iso"] = x["info"].map(lambda t: t[1])
        out = []
        for zone in ZONE_ORDER:
            z = x[x["zone"] == zone]
            if z.empty:
                continue
            cs = z.groupby(["cn"], dropna=False).agg(v=("v", "sum"), c=("client", "nunique"), iso=("iso", "first")).reset_index().sort_values("v", ascending=False)
            out.append({"zone": zone, "encours": float(z["v"].sum()), "pct": _pct(float(z["v"].sum()), tot), "clients": int(z["client"].nunique()),
                        "countries": [{"country": r.cn, "iso": r.iso, "encours": float(r.v), "pct": _pct(float(r.v), tot), "clients": int(r.c)} for r in cs.itertuples(index=False)]})
        return sorted(out, key=lambda r: -r["encours"])

    def _segments(self, pos: pd.DataFrame) -> list[dict]:
        if pos.empty:
            return []
        tot = float(pos["v"].sum())
        g = pos.assign(s=pos["classification"].map(lambda v: SEGMENTS[segment_of(v)])).groupby("s").agg(v=("v", "sum"), c=("client", "nunique")).reset_index()
        return [{"segment": r.s, "encours": float(r.v), "pct": _pct(float(r.v), tot), "clients": int(r.c)} for r in g.sort_values("v", ascending=False).itertuples(index=False)]

    def _clients(self, pos: pd.DataFrame, flows: pd.DataFrame | None, end: str | None, limit: int = 300) -> list[dict]:
        if pos.empty:
            return []
        tot = float(pos["v"].sum())
        p = pos.assign(isin=pos["isin"].map(_norm_isin), client=pos["client"].map(_label))
        fl = {}
        last = {}
        if flows is not None and not flows.empty and end:
            s1 = self._starts(end)["1A"]
            w = flows[flows["d"].astype(str) >= s1].assign(client=lambda d: d["client"].map(_label))
            w = w.assign(sv=w["v"] * w["dir"])
            fl = w.groupby("client")["sv"].sum().to_dict()
            last = flows.assign(client=flows["client"].map(_label)).groupby("client")["d"].max().astype(str).to_dict()
        out = []
        for cl, g in p.groupby("client"):
            v = float(g["v"].sum())
            info = country_info(g.sort_values("v", ascending=False)["pays"].iloc[0])
            seg = SEGMENTS[segment_of(g.sort_values("v", ascending=False)["classification"].iloc[0])]
            by_isin = g.groupby("isin").agg(v=("v", "sum"), n=("n", "sum")).reset_index().sort_values("v", ascending=False)
            funds: dict[str, dict] = {}
            for r in by_isin.itertuples(index=False):
                fid, name = self._fund(r.isin)
                k = fid or r.isin or NOT_SET
                e = funds.setdefault(k, {"fund": fid, "name": name or "Fonds hors référentiel", "encours": 0.0, "shares": []})
                e["encours"] += float(r.v)
                e["shares"].append({"isin": r.isin, "share": self._share(r.isin), "encours": float(r.v)})
            fl_list = sorted(funds.values(), key=lambda e: -e["encours"])
            for e in fl_list:
                e["pct"] = _pct(e["encours"], v)
            classes = g.groupby("classe")["v"].sum().sort_values(ascending=False)
            out.append({"client": cl, "encours": v, "pct": _pct(v, tot), "country": info[0], "iso": info[1], "zone": info[2], "segment": seg,
                        "accounts": int(g["k"].max()) if len(g) else 0, "funds": fl_list,
                        "classes": [{"key": _label(k), "encours": float(x)} for k, x in classes.items()],
                        "net_1a": fl.get(cl), "last_op": last.get(cl)})
        out.sort(key=lambda r: -r["encours"])
        return out[:limit]

    # ------------------------------------------------------------------ banque privée : ce qu'ils détiennent, ce qu'ils investissent
    def private_bank(self, name: str | None, scope: str = "commercial") -> dict:
        ctx = self._ctx()
        if ctx is None:
            return {"available": False, "reason": "Passif non publié."}
        inn = {"commercial": [name]} if scope == "commercial" and name else {}
        pos = self._positions(ctx, inn)
        if scope == "segment":
            pos = pos[pos["classification"].map(lambda v: segment_of(v) == "prive")]
        tot = float(pos["v"].sum())
        p = pos.assign(isin=pos["isin"].map(_norm_isin))
        p["fund"] = p["isin"].map(lambda i: self._fund(i)[0])
        # Ce qu'ils détiennent
        by_fund = []
        for k, g in p.groupby(p["fund"].fillna(p["isin"].fillna(NOT_SET))):
            fid, fname = self._fund(g["isin"].iloc[0])
            by_fund.append({"fund": fid, "name": fname or "Fonds hors référentiel", "encours": float(g["v"].sum()), "pct": _pct(float(g["v"].sum()), tot),
                            "clients": int(g["client"].nunique()), "classe": _label(g["classe"].mode().iloc[0] if g["classe"].notna().any() else None)})
        by_fund.sort(key=lambda r: -r["encours"])
        classes = p.groupby(p["classe"].map(_label))["v"].sum().sort_values(ascending=False)
        # Ancienneté des positions (année du premier achat)
        age = p.assign(y=pd.to_numeric(p["y0"], errors="coerce")).dropna(subset=["y"]).groupby("y")["v"].sum().sort_index()
        as_of_y = int(ctx["as_of"][:4])
        new_money = float(p.loc[pd.to_numeric(p["y0"], errors="coerce") >= as_of_y, "v"].sum())
        clients = self._clients(pos, None, None, limit=200)
        conc = [c["encours"] for c in clients]
        # matrice clients × fonds (12 × 8)
        top_c = [c["client"] for c in clients[:12]]
        top_f = [f["fund"] or f["name"] for f in by_fund[:8]]
        mat = []
        for c in clients[:12]:
            row = {f["fund"] or f["name"]: f["encours"] for f in c["funds"]}
            mat.append([row.get(k, 0.0) for k in top_f])
        out = {"available": True, "nominatif": True, "scope": scope, "name": name, "as_of": ctx["as_of"], "encours": tot,
               "clients_count": int(p["client"].nunique()), "positions": int(p["n"].sum()), "funds_count": len(by_fund),
               "by_fund": by_fund[:20], "classes": [{"key": k, "encours": float(v), "pct": _pct(float(v), tot)} for k, v in classes.items()],
               "zones": self._hold_zones(pos), "segments": self._segments(pos),
               "vintage": [{"year": int(y), "encours": float(v), "pct": _pct(float(v), tot)} for y, v in age.items()],
               "new_money_ytd": new_money,
               "concentration": {"top1": _pct(sum(conc[:1]), tot), "top5": _pct(sum(conc[:5]), tot), "top10": _pct(sum(conc[:10]), tot)},
               "matrix": {"clients": top_c, "funds": [next((f["name"] for f in by_fund if (f["fund"] or f["name"]) == k), k) for k in top_f],
                          "fund_ids": [next((f["fund"] for f in by_fund if (f["fund"] or f["name"]) == k), None) for k in top_f], "values": mat},
               "clients": clients[:60], "flows_available": False}
        trx = ctx["trx"]
        if trx:
            end = trx["last"]
            st = self._starts(end)
            f = self._flows(ctx, inn, st["1A"])
            if scope == "segment":
                cls = set(pos["client"].dropna())
                f = f[f["client"].isin(cls)]
            out.update({"flows_available": True, "flows_end": end,
                        "periods": {k: {"start": s, **self._sums(f[f["d"].astype(str) >= s])} for k, s in st.items()},
                        "monthly": self._monthly(f, end),
                        "rotation": self._funds_rows(f, 8),
                        "flow_classes": self._by(f, "classe", _label),
                        "latest": self._latest(ctx, inn, st["3M"], scope_clients=set(pos["client"].dropna()) if scope == "segment" else None)})
        return out

    def _latest(self, ctx: dict, inn: dict, start: str, limit: int = 14, scope_clients: set | None = None, only_subs: bool = False) -> list[dict]:
        mt = ctx["maps"]["transaction"]
        df = self.p.reader.rows("transaction", mt, TRX_FIELDS, [("date_ge", "date_centralisation", start)], inn=inn,
                                order="date_centralisation", cap=600)
        if df is None or df.empty:
            return []
        allow = {fold(x) for x in allowed_statuts()}
        df = df[df["statut"].map(lambda v: fold(_label(v)) in allow).astype(bool)]
        df = df.assign(sens=df["sens"].map(sens_label))
        df = df[df["sens"].isin(ENTREES if only_subs else ENTREES | SORTIES)]
        if scope_clients is not None:
            df = df[df["client"].isin(scope_clients)]
        df = df.drop_duplicates(subset=[c for c in ("reference", "isin", "sens", "v", "compte") if c in df.columns])
        out = []
        for r in df.head(limit).itertuples(index=False):
            fid, fname = self._fund(r.isin)
            info = country_info(r.pays)
            out.append({"date": r.date, "date_vl": r.date_vl, "client": r.client, "commercial": r.commercial, "segment": SEGMENTS[segment_of(r.classification)],
                        "teneur": r.teneur, "country": info[0], "iso": info[1], "isin": r.isin, "share": self._share(r.isin), "fund": fid, "name": fname,
                        "sens": r.sens, "amount": _f(r.v), "devise": r.devise})
        return out

    # ------------------------------------------------------------------ gérants : souscriptions récentes et détention par zone
    def funds_side(self, fund_ids: list[str]) -> dict:
        ctx = self._ctx()
        if ctx is None:
            return {"available": False, "reason": "Passif non publié."}
        ids = set(fund_ids)
        isins = sorted(i for i, f in self.p.isin_to_fund.items() if f in ids)
        out: dict = {"available": True, "nominatif": True, "as_of": ctx["as_of"], "zones": [], "latest": [], "flows_available": False}
        mp = ctx["maps"]["position"]
        base = self.p._breakdown_base(mp, ctx["as_of"])
        b = base[base["fund"].isin(ids)]
        tot = float(b["v"].sum())
        out["passif_total"] = tot
        if tot > 0:
            x = b.assign(info=b["pays"].map(country_info))
            x["zone"], x["cn"], x["iso"] = x["info"].map(lambda t: t[2]), x["info"].map(lambda t: t[0]), x["info"].map(lambda t: t[1])
            zones = []
            for zone, z in x.groupby("zone"):
                cs = z.groupby("cn").agg(v=("v", "sum"), n=("n", "sum"), iso=("iso", "first")).reset_index().sort_values("v", ascending=False)
                per_fund = z.groupby("fund")["v"].sum().to_dict()
                zones.append({"zone": zone, "encours": float(z["v"].sum()), "pct": _pct(float(z["v"].sum()), tot), "positions": int(z["n"].sum()),
                              "funds": {k: float(v) for k, v in per_fund.items()},
                              "countries": [{"country": r.cn, "iso": r.iso, "encours": float(r.v), "pct": _pct(float(r.v), tot), "positions": int(r.n)}
                                            for r in cs.itertuples(index=False)]})
            out["zones"] = sorted(zones, key=lambda r: -r["encours"])
        trx = ctx["trx"]
        if trx and isins:
            end = trx["last"]
            st = self._starts(end)
            f = self._flows(ctx, {"isin": isins}, st["1A"])
            out.update({"flows_available": True, "flows_end": end,
                        "periods": {k: {"start": s, **self._sums(f[f["d"].astype(str) >= s])} for k, s in st.items()},
                        "monthly": self._monthly(f, end),
                        "latest": self._latest(ctx, {"isin": isins}, st["3M"], limit=12, only_subs=True)})
        return out
