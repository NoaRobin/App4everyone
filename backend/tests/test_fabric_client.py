"""Connexion Fabric : configuration, chaîne de connexion, délais, erreurs explicites (sans réseau, clients factices)."""
import sys
import types
from dataclasses import replace

import pytest

from rco.config import fabric_config_problems, load_settings
from rco.data import fabric as F
from rco.data.fabric import FabricSource, connection_string

SERVER = "abc12de34fgh.datawarehouse.fabric.microsoft.com"


@pytest.fixture()
def settings():
    return load_settings({"APP_DATA_SOURCE": "fabric", "FABRIC_SQL_SERVER": SERVER, "FABRIC_SQL_DATABASE": "LKH_RFPTeam_Bronze"})


class _Cur:
    description = [("A",), ("B",)]
    def __init__(self, conn): self.conn = conn
    def execute(self, sql, params):
        self.conn.log.append(sql)
        if self.conn.fail:
            e = self.conn.fail.pop(0)
            if e:
                raise e
    def fetchall(self): return [(1, "x"), (2, "y")]
    def close(self): pass


class _Conn:
    def __init__(self, fail=None):
        self.log, self.fail, self.timeout, self.closed = [], list(fail or []), 0, False
    def cursor(self): return _Cur(self)
    def close(self): self.closed = True


def _fake_mssql(monkeypatch, conns):
    seen = {"calls": []}
    def connect(cs, timeout=0, **kw):
        seen["calls"].append({"cs": cs, "timeout": timeout, **kw})
        return conns.pop(0)
    monkeypatch.setitem(sys.modules, "mssql_python", types.SimpleNamespace(connect=connect))
    return seen


# ---------------------------------------------------------------- configuration
@pytest.mark.parametrize("server", ["<serveur du SQL analytics endpoint>", "xxxxxxxx.datawarehouse.fabric.microsoft.com",
                                    "https://abc.datawarehouse.fabric.microsoft.com", "", "votre-serveur"])
def test_placeholders_refuses(server):
    s = load_settings({"FABRIC_SQL_SERVER": server, "FABRIC_SQL_DATABASE": "LKH_RFPTeam_Bronze"})
    assert fabric_config_problems(s)
    with pytest.raises(F.FabricConfigError):
        FabricSource(s)


def test_configuration_valide(settings):
    assert fabric_config_problems(settings) == []
    assert settings.fabric_client == "mssql-python"
    assert fabric_config_problems(replace(settings, fabric_server="tcp:" + SERVER + ",1433")) == []
    assert fabric_config_problems(replace(settings, fabric_database="<base>"))


def test_chaine_entra_id_lecture_seule_sans_secret_ni_driver(settings):
    cs = connection_string(settings, "mssql-python")
    assert "Authentication=ActiveDirectoryInteractive" in cs and "ApplicationIntent=ReadOnly" in cs
    assert "Driver" not in cs  # mssql-python fournit son propre pilote : aucune clé Driver
    assert "PWD" not in cs.upper() and "UID" not in cs.upper()
    assert connection_string(settings, "pyodbc").startswith("Driver={ODBC Driver 18 for SQL Server};")


# ---------------------------------------------------------------- connexion et délais
def test_mssql_python_par_defaut_avec_delais(settings, monkeypatch):
    conn = _Conn()
    seen = _fake_mssql(monkeypatch, [conn])
    df = FabricSource(replace(settings, fabric_login_timeout=45, fabric_query_timeout=300)).table("PI_OUT_Share", ["A", "B"])
    assert list(df.columns) == ["A", "B"] and len(df) == 2
    call = seen["calls"][0]
    assert call["timeout"] == 45 and "Driver" not in call["cs"] and call["cs"].startswith("Server=" + SERVER)
    assert conn.timeout == 300


def test_une_seule_connexion_pour_toutes_les_tables(settings, monkeypatch):
    seen = _fake_mssql(monkeypatch, [_Conn()])
    src = FabricSource(settings)
    for t in ("PI_OUT_Share", "PI_OUT_CountryOfRegistration", "calendar"):
        src.table(t, ["A", "B"])
    assert len(seen["calls"]) == 1


