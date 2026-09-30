#!/usr/bin/env python3
"""Lanceur de l'application Rothschild & Co — Fonds & encours.

    python run.py              données fictives (aucune connexion, aucun Node.js requis)
    python run.py --fabric     Lakehouse Fabric (FABRIC_SQL_SERVER / FABRIC_SQL_DATABASE)
    python run.py --fabric-check   teste la configuration Fabric et SELECT 1, sans charger le modèle
    python run.py --doctor     diagnostic du poste (Python, pip, Node, port)
    python run.py --dev        mode développement (rechargement à chaud, Node.js requis)
    python run.py --test       lance les tests

Environnement Python : RCO_VENV s'il pointe vers un Python valide, sinon %USERPROFILE%\venv-rco s'il existe,
sinon un environnement géré dans %LOCALAPPDATA%\RCoFonds. Un environnement valide n'est jamais recréé ;
les dépendances ne sont installées que si elles manquent.
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


def _py_in(venv_dir: Path) -> Path:
    return venv_dir / ("Scripts/python.exe" if WIN else "bin/python")


def python_ok(py: Path) -> bool:
    """Le Python de l'environnement démarre et est assez récent (sans exiger pip)."""
    if not py.exists():
        return False
    try:
        r = subprocess.run([str(py), "-c", "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 3)"],
                           capture_output=True, timeout=60)
        return r.returncode == 0
    except Exception:
        return False


# Environnements déjà préparés sur le poste, réutilisés tels quels s'ils sont valides
KNOWN_VENVS = [Path(r"C:\Users\RP119879\venv-rco"), Path.home() / "venv-rco"] if WIN else [Path.home() / "venv-rco"]


def store_python() -> bool:
    """Python installé depuis le Microsoft Store (exécutable sous WindowsApps / PythonSoftwareFoundation)."""
    exe = sys.executable.lower()
    return "windowsapps" in exe or "pythonsoftwarefoundation" in exe


def _managed_venv() -> Path:
    """Environnement géré par le lanceur, hors du dossier du projet, dans un chemin local court.

    Un projet placé dans un dossier OneDrive/SharePoint ou dans un chemin long casse l'environnement
    (limite Windows de 260 caractères, synchronisation des milliers de fichiers de pip et pandas).
    """
    key = hashlib.sha1(str(ROOT).lower().encode()).hexdigest()[:8]
    if WIN and store_python():
        # Le Python du Microsoft Store redirige les écritures dans %LOCALAPPDATA% vers un dossier virtualisé :
        # l'environnement créé là n'est plus retrouvé au lancement suivant. On utilise le dossier personnel.
        return Path.home() / "venv-rco"
    if WIN:
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "RCoFonds"
    else:
        base = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "rco-fonds"
    return base / f"venv-{key}"


def resolve_venv() -> tuple[Path, str]:
    """(dossier, origine) — origine : "RCO_VENV", "poste" (venv-rco existant) ou "géré" (créé par le lanceur)."""
    explicit = os.environ.get("RCO_VENV", "").strip().strip('"')
    if explicit:
        p = Path(explicit)
        if python_ok(_py_in(p)):
            return p, "RCO_VENV"
    seen = set()
    for p in KNOWN_VENVS:
        if str(p).lower() in seen:
            continue
        seen.add(str(p).lower())
        if python_ok(_py_in(p)):
            return p, "poste"
    if explicit:
        return Path(explicit), "RCO_VENV"   # indiqué mais pas encore valide : créé à cet endroit s'il n'existe pas
    return _managed_venv(), "géré"


VENV: Path = _managed_venv()
VENV_ORIGIN = "géré"
PY: Path = _py_in(VENV)


def set_venv(env: dict | None = None) -> None:
    """Choisit l'environnement Python (après lecture du .env, qui peut définir RCO_VENV)."""
    global VENV, VENV_ORIGIN, PY
    if env and env.get("RCO_VENV") and not os.environ.get("RCO_VENV"):
        os.environ["RCO_VENV"] = env["RCO_VENV"]
    VENV, VENV_ORIGIN = resolve_venv()
    PY = _py_in(VENV)
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
    return python_ok(PY)


def has_modules(mods: list[str]) -> bool:
    try:
        r = subprocess.run([str(PY), "-c", "import " + ", ".join(mods)], capture_output=True, timeout=180)
        return r.returncode == 0
    except Exception:
        return False


def has_pip() -> bool:
    try:
        return subprocess.run([str(PY), "-m", "pip", "--version"], capture_output=True, timeout=60).returncode == 0
    except Exception:
        return False


