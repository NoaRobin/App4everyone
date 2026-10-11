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
    r = D.resolve("Yoann Ignatiew", {"Claire Vasseur": 3, "Marc Aubry": 2})
    assert r["found"] is None


def test_zones():
    assert D.country_info("Italie")[2] == "Europe du Sud"
    assert D.country_info("Monaco")[2] == "Suisse & Monaco"
    assert D.country_info(None)[2] == P.NOT_SET


def test_configuration_par_variables(monkeypatch):
    monkeypatch.setenv("APP_DEMO_GERANTS", "Valor:Yoann Ignatiew;Taux:Emmanuel Petit:famille=fi")
    monkeypatch.setenv("APP_DEMO_COMMERCIAUX", "France:Fausto Trevisan:FR,MC;Europe du Sud:Alessio Coppola:IT,ES")
    c = D.config()
    assert [(g["label"], g["family"]) for g in c["gerants"]] == [("Valor", None), ("Taux", "fi")]
    assert c["commerciaux"][0] == {"theme": "France", "name": "Fausto Trevisan", "title": None, "countries": ["FR", "MC"]}
    assert D.slug("Europe du Sud") == "europe-du-sud"


def test_perimetres_par_defaut():
    c = D.config()
    assert [x["theme"] for x in c["commerciaux"]] == ["France", "Europe du Sud", "Europe du Nord"]
    assert c["gerants"][1]["family"] == "fi"


# ---------------------------------------------------------------- vues du passif (données fictives)
@pytest.fixture(scope="module")
def dp():
    mock = PassifMock(date(2026, 9, 30), {"Diversifié": ["FR0000000001"], "Obligations": ["FR0000000002"]})
    p = P.Passif(P.PandasReader(mock.table), {"FR0000000001": "PR1", "FR0000000002": "PR2"}, fund_names={"PR1": "Fonds Un", "PR2": "Fonds Deux"})
    return D.DemoPassif(p)


def test_territoire_par_pays(dp):
    """Un périmètre de ventes = les porteurs dont le pays du compte est dans le périmètre (tous canaux)."""
    v = dp.territory(["IT", "ES", "PT"])
    assert v["available"] and v["encours"] > 0
    assert {D.country_info(x)[1] for x in v["countries_raw"]} <= {"IT", "ES", "PT"}
    assert sum(c["encours"] for c in v["clients"]) == pytest.approx(v["encours"])
    for p, s in v["periods"].items():
        assert s["net"] == pytest.approx(s["subscriptions"] - s["redemptions"])
        assert sum(z["net"] for z in s["zones"]) == pytest.approx(s["net"])
        assert {z["iso"] for z in s["zones"]} <= {"IT", "ES", "PT", None}
    assert dp.territory(["JP"])["available"] is False


def test_banque_privee_rmm(dp):
    """Canal RMM : comptes tenus ou classés RMM (jamais « hors RMM ») ; revenus = encours × taux de la part."""
    v = dp.rmm_bank({"FR0000000001": 1.5, "FR0000000002": 0.5}, {"PR1"}, house_revenue=1e12)
    assert v["available"] and v["encours"] > 0
    assert not any("hors" in c.lower() for c in v["matched"]["classifications"])
    assert sum(x["encours"] for x in v["segments"]) == pytest.approx(v["encours"])
    assert sum(x["encours"] for x in v["split"]) == pytest.approx(v["encours"])
    exp = sum(x["encours"] * {"FR0000000001": 1.5, "FR0000000002": 0.5}.get(x["isin"], 0) / 100 for x in v["shares"])
    assert v["revenue"] == pytest.approx(exp, rel=1e-6)
    assert {"Fonds Rothschild Martin Maurel", "Autres fonds de la gamme"} >= {x["key"] for x in v["split"]}
    assert v["flows_available"] and v["periods"]["1A"]["net"] == pytest.approx(v["periods"]["1A"]["subscriptions"] - v["periods"]["1A"]["redemptions"])


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
