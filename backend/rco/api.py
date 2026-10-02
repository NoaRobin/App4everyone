"""API HTTP (lecture seule) et service des fichiers de l'interface."""
from __future__ import annotations

import logging
import math
import threading
import time
import traceback
from datetime import date
from decimal import Decimal
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import fabric_config_problems, load_settings
from .data.fabric import FabricConfigError, FabricError
from .data.sources import make_source
from .domain.model import build_model
from .domain.numeric import safe_float
from .service import FUND_DIMS, SHARE_DIMS, Service

log = logging.getLogger("rco")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
# Bibliothèques d'authentification Microsoft : seulement les avertissements (leurs journaux HTTP détaillés sont inutiles ici)
for _noisy in ("azure", "msal", "urllib3"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

app = FastAPI(title="Rothschild & Co — Fonds & encours", docs_url=None, redoc_url=None)
app.add_middleware(GZipMiddleware, minimum_size=1024)


# ---------------------------------------------------------------- cycle de vie du modèle
class ServiceUnavailable(Exception):
    """Le modèle n'est pas (encore) disponible : chargement en cours ou échec du dernier chargement."""

    def __init__(self, code: str, message: str, status: int = 503, **extra):
        super().__init__(message)
        self.code, self.message, self.status, self.extra = code, message, status, extra


class _State:
    """Un seul modèle par processus, construit une seule fois (verrou), avec son état consultable."""

    def __init__(self):
        self.lock = threading.Lock()
        self.service: Service | None = None
        self.source = None
        self.state = "idle"          # idle | loading | ready | error
        self.started: float | None = None
        self.loaded_in: float | None = None
        self.error: dict | None = None
        self.failed_at: float | None = None
        self.builds = 0              # nombre de constructions effectivement lancées (tests)
        self.step: str | None = None  # étape en cours du chargement (affichée par le bandeau d'état)
        self.passif = None           # partie Passif (agrégats comptes / positions / transactions), calculée à part


_S = _State()
RETRY_AFTER_S = 30  # après un échec, pas de nouvelle tentative (ni de nouvelle fenêtre Microsoft) avant ce délai


def _source(settings):
    """Source de données unique du processus (la connexion Fabric est partagée par le modèle et /api/health/fabric)."""
    if _S.source is None:
        _S.source = make_source(settings)
    return _S.source


def service(wait: bool = True) -> Service:
    if _S.service is not None:
        return _S.service
    if not wait:
        if _S.state == "loading":
            raise ServiceUnavailable("model_loading", "Chargement des données en cours…", 503,
                                     elapsed_s=round(time.time() - (_S.started or time.time()), 1))
    acquired = _S.lock.acquire(blocking=wait)
    if not acquired:
        raise ServiceUnavailable("model_loading", "Chargement des données en cours…", 503)
    try:
        if _S.service is not None:
            return _S.service
        if _S.state == "error" and _S.failed_at and time.time() - _S.failed_at < RETRY_AFTER_S:
            raise ServiceUnavailable(_S.error.get("error", "model_error"), _S.error.get("message", "Chargement impossible."),
                                     _S.error.get("status", 503), **{k: v for k, v in _S.error.items() if k not in ("error", "message", "status")})
        s = load_settings()
        _S.state, _S.started, _S.error = "loading", time.time(), None
        _S.builds += 1
        t0 = time.time()
        log.info("Construction du modèle (source %s)…", s.data_source)
        try:
            src = _source(s)
            model = build_model(src, stale_days=s.stale_days, history_years=s.history_years, is_mock=s.data_source != "fabric",
                                report=_set_step)
            svc = Service(model, s.rmm_columns, s.rmm_pattern)
            _prepare_views(svc)
        except FabricError as e:
            _S.state, _S.failed_at, _S.step = "error", time.time(), None
            _S.error = {**e.to_dict(), "status": e.status}
            log.error("Chargement du modèle impossible : %s — %s", e.code, e.message)
            raise
        except Exception as e:
            _S.state, _S.failed_at, _S.step = "error", time.time(), None
            _S.error = {"error": "model_error", "message": "Le chargement des données a échoué.", "detail": type(e).__name__, "status": 500}
            log.error("Chargement du modèle impossible (%s)\n%s", type(e).__name__, "".join(traceback.format_tb(e.__traceback__)))
            raise
        _S.loaded_in = time.time() - t0
        _S.service, _S.state, _S.step = svc, "ready", None
        log.info("Modèle chargé en %.1f s (%d fonds, %d parts)", _S.loaded_in, len(model.funds), len(model.link))
        return svc
    finally:
        _S.lock.release()


def _api_service() -> Service:
    """Pour les routes : ne bloque pas pendant un chargement (réponse 503 « chargement en cours » immédiate)."""
    return service(wait=_S.state not in ("loading",))


def _set_step(label: str) -> None:
    _S.step = label
    log.info("Chargement : %s", label)


# Vues précalculées pendant le chargement (date par défaut) : une fois le modèle prêt, les pages principales répondent
# immédiatement au lieu de calculer à la première visite (plusieurs secondes chacune avec les volumes réels).
_VIEWS = (("liste des fonds", "_fund_table"), ("vue d'ensemble", "overview"), ("revenus", "revenue"), ("panorama", "city"), ("recherche", "search_index"),
          ("risques", "risk"), ("contrôles", "controls"), ("portefeuilles", "holdings"), ("distribution", "distribution"))


def _prepare_views(svc: Service) -> None:
    for i, (label, name) in enumerate(_VIEWS, 1):
        _set_step(f"Préparation des vues ({i}/{len(_VIEWS)}) : {label}")
        t = time.perf_counter()
        try:
            getattr(svc, name)(None)
        except Exception as e:  # une vue en échec sera recalculée (et son erreur renvoyée) à la demande
            log.error("Préchauffage %s : %s", name, type(e).__name__)
        log.info("Vue %s prête en %.1f s", name, time.perf_counter() - t)


@app.on_event("startup")
def _warm_up():
    """Charge le modèle (et précalcule les vues principales) en tâche de fond dès le démarrage du serveur."""
    def run():
        try:
            service()
        except Exception:
            return  # l'erreur est conservée dans l'état et renvoyée par /api/health et les routes
        try:
            passif_obj().get()      # le passif se prépare ensuite, sans retarder l'ouverture de l'application
        except Exception as e:
            log.warning("Passif non préparé (%s)", type(e).__name__)
    threading.Thread(target=run, daemon=True, name="rco-warmup").start()


def passif_obj():
    """Partie Passif : agrégats calculés dans la source (Fabric) ou sur des données synthétiques, cache de quelques
    heures (les tables sont mises à jour chaque jour)."""
    if _S.passif is not None:
        return _S.passif
    from .domain import passif as P
    svc = service()
    s = load_settings()
    src = _source(s)
    m = svc.m
    isin_to_fund: dict[str, str] = {}
    if "ISIN_Code" in m.shares and "ProductID" in m.shares:
        for isin, pid in zip(m.shares["ISIN_Code"], m.shares["ProductID"]):
            if isinstance(isin, str) and pid in m.funds.index:
                isin_to_fund.setdefault(isin.strip().upper(), pid)
    for isin, fid in zip(m.link["CODE_ISIN_PART"], m.link["fund_id"]):
        if isinstance(isin, str):
            isin_to_fund.setdefault(isin.strip().upper(), fid)
    if s.data_source == "fabric":
        reader = P.SqlReader(src, P.table_names())
    else:
        from .data.passif_mock import PassifMock
        by_class: dict[str, list[str]] = {}
        if "ISIN_Code" in m.shares and "Asset_Class" in m.funds:
            for isin, pid in zip(m.shares["ISIN_Code"], m.shares["ProductID"]):
                if isinstance(isin, str) and pid in m.funds.index:
                    by_class.setdefault(str(m.funds.at[pid, "Asset_Class"]), []).append(isin)
        mock = PassifMock(src.reference_date, by_class, scale=s.mock_scale)
        reader = P.PandasReader(mock.table)
    ttl = float(__import__("os").environ.get("APP_PASSIF_TTL_HOURS") or 6)
    names = {fid: str(n) for fid, n in m.funds["name"].items()} if "name" in m.funds else {}
    _S.passif = P.Passif(reader, isin_to_fund, ttl_hours=ttl, fund_names=names)
    return _S.passif


@app.get("/api/passif")
def passif_view():
    _api_service()
    return _ok(passif_obj().get())


@app.get("/api/passif/fonds/{fid}")
def passif_fund(fid: str):
    _api_service()
    d = passif_obj().get()
    return _ok({"available": bool(d.get("available")), "as_of": d.get("positions_as_of"), "source": d.get("source"),
                "fund": (d.get("funds") or {}).get(fid)})


# ---------------------------------------------------------------- erreurs JSON
@app.exception_handler(ServiceUnavailable)
def _unavailable(_: Request, e: ServiceUnavailable):
    headers = {"Retry-After": "3"} if e.code == "model_loading" else {}
    return JSONResponse({"error": e.code, "message": e.message, **e.extra}, status_code=e.status, headers=headers)


@app.exception_handler(FabricError)
def _fabric_error(_: Request, e: FabricError):
    return JSONResponse(e.to_dict(), status_code=e.status)


@app.exception_handler(StarletteHTTPException)
def _http_error(_: Request, e: StarletteHTTPException):
    code = {404: "not_found", 405: "method_not_allowed"}.get(e.status_code, "http_error")
    return JSONResponse({"error": code, "message": str(e.detail)}, status_code=e.status_code)


@app.exception_handler(RequestValidationError)
def _validation_error(_: Request, e: RequestValidationError):
    return JSONResponse({"error": "bad_request", "message": "Paramètres invalides.",
                         "detail": [".".join(map(str, x.get("loc", []))) for x in e.errors()]}, status_code=422)


@app.exception_handler(Exception)
def _internal_error(request: Request, e: Exception):
    # Type et emplacement seulement : le message d'une exception peut contenir des valeurs métier
    log.error("Erreur %s sur %s\n%s", type(e).__name__, request.url.path, "".join(traceback.format_tb(e.__traceback__)))
    return JSONResponse({"error": "internal", "message": "Erreur interne du serveur.", "detail": type(e).__name__}, status_code=500)


# ---------------------------------------------------------------- santé
@app.get("/api/health")
def health():
    """État du serveur et du modèle, sans jamais déclencher de chargement ni de connexion."""
    s = load_settings()
    body = {"status": "ok", "source": s.data_source, "model": {"state": _S.state}}
    if s.data_source == "fabric":
        body["fabric"] = {"client": s.fabric_client, "server": s.fabric_server, "database": s.fabric_database,
                          "config_problems": fabric_config_problems(s)}
    if _S.state == "loading" and _S.started:
        body["model"]["elapsed_s"] = round(time.time() - _S.started, 1)
        if _S.step:
            body["model"]["step"] = _S.step
        prog = getattr(_S.source, "progress", None)
        if prog:
            body["model"]["progress"] = [{"table": k, **{kk: v.get(kk) for kk in ("rows", "total", "done")}} for k, v in list(prog.items())]
    if _S.state == "ready":
        body["model"]["loaded_in_s"] = round(_S.loaded_in or 0, 1)
    if _S.state == "error" and _S.error:
        body["model"]["error"] = {k: v for k, v in _S.error.items() if k != "status"}
    return JSONResponse(body, headers={"Cache-Control": "no-store"})


@app.get("/api/health/fabric")
def health_fabric():
    """Test de la connexion Fabric (SELECT 1), sans charger le modèle."""
    s = load_settings()
    if s.data_source != "fabric":
        return JSONResponse({"status": "skipped", "source": s.data_source, "message": "Application en données fictives (APP_DATA_SOURCE=mock)."},
                            headers={"Cache-Control": "no-store"})
    problems = fabric_config_problems(s)
    if problems:
        raise FabricConfigError(" ".join(problems))
    src = _source(s)
    if getattr(src, "busy", lambda: False)():
        return JSONResponse({"status": "busy", "client": s.fabric_client, "model": _S.state,
                             "message": "Connexion Fabric active : chargement des tables en cours."}, headers={"Cache-Control": "no-store"})
    latency = src.ping()
    return JSONResponse({"status": "ok", "client": s.fabric_client, "server": s.fabric_server, "database": s.fabric_database,
                         "latency_ms": round(latency, 1), "model": _S.state}, headers={"Cache-Control": "no-store"})


def _sanitize(o):
    if isinstance(o, dict):
        return {str(k): _sanitize(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_sanitize(v) for v in o]
    if isinstance(o, float):
        return None if math.isnan(o) or math.isinf(o) else o
    if isinstance(o, Decimal):
        return safe_float(o)  # DECIMAL SQL (mssql-python) : float fini ou null
    if isinstance(o, np.generic):
        return _sanitize(o.item())
    if isinstance(o, (pd.Timestamp, date)):
        return None if pd.isna(o) else o.isoformat()[:10]
    if o is pd.NaT:
        return None
    return o


def _ok(payload):
    if payload is None:
        raise HTTPException(404, "Introuvable")
    return JSONResponse(_sanitize(payload), headers={"Cache-Control": "private, max-age=300"})


@app.get("/api/meta")
def meta():
    return _ok(_api_service().meta())


@app.get("/api/compare")
def compare(ids: str = "", period: str = "3A", date: str | None = None):
    keys = tuple(x for x in (i.strip() for i in ids.split(",")) if x)[:6]
    if period not in ("1A", "3A", "5A", "origine"):
        raise HTTPException(400, "Période inconnue")
    return _ok(_api_service().compare(keys, period, date))


@app.get("/api/revenue")
def revenue(date: str | None = None):
    return _ok(_api_service().revenue(date))


@app.get("/api/overview")
def overview(date: str | None = None):
    return _ok(_api_service().overview(date))


@app.get("/api/city")
def city(date: str | None = None):
    return _ok(_api_service().city(date))


@app.get("/api/search-index")
def search_index(date: str | None = None):
    return _ok(_api_service().search_index(date))


_FILTERS = ["family", "range", "asset_class", "expertise", "manager", "sfdr", "sri", "domicile", "legal_form", "currency", "amf", "country", "q"]


@app.get("/api/funds")
def funds(request: Request, date: str | None = None):
    f = {k: v for k, v in request.query_params.items() if k in _FILTERS and v}
    return _ok(_api_service().funds(date, f))


@app.get("/api/funds/{fid}")
def fund(fid: str, date: str | None = None):
    return _ok(_api_service().fund(fid, date))


@app.get("/api/shares/{sid}")
def share(sid: str, date: str | None = None):
    return _ok(_api_service().share(sid, date))


@app.get("/api/breakdown/{dim}")
def breakdown(dim: str, date: str | None = None):
    if dim not in FUND_DIMS and dim not in SHARE_DIMS:
        raise HTTPException(404, "Axe inconnu")
    return _ok(_api_service().breakdown(date, dim))


@app.get("/api/holdings")
def holdings(date: str | None = None):
    return _ok(_api_service().holdings(date))


@app.get("/api/instruments")
def instrument(key: str = Query(...), date: str | None = None):
    return _ok(_api_service().instrument(key, date))


def _no_rmm(v: str | None) -> bool:
    """`?rmm=exclure` retire les fonds Rothschild Martin Maurel de la distribution."""
    return (v or "").strip().lower() in {"exclure", "sans", "0", "false", "non"}


@app.get("/api/distribution")
def distribution(date: str | None = None, rmm: str | None = None):
    return _ok(_api_service().distribution(date, _no_rmm(rmm)))


@app.get("/api/countries/{name}")
def country(name: str, date: str | None = None, rmm: str | None = None):
    return _ok(_api_service().country(name, date, _no_rmm(rmm)))


@app.get("/api/risk")
def risk(date: str | None = None):
    return _ok(_api_service().risk(date))


@app.get("/api/diagnostics/links")
def diagnostics_links():
    """Compteurs de rattachement des parts et des fonds (JUMP ↔ Product Info), ISIN ambigus, doublons restants."""
    return _sanitize(_api_service().links())


@app.get("/api/controls")
def controls(date: str | None = None):
    return _ok(_api_service().controls(date))


# ---------------------------------------------------------------- interface (build Vite)
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    for sub in ("a", "assets"):
        if (DIST / sub).is_dir():
            app.mount(f"/{sub}", StaticFiles(directory=DIST / sub), name=f"static-{sub}")

    @app.get("/{path:path}")
    def spa(path: str):
        target = DIST / path
        if path and target.is_file() and DIST in target.resolve().parents:
            return FileResponse(target)
        return FileResponse(DIST / "index.html")
