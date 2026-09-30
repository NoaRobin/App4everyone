"""Sélection de la source de données (fictive par défaut, Fabric sur demande explicite)."""
from __future__ import annotations

from datetime import date

from ..config import Settings


def make_source(settings: Settings):
    if settings.data_source == "fabric":
        from .fabric import FabricSource

        src = FabricSource(settings)
        src.reference_date = date.today()
        return src
    from .mock import AS_OF, MockSource

    src = MockSource()
    src.reference_date = AS_OF
    return src
