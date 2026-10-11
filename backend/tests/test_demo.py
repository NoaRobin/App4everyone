"""Page Démo : retrouver les noms dans la donnée, vues commerciaux et banque privée, requêtes paramétrées."""
from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from rco.data.passif_mock import PassifMock
from rco.domain import demo as D
from rco.domain import passif as P
from rco.data.fabric import assert_read_only


# ---------------------------------------------------------------- noms
def test_nom_identique_accents_et_casse_ignores():
    r = D.resolve("alain massiera", {"Alain MASSIERA": 10, "Alain Martin": 5})
    assert r["found"] == "Alain MASSIERA" and r["exact"] and not r["ambiguous"]


def test_nom_a_une_lettre_pres_et_variantes_signalees():
    r = D.resolve("Alecio", {"Alessio Rossi": 3.0, "Quentin Dupont": 9.0, "Fausto Bianchi": 4.0})
    assert r["found"] == "Alessio Rossi" and not r["exact"]
    assert D.resolve("Fosto", {"Fausto Bianchi": 1.0})["found"] == "Fausto Bianchi"


def test_homonymes_departages_par_le_poids_et_signales():
    r = D.resolve("Quentin", {"Quentin Martin": 1.0, "Quentin Durand": 5.0})
    assert r["found"] == "Quentin Durand" and r["ambiguous"] and r["alternatives"][0]["name"] == "Quentin Martin"


def test_nom_absent_aucune_correspondance_inventee():
    r = D.resolve("Yoan Ignatiew", {"Claire Vasseur": 3, "Marc Aubry": 2})
    assert r["found"] is None


def test_zones():
    assert D.country_info("Italie")[2] == "Europe du Sud"
    assert D.country_info("Monaco")[2] == "Suisse & Monaco"
    assert D.country_info(None)[2] == P.NOT_SET


def test_configuration_par_variables(monkeypatch):
    monkeypatch.setenv("APP_DEMO_GERANTS", "Valor:Yoan Ignatiew;Taux:Emmanuel Petit")
    monkeypatch.setenv("APP_DEMO_COMMERCIAUX", "Fausto, Alecio")
    c = D.config()
    assert [g["label"] for g in c["gerants"]] == ["Valor", "Taux"] and c["commerciaux"] == ["Fausto", "Alecio"]


# ---------------------------------------------------------------- vues du passif (données fictives)
@pytest.fixture(scope="module")
def dp():
    mock = PassifMock(date(2026, 9, 30), {"Diversifié": ["FR0000000001"], "Obligations": ["FR0000000002"]})
    p = P.Passif(P.PandasReader(mock.table), {"FR0000000001": "PR1", "FR0000000002": "PR2"}, fund_names={"PR1": "Fonds Un", "PR2": "Fonds Deux"})
    return D.DemoPassif(p)


def test_commerciaux_lus_dans_le_passif(dp):
    names = dp.commercials()
    assert {"Fausto", "Alecio", "Quentin", "Alain Massiera"} <= set(names)


def test_vue_commercial_sommes_coherentes(dp):
    v = dp.commercial("Fausto")
    assert v["available"] and v["nominatif"] and v["encours"] > 0
    assert sum(c["encours"] for c in v["clients"]) == pytest.approx(v["encours"])
    for c in v["clients"]:
        assert c["encours"] == pytest.approx(sum(f["encours"] for f in c["funds"]))
    for p, s in v["periods"].items():
        assert s["net"] == pytest.approx(s["subscriptions"] - s["redemptions"])
        assert sum(z["net"] for z in s["zones"]) == pytest.approx(s["net"])
    assert v["periods"]["1M"]["subscriptions"] <= v["periods"]["1A"]["subscriptions"] + 1e-6
    assert len(v["monthly"]) == 13


def test_banque_privee(dp):
    v = dp.private_bank("Alain Massiera")
    assert v["available"] and v["encours"] > 0 and v["flows_available"]
    assert sum(c["encours"] for c in v["classes"]) == pytest.approx(v["encours"])
    assert all(r["sens"] in P.ENTREES | P.SORTIES for r in v["latest"])
    seg = dp.private_bank(None, "segment")
    assert seg["encours"] > 0 and all(s["segment"] == P.SEGMENTS["prive"] for s in seg["segments"])


def test_requetes_demo_parametrees():
    """Le nom du commercial passe en paramètre, jamais dans le texte de la requête ; lecture seule."""
    seen: list[tuple[str, list]] = []

    class Fake:
        def query(self, sql, params=(), **kw):
            seen.append((assert_read_only(sql), list(params)))
            if "TOP 0 *" in sql:
                return pd.DataFrame(columns=[f"_c{i}" for i in range(28 if "transaction" in sql else 21)])
            return pd.DataFrame()
    r = P.SqlReader(Fake(), P.table_names())
    mt = P.resolve_mapping(r.columns("transaction"), "transaction")
    evil = "Fausto'; DROP TABLE x --"
    r.group("transaction", mt, {"d": ("month", "date_centralisation")}, {"v": ("sum", "montant_eur")}, [("date_ge", "date_centralisation", "2026-01-01")],
            inn={"commercial": [evil]})
    r.rows("transaction", mt, D.TRX_FIELDS, [("date_ge", "date_centralisation", "2026-01-01")], inn={"commercial": [evil]}, order="date_centralisation", cap=10 ** 9)
    for sql, params in seen[-2:]:
        assert params == [evil] and "DROP" not in sql
    assert "TOP 20000 " in seen[-1][0] and "CONVERT(VARCHAR(7)" in seen[-2][0]
