"""Lanceur run.py : choix de l'environnement Python (sans jamais recréer un environnement valide), configuration Fabric."""
import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture()
def run(monkeypatch):
    spec = importlib.util.spec_from_file_location("rco_run", ROOT / "run.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.delenv("RCO_VENV", raising=False)
    return mod


def _valid(*paths):
    ok = {str(p) for p in paths}
    return lambda py: any(str(py).startswith(p) for p in ok)


def test_rco_venv_valide_prioritaire(run, monkeypatch, tmp_path):
    a, b = tmp_path / "a", tmp_path / "venv-rco"
    monkeypatch.setenv("RCO_VENV", str(a))
    monkeypatch.setattr(run, "KNOWN_VENVS", [b])
    monkeypatch.setattr(run, "python_ok", _valid(a, b))
    assert run.resolve_venv() == (a, "RCO_VENV")


def test_venv_rco_du_poste_si_rco_venv_absent(run, monkeypatch, tmp_path):
    b = tmp_path / "venv-rco"
    monkeypatch.setattr(run, "KNOWN_VENVS", [b])
    monkeypatch.setattr(run, "python_ok", _valid(b))
    assert run.resolve_venv() == (b, "poste")


def test_rco_venv_invalide_mais_venv_rco_valide(run, monkeypatch, tmp_path):
    a, b = tmp_path / "casse", tmp_path / "venv-rco"
    monkeypatch.setenv("RCO_VENV", str(a))
    monkeypatch.setattr(run, "KNOWN_VENVS", [b])
    monkeypatch.setattr(run, "python_ok", _valid(b))
    assert run.resolve_venv() == (b, "poste")


def test_sinon_environnement_gere(run, monkeypatch, tmp_path):
    monkeypatch.setattr(run, "KNOWN_VENVS", [tmp_path / "absent"])
    monkeypatch.setattr(run, "python_ok", lambda py: False)
    path, origin = run.resolve_venv()
    assert origin == "géré" and path == run._managed_venv()


def test_python_du_store_hors_localappdata(run, monkeypatch):
    monkeypatch.setattr(run, "WIN", True)
    monkeypatch.setattr(sys, "executable", r"C:\Users\x\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\python.exe")
    assert run.store_python()
    assert run._managed_venv() == Path.home() / "venv-rco"


def test_environnement_valide_jamais_recree(run, monkeypatch, tmp_path):
    v = tmp_path / "venv-rco"
    v.mkdir()
    monkeypatch.setattr(run, "VENV", v)
    monkeypatch.setattr(run, "VENV_ORIGIN", "poste")
    monkeypatch.setattr(run, "PY", v / "python")
    monkeypatch.setattr(run, "venv_ok", lambda: True)
    monkeypatch.setattr(run, "has_modules", lambda mods: True)   # dépendances présentes : aucune installation
    called = []
    monkeypatch.setattr(run.venv, "create", lambda *a, **k: called.append("create"))
    monkeypatch.setattr(run.shutil, "rmtree", lambda *a, **k: called.append("rmtree"))
    monkeypatch.setattr(run, "run", lambda *a, **k: called.append("pip"))
    run.ensure_python(["fabric"])
    assert called == [] and v.exists()


def test_installe_seulement_ce_qui_manque(run, monkeypatch, tmp_path):
    monkeypatch.setattr(run, "venv_ok", lambda: True)
    monkeypatch.setattr(run, "has_pip", lambda: True)
    state = {"mssql": False}
    monkeypatch.setattr(run, "has_modules", lambda mods: state["mssql"] or mods != ["mssql_python"])
    installed = []

    def pip(cmd, *a, **k):
        installed.append(Path(cmd[-1]).name)
        state["mssql"] = True

    monkeypatch.setattr(run, "run", pip)
    run.ensure_python(["fabric"])
    assert installed == ["requirements-fabric.txt"]


def test_environnement_utilisateur_casse_jamais_supprime(run, monkeypatch, tmp_path):
    v = tmp_path / "venv-rco"
    v.mkdir()
    monkeypatch.setattr(run, "VENV", v)
    monkeypatch.setattr(run, "VENV_ORIGIN", "poste")
    monkeypatch.setattr(run, "venv_ok", lambda: False)
    monkeypatch.setattr(run.shutil, "rmtree", lambda *a, **k: pytest.fail("ne doit pas supprimer"))
    with pytest.raises(SystemExit):
        run.ensure_python([])
    assert v.exists()


@pytest.mark.parametrize("server,ok", [("<serveur du SQL analytics endpoint>", False), ("xxxxxxxx.datawarehouse.fabric.microsoft.com", False),
                                       ("abc12de34fgh.datawarehouse.fabric.microsoft.com", True)])
def test_placeholders_refuses_au_lancement(run, server, ok):
    env = {"APP_DATA_SOURCE": "fabric", "FABRIC_SQL_SERVER": server, "FABRIC_SQL_DATABASE": "LKH_RFPTeam_Bronze"}
    if ok:
        run.fabric_config(env)
    else:
        with pytest.raises(SystemExit):
            run.fabric_config(env)


def test_odbc_jamais_verifie_avec_mssql_python(run, monkeypatch):
    monkeypatch.setattr(run, "has_modules", lambda mods: pytest.fail("aucune vérification pyodbc / ODBC attendue"))
    run.check_fabric_client({"FABRIC_CLIENT": "mssql-python"})
    run.check_fabric_client({})
