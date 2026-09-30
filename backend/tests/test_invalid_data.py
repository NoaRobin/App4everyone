"""Régressions sur données SQL réelles-type : Decimal, VL nulle, indice nul, NaN, inf (données fictives uniquement)."""
import math
import warnings
from decimal import Decimal
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from rco.domain import analytics as A
from rco.domain import holdings as H

from sqlsource import DecimalSource


def _daily(values, start="2023-01-02"):
    return pd.Series(values, index=pd.bdate_range(start, periods=len(values)), dtype="float64")


def _yearly_index(v_prev_year_end, v_cur):
    """Deux années : fin 2024 = v_prev_year_end, fin 2025 = v_cur (quelques points par année)."""
    idx = pd.to_datetime(["2024-06-28", "2024-12-31", "2025-06-30", "2025-12-31"])
    return pd.Series([100.0, v_prev_year_end, (v_prev_year_end or 0) + 1, v_cur], index=idx, dtype="float64")


END = pd.Timestamp("2025-12-31")


# ---------------------------------------------------------------- calendar_years (ZeroDivisionError d'origine)
def test_calendar_years_v0_nul_ne_divise_pas():
    # Reproduit « rec = {"fund": v1 / v0 - 1} → ZeroDivisionError: float division by zero »
    s = _yearly_index(0.0, 120.0)
    out = A.calendar_years(s, None, END)
    y2025 = next(r for r in out if r["year"] == 2025)
    assert y2025["fund"] is None
    assert next(r for r in out if r["year"] == 2024)["fund"] == pytest.approx(0.0 / 100.0 - 1)


@pytest.mark.parametrize("v0", [None, float("nan"), Decimal("NaN")])
def test_calendar_years_v0_absent(v0):
    idx = pd.to_datetime(["2024-12-31", "2025-06-30", "2025-12-31"])
    s = pd.Series([v0, 105.0, 110.0], index=idx, dtype=object)
    out = A.calendar_years(s, None, END)
    # base 2024 absente : pas d'année 2024 ; 2025 part de la première valeur valide (formule inchangée)
    assert [r["year"] for r in out] == [2025]
    assert out[0]["fund"] == pytest.approx(110.0 / 105.0 - 1)


@pytest.mark.parametrize("v0", [0, 0.0, Decimal("0")])
def test_calendar_years_v0_zero(v0):
    idx = pd.to_datetime(["2024-12-31", "2025-06-30", "2025-12-31"])
    s = pd.Series([v0, 105.0, 110.0], index=idx, dtype=object)
    out = A.calendar_years(s, None, END)
    assert [r["year"] for r in out] == [2024, 2025]
    assert all(r["fund"] is None for r in out)   # base nulle : performance indisponible, jamais divisée par 1


def test_calendar_years_serie_valide_inchangee():
    s = _yearly_index(110.0, 121.0)
    out = A.calendar_years(s, s * 2, END)
    y = {r["year"]: r for r in out}
    assert y[2024]["fund"] == pytest.approx(110.0 / 100.0 - 1) and y[2024]["partial"]
    assert y[2025]["fund"] == pytest.approx(121.0 / 110.0 - 1) and y[2025]["ytd"]
    assert y[2025]["bench"] == pytest.approx(242.0 / 220.0 - 1)


def test_calendar_years_benchmark_nul_fonds_valide():
    s = _yearly_index(110.0, 121.0)
    bench = pd.Series([0.0, 0.0, 50.0, 55.0], index=s.index)
    out = A.calendar_years(s, bench, END)
    y = {r["year"]: r for r in out}
    assert y[2025]["fund"] == pytest.approx(121.0 / 110.0 - 1)   # le fonds reste calculé
    assert y[2025]["bench"] is None and y[2024]["bench"] is None  # base de l'indice nulle → indisponible


# ---------------------------------------------------------------- indice de performance (cumprod)
def _nav(vl, bench=None, div=None, coef=None):
    n = len(vl)
    return pd.DataFrame({
        "VL_UNITAIRE": pd.Series(vl, dtype=object), "DIVIDEND_AMOUNT": pd.Series(div or [None] * n, dtype=object),
        "COEFFICIENT_OST": pd.Series(coef or [None] * n, dtype=object), "VL_BENCH": pd.Series(bench or [None] * n, dtype=object),
    }).set_index(pd.bdate_range("2025-01-02", periods=n))


