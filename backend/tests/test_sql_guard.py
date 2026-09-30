import pytest

from rco.data.fabric import build_select
from rco.data.sql_guard import ReadOnlyViolation, assert_read_only


@pytest.mark.parametrize("sql", [
    "SELECT [a], [b] FROM [dbo].[JUMP_portfolio_aum] WHERE [DATE_VL] >= ?",
    "select * from dbo.calendar;",
    "WITH x AS (SELECT 1 AS a) SELECT a FROM x",
    "SELECT [Is_to_put_in_production], [Sent], [Created_By] FROM [dbo].[pi_out_product_active]",
    "SELECT 'DROP TABLE x' AS texte",
    "-- commentaire DELETE\nSELECT 1",
])
def test_select_autorise(sql):
    assert assert_read_only(sql) == sql


@pytest.mark.parametrize("sql", [
    "DELETE FROM dbo.calendar",
    "UPDATE dbo.calendar SET DateVL = NULL",
    "INSERT INTO t VALUES (1)",
    "SELECT * INTO copie FROM dbo.calendar",
    "SELECT 1; DROP TABLE dbo.calendar",
    "DROP TABLE dbo.calendar",
    "EXEC sp_who",
    "MERGE t USING s ON 1=1 WHEN MATCHED THEN DELETE;",
    "SELECT * FROM OPENROWSET('x','y','z')",
    "/* SELECT */ TRUNCATE TABLE dbo.calendar",
    "  ",
])
def test_ecriture_refusee(sql):
    with pytest.raises(ReadOnlyViolation):
        assert_read_only(sql)


def test_build_select_explicite_et_parametre():
    sql, params = build_select("JUMP_portfolio_aum", ["DATE_VL", "VL_UNITAIRE"], ("DATE_VL", "2024-01-01"))
    assert sql == "SELECT [DATE_VL], [VL_UNITAIRE] FROM [dbo].[JUMP_portfolio_aum] WHERE [DATE_VL] >= ?"
    assert params == ["2024-01-01"]


def test_build_select_refuse_identifiant_malicieux():
    with pytest.raises(ValueError):
        build_select("calendar]; DROP TABLE x; --", ["DateVL"])
