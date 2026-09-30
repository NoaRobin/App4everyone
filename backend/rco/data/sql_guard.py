"""Garde-fou lecture seule : seules des requêtes SELECT uniques sont autorisées."""
from __future__ import annotations

import re

_FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|DENY|"
    r"INTO|BACKUP|RESTORE|DBCC|SHUTDOWN|KILL|OPENROWSET|OPENQUERY|OPENDATASOURCE|BULK|"
    r"SP_\w+|XP_\w+|WAITFOR|DECLARE|SET|USE|UPDATETEXT|WRITETEXT)\b",
    re.IGNORECASE,
)


class ReadOnlyViolation(ValueError):
    pass


def _strip(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    sql = re.sub(r"--[^\n]*", " ", sql)
    # Les littéraux sont neutralisés pour ne pas bloquer un mot-clé cité dans une chaîne.
    sql = re.sub(r"'(?:''|[^'])*'", "''", sql)
    return sql.strip()


def assert_read_only(sql: str) -> str:
    """Retourne la requête si elle est un SELECT unique, lève ReadOnlyViolation sinon."""
    body = _strip(sql)
    if body.endswith(";"):
        body = body[:-1].rstrip()
    if ";" in body:
        raise ReadOnlyViolation("Une seule instruction est autorisée.")
    if not re.match(r"^(SELECT|WITH)\b", body, re.IGNORECASE):
        raise ReadOnlyViolation("Seules les requêtes SELECT sont autorisées.")
    # Les noms de colonnes sont entre crochets : on ne les confond pas avec des mots-clés.
    unbracketed = re.sub(r"\[[^\]]*\]", "[]", body)
    m = _FORBIDDEN.search(unbracketed)
    if m:
        raise ReadOnlyViolation(f"Mot-clé interdit en lecture seule : {m.group(0).upper()}")
    return sql