def test_indice_valide_identique_a_la_formule():
    vl = [100.0, 101.0, 99.5, 102.0, 103.5]
    idx = A.adjusted_index(_nav(vl))
    expected = [100.0] + [100 * vl[i] / vl[0] for i in range(1, len(vl))]
    assert idx.tolist() == pytest.approx(expected)


def test_indice_decimal_identique_au_float():
    vl = [100.0, 101.0, 99.5, 102.0]
    a = A.adjusted_index(_nav(vl))
    b = A.adjusted_index(_nav([Decimal(str(v)) for v in vl]))
    assert a.tolist() == b.tolist()


def test_indice_interrompu_par_vl_nulle_sans_overflow(caplog):
    # Reproduit « overflow encountered in accumulate » (VL nulle → rapport infini → cumprod)
    vl = [100.0, 101.0, 0.0, 102.0, 103.0]
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        with caplog.at_level("WARNING"):
            idx = A.adjusted_index(_nav(vl))
    assert idx.iloc[:2].tolist() == pytest.approx([100.0, 101.0])
    assert idx.iloc[2:].isna().all()                # rendement ≤ −100 % : chaîne non calculable à partir de ce point
    assert not np.isinf(idx.to_numpy()).any()
    assert "observation 3 sur 5" in caplog.text     # une position, jamais une valeur


def test_indice_rendement_moins_100_pourcent():
    idx = A.adjusted_index(_nav([100.0, 50.0, 0.0, 10.0]))
    assert idx.iloc[:2].tolist() == pytest.approx([100.0, 50.0]) and idx.iloc[2:].isna().all()


def test_indice_valeur_non_numerique():
    idx = A.adjusted_index(_nav([100.0, 101.0, "n/a", 103.0]))
    assert idx.iloc[:2].notna().all() and idx.iloc[2:].isna().all()


def test_performances_none_si_indice_interrompu():
    m = SimpleNamespace(period_start=lambda end, p: end - pd.DateOffset(months={"1M": 1, "3M": 3, "YTD": 2, "1A": 12, "3A": 36}[p]))
    s = _daily([100.0 + i * 0.1 for i in range(60)] + [np.nan] * 5)
    out = A.perf_block(m, s, s.index[-1], s.index[0], strict=True)
    assert out["1M"] is None and out["origine"] is None
    ok = A.perf_block(m, s.dropna(), s.dropna().index[-1], s.index[0], strict=True)
    assert ok["1M"] == pytest.approx(s.dropna().iloc[-1] / s.dropna()[: s.dropna().index[-1] - pd.DateOffset(months=1)].iloc[-1] - 1)


def test_risque_indice_interrompu_ou_infini():
    base = _daily([100 * (1.001 ** i) for i in range(260)])
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        valid = A.risk_stats(base, base * 1.01, base.index[-1])
        broken = A.risk_stats(pd.concat([base.iloc[:-10], pd.Series(np.nan, index=base.index[-10:])]), None, base.index[-1])
        inf_bench = base.copy()
        inf_bench.iloc[100] = np.inf
        with_inf = A.risk_stats(base, inf_bench, base.index[-1])
    r = base.pct_change().dropna()
    assert valid["vol"] == pytest.approx(r.std() * math.sqrt(252))
    assert valid["mdd"] == pytest.approx(0.0)
    assert broken == {"vol": None, "mdd": None, "te": None, "bench_vol": None}
    assert with_inf["vol"] == pytest.approx(valid["vol"]) and (with_inf["te"] is None or math.isfinite(with_inf["te"]))


# ---------------------------------------------------------------- inventaires (float * Decimal)
def _holdings_model(amounts, totals_eur, totals_ccy, devise="USD"):
    n = len(amounts)
    h = pd.DataFrame({
        "ID_JUMP_FONDS": ["F1"] * n, "ID_PI_FONDS": ["P1"] * n, "DEVISE_FONDS": [devise] * n,
        "DATE_INVENTAIRE": ["2026-08-31"] * n, "ID_JUMP_INSTRUMENT": [f"I{i}" for i in range(n)],
        "CODE_ISIN_INSTRUMENT": [None] * n, "NOM_INSTRUMENT": [f"Ligne {i}" for i in range(n)],
        "MONTANT_DEVISE_FONDS": pd.Series(amounts, dtype=object), "EXPOSITION_DEVISE_FONDS": pd.Series(amounts, dtype=object),
        "POIDS_LIGNE_EXPO": pd.Series([Decimal("10")] * n, dtype=object),
    })
    aum = pd.DataFrame({"ID_JUMP_FONDS": ["F1"], "DATE_VL": pd.to_datetime(["2026-08-31"]),
                        "ACTIF_NET_TOTAL_EURO": pd.Series([totals_eur], dtype=object),
                        "ACTIF_NET_TOTAL_DEVISE_FONDS": pd.Series([totals_ccy], dtype=object)})
    link = pd.DataFrame({"ID_JUMP_FONDS": ["F1"], "fund_id": ["P1"]})
    return SimpleNamespace(holdings=h, aum_raw=aum, link=link, funds=pd.DataFrame(index=["P1"]))


