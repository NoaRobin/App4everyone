"""Données fictives reproduisant la *structure* des écarts observés entre JUMP et Product Info (aucune donnée réelle).

Écarts injectés, chacun sur une partie des parts :
- GUID en majuscules, entre accolades ou suivis d'espaces (ID_PI_PART, ID_PI_FONDS de JUMP) ;
- ISIN du référentiel avec espaces et minuscules ;
- parts du référentiel sans ProductID ;
- un ISIN dupliqué dans le référentiel (deux parts) et utilisé par une part JUMP sans identifiant ;
- un fonds JUMP dont une part n'a ni identifiant ni ISIN connu (même fonds réparti entre plusieurs identifiants) ;
- champs texte vides (gérant, SFDR, nom) ;
- un fonds nommé comme une gamme réelle (« R-co 4Change Net Zero Credit Euro »), mais aux chiffres inventés.
"""
from __future__ import annotations

import pandas as pd

from rco.data import schema as S
from rco.data.mock import MockSource

R4C = "R-co 4Change Net Zero Credit Euro"


class DirtySource(MockSource):
    def __init__(self):
        super().__init__()
        self._dirty: dict[str, pd.DataFrame] = {}

    def _full(self, name: str) -> pd.DataFrame:
        if name in self._dirty:
            return self._dirty[name]
        base = super()._full(name).copy()
        if name == S.PRODUCT:
            base.loc[base.index[0], "Product_Name"] = R4C
            base.loc[base.index[1], "Portfolio_Manager"] = None
            base.loc[base.index[2], "ESG_SFDR_Article"] = None
        elif name == S.SHARE:
            sh = base.index
            base.loc[sh[::5], "ProductID"] = None                                  # parts sans ProductID
            base["ISIN_Code"] = base["ISIN_Code"].astype(object)
            iso = base.loc[sh[1::4], "ISIN_Code"].astype(str)
            base.loc[sh[1::4], "ISIN_Code"] = iso.str.lower().str.slice(0, 4) + " " + iso.str.lower().str.slice(4)
            base.loc[sh[3], "ISIN_Code"] = base.loc[sh[2], "ISIN_Code"]          # ISIN dupliqué
        elif name == S.AUM:
            parts = list(pd.unique(base["ID_JUMP_PART"]))
            up = base["ID_JUMP_PART"].isin(parts[::2])
            base["ID_PI_PART"] = base["ID_PI_PART"].astype(object)
            base.loc[up, "ID_PI_PART"] = "{" + base.loc[up, "ID_PI_PART"].astype(str).str.upper() + "}"
            sp = base["ID_JUMP_PART"].isin(parts[1::6])
            base.loc[sp, "ID_PI_PART"] = base.loc[sp, "ID_PI_PART"].astype(str) + "  "
            base["ID_PI_FONDS"] = base["ID_PI_FONDS"].astype(object).map(lambda x: x.upper() if isinstance(x, str) else x)
            # Part sans identifiant de part : ISIN seulement (secours)
            noid = base["ID_JUMP_PART"].isin(parts[3::10])
            base.loc[noid, "ID_PI_PART"] = None
            # Part sans identifiant, ni ISIN, ni identifiant fonds : seul son fonds JUMP la rattache
            orphan = base["ID_JUMP_PART"] == parts[7]
            base.loc[orphan, ["ID_PI_PART", "CODE_ISIN_PART", "ID_PI_FONDS"]] = None
        self._dirty[name] = base
        return base


class HardSource(DirtySource):
    """Écarts plus sévères, chacun plausible sur les données réelles (cas « R-co Valor C EUR » non rattaché) ; sur six
    fonds JUMP, toutes les parts sont touchées à la fois, si bien qu'aucune part sœur ne peut les rattraper :
    - fiches part en double (rechargement), la première sans ProductID ;
    - anciennes fiches inactives réutilisant l'ISIN des parts actives (autre identifiant, autre ProductID) ;
    - parts sans ID_PI_PART, fonds sans ID_PI_FONDS : seuls l'ISIN et les inventaires peuvent les rattacher ;
    - sur l'un d'eux, ISIN absents aussi : seuls les inventaires (ID_PI_FONDS du même fonds JUMP) le rattachent ;
    - ailleurs, identifiants de part entourés d'espaces insécables et de caractères invisibles.
    """

    def __init__(self):
        super().__init__()
        self._hard: dict[str, pd.DataFrame] = {}

    def _full(self, name: str) -> pd.DataFrame:
        if name in self._hard:
            return self._hard[name]
        from rco.domain import ids as IDS
        aum0 = DirtySource._full(self, S.AUM)
        targets = self.targets()
        if name == S.SHARE:
            base = DirtySource._full(self, name).copy()
            pids = set(IDS.ids(aum0.loc[aum0["ID_JUMP_FONDS"].isin(targets), "ID_PI_FONDS"]).dropna())
            hit = IDS.ids(base["ProductID"]).isin(pids) | IDS.ids(base["pi_shareid"]).isin(
                set(IDS.ids(aum0.loc[aum0["ID_JUMP_FONDS"].isin(targets), "ID_PI_PART"]).dropna()))
            first = base[hit].assign(ProductID=None)                                 # doublons sans ProductID, en tête
            old = base[hit].copy()                                                   # anciennes fiches inactives, même ISIN
            old["pi_shareid"] = old["pi_shareid"].astype(str) + "-old"
            old["Id"] = old["pi_shareid"]
            old["ProductID"] = base.loc[~hit, "ProductID"].dropna().iloc[0]
            old[["statecodename", "statuscodename"]] = "Inactive"
            base = pd.concat([first, base, old], ignore_index=True)
        elif name == S.AUM:
            base = aum0.copy()
            t = base["ID_JUMP_FONDS"].isin(targets)
            base.loc[t, ["ID_PI_PART", "ID_PI_FONDS"]] = None
            base.loc[base["ID_JUMP_FONDS"] == targets[0], "CODE_ISIN_PART"] = None
            parts = list(pd.unique(base.loc[~t, "ID_JUMP_PART"]))
            nb = base["ID_JUMP_PART"].isin(parts[5::9]) & base["ID_PI_PART"].notna()
            base.loc[nb, "ID_PI_PART"] = "\u00a0" + base.loc[nb, "ID_PI_PART"].astype(str) + "\u200b"
        else:
            base = DirtySource._full(self, name)
        self._hard[name] = base
        return base

    def targets(self) -> list:
        held = set(pd.unique(DirtySource._full(self, S.HOLDINGS)["ID_JUMP_FONDS"].dropna()))
        aum0 = DirtySource._full(self, S.AUM)
        return [f for f in sorted(pd.unique(aum0["ID_JUMP_FONDS"].dropna())) if f in held][2:8]
