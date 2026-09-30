"""Connexion Fabric : chaîne de connexion et choix du client (sans réseau, avec des clients factices)."""
import sys
import types
from dataclasses import replace

import pytest

from rco.config import load_settings
from rco.data.fabric import FabricSource, connection_string


@pytest.fixture()
def settings():
    return replace(load_settings(), data_source="fabric", fabric_server="exemple.datawarehouse.fabric.microsoft.com",
                   fabric_database="LKH_RFPTeam_Bronze")


def test_chaine_entra_id_lecture_seule_sans_secret(settings):
    cs = connection_string(settings, "mssql-python")
    assert "Authentication=ActiveDirectoryInteractive" in cs and "ApplicationIntent=ReadOnly" in cs
    assert "Driver=" not in cs  # mssql-python fournit son propre pilote
    assert "PWD" not in cs.upper() and "UID" not in cs.upper()
    assert connection_string(settings, "pyodbc").startswith("Driver={ODBC Driver 18 for SQL Server};")


class _Cur:
    description = [("A",), ("B",)]
    def execute(self, sql, params): self.sql, self.params = sql, params
    def fetchall(self): return [(1, "x"), (2, "y")]
    def close(self): pass


class _Conn:
    def cursor(self): return _Cur()
    def close(self): pass


def test_mssql_python_par_defaut(settings, monkeypatch):
    seen = {}
    fake = types.SimpleNamespace(connect=lambda cs: seen.setdefault("cs", cs) and _Conn())
    monkeypatch.setitem(sys.modules, "mssql_python", fake)
    df = FabricSource(settings).table("PI_OUT_Share", ["A", "B"])
    assert list(df.columns) == ["A", "B"] and len(df) == 2
    assert seen["cs"].startswith("Server=exemple")


def test_pyodbc_sur_demande(settings, monkeypatch):
    seen = {}
    fake = types.SimpleNamespace(connect=lambda cs, readonly: seen.update(cs=cs, ro=readonly) or _Conn())
    monkeypatch.setitem(sys.modules, "pyodbc", fake)
    FabricSource(replace(settings, fabric_client="pyodbc")).table("PI_OUT_Share", ["A", "B"])
    assert seen["ro"] is True and seen["cs"].startswith("Driver=")


def test_refuse_toute_ecriture(settings, monkeypatch):
    monkeypatch.setitem(sys.modules, "mssql_python", types.SimpleNamespace(connect=lambda cs: _Conn()))
    with pytest.raises(ValueError):
        FabricSource(settings).query("DELETE FROM [dbo].[PI_OUT_Share]")
