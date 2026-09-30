import pandas as pd
import pytest

from rco.domain import analytics as A
from helpers import aum_row, build, product, share

P = [product("PR1", "Fonds Un"), product("PR2", "Fonds Deux", level1="Fixed Income")]
S = [share("S1", "PR1", "FR1", "Un C"), share("S2", "PR1", "FR2", "Un I"), share("S3", "PR2", "FR3", "Deux C")]


def _rows(total_repeated=True):
    out = []
    for d, n1, n2, n3, vl in [("2026-01-02", 10, 20, 50, 100), ("2026-01-05", 12, 20, 50, 110)]:
        tot1 = (n1 + n2) * vl
        out += [aum_row("F1", "P1", d, n1, vl, pi_part="S1", total=tot1),
                aum_row("F1", "P2", d, n2, vl, pi_part="S2", total=tot1),
                aum_row("F2", "P3", d, n3, 10, pi_part="S3", total=500)]
    return out


def test_encours_fonds_somme_des_parts_sans_double_compte():
    m = build(_rows(), P, S)
    d = pd.Timestamp("2026-01-05")
    assert m.fund_aum.at[d, "PR1"] == pytest.approx((12 + 20) * 110)
    assert m.fund_aum.at[d, "PR2"] == pytest.approx(500)
    # L'actif net total répété sur chaque part n'est jamais additionné
    total, _ = A.house_series(m)
    assert total[d] == pytest.approx(32 * 110 + 500)


def test_collecte_et_effet_marche():
    m = build(_rows(), P, S)
    aum, fc = m.fund_aum["PR1"], m.fund_flow_cum["PR1"]
    v = A.variation(aum, fc, pd.Timestamp("2026-01-02"), pd.Timestamp("2026-01-05"))
    assert v["aum_start"] == pytest.approx(3000)
    assert v["aum_end"] == pytest.approx(3520)
    assert v["flows"] == pytest.approx(2 * 110)           # 2 parts souscrites à 110
    assert v["market"] == pytest.approx(30 * 10)          # 30 parts × +10 de VL
    assert v["delta"] == pytest.approx(v["flows"] + v["market"])
    assert v["pct"] == pytest.approx(520 / 3000)


def test_operation_sur_titres_neutre_pour_la_collecte():
    rows = [aum_row("F1", "P1", "2026-01-02", 10, 100, pi_part="S1"),
            aum_row("F1", "P1", "2026-01-05", 100, 10.5, pi_part="S1", coef=10)]  # division par 10
    m = build(rows, P, S)
    v = A.variation(m.fund_aum["PR1"], m.fund_flow_cum["PR1"], pd.Timestamp("2026-01-02"), pd.Timestamp("2026-01-05"))
    assert v["flows"] == pytest.approx(0)
    assert v["market"] == pytest.approx(50)


def test_encours_a_date_reporte_puis_perime():
    rows = [aum_row("F1", "P1", "2026-01-02", 10, 100, pi_part="S1"),
            aum_row("F2", "P3", "2026-01-30", 10, 10, pi_part="S3")]
    m = build(rows, P, S, stale_days=12)
    assert m.fund_aum.at[pd.Timestamp("2026-01-09"), "PR1"] == 1000      # reporté (VL hebdomadaire)
    assert pd.isna(m.fund_aum.at[pd.Timestamp("2026-01-20"), "PR1"])     # trop ancien : n'est plus compté
    assert m.date_index("2026-01-10") == m.date_index("2026-01-09")      # week-end → dernier jour ouvré


def test_lancement_et_disparition_sont_des_flux():
    rows = [aum_row("F2", "P3", d, 50, 10, pi_part="S3") for d in pd.bdate_range("2026-01-02", "2026-02-27")]
    rows += [aum_row("F1", "P1", d, 10, 100, pi_part="S1") for d in pd.bdate_range("2026-01-20", "2026-01-30")]
    m = build(rows, P, S, stale_days=5)
    fc = m.fund_flow_cum["PR1"]
    v_in = A.variation(m.fund_aum["PR1"], fc, pd.Timestamp("2026-01-16"), pd.Timestamp("2026-01-22"))
    assert v_in["flows"] == pytest.approx(1000) and v_in["market"] == pytest.approx(0)
    v_out = A.variation(m.fund_aum["PR1"], fc, pd.Timestamp("2026-01-30"), pd.Timestamp("2026-02-20"))
    assert v_out["flows"] == pytest.approx(-1000) and v_out["market"] == pytest.approx(0)


def test_periodes():
    rows = [aum_row("F1", "P1", d, 10, 100, pi_part="S1") for d in pd.bdate_range("2024-12-02", "2026-03-31")]
    m = build(rows, P, S)
    end = m.as_of("2026-03-31")
    assert m.period_start(end, "YTD") == pd.Timestamp("2025-12-31")
    assert m.period_start(end, "1M") == pd.Timestamp("2026-02-27")   # 28/02 est un samedi
    assert m.period_start(end, "1J") == pd.Timestamp("2026-03-30")
    assert m.period_start(end, "3A") is None                          # hors historique


def test_repartition_par_famille():
    from rco.service import Service
    m = build(_rows(), P, S)
    b = Service(m).breakdown(None, "family")
    by = {g["key"]: g["aum"] for g in b["groups"]}
    assert by == {"ae": pytest.approx(3520), "fi": pytest.approx(500)}
    assert b["total"] == pytest.approx(4020)
