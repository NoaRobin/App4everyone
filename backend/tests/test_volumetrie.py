"""Lecture et calculs à l'échelle réelle (des dizaines de millions de cellules).

- Requêtes compactes de JUMP_portfolio_aum (faits + changements de libellés) : exécutées sur SQLite, qui comprend
  les fonctions de fenêtre et la syntaxe [dbo].[table] ; mêmes résultats que la lecture complète, ligne pour ligne.
- Lecture par lots (Arrow ou lignes) : colonnes numériques en float64, jamais de decimal.Decimal en mémoire.
- Modèle identique qu'il soit construit depuis la table complète ou depuis la lecture compacte.
- Calculs vectorisés (risques, composition) identiques aux formules pandas d'origine.
Toutes les données sont fictives.
"""
from __future__ import annotations

import sqlite3
from datetime import date
from decimal import Decimal

import numpy as np
import pandas as pd
import pytest

from rco.data import aum as AQ
from rco.data import schema as S
from rco.data.fabric import FabricQueryError, FabricSource, _fetch_rows
from rco.data.mock import MockSource, ScaledMockSource
from rco.data.sql_guard import assert_read_only
from rco.domain import analytics as A
from rco.domain import holdings as H
from rco.domain.model import assemble, build_model
from rco.config import load_settings


def _aum_with_edge_cases() -> pd.DataFrame:
    """Table JUMP fictive avec un libellé qui change puis revient, un indicateur vide et des doublons de chargement."""
    full = MockSource()._full(S.AUM)[AQ.AUM_READ_COLS].copy()
    jp = full["ID_JUMP_PART"].iloc[0]
    rows = full.index[full["ID_JUMP_PART"] == jp]
    full.loc[rows[100:120], "NOM_PART"] = "Nom provisoire"
    full.loc[rows[130:135], "NOM_BENCH"] = None
    dup = full.loc[rows[[200, 300]]].copy()
    dup["DATE_MAJ"] = dup["DATE_MAJ"] + pd.Timedelta(hours=1)
    dup["NOM_PART"] = "Nom corrigé"
    dup["VL_UNITAIRE"] = dup["VL_UNITAIRE"] + 1
    return pd.concat([full, dup], ignore_index=True)


def _reference(full: pd.DataFrame) -> pd.DataFrame:
    """Ancienne méthode : dédoublonnage pandas sur la table complète, tri par part puis date."""
    ref = full.copy()
    ref["DATE_VL"] = pd.to_datetime(ref["DATE_VL"])
    ref = ref.sort_values(["DATE_MAJ"]).drop_duplicates(["ID_JUMP_PART", "DATE_VL"], keep="last")
    return ref.sort_values(["ID_JUMP_PART", "DATE_VL"]).reset_index(drop=True)


def _same(a: pd.Series, b: pd.Series) -> bool:
    return a.astype(object).where(a.notna(), None).tolist() == b.astype(object).where(b.notna(), None).tolist()


@pytest.fixture(scope="module")
def sqlite_lake():
    full = _aum_with_edge_cases()
    con = sqlite3.connect(":memory:")
    con.execute("ATTACH ':memory:' AS dbo")
    f2 = full.copy()
    f2["DATE_VL"] = pd.to_datetime(f2["DATE_VL"]).dt.strftime("%Y-%m-%d")
    f2["DATE_MAJ"] = f2["DATE_MAJ"].astype(str)
    f2.to_sql("tmp", con, index=False)
    con.execute("CREATE TABLE dbo.JUMP_portfolio_aum AS SELECT * FROM main.tmp")
    yield full, con
    con.close()


def test_requetes_compactes_en_lecture_seule():
    for sql in (AQ.facts_sql(), AQ.attributes_sql(), AQ.attributes_sql(probe=True), AQ.count_sql()):
        assert assert_read_only(sql) == sql
    assert "CAST([VL_UNITAIRE] AS FLOAT)" in AQ.facts_sql()
    assert "NOM_PART" not in AQ.facts_sql()          # aucun libellé répété dans les faits


