"""Données fictives réalistes, au schéma exact des tables du Lakehouse.

Tous les noms de fonds, gérants, émetteurs, codes et montants sont inventés.
Les ISIN générés contiennent « DEMO » pour ne jamais être confondus avec de vrais codes.
Le générateur est déterministe (graine fixe) afin que les tests soient reproductibles.
"""
from __future__ import annotations

import uuid
import zlib
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from functools import lru_cache
from typing import Any, Sequence

import numpy as np
import pandas as pd

from . import schema as S

AS_OF = date(2026, 9, 29)
START = date(2020, 10, 1)          # six ans d'historique : les vues « 5 ans » sont calculables
_NS = uuid.UUID("7b0e9f5c-2d1a-4c9e-9a51-3f6f2a8d0c11")

FAM_AID = "Actions internationales et gestion diversifiée"
FAM_AE = "Actions européennes"
FAM_FI = "Fixed Income"
FAM_AO = "Architecture ouverte"

MANAGERS = [
    "Claire Vasseur", "Thomas Delorme", "Inès Marchal", "Julien Ferrand", "Sophie Laurent-Béal",
    "Marc Aubry", "Hélène Rossi", "Pierre-Antoine Garnier", "Nadia Benali", "Lucas Moreau",
    "Élodie Chastel", "Antoine Varenne", "Camille Duret", "Victor Lambert", "Laure Mercier",
    "Olivier Tessier", "Mathilde Roche", "Karim Haddad",
]

# Page Démo : gérants nommés par l'équipe, posés sur des fonds fictifs (gamme renommée pour la démonstration).
# Les chiffres restent fictifs ; sur les données réelles, les fonds viennent de Product Info (Portfolio_Manager).
DEMO_MANAGERS = {
    "Patrimoine Équilibre": ("Yoann Ignatiew", "Valor"), "Monde Convictions": ("Yoann Ignatiew", "Valor"),
    "Allocation Flexible Monde": ("Yoann Ignatiew", "Valor"), "Amérique Leaders": ("Yoann Ignatiew", "Valor"),
    "Crédit Euro Investment Grade": ("Emmanuel Petit", None), "Obligations Haut Rendement": ("Emmanuel Petit", None),
    "Crédit Court Terme": ("Emmanuel Petit", None), "Échéance 2028": ("Emmanuel Petit", None), "Échéance 2030": ("Emmanuel Petit", None),
    "Obligations Convertibles Europe": ("Emmanuel Petit", None),
}

# (nom, famille, gamme, classe d'actifs, sous-expertise, indice, mu, sigma, aum cible M€, sfdr, domicile)
FUNDS: list[tuple] = [
    ("Monde Convictions", FAM_AID, "Convictions", "Actions", "Actions internationales", "MSCI World Net Return EUR", .08, .14, 1850, "Article 8", "France"),
    ("Horizons Émergents", FAM_AID, "Convictions", "Actions", "Actions émergentes", "MSCI Emerging Markets Net Return EUR", .06, .17, 420, "Article 8", "Luxembourg"),
    ("Global Thématiques", FAM_AID, "Thématiques", "Actions", "Actions thématiques", "MSCI ACWI Net Return EUR", .07, .16, 610, "Article 8", "Luxembourg"),
    ("Patrimoine Équilibre", FAM_AID, "Patrimoine", "Diversifié", "Allocation d'actifs", "50 % MSCI World NR + 50 % €STR capitalisé", .045, .07, 2650, "Article 8", "France"),
    ("Patrimoine Prudent", FAM_AID, "Patrimoine", "Diversifié", "Allocation d'actifs", "20 % MSCI World NR + 80 % €STR capitalisé", .03, .04, 1320, "Article 8", "France"),
    ("Patrimoine Dynamique", FAM_AID, "Patrimoine", "Diversifié", "Allocation d'actifs", "80 % MSCI World NR + 20 % €STR capitalisé", .06, .11, 780, "Article 8", "France"),
    ("Allocation Flexible Monde", FAM_AID, "Patrimoine", "Diversifié", "Allocation flexible", "€STR capitalisé + 3 %", .04, .08, 360, "Article 6", "Luxembourg"),
    ("Technologies Mondiales", FAM_AID, "Thématiques", "Actions", "Actions thématiques", "MSCI World Information Technology NR EUR", .11, .22, 540, "Article 8", "Luxembourg"),
    ("Santé & Longévité", FAM_AID, "Thématiques", "Actions", "Actions thématiques", "MSCI World Health Care NR EUR", .06, .13, 290, "Article 8", "France"),
    ("Amérique Leaders", FAM_AID, "Convictions", "Actions", "Actions internationales", "S&P 500 Net Total Return EUR", .09, .16, 470, "Article 6", "Luxembourg"),
    ("Asie Croissance", FAM_AID, "Convictions", "Actions", "Actions émergentes", "MSCI AC Asia ex Japan NR EUR", .05, .18, 150, "Article 6", "Luxembourg"),
    ("Or & Matières", FAM_AID, "Thématiques", "Actions", "Actions thématiques", "NYSE Arca Gold Miners NR EUR", .04, .27, 95, "Article 6", "France"),
    ("Europe Convictions", FAM_AE, "Convictions", "Actions", "Actions Europe grandes capitalisations", "MSCI Europe Net Return", .075, .15, 2320, "Article 8", "France"),
    ("Europe Valeur", FAM_AE, "Convictions", "Actions", "Actions Europe grandes capitalisations", "MSCI Europe Value Net Return", .07, .16, 3050, "Article 8", "France"),
    ("Europe Petites Capitalisations", FAM_AE, "Convictions", "Actions", "Actions Europe petites et moyennes capitalisations", "MSCI Europe Small Cap Net Return", .06, .19, 540, "Article 8", "Luxembourg"),
    ("France Excellence", FAM_AE, "Convictions", "Actions", "Actions France", "SBF 120 dividendes réinvestis", .07, .17, 880, "Article 8", "France"),
    ("Euro Rendement Actions", FAM_AE, "Rendement", "Actions", "Actions Europe grandes capitalisations", "Euro Stoxx Net Return", .065, .15, 610, "Article 8", "France"),
    ("Europe Croissance Durable", FAM_AE, "Thématiques", "Actions", "Actions Europe grandes capitalisations", "MSCI Europe Net Return", .07, .16, 720, "Article 9", "Luxembourg"),
    ("Europe Transition Climat", FAM_AE, "Thématiques", "Actions", "Actions thématiques", "MSCI Europe Climate Paris Aligned NR", .05, .17, 330, "Article 9", "France"),
    ("PEA Sélection", FAM_AE, "Convictions", "Actions", "Actions Europe grandes capitalisations", "Euro Stoxx 50 Net Return", .07, .16, 210, "Article 8", "France"),
    ("Euro Dividendes", FAM_AE, "Rendement", "Actions", "Actions Europe grandes capitalisations", "Euro Stoxx Select Dividend 30 NR", .06, .14, 440, "Article 8", "France"),
    ("France Midcaps", FAM_AE, "Convictions", "Actions", "Actions Europe petites et moyennes capitalisations", "CAC Mid 60 dividendes réinvestis", .05, .19, 180, "Article 8", "France"),
    ("Europe Qualité", FAM_AE, "Convictions", "Actions", "Actions Europe grandes capitalisations", "MSCI Europe Quality Net Return", .08, .14, 390, "Article 8", "Luxembourg"),
    ("Crédit Euro Investment Grade", FAM_FI, "Crédit", "Obligations", "Crédit", "Bloomberg Euro Aggregate Corporate", .035, .045, 2150, "Article 8", "France"),
    ("Obligations Haut Rendement", FAM_FI, "Crédit", "Obligations", "Haut rendement", "ICE BofA Euro High Yield", .05, .06, 980, "Article 8", "Luxembourg"),
    ("Monétaire Euro", FAM_FI, "Trésorerie", "Monétaire", "Monétaire", "€STR capitalisé", .031, .003, 2900, "Article 8", "France"),
    ("Trésorerie Plus", FAM_FI, "Trésorerie", "Monétaire", "Monétaire", "€STR capitalisé", .034, .006, 1150, "Article 8", "France"),
    ("Obligations Convertibles Europe", FAM_FI, "Convertibles", "Convertibles", "Convertibles", "Refinitiv Europe Focus Convertible Bond EUR", .035, .07, 470, "Article 8", "France"),
    ("Crédit Court Terme", FAM_FI, "Crédit", "Obligations", "Crédit", "Bloomberg Euro Aggregate Corporate 1-3 ans", .037, .018, 1340, "Article 8", "France"),
    ("Obligations Souveraines Euro", FAM_FI, "Souverains", "Obligations", "Souverains", "Bloomberg Euro Aggregate Treasury", .025, .055, 520, "Article 6", "France"),
    ("Échéance 2028", FAM_FI, "Échéance", "Obligations", "Haut rendement", None, .045, .035, 760, "Article 8", "France"),
    ("Échéance 2030", FAM_FI, "Échéance", "Obligations", "Haut rendement", None, .05, .04, 410, "Article 8", "France"),
    ("Obligations Émergentes", FAM_FI, "Crédit", "Obligations", "Dette émergente", "JP Morgan EMBI Global Diversified EUR Hedged", .045, .07, 230, "Article 6", "Luxembourg"),
    ("Obligations Vertes", FAM_FI, "Crédit", "Obligations", "Crédit", "Bloomberg MSCI Euro Green Bond", .03, .05, 160, "Article 9", "Luxembourg"),
    ("Taux Flexible", FAM_FI, "Souverains", "Obligations", "Taux", "€STR capitalisé + 1,5 %", .03, .03, 310, "Article 6", "France"),
    ("Sélection Multigestion Actions", FAM_AO, "Multigestion", "Actions", "Multigestion actions", "MSCI ACWI Net Return EUR", .065, .13, 690, "Article 8", "France"),
    ("Sélection Multigestion Diversifiée", FAM_AO, "Multigestion", "Diversifié", "Multigestion diversifiée", "50 % MSCI ACWI NR + 50 % Bloomberg Euro Aggregate", .04, .07, 820, "Article 8", "France"),
    ("Profil Prudent Multigestion", FAM_AO, "Profils", "Diversifié", "Multigestion diversifiée", "25 % MSCI ACWI NR + 75 % Bloomberg Euro Aggregate", .03, .045, 430, "Article 8", "France"),
    ("Profil Équilibre Multigestion", FAM_AO, "Profils", "Diversifié", "Multigestion diversifiée", "50 % MSCI ACWI NR + 50 % Bloomberg Euro Aggregate", .04, .07, 560, "Article 8", "France"),
    ("Profil Dynamique Multigestion", FAM_AO, "Profils", "Diversifié", "Multigestion diversifiée", "75 % MSCI ACWI NR + 25 % Bloomberg Euro Aggregate", .055, .1, 340, "Article 8", "France"),
    ("Sélection Alternatifs", FAM_AO, "Multigestion", "Alternatif", "Multigestion alternative", "€STR capitalisé + 2 %", .035, .05, 250, "Article 6", "Luxembourg"),
    ("Sélection Obligataire Monde", FAM_AO, "Multigestion", "Obligations", "Multigestion obligataire", "Bloomberg Global Aggregate EUR Hedged", .025, .045, 300, "Article 8", "France"),
    ("Sélection Émergents", FAM_AO, "Multigestion", "Actions", "Multigestion actions", "MSCI Emerging Markets Net Return EUR", .05, .16, 120, "Article 6", "Luxembourg"),
    ("Sélection ISR", FAM_AO, "Multigestion", "Diversifié", "Multigestion diversifiée", "50 % MSCI ACWI ESG Leaders NR + 50 % Bloomberg MSCI Euro Agg SRI", .04, .07, 210, "Article 8", "France"),
]

