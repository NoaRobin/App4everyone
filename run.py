#!/usr/bin/env python3
"""Lanceur de l'application Rothschild & Co — Fonds & encours.

    python run.py              données fictives (aucune connexion, aucun Node.js requis)
    python run.py --fabric     Lakehouse Fabric (FABRIC_SQL_SERVER / FABRIC_SQL_DATABASE)
    python run.py --doctor     diagnostic du poste (Python, pip, Node, port)
    python run.py --dev        mode développement (rechargement à chaud, Node.js requis)
    python run.py --test       lance les tests

Au premier lancement : création de l'environnement Python (.venv) et installation des dépendances.
L'interface est livrée déjà compilée (frontend/dist) : Node.js n'est nécessaire que pour la modifier.
Les variables d'un fichier .env à la racine sont lues (jamais affichées).
"""
from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import socket
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
DIST = FRONTEND / "dist"
WIN = os.name == "nt"
OLD_VENV = ROOT / ".venv"


def _venv_dir() -> Path:
    """Environnement Python hors du dossier du projet, dans un chemin local court.

    Un projet placé dans un dossier OneDrive/SharePoint ou dans un chemin long casse l'environnement
    (limite Windows de 260 caractères, synchronisation des milliers de fichiers de pip et pandas).
    """
    if os.environ.get("RCO_VENV"):
        return Path(os.environ["RCO_VENV"])
    key = hashlib.sha1(str(ROOT).lower().encode()).hexdigest()[:8]
    if WIN:
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "RCoFonds"
    else:
        base = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "rco-fonds"
    return base / f"venv-{key}"


VENV = _venv_dir()
PY = VENV / ("Scripts/python.exe" if WIN else "bin/python")
NPM = "npm.cmd" if WIN else "npm"
MIN_PY = (3, 10)

# Console Windows : accents et symboles sans plantage, couleurs si le terminal les accepte
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if WIN:
    os.system("")
COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")


def say(msg: str) -> None:
    print(("\033[38;5;179m>\033[0m " if COLOR else "> ") + msg, flush=True)


def fail(msg: str, hint: str | None = None) -> None:
    print(("\033[38;5;167m✗\033[0m " if COLOR else "ERREUR : ") + msg, file=sys.stderr, flush=True)
    if hint:
        print("  " + hint.replace("\n", "\n  "), file=sys.stderr, flush=True)
    sys.exit(1)


def run(cmd: list, cwd: Path, env: dict | None = None, what: str = "", hint: str | None = None) -> None:
    try:
        subprocess.run(cmd, cwd=cwd, env=env, check=True)
    except FileNotFoundError:
        fail(f"Commande introuvable : {cmd[0]}", hint)
    except subprocess.CalledProcessError as e:
        fail(f"Échec : {what or ' '.join(map(str, cmd))} (code {e.returncode}).", hint)


PIP_HINT = ("pip n'a pas pu télécharger les dépendances. Sur un poste d'entreprise, c'est généralement le proxy :\n"
            "  set HTTPS_PROXY=http://proxy:port   (Windows)   ou   export HTTPS_PROXY=http://proxy:port\n"
            "puis relancez. Détail complet : python run.py --doctor")


def load_env_file(env: dict) -> None:
    f = ROOT / ".env"
    if not f.exists():
        return
    for line in f.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ and v:
            env[k] = v
    say("Configuration .env chargée")


def venv_ok() -> bool:
    """L'environnement existe ET pip y est complet (un pip à moitié installé est le cas le plus fréquent)."""
    if not PY.exists():
        return False
    try:
        subprocess.run([str(PY), "-m", "pip", "--version"], check=True, capture_output=True, timeout=60)
        return True
    except Exception:
        return False


def warn_location() -> None:
    p = str(ROOT)
    synced = any(k in p for k in ("OneDrive", "SharePoint")) or " - Documents" in p
    if WIN and (len(p) > 150 or synced):
        say("Attention : le projet est dans un dossier synchronisé ou au chemin très long.")
        say("  L'environnement Python est placé ailleurs pour l'éviter, mais pour plus de fiabilité,")
        say(r"  copiez le dossier du projet dans un chemin court et local, par exemple C:\dev\App4everyone.")