def test_libelles_sql_identiques_au_calcul_pandas(sqlite_lake):
    full, con = sqlite_lake
    attrs = pd.read_sql(AQ.attributes_sql(), con, params=["2000-01-01"])
    _, expected = AQ.split_aum(full)
    norm = lambda d: (d.assign(DATE_VL=pd.to_datetime(d["DATE_VL"]), DATE_MAJ=pd.to_datetime(d["DATE_MAJ"]))  # noqa: E731
                      .sort_values(["ID_JUMP_PART", "DATE_VL", "DATE_MAJ"]).reset_index(drop=True)
                      .astype(object).where(lambda x: x.notna(), None))
    assert norm(attrs).equals(norm(expected))
    assert len(attrs) < len(full) / 100               # quelques lignes de libellés au lieu d'une par jour


def test_reconstitution_exacte_ligne_a_ligne(sqlite_lake):
    full, con = sqlite_lake
    facts = pd.read_sql(AQ.facts_sql(), con, params=["2000-01-01"])
    attrs = pd.read_sql(AQ.attributes_sql(), con, params=["2000-01-01"])
    out = AQ.join_attributes(AQ.dedupe_facts(facts), attrs, AQ.ATTR_COLS)
    ref = _reference(full)
    assert len(out) == len(ref)
    for c in AQ.ATTR_COLS:
        assert _same(out[c], ref[c]), c
    for c in AQ.FACT_NUMERIC:
        assert np.allclose(out[c].to_numpy(float), ref[c].to_numpy(float), equal_nan=True), c
    jp = full["ID_JUMP_PART"].iloc[0]
    names = out.loc[out["ID_JUMP_PART"] == jp, "NOM_PART"].tolist()
    assert names[99] != "Nom provisoire" and names[100] == "Nom provisoire" and names[120] == names[99]  # A → B → A
    assert "Nom corrigé" in names                      # doublon : la ligne la plus récemment mise à jour l'emporte


def test_sonde_sans_ligne(sqlite_lake):
    _, con = sqlite_lake
    assert pd.read_sql(AQ.attributes_sql(probe=True), con, params=["2000-01-01"]).empty


def test_modele_identique_lecture_complete_ou_compacte():
    src = MockSource()
    tables = {t: src._full(t) for t in (S.PRODUCT, S.SHARE, S.COUNTRY, S.AUM, S.HOLDINGS, S.DQ)}
    args = (date(2026, 9, 29), tables[S.PRODUCT], tables[S.SHARE], tables[S.COUNTRY])
    full = assemble(*args, tables[S.AUM][AQ.AUM_READ_COLS], tables[S.HOLDINGS], tables[S.DQ])
    facts, attrs = AQ.split_aum(tables[S.AUM])
    compact = assemble(*args, facts, tables[S.HOLDINGS], tables[S.DQ], aum_attrs=attrs)
    pd.testing.assert_frame_equal(full.fund_aum, compact.fund_aum)
    pd.testing.assert_frame_equal(full.share_flow_cum, compact.share_flow_cum)
    pd.testing.assert_frame_equal(full.link, compact.link)


# ---------------------------------------------------------------- lecture par lots
class _Cursor:
    """Curseur DB-API fictif renvoyant des Decimal (comme mssql-python), par lots."""

    def __init__(self, rows, cols):
        self.rows, self.description = list(rows), [(c,) for c in cols]

    def fetchmany(self, n):
        out, self.rows = self.rows[:n], self.rows[n:]
        return out


def test_lecture_par_lots_decimal_vers_float64():
    rows = [("P1", date(2026, 1, d), Decimal("100.5") if d != 3 else None) for d in range(1, 8)]
    rows[4] = ("P1", date(2026, 1, 5), Decimal("NaN"))
    seen = []
    df = _fetch_rows(_Cursor(rows, ["ID", "DATE_VL", "VL"]), ["ID", "DATE_VL", "VL"], seen.append, batch_rows=2)
    assert df["VL"].dtype == np.float64 and not any(isinstance(v, Decimal) for v in df["VL"])
    assert df["VL"].isna().sum() == 2                  # NULL et NaN : indisponibles, jamais zéro
    assert pd.api.types.is_datetime64_any_dtype(df["DATE_VL"])
    assert seen == [2, 4, 6, 7]                         # progression lot par lot


