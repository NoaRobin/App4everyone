"""Passif : comptes, positions (stock à une date) et transactions (flux) de la distribution des fonds.

Règles de confidentialité (appliquées aux données réelles comme aux données fictives) :
- tout est agrégé côté source (GROUP BY) : aucune ligne de compte, de client ou d'opération ne quitte Fabric ; les
  colonnes de noms (client, compte, commercial, commentaire) ne sont jamais lues, seulement comptées (taux de remplissage) ;
- un groupe de moins de 5 positions, opérations ou comptes n'est jamais montré (il reste compté dans les totaux) ;
- aucun montant absolu : l'encours est exprimé en part du total (pondération Montant EUR), les transactions en part du
  volume absolu ; les effectifs en tranches (« 5 à 19 », « 20 à 99 »…), jamais en nombres exacts ;
- souscriptions et rachats sont montrés côte à côte, jamais soustraits (aucun flux net).
Exception explicite de l'équipe : la vue nominative (porteurs d'un fonds, fonds d'un client, carnet « qui est investi dans
quoi » avec les encours Montant EUR par client, fonds et part ; détail des positions d'un fonds, ligne à ligne, avec les
colonnes nominatives Nom client, Compte et Commercial) est calculée à la demande dans la source, jamais mise en cache
ni journalisée, et n'est jamais reconstruite à partir de parts en pourcentage.
Les compteurs techniques de la lecture des tables (lignes, valeurs nulles, dates valides) sont des nombres de lignes,
jamais des montants : ils servent à vérifier la qualité de la source.

Correspondance des colonnes : exacte, sans aucune devinette. Si la table porte ses vrais noms (« Montant EUR »…), ils
sont utilisés ; si elle porte des noms génériques (_c0 … _cN), la position fixe ci-dessous s'applique. Les variables
APP_PASSIF_MAP_COMPTE / _POSITION / _TRANSACTION (« montant_eur=_c18,… ») peuvent l'ajuster, colonne par colonne.

Valeurs manquantes : NULL, chaîne vide, espaces, « nan », « NaN », « none », « null », « N/A » sont nulles.
Dates : format américain des exports (« 9/30/2026 12:00:00 AM »), à défaut ISO (« 2026-09-30 ») ; l'heure est ignorée.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
import unicodedata
from datetime import date, datetime
from typing import Any, Callable

import numpy as np
import pandas as pd

from . import labels as L

log = logging.getLogger(__name__)

MIN_GROUP = 5
TABLES = ("compte", "position", "transaction")
NULL_TOKENS = ("", "nan", "none", "null", "n/a", "nat", "#n/a")
WINDOW_DAYS = 60

# ------------------------------------------------------------------ schémas exacts (clé, vrai nom, nature)
# Natures : texte · id (identifiant, comparé après normalisation) · isin · date · nombre · confidentiel (jamais lu)
SCHEMA: dict[str, list[tuple[str, str, str]]] = {
    "compte": [
        ("teneur", "TeneurCompte", "texte"), ("id_compte", "Id Compte", "id"), ("nom_compte", "Nom Compte", "confidentiel"),
        ("id_parent", "Id CompteParent", "id"), ("nom_parent", "Nom CompteParent", "confidentiel"), ("id_client", "Id Client", "id"),
        ("nom_client", "Nom Client", "confidentiel"), ("classification", "Classification", "texte"), ("devise", "Devise", "texte"),
        ("date_creation", "DateCreation", "date"), ("date_dissolution", "DateDissolution", "date"),
    ],
    "position": [
        ("nom_client", "Nom client", "confidentiel"), ("pays", "Pays", "texte"), ("teneur", "Teneur de compte", "texte"),
        ("compte", "Compte Centaure", "id"), ("compte_nom", "Compte", "confidentiel"), ("classification", "Classification compte", "texte"),
        ("commercial", "Commercial", "confidentiel"), ("sdg", "SdG", "texte"), ("type_fonds", "Type fonds", "texte"),
        ("fonds", "Fonds", "texte"), ("isin", "ISIN", "isin"), ("classe_actif", "Classe d'Actif", "texte"), ("desk", "Desk", "texte"),
        ("date", "Date", "date"), ("quantite", "Quantite", "nombre"), ("cours", "Cours", "nombre"),
        ("montant_devise", "Montant Devise", "nombre"), ("devise", "Devise", "texte"), ("montant_eur", "Montant EUR", "nombre"),
        ("dernier_trade", "Dernier trade", "date"), ("premier_trade", "Premier trade", "date"),
    ],
    "transaction": [
        ("nom_client", "Nom client", "confidentiel"), ("pays", "Pays", "texte"), ("teneur", "Teneur de compte", "texte"),
        ("compte", "Compte Centaure", "id"), ("compte_nom", "Compte", "confidentiel"), ("classification", "Classification compte", "texte"),
        ("commercial", "Commercial", "confidentiel"), ("sdg", "SdG", "texte"), ("type_fonds", "Type fonds", "texte"),
        ("fonds", "Fonds", "texte"), ("isin", "ISIN", "isin"), ("classe_actif", "Classe d'Actif", "texte"), ("desk", "Desk", "texte"),
        ("date_centralisation", "Date centralisation", "date"), ("date_vl", "Date VL", "date"), ("date_valeur", "Date Valeur", "date"),
        ("sens", "Sens", "texte"), ("statut", "Statut", "texte"), ("devise", "Devise", "texte"), ("quantite", "Quantite", "nombre"),
        ("cours", "Cours", "nombre"), ("montant_devise", "Montant Devise", "nombre"), ("montant_eur", "Montant EUR", "nombre"),
        ("commentaire", "Commentaire", "confidentiel"), ("centralisateur", "Centralisateur", "texte"), ("reference", "Reference", "id"),
        ("date_creation", "Date de création", "date"), ("compte_indirect", "Compte indirect", "id"),
    ],
}
N_COLS = {t: len(v) for t, v in SCHEMA.items()}            # 11, 21, 28
KIND = {t: {k: kind for k, _, kind in v} for t, v in SCHEMA.items()}
REAL = {t: {k: n for k, n, _ in v} for t, v in SCHEMA.items()}
# Colonnes indispensables : sans elles, la vue correspondante n'est pas calculée
REQUIRED = {"compte": ("id_compte",), "position": ("date", "montant_eur"), "transaction": ("date_centralisation", "sens", "statut", "montant_eur")}
# Lignes d'en-tête relues comme données (CSV chargé sans en-tête) : reconnues par la valeur de ces colonnes
SENTINELS = {"compte": ("id_compte",), "position": ("compte", "isin"), "transaction": ("compte", "isin")}

# Statuts d'opération retenus (comparaison sans accents ni casse) : configurable par APP_PASSIF_STATUTS_AUTORISES
DEFAULT_STATUTS = ("Valorisé", "Clôturé / après cut-off")
_CUTOFF = re.compile(r"cut.?off", re.I)
SENS_LABEL = {"souscription": "Souscription", "rachat": "Rachat", "transfert entrant": "Transfert entrant", "transfert sortant": "Transfert sortant",
              "subscription": "Souscription", "redemption": "Rachat", "transfer in": "Transfert entrant", "transfer out": "Transfert sortant"}
NOT_SET = "Non renseigné"


def fold(v: Any) -> str:
    """Comparaison des libellés : minuscules, sans accents, espaces réduits."""
    s = unicodedata.normalize("NFKD", str(v)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", s).strip()


def _key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", fold(name))


def tranche(n: float | int | None) -> dict | None:
    """Effectif en tranche (jamais le nombre exact) ; None sous le seuil de 5 (groupe masqué)."""
    if n is None or (isinstance(n, float) and np.isnan(n)) or n < MIN_GROUP:
        return None
    for lo, hi, lab, k in ((5, 19, "5 à 19", 1), (20, 99, "20 à 99", 2), (100, 499, "100 à 499", 3), (500, 999, "500 à 999", 4),
                           (1000, 9999, "1 000 et plus", 5), (10000, 99999, "10 000 et plus", 6), (100000, 999999, "100 000 et plus", 7)):
        if lo <= n <= hi:
            return {"label": lab, "rank": k}
    return {"label": "1 million et plus", "rank": 8}


# ------------------------------------------------------------------ normalisation (même règle en Python et en SQL)
def norm_text(s: pd.Series) -> pd.Series:
    """Texte nettoyé ; les valeurs manquantes (NULL, vide, espaces, nan, none, null, N/A) deviennent <NA>."""
    t = s.astype("string").str.replace(" ", " ", regex=False).str.strip()
    return t.mask(t.str.lower().isin(NULL_TOKENS))


def norm_id(s: pd.Series) -> pd.Series:
    return norm_text(s).str.replace(" ", "", regex=False).str.upper()


def to_num(s: pd.Series) -> pd.Series:
    """Nombre texte : « 1234.5 », « 1 234,5 », « 1,234.5 » ; illisible → NaN."""
    t = norm_text(s).str.replace(" ", "", regex=False)
    dot = t.str.contains(".", regex=False).fillna(False).astype(bool)
    t = t.where(~dot, t.str.replace(",", "", regex=False)).where(dot, t.str.replace(",", ".", regex=False))
    return pd.to_numeric(t, errors="coerce")


def to_date(s: pd.Series) -> pd.Series:
    """Dates des exports : américain m/j/aaaa (« 9/30/2026 12:00:00 AM »), m-j-aaaa, puis ISO aaaa-mm-jj ; heure ignorée."""
    t = norm_text(s)
    first = t.str.split(" ", n=1).str[0]
    out = pd.to_datetime(first, format="%m/%d/%Y", errors="coerce")
    for src, fmt in ((first, "%m-%d-%Y"), (t.str[:10], "%Y-%m-%d")):
        miss = out.isna() & t.notna()
        if not miss.any():
            break
        out = out.fillna(pd.to_datetime(src.where(miss), format=fmt, errors="coerce"))
    return out


def shape(v: Any) -> str:
    """Forme d'une valeur, sans la valeur : chiffres → 9, lettres → a (« 9/99/9999 99:99:99 aa »)."""
    return re.sub(r"[a-z]", "a", re.sub(r"\d", "9", str(v).lower()))[:40]


def _sql_text(x: str) -> str:
    v = f"LTRIM(RTRIM(CAST({x} AS VARCHAR(400))))"
    toks = ", ".join(f"'{t}'" for t in NULL_TOKENS)
    return f"(CASE WHEN LOWER({v}) IN ({toks}) THEN NULL ELSE {v} END)"


def _sql_date(x: str) -> str:
    t = _sql_text(x)
    first = f"LEFT({t}, CHARINDEX(' ', {t} + ' ') - 1)"
    return f"COALESCE(TRY_CONVERT(date, {first}, 101), TRY_CONVERT(date, {first}, 110), TRY_CONVERT(date, LEFT({t}, 10), 23))"


def _sql_num(x: str) -> str:
    t = f"REPLACE({_sql_text(x)}, ' ', '')"
    return f"TRY_CAST(CASE WHEN CHARINDEX('.', {t}) > 0 THEN REPLACE({t}, ',', '') ELSE REPLACE({t}, ',', '.') END AS FLOAT)"


def _sql_id(x: str) -> str:
    return f"UPPER(REPLACE({_sql_text(x)}, ' ', ''))"


# ------------------------------------------------------------------ correspondance exacte des colonnes
def _overrides(table: str) -> dict[str, str]:
    raw = os.environ.get(f"APP_PASSIF_MAP_{table.upper()}", "")
    out = {}
    for part in raw.split(","):
        if "=" in part:
            k, v = (x.strip() for x in part.split("=", 1))
            if k and v:
                out[k] = v
    return out


