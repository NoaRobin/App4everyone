"""Passif : comptes, positions (stock à une date) et transactions (flux) de la distribution des fonds.

Règles (reprises du cahier des charges des exports anonymisés, appliquées aux données réelles) :
- tout est agrégé côté source (GROUP BY) : aucune ligne de compte, de client ou d'opération ne quitte Fabric ;
- un groupe de moins de 5 positions, opérations ou comptes n'est jamais montré (il reste compté dans les totaux) ;
- aucun montant absolu : les positions sont exprimées en part de l'encours total, les transactions en part du
  volume absolu de la journée ; les effectifs en tranches (« 5 à 19 », « 20 à 99 »…), jamais en nombres exacts ;
- les parts de volume ne sont pas des flux nets : souscriptions et rachats sont montrés côte à côte, jamais soustraits ;
- aucune jointure ligne à ligne entre les exports agrégés ; la seule jointure (position → compte, pour le type de
  client) est faite dans la source, sur la clé reconnue, et n'en sort qu'agrégée.

Les tables sources n'ont que des colonnes génériques (_c0 … _cN, texte). Le rôle de chaque colonne est reconnu
automatiquement (vocabulaires métier, formes ISIN, dates, nombres, recouvrement avec les identifiants de comptes),
sans jamais afficher une valeur ; il peut être imposé par APP_PASSIF_MAP_POSITION / APP_PASSIF_MAP_TRANSACTION
(« date=_c0,montant=_c10,… »).
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
from datetime import date, datetime
from typing import Any, Callable

import numpy as np
import pandas as pd

from . import labels as L

log = logging.getLogger(__name__)

MIN_GROUP = 5
COMPTE_MAP = {"teneur": "_c0", "compte": "_c1", "parent": "_c3", "client": "_c5", "classification": "_c7", "devise": "_c8",
              "creation": "_c9", "dissolution": "_c10"}
TABLES = ("compte", "position", "transaction")

# ------------------------------------------------------------------ vocabulaires (valeurs normalisées, sans accents)
_V = {
    "sens": {"souscription", "rachat", "transfert entrant", "transfert sortant", "subscription", "redemption", "transfer in",
             "transfer out", "sous", "rach", "s", "r", "te", "ts", "sub", "red", "souscriptions", "rachats", "switch",
             "conversion entrante", "conversion sortante"},
    "statut": {"valorise", "cloture / apres cut-off", "cloture", "apres cut-off", "annule", "en attente", "valued", "pending",
               "cancelled", "canceled", "rejete", "confirme", "execute", "regle", "cut-off", "a valoriser", "valorisee"},
    "desk": {"valor", "conviction", "convictions", "thematic", "thematique", "rmm", "opal", "4change", "4 change"},
    "classe_actif": {"diversified", "equities", "fixed income", "money market", "alternative", "non_renseigne", "actions",
                     "obligations", "monetaire", "diversifie", "alternatif", "convertibles", "multi-asset", "balanced"},
    "devise": {"eur", "usd", "chf", "gbp", "jpy", "sek", "nok", "dkk", "sgd", "hkd", "cad", "aud", "cny"},
}
CATEGORICAL = ("sens", "statut", "devise", "desk", "classe_actif")
FIELDS = {"position": ("date", "compte", "isin", "classe_actif", "desk", "devise", "montant"),
          "transaction": ("date", "compte", "isin", "classe_actif", "desk", "sens", "statut", "devise", "montant")}
_ISIN = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}\d$")
_CUTOFF = re.compile(r"cut.?off|cloture|clôturé", re.I)
SENS_LABEL = {"souscription": "Souscription", "rachat": "Rachat", "transfert entrant": "Transfert entrant", "transfert sortant": "Transfert sortant"}


def _n(v: Any) -> str:
    return L.norm(v) if v is not None else ""


def tranche(n: float | int | None) -> dict | None:
    """Effectif en tranche (jamais le nombre exact) ; None sous le seuil de 5 (groupe masqué)."""
    if n is None or n < MIN_GROUP:
        return None
    for lo, hi, lab, k in ((5, 19, "5 à 19", 1), (20, 99, "20 à 99", 2), (100, 499, "100 à 499", 3), (500, 999, "500 à 999", 4),
                           (1000, 9999, "1 000 et plus", 5), (10000, 99999, "10 000 et plus", 6), (100000, 999999, "100 000 et plus", 7)):
        if lo <= n <= hi:
            return {"label": lab, "rank": k}
    return {"label": "1 million et plus", "rank": 8}


def parse_dates(s: pd.Series) -> pd.Series:
    """Dates texte (ISO, jj/mm/aaaa, aaaammjj, avec ou sans heure) → Timestamp ; illisible → NaT."""
    s = s.astype("string").str.strip()
    out = pd.to_datetime(s, format="ISO8601", errors="coerce")
    for fmt in ("%d/%m/%Y", "%d/%m/%Y %H:%M:%S", "%Y%m%d", "%d-%m-%Y", "%d.%m.%Y"):
        miss = out.isna() & s.notna()
        if not miss.any():
            break
        out = out.fillna(pd.to_datetime(s.where(miss), format=fmt, errors="coerce"))
    return out


def parse_amounts(s: pd.Series) -> pd.Series:
    t = s.astype("string").str.replace(r"[\s  ]", "", regex=True).str.replace(",", ".", regex=False)
    return pd.to_numeric(t, errors="coerce")


# ------------------------------------------------------------------ lecteurs (pandas pour le fictif, SQL pour Fabric)
class PandasReader:
    """Mêmes opérations que SqlReader, sur des tables en mémoire (données fictives)."""

    def __init__(self, tables: Callable[[str], pd.DataFrame]):
        self.t = tables
        self.kind = "synthétique"

    def profile(self, name: str) -> dict:
        df = self.t(name)
        out = {}
        for c in df.columns:
            vc = df[c].value_counts(dropna=True)
            out[c] = {"rows": int(len(df)), "filled": int(df[c].notna().sum()), "distinct": int(len(vc)),
                      "top": list(zip(vc.index[:60].tolist(), vc.to_numpy()[:60].tolist())),
                      "sample": df[c].dropna().head(2000).tolist()}
        return out

    def overlap(self, name: str, col: str, ref: str, ref_col: str) -> float:
        s = self.t(name)[col].dropna().head(5000)
        return float(s.isin(set(self.t(ref)[ref_col].dropna())).mean()) if len(s) else 0.0

    def group(self, name: str, keys: dict[str, str], amount: str | None = None, join_compte: str | None = None,
              compte_keys: dict[str, str] | None = None, distinct: str | None = None) -> pd.DataFrame:
        df = self.t(name)
        cols = {alias: df[c] for alias, c in keys.items()}
        g = pd.DataFrame(cols)
        if join_compte and compte_keys:
            ref = self.t("compte").groupby(COMPTE_MAP["compte"])[[c for c in compte_keys.values()]].max()
            for alias, c in compte_keys.items():
                g[alias] = df[join_compte].map(ref[c])
        if amount:
            a = parse_amounts(df[amount])
            g["amt"], g["amt_abs"] = a, a.abs()
        if distinct:
            g["_d"] = df[distinct]
        keys_all = [k for k in g.columns if k not in ("amt", "amt_abs", "_d")]
        gb = g.fillna({k: "\x00" for k in keys_all}).groupby(keys_all, dropna=False)
        out = gb.size().rename("n").to_frame()
        if amount:
            out["amt"], out["amt_abs"] = gb["amt"].sum(min_count=1), gb["amt_abs"].sum(min_count=1)
        if distinct:
            out["distinct"] = gb["_d"].nunique()
        out = out.reset_index().replace({"\x00": None})
        return out


class SqlReader:
    """Agrégats calculés dans Fabric (SELECT … GROUP BY, garde-fou lecture seule) : seuls des comptes et des sommes
    par groupe sont rapatriés."""

    def __init__(self, source: Any, names: dict[str, str]):
        self.src, self.names = source, names
        self.kind = "fabric"

    def _t(self, name: str) -> str:
        n = self.names.get(name, name)
        if not re.match(r"^[A-Za-z0-9_\-. ]+$", n):
            raise ValueError(f"Nom de table invalide : {n!r}")
        return f"[dbo].[{n}]"

    @staticmethod
    def _c(c: str) -> str:
        if not re.match(r"^_c\d{1,3}$", c):
            raise ValueError(f"Colonne invalide : {c!r}")
        return f"[{c}]"

    @staticmethod
    def _num(expr: str) -> str:
        return f"TRY_CAST(REPLACE(REPLACE({expr}, ' ', ''), ',', '.') AS FLOAT)"

    def profile(self, name: str) -> dict:
        t = self._t(name)
        n_cols = {"compte": 11, "position": 21, "transaction": 28}[name]
        cols = [f"_c{i}" for i in range(n_cols)]
        stats = self.src.query("SELECT COUNT(*) AS n, " + ", ".join(
            f"COUNT({self._c(c)}) AS f{i}, COUNT(DISTINCT {self._c(c)}) AS d{i}" for i, c in enumerate(cols)) + f" FROM {t}",
            label=f"passif {name} (profil)")
        sample = self.src.query("SELECT TOP 2000 " + ", ".join(self._c(c) for c in cols) + f" FROM {t}", label=f"passif {name} (échantillon)")
        out = {}
        rows = int(stats.iloc[0]["n"])
        for i, c in enumerate(cols):
            d = int(stats.iloc[0][f"d{i}"])
            top: list = []
            if d <= 300:
                vc = self.src.query(f"SELECT TOP 60 {self._c(c)} AS v, COUNT(*) AS n FROM {t} GROUP BY {self._c(c)} ORDER BY COUNT(*) DESC")
                top = [(v, int(k)) for v, k in zip(vc["v"], vc["n"]) if v is not None]
            out[c] = {"rows": rows, "filled": int(stats.iloc[0][f"f{i}"]), "distinct": d, "top": top,
                      "sample": sample[c].dropna().tolist() if c in sample else []}
        return out

    def overlap(self, name: str, col: str, ref: str, ref_col: str) -> float:
        c, rc = self._c(col), self._c(ref_col)
        df = self.src.query(f"SELECT COUNT(*) AS n, SUM(CASE WHEN r.k IS NULL THEN 0 ELSE 1 END) AS hit FROM "
                            f"(SELECT TOP 5000 {c} AS v FROM {self._t(name)} WHERE {c} IS NOT NULL) s "
                            f"LEFT JOIN (SELECT DISTINCT {rc} AS k FROM {self._t(ref)}) r ON s.v = r.k")
        n = int(df.iloc[0]["n"] or 0)
        return float(df.iloc[0]["hit"] or 0) / n if n else 0.0

    def group(self, name: str, keys: dict[str, str], amount: str | None = None, join_compte: str | None = None,
              compte_keys: dict[str, str] | None = None, distinct: str | None = None) -> pd.DataFrame:
        sel = [f"p.{self._c(c)} AS [{a}]" for a, c in keys.items()]
        grp = [f"p.{self._c(c)}" for c in keys.values()]
        frm = f"{self._t(name)} p"
        if join_compte and compte_keys:
            sub = ", ".join(f"MAX({self._c(c)}) AS [{a}]" for a, c in compte_keys.items())
            frm += (f" LEFT JOIN (SELECT {self._c(COMPTE_MAP['compte'])} AS k, {sub} FROM {self._t('compte')} "
                    f"GROUP BY {self._c(COMPTE_MAP['compte'])}) c ON p.{self._c(join_compte)} = c.k")
            sel += [f"c.[{a}] AS [{a}]" for a in compte_keys]
            grp += [f"c.[{a}]" for a in compte_keys]
        meas = ["COUNT(*) AS n"]
        if amount:
            x = self._num(f"p.{self._c(amount)}")
            meas += [f"SUM({x}) AS amt", f"SUM(ABS({x})) AS amt_abs"]
        if distinct:
            meas.append(f"COUNT(DISTINCT p.{self._c(distinct)}) AS [distinct]")
        sql = f"SELECT {', '.join(sel + meas)} FROM {frm}" + (f" GROUP BY {', '.join(grp)}" if grp else "")
        return self.src.query(sql, label=f"passif {name} (agrégats)")


# ------------------------------------------------------------------ reconnaissance des colonnes
def _overrides(table: str) -> dict[str, str]:
    raw = os.environ.get(f"APP_PASSIF_MAP_{table.upper()}", "")
    out = {}
    for part in raw.split(","):
        if "=" in part:
            k, v = (x.strip() for x in part.split("=", 1))
            if k and re.match(r"^_c\d{1,3}$", v):
                out[k] = v
    return out


def detect_mapping(reader, table: str) -> dict:
    """Rôle de chaque colonne d'une table source : {champ: {"col": "_cN", "confidence": 0..1, "how": "…"}}.

    Uniquement des comptes et des formes ; aucune valeur n'est journalisée ni renvoyée."""
    prof = reader.profile(table)
    scores: dict[str, dict[str, float]] = {f: {} for f in CATEGORICAL}
    kinds: dict[str, str] = {}
    for c, p in prof.items():
        filled = p["filled"] or 0
        if not filled:
            kinds[c] = "vide"
            continue
        sample = pd.Series(p["sample"], dtype=object)
        st = sample.astype(str).str.strip()
        isin_share = float(st.str.upper().str.match(_ISIN.pattern).mean()) if len(st) else 0
        date_share = float(parse_dates(st).notna().mean()) if len(st) else 0
        num_share = float(parse_amounts(st).notna().mean()) if len(st) else 0
        if isin_share > 0.8:
            kinds[c] = "isin"
        elif date_share > 0.9 and not st.str.fullmatch(r"-?\d+([.,]\d+)?").mean() > 0.5:
            kinds[c] = "date"
        elif num_share > 0.9:
            kinds[c] = "nombre"
        else:
            kinds[c] = "texte"
        if p["top"] and p["distinct"] <= 300:
            covered = sum(k for _, k in p["top"]) or 1
            for f in CATEGORICAL:
                hit = sum(k for v, k in p["top"] if _n(v) in _V[f] or (f == "statut" and _CUTOFF.search(str(v))))
                scores[f][c] = hit / covered
    mapping: dict[str, dict] = {}
    used: set[str] = set()
    for f in CATEGORICAL:
        best = sorted(((s, c) for c, s in scores[f].items() if c not in used), reverse=True)
        if best and best[0][0] >= 0.6:
            mapping[f] = {"col": best[0][1], "confidence": round(best[0][0], 2), "how": "vocabulaire"}
            used.add(best[0][1])
    isins = [c for c, k in kinds.items() if k == "isin" and c not in used]
    if isins:
        mapping["isin"] = {"col": isins[0], "confidence": 1.0, "how": "forme ISIN"}
        used.add(isins[0])
    dates = [c for c, k in kinds.items() if k == "date" and c not in used]
    if dates:
        mapping["date"] = {"col": dates[0], "confidence": round(1 / len(dates), 2), "how": "forme date",
                           "note": f"{len(dates)} colonnes de dates : la première retenue, à confirmer" if len(dates) > 1 else None}
        used.add(dates[0])
    nums = [c for c, k in kinds.items() if k == "nombre" and c not in used]
    if nums:
        med = {c: float(parse_amounts(pd.Series(prof[c]["sample"], dtype=object)).abs().median() or 0) for c in nums}
        best = max(nums, key=lambda c: med[c])
        mapping["montant"] = {"col": best, "confidence": round(1 / len(nums), 2), "how": "plus grandes valeurs numériques",
                              "note": f"{len(nums)} colonnes numériques : à confirmer" if len(nums) > 1 else None}
        used.add(best)
    if table != "compte":
        cands = [c for c, k in kinds.items() if k == "texte" and c not in used and prof[c]["distinct"] > 20]
        best_c, best_s = None, 0.0
        for c in cands:
            s = reader.overlap(table, c, "compte", COMPTE_MAP["compte"])
            if s > best_s:
                best_c, best_s = c, s
        if best_c and best_s >= 0.5:
            mapping["compte"] = {"col": best_c, "confidence": round(best_s, 2), "how": "identifiants de comptes"}
    for f, c in _overrides(table).items():
        mapping[f] = {"col": c, "confidence": 1.0, "how": "configuré"}
    return {"fields": mapping, "kinds": {c: k for c, k in kinds.items()}, "rows": next(iter(prof.values()))["rows"] if prof else 0}


