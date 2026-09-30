"""API : santé, construction unique du modèle, erreurs JSON propres (sans réseau)."""
import threading
import time

import pytest
from fastapi.testclient import TestClient

from rco import api
from rco.data import fabric as F


@pytest.fixture()
def fresh(monkeypatch):
    """État du modèle vierge pour le test, restauré ensuite (les autres tests gardent leur modèle)."""
    saved = api._S
    api._S = api._State()
    monkeypatch.setenv("APP_DATA_SOURCE", "mock")
    yield api._S
    api._S = saved


@pytest.fixture()
def client():
    return TestClient(api.app, raise_server_exceptions=False)


def test_health_ne_charge_rien(fresh, client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["source"] == "mock" and body["model"]["state"] == "idle"
    assert fresh.builds == 0


def test_health_fabric_ignore_en_mock(fresh, client):
    r = client.get("/api/health/fabric")
    assert r.status_code == 200 and r.json()["status"] == "skipped"


def test_un_seul_modele_meme_en_parallele(fresh, monkeypatch):
    real = api.build_model
    calls = []

    def slow(*a, **k):
        calls.append(1)
        time.sleep(0.3)
        return real(*a, **k)

    monkeypatch.setattr(api, "build_model", slow)
    out, errs = [], []

    def hit():
        try:
            out.append(api.service())
        except Exception as e:  # pragma: no cover
            errs.append(e)

    ts = [threading.Thread(target=hit) for _ in range(8)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert not errs and len(calls) == 1 and fresh.builds == 1
    assert len({id(s) for s in out}) == 1 and fresh.state == "ready"


def test_pendant_le_chargement_503_json(fresh, client):
    fresh.state, fresh.started = "loading", time.time()
    fresh.lock.acquire()
    try:
        r = client.get("/api/meta")
    finally:
        fresh.lock.release()
    assert r.status_code == 503 and r.headers.get("Retry-After")
    assert r.json()["error"] == "model_loading"


def test_echec_fabric_json_explicite_sans_relance_immediate(fresh, client, monkeypatch):
    monkeypatch.setenv("APP_DATA_SOURCE", "fabric")
    monkeypatch.setenv("FABRIC_SQL_SERVER", "abc12de34fgh.datawarehouse.fabric.microsoft.com")
    monkeypatch.setenv("FABRIC_SQL_DATABASE", "LKH_RFPTeam_Bronze")
    n = {"calls": 0}

    def boom(settings):
        n["calls"] += 1
        raise F.FabricConnectionError("Impossible de joindre le SQL analytics endpoint Fabric.", detail="TCP Provider: 0x2749")

    monkeypatch.setattr(api, "make_source", boom)
    r = client.get("/api/meta")
    assert r.status_code == 503
    j = r.json()
    assert j["error"] == "fabric_connection" and j["message"] and j["hint"]
    r2 = client.get("/api/meta")  # dans le délai de relance : même erreur, pas de nouvelle tentative
    assert r2.status_code == 503 and r2.json()["error"] == "fabric_connection" and n["calls"] == 1
    h = client.get("/api/health").json()
    assert h["model"]["state"] == "error" and h["model"]["error"]["error"] == "fabric_connection"


def test_configuration_fabric_placeholder(fresh, client, monkeypatch):
    monkeypatch.setenv("APP_DATA_SOURCE", "fabric")
    monkeypatch.setenv("FABRIC_SQL_SERVER", "<serveur du SQL analytics endpoint>")
    monkeypatch.setenv("FABRIC_SQL_DATABASE", "LKH_RFPTeam_Bronze")
    r = client.get("/api/health/fabric")
    assert r.status_code == 500 and r.json()["error"] == "fabric_config"
    assert client.get("/api/health").json()["fabric"]["config_problems"]


def test_health_fabric_select_1(fresh, client, monkeypatch):
    monkeypatch.setenv("APP_DATA_SOURCE", "fabric")
    monkeypatch.setenv("FABRIC_SQL_SERVER", "abc12de34fgh.datawarehouse.fabric.microsoft.com")
    monkeypatch.setenv("FABRIC_SQL_DATABASE", "LKH_RFPTeam_Bronze")

    class Src:
        def busy(self): return False
        def ping(self): return 12.3

    fresh.source = Src()
    r = client.get("/api/health/fabric")
    assert r.status_code == 200 and r.json()["status"] == "ok" and r.json()["latency_ms"] == 12.3
    assert fresh.builds == 0  # le test de connexion ne charge pas le modèle


def test_erreurs_json(fresh, client, monkeypatch):
    assert client.get("/api/breakdown/inconnu").json()["error"] == "not_found"

    def crash(*a, **k):
        raise KeyError("valeur métier à ne pas exposer")

    svc = api.service()
    monkeypatch.setattr(svc, "meta", crash)
    r = client.get("/api/meta")
    assert r.status_code == 500 and r.json() == {"error": "internal", "message": "Erreur interne du serveur.", "detail": "KeyError"}
