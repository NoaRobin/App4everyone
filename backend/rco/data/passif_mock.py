"""Passif fictif : comptes, positions et transactions au schéma exact des tables sources (_c0 … _cN, tout en texte).

Données entièrement synthétiques. Seules les *dimensions* des exports anonymisés sont reprises (teneurs et
classifications de comptes, desks, classes d'actifs, devises, sens et statuts d'opération) ; les proportions sont
approximatives et perturbées, les identifiants et libellés inventés (« CPT-000123 », « Compte synthétique 123 »).
Aucun client, compte ou montant réel ne peut s'y retrouver.

Disposition des colonnes (fictive : la disposition réelle est reconnue automatiquement, voir domain/passif.py) :
  compte      _c0 TeneurCompte, _c1 IdCompte, _c2 NomCompte, _c3 IdCompteParent, _c4 NomCompteParent, _c5 IdClient,
              _c6 NomClient, _c7 Classification, _c8 Devise, _c9 DateCreation, _c10 DateDissolution (schéma fourni)
  position    _c0 date d'arrêté, _c1 compte, _c3 ISIN, _c5 classe d'actifs, _c6 desk, _c7 devise, _c8 quantité,
              _c9 VL, _c10 encours, autres colonnes techniques
  transaction _c1 compte, _c2 date de centralisation, _c3 date d'ordre, _c4 date de valeur, _c5 sens, _c6 statut,
              _c7 ISIN, _c8 classe d'actifs, _c9 desk, _c10 devise, _c11 quantité, _c12 VL, _c13 montant, …
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

TENEURS = {  # classification → (nombre de comptes approximatif, part avec compte parent)
    "EOC/Client actif": (900, 0.04), "EOC/Client Inactif": (12, 0), "EOC/OPC déposé hors RMM": (9, 0),
    "EOC/Passage Global RMM": (45, 0), "IZNES/CLIENT ACTIF": (40, 0), "RMM/Banque Privée": (60, 0),
    "RMM/Institutionnel": (35, 0), "RMM/OPC": (180, 0), "TA Degroof/ Client Actif": (50, 0), "TA Degroof/OPC Maison": (10, 0),
    "TA/Banque Privée et OPC déposés RMM": (11, 0), "TA/Client Actif": (260, 0), "TA/Client Inactif": (8, 0),
    "TA/OPC Maison": (55, 0), "TA/Omnibus": (40, 0),
}
DESKS = ["Valor", "Conviction", "RMM", "Thematic", "OPAL", "4Change"]
CLASSES = ["Diversified", "Fixed Income", "Equities", "Money Market", "Alternative"]
# Poids grossiers (desk, classe) → importance relative de l'encours ; perturbés à la génération
WEIGHTS = {("Valor", "Diversified"): 20, ("Conviction", "Fixed Income"): 16, ("RMM", "Diversified"): 10, ("Thematic", "Fixed Income"): 7,
           ("RMM", "Equities"): 7, ("OPAL", "Diversified"): 6, ("RMM", "Money Market"): 6, ("RMM", "Fixed Income"): 5,
           ("Conviction", "Equities"): 4, ("Conviction", "Diversified"): 2.5, ("Thematic", "Equities"): 2.5, ("OPAL", "Equities"): 2,
           ("Valor", "Fixed Income"): 1.5, ("4Change", "Equities"): 0.6, ("Valor", "Equities"): 0.4, ("4Change", "Fixed Income"): 0.2,
           ("4Change", "Diversified"): 0.05, ("OPAL", "Alternative"): 0.03}
SENS = ["Souscription", "Rachat", "Transfert entrant", "Transfert sortant"]
STATUTS = ["Valorisé", "Clôturé / après cut-off"]
POS_COLS = [f"_c{i}" for i in range(21)]
TRX_COLS = [f"_c{i}" for i in range(28)]
CPT_COLS = [f"_c{i}" for i in range(11)]
_ACLASS = {"Equities": "Actions", "Fixed Income": "Obligations", "Diversified": "Diversifié", "Money Market": "Monétaire",
           "Alternative": "Alternatif"}


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

    # ------------------------------------------------------------------ comptes
    def _comptes(self) -> pd.DataFrame:
        r, rows, k, client = self.rng, [], 0, 0
        for cls, (n0, parent_share) in TENEURS.items():
            n = max(5, int(n0 * r.uniform(0.7, 1.3))) * self.scale
            teneur = cls.split("/")[0].strip()
            for i in range(n):
                k += 1
                if r.random() < 0.7:
                    client += 1
                parent = f"CPT-{k - 1:06d}" if i and r.random() < parent_share else None
                rows.append({"_c0": teneur, "_c1": f"CPT-{k:06d}", "_c2": f"Compte synthétique {k}", "_c3": parent,
                             "_c4": f"Compte synthétique {k - 1}" if parent else None, "_c5": f"CLI-{client:06d}",
                             "_c6": f"Client synthétique {client}", "_c7": cls, "_c8": "EUR", "_c9": None, "_c10": None})
        return pd.DataFrame(rows, columns=CPT_COLS)

    def _accounts(self) -> np.ndarray:
        return self.table("compte")["_c1"].to_numpy()

    def _isin(self, classe: str) -> str:
        pool = self.isins.get(_ACLASS.get(classe, ""), []) or sum(self.isins.values(), [])
        return pool[int(self.rng.integers(len(pool)))] if pool else f"XS{int(self.rng.integers(1e9)):010d}"

    # ------------------------------------------------------------------ positions (photo du jour)
    def _positions(self) -> pd.DataFrame:
        r, acc, rows = self.rng, self._accounts(), []
        total = 40e9
        weights = {k: v * r.uniform(0.6, 1.5) for k, v in WEIGHTS.items()}
        wsum = sum(weights.values())
        d = self.as_of.isoformat()
        for (desk, classe), w in weights.items():
            for ccy, f in (("EUR", 0.95), ("USD", 0.035), ("CHF", 0.015)):
                if ccy != "EUR" and r.random() < 0.5:
                    continue
                amt = total * w / wsum * f
                n = int(np.clip(amt / 25e6, 5, 400) * r.uniform(0.6, 1.4)) * self.scale
                sizes = r.lognormal(0, 1.2, n)
                sizes = sizes / sizes.sum() * amt
                for s in sizes:
                    vl = r.uniform(80, 1500)
                    rows.append({"_c0": d, "_c1": acc[int(r.integers(len(acc)))], "_c2": "ACTIVE", "_c3": self._isin(classe),
                                 "_c4": "Fonds synthétique", "_c5": classe, "_c6": desk, "_c7": ccy, "_c8": f"{s / vl:.3f}",
                                 "_c9": _fmt(vl), "_c10": _fmt(s), "_c11": "Nominatif" if r.random() < 0.6 else "Porteur",
                                 "_c12": "N", "_c13": f"DEP{int(r.integers(1, 40)):03d}", "_c14": d})
        df = pd.DataFrame(rows, columns=POS_COLS)
        return df

    # ------------------------------------------------------------------ transactions (60 jours ouvrés)
    def _transactions(self) -> pd.DataFrame:
        r, acc, rows, k = self.rng, self._accounts(), [], 0
        days = pd.bdate_range(end=self.as_of, periods=60)
        keys = list(WEIGHTS)
        for day in days:
            # Quelques groupes dominent chaque jour (une grosse souscription, un rachat institutionnel…)
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
                        amt = vol / n * r.lognormal(0, 0.6)
                        vl = r.uniform(80, 1500)
                        dc = day.date()
                        rows.append({"_c0": f"TRX-{k:08d}", "_c1": acc[int(r.integers(len(acc)))], "_c2": dc.isoformat(),
                                     "_c3": (dc - timedelta(days=int(r.integers(0, 2)))).isoformat(),
                                     "_c4": (dc + timedelta(days=2)).isoformat(), "_c5": sens, "_c6": st, "_c7": self._isin(classe),
                                     "_c8": classe, "_c9": desk, "_c10": "USD" if r.random() < 0.03 else "EUR",
                                     "_c11": f"{amt / vl:.3f}", "_c12": _fmt(vl), "_c13": _fmt(amt), "_c14": "TA",
                                     "_c15": "N", "_c16": f"ORD{k:09d}"})
        return pd.DataFrame(rows, columns=TRX_COLS)
