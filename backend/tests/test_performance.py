import pandas as pd
import pytest

from rco.domain import analytics as A
from helpers import aum_row, build, product, share

P = [product("PR1", "Fonds Un")]
S = [share("S1", "PR1", "FR1", "Un C")]


def test_indice_corrige_dividende_et_division():
    nav = pd.DataFrame({
        "VL_UNITAIRE": [100.0, 98.0, 9.9],
        "DIVIDEND_AMOUNT": [None, 3.0, None],   # 101 avant détachement → +1 %
        "COEFFICIENT_OST": [1.0, 1.0, 10.0],    # division par 10 : 9,9 × 10 = 99 → +1,0204 %
    }, index=pd.to_datetime(["2026-01-02", "2026-01-05", "2026-01-06"]))
    idx = A.adjusted_index(nav)
    assert idx.iloc[1] == pytest.approx(101.0)
    assert idx.iloc[2] == pytest.approx(101.0 * 99 / 98)


def test_performance_depuis_debut_annee_et_benchmark():
    rows = [aum_row("F1", "P1", "2025-12-31", 10, 100, pi_part="S1", bench=200),
            aum_row("F1", "P1", "2026-01-15", 10, 105, pi_part="S1", bench=204)]
    m = build(rows, P, S)
    p = A.share_performance(m, "P1", m.as_of("2026-01-15"))
    assert p["fund"]["YTD"] == pytest.approx(.05)
    assert p["bench"]["YTD"] == pytest.approx(.02)
    assert p["fund"]["1A"] is None       # historique insuffisant


def test_part_liquidee_sans_performance_recente():
    rows = [aum_row("F1", "P1", d, 10, 100 + i, pi_part="S1") for i, d in enumerate(pd.bdate_range("2025-01-02", "2025-06-30"))]
    rows.append(aum_row("F9", "P9", "2026-03-02", 1, 1))
    m = build(rows, P, S)
    p = A.share_performance(m, "P1", m.as_of("2026-03-02"))
    assert p["fund"]["YTD"] is None and p["fund"]["1M"] is None


def test_frequence_hebdomadaire_pour_volatilite():
    idx = pd.bdate_range("2025-01-03", "2026-01-02", freq="W-FRI")
    assert A._periods_per_year(idx) == 52.0
    assert A._periods_per_year(pd.bdate_range("2025-01-01", "2025-03-01")) == 252.0
