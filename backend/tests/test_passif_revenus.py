"""Passif (agrégats anonymes), revenus estimés et comparateur — données fictives."""
from __future__ import annotations

import json
import re

import numpy as np
import pandas as pd
import pytest

from helpers import aum_row, build, product, share
from rco.data.mock import AS_OF, MockSource
from rco.data.passif_mock import CPT_COLS, POS_COLS, TRX_COLS, PassifMock
from rco.data.sql_guard import assert_read_only
from rco.domain import passif as P
from rco.domain.model import build_model
from rco.domain.revenue import revenue_view
from rco.service import Service

D = "2026-01-02"


@pytest.fixture(scope="module")
def mock():
    return PassifMock(AS_OF, {"Actions": ["FR0000000001", "FR0000000002"], "Obligations": ["FR0000000003"]})


@pytest.fixture(scope="module")
def data(mock):
    return P.Passif(P.PandasReader(mock.table), {"FR0000000001": "PR1"}).compute()


def test_schema_exact_des_tables_sources(mock):
    assert list(mock.table("compte").columns) == CPT_COLS == [f"_c{i}" for i in range(11)]
    assert list(mock.table("position").columns) == POS_COLS and len(POS_COLS) == 21
    assert list(mock.table("transaction").columns) == TRX_COLS and len(TRX_COLS) == 28
    for t in ("compte", "position", "transaction"):        # tout en texte, comme les tables sources (varchar)
        df = mock.table(t)
        assert all(df[c].dropna().map(lambda v: isinstance(v, str)).all() for c in df.columns)


def test_reconnaissance_des_colonnes(mock):
    m = P.detect_mapping(P.PandasReader(mock.table), "transaction")["fields"]
    assert {k: v["col"] for k, v in m.items() if k in ("sens", "statut", "desk", "classe_actif", "devise", "isin", "compte")} == \
        {"sens": "_c5", "statut": "_c6", "desk": "_c9", "classe_actif": "_c8", "devise": "_c10", "isin": "_c7", "compte": "_c1"}
    assert m["montant"]["col"] == "_c13" and m["date"]["col"] == "_c2"


def test_reconnaissance_resiste_a_l_ordre_des_colonnes(mock):
    """Colonnes permutées : le rôle suit les valeurs, pas la position."""
    df = mock.table("position")
    perm = {f"_c{i}": f"_c{(i * 5) % 21}" for i in range(21)}
    shuffled = df.rename(columns=perm)[POS_COLS]
    r = P.PandasReader(lambda t: shuffled if t == "position" else mock.table(t))
    m = P.detect_mapping(r, "position")["fields"]
    assert m["desk"]["col"] == perm["_c6"] and m["classe_actif"]["col"] == perm["_c5"] and m["compte"]["col"] == perm["_c1"]


def test_correspondance_imposee(mock, monkeypatch):
    monkeypatch.setenv("APP_PASSIF_MAP_POSITION", "montant=_c8, date=_c14")
    m = P.detect_mapping(P.PandasReader(mock.table), "position")["fields"]
    assert m["montant"] == {"col": "_c8", "confidence": 1.0, "how": "configuré"} and m["date"]["col"] == "_c14"


def _walk(o, path=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from _walk(v, f"{path}.{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from _walk(v, f"{path}[{i}]")
    else:
        yield path, o


def test_aucun_montant_ni_effectif_exact(data):
    """Seules des parts (0–100 %), des tranches et des libellés sortent : jamais un montant ni un nombre exact."""
    for path, v in _walk(data):
        if isinstance(v, bool) or v is None:
            continue
        if isinstance(v, (int, float)):
            last = path.rsplit(".", 1)[-1]
            assert last in ("pct", "residual_pct", "late_pct", "period_late_pct", "rank", "confidence"), path
            if last != "rank":
                assert 0 <= v <= 100, path
    text = json.dumps(data, ensure_ascii=False)
    assert "CPT-" not in text and "CLI-" not in text and "Compte synthétique" not in text and "TRX-" not in text


def test_seuil_de_cinq(mock):
    g = pd.DataFrame({"classe_actif": ["Equities", "Equities", "Diversified"], "desk": ["Valor", "OPAL", "RMM"], "devise": ["EUR"] * 3,
                      "n": [4, 30, 200], "amt": [5.0, 30.0, 65.0], "amt_abs": [5.0, 30.0, 65.0]})
    v = P.positions_view(g, None, amount=True)
    assert [x["desk"] for x in v["groups"]] == ["RMM", "OPAL"]                  # groupe de 4 masqué
    assert v["residual_pct"] == pytest.approx(5.0)                               # mais compté dans le total
    assert {x["tranche"]["label"] for x in v["groups"]} == {"20 à 99", "100 à 499"}
    assert P.tranche(4) is None and P.tranche(5)["label"] == "5 à 19" and P.tranche(1234)["label"] == "1 000 et plus"


def test_transactions_jamais_nettes(data):
    t = data["transactions"]
    assert t["available"] and t["measure"] == "part du volume absolu"
    for d in t["days"]:
        labels = {x["sens"] for x in d["sens"]}
        assert labels <= {"Souscription", "Rachat", "Transfert entrant", "Transfert sortant", "Non renseigné"}
        assert sum(x["pct"] for x in d["sens"]) <= 100.3                         # parts d'un même volume absolu
        assert all("net" not in k for x in d["sens"] for k in x)


def test_positions_par_fonds_via_isin(data):
    assert "PR1" in data["funds"] and 0 < data["funds"]["PR1"]["pct"] <= 100


def test_requetes_fabric_lecture_seule():
    """Les requêtes du lecteur Fabric sont des SELECT agrégés qui passent le garde-fou ; identifiants validés."""
    seen = []

    class Fake:
        def query(self, sql, params=(), **kw):
            seen.append(assert_read_only(sql))
            n_cols = 28 if "transaction" in sql else 21 if "position" in sql else 11
            if "COUNT(DISTINCT" in sql and " AS d0" in sql:
                return pd.DataFrame([{"n": 10, **{f"f{i}": 10 for i in range(n_cols)}, **{f"d{i}": 3 for i in range(n_cols)}}])
            if "TOP 2000" in sql:
                return pd.DataFrame({f"_c{i}": ["x"] * 3 for i in range(n_cols)})
            if "TOP 60" in sql:
                return pd.DataFrame({"v": ["Souscription", "Rachat"], "n": [5, 5]})
            if "hit" in sql:
                return pd.DataFrame([{"n": 10, "hit": 0}])
            return pd.DataFrame({"n": []})
    r = P.SqlReader(Fake(), {"compte": "compte", "position": "position", "transaction": "transaction"})
    P.detect_mapping(r, "transaction")
    r.group("position", {"desk": "_c6"}, amount="_c10", join_compte="_c1", compte_keys={"teneur": "_c0"})
    assert seen and all(re.match(r"^\s*SELECT\b", s) for s in seen)
    assert any("GROUP BY" in s and "TRY_CAST" in s for s in seen)
    with pytest.raises(ValueError):
        P.SqlReader(Fake(), {"position": "position]; DROP TABLE x --"}).group("position", {"desk": "_c6"})
    with pytest.raises(ValueError):
        r.group("position", {"desk": "_c6]"})


def test_tables_absentes_passif_indisponible():
    class Broken:
        kind = "fabric"

        def profile(self, name):
            raise RuntimeError("table inconnue")
    d = P.Passif(Broken()).get()
    assert d["available"] is False and "reason" in d


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
