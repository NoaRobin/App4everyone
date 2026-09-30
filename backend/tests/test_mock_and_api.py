"""Le jeu fictif respecte exactement le schéma, et l'API répond sur tous ses écrans."""
import warnings

import pytest

from rco.data import schema as S
from rco.data.mock import MockLakehouse

warnings.filterwarnings("ignore")


@pytest.fixture(scope="module")
def lake():
    return MockLakehouse()


def test_schema_exact(lake):
    for table, fn in [(S.AUM, lake.aum), (S.SHARE, lake.shares_table), (S.PRODUCT, lake.products_table),
                      (S.COUNTRY, lake.countries_table), (S.HOLDINGS, lake.holdings_table), (S.DQ, lake.dq_table),
                      (S.CALENDAR, lake.calendar_table)]:
        assert list(fn().columns) == S.columns(table), table


def test_isin_fictifs(lake):
    isins = lake.shares_table()["ISIN_Code"]
    assert isins.str.contains("DEMO").all()


def test_totaux_jump_coherents(lake):
    a = lake.aum()
    g = a.groupby(["ID_JUMP_FONDS", "DATE_VL"])
    diff = (g["ACTIF_NET_PART_EURO"].sum() - g["ACTIF_NET_TOTAL_EURO"].first()).abs()
    assert (diff < 1).all()


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from rco.api import app
    return TestClient(app)


@pytest.mark.parametrize("url", ["/api/meta", "/api/overview", "/api/city", "/api/search-index", "/api/funds",
                                 "/api/funds?family=fi", "/api/breakdown/family", "/api/breakdown/investor",
                                 "/api/holdings", "/api/distribution", "/api/countries/France", "/api/risk", "/api/controls"])
def test_endpoints(client, url):
    r = client.get(url)
    assert r.status_code == 200, r.text


def test_fiche_fonds_et_part(client):
    funds = client.get("/api/funds").json()["funds"]
    f = client.get(f"/api/funds/{funds[0]['id']}").json()
    assert f["aum"] == pytest.approx(funds[0]["aum"])
    assert abs(sum(s["aum"] or 0 for s in f["shares"]) - f["aum"]) < 1
    s = client.get(f"/api/shares/{f['shares'][0]['id']}").json()
    assert s["fund"]["id"] == f["id"]


def test_total_maison_egal_somme_des_familles(client):
    o = client.get("/api/overview").json()
    assert sum(x["aum"] for x in o["families"]) == pytest.approx(o["aum"])


def test_introuvable(client):
    assert client.get("/api/funds/inexistant").status_code == 404
    assert client.get("/api/breakdown/inconnu").status_code == 404