# ------------------------------------------------------------------ vues
def _pct(x: float, tot: float) -> float | None:
    return round(100.0 * x / tot, 1) if tot else None


def _measure(df: pd.DataFrame, col: str) -> pd.Series:
    return df[col].fillna(0.0) if col in df else df["n"].astype(float)


def _rollup(df: pd.DataFrame, by: list[str], col: str, tot: float) -> list[dict]:
    g = df.groupby(by, dropna=False).agg(n=("n", "sum"), m=(col, "sum") if col in df else ("n", "sum")).reset_index()
    out = []
    for r in g.sort_values("m", ascending=False).itertuples(index=False):
        t = tranche(r.n)
        if t is None:
            continue
        out.append({**{k: (getattr(r, k) if getattr(r, k) is not None else "Non renseigné") for k in by}, "pct": _pct(r.m, tot), "tranche": t})
    return out


def positions_view(g: pd.DataFrame, by_client: pd.DataFrame | None, amount: bool) -> dict:
    col = "amt" if amount else "n"
    if g.empty:
        return {"available": False}
    g = g.copy()
    for k in ("classe_actif", "desk", "devise"):
        if k not in g:
            g[k] = None
        g[k] = g[k].map(lambda v: (str(v).strip() or None) if v is not None else None)
    g[col] = _measure(g, col)
    tot = float(g[col].sum())
    groups = _rollup(g, ["classe_actif", "desk", "devise"], col, tot)
    shown = sum(x["pct"] or 0 for x in groups)
    view = {
        "available": True, "measure": "part de l'encours" if amount else "part du nombre de positions",
        "groups": groups, "residual_pct": round(max(0.0, 100.0 - shown), 1),
        "by_desk": _rollup(g, ["desk"], col, tot), "by_class": _rollup(g, ["classe_actif"], col, tot),
        "by_currency": _rollup(g, ["devise"], col, tot), "total": tranche(int(g["n"].sum())),
    }
    m = g.groupby(["desk", "classe_actif"], dropna=False).agg(n=("n", "sum"), v=(col, "sum")).reset_index()
    view["matrix"] = [{"desk": r.desk or "Non renseigné", "classe_actif": r.classe_actif or "Non renseigné", "pct": _pct(r.v, tot)}
                      for r in m.itertuples(index=False) if r.n >= MIN_GROUP]
    if by_client is not None and not by_client.empty:
        b = by_client.copy()
        b[col] = _measure(b, col)
        b["teneur"] = b["teneur"].map(lambda v: str(v).strip() if v else "Compte inconnu")
        b["classification"] = b["classification"].map(lambda v: str(v).strip() if v else "Compte inconnu")
        view["by_client"] = _rollup(b, ["teneur", "classification"], col, float(b[col].sum()))
        view["by_teneur"] = _rollup(b, ["teneur"], col, float(b[col].sum()))
    return view