def test_lot_entierement_vide_garde_le_type():
    rows = [("A", None), ("B", None), ("C", Decimal("2")), ("D", Decimal("3"))]
    df = _fetch_rows(_Cursor(rows, ["K", "V"]), ["K", "V"], lambda n: None, batch_rows=2)
    assert df["V"].dtype == np.float64 and df["V"].tolist()[2:] == [2.0, 3.0]


def test_lecture_arrow_decimal_vers_float64(monkeypatch):
    pa = pytest.importorskip("pyarrow")
    from rco.data import fabric as F

    batch = pa.record_batch({"V": pa.array([Decimal("1.25"), None], pa.decimal128(38, 6)), "S": ["a", None],
                             "D": pa.array([date(2026, 1, 2)] * 2, pa.date32())})

    class Reader:
        schema = batch.schema
        def __iter__(self): return iter([batch])
        def close(self): pass

    class Cur:
        description = [("V",), ("S",), ("D",)]
        def arrow_reader(self, batch_size): return Reader()

    import pyarrow.compute as pc
    df = F._fetch_arrow(Cur(), pa, pc, lambda n: None, 10)
    assert df["V"].dtype == np.float64 and df["V"].iloc[0] == 1.25 and np.isnan(df["V"].iloc[1])
    assert pd.api.types.is_datetime64_any_dtype(df["D"])


SERVER = "abc12de34fgh.datawarehouse.fabric.microsoft.com"


def test_repli_si_les_fonctions_de_fenetre_sont_refusees(monkeypatch):
    s = load_settings({"APP_DATA_SOURCE": "fabric", "FABRIC_SQL_SERVER": SERVER, "FABRIC_SQL_DATABASE": "LKH_RFPTeam_Bronze"})
    src = FabricSource(s)
    full = MockSource()._full(S.AUM)[AQ.AUM_READ_COLS]
    calls = []

    def query(sql, params=(), *, table=None, label=None, total=None):
        calls.append(sql)
        if "LAG(" in sql:
            raise FabricQueryError("Requête refusée par Fabric.", detail="42000: Incorrect syntax near 'OVER'")
        if "COUNT_BIG" in sql:
            return pd.DataFrame({"n": [len(full)]})
        if "CAST(" in sql:
            facts, _ = AQ.split_aum(full)
            return facts
        return full[[AQ.KEY, AQ.DATE, AQ.MAJ, *AQ.ATTR_COLS]]

    monkeypatch.setattr(src, "query", query)
    facts, attrs = src.aum_parts(date(2022, 1, 1))
    assert len(facts) == len(full) and 0 < len(attrs) < len(full)
    assert any("LAG(" in c for c in calls) and all(assert_read_only(c) for c in calls)


def test_colonne_manquante_non_masquee_par_le_repli(monkeypatch):
    s = load_settings({"APP_DATA_SOURCE": "fabric", "FABRIC_SQL_SERVER": SERVER, "FABRIC_SQL_DATABASE": "LKH_RFPTeam_Bronze"})
    src = FabricSource(s)

    def query(sql, params=(), *, table=None, label=None, total=None):
        if "LAG(" in sql:
            raise FabricQueryError("Requête refusée.", detail="42S22: Invalid column name 'NOM_BENCH'")
        return pd.DataFrame({"n": [1]}) if "COUNT_BIG" in sql else pd.DataFrame(columns=AQ.FACT_COLS)

    monkeypatch.setattr(src, "query", query)
    with pytest.raises(FabricQueryError):
        src.aum_parts(date(2022, 1, 1))


# ---------------------------------------------------------------- calculs vectorisés
@pytest.fixture(scope="module")
def scaled_model():
    src = ScaledMockSource(2)
    src.reference_date = date(2026, 9, 29)
    return build_model(src, is_mock=True)