def resolve_mapping(columns: list[str], table: str) -> dict:
    """Colonne effectivement lue pour chaque champ : vrais noms s'ils sont là, sinon _c0…_cN dans l'ordre exact ;
    ajustements APP_PASSIF_MAP_<TABLE> appliqués s'ils désignent une colonne existante. Aucune devinette."""
    present = {_key(c): c for c in columns}
    generic = {c for c in columns if re.fullmatch(r"_c\d{1,3}", c)}
    spec = SCHEMA[table]
    real_hits = sum(1 for _, n, _ in spec if _key(n) in present)
    mode = "noms" if real_hits == len(spec) else "_cN" if all(f"_c{i}" in generic for i in range(len(spec))) else \
        "noms" if real_hits >= len(spec) / 2 else "_cN"
    fields: dict[str, dict] = {}
    for i, (k, name, kind) in enumerate(spec):
        col = present.get(_key(name)) if mode == "noms" else (f"_c{i}" if f"_c{i}" in generic else None)
        if col is None:   # disposition mixte : l'autre convention, si elle existe
            col = present.get(_key(name)) or (f"_c{i}" if f"_c{i}" in generic else None)
        fields[k] = {"col": col, "name": name, "kind": kind, "how": "schéma exact" if col else "absente"}
    ignored = []
    for k, c in _overrides(table).items():
        if k not in fields:
            ignored.append({"field": k, "col": c, "why": "champ inconnu"})
        elif c in columns:
            if fields[k]["col"] != c:
                fields[k].update(col=c, how="configuré")
            else:
                fields[k]["how"] = "schéma exact (confirmé par la configuration)"
        else:
            ignored.append({"field": k, "col": c, "why": "colonne absente de la table"})
    used = {f["col"] for f in fields.values() if f["col"]}
    return {"mode": mode, "fields": fields, "missing": [k for k, f in fields.items() if not f["col"]],
            "extra": [c for c in columns if c not in used], "ignored": ignored, "n_columns": len(columns), "expected": len(spec)}


def cols_of(m: dict) -> dict[str, str]:
    return {k: f["col"] for k, f in m["fields"].items() if f["col"]}


# ------------------------------------------------------------------ lecteurs : mêmes opérations en pandas (fictif) et en SQL (Fabric)
# Spécification d'un regroupement :
#   dims  {alias: (op, champ)}  op ∈ text · id · date (ISO) · year · notnull (0/1) · validdate (0/1) · matched (0/1, compte connu)
#   meas  {alias: (op, champ)}  op ∈ count · sum · sumabs · distinct · numvalid
#   where [(op, champ, valeur)] op ∈ date_eq · date_ge
#   dedup [champs]              lignes identiques sur ces champs (référence non nulle) comptées une seule fois
class PandasReader:
    """Mêmes opérations que SqlReader, sur des tables en mémoire (données fictives). Les colonnes converties sont
    mémorisées (les tables fictives ne changent pas pendant la session)."""

    kind = "synthétique"
    _FN = {"text": norm_text, "id": norm_id, "num": to_num, "date": to_date}

    def __init__(self, tables: Callable[[str], pd.DataFrame]):
        self.t = tables
        self._memo: dict = {}

    def columns(self, name: str) -> list[str]:
        return [str(c) for c in self.t(name).columns]

    def _conv(self, name: str, col: str, how: str) -> pd.Series:
        key = (name, col, how)
        if key not in self._memo:
            # Conversion des valeurs distinctes seulement, puis report sur les lignes
            src = self.t(name)[col]
            codes, uniq = pd.factorize(src.astype(object), use_na_sentinel=True)
            conv = self._FN[how](pd.Series(uniq, dtype=object))
            vals = conv.to_numpy()
            na = pd.NaT if how == "date" else (np.nan if how == "num" else pd.NA)
            full = np.where(codes >= 0, vals[np.clip(codes, 0, None)] if len(vals) else na, na)
            out = pd.Series(full, index=src.index)
            out = pd.to_datetime(out) if how == "date" else pd.to_numeric(out, errors="coerce") if how == "num" else out.astype("string")
            self._memo[key] = out
        return self._memo[key]

    def _of(self, name: str, c: dict[str, str], k: str, how: str, idx) -> pd.Series:
        return self._conv(name, c[k], how).loc[idx]

    def _base(self, name: str, c: dict[str, str]) -> pd.Series:
        key = (name, "_base", tuple(sorted(c.items())))
        if key in self._memo:
            return self._memo[key]
        df = self.t(name)
        ks = [k for k in SENTINELS[name] if k in c]
        if not ks:
            out = pd.Series(True, index=df.index)
        else:
            sent = [self._conv(name, c[k], "text") for k in ks]
            some = pd.concat([x.notna() for x in sent], axis=1).any(axis=1)
            header = pd.concat([x.fillna("").map(_key).eq(_key(REAL[name][k])) for x, k in zip(sent, ks)], axis=1).any(axis=1)
            out = some & ~header
        self._memo[key] = out
        return out

    def _ids(self, m_compte: dict) -> set:
        c = cols_of(m_compte)
        ok = self._base("compte", c)
        return set(self._conv("compte", c["id_compte"], "id")[ok].dropna())

    def _keyconv(self, name: str, k: str) -> str:
        return {"nombre": "num", "date": "date"}.get(KIND[name].get(k, ""), "id")

    def _col(self, name: str, idx, c: dict[str, str], op: str, k: str, ctx: dict) -> pd.Series:
        if k not in c:
            return pd.Series(None, index=idx, dtype="object")
        if op in ("text", "id"):
            x = self._of(name, c, k, op, idx)
            return x.astype(object).where(x.notna(), None)
        if op in ("date", "year", "validdate"):
            d = self._of(name, c, k, "date", idx)
            if op == "validdate":
                return d.notna().astype(int)
            if op == "date":
                return d.dt.strftime("%Y-%m-%d").where(d.notna(), None)
            return d.dt.year.astype("Int64").astype(object).where(d.notna(), None)
        if op == "notnull":
            return self._of(name, c, k, "text", idx).notna().astype(int)
        if op == "matched":
            return self._of(name, c, k, "id", idx).isin(ctx["ids"]).fillna(False).astype(int)
        raise ValueError(op)

    def _index(self, name: str, m: dict, where=(), dedup=None):
        c = cols_of(m)
        ok = self._base(name, c)
        for op, k, v in where:
            d = self._conv(name, c[k], "date").dt.strftime("%Y-%m-%d")
            ok = ok & ((d == v) if op == "date_eq" else (d >= v)).fillna(False)
        idx = ok[ok].index
        if dedup and "reference" in c:
            keys = pd.DataFrame({k: self._of(name, c, k, self._keyconv(name, k), idx) for k in dedup if k in c})
            has_ref = self._of(name, c, "reference", "id", idx).notna()
            idx = idx[~(keys.duplicated() & has_ref).to_numpy()]
        return idx

    def group(self, name: str, m: dict, dims: dict, meas: dict, where=(), dedup=None, m_compte: dict | None = None) -> pd.DataFrame:
        c = cols_of(m)
        idx = self._index(name, m, where, dedup)
        ctx = {"ids": self._ids(m_compte) if m_compte and any(op == "matched" for op, _ in dims.values()) else set()}
        g = pd.DataFrame({a: self._col(name, idx, c, op, k, ctx) for a, (op, k) in dims.items()}, index=idx)
        aggs = {}
        for a, (op, k) in meas.items():
            if op == "count":
                g[a] = 1
                aggs[a] = (a, "sum")
            elif op in ("sum", "sumabs", "numvalid"):
                x = self._of(name, c, k, "num", idx) if k in c else pd.Series(np.nan, index=idx)
                g[a] = x.abs() if op == "sumabs" else x.notna().astype(int) if op == "numvalid" else x
                aggs[a] = (a, "sum")
            elif op == "distinct":
                g[a] = self._of(name, c, k, "id", idx) if k in c else None
                aggs[a] = (a, "nunique")
        if not dims:
            return pd.DataFrame([{a: (g[col].sum() if f == "sum" else g[col].nunique()) for a, (col, f) in aggs.items()}])
        keys = list(dims)
        if not len(g):
            return pd.DataFrame(columns=keys + list(meas))
        out = g.groupby(keys, dropna=False).agg(**aggs).reset_index()
        for k in keys:
            out[k] = out[k].astype(object).where(out[k].notna(), None)
        return out

    def stats(self, name: str, m: dict) -> dict:
        c = cols_of(m)
        base = self._base(name, c)
        idx = base[base].index
        out = {"rows": int(len(self.t(name))), "usable": int(base.sum()), "fields": {}}
        for k, f in m["fields"].items():
            if not f["col"]:
                continue
            t = self._of(name, c, k, "text", idx)
            num, dt = self._of(name, c, k, "num", idx), self._of(name, c, k, "date", idx)
            st = {"nulls": int(t.isna().sum()), "filled": int(t.notna().sum()), "as_number": int(num.notna().sum()), "as_date": int(dt.notna().sum())}
            if f["kind"] == "date":
                st["valid"], st["invalid"] = int(dt.notna().sum()), int((t.notna() & dt.isna()).sum())
                bad = t[t.notna() & dt.isna()]
                st["rejected"] = [{"shape": s_, "n": int(n)} for s_, n in bad.map(shape).value_counts().head(5).items()]
                if st["valid"]:
                    st["min"], st["max"] = dt.min().date().isoformat(), dt.max().date().isoformat()
            elif f["kind"] == "nombre":
                st["valid"], st["invalid"] = int(num.notna().sum()), int((t.notna() & num.isna()).sum())
            if f["kind"] != "confidentiel":
                st["distinct"] = int(t.nunique())
            out["fields"][k] = st
        return out

    def concentration(self, name: str, m: dict, where=()) -> dict:
        c = cols_of(m)
        idx = self._index(name, m, where)
        a = pd.DataFrame({"k": self._of(name, c, "compte", "id", idx), "v": self._of(name, c, "montant_eur", "num", idx)}).dropna()
        v = a.groupby("k")["v"].sum()
        return _concentration(v[v > 0].sort_values(ascending=False).to_numpy())

    def duplicates(self, name: str, m: dict, keys: list[str]) -> dict:
        c = cols_of(m)
        idx = self._index(name, m)
        ref = self._of(name, c, "reference", "id", idx)
        full = pd.DataFrame({k: self._of(name, c, k, self._keyconv(name, k), idx) for k in keys if k in c}).assign(_r=ref)
        full = full[full["_r"].notna()]
        per = full.groupby("_r").size()
        distinct_lines = full.drop_duplicates().groupby("_r").size()
        return {"references": int(len(per)), "refs_repeated": int((per > 1).sum()), "exact_duplicates": int(full.duplicated().sum()),
                "refs_multi_lines": int((distinct_lines > 1).sum()), "without_reference": int(ref.isna().sum())}


    # -- vue nominative (à la demande, jamais mise en cache sur disque ni journalisée)
    def holders(self, name: str, m: dict, isins: list[str], where=()) -> pd.DataFrame:
        c = cols_of(m)
        idx = self._index(name, m, where)
        isin = self._of(name, c, "isin", "id", idx)
        idx = idx[isin.isin(set(isins)).fillna(False).to_numpy()]
        df = pd.DataFrame({"client": self._of(name, c, "nom_client", "text", idx).astype(object), "v": self._of(name, c, "montant_eur", "num", idx),
                           "compte": self._of(name, c, "compte", "id", idx), "teneur": self._of(name, c, "teneur", "text", idx).astype(object),
                           "pays": self._of(name, c, "pays", "text", idx).astype(object),
                           "classification": self._of(name, c, "classification", "text", idx).astype(object)}, index=idx)
        if df.empty:
            return pd.DataFrame(columns=["client", "n", "v", "comptes", "teneur", "pays", "classification"])
        df["client"] = df["client"].where(df["client"].notna(), None)
        g = df.groupby("client", dropna=False).agg(n=("v", "size"), v=("v", "sum"), comptes=("compte", "nunique"), teneur=("teneur", "max"),
                                                   pays=("pays", "max"), classification=("classification", "max")).reset_index()
        return g

    def client_funds(self, name: str, m: dict, q: str, where=()) -> pd.DataFrame:
        c = cols_of(m)
        idx = self._index(name, m, where)
        cl = self._of(name, c, "nom_client", "text", idx)
        hit = cl.fillna("").map(fold).str.contains(re.escape(fold(q)), regex=True)
        idx = idx[hit.to_numpy()]
        df = pd.DataFrame({"client": cl.loc[idx].astype(object), "isin": self._of(name, c, "isin", "id", idx).astype(object),
                           "v": self._of(name, c, "montant_eur", "num", idx)}, index=idx)
        if df.empty:
            return pd.DataFrame(columns=["client", "isin", "n", "v"])
        return df.groupby(["client", "isin"]).agg(n=("v", "size"), v=("v", "sum")).reset_index()

    def client_book(self, name: str, m: dict, top: int, where=()) -> pd.DataFrame:
        c = cols_of(m)
        idx = self._index(name, m, where)
        df = pd.DataFrame({"client": self._of(name, c, "nom_client", "text", idx).astype(object), "isin": self._of(name, c, "isin", "id", idx).astype(object),
                           "v": self._of(name, c, "montant_eur", "num", idx), "compte": self._of(name, c, "compte", "id", idx)}, index=idx)
        df = df.dropna(subset=["client"])
        if df.empty:
            return pd.DataFrame(columns=["client", "isin", "n", "v", "comptes"])
        keep = df.groupby("client")["v"].sum().sort_values(ascending=False).index[:top]
        df = df[df["client"].isin(set(keep))]
        return df.groupby(["client", "isin"], dropna=False).agg(n=("v", "size"), v=("v", "sum"), comptes=("compte", "nunique")).reset_index()

    def positions(self, name: str, m: dict, isins: list[str], where=(), eq: tuple[str, str | None] | None = None, cap: int = 5000) -> pd.DataFrame:
        """Positions d'un fonds, ligne à ligne, triées par Montant EUR décroissant (vue nominative, à la demande)."""
        c = cols_of(m)
        idx = self._index(name, m, where)
        idx = idx[self._of(name, c, "isin", "id", idx).isin(set(isins)).fillna(False).to_numpy()]
        if eq is not None:
            k, v = eq
            if k not in c:
                return pd.DataFrame(columns=[a for a, _, _ in POS_FIELDS])
            x = self._of(name, c, k, "id" if k == "isin" else "text", idx)
            idx = idx[(x.isna() if v is None else x.eq(v)).fillna(False).to_numpy()]
        df = pd.DataFrame({a: (self._of(name, c, k, how, idx) if k in c else pd.Series(None, index=idx, dtype=object)) for a, k, how in POS_FIELDS}, index=idx)
        df = df.sort_values("v", ascending=False, na_position="last").head(int(cap))
        for a, _, how in POS_FIELDS:
            if how == "date":
                df[a] = pd.to_datetime(df[a]).dt.strftime("%Y-%m-%d").where(df[a].notna(), None) if len(df) else df[a]
            elif how != "num":
                df[a] = df[a].astype(object).where(df[a].notna(), None)
        return df.reset_index(drop=True)


