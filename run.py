#!/usr/bin/env python3
"""Lanceur de l'application Rothschild & Co — Fonds & encours.

    python run.py              données fictives, http://127.0.0.1:8000
    python run.py --fabric     Lakehouse Fabric (FABRIC_SQL_SERVER / FABRIC_SQL_DATABASE)
    python run.py --dev        mode développement (rechargement à chaud du front sur :5173)
    python run.py --test       lance les tests back-end et front-end

Au premier lancement : création de l'environnement Python (.venv), installation des dépendances,
compilation de l'interface. Les lancements suivants démarrent directement.
Les variables d'un fichier .env à la racine sont lues (jamais affichées).
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import venv
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV = ROOT / ".venv"
WIN = os.name == "nt"
PY = VENV / ("Scripts/python.exe" if WIN else "bin/python")
NPM = "npm.cmd" if WIN else "npm"


def say(msg: str) -> None:
    print(f"\033[38;5;179m▸\033[0m {msg}", flush=True)


def run(cmd: list, cwd: Path, env: dict | None = None) -> None:
    subprocess.run(cmd, cwd=cwd, env=env, check=True)


def load_env_file(env: dict) -> None:
    f = ROOT / ".env"
    if not f.exists():
        return
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ and v:
            env[k] = v
    say("Configuration .env chargée")


def ensure_python(dev: bool) -> None:
    stamp = VENV / (".deps-dev" if dev else ".deps")
    req = BACKEND / ("requirements-dev.txt" if dev else "requirements.txt")
    if not PY.exists():
        say("Création de l'environnement Python (.venv)…")
        venv.create(VENV, with_pip=True)
    if not stamp.exists() or stamp.stat().st_mtime < req.stat().st_mtime:
        say("Installation des dépendances Python…")
        run([str(PY), "-m", "pip", "install", "-q", "--disable-pip-version-check", "-r", str(req)], ROOT)
        stamp.touch()


def ensure_node() -> None:
    if not shutil.which(NPM):
        sys.exit("Node.js (npm) est requis pour compiler l'interface : https://nodejs.org")
    if not (FRONTEND / "node_modules").exists():
        say("Installation des dépendances de l'interface…")
        run([NPM, "ci" if (FRONTEND / "package-lock.json").exists() else "install", "--no-audit", "--no-fund"], FRONTEND)


def newest(path: Path) -> float:
    return max((p.stat().st_mtime for p in path.rglob("*") if p.is_file()), default=0.0)


def ensure_build(force: bool) -> None:
    dist = FRONTEND / "dist" / "index.html"
    sources = max(newest(FRONTEND / "src"), (FRONTEND / "index.html").stat().st_mtime, (FRONTEND / "package.json").stat().st_mtime)
    if force or not dist.exists() or dist.stat().st_mtime < sources:
        ensure_node()
        say("Compilation de l'interface…")
        run([NPM, "run", "build"], FRONTEND)


def open_when_ready(api: str, url: str, browser: bool) -> None:
    def wait():
        for _ in range(240):
            try:
                urllib.request.urlopen(api + "/api/meta", timeout=2)
                say(f"Prêt : {url}")
                if browser:
                    webbrowser.open(url)
                return
            except Exception:
                time.sleep(0.5)
    threading.Thread(target=wait, daemon=True).start()


def main() -> None:
    ap = argparse.ArgumentParser(description="Lance l'application Fonds & encours.")
    ap.add_argument("--fabric", action="store_true", help="utiliser le Lakehouse Fabric plutôt que les données fictives")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1", help="adresse d'écoute (127.0.0.1 par défaut : poste local uniquement)")
    ap.add_argument("--dev", action="store_true", help="mode développement (front sur :5173 avec rechargement à chaud)")
    ap.add_argument("--rebuild", action="store_true", help="recompiler l'interface")
    ap.add_argument("--test", action="store_true", help="lancer les tests puis quitter")
    ap.add_argument("--no-browser", action="store_true", help="ne pas ouvrir le navigateur")
    a = ap.parse_args()

    if sys.version_info < (3, 11):
        sys.exit("Python 3.11 ou plus récent est requis.")

    env = dict(os.environ)
    load_env_file(env)
    if a.fabric:
        env["APP_DATA_SOURCE"] = "fabric"
    source = env.get("APP_DATA_SOURCE", "mock").lower()
    if source == "fabric" and not (env.get("FABRIC_SQL_SERVER") and env.get("FABRIC_SQL_DATABASE")):
        sys.exit("Mode Fabric : définissez FABRIC_SQL_SERVER et FABRIC_SQL_DATABASE (variables d'environnement ou fichier .env).")

    ensure_python(dev=a.test or a.dev)

    if a.test:
        say("Tests back-end…")
        run([str(PY), "-m", "pytest", "-q", "tests"], BACKEND, env)
        ensure_node()
        say("Tests front-end…")
        run([NPM, "test"], FRONTEND, env)
        say("Tous les tests sont passés.")
        return

    procs: list[subprocess.Popen] = []
    if a.dev:
        ensure_node()
        procs.append(subprocess.Popen([NPM, "run", "dev", "--", "--port", "5173"], cwd=FRONTEND, env=env))
        url = "http://localhost:5173"
    else:
        ensure_build(a.rebuild)
        url = f"http://{'127.0.0.1' if a.host in ('0.0.0.0', '::') else a.host}:{a.port}"

    say("Source des données : " + ("Lakehouse Fabric (une fenêtre de connexion Microsoft va s'ouvrir)" if source == "fabric" else "données fictives"))
    open_when_ready(f"http://127.0.0.1:{a.port}", url, not a.no_browser)
    cmd = [str(PY), "-m", "uvicorn", "rco.api:app", "--host", a.host, "--port", str(a.port)] + (["--reload"] if a.dev else [])
    try:
        procs.append(subprocess.Popen(cmd, cwd=BACKEND, env=env))
        say("Ctrl+C pour arrêter.")
        procs[-1].wait()
    except KeyboardInterrupt:
        pass
    finally:
        for p in procs:
            if p.poll() is None:
                p.terminate()
        say("Arrêté.")


if __name__ == "__main__":
    main()
