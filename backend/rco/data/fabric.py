"""Connexion au SQL analytics endpoint du Lakehouse Fabric (lecture seule)."""
from __future__ import annotations

import logging
import re
import threading
import time
from typing import Any, Sequence

import pandas as pd

from ..config import Settings, fabric_config_problems
from .sql_guard import assert_read_only

log = logging.getLogger(__name__)


# Paramètres communs aux deux clients : Entra ID interactif (fenêtre Microsoft), chiffré, intention lecture seule.
_COMMON = ("Authentication=ActiveDirectoryInteractive;"
           "Encrypt=yes;TrustServerCertificate=no;"
           "ApplicationIntent=ReadOnly;")


def connection_string(settings: Settings, client: str) -> str:
    s = settings
    base = f"Server={s.fabric_server};Database={s.fabric_database};" + _COMMON
    # mssql-python embarque son propre pilote : aucune clé Driver dans sa chaîne
    return base if client == "mssql-python" else f"Driver={{{s.odbc_driver}}};" + base


# ---------------------------------------------------------------- erreurs explicites
class FabricError(RuntimeError):
    """Erreur Fabric présentable telle quelle à l'utilisateur (aucune donnée métier dans le message)."""
    code = "fabric_error"
    status = 502
    hint = ""

    def __init__(self, message: str, *, detail: str | None = None, hint: str | None = None, table: str | None = None):
        super().__init__(message)
        self.message = message
        self.detail = (detail or "")[:400]
        self.table = table
        if hint is not None:
            self.hint = hint

    def to_dict(self) -> dict:
        d = {"error": self.code, "message": self.message, "hint": self.hint}
        if self.detail:
            d["detail"] = self.detail
        if self.table:
            d["table"] = self.table
        return d


class FabricConfigError(FabricError):
    code, status = "fabric_config", 500
    hint = "Corrigez le fichier .env à la racine du projet puis relancez : python run.py --fabric-check"


class FabricDriverError(FabricError):
    code, status = "fabric_driver", 500
    hint = "Installez le connecteur dans l'environnement Python de l'application : python -m pip install -r backend/requirements-fabric.txt"


class FabricConnectionError(FabricError):
    code, status = "fabric_connection", 503
    hint = ("Vérifiez FABRIC_SQL_SERVER, la connexion au réseau de l'entreprise (VPN) et que le port 1433 sortant n'est pas bloqué. "
            "Test rapide : python run.py --fabric-check")


class FabricAuthError(FabricError):
    code, status = "fabric_auth", 401
    hint = ("La connexion Microsoft Entra ID a échoué ou a été annulée. Relancez et terminez la connexion dans la fenêtre Microsoft ; "
            "votre compte doit avoir au moins le rôle Viewer sur l'espace de travail du Lakehouse.")


class FabricQueryError(FabricError):
    code, status = "fabric_query", 502
    hint = "Une table ou une colonne attendue n'existe pas (ou plus) dans le Lakehouse : transmettez le nom indiqué pour adapter l'application."


class FabricTimeoutError(FabricError):
    code, status = "fabric_timeout", 504
    hint = "Fabric a mis trop longtemps à répondre. Réessayez ; au besoin, augmentez FABRIC_QUERY_TIMEOUT ou réduisez APP_HISTORY_YEARS."


_AUTH = re.compile(r"AADSTS|login failed|18456|authenticat|token|entra|interactive|user cancel|canceled|cancelled|MSAL|credential", re.I)
_TIMEOUT = re.compile(r"HYT00|HYT01|timeout expired|query timeout|timed out", re.I)
_NET = re.compile(r"TCP Provider|08001|08S01|unable to establish|network|could not open a connection|server was not found|"
                  r"0x2749|10060|10061|11001|getaddrinfo|name or service not known|no such host|connection (?:refused|reset)|Login timeout", re.I)
_QUERY = re.compile(r"42S02|42S22|Invalid object name|Invalid column name|42000|syntax", re.I)


def classify(exc: BaseException, *, phase: str, table: str | None = None) -> FabricError:
    """Traduit une exception du pilote en erreur explicite. `phase` : "connect" ou "query"."""
    if isinstance(exc, FabricError):
        return exc
    msg = str(exc)
    detail = f"{type(exc).__name__}: {msg}"
    where = f" (table {table})" if table else ""
    if phase == "connect" and _AUTH.search(msg):
        return FabricAuthError("Authentification Microsoft Entra ID refusée ou annulée.", detail=detail)
    if _TIMEOUT.search(msg) and not re.search(r"Login timeout", msg, re.I):
        return FabricTimeoutError(f"Délai dépassé pendant la lecture de Fabric{where}.", detail=detail, table=table)
    if phase == "connect" or _NET.search(msg):
        return FabricConnectionError("Impossible de joindre le SQL analytics endpoint Fabric.", detail=detail)
    if _QUERY.search(msg):
        m = re.search(r"Invalid (?:column|object) name '([^']+)'", msg, re.I)
        what = f" : « {m.group(1)} » introuvable" if m else ""
        return FabricQueryError(f"Requête refusée par Fabric{where}{what}.", detail=detail, table=table)
    if _AUTH.search(msg):
        return FabricAuthError("Session Microsoft expirée ou droits insuffisants.", detail=detail)
    return FabricQueryError(f"Erreur Fabric pendant la lecture{where}.", detail=detail, table=table)