# Détail d'une position (vue nominative) : alias, clé du schéma, conversion
POS_FIELDS: tuple[tuple[str, str, str], ...] = (
    ("client", "nom_client", "text"), ("compte", "compte", "id"), ("compte_nom", "compte_nom", "text"), ("classification", "classification", "text"),
    ("commercial", "commercial", "text"), ("sdg", "sdg", "text"), ("teneur", "teneur", "text"), ("pays", "pays", "text"),
    ("type_fonds", "type_fonds", "text"), ("fonds", "fonds", "text"), ("isin", "isin", "id"), ("classe_actif", "classe_actif", "text"),
    ("desk", "desk", "text"), ("quantite", "quantite", "num"), ("cours", "cours", "num"), ("montant_devise", "montant_devise", "num"),
    ("devise", "devise", "text"), ("v", "montant_eur", "num"), ("premier_trade", "premier_trade", "date"), ("dernier_trade", "dernier_trade", "date"),
)


def _concentration(v: np.ndarray) -> dict:
    n = len(v)
    if n < 20:
        return {"available": False, "accounts": tranche(n)}
    cum = np.cumsum(v) / v.sum()
    pts = []
    for q in (0.01, 0.05, 0.10, 0.20, 0.50):
        k = max(1, int(np.ceil(n * q)))
        if k >= MIN_GROUP:
            pts.append({"top_pct": q * 100, "pct": round(float(cum[k - 1]) * 100, 1)})
    return {"available": True, "accounts": tranche(n), "points": pts,
            "accounts_for_half": tranche(int(np.searchsorted(cum, 0.5) + 1)), "accounts_for_80": tranche(int(np.searchsorted(cum, 0.8) + 1))}


