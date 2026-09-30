"""API HTTP (lecture seule) et service des fichiers de l'interface."""
from __future__ import annotations

import logging
import math
from datetime import date
import time
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import load_settings
from .data.sources import make_source
from .domain.model import build_model
from .service import FUND_DIMS, SHARE_DIMS, Service

log = logging.getLogger("rco")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")

app = FastAPI(title="Rothschild & Co — Fonds & encours", docs_url=None, redoc_url=None)
app.add_middleware(GZipMiddleware, minimum_size=1024)
_service: Service | None = None


def service() -> Service:
    global _service
    if _service is None:
        s = load_settings()
        t0 = time.time()
        model = build_model(make_source(s), stale_days=s.stale_days, history_years=s.history_years, is_mock=s.data_source != "fabric")
        _service = Service(model, s.rmm_columns, s.rmm_pattern)
        log.info("Modèle chargé en %.1f s (%d fonds, %d parts)", time.time() - t0, len(model.funds), len(model.link))
    return _service


@app.on_event("startup")
def _warm_up():
    """Charge le modèle et précalcule les vues principales en tâche de fond."""
    import threading

    def run():
        svc = service()
        for fn in (svc.overview, svc.city, svc._fund_table, svc.search_index, svc.controls, svc.risk, svc.holdings, svc.distribution):
            try:
                fn(None)
            except Exception:  # un échec de préchauffage ne doit pas empêcher le démarrage
                log.exception("Préchauffage")
    threading.Thread(target=run, daemon=True).start()


def _sanitize(o):
    if isinstance(o, dict):
        return {str(k): _sanitize(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_sanitize(v) for v in o]
    if isinstance(o, float):
        return None if math.isnan(o) or math.isinf(o) else o
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
    return _ok(service().meta())


@app.get("/api/overview")
def overview(date: str | None = None):
    return _ok(service().overview(date))


@app.get("/api/city")
def city(date: str | None = None):
    return _ok(service().city(date))


@app.get("/api/search-index")
def search_index(date: str | None = None):
    return _ok(service().search_index(date))


_FILTERS = ["family", "range", "asset_class", "expertise", "manager", "sfdr", "sri", "domicile", "legal_form", "currency", "amf", "country", "q"]


@app.get("/api/funds")
def funds(request: Request, date: str | None = None):
    f = {k: v for k, v in request.query_params.items() if k in _FILTERS and v}
    return _ok(service().funds(date, f))


@app.get("/api/funds/{fid}")
def fund(fid: str, date: str | None = None):
    return _ok(service().fund(fid, date))


@app.get("/api/shares/{sid}")
def share(sid: str, date: str | None = None):
    return _ok(service().share(sid, date))


@app.get("/api/breakdown/{dim}")
def breakdown(dim: str, date: str | None = None):
    if dim not in FUND_DIMS and dim not in SHARE_DIMS:
        raise HTTPException(404, "Axe inconnu")
    return _ok(service().breakdown(date, dim))


@app.get("/api/holdings")
def holdings(date: str | None = None):
    return _ok(service().holdings(date))


@app.get("/api/instruments")
def instrument(key: str = Query(...), date: str | None = None):
    return _ok(service().instrument(key, date))


def _no_rmm(v: str | None) -> bool:
    """`?rmm=exclure` retire les fonds Rothschild Martin Maurel de la distribution."""
    return (v or "").strip().lower() in {"exclure", "sans", "0", "false", "non"}


@app.get("/api/distribution")
def distribution(date: str | None = None, rmm: str | None = None):
    return _ok(service().distribution(date, _no_rmm(rmm)))


@app.get("/api/countries/{name}")
def country(name: str, date: str | None = None, rmm: str | None = None):
    return _ok(service().country(name, date, _no_rmm(rmm)))


@app.get("/api/risk")
def risk(date: str | None = None):
    return _ok(service().risk(date))


@app.get("/api/controls")
def controls(date: str | None = None):
    return _ok(service().controls(date))


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