def test_pyodbc_sur_demande(settings, monkeypatch):
    seen = {}
    fake = types.SimpleNamespace(connect=lambda cs, readonly, timeout: seen.update(cs=cs, ro=readonly, t=timeout) or _Conn())
    monkeypatch.setitem(sys.modules, "pyodbc", fake)
    FabricSource(replace(settings, fabric_client="pyodbc")).table("PI_OUT_Share", ["A", "B"])
    assert seen["ro"] is True and seen["cs"].startswith("Driver=") and seen["t"] == 120


def test_connecteur_absent(settings, monkeypatch):
    monkeypatch.setitem(sys.modules, "mssql_python", None)  # import impossible
    with pytest.raises(F.FabricDriverError):
        FabricSource(settings).ping()


# ---------------------------------------------------------------- erreurs explicites
@pytest.mark.parametrize("msg,cls", [
    ("Driver Error: Client unable to establish connection; DDBC Error: [Microsoft]TCP Provider: Error code 0x2749", F.FabricConnectionError),
    ("[Microsoft][ODBC Driver 18 for SQL Server]Login timeout expired", F.FabricConnectionError),
    ("AADSTS50126: Error validating credentials", F.FabricAuthError),
    ("Login failed for user '<token-identified principal>'", F.FabricAuthError),
    ("User canceled authentication", F.FabricAuthError),
])
def test_erreurs_de_connexion_classees(settings, monkeypatch, msg, cls):
    def connect(cs, timeout=0):
        raise RuntimeError(msg)
    monkeypatch.setitem(sys.modules, "mssql_python", types.SimpleNamespace(connect=connect))
    with pytest.raises(cls) as ei:
        FabricSource(settings).ping()
    d = ei.value.to_dict()
    assert d["error"] == cls.code and d["message"] and d["hint"]


def test_colonne_manquante_nommee(settings, monkeypatch):
    _fake_mssql(monkeypatch, [_Conn(fail=[RuntimeError("[42S22] Invalid column name 'Sponsoring_Entity'.")])])
    with pytest.raises(F.FabricQueryError) as ei:
        FabricSource(settings).table("pi_out_product_active", ["A", "B"])
    assert "Sponsoring_Entity" in ei.value.message and ei.value.table == "pi_out_product_active"


def test_delai_de_requete(settings, monkeypatch):
    _fake_mssql(monkeypatch, [_Conn(fail=[RuntimeError("[HYT00] Query timeout expired")])])
    with pytest.raises(F.FabricTimeoutError):
        FabricSource(settings).table("JUMP_portfolio_aum", ["A", "B"])


def test_reconnexion_unique_apres_coupure(settings, monkeypatch):
    first = _Conn(fail=[RuntimeError("TCP Provider: connection reset")])
    seen = _fake_mssql(monkeypatch, [first, _Conn()])
    df = FabricSource(settings).table("PI_OUT_Share", ["A", "B"])
    assert len(df) == 2 and len(seen["calls"]) == 2 and first.closed


def test_ping_et_verification_de_table(settings, monkeypatch):
    conn = _Conn()
    conn.cursor = lambda: types.SimpleNamespace(execute=lambda sql, p: conn.log.append(sql), description=[("ok",)],
                                               fetchall=lambda: [(1,)], close=lambda: None)
    _fake_mssql(monkeypatch, [conn])
    src = FabricSource(settings)
    assert src.ping() >= 0
    src.check_table("PI_OUT_Share", ["pi_shareid", "ISIN_Code"])
    assert conn.log == ["SELECT 1 AS ok", "SELECT TOP 0 [pi_shareid], [ISIN_Code] FROM [dbo].[PI_OUT_Share]"]


def test_refuse_toute_ecriture(settings, monkeypatch):
    _fake_mssql(monkeypatch, [_Conn()])
    with pytest.raises(ValueError):
        FabricSource(settings).query("DELETE FROM [dbo].[PI_OUT_Share]")