class SqlReader:
    """Agrégats calculés dans Fabric (SELECT … GROUP BY, garde-fou lecture seule) : seuls des comptes et des sommes
    par groupe sont rapatriés."""

    kind = "fabric"

    def __init__(self, source: Any, names: dict[str, str]):
        self.src, self.names = source, names
        self._cols: dict[str, list[str]] = {}

    def _t(self, name: str) -> str:
        n = self.names.get(name, name)
        if not re.match(r"^[A-Za-z0-9_\-. ]+$", n):
            raise ValueError(f"Nom de table invalide : {n!r}")
        return f"[dbo].[{n}]"

    def columns(self, name: str) -> list[str]:
        if name not in self._cols:
            df = self.src.query(f"SELECT TOP 0 * FROM {self._t(name)}", label=f"passif {name} (colonnes)")
            self._cols[name] = [str(c) for c in df.columns]
        return self._cols[name]

    def _q(self, name: str, col: str) -> str:
        """Colonne citée : uniquement une colonne réellement présente dans la table (liste blanche)."""
        if col not in self.columns(name):
            raise ValueError(f"Colonne invalide : {col!r}")
        return "p.[" + col.replace("]", "]]") + "]"

    def _base(self, name: str, c: dict[str, str]) -> str:
        sent = [k for k in SENTINELS[name] if k in c]
        if not sent:
            return "1 = 1"
        some = " OR ".join(f"{_sql_text(self._q(name, c[k]))} IS NOT NULL" for k in sent)
        hdr = " AND ".join(f"COALESCE(LOWER(REPLACE({_sql_text(self._q(name, c[k]))}, ' ', '')), '') <> '{_key(REAL[name][k])}'" for k in sent)
        return f"({some}) AND {hdr}"

    def _dim(self, name: str, c: dict[str, str], op: str, k: str) -> str:
        if k not in c:
            return "CAST(NULL AS VARCHAR(10))"
        x = self._q(name, c[k])
        return {"text": _sql_text(x), "id": _sql_id(x), "date": f"CONVERT(VARCHAR(10), {_sql_date(x)}, 23)", "year": f"YEAR({_sql_date(x)})",
                "notnull": f"(CASE WHEN {_sql_text(x)} IS NULL THEN 0 ELSE 1 END)",
                "validdate": f"(CASE WHEN {_sql_date(x)} IS NULL THEN 0 ELSE 1 END)",
                "matched": f"(CASE WHEN r.k IS NULL THEN 0 ELSE 1 END)"}[op]

    def _from(self, name: str, m: dict, where=(), dedup=None) -> tuple[str, str]:
        """FROM (avec dédoublonnage éventuel) et WHERE de base."""
        c = cols_of(m)
        conds = [self._base(name, c)]
        for op, k, v in where:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(v)):
                raise ValueError("date invalide")
            conds.append(f"{_sql_date(self._q(name, c[k]))} {'=' if op == 'date_eq' else '>='} '{v}'")
        frm = f"{self._t(name)} p"
        if dedup and "reference" in c:
            part = ", ".join(_sql_num(self._q(name, c[k])) if KIND[name][k] == "nombre" else _sql_date(self._q(name, c[k])) if KIND[name][k] == "date"
                             else _sql_id(self._q(name, c[k])) for k in dedup if k in c)
            ref = _sql_id(self._q(name, c["reference"]))
            frm = (f"(SELECT p.*, CASE WHEN {ref} IS NULL THEN 1 ELSE ROW_NUMBER() OVER (PARTITION BY {part} ORDER BY (SELECT NULL)) END AS [_rn] "
                   f"FROM {self._t(name)} p WHERE {' AND '.join(conds)}) p")
            return frm, "p.[_rn] = 1"
        return frm, " AND ".join(conds)

    def group(self, name: str, m: dict, dims: dict, meas: dict, where=(), dedup=None, m_compte: dict | None = None) -> pd.DataFrame:
        c = cols_of(m)
        frm, cond = self._from(name, m, where, dedup)
        if any(op == "matched" for op, _ in dims.values()) and m_compte:
            cc = cols_of(m_compte)
            ids = _sql_id("q.[" + cc["id_compte"].replace("]", "]]") + "]")
            if cc["id_compte"] not in self.columns("compte"):
                raise ValueError("Colonne invalide")
            key = next(k for op, k in dims.values() if op == "matched")
            frm += f" LEFT JOIN (SELECT DISTINCT {ids} AS k FROM {self._t('compte')} q) r ON {_sql_id(self._q(name, c[key]))} = r.k"
        sel = [f"{self._dim(name, c, op, k)} AS [{a}]" for a, (op, k) in dims.items()]
        grp = [self._dim(name, c, op, k) for op, k in dims.values()]
        for a, (op, k) in meas.items():
            if op == "count":
                sel.append(f"COUNT(*) AS [{a}]")
            elif k not in c:
                sel.append(f"CAST(NULL AS FLOAT) AS [{a}]")
            elif op == "sum":
                sel.append(f"SUM({_sql_num(self._q(name, c[k]))}) AS [{a}]")
            elif op == "sumabs":
                sel.append(f"SUM(ABS({_sql_num(self._q(name, c[k]))})) AS [{a}]")
            elif op == "numvalid":
                sel.append(f"SUM(CASE WHEN {_sql_num(self._q(name, c[k]))} IS NULL THEN 0 ELSE 1 END) AS [{a}]")
            elif op == "distinct":
                sel.append(f"COUNT(DISTINCT {_sql_id(self._q(name, c[k]))}) AS [{a}]")
        sql = f"SELECT {', '.join(sel)} FROM {frm} WHERE {cond}" + (f" GROUP BY {', '.join(grp)}" if grp else "")
        return self.src.query(sql, label=f"passif {name} (agrégats)")

    def stats(self, name: str, m: dict) -> dict:
        c = cols_of(m)
        t = self._t(name)
        cnt = self.src.query(f"SELECT COUNT(*) AS [rows], SUM(CASE WHEN {self._base(name, c)} THEN 1 ELSE 0 END) AS [usable] FROM {t} p",
                             label=f"passif {name} (lignes)").iloc[0]
        parts = ["COUNT(*) AS [usable]"]
        keys = [(k, f) for k, f in m["fields"].items() if f["col"]]
        for i, (k, f) in enumerate(keys):
            x = self._q(name, f["col"])
            parts += [f"SUM(CASE WHEN {_sql_text(x)} IS NULL THEN 1 ELSE 0 END) AS [n{i}]",
                      f"SUM(CASE WHEN {_sql_num(x)} IS NOT NULL THEN 1 ELSE 0 END) AS [u{i}]",
                      f"SUM(CASE WHEN {_sql_date(x)} IS NOT NULL THEN 1 ELSE 0 END) AS [d{i}]"]
            if f["kind"] == "date":
                parts += [f"MIN({_sql_date(x)}) AS [lo{i}]", f"MAX({_sql_date(x)}) AS [hi{i}]"]
            if f["kind"] != "confidentiel":
                parts.append(f"COUNT(DISTINCT {_sql_text(x)}) AS [k{i}]")
        # Lignes exploitables seulement (ni en-tête relu comme donnée, ni enregistrement vide)
        r = self.src.query(f"SELECT {', '.join(parts)} FROM (SELECT * FROM {t} p WHERE {self._base(name, c)}) p", label=f"passif {name} (lecture)").iloc[0]
        r["rows"] = cnt["rows"]
        usable = int(r["usable"] or 0)
        out = {"rows": int(r["rows"] or 0), "usable": usable, "fields": {}}
        for i, (k, f) in enumerate(keys):
            nulls = int(r[f"n{i}"] or 0)
            st = {"nulls": nulls, "filled": usable - nulls, "as_number": int(r[f"u{i}"] or 0), "as_date": int(r[f"d{i}"] or 0)}
            if f["kind"] == "date":
                st["valid"], st["invalid"] = st["as_date"], max(0, usable - nulls - st["as_date"])
                if st["valid"]:
                    st["min"], st["max"] = str(r[f"lo{i}"])[:10], str(r[f"hi{i}"])[:10]
                st["rejected"] = []
                if st["invalid"]:
                    x = self._q(name, f["col"])
                    tr = f"LEFT(TRANSLATE(LOWER({_sql_text(x)}), 'abcdefghijklmnopqrstuvwxyz0123456789', '{'a' * 26}{'9' * 10}'), 40)"
                    df = self.src.query(f"SELECT TOP 5 {tr} AS [shape], COUNT(*) AS [n] FROM {t} p WHERE {self._base(name, c)} AND "
                                        f"{_sql_text(x)} IS NOT NULL AND {_sql_date(x)} IS NULL GROUP BY {tr} ORDER BY COUNT(*) DESC")
                    st["rejected"] = [{"shape": str(a), "n": int(b)} for a, b in zip(df["shape"], df["n"])]
            elif f["kind"] == "nombre":
                st["valid"], st["invalid"] = st["as_number"], max(0, usable - nulls - st["as_number"])
            if f["kind"] != "confidentiel":
                st["distinct"] = int(r[f"k{i}"] or 0)
            out["fields"][k] = st
        return out

    def concentration(self, name: str, m: dict, where=()) -> dict:
        c = cols_of(m)
        frm, cond = self._from(name, m, where)
        k, v = _sql_id(self._q(name, c["compte"])), _sql_num(self._q(name, c["montant_eur"]))
        qs = (0.01, 0.05, 0.10, 0.20, 0.50)
        sql = ("WITH a AS (SELECT " + k + " AS k, SUM(" + v + ") AS v FROM " + frm + " WHERE " + cond + " AND " + k + " IS NOT NULL GROUP BY " + k + "), "
               "r AS (SELECT v, ROW_NUMBER() OVER (ORDER BY v DESC) AS rn, COUNT(*) OVER () AS n, SUM(v) OVER () AS tot, "
               "SUM(v) OVER (ORDER BY v DESC ROWS UNBOUNDED PRECEDING) AS cum FROM a WHERE v > 0) "
               "SELECT MAX(n) AS [n], " + ", ".join(f"MAX(CASE WHEN rn = CASE WHEN CEILING(n * {q}) < 1 THEN 1 ELSE CEILING(n * {q}) END THEN cum / tot END) AS [q{i}]"
                                                    for i, q in enumerate(qs)) +
               ", MIN(CASE WHEN cum / tot >= 0.5 THEN rn END) AS [h50], MIN(CASE WHEN cum / tot >= 0.8 THEN rn END) AS [h80] FROM r")
        r = self.src.query(sql, label=f"passif {name} (concentration)").iloc[0]
        n = int(r["n"] or 0)
        if n < 20:
            return {"available": False, "accounts": tranche(n)}
        pts = [{"top_pct": q * 100, "pct": round(float(r[f"q{i}"]) * 100, 1)} for i, q in enumerate(qs)
               if max(1, int(np.ceil(n * q))) >= MIN_GROUP and r[f"q{i}"] is not None]
        return {"available": True, "accounts": tranche(n), "points": pts, "accounts_for_half": tranche(int(r["h50"] or 0)),
                "accounts_for_80": tranche(int(r["h80"] or 0))}

    def duplicates(self, name: str, m: dict, keys: list[str]) -> dict:
        c = cols_of(m)
        frm, cond = self._from(name, m)
        ref = _sql_id(self._q(name, c["reference"]))
        full = ", ".join(_sql_num(self._q(name, c[k])) if KIND[name][k] == "nombre" else _sql_date(self._q(name, c[k])) if KIND[name][k] == "date"
                         else _sql_id(self._q(name, c[k])) for k in keys if k in c)
        sql = ("WITH b AS (SELECT " + ref + " AS r, ROW_NUMBER() OVER (PARTITION BY " + full + " ORDER BY (SELECT NULL)) AS rn, "
               "DENSE_RANK() OVER (PARTITION BY " + ref + " ORDER BY " + full.replace(", ", ", ") + ") AS dr FROM " + frm + " WHERE " + cond + "), "
               "g AS (SELECT r, COUNT(*) AS c, MAX(dr) AS lines FROM b WHERE r IS NOT NULL GROUP BY r) "
               "SELECT (SELECT COUNT(*) FROM g) AS [refs], (SELECT COUNT(*) FROM g WHERE c > 1) AS [rep], "
               "(SELECT COUNT(*) FROM b WHERE r IS NOT NULL AND rn > 1) AS [exact], (SELECT COUNT(*) FROM g WHERE lines > 1) AS [multi], "
               "(SELECT COUNT(*) FROM b WHERE r IS NULL) AS [noref]")
        r = self.src.query(sql, label=f"passif {name} (références)").iloc[0]
        return {"references": int(r["refs"] or 0), "refs_repeated": int(r["rep"] or 0), "exact_duplicates": int(r["exact"] or 0),
                "refs_multi_lines": int(r["multi"] or 0), "without_reference": int(r["noref"] or 0)}


    # -- vue nominative : requêtes paramétrées, agrégées par client dans Fabric
    def holders(self, name: str, m: dict, isins: list[str], where=()) -> pd.DataFrame:
        if not isins:
            return pd.DataFrame(columns=["client", "n", "v", "comptes", "teneur", "pays", "classification"])
        c = cols_of(m)
        frm, cond = self._from(name, m, where)
        cl = _sql_text(self._q(name, c["nom_client"]))
        ph = ", ".join("?" for _ in isins)
        sel = [f"{cl} AS [client]", "COUNT(*) AS [n]", f"SUM({_sql_num(self._q(name, c['montant_eur']))}) AS [v]",
               f"COUNT(DISTINCT {_sql_id(self._q(name, c['compte']))}) AS [comptes]"]
        for k in ("teneur", "pays", "classification"):
            sel.append(f"MAX({_sql_text(self._q(name, c[k]))}) AS [{k}]" if k in c else f"CAST(NULL AS VARCHAR(10)) AS [{k}]")
        sql = (f"SELECT {', '.join(sel)} FROM {frm} WHERE {cond} AND {_sql_id(self._q(name, c['isin']))} IN ({ph}) GROUP BY {cl}")
        return self.src.query(sql, list(isins), label="passif porteurs d'un fonds")

    def client_funds(self, name: str, m: dict, q: str, where=()) -> pd.DataFrame:
        c = cols_of(m)
        frm, cond = self._from(name, m, where)
        cl = _sql_text(self._q(name, c["nom_client"]))
        isin = _sql_id(self._q(name, c["isin"]))
        like = "%" + q.lower().replace("[", "[[]").replace("%", "[%]").replace("_", "[_]") + "%"
        sql = (f"SELECT TOP 2000 {cl} AS [client], {isin} AS [isin], COUNT(*) AS [n], SUM({_sql_num(self._q(name, c['montant_eur']))}) AS [v] "
               f"FROM {frm} WHERE {cond} AND LOWER({cl}) LIKE ? GROUP BY {cl}, {isin}")
        return self.src.query(sql, [like], label="passif recherche d'un client")

    def client_book(self, name: str, m: dict, top: int, where=()) -> pd.DataFrame:
        """Premiers clients par encours (Montant EUR) puis, pour chacun, ses lignes par ISIN : tout est agrégé dans Fabric."""
        c = cols_of(m)
        frm, cond = self._from(name, m, where)
        cl = _sql_text(self._q(name, c["nom_client"]))
        isin = _sql_id(self._q(name, c["isin"]))
        v = _sql_num(self._q(name, c["montant_eur"]))
        cpt = _sql_id(self._q(name, c["compte"])) if "compte" in c else "NULL"
        n = int(top)
        sql = (f"SELECT {cl} AS [client], {isin} AS [isin], COUNT(*) AS [n], SUM({v}) AS [v], COUNT(DISTINCT {cpt}) AS [comptes] "
               f"FROM {frm} JOIN (SELECT TOP {n} {cl} AS [k] FROM {frm} WHERE {cond} AND {cl} IS NOT NULL GROUP BY {cl} ORDER BY SUM({v}) DESC) t "
               f"ON t.[k] = {cl} WHERE {cond} GROUP BY {cl}, {isin}")
        return self.src.query(sql, [], label="passif carnet des clients")

    def positions(self, name: str, m: dict, isins: list[str], where=(), eq: tuple[str, str | None] | None = None, cap: int = 5000) -> pd.DataFrame:
        """Positions d'un fonds, ligne à ligne : ISIN et filtre en paramètres, TOP borné, tri par Montant EUR dans Fabric."""
        if not isins:
            return pd.DataFrame(columns=[a for a, _, _ in POS_FIELDS])
        c = cols_of(m)
        frm, cond = self._from(name, m, where)

        def expr(k: str, how: str) -> str:
            if k not in c:
                return "CAST(NULL AS VARCHAR(10))"
            x = self._q(name, c[k])
            return {"text": _sql_text(x), "id": _sql_id(x), "num": _sql_num(x), "date": f"CONVERT(VARCHAR(10), {_sql_date(x)}, 23)"}[how]
        params: list = list(isins)
        conds = [cond, f"{expr('isin', 'id')} IN ({', '.join('?' for _ in isins)})"]
        if eq is not None:
            k, v = eq
            if k not in c:
                return pd.DataFrame(columns=[a for a, _, _ in POS_FIELDS])
            e = expr(k, "id" if k == "isin" else "text")
            if v is None:
                conds.append(f"{e} IS NULL")
            else:
                conds.append(f"{e} = ?")
                params.append(v)
        sel = ", ".join(f"{expr(k, how)} AS [{a}]" for a, k, how in POS_FIELDS)
        n = max(1, min(int(cap), 20000))
        q = f"SELECT TOP {n} {sel} FROM {frm} WHERE {' AND '.join(conds)} ORDER BY {expr('montant_eur', 'num')} DESC"
        return self.src.query(q, params, label="passif positions d'un fonds")


# ------------------------------------------------------------------ vues (parts, tranches, libellés propres)
def _pct(x: float, tot: float) -> float | None:
    return round(100.0 * x / tot, 1) if tot else None


def _label(v: Any) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)) or v is pd.NA:
        return NOT_SET
    s = str(v).strip()
    return NOT_SET if s.lower() in NULL_TOKENS else s


def _shares(df: pd.DataFrame, by: list[str], col: str, tot: float, cnt: str = "n") -> list[dict]:
    """Parts par groupe, groupes de moins de 5 masqués (restent dans le total) ; libellé manquant → « Non renseigné »."""
    if df.empty:
        return []
    d = df.copy()
    for k in by:
        d[k] = d[k].map(_label)
    g = d.groupby(by, dropna=False).agg(n=(cnt, "sum"), m=(col, "sum")).reset_index().sort_values("m", ascending=False)
    out = []
    for r in g.itertuples(index=False):
        t = tranche(r.n)
        if t is None:
            continue
        out.append({**{k: getattr(r, k) for k in by}, "pct": _pct(float(r.m or 0), tot), "tranche": t})
    return out


