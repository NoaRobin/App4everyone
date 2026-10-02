"""Revenus estimés et comparateur — données fictives (le passif est testé dans test_passif.py)."""
from __future__ import annotations


import pytest

from helpers import aum_row, build, product, share
from rco.data.mock import AS_OF, MockSource
from rco.domain.model import build_model
from rco.domain.revenue import revenue_view
from rco.service import Service

D = "2026-01-02"


# ---------------------------------------------------------------- revenus estimés
def test_revenu_encours_par_taux():
    rows = [aum_row("F1", "P1", D, 1000, 100, pi_part="S1"), aum_row("F1", "P2", D, 1000, 100, pi_part="S2"),
            aum_row("F2", "P3", D, 1000, 100, pi_part="S3")]
    m = build(rows, [product("PR1", "Un", Max_management_fee_PerCent=2.0), product("PR2", "Deux")],
              [share("S1", "PR1", "FR1", "Un C", Actual_Financial_Management_Fees=1.5),
               share("S2", "PR1", "FR2", "Un I", Actual_Financial_Management_Fees=None),       # taux du fonds à défaut
               share("S3", "PR2", "FR3", "Deux C")])                                           # aucun taux : non valorisé
    v = revenue_view(m, m.dates[-1], {})
    f = {x["id"]: x for x in v["funds"]}
    assert f["PR1"]["revenue"] == pytest.approx(100000 * 0.015 + 100000 * 0.02)
    assert "PR2" not in f and v["aum_without_rate"] == pytest.approx(100000)
    assert v["coverage"] == pytest.approx(2 / 3)


def test_taux_en_fraction_detecte():
    rows = [aum_row("F1", f"P{i}", D, 1000, 100, pi_part=f"S{i}") for i in range(4)]
    m = build(rows, [product("PR1", "Un")], [share(f"S{i}", "PR1", f"FR{i}", "Un", Actual_Financial_Management_Fees=0.012) for i in range(4)])
    v = revenue_view(m, m.dates[-1], {})
    assert v["rate"] == pytest.approx(1.2)


def test_revenus_et_comparateur_sur_le_fictif():
    s = Service(build_model(MockSource()))
    r = s.revenue(None)
    assert r["total"] > 0 and r["funds"][0]["revenue"] >= r["funds"][-1]["revenue"]
    assert sum(g["revenue"] for g in r["families"]) == pytest.approx(r["total"])
    ids = tuple(x["id"] for x in r["funds"][:3])
    c = s.compare(ids, "3A", None)
    assert [x["id"] for x in c["funds"]] == list(ids)
    for x in c["funds"]:
        assert x["series"][0]["d"] == c["start"] and x["series"][0]["v"] == pytest.approx(100)
        ds = [p["d"] for p in x["series"]]
        assert ds == sorted(set(ds)) and ds[-1] <= c["date"]
        assert x["ind"]["vol"] is None or x["ind"]["vol"] > 0
        assert x["ind"]["mdd"] is None or x["ind"]["mdd"] <= 0
