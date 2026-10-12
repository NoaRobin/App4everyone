"""Page Démo : une page par gestion, par territoire de ventes et pour la banque privée RMM.

- Gestion : un gérant principal retrouvé dans Product Info (Portfolio_Manager) tel qu'il y est écrit — tolérance aux
  accents, à la casse et à une lettre d'écart, homonymes signalés — ou toute une famille de gestion (Fixed Income).
- Ventes : un territoire = une liste de pays (APP_DEMO_COMMERCIAUX) ; on lit les porteurs dont le pays du compte est dans
  ce territoire, tous canaux confondus. Aucun rapprochement par nom de commercial.
- Banque privée : le canal Rothschild Martin Maurel = comptes du passif tenus ou classés RMM (jamais « hors RMM ») ;
  revenus = encours × frais de la part détenue.

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

# Gestion : Valor = les fonds dont Yoann Ignatiew est gérant principal ; Fixed Income = toute la famille de gestion.
DEFAULT_GERANTS = (("valor", "Valor", "Yoann Ignatiew", "Gérant principal", None),
                   ("fi", "Fixed Income", "Emmanuel Petit", "Responsable de la gestion obligataire", "fi"))
# Ventes : un périmètre géographique par responsable commercial (rothschildandco.com, pages équipes et contacts).
DEFAULT_COMMERCIAUX = (
    ("France", "Fausto Trevisan", "Head of Sales France", ("FR",)),
    ("Europe du Sud", "Alessio Coppola", "Head of Sales Southern Europe", ("IT", "ES", "PT")),
    ("Europe du Nord", "Quentin Piloy", "Head of Sales Northern Europe", ("BE", "LU", "NL", "CH", "DE", "AT", "SE", "DK", "NO", "FI")),
)
DEFAULT_BANQUE_PRIVEE = "Alain Massiera"
# Canal Rothschild Martin Maurel au passif : compte tenu par RMM (teneur) ou classé RMM (classification du compte)
RMM_CHANNEL = r"\bRMM\b|martin\s*maurel"


def config() -> dict:
    """Personnes et périmètres de la démo.
    APP_DEMO_GERANTS = « Valor:Yoann Ignatiew;Fixed Income:Emmanuel Petit:famille=fi »
    APP_DEMO_COMMERCIAUX = « France:Fausto Trevisan:FR;Europe du Sud:Alessio Coppola:IT,ES,PT »"""
    g = os.environ.get("APP_DEMO_GERANTS", "").strip()
    gerants = [{"key": k, "label": lab, "name": n, "role": role, "family": fam} for k, lab, n, role, fam in DEFAULT_GERANTS]
    if g:
        gerants = []
        for i, part in enumerate(x for x in g.split(";") if x.strip()):
            bits = [b.strip() for b in part.split(":")]
            fam = next((b.split("=", 1)[1] for b in bits[2:] if b.startswith("famille=")), None)
            gerants.append({"key": f"g{i}", "label": bits[0], "name": bits[1] if len(bits) > 1 else bits[0],
                            "role": "Responsable" if fam else "Gérant principal", "family": fam})
    c = os.environ.get("APP_DEMO_COMMERCIAUX", "").strip()
    comms = [{"theme": t, "name": n, "title": ti, "countries": list(cs)} for t, n, ti, cs in DEFAULT_COMMERCIAUX]
    if c:
        comms = []
        for part in (x for x in c.split(";") if x.strip()):
            bits = [b.strip() for b in part.split(":")]
            comms.append({"theme": bits[0], "name": bits[1] if len(bits) > 1 else "", "title": None,
                          "countries": [x.strip().upper() for x in (bits[2] if len(bits) > 2 else "").split(",") if x.strip()]})
    bp = os.environ.get("APP_DEMO_BANQUE_PRIVEE", "").strip() or DEFAULT_BANQUE_PRIVEE
    return {"gerants": gerants, "commerciaux": comms, "banque_privee": bp}


def slug(s: str) -> str:
    """« Italie & Suisse » → « italie-suisse »."""
    import re
    return re.sub(r"[^a-z0-9]+", "-", fold(s)).strip("-") or "page"


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

    def _raw_countries(self, ctx: dict, isos: set[str]) -> list[str]:
        """Libellés de pays tels qu'écrits au passif (positions et transactions) dont le code ISO est dans le périmètre."""
        vals: set[str] = set()
        mp = ctx["maps"]["position"]
        g = self.p.reader.group("position", mp, {"pays": ("text", "pays")}, {"n": ("count", None)}, [("date_eq", "date", ctx["as_of"])])
        vals |= {str(x) for x in g["pays"].dropna()}
        if ctx["trx"]:
            st = self._starts(ctx["trx"]["last"])["1A"]
            t = self.p.reader.group("transaction", ctx["maps"]["transaction"], {"pays": ("text", "pays")}, {"n": ("count", None)},
                                    [("date_ge", "date_centralisation", st)])
            vals |= {str(x) for x in t["pays"].dropna()}
        return sorted(v for v in vals if country_info(v)[1] in isos)

    def territory(self, isos: list[str]) -> dict:
        """Ventes d'un périmètre géographique : porteurs dont le pays du compte est dans le périmètre (tous canaux)."""
        ctx = self._ctx()
        if ctx is None:
            return {"available": False, "reason": "Passif non publié."}
        raw = self._raw_countries(ctx, {x.upper() for x in isos})
        if not raw:
            return {"available": False, "reason": "Aucun porteur de ce périmètre au passif."}
        out = self._book(ctx, {"pays": raw}, by_country=True)
        out["countries_raw"] = raw
        return out

    def _book(self, ctx: dict, inn: dict, by_country: bool = False) -> dict:
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
                zones = self._country_rows(w) if by_country else self._zone_rows(w)
                periods[p] = {"start": s, **self._sums(w), "zones": zones, "funds": self._funds_rows(w, 5)}
        return {"available": True, "nominatif": True, "as_of": ctx["as_of"], "flows_end": end,
                "flows_available": trx is not None, "encours": tot, "positions": int(pos["n"].sum()),
                "clients_count": int(pos["client"].nunique()), "accounts": int(pos["k"].sum()) if len(pos) else 0,
                "periods": periods, "monthly": self._monthly(flows, end) if flows is not None else [],
                "holdings_zones": self._hold_zones(pos), "clients": self._clients(pos, flows, end), "segments": self._segments(pos)}

    def _country_rows(self, f: pd.DataFrame) -> list[dict]:
        rows = self._by(f.assign(cn=f["pays"].map(lambda v: country_info(v)[0])), "cn") if not f.empty else []
        return [{**r, "iso": country_info(r["key"])[1]} for r in rows]

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

    # ------------------------------------------------------------------ banque privée Rothschild Martin Maurel (le canal)
    def rmm_bank(self, rates: dict[str, float], rmm_funds: set[str], house_revenue: float | None = None,
                 pattern: str = RMM_CHANNEL) -> dict:
        """Ce que la banque privée Rothschild Martin Maurel investit dans nos fonds, et ce que cela rapporte.

        Canal RMM au passif : comptes tenus par RMM (Teneur de compte) ou classés RMM (Classification du compte, par
        exemple « RMM/Banque Privée », « TA/Banque Privée et OPC déposés RMM »). Revenus estimés : encours × taux de frais
        de gestion de la part (même règle que les revenus de la maison). Fonds RMM : la règle du filtre RMM."""
        import re
        rx = re.compile(pattern, re.I)
        # Seulement Rothschild Martin Maurel : teneur RMM, ou classification dont RMM est la catégorie (« RMM/OPC »,
        # « RMM/Banque Privée »…). Les classifications qui ne font que mentionner RMM (« EOC/Passage Global RMM »,
        # « TA/… déposés RMM », « … hors RMM ») relèvent d'un autre canal et ne sont pas comptées.
        own = re.compile(r"^\s*(rmm|rothschild\s*martin\s*maurel|martin\s*maurel)\b", re.I)
        hit_ten = lambda v: bool(v) and bool(rx.search(fold(v))) and not re.search(r"hors\s+rmm", fold(v))   # noqa: E731
        hit_cls = lambda v: bool(v) and bool(own.search(fold(v)))   # noqa: E731
        hit = hit_cls
        # comptes tenus par RMM : retenus seulement si leur classification ne les range pas déjà (RMM ou autre canal RMM)
        mentions = lambda v: bool(v) and bool(rx.search(fold(v)))   # noqa: E731
        ctx = self._ctx()
        if ctx is None:
            return {"available": False, "reason": "Passif non publié."}
        mp = ctx["maps"]["position"]
        g = self.p.reader.group("position", mp, {"classification": ("text", "classification"), "teneur": ("text", "teneur"), "isin": ("id", "isin"),
                                                 "pays": ("text", "pays"), "classe": ("text", "classe_actif"), "y0": ("year", "premier_trade")},
                                {"n": ("count", None), "v": ("sum", "montant_eur"), "k": ("distinct", "compte")}, [("date_eq", "date", ctx["as_of"])])
        g = g.copy()
        g["v"] = pd.to_numeric(g["v"], errors="coerce").fillna(0.0)
        tot_all = float(g["v"].sum())
        g["rmm"] = g["classification"].map(hit_cls) | (g["teneur"].map(hit_ten) & ~g["classification"].map(mentions))
        ch = g[g["rmm"]].copy()
        if ch.empty:
            return {"available": False, "reason": "Aucun compte tenu ou classé Rothschild Martin Maurel au passif."}
        ch["isin"] = ch["isin"].map(_norm_isin)
        ch["fund"] = ch["isin"].map(lambda i: self._fund(i)[0])
        ch["rate"] = ch["isin"].map(lambda i: rates.get(i or ""))
        ch["rev"] = ch["v"] * ch["rate"].fillna(0.0) / 100.0
        enc = float(ch["v"].sum())
        rev = float(ch["rev"].sum())
        rated = float(ch.loc[ch["rate"].notna(), "v"].sum())
        matched_cls = sorted({str(x) for x in ch["classification"].dropna() if hit(x)})
        matched_ten = sorted({str(x) for x in ch["teneur"].dropna() if hit_ten(x)})

        def grp(key: str, label=lambda v: _label(v), top: int | None = None) -> list[dict]:
            x = ch.assign(k=ch[key].map(label)).groupby("k").agg(v=("v", "sum"), rev=("rev", "sum"), n=("n", "sum")).reset_index().sort_values("v", ascending=False)
            rows = [{"key": r.k, "encours": float(r.v), "pct": _pct(float(r.v), enc), "revenue": float(r.rev), "positions": int(r.n)} for r in x.itertuples(index=False)]
            return rows[:top] if top else rows

        funds = []
        for fid_or_isin, x in ch.groupby(ch["fund"].fillna(ch["isin"].fillna(NOT_SET))):
            fid = x["fund"].iloc[0]
            v, r = float(x["v"].sum()), float(x["rev"].sum())
            funds.append({"fund": fid, "name": self.p.fund_names.get(fid) if fid else "Fonds hors référentiel", "encours": v, "pct": _pct(v, enc),
                          "revenue": r, "rate": (r / v * 100) if v and x["rate"].notna().any() else None, "rmm_fund": bool(fid and fid in rmm_funds),
                          "classe": _label(x.groupby("classe")["v"].sum().idxmax()) if x["classe"].notna().any() else NOT_SET})
        funds.sort(key=lambda r: -r["encours"])
        shares = []
        for isin, x in ch.groupby("isin"):
            v = float(x["v"].sum())
            shares.append({"isin": isin, "share": self._share(isin), "fund": x["fund"].iloc[0], "encours": v, "pct": _pct(v, enc),
                           "rate": rates.get(isin or ""), "revenue": float(x["rev"].sum())})
        shares.sort(key=lambda r: -r["encours"])
        kind = ch.assign(kd=ch.apply(lambda r: "Fonds Rothschild Martin Maurel" if r["fund"] in rmm_funds else
                                     ("Autres fonds de la gamme" if r["fund"] else "Hors référentiel"), axis=1))
        split = [{"key": k, "encours": float(x["v"].sum()), "revenue": float(x["rev"].sum()), "pct": _pct(float(x["v"].sum()), enc)}
                 for k, x in kind.groupby("kd")]
        split.sort(key=lambda r: -r["encours"])
        age = ch.assign(y=pd.to_numeric(ch["y0"], errors="coerce")).dropna(subset=["y"]).groupby("y")["v"].sum().sort_index()
        countries = [{**r, "iso": country_info(r["key"])[1]} for r in grp("pays", lambda v: country_info(v)[0])]
        out = {"available": True, "nominatif": True, "as_of": ctx["as_of"], "rule": pattern,
               "matched": {"classifications": matched_cls, "teneurs": matched_ten},
               "encours": enc, "share_of_passif": _pct(enc, tot_all), "passif_total": tot_all,
               "revenue": rev, "rate": (rev / rated * 100) if rated else None, "rate_coverage": _pct(rated, enc),
               "share_of_revenue": _pct(rev, house_revenue) if house_revenue else None,
               "positions": int(ch["n"].sum()), "accounts": int(ch["k"].sum()),
               "segments": grp("classification"), "classes": grp("classe"), "countries": countries,
               "funds": funds[:20], "funds_count": len(funds), "shares": shares[:15], "split": split,
               "vintage": [{"year": int(y), "encours": float(v), "pct": _pct(float(v), enc)} for y, v in age.items()],
               "flows_available": False}
        # Clients du canal (nominatif) : comptes classés RMM, puis comptes tenus par RMM sans classification RMM
        parts = []
        if matched_cls:
            parts.append(self._positions(ctx, {"classification": matched_cls}))
        if matched_ten:
            q = self._positions(ctx, {"teneur": matched_ten})
            parts.append(q[~q["classification"].map(mentions)] if len(q) else q)
        pos = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()
        # Flux du canal
        trx = ctx["trx"]
        flows = None
        if trx:
            end = trx["last"]
            st = self._starts(end)
            fl = []
            if matched_cls:
                fl.append(self._flows_rmm(ctx, {"classification": matched_cls}, st["1A"]))
            if matched_ten:
                q = self._flows_rmm(ctx, {"teneur": matched_ten}, st["1A"])
                fl.append(q[~q["classification"].map(mentions)] if len(q) else q)
            flows = pd.concat(fl, ignore_index=True) if fl else None
            if flows is not None and len(flows):
                out.update({"flows_available": True, "flows_end": end,
                            "periods": {k: {"start": s, **self._sums(flows[flows["d"].astype(str) >= s])} for k, s in st.items()},
                            "monthly": self._monthly(flows, end), "rotation": self._funds_rows(flows, 5),
                            "flow_classes": self._by(flows, "classe", _label), "flow_segments": self._by(flows, "classification", _label)})
                lat = []
                if matched_cls:
                    lat += self._latest(ctx, {"classification": matched_cls}, st["3M"], limit=10)
                out["latest"] = sorted(lat, key=lambda o: o["date"] or "", reverse=True)[:10]
        out["clients"] = self._clients(pos, flows, trx["last"] if trx else None, limit=60) if len(pos) else []
        out["clients_count"] = int(pos["client"].nunique()) if len(pos) else 0
        return out

    def _flows_rmm(self, ctx: dict, inn: dict, start: str) -> pd.DataFrame:
        """Flux d'un périmètre avec la classification du compte (pour retirer les doublons entre teneur et classification)."""
        mt = ctx["maps"]["transaction"]
        g = self.p.reader.group("transaction", mt, {"d": ("date", "date_centralisation"), "client": ("text", "nom_client"), "pays": ("text", "pays"),
                                                    "isin": ("id", "isin"), "sens": ("text", "sens"), "statut": ("text", "statut"),
                                                    "classe": ("text", "classe_actif"), "classification": ("text", "classification")},
                                {"n": ("count", None), "v": ("sumabs", "montant_eur")},
                                [("date_ge", "date_centralisation", start)], dedup=TRX_DEDUP, inn=inn)
        if g is None or g.empty:
            return pd.DataFrame(columns=["d", "client", "pays", "isin", "sens", "statut", "classe", "classification", "n", "v", "dir"])
        allow = {fold(x) for x in allowed_statuts()}
        g = g.loc[g["statut"].map(lambda v: fold(_label(v)) in allow).astype(bool)].copy()
        g["v"] = pd.to_numeric(g["v"], errors="coerce").fillna(0.0)
        g["dir"] = g["sens"].map(sens_label).map(lambda x: 1 if x in ENTREES else -1 if x in SORTIES else 0)
        return g[g["dir"] != 0]