def _residual(items: list[dict]) -> float:
    return round(max(0.0, 100.0 - sum(x["pct"] or 0 for x in items)), 1)


def allowed_statuts() -> list[str]:
    raw = os.environ.get("APP_PASSIF_STATUTS_AUTORISES")
    return [s.strip() for s in raw.split(",") if s.strip()] if raw else list(DEFAULT_STATUTS)


def sens_label(v: Any) -> str:
    s = _label(v)
    return SENS_LABEL.get(fold(s), s)


def is_late(statut: Any) -> bool:
    return bool(statut) and bool(_CUTOFF.search(fold(statut)))


# ------------------------------------------------------------------ synthèse : quelques axes lisibles au lieu de milliers de groupes
SEGMENTS = {"direct": "Clients directs actifs", "prive": "Banque privée et institutionnels", "opc": "OPC et fonds de fonds",
            "omnibus": "Omnibus et plateformes", "inactif": "Comptes inactifs", "autre": "Autres comptes"}
ENTREES = {"Souscription", "Transfert entrant"}
SORTIES = {"Rachat", "Transfert sortant"}


def segment_of(c: Any) -> str:
    """Segment de clientèle d'une classification de compte (« TA/Client Actif » → clients directs actifs…)."""
    f = fold(c) if c is not None else ""
    if not f or f in NULL_TOKENS or f == fold(NOT_SET):
        return "autre"
    if "inactif" in f:
        return "inactif"
    if "omnibus" in f or "plateforme" in f or "passage global" in f:
        return "omnibus"
    if re.search(r"\bopc\b", f) or "fonds" in f:
        return "opc"
    if "banque privee" in f or "institution" in f or "prive" in f:
        return "prive"
    if "actif" in f:
        return "direct"
    return "autre"


def compare(enc: pd.DataFrame, flows: pd.DataFrame | None, key: str, top: int | None = None, other: str = "Autres") -> list[dict]:
    """Pour chaque groupe : part de l'encours, part des entrées et part des sorties de la période (volumes absolus, Montant EUR),
    et la tendance relative (entrées plus fortes que les sorties, en parts). Jamais un flux net, jamais un montant.
    Les `top` premiers groupes par encours sont détaillés, les autres réunis ; un groupe de moins de 5 n'est pas chiffré."""
    if enc is None or enc.empty:
        return []
    e = enc.assign(**{key: enc[key].map(_label)})
    order = e.groupby(key)["v"].sum().sort_values(ascending=False)
    keep = list(order.index[:top]) if top and len(order) > top + 1 else list(order.index)
    n_other = len(order) - len(keep)
    other_lab = f"{other} ({n_other})" if n_other else other
    remap = lambda v: v if v in keep else other_lab  # noqa: E731
    e[key] = e[key].map(remap)
    ge = e.groupby(key).agg(n=("n", "sum"), v=("v", "sum"))
    tot = float(ge["v"].sum())
    fin = fout = None
    if flows is not None and not flows.empty:
        f = flows.assign(**{key: flows[key].map(_label).map(remap)})
        fin = f[f["sens"].isin(ENTREES)].groupby(key).agg(n=("n", "sum"), v=("v", "sum"))
        fout = f[f["sens"].isin(SORTIES)].groupby(key).agg(n=("n", "sum"), v=("v", "sum"))
    rows = []
    for k in [*[x for x in keep if x in ge.index], *([other_lab] if n_other else [])]:
        if k not in ge.index:
            continue
        n = int(ge.at[k, "n"])
        t = tranche(n)

        def part(df):
            if df is None or k not in df.index or int(df.at[k, "n"]) < MIN_GROUP:
                return None
            return _pct(float(df.at[k, "v"]), float(df["v"].sum()))
        pi, po = part(fin), part(fout)
        trend = None if pi is None or po is None else "hausse" if pi - po >= 2 else "baisse" if po - pi >= 2 else "stable"
        ep = _pct(float(ge.at[k, "v"]), tot) if t else None
        # Activité relative : part moyenne des mouvements rapportée à la part de l'encours (1 = au prorata de son poids)
        act = round(((pi + po) / 2) / ep, 1) if pi is not None and po is not None and ep and ep >= 0.5 else None
        rows.append({"key": k, "encours_pct": ep, "tranche": t, "in_pct": pi, "out_pct": po, "trend": trend, "activity": act,
                     "other": k == other_lab and bool(n_other)})
    return rows


def comptes_view(g: pd.DataFrame, clients: pd.DataFrame) -> dict:
    """Structure des comptes. Dissous = DateDissolution valide ; avec parent = Id CompteParent non vide."""
    if g.empty:
        return {"available": False}
    g = g.copy()
    g["teneur"] = g["teneur"].map(_label)
    g["classification"] = g["classification"].map(_label)
    for b in ("parent", "creation", "dissolution"):
        g[b] = g[b].fillna(0).astype(int).astype(bool)
    cl = {_label(r.teneur): int(r.clients or 0) for r in clients.itertuples(index=False)} if not clients.empty else {}
    teneurs = []
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
        teneurs.append({"teneur": t, "tranche": tranche(n), "clients": tranche(cl.get(t)),
                        "classifications": sorted(classes, key=lambda z: -z["tranche"]["rank"])})
    tot = int(g["n"].sum())

    def split(col: str) -> tuple[dict | None, dict | None]:
        return tranche(int(g.loc[g[col], "n"].sum())), tranche(int(g.loc[~g[col], "n"].sum()))

    wp, np_ = split("parent")
    ck, cu = split("creation")
    ds, op = split("dissolution")
    return {"available": True, "total": tranche(tot), "teneurs": sorted(teneurs, key=lambda z: -z["tranche"]["rank"]),
            "with_parent": wp, "without_parent": np_, "creation_known": ck, "creation_unknown": cu, "dissolved": ds, "open": op,
            "dissolution_rule": "Dissous uniquement si DateDissolution contient une date valide.",
            "currencies": [{"devise": d, "tranche": tranche(int(x["n"].sum()))} for d, x in g.assign(devise=g["devise"].map(_label)).groupby("devise")
                           if int(x["n"].sum()) >= MIN_GROUP],
            "clients": tranche(int(sum(cl.values()))) if cl else None}


def _years_view(g: pd.DataFrame, as_of: pd.Timestamp | None, tot: float) -> list[dict]:
    """Ancienneté de l'encours : année du premier achat, regroupée en tranches d'âge."""
    if g.empty or as_of is None:
        return []
    y0 = as_of.year
    bands = [("Moins d'un an", 0, 0), ("1 à 3 ans", 1, 3), ("3 à 5 ans", 4, 5), ("5 à 10 ans", 6, 10), ("Plus de 10 ans", 11, 999)]
    out = []
    g = g.assign(y=pd.to_numeric(g["y"], errors="coerce"))
    known = g.dropna(subset=["y"])
    for lab, lo, hi in bands:
        x = known[(y0 - known["y"]).between(lo, hi)]
        t = tranche(int(x["n"].sum()))
        if t:
            out.append({"band": lab, "pct": _pct(float(x["v"].sum()), tot), "tranche": t})
    unk = g[g["y"].isna()]
    if int(unk["n"].sum()) >= MIN_GROUP:
        out.append({"band": "Date de premier achat non renseignée", "pct": _pct(float(unk["v"].sum()), tot), "tranche": tranche(int(unk["n"].sum()))})
    return out