def transactions_view(g: pd.DataFrame, amount: bool, days: int = 60) -> dict:
    col = "amt_abs" if amount else "n"
    if g.empty or "date" not in g:
        return {"available": False}
    g = g.copy()
    g["d"] = parse_dates(g["date"].astype("string")).dt.normalize()
    g = g.dropna(subset=["d"])
    if g.empty:
        return {"available": False}
    last = g["d"].max()
    g = g[g["d"] > last - pd.Timedelta(days=int(days * 1.5))]
    keep = sorted(g["d"].unique())[-days:]
    g = g[g["d"].isin(keep)]
    for k in ("classe_actif", "desk", "sens", "statut", "devise"):
        if k not in g:
            g[k] = None
    g["sens"] = g["sens"].map(lambda v: SENS_LABEL.get(_n(v), str(v).strip() if v else "Non renseigné"))
    g["late"] = g["statut"].map(lambda v: bool(_CUTOFF.search(str(v))) if v else False)
    g[col] = _measure(g, col)
    out_days = []
    for d, x in g.groupby("d"):
        tot = float(x[col].sum())
        out_days.append({
            "date": pd.Timestamp(d).date().isoformat(), "ops": tranche(int(x["n"].sum())),
            "sens": _rollup(x, ["sens"], col, tot), "desks": _rollup(x, ["desk"], col, tot),
            "late_pct": _pct(float(x.loc[x["late"], col].sum()), tot) if int(x.loc[x["late"], "n"].sum()) >= MIN_GROUP else None,
            "groups": _rollup(x, ["classe_actif", "desk", "sens", "statut", "devise"], col, tot)[:12],
        })
    tot = float(g[col].sum())
    return {"available": True, "measure": "part du volume absolu" if amount else "part du nombre d'opérations",
            "first": out_days[0]["date"], "last": out_days[-1]["date"], "days": out_days,
            "period_sens": _rollup(g, ["sens"], col, tot), "period_desks": _rollup(g, ["desk"], col, tot),
            "period_classes": _rollup(g, ["classe_actif"], col, tot),
            "period_late_pct": _pct(float(g.loc[g["late"], col].sum()), tot), "ops": tranche(int(g["n"].sum()))}