def test_inventaire_decimal_float_chaine_none_nan():
    m = _holdings_model([Decimal("100"), 200.0, "300", None, np.nan], Decimal("110"), Decimal("100"))
    h = H._prepared(m)
    assert str(h["amount_eur"].dtype) == "float64"
    assert h["amount_eur"].iloc[:3].tolist() == pytest.approx([110.0, 220.0, 330.0])
    assert h["amount_eur"].iloc[3:].isna().all()          # montant invalide → NaN, pas zéro


def test_inventaire_taux_incalculable_montant_indisponible():
    m = _holdings_model([Decimal("100"), 50.0], Decimal("110"), Decimal("0"))   # actif net en devise nul
    h = H._prepared(m)
    assert h["amount_eur"].isna().all()                   # aucun taux inventé (ni 1, ni 0)


def test_inventaire_fonds_en_euros_taux_unitaire():
    m = _holdings_model([Decimal("100")], None, None, devise="EUR")
    assert H._prepared(m)["amount_eur"].tolist() == [100.0]   # 1 par définition pour un fonds en euros


# ---------------------------------------------------------------- routes, de bout en bout
@pytest.fixture(scope="module")
def sql_client():
    from fastapi.testclient import TestClient
    from rco import api
    saved = api._S
    api._S = api._State()
    real = api.make_source
    api.make_source = lambda s: DecimalSource(faults=True)
    try:
        yield TestClient(api.app, raise_server_exceptions=False)
    finally:
        api.make_source = real
        api._S = saved


@pytest.mark.parametrize("url", ["/api/funds", "/api/controls", "/api/holdings", "/api/meta", "/api/overview",
                                 "/api/risk", "/api/distribution", "/api/search-index"])
def test_routes_sans_500_avec_decimal_et_valeurs_invalides(sql_client, url):
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        r = sql_client.get(url)
    assert r.status_code == 200, r.text[:300]


def test_fiches_fonds_sans_500(sql_client):
    funds = sql_client.get("/api/funds").json()["funds"]
    for f in funds:
        r = sql_client.get(f"/api/funds/{f['id']}")
        assert r.status_code == 200, (f["id"], r.text[:200])
        perf = r.json().get("performance") or {}
        for rec in perf.get("calendar", []):
            assert rec["fund"] is None or math.isfinite(rec["fund"])


def test_controle_totaux_decimal(sql_client):
    ctl = {c["key"]: c for c in sql_client.get("/api/controls").json()["controls"]}
    details = [it["detail"] for it in ctl["totals"]["items"]]
    assert details and all("M€" in d for d in details)


def test_donnees_valides_identiques_decimal_ou_float():
    """Sans défaut injecté, des colonnes DECIMAL (mssql-python) donnent exactement les mêmes résultats que des float."""
    from rco.data.mock import MockSource
    from rco.domain.model import build_model
    from rco.service import Service
    a = Service(build_model(MockSource(), is_mock=True))
    b = Service(build_model(DecimalSource(faults=False), is_mock=True))
    fa, fb = a.funds(None, {}), b.funds(None, {})
    assert fa["total_aum"] == fb["total_aum"]
    for x, y in zip(fa["funds"], fb["funds"]):
        assert {k: x[k] for k in ("id", "aum", "var_YTD", "perf_YTD", "perf_1A", "vol_1A")} == \
               {k: y[k] for k in ("id", "aum", "var_YTD", "perf_YTD", "perf_1A", "vol_1A")}
    assert a.holdings(None)["total_eur"] == b.holdings(None)["total_eur"]
    assert [c["count"] for c in a.controls(None)["controls"]] == [c["count"] for c in b.controls(None)["controls"]]