# ------------------------------------------------------------------ calcul complet, mis en cache (rafraîchi chaque jour)
class Passif:
    def __init__(self, reader, isin_to_fund: dict[str, str] | None = None, ttl_hours: float = 6.0, fund_names: dict[str, str] | None = None,
                 share_names: dict[str, str] | None = None):
        self.reader, self.isin_to_fund = reader, {str(k).strip().upper().replace(" ", ""): v for k, v in (isin_to_fund or {}).items()}
        self.fund_names = fund_names or {}
        self.share_names = {str(k).strip().upper().replace(" ", ""): v for k, v in (share_names or {}).items()}
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

    # -- étapes
    def mappings(self) -> dict[str, dict]:
        return {t: resolve_mapping(self.reader.columns(t), t) for t in TABLES}

    def compute(self) -> dict:
        r = self.reader
        self._pos, self._trx = {}, {}
        maps = self.mappings()
        stats = {t: r.stats(t, maps[t]) for t in TABLES}
        out: dict[str, Any] = {"available": True, "source": r.kind, "refreshed_at": datetime.now().isoformat(timespec="minutes")}
        problems: list[dict] = []

        def missing(t: str) -> list[str]:
            return [k for k in REQUIRED[t] if k in maps[t]["missing"]]

        # ---- comptes
        mc = maps["compte"]
        if missing("compte"):
            out["comptes"] = {"available": False, "reason": f"Colonnes absentes : {', '.join(REAL['compte'][k] for k in missing('compte'))}"}
        else:
            g = r.group("compte", mc, {"teneur": ("text", "teneur"), "classification": ("text", "classification"), "devise": ("text", "devise"),
                                       "parent": ("notnull", "id_parent"), "creation": ("validdate", "date_creation"),
                                       "dissolution": ("validdate", "date_dissolution")}, {"n": ("count", None)})
            cl = r.group("compte", mc, {"teneur": ("text", "teneur")}, {"clients": ("distinct", "id_client")})
            out["comptes"] = comptes_view(g, cl)
            sd = stats["compte"]["fields"].get("date_dissolution", {})
            if sd.get("invalid"):
                problems.append({"table": "compte", "field": "date_dissolution", "level": "info",
                                 "text": f"{sd['invalid']} valeurs de DateDissolution illisibles : comptées comme non dissoutes."})

        # ---- positions : photo à la dernière date valide
        mp = maps["position"]
        out["positions"], out["funds"], out["positions_as_of"] = {"available": False}, {}, None
        if missing("position"):
            out["positions"]["reason"] = f"Colonnes absentes : {', '.join(REAL['position'][k] for k in missing('position'))}"
        else:
            dts = r.group("position", mp, {"d": ("date", "date")}, {"n": ("count", None)})
            valid = dts.dropna(subset=["d"])
            if valid.empty:
                sd = stats["position"]["fields"].get("date", {})
                rej = ", ".join(f"« {x['shape']} »" for x in sd.get("rejected", [])) or "aucune valeur"
                out["positions"]["reason"] = (f"Aucune date valide dans {REAL['position']['date']} ({mp['fields']['date']['col']}). "
                                              f"Formats rejetés : {rej}. Formats acceptés : m/j/aaaa [h:mm:ss AM], aaaa-mm-jj.")
                problems.append({"table": "position", "field": "date", "level": "erreur", "text": out["positions"]["reason"]})
            else:
                as_of = pd.Timestamp(max(valid["d"]))
                iso = as_of.date().isoformat()
                out["positions_as_of"] = iso
                out["positions"] = self._positions(mp, mc, iso, as_of)
                out["funds"] = out["positions"].pop("_funds", {})

        # ---- transactions : 60 derniers jours ouvrés valides, statuts autorisés, doublons exacts écartés
        mt = maps["transaction"]
        if missing("transaction"):
            out["transactions"] = {"available": False, "reason": f"Colonnes absentes : {', '.join(REAL['transaction'][k] for k in missing('transaction'))}"}
        else:
            out["transactions"] = self._transactions(mt, stats["transaction"], problems)

        out["synthese"] = self._synthese()
        links = out["positions"].pop("links", None)
        dups = out["transactions"].pop("duplicates", None)
        out["lecture"] = self._lecture(maps, stats, out, problems, links, dups)
        out["model"] = {"clients": out["comptes"].get("clients"), "comptes": out["comptes"].get("total"),
                        "positions": out["positions"].get("total"), "operations": out["transactions"].get("ops"),
                        "funds_held": tranche(len(out["funds"])) if out["funds"] else None}
        return out

    def _positions(self, mp: dict, mc: dict, iso: str, as_of: pd.Timestamp) -> dict:
        r = self.reader
        w = [("date_eq", "date", iso)]
        amt = {"n": ("count", None), "v": ("sum", "montant_eur"), "ok": ("numvalid", "montant_eur")}
        main = r.group("position", mp, {"classe_actif": ("text", "classe_actif"), "desk": ("text", "desk"), "devise": ("text", "devise")}, amt, w)
        main["v"] = pd.to_numeric(main["v"], errors="coerce").fillna(0.0)
        tot = float(main["v"].sum())
        if tot <= 0:
            return {"available": False, "reason": "Montant EUR nul ou illisible à la date de la photo."}
        groups = _shares(main, ["classe_actif", "desk", "devise"], "v", tot)

        def by(dims: dict) -> pd.DataFrame:
            x = r.group("position", mp, dims, amt, w, m_compte=mc)
            x["v"] = pd.to_numeric(x["v"], errors="coerce").fillna(0.0)
            return x

        holders = by({"teneur": ("text", "teneur"), "classification": ("text", "classification")})
        geo = by({"pays": ("text", "pays")})
        self._pos = {"holders": holders, "geo": geo, "main": main, "tot": tot}
        sdg = by({"sdg": ("text", "sdg"), "type_fonds": ("text", "type_fonds")})
        first = by({"y": ("year", "premier_trade")})
        last = by({"y": ("year", "dernier_trade")})
        link = by({"matched": ("matched", "compte")}) if mc["fields"]["id_compte"]["col"] else pd.DataFrame()
        accts = r.group("position", mp, {"matched": ("matched", "compte")}, {"a": ("distinct", "compte")}, w, m_compte=mc) \
            if mc["fields"]["id_compte"]["col"] else pd.DataFrame()
        isin = by({"isin": ("id", "isin")})
        # Contrôles de cohérence (comptes de lignes, jamais de montant) : Montant EUR = Montant Devise en EUR ; quantité × cours
        view: dict[str, Any] = {
            "available": True, "measure": "part de l'encours (Montant EUR)", "groups": groups, "residual_pct": _residual(groups),
            "by_desk": _shares(main, ["desk"], "v", tot), "by_class": _shares(main, ["classe_actif"], "v", tot),
            "by_currency": _shares(main, ["devise"], "v", tot), "total": tranche(int(main["n"].sum())),
            "by_holder": _shares(holders, ["teneur", "classification"], "v", tot), "by_teneur": _shares(holders, ["teneur"], "v", tot),
            "by_classification": _shares(holders, ["classification"], "v", tot),
            "by_country": [{**x, "iso": L.country(x["pays"])[1] if x["pays"] != NOT_SET else "??"} for x in _shares(geo, ["pays"], "v", tot)],
            "by_sdg": _shares(sdg, ["sdg"], "v", tot), "by_fund_type": _shares(sdg, ["type_fonds"], "v", tot),
            "seniority": _years_view(first, as_of, tot),
            "last_trade": _years_view(last, as_of, tot),
            "amount_valid_pct": _pct(float(main["ok"].sum()), float(main["n"].sum())),
        }
        # compatibilité des autres pages (fiche fonds, distribution)
        view["by_client"] = [{"teneur": x["teneur"], "classification": x["classification"], "pct": x["pct"], "tranche": x["tranche"]} for x in view["by_holder"]]
        m = main.assign(desk=main["desk"].map(_label), classe_actif=main["classe_actif"].map(_label)).groupby(["desk", "classe_actif"]).agg(n=("n", "sum"), v=("v", "sum")).reset_index()
        view["matrix"] = [{"desk": x.desk, "classe_actif": x.classe_actif, "pct": _pct(x.v, tot)} for x in m.itertuples(index=False) if x.n >= MIN_GROUP]
        view["concentration"] = r.concentration("position", mp, w) if mp["fields"]["compte"]["col"] else {"available": False}
        # Rattachements : comptes (Compte Centaure ↔ Id Compte) et ISIN (↔ PI_OUT_Share.ISIN_Code)
        links: dict[str, Any] = {}
        if not link.empty:
            link["matched"] = link["matched"].fillna(0).astype(int)
            hit = link[link["matched"] == 1]
            links["accounts"] = {"rows_pct": _pct(float(hit["n"].sum()), float(link["n"].sum())), "amount_pct": _pct(float(hit["v"].sum()), tot),
                                 "linked": int(accts.loc[accts["matched"].fillna(0).astype(int) == 1, "a"].sum()) if not accts.empty else 0,
                                 "distinct": int(accts["a"].sum()) if not accts.empty else 0}
        isin["fund"] = isin["isin"].map(lambda v: self.isin_to_fund.get(str(v)) if v else None)
        ok = isin.dropna(subset=["fund"])
        links["isin"] = {"distinct": int(isin["isin"].notna().sum()), "linked": int(len(ok)),
                         "amount_pct": _pct(float(ok["v"].sum()), tot), "rows_pct": _pct(float(ok["n"].sum()), float(isin["n"].sum()))}
        view["links"] = links
        bf = ok.groupby("fund").agg(n=("n", "sum"), v=("v", "sum"))
        funds = {f: {"pct": _pct(float(x.v), tot), "positions": tranche(int(x.n)), "name": self.fund_names.get(f)} for f, x in bf.iterrows() if x.n >= MIN_GROUP}
        view["top_funds"] = sorted(({"fund": f, "name": self.fund_names.get(f), **v} for f, v in funds.items()), key=lambda z: -(z["pct"] or 0))[:8]
        view["top_funds_pct"] = round(sum(x["pct"] or 0 for x in view["top_funds"]), 1)
        view["funds_count"] = tranche(len(funds))
        view["_funds"] = funds
        self._isin_v = {str(k): float(v) for k, v in zip(isin["isin"], isin["v"]) if k}
        return view

    def _transactions(self, mt: dict, st: dict, problems: list) -> dict:
        r = self.reader
        dedup = ["reference", "compte", "isin", "sens", "statut", "date_centralisation", "montant_eur"]
        dims = {"d": ("date", "date_centralisation"), "desk": ("text", "desk"), "classe_actif": ("text", "classe_actif"),
                "sens": ("text", "sens"), "statut": ("text", "statut"), "devise": ("text", "devise")}
        meas = {"n": ("count", None), "v": ("sumabs", "montant_eur"), "ok": ("numvalid", "montant_eur")}
        g = r.group("transaction", mt, dims, meas, dedup=dedup)
        dup = r.duplicates("transaction", mt, dedup) if mt["fields"]["reference"]["col"] else None
        g["v"] = pd.to_numeric(g["v"], errors="coerce").fillna(0.0)
        # Statuts réellement présents, retenus seulement s'ils sont explicitement autorisés
        allow = {fold(s) for s in allowed_statuts()}
        sts = g.assign(statut=g["statut"].map(_label)).groupby("statut").agg(n=("n", "sum"), v=("v", "sum")).reset_index()
        vol_all = float(sts["v"].sum())
        statuts = [{"statut": x.statut, "included": fold(x.statut) in allow, "tranche": tranche(int(x.n)), "pct": _pct(float(x.v), vol_all)}
                   for x in sts.sort_values("n", ascending=False).itertuples(index=False)]
        base = {"statuts": statuts, "allowed": allowed_statuts(), "duplicates": dup, "window_days": WINDOW_DAYS}
        g = g.loc[g["statut"].map(lambda v: fold(_label(v)) in allow).astype(bool)]
        dated = g.dropna(subset=["d"])
        if dated.empty:
            sd = st["fields"].get("date_centralisation", {})
            rej = ", ".join(f"« {x['shape']} »" for x in sd.get("rejected", [])) or "aucune valeur"
            why = ("Aucune opération avec un statut autorisé." if g.empty else
                   f"Aucune date valide dans {REAL['transaction']['date_centralisation']} ({mt['fields']['date_centralisation']['col']}). "
                   f"Formats rejetés : {rej}. Formats acceptés : m/j/aaaa [h:mm:ss AM], aaaa-mm-jj.")
            problems.append({"table": "transaction", "field": "date_centralisation", "level": "erreur", "text": why})
            return {"available": False, "reason": why, **base}
        days_all = sorted({d for d in dated["d"] if pd.Timestamp(d).dayofweek < 5})
        keep = days_all[-WINDOW_DAYS:]
        g = dated.loc[dated["d"].isin(keep).astype(bool)].copy()
        g["sens"] = g["sens"].map(sens_label)
        g["statut"] = g["statut"].map(_label)
        statut_known = bool(mt["fields"]["statut"]["col"]) and st["fields"].get("statut", {}).get("filled", 0) > 0
        g["late"] = g["statut"].map(is_late)
        tot = float(g["v"].sum())
        late = ({"calculable": True, "pct": _pct(float(g.loc[g["late"], "v"].sum()), tot),
                 "rule": "Part du volume dont le statut indique « après cut-off »."} if statut_known and tot > 0 else
                {"calculable": False, "pct": None, "rule": "Non calculable : statut ou Montant EUR indisponible."})
        out_days = []
        for d, x in g.groupby("d"):
            t = float(x["v"].sum())
            lt = x[x["late"]]
            out_days.append({"date": str(d), "ops": tranche(int(x["n"].sum())), "sens": _shares(x, ["sens"], "v", t), "desks": _shares(x, ["desk"], "v", t),
                             "late_pct": _pct(float(lt["v"].sum()), t) if late["calculable"] and int(lt["n"].sum()) >= MIN_GROUP else None,
                             "groups": _shares(x, ["classe_actif", "desk", "sens", "statut", "devise"], "v", t)[:12]})
        who = r.group("transaction", mt, {"pays": ("text", "pays"), "teneur": ("text", "teneur"), "classification": ("text", "classification"),
                                         "sens": ("text", "sens"), "statut": ("text", "statut")}, meas,
                      [("date_ge", "date_centralisation", keep[0])], dedup=dedup)
        who["v"] = pd.to_numeric(who["v"], errors="coerce").fillna(0.0)
        who = who.loc[who["statut"].map(lambda v: fold(_label(v)) in allow).astype(bool)].assign(sens=lambda x: x["sens"].map(sens_label))
        geo = who
        self._trx = {"g": g, "who": who, "late": late}
        return {"available": True, **base, "measure": "part du volume absolu (Montant EUR)", "first": keep[0], "last": keep[-1],
                "n_days": len(keep), "days": out_days, "period_sens": _shares(g, ["sens"], "v", tot), "period_desks": _shares(g, ["desk"], "v", tot),
                "period_classes": _shares(g, ["classe_actif"], "v", tot),
                "period_countries": [{**x, "iso": L.country(x["pays"])[1] if x["pays"] != NOT_SET else "??"} for x in _shares(geo, ["pays"], "v", float(geo["v"].sum()))],
                "period_desk_sens": _shares(g, ["desk", "sens"], "v", tot),
                "late": late, "period_late_pct": late["pct"], "ops": tranche(int(g["n"].sum())),
                "amount_valid_pct": _pct(float(g["ok"].sum()), float(g["n"].sum()))}

    # ---------------------------------------------------------------- vue nominative (choix explicite de l'équipe)
    def _ready(self) -> tuple[dict, dict, str] | None:
        d = self.get()
        if not d.get("available") or not d.get("positions_as_of"):
            return None
        maps = self.mappings()
        return d, maps, d["positions_as_of"]

    def holders(self, fund_id: str, limit: int = 200) -> dict:
        """Clients porteurs d'un fonds à la date de la photo : part du fonds détenue (Montant EUR), sans montant."""
        ready = self._ready()
        if ready is None:
            return {"available": False, "reason": "Positions non publiées."}
        d, maps, iso = ready
        mp = maps["position"]
        if mp["fields"]["nom_client"]["col"] is None:
            return {"available": False, "reason": "Colonne Nom client absente de la table Position."}
        isins = sorted(k for k, f in self.isin_to_fund.items() if f == fund_id)
        g = self.reader.holders("position", mp, isins, [("date_eq", "date", iso)])
        if g is None or g.empty:
            return {"available": True, "fund": fund_id, "name": self.fund_names.get(fund_id), "as_of": iso, "clients": [], "n_clients": 0}
        g = g.copy()
        g["v"] = pd.to_numeric(g["v"], errors="coerce").fillna(0.0)
        tot = float(g["v"].sum())
        g = g.sort_values("v", ascending=False)
        rows = [{"client": _label(x.client), "pct": _pct(float(x.v), tot), "positions": int(x.n), "comptes": int(x.comptes or 0),
                 "teneur": _label(x.teneur), "pays": _label(x.pays), "segment": SEGMENTS[segment_of(x.classification)]}
                for x in g.head(limit).itertuples(index=False)]
        rest = g.iloc[limit:]
        return {"available": True, "nominatif": True, "fund": fund_id, "name": self.fund_names.get(fund_id), "as_of": iso, "n_clients": int(len(g)),
                "clients": rows, "others_pct": _pct(float(rest["v"].sum()), tot) if len(rest) else None,
                "top10_pct": _pct(float(g.head(10)["v"].sum()), tot), "isins": len(isins)}

    def _breakdown_base(self, mp: dict, iso: str) -> pd.DataFrame:
        """Encours (Montant EUR) à la date de la photo, agrégé par part × pays × classification × teneur : des sommes par
        groupe, sans aucun nom de client. Calculé une fois par photo, puis filtré fonds par fonds."""
        key = ("breakdown", iso)
        cache = getattr(self, "_bk", None)
        if cache and cache[0] == key:
            return cache[1]
        g = self.reader.group("position", mp, {"isin": ("id", "isin"), "pays": ("text", "pays"), "classification": ("text", "classification"),
                                               "teneur": ("text", "teneur"), "devise": ("text", "devise")},
                              {"n": ("count", None), "v": ("sum", "montant_eur")}, [("date_eq", "date", iso)])
        g = g.copy() if g is not None else pd.DataFrame(columns=["isin", "pays", "classification", "teneur", "devise", "n", "v"])
        g["v"] = pd.to_numeric(g["v"], errors="coerce").fillna(0.0)
        g["isin"] = g["isin"].map(lambda x: str(x).strip().upper().replace(" ", "") if x is not None and str(x).strip() else None)
        g["fund"] = g["isin"].map(lambda x: self.isin_to_fund.get(x) if x else None)
        self._bk = (key, g)
        return g

    def fund_breakdown(self, fund_id: str) -> dict:
        """Où est détenu un fonds, d'après les positions du passif à la date de la photo : pays du porteur, segment de
        clientèle, teneur de compte, part et devise — en Montant EUR et en part de l'encours suivi au passif.
        Le pays est celui du compte porteur (pas le pays d'autorisation de la part)."""
        ready = self._ready()
        if ready is None:
            return {"available": False, "reason": "Positions du passif non publiées."}
        d, maps, iso = ready
        mp = maps["position"]
        if mp["fields"]["montant_eur"]["col"] is None:
            return {"available": False, "reason": "Colonne Montant EUR absente de la table Position."}
        g = self._breakdown_base(mp, iso)
        g = g[g["fund"] == fund_id]
        tot = float(g["v"].sum())
        if g.empty or tot <= 0:
            return {"available": True, "fund": fund_id, "as_of": iso, "total": 0.0, "countries": [], "segments": [], "teneurs": [], "parts": [],
                    "currencies": [], "reason": "Aucune position de ce fonds au passif à la date de la photo."}

        def rows(col: str, label=_label, top: int | None = None) -> list[dict]:
            x = g.assign(k=g[col].map(label)).groupby("k").agg(v=("v", "sum"), n=("n", "sum")).reset_index().sort_values("v", ascending=False)
            out = [{"key": r.k, "encours": float(r.v), "pct": _pct(float(r.v), tot), "positions": int(r.n)} for r in x.itertuples(index=False)]
            if top and len(out) > top:
                rest = out[top:]
                out = out[:top] + [{"key": f"{len(rest)} autres", "encours": sum(r["encours"] for r in rest),
                                    "pct": _pct(sum(r["encours"] for r in rest), tot), "positions": sum(r["positions"] for r in rest), "other": True}]
            return out

        countries = [{**r, "iso": (L.country(r["key"])[1] if r["key"] != NOT_SET and not r.get("other") else None)} for r in rows("pays")]
        parts = [{**r, "isin": r["key"], "share": self.share_names.get(r["key"] or "", None)} for r in rows("isin", label=lambda v: v or NOT_SET)]
        return {"available": True, "fund": fund_id, "name": self.fund_names.get(fund_id), "as_of": iso, "total": tot,
                "measure": "Montant EUR des positions au passif", "countries": countries,
                "segments": rows("classification", label=lambda v: SEGMENTS[segment_of(v)]), "teneurs": rows("teneur", top=8),
                "parts": parts, "currencies": rows("devise"), "positions": int(g["n"].sum())}

    AXES = {"countries": "pays", "segments": "classification", "teneurs": "teneur", "parts": "isin", "currencies": "devise"}

    def fund_positions(self, fund_id: str, axis: str | None = None, key: str | None = None, limit: int = 25) -> dict:
        """Positions d'un fonds à la date de la photo, ligne à ligne et triées par Montant EUR : tout le détail de la table
        Position (porteur, compte, commercial, teneur, pays, part, quantité, cours, montants, premières et dernières
        opérations). Vue nominative : calculée à la demande dans la source, jamais mise en cache ni journalisée.
        `axis`/`key` restreignent à un groupe de la répartition (un pays, un segment, un teneur, une part, une devise)."""
        ready = self._ready()
        if ready is None:
            return {"available": False, "reason": "Positions du passif non publiées."}
        d, maps, iso = ready
        mp = maps["position"]
        if mp["fields"]["montant_eur"]["col"] is None:
            return {"available": False, "reason": "Colonne Montant EUR absente de la table Position."}
        if axis is not None and axis not in self.AXES:
            return {"available": False, "reason": "Axe inconnu."}
        isins = sorted(k for k, f in self.isin_to_fund.items() if f == fund_id)
        limit = max(1, min(int(limit), 2000))
        base = self._breakdown_base(mp, iso)
        base = base[base["fund"] == fund_id]
        fund_tot = float(base["v"].sum())

        # Groupe demandé : mêmes libellés que la répartition (« Non renseigné » ↔ valeur absente)
        eq, seg = None, None
        if axis and key is not None:
            col = self.AXES[axis]
            if axis == "segments":
                seg = key
                sel = base["classification"].map(lambda v: SEGMENTS[segment_of(v)]) == key
            else:
                raw = None if key == NOT_SET else (key.strip().upper().replace(" ", "") if axis == "parts" else key.strip())
                eq = (col, raw)
                sel = base[col].map(_label if axis != "parts" else (lambda v: v or NOT_SET)) == key
            grp = base[sel]
        else:
            grp = base
        grp_tot, grp_n = float(grp["v"].sum()), int(grp["n"].sum())
        # Le segment regroupe plusieurs classifications : filtré ici, après une lecture bornée des positions du fonds
        cap = limit if seg is None else max(limit, min(20000, int(base["n"].sum())))
        df = self.reader.positions("position", mp, isins, [("date_eq", "date", iso)], eq=eq, cap=cap) if isins else None
        if df is None or df.empty:
            rows = []
        else:
            df = df.copy()
            if seg is not None:
                df = df[df["classification"].map(lambda v: SEGMENTS[segment_of(v)]) == seg]
            df = df.head(limit)
            asof = pd.Timestamp(iso)
            rows = []
            for x in df.itertuples(index=False):
                v = float(x.v) if x.v is not None and x.v == x.v else None
                first = pd.Timestamp(x.premier_trade) if x.premier_trade else None
                num = (lambda y: float(y) if y is not None and y == y else None)
                pays = _label(x.pays)
                rows.append({
                    "client": None if x.client is None else str(x.client), "compte": x.compte, "compte_nom": x.compte_nom,
                    "segment": SEGMENTS[segment_of(x.classification)], "classification": x.classification, "commercial": x.commercial,
                    "sdg": x.sdg, "teneur": x.teneur, "pays": pays, "iso": L.country(pays)[1] if pays != NOT_SET else None,
                    "isin": x.isin, "share": self.share_names.get(x.isin or "", None), "fonds_source": x.fonds, "type_fonds": x.type_fonds,
                    "classe_actif": x.classe_actif, "desk": x.desk, "quantite": num(x.quantite), "cours": num(x.cours),
                    "montant_devise": num(x.montant_devise), "devise": x.devise, "encours": v,
                    "pct_group": _pct(v, grp_tot) if v is not None else None, "pct_fund": _pct(v, fund_tot) if v is not None else None,
                    "premier_trade": x.premier_trade, "dernier_trade": x.dernier_trade,
                    "anciennete_ans": round((asof - first).days / 365.25, 1) if first is not None and first <= asof else None})
        return {"available": True, "nominatif": True, "fund": fund_id, "name": self.fund_names.get(fund_id), "as_of": iso,
                "axis": axis, "key": key, "group_total": grp_tot, "group_positions": grp_n, "fund_total": fund_tot,
                "shown": len(rows), "more": grp_n > len(rows), "positions": rows}

    def client_search(self, q: str, limit: int = 25) -> dict:
        """Fonds détenus par les clients dont le nom contient `q` : part de chaque fonds détenue par le client."""
        q = (q or "").strip()
        if len(q) < 2:
            return {"available": True, "clients": [], "reason": "Saisir au moins deux caractères."}
        ready = self._ready()
        if ready is None:
            return {"available": False, "reason": "Positions non publiées."}
        d, maps, iso = ready
        mp = maps["position"]
        if mp["fields"]["nom_client"]["col"] is None:
            return {"available": False, "reason": "Colonne Nom client absente de la table Position."}
        g = self.reader.client_funds("position", mp, q[:80], [("date_eq", "date", iso)])
        if g is None or g.empty:
            return {"available": True, "as_of": iso, "clients": []}
        g = g.copy()
        g["v"] = pd.to_numeric(g["v"], errors="coerce").fillna(0.0)
        g["fund"] = g["isin"].map(lambda v: self.isin_to_fund.get(str(v)) if v else None)
        fund_tot: dict[str, float] = {}
        for isin, v in getattr(self, "_isin_v", {}).items():
            f = self.isin_to_fund.get(isin)
            if f:
                fund_tot[f] = fund_tot.get(f, 0.0) + v
        out = []
        for cl, x in sorted(g.groupby("client"), key=lambda kv: -float(kv[1]["v"].sum()))[:limit]:
            cv = float(x["v"].sum())
            funds = []
            for f, y in x.dropna(subset=["fund"]).groupby("fund"):
                fv = float(y["v"].sum())
                funds.append({"fund": f, "name": self.fund_names.get(f), "pct_of_fund": _pct(fv, fund_tot.get(f, 0.0)), "pct_of_client": _pct(fv, cv)})
            unlinked = float(x.loc[x["fund"].isna(), "v"].sum())
            out.append({"client": _label(cl), "funds": sorted(funds, key=lambda z: -(z["pct_of_client"] or 0)),
                        "unlinked_pct": _pct(unlinked, cv) if unlinked else None, "positions": int(x["n"].sum())})
        return {"available": True, "nominatif": True, "as_of": iso, "clients": out}

    def fund_flows(self, fund_id: str) -> dict:
        """Souscriptions et rachats d'un fonds d'après la table Transaction (Montant EUR, statuts autorisés, fenêtre du passif).
        Sert de collecte de remplacement quand la collecte JUMP d'un fonds est neutralisée."""
        d = self.get()
        t = d.get("transactions") or {}
        if not d.get("available") or not t.get("available"):
            return {"available": False, "reason": t.get("reason") or "Transactions non publiées."}
        isins = {k for k, f in self.isin_to_fund.items() if f == fund_id}
        if not isins:
            return {"available": False, "reason": "Aucun ISIN du fonds dans le référentiel."}
        mt = self.mappings()["transaction"]
        meas = {"n": ("count", None), "v": ("sumabs", "montant_eur")}
        g = self.reader.group("transaction", mt, {"isin": ("id", "isin"), "sens": ("text", "sens"), "statut": ("text", "statut")}, meas,
                              [("date_ge", "date_centralisation", t["first"])],
                              dedup=["reference", "compte", "isin", "sens", "statut", "date_centralisation", "montant_eur"])
        if g is None or g.empty:
            return {"available": True, "fund": fund_id, "first": t["first"], "last": t["last"], "subscriptions": 0.0, "redemptions": 0.0, "net": 0.0, "n": 0}
        allow = {fold(x) for x in allowed_statuts()}
        g = g.loc[g["statut"].map(lambda v: fold(_label(v)) in allow).astype(bool)]
        g = g.loc[g["isin"].map(lambda v: str(v).strip().upper().replace(" ", "") in isins if v is not None else False).astype(bool)]
        g = g.assign(v=pd.to_numeric(g["v"], errors="coerce").fillna(0.0), sens=g["sens"].map(sens_label))
        sub = float(g.loc[g["sens"] == "Souscription", "v"].sum())
        red = float(g.loc[g["sens"] == "Rachat", "v"].sum())
        return {"available": True, "fund": fund_id, "name": self.fund_names.get(fund_id), "first": t["first"], "last": t["last"],
                "n_days": t.get("n_days"), "subscriptions": sub, "redemptions": red, "net": sub - red, "n": int(g["n"].sum()),
                "source": "Transaction (Montant EUR), statuts autorisés"}

    def client_book(self, top: int = 60) -> dict:
        """Qui est investi dans quoi, à la date de la photo : les `top` premiers clients par encours, chacun avec ses fonds
        et ses parts (Montant EUR), à la demande de l'équipe ; calculé dans la source, jamais conservé ni journalisé."""
        ready = self._ready()
        if ready is None:
            return {"available": False, "reason": "Positions non publiées."}
        d, maps, iso = ready
        mp = maps["position"]
        if mp["fields"]["nom_client"]["col"] is None:
            return {"available": False, "reason": "Colonne Nom client absente de la table Position."}
        g = self.reader.client_book("position", mp, top, [("date_eq", "date", iso)])
        if g is None or g.empty:
            return {"available": True, "nominatif": True, "as_of": iso, "clients": [], "total": None}
        g = g.copy()
        g["v"] = pd.to_numeric(g["v"], errors="coerce").fillna(0.0)
        g["isin"] = g["isin"].map(lambda x: str(x).strip().upper().replace(" ", "") if x is not None and str(x).strip() else None)
        g["fund"] = g["isin"].map(lambda x: self.isin_to_fund.get(x) if x else None)
        tot_all = float(getattr(self, "_pos", {}).get("tot") or 0.0)
        out = []
        for cl, x in sorted(g.groupby("client"), key=lambda kv: -float(kv[1]["v"].sum())):
            cv = float(x["v"].sum())
            funds = []
            for f, y in x.assign(fund=x["fund"].fillna("")).groupby("fund"):
                fv = float(y["v"].sum())
                shares = [{"isin": r.isin, "share": self.share_names.get(r.isin or "", None), "encours": float(r.v), "positions": int(r.n)}
                          for r in y.sort_values("v", ascending=False).itertuples(index=False)]
                funds.append({"fund": f or None, "name": self.fund_names.get(f) if f else None, "linked": bool(f),
                              "encours": fv, "pct_of_client": _pct(fv, cv), "shares": shares})
            funds.sort(key=lambda z: (not z["linked"], -z["encours"]))
            out.append({"client": _label(cl), "encours": cv, "positions": int(x["n"].sum()),
                        "n_funds": sum(1 for z in funds if z["linked"]), "funds": funds})
        return {"available": True, "nominatif": True, "as_of": iso, "currency": "EUR", "top": top, "clients": out,
                "shown_encours": float(g["v"].sum()), "total": tot_all or None}

    def _synthese(self) -> dict:
        """Lecture d'analyste : segments de clientèle, teneurs, pays, classes d'actifs et desks, chacun en part de l'encours
        face à sa part des entrées et des sorties ; tours (teneurs × segments) et rythme hebdomadaire des mouvements."""
        P_, T_ = self._pos, self._trx
        out: dict[str, Any] = {"segment_labels": SEGMENTS}
        h = P_.get("holders")
        w = T_.get("who")
        g = T_.get("g")
        if h is not None and not h.empty:
            hs = h.assign(segment=h["classification"].map(segment_of))
            ws = w.assign(segment=w["classification"].map(segment_of)) if w is not None and not w.empty else None
            out["segments"] = [{**x, "label": SEGMENTS.get(x["key"], x["key"])} for x in compare(hs, ws, "segment")]
            out["teneurs"] = compare(h, w, "teneur", top=4, other="Autres teneurs")
            # Tours : quatre premiers teneurs (les autres réunis) × segments
            top = list(h.assign(teneur=h["teneur"].map(_label)).groupby("teneur")["v"].sum().sort_values(ascending=False).index[:4])
            t = hs.assign(teneur=hs["teneur"].map(_label).map(lambda v: v if v in top else "Autres teneurs"))
            agg = t.groupby(["teneur", "segment"]).agg(n=("n", "sum"), v=("v", "sum")).reset_index()
            tot = float(P_["tot"])
            out["towers"] = [{"teneur": x.teneur, "segment": x.segment, "label": SEGMENTS[x.segment], "pct": _pct(float(x.v), tot), "tranche": tranche(int(x.n))}
                             for x in agg.itertuples(index=False) if x.n >= MIN_GROUP]
            out["tower_order"] = [*top, *(["Autres teneurs"] if (t["teneur"] == "Autres teneurs").any() else [])]
        if P_.get("geo") is not None:
            rows = compare(P_["geo"], w, "pays", top=6, other="Autres pays")
            out["countries"] = [{**x, "iso": L.country(x["key"])[1] if not x["other"] and x["key"] != NOT_SET else None} for x in rows]
        if P_.get("main") is not None:
            out["classes"] = compare(P_["main"], g, "classe_actif")
            out["desks"] = compare(P_["main"], g, "desk")
        if g is not None and not g.empty:
            x = g.assign(w=pd.to_datetime(g["d"]).dt.to_period("W-SUN").dt.start_time)
            weeks = []
            for wk, y in x.groupby("w"):
                tv = float(y["v"].sum())
                lt = y[y["late"]]
                weeks.append({"week": wk.date().isoformat(), "ops": tranche(int(y["n"].sum())),
                              "in_pct": _pct(float(y.loc[y["sens"].isin(ENTREES), "v"].sum()), tv),
                              "out_pct": _pct(float(y.loc[y["sens"].isin(SORTIES), "v"].sum()), tv),
                              "late_pct": _pct(float(lt["v"].sum()), tv) if T_["late"]["calculable"] and int(lt["n"].sum()) >= MIN_GROUP else None})
            out["weeks"] = weeks
        return out

    def _lecture(self, maps: dict, stats: dict, out: dict, problems: list, links: dict | None, dups: dict | None) -> dict:
        """Transparence : correspondance appliquée, type détecté, valeurs nulles, dates valides et invalides, rattachements."""
        tables = {}
        for t in TABLES:
            m, s = maps[t], stats[t]
            cols = []
            usable = s["usable"] or 0
            for k, name, kind in SCHEMA[t]:
                f, x = m["fields"][k], s["fields"].get(k, {})
                filled = x.get("filled", 0)
                detected = "vide" if not filled else "date" if x.get("as_date", 0) >= 0.9 * filled else \
                    "nombre" if x.get("as_number", 0) >= 0.9 * filled else "texte"
                expected = {"date": "date", "nombre": "nombre"}.get(kind, "texte")
                status = "absente" if not f["col"] else "vide" if not filled else \
                    "à confirmer" if detected != expected and not (expected == "texte" and detected == "nombre" and kind in ("id", "texte", "confidentiel")) else "conforme"
                cols.append({"field": k, "name": name, "kind": kind, "col": f["col"], "how": f["how"], "detected": detected, "status": status,
                             "nulls": x.get("nulls"), "filled": filled, "valid": x.get("valid"), "invalid": x.get("invalid"),
                             "rejected": x.get("rejected") or None, "min": x.get("min"), "max": x.get("max"), "distinct": x.get("distinct"),
                             "used": kind != "confidentiel"})
            tables[t] = {"mode": m["mode"], "rows": s["rows"], "usable": usable, "ignored_rows": s["rows"] - usable,
                         "n_columns": m["n_columns"], "expected": m["expected"], "missing": m["missing"], "extra": m["extra"],
                         "overrides_ignored": m["ignored"], "columns": cols,
                         "to_confirm": [c["name"] for c in cols if c["status"] == "à confirmer"],
                         "configured": [c["name"] for c in cols if c["col"]]}
        return {"tables": tables, "links": links, "problems": problems, "duplicates": dups,
                "statuts": (out.get("transactions") or {}).get("statuts"), "allowed_statuts": allowed_statuts(),
                "env": {t: f"APP_PASSIF_MAP_{t.upper()}" for t in TABLES}}