def comptes_view(g: pd.DataFrame, clients: pd.DataFrame) -> dict:
    if g.empty:
        return {"available": False}
    g = g.copy()
    g["teneur"] = g["teneur"].map(lambda v: str(v).strip() if v else "Non renseigné")
    g["classification"] = g["classification"].map(lambda v: str(v).strip() if v else "Non renseigné")
    for b in ("parent", "creation", "dissolution"):
        g[b] = g[b].map(lambda v: bool(v) and str(v).strip() not in ("", "0", "NULL"))
    teneurs = []
    cl = {r.teneur: r.distinct for r in clients.itertuples(index=False)} if not clients.empty else {}
    for t, x in g.groupby("teneur"):
        n = int(x["n"].sum())
        if n < MIN_GROUP:
            continue
        classes = []
        for c, y in x.groupby("classification"):
            k = int(y["n"].sum())
            if k >= MIN_GROUP:
                label = c.split("/", 1)[1].strip() if "/" in c else c
                classes.append({"classification": c, "label": label, "tranche": tranche(k),
                                "active": not re.search(r"inactif", c, re.I), "omnibus": bool(re.search(r"omnibus", c, re.I)),
                                "opc": bool(re.search(r"\bopc\b", c, re.I))})
        teneurs.append({"teneur": t, "tranche": tranche(n), "clients": tranche(cl.get(t)), "classifications":
                        sorted(classes, key=lambda z: -z["tranche"]["rank"])})
    tot = int(g["n"].sum())
    flags = lambda col: {True: tranche(int(g.loc[g[col], "n"].sum())), False: tranche(int(g.loc[~g[col], "n"].sum()))}  # noqa: E731
    return {"available": True, "total": tranche(tot), "teneurs": sorted(teneurs, key=lambda z: -z["tranche"]["rank"]),
            "with_parent": flags("parent")[True], "without_parent": flags("parent")[False],
            "creation_known": flags("creation")[True], "creation_unknown": flags("creation")[False],
            "dissolved": flags("dissolution")[True], "open": flags("dissolution")[False],
            "currencies": [{"devise": d, "tranche": tranche(int(x["n"].sum()))} for d, x in g.groupby("devise") if int(x["n"].sum()) >= MIN_GROUP],
            "clients": tranche(int(sum(cl.values()))) if cl else None}