# ---------------------------------------------------------------- source
class FabricSource:
    """
    Exécute uniquement des SELECT sur le SQL analytics endpoint, avec une authentification Entra ID interactive.

    Client par défaut : **mssql-python**, le pilote Python officiel de Microsoft (`pip install`, aucun pilote ODBC
    à installer sous Windows, donc aucune intervention du service informatique). `FABRIC_CLIENT=pyodbc` permet de
    revenir à pyodbc lorsque le pilote « ODBC Driver 18 for SQL Server » est installé sur le poste.
    Une seule connexion par processus, protégée par un verrou : la fenêtre Microsoft ne s'ouvre qu'une fois.
    """

    def __init__(self, settings: Settings):
        problems = fabric_config_problems(settings)
        if problems:
            raise FabricConfigError(" ".join(problems))
        self._settings = settings
        self._conn = None
        self._lock = threading.RLock()
        self.client = settings.fabric_client

    # -- connexion
    def _connect(self):
        s = self._settings
        t0 = time.perf_counter()
        log.info("Connexion à Fabric (client %s, délai de connexion %d s)…", self.client, s.fabric_login_timeout)
        try:
            if self.client == "pyodbc":
                try:
                    import pyodbc  # imports tardifs : inutiles en mode données fictives
                except ImportError as e:
                    raise FabricDriverError("FABRIC_CLIENT=pyodbc mais pyodbc n'est pas installé.", hint="Retirez FABRIC_CLIENT du fichier .env pour utiliser mssql-python.") from e
                conn = pyodbc.connect(connection_string(s, "pyodbc"), readonly=True, timeout=s.fabric_login_timeout)
            else:
                try:
                    import mssql_python
                except ImportError as e:
                    raise FabricDriverError("Le connecteur mssql-python n'est pas installé dans l'environnement Python de l'application.") from e
                conn = mssql_python.connect(connection_string(s, "mssql-python"), timeout=s.fabric_login_timeout)
            try:
                conn.timeout = s.fabric_query_timeout  # délai par requête
            except Exception:  # pragma: no cover - selon le pilote
                log.debug("Délai de requête non réglable sur ce pilote")
        except FabricError:
            raise
        except Exception as e:
            err = classify(e, phase="connect")
            log.error("Connexion Fabric impossible (%s) après %.1f s", err.code, time.perf_counter() - t0)
            raise err from e
        log.info("Connecté à Fabric en %.1f s", time.perf_counter() - t0)
        return conn

    def _connection(self):
        if self._conn is None:
            self._conn = self._connect()
        return self._conn

    # -- requêtes
    def query(self, sql: str, params: Sequence[Any] = (), *, table: str | None = None) -> pd.DataFrame:
        assert_read_only(sql)
        with self._lock:
            for attempt in (1, 2):
                conn = self._connection()
                try:
                    cur = conn.cursor()
                    try:
                        cur.execute(sql, list(params))
                        cols = [d[0] for d in cur.description]
                        rows = cur.fetchall()
                    finally:
                        cur.close()
                    return pd.DataFrame.from_records([tuple(r) for r in rows], columns=cols)
                except Exception as e:
                    err = classify(e, phase="query", table=table)
                    # Connexion coupée (veille, réseau) : une seule reconnexion
                    if attempt == 1 and isinstance(err, FabricConnectionError):
                        log.warning("Connexion Fabric perdue, reconnexion…")
                        self.close()
                        continue
                    raise err from e
        raise AssertionError("inaccessible")  # pragma: no cover

    def table(self, name: str, columns: Sequence[str], since: tuple[str, Any] | None = None) -> pd.DataFrame:
        sql, params = build_select(name, columns, since)
        return self.query(sql, params, table=name)

    def ping(self) -> float:
        """SELECT 1 : renvoie la latence en millisecondes (lève FabricError sinon)."""
        t0 = time.perf_counter()
        df = self.query("SELECT 1 AS ok")
        if df.empty or int(df.iloc[0, 0]) != 1:
            raise FabricQueryError("Réponse inattendue de Fabric au test SELECT 1.")
        return (time.perf_counter() - t0) * 1000

    def check_table(self, name: str, columns: Sequence[str]) -> None:
        """Vérifie qu'une table et ses colonnes existent (SELECT TOP 0 : aucune ligne lue)."""
        cols = ", ".join(f"[{c}]" for c in columns)
        self.query(f"SELECT TOP 0 {cols} FROM [dbo].[{name}]", table=name)

    def busy(self) -> bool:
        """Vrai si une requête est en cours (chargement du modèle) : la connexion est alors occupée."""
        if self._lock.acquire(blocking=False):
            self._lock.release()
            return False
        return True

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                try:
                    self._conn.close()
                except Exception:  # pragma: no cover
                    pass
                self._conn = None


def build_select(name: str, columns: Sequence[str], since: tuple[str, Any] | None = None):
    """Construit un SELECT explicite (colonnes entre crochets, filtre de date paramétré)."""
    for ident in (name, *columns, *( [since[0]] if since else [])):
        if "]" in ident or "[" in ident:
            raise ValueError(f"Identifiant invalide : {ident!r}")
    cols = ", ".join(f"[{c}]" for c in columns)
    sql = f"SELECT {cols} FROM [dbo].[{name}]"
    params: list[Any] = []
    if since:
        sql += f" WHERE [{since[0]}] >= ?"
        params.append(since[1])
    return assert_read_only(sql), params
