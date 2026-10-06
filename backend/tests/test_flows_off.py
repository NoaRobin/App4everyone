"""Collecte JUMP neutralisée (Mediobanca R-co Valor) : encours conservés, collecte et effet marché non attribués."""
import pandas as pd
import pytest

from rco import exports as X
from rco.data.mock import MockSource
from rco.domain import model as M
from rco.domain.model import build_model
from rco.service import Service


def test_regle_par_defaut_mediobanca_r_co_valor():
    link = pd.DataFrame({"ID_JUMP_PART": ["P1", "P2", "P3"], "NOM_PART": ["R-co Valor C EUR", "MEDIOBANCA R-CO VALOR", "Autre fonds"],
                         "pi_shareid": [None, None, None], "fund_id": ["F1", "F1", "F2"]})
    shares = pd.DataFrame({"pi_shareid": [], "Share_Name": []})
    funds = pd.DataFrame({"name": ["R-co Valor", "Autre fonds"], "Product_Name": ["R-co Valor", "Autre fonds"]}, index=["F1", "F2"])
    out = M.flows_disabled(link, shares, funds, M.FLOWS_DISABLED_DEFAULT)
    assert out["parts"] == ["P2"] and out["funds"] == ["F1"]          # seule la part Mediobanca, pas tout R-co Valor
    funds2 = funds.assign(name=["Mediobanca R-co Valor", "Autre fonds"])
    assert M.flows_disabled(link, shares, funds2, M.FLOWS_DISABLED_DEFAULT)["parts"] == ["P1", "P2"]   # un fonds entier
    assert M.flows_disabled(link, shares, funds, "")["parts"] == []


@pytest.fixture(scope="module")
def svc():
    mp = pytest.MonkeyPatch()
    mp.setenv("APP_FLOWS_DISABLED", "europe valeur")
    s = Service(build_model(MockSource(), stale_days=12, history_years=4, is_mock=True))
    mp.undo()
    return s


def test_collecte_neutralisee_encours_conserve(svc):
    f = svc.m.flows_off["funds"][0]
    assert svc.m.fund_flow_cum[f].abs().max() == 0
    assert svc.m.fund_aum[f].dropna().iloc[-1] > 0
    d = svc.fund(f, None)
    assert d["flows_off"] and d["var"]["YTD"]["flows"] is None and d["var"]["YTD"]["market"] is None and d["var"]["YTD"]["delta"] is not None
    row = next(r for r in svc.funds(None, {})["funds"] if r["id"] == f)
    assert row["flows_off"] and row["flows_YTD"] is None
    assert f not in {x["id"] for x in svc.overview(None)["top_inflows"] + svc.overview(None)["top_outflows"]}
    assert any(c["key"] == "flows_off" and c["count"] == 1 for c in svc.controls(None)["controls"])
    t = X.encours(svc, None, "fonds", "M", "2026-01-01", None, funds=[f])
    i = t["columns"].index("collecte_estimee")
    assert t["n"] > 0 and all(r[i] is None for r in t["rows"])