# ------------------------------------------------------------------ calcul complet, mis en cache (rafraîchi chaque jour)
class Passif:
    def __init__(self, reader, isin_to_fund: dict[str, str] | None = None, ttl_hours: float = 6.0):
        self.reader, self.isin_to_fund = reader, isin_to_fund or {}
        self.ttl = ttl_hours * 3600
        self._data: dict | None = None
        self._at = 0.0
        self._lock = threading.Lock()
        self.error: str | None = None

    def get(self) -> dict:
        with self._lock:
            if self._data is None or time.time() - self._at > self.ttl:
                t0 = time.time()
                try:
                    self._data = self.compute()
                    self.error = None
                except Exception as e:  # tables absentes ou illisibles : la partie Passif l'indique, l'application continue
                    log.warning("Passif indisponible (%s)", type(e).__name__)
                    self.error = type(e).__name__
                    self._data = {"available": False, "reason": "Tables du passif inaccessibles ou illisibles.", "detail": type(e).__name__}
                self._at = time.time()
                log.info("Passif calculé en %.1f s", time.time() - t0)
            return self._data

    def compute(self) -> dict:
        r = self.reader
        maps = {t: detect_mapping(r, t) for t in ("position", "transaction")}
        cm = COMPTE_MAP
        comptes = r.group("compte", {"teneur": cm["teneur"], "classification": cm["classification"], "devise": cm["devise"],
                                     "parent": cm["parent"], "creation": cm["creation"], "dissolution": cm["dissolution"]})
        clients = r.group("compte", {"teneur": cm["teneur"]}, distinct=cm["client"])
        out: dict[str, Any] = {"available": True, "source": r.kind, "refreshed_at": datetime.now().isoformat(timespec="minutes"),
                               "comptes": comptes_view(comptes, clients), "mapping": {}}
        # Positions : photo à la dernière date d'arrêté
        pm = {f: v["col"] for f, v in maps["position"]["fields"].items()}
        keys = {k: pm[k] for k in ("classe_actif", "desk", "devise") if k in pm}
        if "date" in pm:
            dates = r.group("position", {"date": pm["date"]})
            dd = parse_dates(dates["date"].astype("string"))
            as_of = dd.max()
            out["positions_as_of"] = as_of.date().isoformat() if pd.notna(as_of) else None
            # La photo du jour : agrégats limités à la dernière date (filtre appliqué après agrégation par date)
            keys_d = {**keys, "date": pm["date"]}
        else:
            keys_d, as_of = keys, None
        pos = r.group("position", keys_d, amount=pm.get("montant"))
        if as_of is not None and "date" in pos:
            pos = pos[parse_dates(pos["date"].astype("string")) == as_of].drop(columns="date")
        by_client = None
        if "compte" in pm:
            bc = r.group("position", {**({"date": pm["date"]} if "date" in pm else {})}, amount=pm.get("montant"),
                         join_compte=pm["compte"], compte_keys={"teneur": cm["teneur"], "classification": cm["classification"]})
            if as_of is not None and "date" in bc:
                bc = bc[parse_dates(bc["date"].astype("string")) == as_of].drop(columns="date")
            by_client = bc
        out["positions"] = positions_view(pos, by_client, amount="montant" in pm)
        # Positions par fonds (complément des fiches) : part de l'encours et tranche de positions
        if "isin" in pm:
            pi = r.group("position", {"isin": pm["isin"], **({"date": pm["date"]} if "date" in pm else {})}, amount=pm.get("montant"))
            if as_of is not None and "date" in pi:
                pi = pi[parse_dates(pi["date"].astype("string")) == as_of]
            col = "amt" if "montant" in pm else "n"
            pi["fund"] = pi["isin"].map(lambda v: self.isin_to_fund.get(str(v).strip().upper()) if v else None)
            tot = float(_measure(pi, col).sum())
            by_fund = pi.dropna(subset=["fund"]).groupby("fund").agg(n=("n", "sum"), m=(col, "sum"))
            out["funds"] = {f: {"pct": _pct(x.m, tot), "positions": tranche(int(x.n))} for f, x in by_fund.iterrows() if x.n >= MIN_GROUP}
        tm = {f: v["col"] for f, v in maps["transaction"]["fields"].items()}
        tkeys = {k: tm[k] for k in ("date", "classe_actif", "desk", "sens", "statut", "devise") if k in tm}
        trx = r.group("transaction", tkeys, amount=tm.get("montant")) if "date" in tkeys else pd.DataFrame()
        out["transactions"] = transactions_view(trx, amount="montant" in tm)
        out["mapping"] = {t: {"fields": {f: {k: v for k, v in x.items() if k != "note" or v} for f, x in m["fields"].items()},
                              "rows": tranche(m["rows"]), "unmapped": [c for c, k in m["kinds"].items() if c not in {x["col"] for x in m["fields"].values()} and k != "vide"]}
                          for t, m in maps.items()}
        out["model"] = {"clients": out["comptes"].get("clients"), "comptes": out["comptes"].get("total"),
                        "positions": out["positions"].get("total"), "operations": out["transactions"].get("ops"),
                        "funds_held": tranche(len(out.get("funds", {}))) if out.get("funds") else None}
        return out


def table_names() -> dict[str, str]:
    return {t: (os.environ.get(f"APP_PASSIF_TABLE_{t.upper()}") or t).strip() for t in TABLES}
