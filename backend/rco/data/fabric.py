"""Connexion au SQL analytics endpoint du Lakehouse Fabric (lecture seule)."""
from __future__ import annotations

import logging
from typing import Any, Sequence

import pandas as pd

from ..config import Settings
from .sql_guard import assert_read_only

log = logging.getLogger(__name__)


class FabricSource:
    """Exécute uniquement des SELECT, via pyodbc et une authentification Entra ID interactive."""

    def __init__(self, settings: Settings):
        if not settings.fabric_server or not settings.fabric_database:
            raise RuntimeError(
                "FABRIC_SQL_SERVER et FABRIC_SQL_DATABASE doivent être définis dans l'environnement."
            )
        self._settings = settings
        self._conn = None

    def _connection(self):
        if self._conn is None:
            import pyodbc  # import tardif : inutile en mode données fictives

            s = self._settings
            conn_str = (
                f"Driver={{{s.odbc_driver}}};"
                f"Server={s.fabric_server};"
                f"Database={s.fabric_database};"
                "Authentication=ActiveDirectoryInteractive;"
                "Encrypt=yes;TrustServerCertificate=no;"
                "ApplicationIntent=ReadOnly;"
            )
            self._conn = pyodbc.connect(conn_str, readonly=True)
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