# Première année d'ouverture de chaque pays à la commercialisation (données fictives)
OPENING = {"France": 2008, "Luxembourg": 2008, "Belgium": 2010, "Switzerland": 2011, "Germany": 2012, "Italy": 2013, "Spain": 2014,
           "Austria": 2014, "Netherlands": 2015, "Portugal": 2016, "United Kingdom": 2017, "Sweden": 2018, "Finland": 2019,
           "Denmark": 2019, "Norway": 2020, "Ireland": 2021, "Singapore": 2022, "Chile": 2024}

# Fonds promus par Rothschild Martin Maurel dans les données fictives (pour éprouver le filtre « RMM »)
RMM_DEMO = {"Patrimoine Prudent", "Patrimoine Dynamique", "Profil Prudent Multigestion", "Profil Équilibre Multigestion",
            "Profil Dynamique Multigestion", "Sélection Obligataire Monde"}
WEEKLY = {"Or & Matières", "Sélection Alternatifs", "Asie Croissance"}
LAUNCHES = {"Obligations Vertes": date(2025, 6, 2), "Échéance 2030": date(2025, 1, 6)}
LIQUIDATED = ("Échéance 2024", FAM_FI, date(2024, 12, 20))  # présent dans JUMP, absent du référentiel actif
SPLIT = ("Europe Valeur", "C", date(2025, 3, 3), 10.0)

# Clientèle nommée fictive : 140 clients (type d'investisseur × nom d'étoile, inventés), portés par les parts dédiées.
# Volumétrie de travail de la rubrique Distribution : ~140 clients × ~2,5 pays ≈ 350 couples client-pays.
CLIENT_KINDS = ["Mutuelle", "Caisse de retraite", "Fondation", "Banque privée", "Assureur", "Family office", "Fonds de pension",
                "Gestion de fortune", "Plateforme", "Distributeur"]
CLIENT_STARS = ["Altaïr", "Bételgeuse", "Capella", "Deneb", "Électra", "Fomalhaut", "Gemma", "Hadar", "Izar", "Mira",
                "Nunki", "Orion", "Pollux", "Rigel"]
CLIENTS_FICTIFS = [f"{k} {s}" for s in CLIENT_STARS for k in CLIENT_KINDS]   # 140, tous inventés

COUNTRIES = ["France", "Luxembourg", "Belgium", "Germany", "Austria", "Italy", "Spain", "Portugal",
             "Netherlands", "Switzerland", "United Kingdom", "Sweden", "Finland", "Denmark", "Norway",
             "Ireland", "Singapore", "Chile"]

EQ_PREFIX = ["Nordvik", "Castellane", "Arvella", "Belmont", "Corvane", "Delsarte", "Estrelle", "Falkner",
             "Garonne", "Halden", "Isarco", "Joliet", "Kerval", "Lindqvist", "Mareval", "Norrland",
             "Orsini", "Pradel", "Quintara", "Rosendal", "Solvane", "Tessaro", "Ulmen", "Valdore",
             "Westerby", "Ystad", "Zanetti", "Aubrac", "Brennan", "Cevennes"]
EQ_SECTOR = ["Industrie", "Luxe", "Énergie", "Banque", "Assurances", "Santé", "Pharma", "Télécom",
             "Logiciels", "Semi-conducteurs", "Chimie", "Distribution", "Automobile", "Immobilier",
             "Utilities", "Matériaux", "Aéronautique", "Agroalimentaire", "Médias", "Transport"]
GL_PREFIX = ["Atlas", "Keystone", "Harbor", "Summit", "Pioneer", "Redwood", "Meridian", "Crescent",
             "Sakura", "Kaizen", "Lotus", "Monsoon", "Andes", "Pampas", "Sierra", "Granite"]
ISSUER_BOND = ["République de Valdorie", "Royaume de Norland", "État d'Estrelle", "Caisse Publique Alpha",
               "Banque Mutualiste Arvel", "Banque Arvella", "Nordvik Industrie", "Castellane Luxe", "Delsarte Énergie",
               "Garonne Télécom", "Halden Utilities", "Kerval Immobilier", "Mareval Automobile",
               "Orsini Chimie", "Pradel Transport", "Solvane Assurances", "Tessaro Banque", "Valdore Santé"]
