"""Passif fictif : comptes, positions et transactions au schéma exact des tables sources (_c0 … _cN, tout en texte).

Données entièrement synthétiques. Seules les *dimensions* des exports anonymisés sont reprises (teneurs et
classifications de comptes, desks, classes d'actifs, devises, sens et statuts d'opération) ; les proportions sont
approximatives et perturbées, les identifiants et libellés inventés (« CPT-000123 », « Client synthétique 123 »).
Aucun client, compte ou montant réel ne peut s'y retrouver.

Disposition exacte (voir domain/passif.py, SCHEMA) et défauts réalistes des exports Fabric reproduits :
dates américaines « 9/30/2026 12:00:00 AM », valeurs manquantes écrites « nan », vides ou espaces, un premier
enregistrement vide, une ligne d'en-tête relue comme donnée, des doublons exacts de référence et des références sur
plusieurs lignes, des statuts non retenus (annulé, en attente).
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from ..domain.passif import SCHEMA

CPT_COLS = [f"_c{i}" for i in range(11)]
POS_COLS = [f"_c{i}" for i in range(21)]
TRX_COLS = [f"_c{i}" for i in range(28)]

TENEURS = {  # classification → (nombre de comptes approximatif, part avec compte parent)
    "EOC/Client actif": (900, 0.04), "EOC/Client Inactif": (12, 0), "EOC/OPC déposé hors RMM": (9, 0),
    "EOC/Passage Global RMM": (45, 0), "IZNES/CLIENT ACTIF": (40, 0), "RMM/Banque Privée": (60, 0),
    "RMM/Institutionnel": (35, 0), "RMM/OPC": (180, 0), "TA Degroof/ Client Actif": (50, 0), "TA Degroof/OPC Maison": (10, 0),
    "TA/Banque Privée et OPC déposés RMM": (11, 0), "TA/Client Actif": (260, 0), "TA/Client Inactif": (8, 0),
    "TA/OPC Maison": (55, 0), "TA/Omnibus": (40, 0),
}
# Poids de l'encours par classification (les comptes omnibus, OPC et institutionnels portent de gros montants)
CLASS_WEIGHT = {"EOC/Client actif": 0.6, "RMM/OPC": 4.0, "RMM/Institutionnel": 5.0, "TA/Omnibus": 6.0, "TA/OPC Maison": 3.0,
                "RMM/Banque Privée": 1.2, "TA/Client Actif": 1.0, "EOC/Passage Global RMM": 1.5, "IZNES/CLIENT ACTIF": 1.4}
DESKS = ["Valor", "Conviction", "RMM", "Thematic", "OPAL", "4Change"]
WEIGHTS = {("Valor", "Diversified"): 20, ("Conviction", "Fixed Income"): 16, ("RMM", "Diversified"): 10, ("Thematic", "Fixed Income"): 7,
           ("RMM", "Equities"): 7, ("OPAL", "Diversified"): 6, ("RMM", "Money Market"): 6, ("RMM", "Fixed Income"): 5,
           ("Conviction", "Equities"): 4, ("Conviction", "Diversified"): 2.5, ("Thematic", "Equities"): 2.5, ("OPAL", "Equities"): 2,
           ("Valor", "Fixed Income"): 1.5, ("4Change", "Equities"): 0.6, ("Valor", "Equities"): 0.4, ("4Change", "Fixed Income"): 0.2,
           ("4Change", "Diversified"): 0.05, ("OPAL", "Alternative"): 0.03}
PAYS = {"France": 70, "Belgique": 8, "Luxembourg": 6, "Suisse": 5, "Monaco": 3, "Espagne": 2, "Italie": 2, "Allemagne": 1.5, "Pays-Bas": 1,
        "Royaume-Uni": 1, "Portugal": 0.5}
SDG = {"Rothschild & Co Asset Management": 0.8, "Rothschild Martin Maurel": 0.2}
TYPES = {"FCP": 0.55, "SICAV": 0.3, "Compartiment de SICAV": 0.15}
SENS = ["Souscription", "Rachat", "Transfert entrant", "Transfert sortant"]
STATUTS = ["Valorisé", "Clôturé / après cut-off"]
_ACLASS = {"Equities": "Actions", "Fixed Income": "Obligations", "Diversified": "Diversifié", "Money Market": "Monétaire",
           "Alternative": "Alternatif"}
FX = {"EUR": 1.0, "USD": 1.08, "CHF": 0.95}
MISSING = ["nan", "", " ", "NaN", None, "N/A", "null"]


def us(d: date, time: str = "12:00:00 AM") -> str:
    """Date au format des exports : 9/30/2026 12:00:00 AM."""
    return f"{d.month}/{d.day}/{d.year} {time}"


def _fmt(x: float) -> str:
    return f"{x:.2f}"


class PassifMock:
    def __init__(self, as_of: date, isins_by_class: dict[str, list[str]] | None = None, seed: int = 2026, scale: int = 1):
        self.as_of, self.rng, self.scale = as_of, np.random.default_rng(seed), max(1, scale)
        self.isins = isins_by_class or {}
        self._t: dict[str, pd.DataFrame] = {}

    def table(self, name: str) -> pd.DataFrame:
        if name not in self._t:
            self._t[name] = {"compte": self._comptes, "position": self._positions, "transaction": self._transactions}[name]()
        return self._t[name]

    def _miss(self) -> str | None:
        return MISSING[int(self.rng.integers(len(MISSING)))]

    def _pick(self, d: dict) -> str:
        k = list(d)
        p = np.array(list(d.values()), dtype=float)
        return k[int(self.rng.choice(len(k), p=p / p.sum()))]

    # ------------------------------------------------------------------ comptes
    def _comptes(self) -> pd.DataFrame:
        r, k, client = self.rng, 0, 0
        rows = [{c: None for c in CPT_COLS}]                          # premier enregistrement vide de l'export
        self._acc_class: dict[str, str] = {}
        for cls, (n0, parent_share) in TENEURS.items():
            n = max(5, int(n0 * r.uniform(0.7, 1.3))) * self.scale
            teneur = cls.split("/")[0].strip()
            for i in range(n):
                k += 1
                if r.random() < 0.7:
                    client += 1
                acc = f"CPT-{k:06d}"
                self._acc_class[acc] = cls
                parent = f"CPT-{k - 1:06d}" if i and r.random() < parent_share else self._miss()
                dissolved = r.random() < 0.02
                rows.append({"_c0": teneur if r.random() > 0.01 else "nan", "_c1": acc, "_c2": f"Compte synthétique {k}", "_c3": parent,
                             "_c4": f"Compte synthétique {k - 1}" if parent and str(parent).startswith("CPT") else self._miss(),
                             "_c5": f"CLI-{client:06d}", "_c6": f"Client synthétique {client}", "_c7": cls, "_c8": "EUR",
                             "_c9": us(date(2010, 1, 1) + timedelta(days=int(r.integers(5000)))) if r.random() < 0.1 else self._miss(),
                             "_c10": us(self.as_of - timedelta(days=int(r.integers(30, 900)))) if dissolved else self._miss()})
        return pd.DataFrame(rows, columns=CPT_COLS)

    def _accounts(self) -> np.ndarray:
        df = self.table("compte")
        return df["_c1"].dropna().to_numpy()

    def _isin(self, classe: str) -> str:
        pool = self.isins.get(_ACLASS.get(classe, ""), []) or sum(self.isins.values(), [])
        return pool[int(self.rng.integers(len(pool)))] if pool else f"XS{int(self.rng.integers(1e9)):010d}"

    def _common(self, acc: str, desk: str, classe: str, isin: str) -> dict:
        cls = self._acc_class.get(acc, "TA/Client Actif")
        r = self.rng
        return {"_c0": "Client synthétique", "_c1": self._pick(PAYS) if r.random() > 0.02 else "nan", "_c2": cls.split("/")[0].strip(),
                "_c3": acc, "_c4": f"Compte synthétique {acc[-4:]}", "_c5": cls, "_c6": "Commercial synthétique", "_c7": self._pick(SDG),
                "_c8": self._pick(TYPES), "_c9": f"Fonds synthétique {isin[-3:]}", "_c10": isin, "_c11": classe, "_c12": desk}

    # ------------------------------------------------------------------ positions (photo du jour, et la veille)
    def _positions(self) -> pd.DataFrame:
        r, acc, rows = self.rng, self._accounts(), []
        total = 40e9
        weights = {k: v * r.uniform(0.6, 1.5) for k, v in WEIGHTS.items()}
        wsum = sum(weights.values())
        acc_w = np.array([CLASS_WEIGHT.get(self._acc_class.get(a, ""), 0.8) * r.lognormal(0, 1.6) for a in acc])
        acc_w /= acc_w.sum()
        for day in (self.as_of - timedelta(days=1), self.as_of):
            for (desk, classe), w in weights.items():
                for ccy, f in (("EUR", 0.95), ("USD", 0.035), ("CHF", 0.015)):
                    if ccy != "EUR" and r.random() < 0.5:
                        continue
                    amt = total * w / wsum * f
                    n = int(np.clip(amt / 25e6, 5, 400) * r.uniform(0.6, 1.4)) * self.scale
                    owners = acc[r.choice(len(acc), size=n, p=acc_w)]
                    sizes = r.lognormal(0, 1.2, n)
                    sizes = sizes / sizes.sum() * amt
                    for a, s in zip(owners, sizes):
                        vl = r.uniform(80, 1500)
                        isin = self._isin(classe)
                        first = self.as_of - timedelta(days=int(r.exponential(1400)))
                        last = self.as_of - timedelta(days=int(r.exponential(200)))
                        rows.append({**self._common(a, desk, classe, isin), "_c13": us(day), "_c14": f"{s / vl:.3f}", "_c15": _fmt(vl),
                                     "_c16": _fmt(s * FX[ccy]), "_c17": ccy, "_c18": _fmt(s),
                                     "_c19": us(max(last, first)), "_c20": us(first) if r.random() > 0.03 else self._miss()})
        return pd.DataFrame(rows, columns=POS_COLS)

    # ------------------------------------------------------------------ transactions (60 jours ouvrés, et au-delà)
    def _transactions(self) -> pd.DataFrame:
        r, acc, k = self.rng, self._accounts(), 0
        rows = [{c: n for c, (_, n, _) in zip(TRX_COLS, SCHEMA["transaction"])}]   # ligne d'en-tête relue comme donnée
        days = pd.bdate_range(end=self.as_of, periods=70)
        keys = list(WEIGHTS)
        for day in days:
            active = r.choice(len(keys), size=int(r.integers(6, 14)), replace=False)
            for j in active:
                desk, classe = keys[j]
                for sens in SENS[:2] + (SENS[2:] if desk == "RMM" and r.random() < 0.25 else []):
                    n = int(r.choice([6, 12, 30, 110]) * r.uniform(0.6, 1.3))
                    vol = WEIGHTS[keys[j]] * r.lognormal(0, 1.1) * 4e6
                    late = r.random() < 0.3
                    for t in range(n):
                        k += 1
                        st = STATUTS[1] if late and t < n * 0.2 else STATUTS[0]
                        if r.random() < 0.01:
                            st = "Annulé" if r.random() < 0.5 else "En attente"
                        amt = vol / n * r.lognormal(0, 0.6)
                        vl = r.uniform(80, 1500)
                        ccy = "USD" if r.random() < 0.03 else "EUR"
                        dc = day.date()
                        a = acc[int(r.integers(len(acc)))]
                        isin = self._isin(classe)
                        row = {**self._common(a, desk, classe, isin), "_c13": us(dc), "_c14": us(dc - timedelta(days=int(r.integers(0, 2)))),
                               "_c15": us(dc + timedelta(days=2)), "_c16": sens, "_c17": st, "_c18": ccy, "_c19": f"{amt / vl:.3f}",
                               "_c20": _fmt(vl), "_c21": _fmt(amt * FX[ccy]), "_c22": _fmt(amt), "_c23": "Commentaire synthétique",
                               "_c24": "TA" if r.random() < 0.6 else "EOC", "_c25": f"REF{k:09d}",
                               "_c26": us(dc - timedelta(days=int(r.integers(0, 2))), "3:12:45 PM"), "_c27": self._miss()}
                        rows.append(row)
                        if r.random() < 0.004:                      # doublon exact (même référence, même ligne)
                            rows.append(dict(row))
                        elif r.random() < 0.004:                    # même référence, ligne différente (autre ISIN) : conservée
                            rows.append({**row, "_c10": self._isin(classe), "_c22": _fmt(amt / 2)})
        return pd.DataFrame(rows, columns=TRX_COLS)
