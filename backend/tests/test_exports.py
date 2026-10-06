"""Extractions de l'onglet Export : une ligne par enregistrement, cohérentes avec les vues de l'application."""
import pytest

from rco import exports as X
from rco.data.mock import MockSource
from rco.domain.model import build_model
from rco.service import Service


@pytest.fixture(scope="module")
def svc():
    return Service(build_model(MockSource(), stale_days=12, history_years=4, is_mock=True))


def _col(t, name):
    i = t["columns"].index(name)
    return [r[i] for r in t["rows"]]


@pytest.mark.parametrize("freq", ["M", "T", "A"])
def test_maison_identique_a_la_courbe_des_encours(svc, freq):
    a = svc.aum_series(None, freq, "1A")
    t = X.encours(svc, None, "maison", freq, a["start"], None)
    assert t["n"] == len(a["points"])
    assert _col(t, "encours") == pytest.approx([p["aum"] for p in a["points"]])
    fl = [p["flows"] for p in a["points"]]
    assert [x for x in _col(t, "collecte_estimee") if x is not None] == pytest.approx([x for x in fl if x is not None], rel=1e-6)


@pytest.mark.parametrize("level", ["famille", "gamme", "classe", "fonds", "part"])
def test_niveaux_se_somment_au_total(svc, level):
    tot = X.encours(svc, None, "maison", "M", "2026-01-01", None)
    t = X.encours(svc, None, level, "M", "2026-01-01", None)
    by_date: dict = {}
    for d, v in zip(_col(t, "date"), _col(t, "encours")):
        by_date[d] = by_date.get(d, 0.0) + v
    for d, v in zip(_col(tot, "date"), _col(tot, "encours")):
        assert by_date[d] == pytest.approx(v, rel=1e-6)
    assert len(t["columns"]) == len(set(t["columns"])) and all(len(r) == len(t["columns"]) for r in t["rows"])


def test_filtre_famille_et_fonds(svc):
    t = X.encours(svc, None, "fonds", "M", "2026-01-01", None, families=["fi"])
    assert t["n"] > 0 and set(_col(t, "famille")) == {"Fixed Income"}
    one = _col(t, "id_fonds")[0]
    u = X.encours(svc, None, "fonds", "A", None, None, funds=[one])
    assert set(_col(u, "id_fonds")) == {one}


def test_trop_de_lignes_refuse_avec_le_compte(svc, monkeypatch):
    monkeypatch.setattr(X, "MAX_ROWS", 100)
    t = X.encours(svc, None, "part", "J", None, None)
    assert t["rows"] == [] and t["too_many"] > 100


def test_parametres_invalides(svc):
    with pytest.raises(ValueError):
        X.encours(svc, None, "planete", "M")
    with pytest.raises(ValueError):
        X.encours(svc, None, "fonds", "Z")
    with pytest.raises(ValueError):
        X.encours(svc, None, "fonds", "M", "pas-une-date")


def test_parts_enregistrements_inventaires(svc):
    p = X.parts(svc, None)
    assert p["n"] == len(svc.m.shares) or p["n"] > 0
    assert len(set(_col(p, "id_part"))) == p["n"]
    e = X.enregistrements(svc, None)
    assert e["n"] == int(svc._registrations["active"].sum())
    assert X.enregistrements(svc, None, actifs=False)["n"] == len(svc._registrations)
    assert X.enregistrements(svc, None, exclude_rmm=True)["n"] < e["n"]
    i = X.inventaires(svc, None)
    assert i["n"] > 0 and all(len(r) == len(i["columns"]) for r in i["rows"][:50])