def test_source_demultipliee_identifiants_distincts(scaled_model):
    m = scaled_model
    assert m.link.index.is_unique and len(m.link) == 2 * len(build_model(_mock(), is_mock=True).link)


def _mock():
    s = MockSource()
    s.reference_date = date(2026, 9, 29)
    return s


def _risk_reference(idx: pd.Series, bench: pd.Series | None, end: pd.Timestamp) -> dict:
    """Formules pandas d'origine (Series.pct_change, std, cummax) : la version NumPy doit donner les mêmes nombres."""
    from rco.domain.numeric import finite_or_none, numeric_series
    import math
    start = end - pd.DateOffset(years=1)
    none = {"vol": None, "mdd": None, "te": None, "bench_vol": None}
    window = numeric_series(idx[start:end])
    if window.isna().any() and window.notna().any() and window.last_valid_index() != window.index[-1]:
        return none
    s = window.dropna()
    if len(s) < 20:
        return none
    ppy = A._periods_per_year(s.index)
    r = s.pct_change(fill_method=None).dropna()
    out = {"vol": finite_or_none(r.std() * math.sqrt(ppy)), "mdd": finite_or_none((s / s.cummax() - 1).min()), "te": None, "bench_vol": None}
    if bench is not None:
        b = numeric_series(bench).reindex(s.index).ffill()
        if b.notna().sum() > 20:
            rb = b.pct_change(fill_method=None)
            rb = rb.mask(np.isinf(rb.to_numpy())).dropna()
            common = r.index.intersection(rb.index)
            if len(common) > 20:
                out["te"] = finite_or_none((r[common] - rb[common]).std() * math.sqrt(ppy))
                out["bench_vol"] = finite_or_none(rb[common].std() * math.sqrt(ppy))
    return out


def test_risques_numpy_identiques_aux_formules_pandas(scaled_model):
    m = scaled_model
    n = 0
    for end in (m.dates[-1], m.dates[-300]):
        for jp in list(m.link.index)[::7]:
            nav = A.share_nav_frame(m, jp)[:end]
            if len(nav) < 2:
                continue
            idx, bench = A.adjusted_index(nav), A.benchmark_series(nav)
            for b in (bench, None, bench.mask(bench.index < bench.index[len(bench) // 2])):
                assert A.risk_stats(idx, b, end) == _risk_reference(idx, b, end)
                n += 1
    assert n > 50


def test_resume_de_composition_identique_a_la_composition(scaled_model):
    m = scaled_model
    end = m.dates[-1]
    checked = 0
    for fid in m.funds.index:
        full, short = H.fund_composition(m, fid, end), H.composition_summary(m, fid, end)
        assert (full is None) == (short is None)
        if full:
            assert {k: full[k] for k in short} == short
            checked += 1
    assert checked > 10


def test_performances_memorisees_non_modifiees(scaled_model):
    from rco.service import Service
    m = scaled_model
    svc = Service(m)
    fid = next(f for f in m.funds.index if A.main_part(m, f, m.dates[-1]))
    a = svc.fund(fid, None)
    svc.fund.cache_clear()
    b = svc.fund(fid, None)
    assert a["performance"] == b["performance"] and "_index" not in a["performance"]


# ---------------------------------------------------------------- progression du chargement
def test_progression_exposee_par_health(monkeypatch):
    from fastapi.testclient import TestClient
    from rco import api
    saved = api._S
    api._S = api._State()
    try:
        import time
        api._S.state, api._S.started, api._S.step = "loading", time.time(), "Lecture : encours et VL"
        api._S.source = type("Src", (), {"progress": {"JUMP_portfolio_aum (montants)": {"rows": 1_200_000, "total": 3_000_000, "done": False}}})()
        body = TestClient(api.app).get("/api/health").json()["model"]
        assert body["step"] == "Lecture : encours et VL"
        assert body["progress"] == [{"table": "JUMP_portfolio_aum (montants)", "rows": 1_200_000, "total": 3_000_000, "done": False}]
    finally:
        api._S = saved
