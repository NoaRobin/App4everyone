"""Courbe des encours par période (jour, semaine, mois, trimestre, année) — calculs clés sur données fictives."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from rco.data.mock import MockSource
from rco.domain.analytics import period_points
from rco.domain.model import build_model
from rco.service import Service


@pytest.fixture(scope="module")
def svc() -> Service:
    return Service(build_model(MockSource()))


def _series():
    i = pd.bdate_range("2025-12-24", "2026-03-06")
    aum = pd.Series(1000.0 + np.arange(len(i)) * 10.0, index=i)
    fc = pd.Series(np.arange(len(i)) * 2.0, index=i)
    return i, aum, fc


def test_dernier_point_de_chaque_periode():
    i, aum, fc = _series()
    m = period_points(aum, fc, "M", None, i[-1])
    assert [d.date().isoformat() for d in m["d"]] == ["2025-12-31", "2026-01-30", "2026-02-27", "2026-03-06"]
    assert [p.date().isoformat() for p in m["p"]] == ["2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01"]
    assert m["aum"].tolist() == [aum[d] for d in m["d"]]                     # jamais de moyenne
    w = period_points(aum, fc, "S", None, i[-1])
    assert all(p.weekday() == 0 for p in w["p"]) and all(d.weekday() == 4 for d in w["d"])
    q = period_points(aum, fc, "T", None, i[-1])
    assert [p.date().isoformat() for p in q["p"]] == ["2025-10-01", "2026-01-01"]
    j = period_points(aum, fc, "J", None, i[-1])
    assert len(j) == len(i)


def test_collecte_et_marche_se_somment_a_la_variation():
    i, aum, fc = _series()
    start = pd.Timestamp("2026-01-15")
    for freq in ("J", "S", "M", "T", "A"):
        df = period_points(aum, fc, freq, start, i[-1])
        assert np.allclose(df["delta"], df["flows"] + df["market"])
        # la somme des collectes de la fenêtre = collecte entre le point qui la précède et sa fin
        full = period_points(aum, fc, freq, None, i[-1])
        k = full.index[full["d"] >= start][0]
        before = full["d"].iloc[k - 1] if k > 0 else None
        if before is not None:
            assert df["flows"].sum() == pytest.approx(fc[i[-1]] - fc[before])


def test_premier_point_sans_variation_et_fenetre():
    i, aum, fc = _series()
    df = period_points(aum, fc, "J", None, i[-1])
    assert np.isnan(df.at[0, "delta"]) and np.isnan(df.at[0, "flows"])
    df = period_points(aum, fc, "J", pd.Timestamp("2026-02-02"), pd.Timestamp("2026-02-06"))
    assert df["d"].min() == pd.Timestamp("2026-02-02") and df["d"].max() == pd.Timestamp("2026-02-06")
    assert df.at[0, "delta"] == pytest.approx(10.0)                            # variation par rapport à la veille, hors fenêtre


def test_trou_d_encours_et_collecte_manquante():
    i, aum, fc = _series()
    aum = aum.copy(); aum.iloc[3:6] = np.nan                                    # trous d'encours : dates ignorées
    fc = fc.drop(i[10])                                                         # date sans collecte : dernière valeur connue
    df = period_points(aum, fc, "J", None, i[-1])
    assert len(df) == len(i) - 3 and not df["aum"].isna().any()
    assert np.isfinite(df["flows"].iloc[1:]).all()
    with pytest.raises(ValueError):
        period_points(aum, fc, "X", None, i[-1])
    assert period_points(aum.iloc[0:0], fc, "M", None, i[-1]).empty


def test_api_maison_familles_somment_au_total(svc):
    for freq in ("J", "S", "M", "T", "A"):
        r = svc.aum_series(None, freq, "1A")
        pts = r["points"]
        assert pts and r["summary"]["n"] == len(pts)
        tot = np.array([p["aum"] for p in pts])
        fam = np.sum([f["values"] for f in r["families"]], axis=0)
        assert np.allclose(fam, tot, rtol=1e-6, atol=1.0)
        assert r["summary"]["delta"] == pytest.approx(pts[-1]["aum"] - pts[0]["aum"])
        inner = pts[1:]
        assert r["summary"]["flows"] == pytest.approx(sum(p["flows"] for p in inner))
    d = svc.aum_series(None, "J", "1M")["points"]
    m = svc.aum_series(None, "M", "1A")["points"]
    assert d[-1]["aum"] == pytest.approx(m[-1]["aum"])                         # même dernier point quelle que soit la granularité
    assert len(d) > len(svc.aum_series(None, "S", "1M")["points"])


def test_api_fonds_et_famille(svc):
    r = svc.aum_series(None, "M", "1A")
    key = r["families"][0]["key"]
    f = svc.aum_series(None, "M", "1A", family=key)
    assert f["families"] == [] and f["scope"]["key"] == key
    assert [p["aum"] for p in f["points"]] == pytest.approx(r["families"][0]["values"], rel=1e-6, abs=1.0)
    fid = next(iter(svc.m.fund_aum.columns))
    one = svc.aum_series(None, "S", "3M", fund=fid)
    assert one["scope"]["kind"] == "fund" and one["scope"]["id"] == fid
    with pytest.raises(KeyError):
        svc.aum_series(None, "M", "1A", fund="__absent__")
    with pytest.raises(ValueError):
        svc.aum_series(None, "Z", "1A")
    with pytest.raises(ValueError):
        svc.aum_series(None, "M", "2A")


def test_route_http():
    from fastapi.testclient import TestClient
    from rco import api
    c = TestClient(api.app)
    ok = c.get("/api/encours/series", params={"freq": "S", "range": "3M"})
    if ok.status_code == 503:
        pytest.skip("service en cours de chargement")
    assert ok.status_code == 200 and ok.json()["freq"] == "S"
    assert c.get("/api/encours/series", params={"freq": "Z"}).status_code == 400
    assert c.get("/api/encours/series", params={"fonds": "__absent__"}).status_code == 404