EXT_FUND_HOUSES = ["Aurelia Gestion", "Borealis AM", "Cimbria Partners", "Dolomia Capital", "Eridan IM",
                   "Fjord Asset Management", "Glacier Investors", "Hespera Capital"]


def _uid(*parts: Any) -> str:
    return str(uuid.uuid5(_NS, "|".join(map(str, parts))))


def _isin_check(body: str) -> str:
    digits = "".join(str(int(c, 36)) for c in body)
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            d = d - 9 if d > 9 else d
        total += d
    return str((10 - total % 10) % 10)


def fake_isin(country: str, n: int) -> str:
    body = f"{country}DEMO{n:05d}"
    return body + _isin_check(body)


def _bdays(start: date, end: date) -> pd.DatetimeIndex:
    return pd.bdate_range(start, end)


def _empty_frame(table: str, n: int) -> dict[str, list]:
    return {c: [None] * n for c in S.columns(table)}


def _frame(table: str, records: list[dict]) -> pd.DataFrame:
    cols = S.columns(table)
    unknown = {k for r in records for k in r} - set(cols)
    if unknown:
        raise KeyError(f"Colonnes hors schéma pour {table}: {sorted(unknown)}")
    df = pd.DataFrame.from_records(records, columns=cols)
    return df


def _yn(b: bool) -> str:
    return "Yes" if b else "No"


@dataclass
class _ShareSpec:
    fund: str
    code: str
    ccy: str
    hedged: bool
    distrib: bool
    inst: bool
    weight: float
    base_nav: float
    fee: float
    launch: date | None = None
    pi_shareid: str = ""
    isin: str = ""
    jump_id: str = ""
    extra: dict = field(default_factory=dict)