def ensure_python(extras: list[str]) -> None:
    # Ancien environnement dans le dossier du projet (souvent cassé sous OneDrive) : on le supprime
    if OLD_VENV.exists() and (OLD_VENV / "pyvenv.cfg").exists() and OLD_VENV != VENV:
        say("Suppression de l'ancien environnement .venv du dossier du projet…")
        shutil.rmtree(OLD_VENV, ignore_errors=True)
    if not venv_ok():
        if VENV.exists():
            say("Environnement Python incomplet : recréation…")
            shutil.rmtree(VENV, ignore_errors=True)
        say(f"Création de l'environnement Python ({VENV})…")
        try:
            VENV.parent.mkdir(parents=True, exist_ok=True)
            venv.create(VENV, with_pip=True, clear=True)
        except Exception as e:  # pragma: no cover - dépend du poste
            fail(f"Impossible de créer l'environnement Python : {e}",
                 "Sous Linux : installez le paquet python3-venv. Sous Windows : réinstallez Python depuis python.org.")
        if not venv_ok():
            fail("L'environnement Python a été créé mais pip y est inutilisable.",
                 f"Supprimez le dossier {VENV} puis relancez. Si le problème persiste, réinstallez Python depuis python.org\n"
                 "(cocher « Add python.exe to PATH »), ou indiquez un autre emplacement : set RCO_VENV=C:\\venv-rco")
    reqs = [BACKEND / "requirements.txt"] + [BACKEND / f"requirements-{x}.txt" for x in extras]
    for req in reqs:
        stamp = VENV / f".deps-{req.stem}"
        if not stamp.exists() or stamp.stat().st_mtime < req.stat().st_mtime:
            say(f"Installation des dépendances Python ({req.name})…")
            hint = PIP_HINT
            if "fabric" in req.name:
                hint += "\nLe connecteur Fabric (mssql-python) s'installe par pip, sans droits administrateur : vérifiez l'accès à pypi.org (proxy)."
            run([str(PY), "-m", "pip", "install", "-q", "--disable-pip-version-check", "-r", str(req)], ROOT, what=f"installation de {req.name}", hint=hint)
            stamp.touch()


def source_hash() -> str:
    h = hashlib.sha256()
    files = sorted(p for p in (FRONTEND / "src").rglob("*") if p.is_file())
    files += [FRONTEND / n for n in ("index.html", "package.json", "vite.config.ts") if (FRONTEND / n).exists()]
    for p in files:
        h.update(p.relative_to(FRONTEND).as_posix().encode())
        h.update(p.read_bytes().replace(b"\r\n", b"\n"))
    return h.hexdigest()


def have_npm() -> bool:
    return shutil.which(NPM) is not None


def ensure_node() -> None:
    if not have_npm():
        fail("Node.js (npm) est nécessaire pour cette opération.", "Installez Node.js 20 ou plus récent : https://nodejs.org")
    if not (FRONTEND / "node_modules").exists():
        say("Installation des dépendances de l'interface…")
        run([NPM, "ci" if (FRONTEND / "package-lock.json").exists() else "install", "--no-audit", "--no-fund"], FRONTEND,
            what="installation npm", hint="Vérifiez l'accès au registre npm (proxy : npm config set proxy http://proxy:port).")


def ensure_build(force: bool) -> None:
    index = DIST / "index.html"
    stamp = DIST / ".source-hash"
    current = source_hash()
    up_to_date = index.exists() and stamp.exists() and stamp.read_text().strip() == current
    if up_to_date and not force:
        return
    if not have_npm():
        if index.exists():
            if not up_to_date:
                say("Interface déjà compilée utilisée (Node.js absent : les modifications locales du front ne seront pas prises en compte).")
            return
        fail("L'interface compilée (frontend/dist) est absente et Node.js n'est pas installé.",
             "Récupérez la dernière version du dépôt (git pull) : l'interface compilée y est incluse.")
    ensure_node()
    say("Compilation de l'interface…")
    run([NPM, "run", "build"], FRONTEND, what="compilation de l'interface")
    stamp.write_text(current)


