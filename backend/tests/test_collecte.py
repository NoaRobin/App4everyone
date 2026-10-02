"""Collecte nette estimée : cas réels qui donnaient un signe faux (données fictives calculables à la main)."""
from __future__ import annotations

import pandas as pd
import pytest

from helpers import aum_row, build, product, share

DAYS = pd.bdate_range("2025-01-02", "2025-12-31")


def model(rows):
    return build(rows, [product("PR1", "Fonds Un")], [share("S1", "PR1", "FR0001", "Un C")])


def flows(m, a=None, b=None):
    c = m.fund_flow_cum["PR1"]
    return float(c.loc[b or c.index[-1]] - (c.loc[a] if a else 0.0))


def row(d, parts, vl, **kw):
    return aum_row("F1", "P1", d, parts, vl, pi_part="S1", **kw)


def test_vl_mensuelle_parts_constantes_collecte_nulle():
    """VL mensuelle (écart > délai de péremption) : aucune sortie fictive entre deux VL."""
    month_ends = DAYS.to_series().groupby(DAYS.month).max()
    rows = [row(d, 1000, 100 + i) for i, d in enumerate(month_ends)]
    m = model(rows)
    assert flows(m) == pytest.approx(0.0, abs=1e-6)
    mid = pd.Timestamp("2025-06-16")
    assert m.fund_aum.at[mid, "PR1"] == pytest.approx(1000 * 104)   # VL de fin mai reportée


def test_trou_de_vl_puis_retour_avec_souscription():
    rows = [row(d, 1000, 100) for d in DAYS[:40]] + [row(d, 1200, 100) for d in DAYS[80:]]
    m = model(rows)
    assert flows(m) == pytest.approx(200 * 100)                       # seule la souscription compte


@pytest.mark.parametrize("coef", [0.0, None, 1.0])
def test_coefficient_hors_evenement_nul_ou_vide(coef):
    rows = [row(d, 1000, 100 + i * 0.1, coef=coef) for i, d in enumerate(DAYS[:60])]
    assert flows(model(rows)) == pytest.approx(0.0, abs=1e-6)


def test_coefficient_cumule_repete():
    """Division par 10 au jour 30, coefficient 10 répété ensuite (convention « cumulée ») : collecte nulle."""
    rows = [row(d, 1000 if i < 30 else 10000, 100 if i < 30 else 10, coef=1.0 if i < 30 else 10.0) for i, d in enumerate(DAYS[:60])]
    assert flows(model(rows)) == pytest.approx(0.0, abs=1e-6)


@pytest.mark.parametrize("c", [10.0, 0.1])
def test_division_declaree_dans_un_sens_ou_dans_l_autre(c):
    rows = [row(d, 1000 if i < 30 else 10000, 100 if i < 30 else 10, coef=c if i == 30 else 1.0) for i, d in enumerate(DAYS[:60])]
    assert flows(model(rows)) == pytest.approx(0.0, abs=1e-6)


def test_division_non_declaree():
    rows = [row(d, 1000 if i < 30 else 5000, 100 if i < 30 else 20) for i, d in enumerate(DAYS[:60])]
    assert flows(model(rows)) == pytest.approx(0.0, abs=1e-6)


def test_rachat_total_parts_nulles():
    rows = [row(d, 1000 if i < 30 else 0, 100) for i, d in enumerate(DAYS[:40])]
    rows = [{**r, "ACTIF_NET_PART_EURO": 0.0} if r["NOMBRE_PARTS"] == 0 else r for r in rows]
    assert flows(model(rows)) == pytest.approx(-1000 * 100)


def test_parts_nulles_erronees_un_jour():
    rows = [row(d, 1000, 100) for d in DAYS[:40]]
    rows[20] = {**rows[20], "NOMBRE_PARTS": 0}                         # actif net renseigné : saisie erronée
    assert flows(model(rows)) == pytest.approx(0.0, abs=1e-6)


def test_souscriptions_reelles_positives():
    rows = [row(d, 1000 + 10 * i, 100 * (1 + 0.001 * i)) for i, d in enumerate(DAYS[:60])]
    f = flows(model(rows))
    expected = sum(10 * 100 * (1 + 0.001 * i) for i in range(1, 60))
    assert f == pytest.approx(expected, rel=1e-9) and f > 0


def test_disparition_definitive_solde_l_encours():
    rows = [row(d, 1000, 100) for d in DAYS[:40]]
    rows += [aum_row("F2", "P2", d, 10, 10) for d in DAYS]             # l'historique continue avec un autre fonds
    m = model(rows)
    assert flows(m) == pytest.approx(-1000 * 100)                     # plus de VL : rachat de l'encours restant