class MockLakehouse:
    """Génère l'ensemble des tables à la demande (en mémoire uniquement)."""

    def __init__(self, seed: int = 20260929):
        self.rng = np.random.default_rng(seed)
        self.dates = _bdays(START, AS_OF)
        self._build()

    # ------------------------------------------------------------------ référentiel
    def _build(self) -> None:
        rng = self.rng
        self.products: list[dict] = []
        self.shares: list[_ShareSpec] = []
        isin_n = 1
        fund_rows = FUNDS + [(LIQUIDATED[0], LIQUIDATED[1], "Échéance", "Obligations", "Haut rendement", None, .04, .03, 300, "Article 8", "France")]
        for i, f in enumerate(fund_rows):
            name, fam, rng_name, aclass, sub, bench, mu, sig, aum, sfdr, dom = f
            pid = _uid("product", name)
            pm = MANAGERS[i % len(MANAGERS)]
            backup = MANAGERS[(i * 7 + 3) % len(MANAGERS)]
            if name in DEMO_MANAGERS:
                pm, demo_range = DEMO_MANAGERS[name]
                rng_name = demo_range or rng_name
            self.products.append(dict(
                name=name, fam=fam, range=rng_name, aclass=aclass, sub=sub, bench=bench, mu=mu, sig=sig,
                aum=aum, sfdr=sfdr, dom=dom, pid=pid, pm=pm, backup=backup, idx=i,
                jump_fund=f"JF{1000 + i}", weekly=name in WEEKLY, launch=LAUNCHES.get(name),
                liquidated=name == LIQUIDATED[0], fund_ccy="USD" if name == "Amérique Leaders" else "EUR",
            ))
            # Parts
            templates = [("C", "EUR", False, False, False, .45, 100.0, 1.6)]
            if aclass in ("Actions", "Diversifié") or rng.random() < .5:
                templates.append(("D", "EUR", False, True, False, .12, 100.0, 1.6))
            templates.append(("I", "EUR", False, False, True, .33, 10000.0, .8))
            if rng.random() < .55:
                templates.append(("F", "EUR", False, False, False, .06, 100.0, 1.1))
            if dom == "Luxembourg" or rng.random() < .3:
                templates.append(("R USD H", "USD", True, False, False, .04, 100.0, 1.6))
            if rng.random() < .25:
                templates.append(("I CHF H", "CHF", True, False, True, .03, 1000.0, .8))
            if aclass == "Monétaire":
                templates = [("C", "EUR", False, False, False, .35, 1000.0, .15), ("I", "EUR", False, False, True, .6, 100000.0, .08),
                             ("Z", "EUR", False, False, True, .05, 100000.0, .02)]
            tot = sum(t[5] for t in templates)
            ctry = "LU" if dom == "Luxembourg" else "FR"
            for code, ccy, hedged, distrib, inst, w, nav0, fee in templates:
                sp = _ShareSpec(name, code, ccy, hedged, distrib, inst, w / tot, nav0 * (0.8 + .6 * rng.random()), fee)
                sp.pi_shareid = _uid("share", name, code)
                sp.isin = fake_isin(ctry, isin_n)
                isin_n += 1
                sp.jump_id = f"JP{5000 + len(self.shares)}"
                self.shares.append(sp)
        # Une nouvelle part lancée en cours d'historique
        extra = _ShareSpec("Crédit Euro Investment Grade", "F", "EUR", False, False, False, .05, 100.0, .9, launch=date(2025, 10, 1))
        extra.pi_shareid, extra.isin, extra.jump_id = _uid("share", extra.fund, "F-new"), fake_isin("FR", isin_n), f"JP{5000 + len(self.shares)}"
        isin_n += 1
        # Nom distinct pour la retrouver facilement
        extra.code = "S"
        self.shares.append(extra)
        self._isin_n = isin_n

    # ------------------------------------------------------------------ séries
    @lru_cache(maxsize=1)
    def _series(self) -> dict[str, Any]:
        rng = self.rng
        dates = self.dates
        n = len(dates)
        # Facteurs de marché par famille (corrélation intra-famille)
        fam_factor = {fam: rng.normal(0, 1, n) for fam in (FAM_AID, FAM_AE, FAM_FI, FAM_AO)}
        # Changes (1 devise = x EUR)
        fx = {
            "EUR": np.ones(n),
            "USD": 0.92 * np.exp(np.cumsum(rng.normal(0, .005, n))),
            "CHF": 1.02 * np.exp(np.cumsum(rng.normal(0, .004, n))),
        }
        out: dict[str, Any] = {"fx": fx, "fund": {}, "share": {}}
        dt = 1 / 252
        for p in self.products:
            mu, sig = p["mu"], p["sig"]
            f = fam_factor[p["fam"]]
            eps = .75 * f + np.sqrt(1 - .75 ** 2) * rng.normal(0, 1, n)
            r = (mu - .5 * sig ** 2) * dt + sig * np.sqrt(dt) * eps
            # Choc de marché commun au printemps 2025 pour les actifs risqués
            shock = (dates >= "2025-04-02") & (dates <= "2025-04-09")
            r = np.where(shock, r - sig * .018, r)
            bench_r = r - rng.normal(.0001, .0025 if sig > .05 else .0003, n)
            # Collecte : tendance annuelle propre au fonds + bruit + gros mouvements occasionnels
            trend = rng.normal(.04, .18)
            flow = trend / 252 + rng.normal(0, .0012, n)
            big = rng.random(n) < .006
            flow = np.where(big, flow + rng.normal(0, .035, n), flow)
            out["fund"][p["name"]] = dict(r=r, bench_r=bench_r, flow=flow)
        self._fx = fx
        return out

    # ------------------------------------------------------------------ tables
    def aum(self) -> pd.DataFrame:
        if getattr(self, "_aum", None) is None:
            self._aum = self._aum_build()
        return self._aum

    def _aum_build(self) -> pd.DataFrame:
        ser = self._series()
        fx = ser["fx"]
        dates = self.dates
        prod = {p["name"]: p for p in self.products}
        recs: list[dict] = []
        now = datetime(2026, 9, 30, 6, 12)
        per_fund_rows: dict[str, list[dict]] = {}
        for k, sp in enumerate(self.shares):
            p = prod[sp.fund]
            fs = ser["fund"][sp.fund]
            start = max(filter(None, [START, p["launch"], sp.launch]))
            end = LIQUIDATED[2] if p["liquidated"] else AS_OF
            fund_ccy = p["fund_ccy"]
            # Encours initial calibré pour atteindre l'encours cible à la date d'arrêté
            growth = np.exp(np.cumsum(fs["r"] + fs["flow"]))
            mask = (dates.date >= start) & (dates.date <= end)
            idx = np.nonzero(mask)[0]
            if len(idx) == 0:
                continue
            g = growth[idx] / growth[idx[0]]
            target = p["aum"] * 1e6 * sp.weight
            if p["launch"] or sp.launch:
                seed = target / g[-1]
                ramp = np.linspace(.15, 1.0, len(idx)) ** .6
                aum_path = seed * g * ramp
            else:
                aum_path = target / g[-1] * g
            nav = np.empty(len(idx))
            nav[0] = sp.base_nav
            share_r = fs["r"][idx] - sp.fee / 100 / 252
            if sp.hedged:
                share_r = share_r + rng_like(k, len(idx), .00004)
            div = np.zeros(len(idx))
            coef = np.ones(len(idx))
            for j in range(1, len(idx)):
                nav[j] = nav[j - 1] * (1 + share_r[j])
                d = dates[idx[j]].date()
                if sp.distrib and d.month == 5 and 15 <= d.day <= 21 and d.weekday() == 0:
                    div[j] = round(nav[j - 1] * (.025 if p["aclass"] != "Obligations" else .03), 2)
                    nav[j] -= div[j]
                if (sp.fund, sp.code) == SPLIT[:2] and d == SPLIT[2]:
                    coef[j] = SPLIT[3]
                    nav[j:] = nav[j:]  # la VL est divisée ci-dessous
            if (sp.fund, sp.code) == SPLIT[:2]:
                split_pos = np.nonzero(coef != 1)[0]
                if len(split_pos):
                    nav[split_pos[0]:] /= SPLIT[3]
            fx_share = fx[sp.ccy][idx]
            fx_fund = fx[fund_ccy][idx]
            aum_share_ccy = aum_path / fx_share  # encours en devise de la part
            parts = np.round(aum_share_ccy / nav, 3)
            bench_nav = 100 * np.exp(np.cumsum(fs["bench_r"][idx]))
            keep = np.ones(len(idx), dtype=bool)
            if p["weekly"]:
                keep = dates[idx].weekday == 4
                keep[-1] = True
            an_part = parts * nav
            an_part_fund = an_part * fx_share / fx_fund
            frame = pd.DataFrame(dict(
                ID_JUMP_FONDS=p["jump_fund"], ID_PI_FONDS=p["pid"], ID_JUMP_PART=sp.jump_id,
                ID_PI_PART=sp.pi_shareid, CODE_ISIN_PART=sp.isin, NOM_PART=f"{sp.fund} {sp.code}",
                DATE_VL=dates[idx].date, VL_UNITAIRE=np.round(nav, 4), NOMBRE_PARTS=parts,
                DEVISE_VL=sp.ccy, ACTIF_NET_DEVISE_PART=np.round(an_part, 2),
                COEFFICIENT_OST=coef, DEVISE_FONDS=fund_ccy,
                ACTIF_NET_PART_DEVISE_FONDS=np.round(an_part_fund, 2),
                NOM_BENCH=p["bench"], VL_BENCH=np.round(bench_nav, 4) if p["bench"] else None,
                DIVIDEND_AMOUNT=np.where(div > 0, div, np.nan), DIVIDEND_DEVISE=np.where(div > 0, sp.ccy, None),
                ACTIF_NET_PART_EURO=np.round(an_part_fund * fx_fund, 2), DATE_MAJ=now, _fx_fund=fx_fund,
            ))[keep]
            per_fund_rows.setdefault(p["jump_fund"], []).append(frame)
        frames = []
        for fr in per_fund_rows.values():
            f = pd.concat(fr, ignore_index=True)
            grp = f.groupby("DATE_VL")
            f["ACTIF_NET_TOTAL_DEVISE_FONDS"] = grp["ACTIF_NET_PART_DEVISE_FONDS"].transform("sum").round(2)
            f["ACTIF_NET_TOTAL_EURO"] = (f["ACTIF_NET_TOTAL_DEVISE_FONDS"] * f["_fx_fund"]).round(2)
            f["NOMBRE_PARTS_FONDS"] = grp["NOMBRE_PARTS"].transform("sum").round(3)
            frames.append(f.drop(columns="_fx_fund"))
        df = pd.concat(frames, ignore_index=True).reindex(columns=S.columns(S.AUM))
        # Cas de rattachement : une part sans ID_PI_PART (secours ISIN) et une part orpheline
        fallback = self.shares[5]
        df.loc[df["ID_JUMP_PART"] == fallback.jump_id, "ID_PI_PART"] = None
        orphan = df[df["ID_JUMP_PART"] == self.shares[9].jump_id].copy()
        orphan["ID_JUMP_PART"] = "JP9999"
        orphan["ID_PI_PART"] = _uid("orphan")
        orphan["CODE_ISIN_PART"] = fake_isin("FR", 99999)
        orphan["NOM_PART"] = orphan["NOM_PART"].str.replace(r" \w+$", " Z (ancienne part)", regex=True)
        scale = 0.02
        for c in ("NOMBRE_PARTS", "ACTIF_NET_DEVISE_PART", "ACTIF_NET_PART_DEVISE_FONDS", "ACTIF_NET_PART_EURO"):
            orphan[c] = (orphan[c] * scale).round(2)
        df = pd.concat([df, orphan], ignore_index=True)
        # L'ajout de l'orpheline modifie le total du fonds : on le recalcule
        for key, col_part, col_tot in (("DEVISE_FONDS", "ACTIF_NET_PART_DEVISE_FONDS", "ACTIF_NET_TOTAL_DEVISE_FONDS"),
                                       ("EURO", "ACTIF_NET_PART_EURO", "ACTIF_NET_TOTAL_EURO")):
            df[col_tot] = df.groupby(["ID_JUMP_FONDS", "DATE_VL"])[col_part].transform("sum").round(2)
        return df.sort_values(["ID_JUMP_PART", "DATE_VL"]).reset_index(drop=True)

    def _named_client(self, i: int) -> str | None:
        """Client nommé (fictif) de la part n° i : quatre parts sur cinq sont dédiées, la cinquième reste dans un pool."""
        if i % 5 == 4:
            return None
        return CLIENTS_FICTIFS[(i - i // 5) % len(CLIENTS_FICTIFS)]

    def shares_table(self) -> pd.DataFrame:
        prod = {p["name"]: p for p in self.products}
        rng = np.random.default_rng(7)
        recs = []
        for i, sp in enumerate(self.shares):
            p = prod[sp.fund]
            first_nav = max(filter(None, [date(2008 + (p["idx"] % 14), 1 + p["idx"] % 12, 1), p["launch"], sp.launch]))
            if p["launch"] or sp.launch:
                first_nav = p["launch"] or sp.launch
            perf = sp.code in ("C", "D", "R USD H") and p["aclass"] in ("Actions",) and rng.random() < .5
            oc = round(sp.fee + (.15 if p["fam"] == FAM_AO else .1) + rng.normal(0, .05), 2)
            ticker = "DEMO" + "".join(w[0] for w in p["name"].split() if w[0].isalpha()).upper()[:4] + sp.code.split()[0]
            main = sp.code == "C"
            recs.append(dict(
                Id=sp.pi_shareid, pi_shareid=sp.pi_shareid, ProductID=p["pid"],
                SinkCreatedOn=datetime(2024, 1, 5), SinkModifiedOn=datetime(2026, 9, 29, 22, 0), MlvLastModified=datetime(2026, 9, 30, 5, 40),
                statecodename="Active" if not p["liquidated"] else "Inactive", statuscodename="Active" if not p["liquidated"] else "Inactive",
                Share_Name=f"{sp.fund} {sp.code}", ISIN_Code=sp.isin, Share_Class=sp.code, Share_classnew=sp.code,
                Subscription_Currency=sp.ccy, Share_Hedged_Against_FX_Exposure=_yn(sp.hedged),
                Income_Distribution="Distribution" if sp.distrib else "Capitalisation",
                Distribution_Frequency="Annuelle" if sp.distrib else None,
                Investor_Type="Investisseurs institutionnels" if sp.inst else ("Réservée aux distributeurs" if sp.code == "F" else "Tous souscripteurs"),
                Investor_Type_free_field=self._named_client(i),
                Investor_Type_Retail=_yn(not sp.inst), Investor_Type_Professional="Yes", Investor_Type_Eligible_Counterparty="Yes",
                Initial_Subscription_Minimum_Amount=(1_000_000.0 if sp.inst else None),
                Initial_Subscription_Minimum_Quantity=(None if sp.inst else 1.0),
                Ongoing_Charges_ex_post=max(oc, .02), Ongoing_Charges_ex_postCalculation_Date=date(2025, 12, 31),
                Ongoing_Charges_ex_ante=max(round(oc - .03, 2), .02), Ongoing_Charges_ex_ante_Calculation_Date=date(2026, 3, 31),
                Max_Financial_Management_Fees=round(sp.fee * 1.25, 2), Actual_Financial_Management_Fees=sp.fee,
                Max_admin_fees=.1, Actual_admin_fees=.08, TER_Max=round(sp.fee * 1.25 + .1, 2),
                Performance_fees=_yn(perf), Performance_Fee_Formula=("20 % de la performance au-delà de l'indicateur de référence" if perf else None),
                Maximum_Subscription_Fee_Rate_Not_Retained=(0.0 if sp.inst else 3.0), Maximum_Redemption_Fee_Rate_Not_Retained=0.0,
                Subscription_Fee_Retained=0.0, Redemption_Fee_Retained=0.0,
                Standard_Trailer_Fees_Holdings=(None if sp.inst or sp.code == "F" else round(40 + 20 * rng.random())),
                Subscription_cut_off_time="12:00" if p["dom"] == "France" else "13:00",
                Redemption_cut_off_time="12:00" if p["dom"] == "France" else "13:00",
                Subscription_Settlement_Date="J+2" if p["aclass"] != "Monétaire" else "J",
                Redemption_Settlement_Date="J+2" if p["aclass"] != "Monétaire" else "J",
                Centralisation_day="Chaque jour ouvré" if not p["weekly"] else "Chaque vendredi",
                NAV_Frequency="Hebdomadaire" if p["weekly"] else "Quotidienne",
                NAV_Calculation_Day="J+1", Price_Type="Inconnu",
                Morningstar_rating=int(rng.integers(2, 6)) if not p["launch"] else None,
                Morningstar_rating_date=date(2026, 8, 31),
                Bloomberg_Ticker=f"{ticker} {'FP' if p['dom'] == 'France' else 'LX'}", Code_RIC=None,
                Main_Share=_yn(main), Lifecycle="Liquidée" if p["liquidated"] else "Active",
                Product_Status="Fermée" if p["liquidated"] else "Ouverte", Investment_status="Ouverte",
                First_NAV_Date=first_nav, Creation_Date=first_nav - timedelta(days=14), Initial_NAV=round(sp.base_nav, 2),
                Mifid2_Share="Yes", Priips_Share="Yes", Swing_Pricing=_yn(p["aclass"] in ("Obligations",) and rng.random() < .6),
                Gate=_yn(p["aclass"] in ("Obligations", "Alternatif") and rng.random() < .5),
                Clearstream_Referencing=_yn(rng.random() < .7), Euroclear_France_Admission=_yn(p["dom"] == "France"),
                Euroclear_France_Platform_Referencing=_yn(rng.random() < .5), Fundsettle_Referencing=_yn(rng.random() < .6),
                Iznes_Referencing=_yn(rng.random() < .35), Export_AllFunds=bool(rng.random() < .55),
                Export_Morningstar=_yn(True), Export_Bloomberg=True, Website_Publication=_yn(not sp.inst or rng.random() < .5),
                Share_Class_Form="Nominatif et au porteur", Share_Class_Decimalisation="Millièmes",
                FATCA="Yes", Tax_StatusUK=_yn(rng.random() < .3),
                Registration_Date=first_nav - timedelta(days=30), Last_DIC_Modification_Date=date(2026, 2, 12),
                Wkn_Number=None, Sedol_Code=None, Swiss_Valor_Number=(int(10_000_000 + i) if sp.ccy == "CHF" else None),
                Redemption_Notice=0, Subscription_Notice=0,
                Created_On=datetime(2019, 1, 1), Modified_On=datetime(2026, 9, 12), Owner="Référentiel produits",
                PM_Validation=True, Risks_Validation=True, JUR_Validation=True, MOA_Validation=True, MO_Validation=True,
                MOR_Validation=True, REP_Validation=True, Sales_Validation=rng.random() > .04,
            ))
        df = _frame(S.SHARE, recs)
        # Une part sans ISIN dans le référentiel (anomalie à signaler)
        return df

    def products_table(self) -> pd.DataFrame:
        rng = np.random.default_rng(11)
        recs = []
        for p in self.products:
            if p["liquidated"]:
                continue
            i = p["idx"]
            art = p["sfdr"]
            is_eq = p["aclass"] in ("Actions",)
            sri = {"Monétaire": 1, "Obligations": 2 if p["sig"] < .05 else 3, "Convertibles": 3, "Diversifié": 3 if p["sig"] < .08 else 4,
                   "Alternatif": 3, "Actions": 4 if p["sig"] < .18 else 5}[p["aclass"]]
            prev_sri = sri + (1 if i in (7, 24) else (-1 if i == 14 else 0))
            creation = date(2008 + (i % 14), 1 + i % 12, 1) if not p["launch"] else p["launch"]
            auditor_end = date(2026 + (i % 5), 12, 31) if i % 9 else date(2026, 12, 31)
            excl = art != "Article 6"
            rec = dict(
                Id=p["pid"], pi_productid=p["pid"], Product_Global_ID=f"PG{2000 + i}", Product_Name=p["name"],
                SinkCreatedOn=datetime(2024, 1, 5), SinkModifiedOn=datetime(2026, 9, 29, 22, 0), MlvLastModified=datetime(2026, 9, 30, 5, 40),
                statecodename="Active", statuscodename="Active", Statut_Du_Produit="En vie", Active_Stage_Name="Production",
                Fund_Range=p["range"], Asset_Class=p["aclass"],
                Management_Expertise_Level_0="Gestion d'actifs", Management_Expertise_Level_1=p["fam"], Management_Expertise_Level_2=p["sub"],
                Management_Expertise_Path=f"Gestion d'actifs > {p['fam']} > {p['sub']}",
                Portfolio_Manager=p["pm"], Portfolio_Manager_backup_1=p["backup"], Start_date_Portfolio_manager=date(2015 + i % 10, 9, 1),
                Start_date_Portfolio_backup_1=date(2019 + i % 6, 1, 1),
                Legal_Form=("Compartiment de SICAV" if p["dom"] == "Luxembourg" else ("SICAV" if i % 3 == 0 else "FCP")),
                Domiciliation=p["dom"], Umbrella_Name=("Horizon SICAV" if p["dom"] == "Luxembourg" else None),
                Applicable_UCI_Regulation="UCITS" if p["aclass"] != "Alternatif" else "AIF",
                Product_Type="OPCVM" if p["aclass"] != "Alternatif" else "FIA",
                AMF_Classification={"Actions": "Actions internationales" if p["fam"] != FAM_AE else "Actions des pays de l'Union européenne",
                                    "Obligations": "Obligations et autres titres de créance libellés en euro", "Monétaire": "Monétaire standard à VL variable",
                                    }.get(p["aclass"]) if p["dom"] == "France" else None,
                ESG_SFDR_Article=art, ESG_AMF_Category={"Article 9": "Catégorie 1", "Article 8": "Catégorie 2" if i % 4 else "Catégorie 1", "Article 6": "Catégorie 3"}[art],
                RSI_french_label=_yn(art == "Article 9" or (art == "Article 8" and i % 4 == 0)),
                Finansol_Label=False, Belgium_Towards_Sustainability_label=(art == "Article 9"),
                Main_ESG_Focus_EET_20090="Environnement et social" if art != "Article 6" else None,
                Does_it_consider_PAI_EET_20100=_yn(art != "Article 6"),
                Does_it_invest_in_SI_EET_20170=_yn(art != "Article 6"),
                PerCent_Min_SI_EET_20420=({"Article 9": 90, "Article 8": 10 + 5 * (i % 3)}.get(art) if not (i == 17) else None),
                PerCent_Min_SI_Env_EET_20440=({"Article 9": 40, "Article 8": 5}.get(art)),
                PerCent_Min_SI_Social_EET_20470=({"Article 9": 20, "Article 8": 2}.get(art)),
                PerCent_Min_with_ES_Characteristics_EET_20400=({"Article 9": 100, "Article 8": 70 + 5 * (i % 4)}.get(art)),
                PerCent_Min_Aligned_Taxonomy_Incl_Sovereing_EET_20600=({"Article 9": 5, "Article 8": 0}.get(art)),
                Aligned_With_Paris_Agreement_EET_20580=_yn(art == "Article 9"),
                Objective_Reduction_Carbon_Emissions_EET_20570=_yn(art == "Article 9"),
                Reference_ESG_Benchmark_EET_20370=_yn(p["name"] == "Europe Transition Climat"),
                GHG_Emissions_Scope123_Considered_EET_30190=_yn(excl), Carbon_Footprint_Scope_123_Considered_EET_30270=_yn(excl),
                Exposure_to_Fossil_Fuel_Considered_EET_30390=_yn(excl), Biodiversity_Considered_EET_30870=_yn(excl and i % 2 == 0),
                Violation_UNGC_OECD_Considered_EET_30990=_yn(excl), Board_Gender_Diversity_Considered_EET_31100=_yn(excl),
                Controversial_Weapons_Considered_EET_31140=_yn(True),
                Conventional_Weapons_Exclusion_EET_50500=_yn(excl and i % 3 == 0), Tobacco_Exclusion_EET_52000=_yn(excl),
                Nuclear_Weapons_Exclusion_EET_51400=_yn(True), Gambling_Exclusion_EET_50900=_yn(excl and i % 2 == 0),
                Pornography_Exclusion_EET_50100=_yn(excl), Alcohol_Exclusion_EET_50200=_yn(art == "Article 9"),
                Oil_Exclusion_EET_51500=_yn(art == "Article 9"), Gas_Exclusion_EET_51000=_yn(art == "Article 9" and i % 2 == 0),
                Other_Fossil_Fuel_Exclusion_EET_51600=_yn(excl), Nuclear_Energy_Exclusion_EET_51300=_yn(False),
                Palm_Oil_Exclusion_EET_51700=_yn(art == "Article 9"), GMO_Exclusion_EET_51200=_yn(False),
                OECD_Guidelines_Exclusion_EET_52210=_yn(excl), ILO_Exclusion_EET_52220=_yn(excl),
                Official_Risk_Scale=str(sri), Previous_month_SRI=str(prev_sri), Official_Risk_Scale_SRRI=sri,
                Recommended_Investment_Period={1: "3 mois", 2: "2 ans", 3: "3 ans", 4: "5 ans", 5: "5 ans"}[sri],
                Benchmark_Name=p["bench"], Benchmark="Yes" if p["bench"] else "No", Benchmark_Currency="EUR" if p["bench"] else None,
                Comparison_index=None, Accounting_Currency=p["fund_ccy"],
                Creation_Date=creation, First_NAV_Date=creation + timedelta(days=14),
                Maturity_date=(date(int(p["name"][-4:]), 12, 31) if p["range"] == "Échéance" else None),
                Annual_closing_date="Dernier jour de bourse de décembre" if i % 2 else "Dernier jour de bourse de mars",
                NAV_Frequency="Hebdomadaire" if p["weekly"] else "Quotidienne", NAV_Calculation_Day="J+1",
                Investment_Zone={FAM_AE: "Europe", FAM_FI: "Zone euro"}.get(p["fam"], "Monde"),
                Region={FAM_AE: "Europe", FAM_FI: "Europe"}.get(p["fam"], "Global"),
                Investment_objective_FR=f"Le fonds {p['name']} vise, sur la durée de placement recommandée, une performance "
                                        + (f"supérieure à celle de son indicateur de référence ({p['bench']})" if p["bench"] else "annualisée nette de frais à échéance")
                                        + ", au travers d'une gestion active et de conviction.",
                Typical_investor_profile_FR="Tous souscripteurs recherchant une exposition "
                                            + ("aux marchés actions" if is_eq else "aux marchés de taux et de crédit" if p["aclass"] in ("Obligations", "Convertibles") else "diversifiée"),
                Strategic_allocation_FR=None,
                Global_Exposure_Calculation="Engagement" if i % 5 else "VaR absolue",
                Strategy_based_on_derivatives=_yn(i % 5 == 0),
                Leveraged_Financial_or_Contingent_Liability_Instr=_yn(i % 5 == 0),
                Counterparty_risk=bool(p["aclass"] in ("Obligations", "Convertibles", "Diversifié", "Alternatif")),
                Credit_risk=bool(p["aclass"] in ("Obligations", "Convertibles", "Diversifié", "Monétaire")),
                Liquidity_risk=bool(p["sub"] in ("Haut rendement", "Dette émergente", "Actions Europe petites et moyennes capitalisations")),
                Liquidity_risk_Equity=bool(p["sub"] == "Actions Europe petites et moyennes capitalisations"),
                Operational_and_custody_related_risks=True, Impact_of_techniques_such_as_derivatives=bool(i % 5 == 0),
                volatility_maximum_target_PerCent=(8.0 if p["name"] == "Allocation Flexible Monde" else None),
                Volatility_target=p["name"] == "Allocation Flexible Monde",
                Max_management_fee_PerCent=2.0 if is_eq else 1.2, Actual_Management_Fees_PerCent=1.6 if is_eq else .9,
                Performance_fees=_yn(is_eq and i % 2 == 0), High_Water_Mark=_yn(is_eq and i % 2 == 0),
                Depositary="Dépositaire Alpha SA" if p["dom"] == "France" else "Banque Dépositaire Luxembourg Démo",
                Custodian="Dépositaire Alpha SA", Fund_Administrator="Valorisateur Démo Services",
                Transfer_Agent="Agent de transfert Démo", Centralizing_Agent="Centralisateur Démo",
                Commissaire_Aux_Comptes=["Cabinet Audit Nord", "Audit & Associés Démo", "Contrôle Expertise Démo"][i % 3],
                Auditors_Mandate_Start_Date=date(auditor_end.year - 6, 1, 1), Auditors_Mandate_Termination_Date=auditor_end,
                Investment_Manager="Société de gestion (démo)",
                Sponsoring_Entity=("Rothschild Martin Maurel" if p["name"] in RMM_DEMO else "Rothschild & Co Asset Management"),
                Delegation_investment_manager=("Délégataire Asie Démo" if p["name"] == "Asie Croissance" else None),
                Investment_Management_Delegation=_yn(p["name"] == "Asie Croissance"),
                Fund_of_Funds=_yn(p["fam"] == FAM_AO), Feeder_Fund_=_yn(False), ETF_Fund=_yn(False),
                Priips_Fund="Yes", Mifid_Fund="Yes", EET_Fund="Yes", KID_Generation="Yes", Website_Publication="Yes",
                OPC_Eligible_US_Person="No", Dissemination_Blocker="No",
                LEI_Code=f"969500DEMO{i:04d}LEI{i:02d}"[:20], AMF_Code=(f"DEMO{i:04d}" if p["dom"] == "France" else None),
                CSSF_Code=(f"O{10000 + i}" if p["dom"] == "Luxembourg" else None), AIM_Portfolio_Code=f"AIM{300 + i}",
                PM_Validation=True, Risks_Validation=i not in (29,), JUR_Validation=True, MOA_Validation=True,
                MO_Validation=True, MOR_Validation=True, REP_Validation=i not in (40,), Sales_Validation=True,
                Step_1_Validation_Date=datetime(2024, 1, 10), Step_7_Validation_Date=(datetime(2024, 2, 1) if i not in (29, 40) else None),
                Created_On=datetime(2019, 1, 1), Modified_On=datetime(2026, 9, 12), Owner="Référentiel produits",
                Version_Number=int(1000 + i),
            )
            recs.append(rec)
        return _frame(S.PRODUCT, recs)

    def countries_table(self) -> pd.DataFrame:
        rng = np.random.default_rng(13)
        prod = {p["name"]: p for p in self.products}
        recs = []
        for sp in self.shares:
            p = prod[sp.fund]
            if p["liquidated"]:
                continue
            if sp.fund == "Obligations Vertes" and sp.code == "I":
                continue  # part active sans enregistrement (à signaler en contrôle)
            base = ["France"] if p["dom"] == "France" else ["Luxembourg", "France"]
            if sp.code == "Z":
                chosen = base
            else:
                # 2 à 3 pays par part en moyenne (≈ 2,5 pays par client nommé)
                k = max(0, int(rng.choice([2, 2, 2, 3, 3])) - len(base))
                others = [c for c in COUNTRIES if c not in base]
                chosen = base + list(rng.choice(others, size=min(k, len(others)), replace=False))
                if sp.ccy == "CHF" and "Switzerland" not in chosen:
                    chosen.append("Switzerland")
            start = max(filter(None, [date(2008 + (p["idx"] % 14), 1 + p["idx"] % 12, 1), p["launch"], sp.launch]))
            for c in chosen:
                withdrawn = rng.random() < .03
                # Les pays s'ouvrent progressivement : domicile d'abord, puis l'Europe, l'Asie et l'Amérique latine plus tard
                opens = OPENING.get(c, 2014)
                y0 = max(start.year, opens) if c not in base else start.year
                y = min(2026, y0 + int(rng.integers(0, 3)) * (c not in base))
                reg = date(y, int(rng.integers(1, 13)) if y < 2026 else int(rng.integers(1, 9)), 1)
                if reg < start:
                    reg = start
                recs.append(dict(
                    Id=_uid("reg", sp.pi_shareid, c), pi_countryofregistrationid=_uid("reg", sp.pi_shareid, c),
                    pi_shareid=sp.pi_shareid, Country=c, pi_name=f"{sp.isin} - {c}",
                    statecodename="Inactive" if withdrawn else "Active", statuscodename="Inactive" if withdrawn else "Active",
                    FINMA_Autorization=(c == "Switzerland"), Registration_Date=datetime(reg.year, reg.month, reg.day),
                    Comment=("Retrait de la commercialisation" if withdrawn else None),
                    SinkCreatedOn=datetime(2024, 1, 5), SinkModifiedOn=datetime(2026, 9, 29, 22, 0),
                    MlvLastModified=datetime(2026, 9, 30, 5, 40), Modified_On=datetime(2026, 6, 1),
                ))
        return _frame(S.COUNTRY, recs)

    # ------------------------------------------------------------------ inventaires
    def holdings_table(self) -> pd.DataFrame:
        rng = np.random.default_rng(17)
        aum = self.aum()
        eq_eu = [(f"{a} {s}", "EUR" if k % 5 else ["GBP", "CHF", "SEK", "DKK"][k % 4]) for k, (a, s) in
                 enumerate((a, s) for a in EQ_PREFIX for s in EQ_SECTOR[:4])][:110]
        eq_gl = [(f"{a} {s}", ["USD", "USD", "USD", "JPY", "HKD", "GBP", "CHF"][k % 7]) for k, (a, s) in
                 enumerate((a, s) for a in GL_PREFIX for s in EQ_SECTOR[4:12])][:110]
        bonds = []
        for k, iss in enumerate(ISSUER_BOND):
            for y in (2027, 2028, 2029, 2030, 2031, 2033):
                cpn = round(1.5 + (k % 6) * .6 + (y - 2027) * .15, 3)
                sov = iss.startswith(("République", "Royaume", "État", "Caisse"))
                bonds.append((f"{iss} {str(cpn).replace('.', ',')} % {y}", "EUR", "Souveraine" if sov else ("Subordonnée" if k % 5 == 0 else "Senior"), cpn, y))
        ext_funds = [(f"{h} {t}", "EUR") for h in EXT_FUND_HOUSES for t in ("Actions Monde", "Crédit Europe", "Actions Émergentes", "Rendement Absolu")]
        instr_id: dict[str, tuple[str, str]] = {}

        def ident(name: str) -> tuple[str, str]:
            if name not in instr_id:
                n = len(instr_id)
                instr_id[name] = (f"JI{700000 + n}", fake_isin("XS" if n % 2 else "EU", n + 1))
            return instr_id[name]

        # Encours de chaque fonds en fin de mois (devise du fonds)
        aum = aum.copy()
        aum["DATE_VL"] = pd.to_datetime(aum["DATE_VL"])
        prod = {p["jump_fund"]: p for p in self.products}
        month_ends = pd.date_range("2026-05-31", "2026-08-31", freq="BME")
        recs = []
        for jf, g in aum.groupby("ID_JUMP_FONDS"):
            p = prod[jf]
            if p["liquidated"]:
                continue
            tot = g.drop_duplicates("DATE_VL").set_index("DATE_VL")["ACTIF_NET_TOTAL_DEVISE_FONDS"].sort_index()
            fam, aclass = p["fam"], p["aclass"]
            if aclass == "Monétaire":
                universe = [(n, c, "TCN", "Monétaire") for n, c, *_ in bonds[:40]]
            elif fam == FAM_AO:
                universe = [(n, c, "OPC", "OPC") for n, c in ext_funds]
            elif fam == FAM_AE:
                universe = [(n, c, "ACT", "Actions") for n, c in eq_eu]
            elif fam == FAM_FI:
                universe = [(n, c, "OBL", "Obligations") for n, c, *_ in bonds]
            elif aclass == "Diversifié":
                universe = [(n, c, "ACT", "Actions") for n, c in eq_gl[:50] + eq_eu[:30]] + [(n, c, "OBL", "Obligations") for n, c, *_ in bonds[:50]]
            else:
                universe = [(n, c, "ACT", "Actions") for n, c in eq_gl]
            nlines = min(len(universe), int(rng.integers(25, 70)))
            pick = rng.choice(len(universe), size=nlines, replace=False)
            base_w = rng.dirichlet(np.full(nlines, .8)) * (100 - 3.0)
            bond_meta = {b[0]: b for b in bonds}
            # Rotation : chaque mois, quelques petites lignes sortent et de nouvelles entrent
            picks = [pick.copy()]
            for _ in month_ends[1:]:
                nxt = picks[-1].copy()
                unused = [u for u in range(len(universe)) if u not in set(nxt)]
                small = np.argsort(base_w)[: max(4, nlines // 3)]
                for pos in rng.choice(small, size=min(3, len(unused), len(small)), replace=False):
                    nxt[pos] = unused.pop(int(rng.integers(0, len(unused))))
                picks.append(nxt)
            for m_i, me in enumerate(month_ends):
                pick = picks[m_i]
                if me < tot.index.min():
                    continue
                an = float(tot[:me].iloc[-1])
                drift = base_w * np.exp(rng.normal(0, .06, nlines))
                w = drift / drift.sum() * (100 - 2.5 - rng.random())
                rows = [(universe[j], w[t]) for t, j in enumerate(pick)]
                cash_w = 100 - w.sum()
                for (nm, ccy, typ, cls), wt in rows:
                    jid, isin = ident(nm)
                    fx = {"EUR": 1, "USD": .92, "GBP": 1.17, "CHF": 1.02, "JPY": .0062, "HKD": .118, "SEK": .088, "DKK": .134}[ccy]
                    amount = an * wt / 100
                    price = 100 * (0.8 + .5 * ((_h(nm) % 97) / 97)) if typ in ("OBL", "TCN") else 20 + (_h(nm) % 400)
                    b = bond_meta.get(nm)
                    recs.append(dict(
                        ID_JUMP_FONDS=jf, ID_PI_FONDS=p["pid"], NOM_FONDS=p["name"], DEVISE_FONDS=p["fund_ccy"],
                        DATE_INVENTAIRE=me.date(), DATE_COTATION=me.date(), ID_JUMP_INSTRUMENT=jid,
                        CODE_ISIN_INSTRUMENT=isin, CODE_BLOOMBERG=None, CODE_AIM_FONDS=f"AIM{300 + p['idx']}",
                        NOM_INSTRUMENT=nm, DEVISE_INSTRUMENT=ccy, CODE_TYPE_INSTRUMENT=typ, CLASSE_ACTIF=cls,
                        TYPE_HOLDING="Titre", QUANTITE=round(amount / (price * fx), 0), QUANTITE_JUMP=round(amount / (price * fx), 0),
                        POIDS_LIGNE_EXPO=round(wt, 4), POIDS_LIGNE_TAUX=round(wt, 4) if typ in ("OBL", "TCN") else None,
                        COURS_UNITAIRE=round(price, 4), MONTANT_DEVISE_INSTRUMENT=round(amount / fx, 2),
                        MONTANT_DEVISE_FONDS=round(amount, 2), EXPOSITION_DEVISE_INSTRUMENT=round(amount / fx, 2),
                        EXPOSITION_DEVISE_FONDS=round(amount, 2), PRU_DEVISE_FONDS=round(price * .95, 4),
                        TYPE_DETTE=b[2] if b else None, COUPON_COURU_PERC=(round(b[3] * .4, 4) if b else None),
                        COURS_UNITAIRE_PERC=(round(price, 4) if typ in ("OBL", "TCN") else None),
                        TAUX_CHANGE_EUR=fx, DATE_MAJ=datetime(2026, 9, 30, 6, 12),
                    ))
                recs.append(dict(
                    ID_JUMP_FONDS=jf, ID_PI_FONDS=p["pid"], NOM_FONDS=p["name"], DEVISE_FONDS=p["fund_ccy"],
                    DATE_INVENTAIRE=me.date(), DATE_COTATION=me.date(), ID_JUMP_INSTRUMENT="CASH-" + p["fund_ccy"],
                    CODE_ISIN_INSTRUMENT=None, NOM_INSTRUMENT=f"Liquidités {p['fund_ccy']}", DEVISE_INSTRUMENT=p["fund_ccy"],
                    CODE_TYPE_INSTRUMENT="CASH", CLASSE_ACTIF="Liquidités", TYPE_HOLDING="Liquidité",
                    QUANTITE=round(an * cash_w / 100, 2), POIDS_LIGNE_EXPO=round(cash_w, 4),
                    MONTANT_DEVISE_FONDS=round(an * cash_w / 100, 2), MONTANT_DEVISE_INSTRUMENT=round(an * cash_w / 100, 2),
                    EXPOSITION_DEVISE_FONDS=round(an * cash_w / 100, 2), COURS_UNITAIRE=1.0, TAUX_CHANGE_EUR=1.0,
                    DATE_MAJ=datetime(2026, 9, 30, 6, 12),
                ))
                if p["idx"] % 5 == 0 and aclass != "Monétaire":
                    recs.append(dict(
                        ID_JUMP_FONDS=jf, ID_PI_FONDS=p["pid"], NOM_FONDS=p["name"], DEVISE_FONDS=p["fund_ccy"],
                        DATE_INVENTAIRE=me.date(), DATE_COTATION=me.date(), ID_JUMP_INSTRUMENT="FUT-ESX-DEC26",
                        NOM_INSTRUMENT="Future Euro Stoxx 50 déc. 2026", DEVISE_INSTRUMENT="EUR", CODE_TYPE_INSTRUMENT="FUT",
                        CLASSE_ACTIF="Dérivés", TYPE_HOLDING="Dérivé", QUANTITE=-float(rng.integers(20, 200)),
                        POIDS_LIGNE_EXPO=-round(3 + 5 * rng.random(), 4), MONTANT_DEVISE_FONDS=0.0,
                        EXPOSITION_DEVISE_FONDS=-round(an * .05, 2), TAUX_CHANGE_EUR=1.0, DATE_MAJ=datetime(2026, 9, 30, 6, 12),
                    ))
        return _frame(S.HOLDINGS, recs)

    def calendar_table(self) -> pd.DataFrame:
        return pd.DataFrame({"DateVL": [d.date() for d in self.dates]})

    def dq_table(self) -> pd.DataFrame:
        recs = []
        for k, t in enumerate(["JUMP_portfolio_aum", "JUMP_portfolio_holdings", "PI_OUT_Share", "pi_out_product_active", "PI_OUT_CountryOfRegistration"]):
            recs.append(dict(Namespace="dbo", MLVName=t, MLVID=_uid("mlv", t), RefreshPolicy="Quotidien",
                             RefreshDate="2026-09-30", RefreshTimestamp=f"2026-09-30T05:{40 + k:02d}:00Z",
                             Message="Succès", TotalRowsProcessed=str(10000 * (k + 1)), TotalRowsDropped="0" if k != 1 else "12",
                             TotalViolations="0" if k != 1 else "12", ViolationsPerConstraint=None if k != 1 else '{"ISIN non nul": 12}'))
        return _frame(S.DQ, recs)


def _h(s: str) -> int:
    return zlib.crc32(s.encode())


def rng_like(seed: int, n: int, scale: float) -> np.ndarray:
    return np.random.default_rng(seed).normal(0, scale, n)


class MockSource:
    """Même interface que FabricSource : table(nom, colonnes, filtre de date)."""

    def __init__(self):
        self._lake = MockLakehouse()
        self._cache: dict[str, pd.DataFrame] = {}

    def _full(self, name: str) -> pd.DataFrame:
        if name not in self._cache:
            lake = self._lake
            self._cache[name] = {
                S.AUM: lake.aum, S.SHARE: lake.shares_table, S.PRODUCT: lake.products_table,
                S.COUNTRY: lake.countries_table, S.HOLDINGS: lake.holdings_table,
                S.CALENDAR: lake.calendar_table, S.DQ: lake.dq_table,
            }[name]()
        return self._cache[name]

    def table(self, name: str, columns: Sequence[str], since: tuple[str, Any] | None = None) -> pd.DataFrame:
        df = self._full(name)
        if since:
            col, value = since
            df = df[pd.to_datetime(df[col]) >= pd.Timestamp(value)]
        return df[list(columns)].reset_index(drop=True)


# Colonnes d'identifiants (et de libellés) suffixées à chaque copie : chaque copie est un jeu de fonds distinct.
_SCALED_IDS = {
    S.PRODUCT: ("Id", "pi_productid", "Product_Name"),
    S.SHARE: ("Id", "pi_shareid", "ProductID", "ISIN_Code", "Share_Name"),
    S.COUNTRY: ("Id", "pi_countryofregistrationid", "pi_shareid"),
    S.AUM: ("ID_JUMP_FONDS", "ID_PI_FONDS", "ID_JUMP_PART", "ID_PI_PART", "CODE_ISIN_PART", "NOM_PART"),
    S.HOLDINGS: ("ID_JUMP_FONDS", "ID_PI_FONDS", "NOM_FONDS"),
}


class ScaledMockSource(MockSource):
    """Données fictives démultipliées (`factor` copies du jeu de fonds) pour éprouver l'application à l'échelle réelle.

    Les instruments détenus restent communs aux copies (lignes partagées entre fonds, comme en réalité).
    factor=17 ≈ 3 millions de lignes d'encours et ≈ 75 millions de cellules lues.
    """

    def __init__(self, factor: int = 17):
        super().__init__()
        self.factor = max(1, int(factor))

    def _full(self, name: str) -> pd.DataFrame:
        if name not in self._cache:
            base = super()._full(name)
            ids = _SCALED_IDS.get(name)
            if ids and self.factor > 1:
                parts = [base]
                for k in range(1, self.factor):
                    c = base.copy()
                    for col in ids:
                        s = c[col].astype(object)
                        c[col] = s.where(s.isna(), s.astype(str) + f" ~{k}")
                    parts.append(c)
                self._cache[name] = pd.concat(parts, ignore_index=True)
        return self._cache[name]