# Modules dont la présence suffit à considérer un fichier de dépendances comme installé
REQ_MODULES = {"requirements": ["fastapi", "uvicorn", "pandas", "numpy"], "requirements-dev": ["pytest", "httpx"],
               "requirements-fabric": ["mssql_python"]}


def warn_location() -> None:
    p = str(ROOT)
    synced = any(k in p for k in ("OneDrive", "SharePoint")) or " - Documents" in p
    if WIN and (len(p) > 150 or synced):
        say("Attention : le projet est dans un dossier synchronisé ou au chemin très long.")
        say("  L'environnement Python est placé ailleurs pour l'éviter, mais pour plus de fiabilité,")
        say(r"  copiez le dossier du projet dans un chemin court et local, par exemple C:\dev\App4everyone.")


def ensure_python(extras: list[str]) -> None:
    # Ancien environnement dans le dossier du projet (souvent cassé sous OneDrive) : on le supprime
    if OLD_VENV.exists() and (OLD_VENV / "pyvenv.cfg").exists() and OLD_VENV.resolve() != VENV.resolve():
        say("Suppression de l'ancien environnement .venv du dossier du projet…")
        shutil.rmtree(OLD_VENV, ignore_errors=True)
    if venv_ok():
        say(f"Environnement Python : {VENV} ({VENV_ORIGIN})")
    else:
        # Un environnement valide n'est jamais recréé ; un environnement indiqué par l'utilisateur n'est jamais supprimé
        if VENV.exists() and VENV_ORIGIN != "géré":
            fail(f"L'environnement Python indiqué ({VENV}) est inutilisable : son python ne démarre pas.",
                 "Corrigez ou supprimez vous-même ce dossier, ou indiquez un autre environnement : $env:RCO_VENV=\"C:\\chemin\\venv\"")
        if VENV.exists():
            say("Environnement Python géré inutilisable : recréation…")
            shutil.rmtree(VENV, ignore_errors=True)
        say(f"Création de l'environnement Python ({VENV})…")
        try:
            VENV.parent.mkdir(parents=True, exist_ok=True)
            venv.create(VENV, with_pip=True)
        except Exception as e:  # pragma: no cover - dépend du poste
            fail(f"Impossible de créer l'environnement Python : {e}",
                 "Sous Linux : installez le paquet python3-venv. Sous Windows : réinstallez Python, ou créez un environnement puis\n"
                 "indiquez-le : py -m venv C:\\Users\\<vous>\\venv-rco   puis   $env:RCO_VENV=\"C:\\Users\\<vous>\\venv-rco\"")
        if not venv_ok():
            fail("L'environnement Python a été créé mais son python ne démarre pas.", f"Supprimez le dossier {VENV} puis relancez.")
    for name in ["requirements", *[f"requirements-{x}" for x in extras]]:
        req = BACKEND / f"{name}.txt"
        mods = REQ_MODULES.get(name, [])
        if mods and has_modules(mods):
            continue
        if not has_pip():
            fail(f"Des dépendances manquent ({', '.join(mods)}) et pip est absent de {VENV}.",
                 f"Installez-les manuellement : {PY} -m ensurepip   puis   {PY} -m pip install -r {req}")
        say(f"Installation des dépendances manquantes ({req.name})…")
        hint = PIP_HINT
        if "fabric" in name:
            hint += "\nLe connecteur Fabric (mssql-python) s'installe par pip, sans droits administrateur ni pilote ODBC."
        run([str(PY), "-m", "pip", "install", "-q", "--disable-pip-version-check", "-r", str(req)], ROOT, what=f"installation de {req.name}", hint=hint)
        if mods and not has_modules(mods):
            fail(f"Après installation, {', '.join(mods)} reste introuvable dans {VENV}.", "Relancez avec --doctor pour diagnostiquer.")


def check_fabric_client(env: dict) -> None:
    """mssql-python (défaut) n'exige aucun pilote ODBC : on ne vérifie ODBC Driver 18 que si pyodbc est demandé."""
    client = (env.get("FABRIC_CLIENT") or "mssql-python").strip().lower()
    if client == "pyodbc" and not has_modules(["pyodbc"]):
        fail("FABRIC_CLIENT=pyodbc mais pyodbc n'est pas installé.",
             "Retirez FABRIC_CLIENT du fichier .env pour utiliser mssql-python (aucun pilote ODBC requis).")