def table_names() -> dict[str, str]:
    return {t: (os.environ.get(f"APP_PASSIF_TABLE_{t.upper()}") or t).strip() for t in TABLES}


def check(reader) -> list[tuple[bool | None, str]]:
    """Contrôles du --fabric-check : colonnes, correspondance, dates, lignes exploitables. Aucune valeur affichée."""
    res: list[tuple[bool | None, str]] = []
    for t in TABLES:
        try:
            cols = reader.columns(t)
        except Exception as e:
            res.append((False, f"Passif · table {t} : inaccessible ({type(e).__name__})"))
            continue
        m = resolve_mapping(cols, t)
        exp = N_COLS[t]
        res.append((len(cols) == exp and not m["missing"], f"Passif · {t} : {len(cols)} colonnes sur {exp} attendues"
                    + (f" (manquantes : {', '.join(REAL[t][k] for k in m['missing'])})" if m["missing"] else "")))
        res.append((not m["missing"], f"Passif · {t} : correspondance {'vrais noms' if m['mode'] == 'noms' else '_c0…_c' + str(exp - 1)} appliquée"
                    + ("".join(f" ; ajustement ignoré {x['field']}={x['col']} ({x['why']})" for x in m["ignored"]))))
        try:
            s = reader.stats(t, m)
        except Exception as e:
            res.append((False, f"Passif · {t} : lecture impossible ({type(e).__name__})"))
            continue
        res.append((s["usable"] > 0, f"Passif · {t} : {s['usable']} lignes exploitables sur {s['rows']}"))
        for k, f in m["fields"].items():
            if f["kind"] != "date" or not f["col"]:
                continue
            x = s["fields"].get(k, {})
            ok = True if x.get("valid") and not x.get("invalid") else None if x.get("valid") else (False if x.get("filled") else None)
            if k in REQUIRED[t] and not x.get("valid"):
                ok = False
            rej = ", ".join(r_["shape"] for r_ in x.get("rejected") or [])
            res.append((ok, f"Passif · {t}.{f['name']} ({f['col']}) : {x.get('valid', 0)} dates valides, {x.get('invalid', 0)} illisibles, "
                            f"{x.get('nulls', 0)} vides" + (f" — formats rejetés : {rej}" if rej else "")))
    return res
