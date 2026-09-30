"""Vocabulaire métier : familles de gestion, pays, booléens du référentiel."""
from __future__ import annotations

import math
import re
import unicodedata
from typing import Any

# Les quatre grandes familles, chacune porteuse de sa charte de couleur.
# Classement par mots-clés (sans accents, minuscules) appliqué aux champs du référentiel,
# du plus spécifique au plus générique. Ajustable ici sans toucher au reste de l'app.
FAMILIES = [
    {"key": "ao", "label": "Architecture ouverte", "short": "Architecture ouverte",
     "keywords": ["architecture ouverte", "open architecture", "multigestion", "multi-gestion", "multi gestion", "fonds de fonds", "selection"]},
    {"key": "fi", "label": "Fixed Income", "short": "Fixed Income",
     "keywords": ["fixed income", "taux", "obligat", "credit", "monetaire", "money market", "tresorerie", "convertible", "bond", "echeance", "haut rendement", "souverain"]},
    {"key": "ae", "label": "Actions européennes", "short": "Actions européennes",
     "keywords": ["actions europeennes", "actions europe", "european equit", "actions france", "actions euro", "europe", "france", "euro"]},
    {"key": "aid", "label": "Actions internationales et gestion diversifiée", "short": "Actions internationales & diversifiée",
     "keywords": ["actions internationales", "international", "diversifi", "allocation", "patrimoine", "global", "monde", "world", "emergent", "thematique", "actions"]},
]
UNCLASSIFIED = {"key": "nc", "label": "Non classé", "short": "Non classé"}
FAMILY_BY_KEY = {f["key"]: f for f in FAMILIES} | {"nc": UNCLASSIFIED}

_FAMILY_FIELDS = ["Management_Expertise_Level_1", "Management_Expertise_Level_2", "Management_Expertise_Path",
                  "Fund_Range", "Asset_Class", "Product_Name"]


def norm(text: Any) -> str:
    if text is None or (isinstance(text, float) and math.isnan(text)):
        return ""
    s = unicodedata.normalize("NFKD", str(text))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s.lower()).strip()


def family_of(product: dict | None) -> str:
    """Retourne la clé de famille d'un fonds à partir de son référentiel."""
    if not product:
        return "nc"
    for fld in _FAMILY_FIELDS:
        value = norm(product.get(fld))
        if not value:
            continue
        for fam in FAMILIES:
            if any(k in value for k in fam["keywords"]):
                return fam["key"]
    return "nc"


_TRUE = {"yes", "oui", "true", "1", "y", "o", "vrai"}
_FALSE = {"no", "non", "false", "0", "n", "faux"}


def to_bool(v: Any) -> bool | None:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    s = norm(v)
    if s in _TRUE:
        return True
    if s in _FALSE:
        return False
    return None


# Pays : libellé français, code ISO2 (pour la carte), à partir des libellés EN ou FR du référentiel.
COUNTRIES = {
    "france": ("France", "FR"), "luxembourg": ("Luxembourg", "LU"), "belgium": ("Belgique", "BE"), "belgique": ("Belgique", "BE"),
    "germany": ("Allemagne", "DE"), "allemagne": ("Allemagne", "DE"), "austria": ("Autriche", "AT"), "autriche": ("Autriche", "AT"),
    "italy": ("Italie", "IT"), "italie": ("Italie", "IT"), "spain": ("Espagne", "ES"), "espagne": ("Espagne", "ES"),
    "portugal": ("Portugal", "PT"), "netherlands": ("Pays-Bas", "NL"), "pays-bas": ("Pays-Bas", "NL"), "the netherlands": ("Pays-Bas", "NL"),
    "switzerland": ("Suisse", "CH"), "suisse": ("Suisse", "CH"), "united kingdom": ("Royaume-Uni", "GB"), "royaume-uni": ("Royaume-Uni", "GB"),
    "uk": ("Royaume-Uni", "GB"), "sweden": ("Suède", "SE"), "suede": ("Suède", "SE"), "finland": ("Finlande", "FI"), "finlande": ("Finlande", "FI"),
    "denmark": ("Danemark", "DK"), "danemark": ("Danemark", "DK"), "norway": ("Norvège", "NO"), "norvege": ("Norvège", "NO"),
    "ireland": ("Irlande", "IE"), "irlande": ("Irlande", "IE"), "singapore": ("Singapour", "SG"), "singapour": ("Singapour", "SG"),
    "chile": ("Chili", "CL"), "chili": ("Chili", "CL"), "liechtenstein": ("Liechtenstein", "LI"), "monaco": ("Monaco", "MC"),
    "poland": ("Pologne", "PL"), "pologne": ("Pologne", "PL"), "czech republic": ("Tchéquie", "CZ"), "greece": ("Grèce", "GR"),
    "hong kong": ("Hong Kong", "HK"), "iceland": ("Islande", "IS"), "malta": ("Malte", "MT"), "cyprus": ("Chypre", "CY"),
    "peru": ("Pérou", "PE"), "uruguay": ("Uruguay", "UY"), "united arab emirates": ("Émirats arabes unis", "AE"),
}


def country(label: Any) -> tuple[str, str]:
    """(libellé français, ISO2). Un pays inconnu garde son libellé d'origine, code '??'."""
    key = norm(label)
    if key in COUNTRIES:
        return COUNTRIES[key]
    return (str(label) if label else "Non renseigné", "??")


SFDR_SHORT = {"article 6": "Art. 6", "article 8": "Art. 8", "article 9": "Art. 9"}


def sfdr_short(v: Any) -> str | None:
    s = norm(v)
    for k, lab in SFDR_SHORT.items():
        if k in s or s == k[-1]:
            return lab
    return str(v) if v else None