def fabric_config(env: dict) -> None:
    """Refuse une configuration Fabric incomplète ou restée sur des valeurs d'exemple (aucun accès réseau)."""
    sys.path.insert(0, str(BACKEND))
    try:
        from rco.config import fabric_config_problems, load_settings  # module sans dépendance externe
    finally:
        sys.path.pop(0)
    problems = fabric_config_problems(load_settings(env))
    if problems:
        fail("Configuration Fabric invalide :\n  - " + "\n  - ".join(problems),
             "Renseignez le fichier .env à la racine du projet (APP_DATA_SOURCE=fabric, FABRIC_SQL_SERVER, FABRIC_SQL_DATABASE),\n"
             "ou lancez les données fictives : python run.py --mock")


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
    """Suit /api/health (qui ne déclenche aucun chargement) et annonce l'état du modèle."""
    import json

    def wait():
        t0, last, reported = time.time(), 0.0, False
        while proc.poll() is None:
            try:
                with urllib.request.urlopen(api + "/api/health", timeout=5) as r:
                    h = json.loads(r.read().decode("utf-8"))
            except Exception:
                time.sleep(0.5)
                continue
            m = h.get("model", {})
            if m.get("state") == "ready":
                say(f"Prêt : {url} (données chargées en {m.get('loaded_in_s', '?')} s)")
                if browser:
                    webbrowser.open(url)
                return
            if m.get("state") == "error" and not reported:
                e = m.get("error") or {}
                print(("\033[38;5;167m✗\033[0m " if COLOR else "ERREUR : ") + str(e.get("message", "Chargement impossible.")), file=sys.stderr, flush=True)
                if e.get("detail"):
                    print("  détail : " + str(e["detail"]), file=sys.stderr, flush=True)
                if e.get("hint"):
                    print("  conseil : " + str(e["hint"]), file=sys.stderr, flush=True)
                print(f"  Le serveur reste lancé ({url}) : /api/health et /api/health/fabric renseignent l'état.", file=sys.stderr, flush=True)
                reported = True
            if time.time() - last > 15 and m.get("state") == "loading":
                say(f"Chargement des données… {int(time.time() - t0)} s")
                last = time.time()
            time.sleep(1)
    threading.Thread(target=wait, daemon=True).start()


def fabric_check(env: dict) -> int:
    say("Test de la connexion Fabric (sans charger le modèle)…")
    return subprocess.run([str(PY), "-m", "rco.fabric_check"], cwd=BACKEND, env=env).returncode


def doctor() -> None:
    ok = lambda b: "OK " if b else "-- "
    print(f"{ok(sys.version_info >= MIN_PY)} Python {sys.version.split()[0]} ({sys.executable})")
    print(f"{ok(venv_ok())} Environnement Python ({VENV_ORIGIN}) {'opérationnel' if venv_ok() else 'absent ou inutilisable'} : {VENV}")
    if venv_ok():
        print(f"{ok(has_modules(REQ_MODULES['requirements']))} Dépendances de l'application")
        print(f"{ok(has_modules(['mssql_python']))} Connecteur Fabric mssql-python (aucun pilote ODBC requis)")
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
    ap.add_argument("--fabric-check", action="store_true", help="tester la configuration Fabric et SELECT 1 sans charger le modèle, puis quitter")
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
        denv = dict(os.environ)
        load_env_file(denv)
        set_venv(denv)
        doctor()
        return
    warn_location()
    if sys.version_info < MIN_PY:
        fail(f"Python {MIN_PY[0]}.{MIN_PY[1]} ou plus récent est requis (version actuelle : {sys.version.split()[0]}).", "Téléchargement : https://www.python.org/downloads/")

    env = dict(os.environ)
    load_env_file(env)
    set_venv(env)
    if a.fabric or a.fabric_check:
        env["APP_DATA_SOURCE"] = "fabric"
    if a.mock:
        env["APP_DATA_SOURCE"] = "mock"
    source = env.get("APP_DATA_SOURCE", "mock").strip().lower() or "mock"
    env["APP_DATA_SOURCE"] = source
    if source == "fabric":
        fabric_config(env)
    env["PYTHONIOENCODING"] = "utf-8"

    extras = (["dev"] if a.test or a.dev else []) + (["fabric"] if source == "fabric" else [])
    ensure_python(extras)
    if source == "fabric":
        check_fabric_client(env)
    if a.fabric_check:
        sys.exit(fabric_check(env))

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

    say("Source des données : " + (f"Lakehouse Fabric via {(env.get('FABRIC_CLIENT') or 'mssql-python')} (une fenêtre de connexion Microsoft va s'ouvrir)" if source == "fabric" else "données fictives"))
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
