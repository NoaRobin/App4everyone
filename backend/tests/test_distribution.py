"""Distribution : repérage des fonds RMM, exclusion, et conservation des flux du Sankey."""
from collections import Counter

import pandas as pd
import pytest

from rco.data.mock import MockSource
from rco.domain import labels as L
from rco.domain.model import build_model
from rco.service import Service


@pytest.fixture(scope="module")
def svc():
    return Service(build_model(MockSource(), stale_days=12, history_years=4, is_mock=True))


def test_regle_rmm_insensible_casse_accents_et_mot_entier():
    p = pd.DataFrame({"Sponsoring_Entity": ["Rothschild Martin Maurel", None, "Autre"], "Fund_Range": [None, "Gamme rmm", "Grammes"]},
                     index=["a", "b", "c"])
    cols = ("Sponsoring_Entity", "Fund_Range", "Colonne_absente")
    assert L.rmm_funds(p, cols, r"\bRMM\b|martin\s*maurel") == {"a", "b"}


def test_exclusion_rmm_retire_leurs_enregistrements(svc):
    tout, sans = svc.distribution(None), svc.distribution(None, True)
    assert tout["rmm"]["n_funds"] == 6
    assert sans["n_funds_registered"] == tout["n_funds_registered"] - 6
    assert sans["n_shares_registered"] < tout["n_shares_registered"]
    france = svc.country("France", None, True)
    assert not any(r["rmm"] for r in france["rows"])
    assert any(r["rmm"] for r in svc.country("France", None)["rows"])


@pytest.mark.parametrize("excl", [False, True])
def test_sankey_flux_conserves(svc, excl):
    sk = svc.distribution(None, excl)["sankey"]
    entree, sortie = Counter(), Counter()
    for link in sk["links"]:
        sortie[link["source"]] += link["value"]
        entree[link["target"]] += link["value"]
    for i, n in enumerate(sk["nodes"]):
        if n["col"] == 0:
            assert sortie[i] == n["value"]
        elif n["col"] == 1:
            assert entree[i] == sortie[i] == n["value"]
        else:
            assert entree[i] == n["value"]
    total = svc.distribution(None, excl)
    # Unité : un enregistrement actif (part × pays) ; clientèles dessinées + reste = tous les enregistrements actifs
    shown = sum(n["value"] for n in sk["nodes"] if n["col"] == 2)
    assert shown == sum(n["value"] for n in sk["nodes"] if n["col"] == 0) == sum(n["value"] for n in sk["nodes"] if n["col"] == 1)
    assert shown + sk["rest"]["value"] == sum(c["n_shares"] for c in total["countries"])


def test_sankey_clientes_par_encours_decroissant(svc):
    """Les plus grosses clientèles d'abord (encours des parts enregistrées) ; les autres résumées à part."""
    sk = svc.distribution(None)["sankey"]
    assert sk["order"] == ["pays", "clients", "familles"]
    nodes = [n for n in sk["nodes"] if n["col"] == 1]
    assert 2 <= len(nodes) <= 20 and not any(n["other"] for n in nodes)
    assert [n["rank"] for n in nodes] == list(range(1, len(nodes) + 1))
    assert len([n for n in sk["nodes"] if n["col"] == 0]) <= 7
    assert [n["aum"] for n in nodes] == sorted((n["aum"] for n in nodes), reverse=True)
    assert {"nommé", "pool"} <= {n["kind"] for n in nodes}
    assert sk["rest"]["n_clients"] > 0 and sk["rest"]["value"] > 0
    assert sk["rest"]["aum"] >= 0
