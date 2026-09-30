"""Connexion au SQL analytics endpoint du Lakehouse Fabric (lecture seule)."""
from __future__ import annotations

import logging
from typing import Any, Sequence

import pandas as pd

from ..config import Settings
from .sql_guard import assert_read_only

log = logging.getLogger(__name__)


# Paramètres communs aux deux clients : Entra ID interactif (fenêtre Microsoft), chiffré, intention lecture seule.
_COMMON = ("Authentication=ActiveDirectoryInteractive;"
           "Encrypt=yes;TrustServerCertificate=no;"
           "ApplicationIntent=ReadOnly;")


def connection_string(settings: Settings, client: str) -> str:
    s = settings
    base = f"Server={s.fabric_server};Database={s.fabric_database};" + _COMMON
    # mssql-python embarque son propre pilote : il refuse la clé Driver
    return base if client == "mssql-python" else f"Driver={{{s.odbc_driver}}};" + base


class FabricSource:
    """
    Exécute uniquement des SELECT sur le SQL analytics endpoint, avec une authentification Entra ID interactive.

    Client par défaut : **mssql-python**, le pilote Python officiel de Microsoft (`pip install`, aucun pilote ODBC
    à installer sous Windows, donc aucune intervention du service informatique). `FABRIC_CLIENT=pyodbc` permet de
    revenir à pyodbc lorsque le pilote « ODBC Driver 18 for SQL Server » est installé sur le poste.
    """

    def __init__(self, settings: Settings):
        if not settings.fabric_server or not settings.fabric_database:
            raise RuntimeError(
                "FABRIC_SQL_SERVER et FABRIC_SQL_DATABASE doivent être définis dans l'environnement."
            )
        self._settings = settings
        self._conn = None

    def _connection(self):
        if self._conn is None:
            client = self._settings.fabric_client
            if client == "pyodbc":
                import pyodbc  # imports tardifs : inutiles en mode données fictives

                self._conn = pyodbc.connect(connection_string(self._settings, "pyodbc"), readonly=True)
            else:
                try:
                    import mssql_python
                except ImportError as e:  # pragma: no cover - dépend du poste
                    raise RuntimeError("Le paquet mssql-python n'est pas installé : lancez « run.bat --fabric », "
                                       "qui l'installe (pip, sans droits administrateur).") from e
                self._conn = mssql_python.connect(connection_string(self._settings, "mssql-python"))
            log.info("Connecté au Lakehouse Fabric (client %s)", client)
        return self._conn

    def query(self, sql: str, params: Sequence[Any] = ()) -> pd.DataFrame:
        assert_read_only(sql)
        cur = self._connection().cursor()
        try:
            cur.execute(sql, list(params))
            cols = [d[0] for d in cur.description]
            rows = cur.fetchall()
        finally:
            cur.close()
        # Ne jamais logger le contenu : seulement la volumétrie.
        log.info("Requête exécutée : %d lignes", len(rows))
        return pd.DataFrame.from_records([tuple(r) for r in rows], columns=cols)

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    def table(self, name: str, columns: Sequence[str], since: tuple[str, Any] | None = None) -> pd.DataFrame:
        sql, params = build_select(name, columns, since)
        return self.query(sql, params)


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