def port_free(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False


def pick_port(host: str, wanted: int) -> int:
    for p in range(wanted, wanted + 20):
        if port_free(host, p):
            if p != wanted:
                say(f"Le port {wanted} est déjà utilisé : l'application utilisera le port {p}.")
            return p
    fail(f"Aucun port libre entre {wanted} et {wanted + 19}.", "Fermez l'application qui occupe ces ports ou utilisez --port.")
    return wanted


def open_when_ready(api: str, url: str, browser: bool, proc: subprocess.Popen) -> None:
    def wait():
        for _ in range(360):
            if proc.poll() is not None:
                return
            try:
                urllib.request.urlopen(api + "/api/meta", timeout=5)
                say(f"Prêt : {url}")
                if browser:
                    webbrowser.open(url)
                return
            except Exception:
                time.sleep(0.5)
    threading.Thread(target=wait, daemon=True).start()


def doctor() -> None:
    ok = lambda b: "OK " if b else "-- "
    print(f"{ok(sys.version_info >= MIN_PY)} Python {sys.version.split()[0]} ({sys.executable})")
    print(f"{ok(venv_ok())} Environnement Python {'opérationnel' if venv_ok() else 'absent ou incomplet (sera recréé)'} : {VENV}")
    print(f"    Dossier du projet ({len(str(ROOT))} caractères) : {ROOT}")
    try:
        urllib.request.urlopen("https://pypi.org/simple/pip/", timeout=6)
        net = True
    except Exception as e:
        net = False
        print(f"    accès à pypi.org impossible : {e}")
    print(f"{ok(net)} Accès aux paquets Python (pypi.org){'' if net else ' — configurez HTTPS_PROXY'}")
    print(f"{ok((DIST / 'index.html').exists())} Interface compilée (frontend/dist)")
    print(f"{ok(have_npm())} Node.js {'présent' if have_npm() else 'absent (inutile sauf pour modifier le front)'}")
    print(f"{ok(port_free('127.0.0.1', 8000))} Port 8000 {'libre' if port_free('127.0.0.1', 8000) else 'occupé (un autre port sera choisi)'}")
    print(f"    Proxy : HTTPS_PROXY={'défini' if os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy') else 'non défini'}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Lance l'application Fonds & encours.")
    ap.add_argument("--fabric", action="store_true", help="utiliser le Lakehouse Fabric plutôt que les données fictives")
    ap.add_argument("--mock", action="store_true", help="forcer les données fictives (ignore APP_DATA_SOURCE)")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1", help="adresse d'écoute (127.0.0.1 par défaut : poste local uniquement)")
    ap.add_argument("--dev", action="store_true", help="mode développement (Node.js requis)")
    ap.add_argument("--rebuild", action="store_true", help="recompiler l'interface (Node.js requis)")
    ap.add_argument("--test", action="store_true", help="lancer les tests puis quitter")
    ap.add_argument("--doctor", action="store_true", help="diagnostiquer le poste puis quitter")
    ap.add_argument("--no-browser", action="store_true", help="ne pas ouvrir le navigateur")
    a = ap.parse_args()

    if a.doctor:
        doctor()
        return
    warn_location()
    if sys.version_info < MIN_PY:
        fail(f"Python {MIN_PY[0]}.{MIN_PY[1]} ou plus récent est requis (version actuelle : {sys.version.split()[0]}).", "Téléchargement : https://www.python.org/downloads/")

    env = dict(os.environ)
    load_env_file(env)
    if a.fabric:
        env["APP_DATA_SOURCE"] = "fabric"
    if a.mock:
        env["APP_DATA_SOURCE"] = "mock"
    source = env.get("APP_DATA_SOURCE", "mock").strip().lower() or "mock"
    env["APP_DATA_SOURCE"] = source
    if source == "fabric" and not (env.get("FABRIC_SQL_SERVER") and env.get("FABRIC_SQL_DATABASE")):
        fail("Mode Fabric : FABRIC_SQL_SERVER et FABRIC_SQL_DATABASE ne sont pas définis.",
             "Renseignez-les dans .env, ou lancez les données fictives : python run.py --mock")
    env["PYTHONIOENCODING"] = "utf-8"

    extras = (["dev"] if a.test or a.dev else []) + (["fabric"] if source == "fabric" else [])
    ensure_python(extras)

    if a.test:
        say("Tests back-end…")
        run([str(PY), "-m", "pytest", "-q", "tests"], BACKEND, env, what="tests back-end")
        if have_npm():
            ensure_node()
            say("Tests front-end…")
            run([NPM, "test"], FRONTEND, env, what="tests front-end")
        else:
            say("Node.js absent : tests front-end ignorés.")
        say("Tests terminés.")
        return

    port = pick_port(a.host, a.port)
    procs: list[subprocess.Popen] = []
    if a.dev:
        ensure_node()
        env["VITE_API_PORT"] = str(port)
        procs.append(subprocess.Popen([NPM, "run", "dev", "--", "--port", "5173"], cwd=FRONTEND, env=env))
        url = "http://localhost:5173"
    else:
        ensure_build(a.rebuild)
        url = f"http://{'127.0.0.1' if a.host in ('0.0.0.0', '::') else a.host}:{port}"

    say("Source des données : " + ("Lakehouse Fabric (une fenêtre de connexion Microsoft va s'ouvrir)" if source == "fabric" else "données fictives"))
    cmd = [str(PY), "-m", "uvicorn", "rco.api:app", "--host", a.host, "--port", str(port)] + (["--reload"] if a.dev else [])
    try:
        server = subprocess.Popen(cmd, cwd=BACKEND, env=env)
        procs.append(server)
        open_when_ready(f"http://127.0.0.1:{port}", url, not a.no_browser, server)
        say("Démarrage… (Ctrl+C pour arrêter)")
        code = server.wait()
        if code not in (0, None) and not a.dev:
            fail(f"Le serveur s'est arrêté (code {code}).", "Le message d'erreur ci-dessus indique la cause ; relancez avec --doctor pour vérifier le poste.")
    except KeyboardInterrupt:
        pass
    finally:
        for p in procs:
            if p.poll() is None:
                p.terminate()
        say("Arrêté.")


if __name__ == "__main__":
    main()
