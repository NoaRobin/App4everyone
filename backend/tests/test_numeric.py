"""Normalisation numérique (domain/numeric.py) : Decimal, NumPy, pandas NA, NaN, inf, booléens, chaînes."""
from decimal import Decimal

import numpy as np
import pandas as pd
import pytest

from rco.domain.numeric import fmt_meur, finite_or_none, numeric_series, ratio_series, return_between, safe_divide, safe_float


@pytest.mark.parametrize("value,expected", [
    (Decimal("12.5"), 12.5), (Decimal("0"), 0.0), (Decimal("-3"), -3.0), (7, 7.0), (2.25, 2.25),
    (np.int64(4), 4.0), (np.float32(1.5), 1.5), ("3.75", 3.75), (" 1e6 ", 1e6),
    (None, None), (pd.NA, None), (pd.NaT, None), (float("nan"), None), (np.nan, None),
    (float("inf"), None), (float("-inf"), None), (Decimal("NaN"), None), (Decimal("Infinity"), None),
    (True, None), (False, None), (np.bool_(True), None), ("abc", None), ("", None), (object(), None),
])
def test_safe_float(value, expected):
    assert safe_float(value) == expected


def test_tres_grandes_valeurs():
    assert safe_float(Decimal("1e300")) == 1e300
    assert safe_float(Decimal("1e400")) is None          # dépasse le float : non fini, pas d'invention
    assert finite_or_none(1e308 * 10) is None
    assert safe_divide(1e308, 1e-10) is None             # débordement du quotient → None


def test_division_decimal_par_float():
    # Reproduit « unsupported operand type(s) for /: 'decimal.Decimal' and 'float' »
    with pytest.raises(TypeError):
        Decimal("250000000") / 1e6  # noqa: B018 - comportement Python brut
    assert safe_divide(Decimal("250000000"), 1e6) == 250.0
    assert safe_divide(Decimal("1"), Decimal("0")) is None
    assert safe_divide(1.0, 0.0) is None
    assert safe_divide(None, 2) is None and safe_divide(2, None) is None
    assert safe_divide(np.nan, 2) is None


@pytest.mark.parametrize("v0", [0, None, float("nan"), Decimal("0"), Decimal("NaN"), float("inf"), "x"])
def test_performance_base_invalide(v0):
    assert return_between(110.0, v0) is None


def test_performance_valide_inchangee():
    assert return_between(110.0, 100.0) == pytest.approx(110.0 / 100.0 - 1)
    assert return_between(Decimal("110"), Decimal("100")) == pytest.approx(0.1)


def test_formatage_montants():
    assert fmt_meur(Decimal("1234567890")) == "1 234,6 M€"
    assert fmt_meur(2.5e6) == "2,5 M€"
    assert fmt_meur(None) == "indisponible"
    assert fmt_meur(float("nan")) == "indisponible"
    assert fmt_meur(Decimal("1e400")) == "indisponible"
    assert fmt_meur(Decimal("123456789012345678")) == "123 456 789 012,3 M€"


def test_numeric_series_mixte():
    s = pd.Series([Decimal("1.5"), 2.0, None, np.nan, "3", "x", float("inf"), True, Decimal("NaN"), 4], dtype=object)
    out = numeric_series(s)
    assert str(out.dtype) == "float64"
    expected = [1.5, 2.0, np.nan, np.nan, 3.0, np.nan, np.nan, np.nan, np.nan, 4.0]
    assert np.allclose(out.to_numpy(), expected, equal_nan=True)


def test_numeric_series_numerique_inchangee():
    s = pd.Series([1.0, -2.5, 3.0])
    assert numeric_series(s).tolist() == [1.0, -2.5, 3.0]
    assert numeric_series(pd.Series([True, False])).isna().all()   # booléens : pas des montants


def test_numeric_series_journalise_un_compte(caplog):
    with caplog.at_level("WARNING"):
        numeric_series(pd.Series(["1", "n/a", "inf", None], dtype=object), name="TABLE.COLONNE")
    msg = " ".join(r.getMessage() for r in caplog.records)
    assert "TABLE.COLONNE : 2 valeur(s)" in msg and "n/a" not in msg   # le nombre, jamais la valeur


def test_ratio_series_denominateur_nul():
    q = ratio_series(pd.Series([Decimal("10"), 5.0, 3.0, None], dtype=object), pd.Series([Decimal("2"), 0.0, None, 1.0], dtype=object))
    assert q.iloc[0] == 5.0 and q.iloc[1:].isna().all()


def test_multiplication_float_decimal_homogene():
    # Reproduit « unsupported operand type(s) for *: 'float' and 'decimal.Decimal' »
    amount = pd.Series([1.0, 2.0])
    fx = pd.Series([Decimal("1.1"), Decimal("0.9")], dtype=object)
    with pytest.raises(TypeError):
        amount * fx  # noqa: B018
    out = numeric_series(amount) * numeric_series(fx)
    assert out.tolist() == pytest.approx([1.1, 1.8])
