"""Rattachement JUMP ↔ Product Info sur des identifiants hétérogènes (données fictives)."""
from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from dirtysource import R4C, DirtySource
from helpers import aum_row, build, product, share
from rco.data.mock import AS_OF
from rco.domain import ids as IDS
from rco.domain import labels as L
from rco.domain.model import build_model
from rco.service import Service

D = "2026-01-02"


@pytest.mark.parametrize("raw,expected", [
    ("{ABCDEF01-2345-6789-ABCD-EF0123456789}", "abcdef01-2345-6789-abcd-ef0123456789"),
    ("  abc ", "abc"), ("a b", "ab"), (12345, "12345"), (12345.0, "12345"), ("12345.0", "12345"),
    (None, None), ("", None), ("NULL", None), (float("nan"), None), (True, None),
])
def test_identifiant_canonique(raw, expected):
    assert IDS.norm_id(raw) == expected


def test_isin_canonique():
    assert IDS.norm_isin(" fr00 1234 5678 ") == "FR0012345678"
    assert IDS.norm_isin(None) is None and IDS.norm_isin("  ") is None and IDS.norm_isin("N/A") is None


def test_alignement_sur_la_forme_du_referentiel():
    ref = pd.Series(["S-AbC", "S-2"])
    out = IDS.align(pd.Series(["s-abc ", "{S-ABC}", "S-9", None]), ref)
    assert out.tolist() == ["S-AbC", "S-AbC", "S-9", None]
    # Deux identifiants du référentiel de même forme canonique : aucune substitution (ambigu)
    assert IDS.align(pd.Series(["x"]), pd.Series(["X", "x "])).tolist() == ["x"]


def test_identifiants_numeriques_contre_texte_et_espaces():
    rows = [aum_row("F1", "P1", D, 10, 100, pi_part="12345.0"), aum_row("F1", "P2", D, 10, 100, pi_part=" s-2 ")]
    m = build(rows, [product("PR1", "Fonds Un")], [share(12345, "PR1", "FR1", "Un C"), share("S-2", "pr1", "FR2", "Un D")])
    assert m.link.at["P1", "link"] == "id" and m.link.at["P1", "pi_shareid"] == "12345"
    assert m.link.at["P2", "link"] == "id" and m.link.at["P2", "pi_shareid"] == "S-2"
    assert set(m.link["fund_id"]) == {"PR1"}                      # ProductID « pr1 » réaligné sur « PR1 »


def test_isin_duplique_jamais_utilise():
    rows = [aum_row("F1", "P1", D, 10, 100, isin="FR0000000001")]
    m = build(rows, [product("PR1", "Fonds")], [share("S1", "PR1", "FR0000000001", "a"), share("S2", "PR1", " fr0000000001", "b")])
    assert m.link.at["P1", "link"] == "none"
    assert m.link_report["ambiguous_isins"] == ["FR0000000001"]


def test_isin_partage_par_deux_parts_jump_non_utilise():
    rows = [aum_row("F1", "P1", D, 10, 100, isin="FR0000000001"), aum_row("F1", "P2", D, 10, 100, isin="FR0000000001")]
    m = build(rows, [product("PR1", "Fonds")], [share("S1", "PR1", "FR0000000001", "a")])
    assert set(m.link["link"]) == {"none"} and "FR0000000001" in m.link_report["ambiguous_isins"]


def test_isin_deja_rattache_par_identifiant_non_reutilise():
    rows = [aum_row("F1", "P1", D, 10, 100, pi_part="S1", isin="FR0000000001"), aum_row("F2", "P2", D, 10, 100, isin="FR0000000001")]
    m = build(rows, [product("PR1", "Fonds")], [share("S1", "PR1", "FR0000000001", "a")])
    assert m.link.at["P1", "link"] == "id" and m.link.at["P2", "link"] == "none"


def test_part_sans_productid_rattachee_par_id_pi_fonds():
    rows = [aum_row("F1", "P1", D, 10, 100, pi_part="S1", pi_fund=" PR1 ")]
    m = build(rows, [product("PR1", "Fonds Un")], [share("S1", None, "FR1", "Un C")])
    assert m.link.at["P1", "fund_id"] == "PR1" and m.link.at["P1", "fund_link"] == "pi_fonds"
    assert m.link_report["funds"]["by_id_pi_fonds"] == 1


def test_fonds_jump_absent_du_referentiel_actif():
    rows = [aum_row("FX", "PX", D, 5, 100, pi_fund="INACTIF"), aum_row("F1", "P1", D, 10, 100, pi_part="S1")]
    m = build(rows, [product("PR1", "Fonds Un")], [share("S1", "PR1", "FR1", "Un C")])
    assert "J:FX" in m.funds.index and not m.funds.at["J:FX", "referenced"]
    assert m.link_report["funds"]["unlinked"] == 1 and m.link_report["funds"]["by_product_id"] == 1


def test_meme_fonds_reparti_entre_plusieurs_identifiants():
    """Une part du fonds JUMP n'a aucun identifiant exploitable : elle suit les autres parts du même fonds JUMP."""
    rows = [aum_row("F1", "P1", D, 10, 100, pi_part="S1"), aum_row("F1 ", "P2", D, 10, 100)]
    m = build(rows, [product("PR1", "Fonds Un")], [share("S1", "PR1", "FR1", "Un C")])
    assert m.link.at["P2", "fund_id"] == "PR1" and m.link.at["P2", "fund_link"] == "jump_fund"
    assert list(m.funds.index) == ["PR1"] and float(m.fund_aum.loc[D, "PR1"]) == 2000


def test_jamais_de_fusion_sur_le_nom():
    rows = [aum_row("F1", "P1", D, 10, 100, pi_part="S1"), aum_row("F2", "P2", D, 10, 100)]
    rows[1]["NOM_PART"] = "Fonds Un C"
    m = build(rows, [product("PR1", "Fonds Un")], [share("S1", "PR1", "FR1", "Fonds Un C")])
    assert {"PR1", "J:F2"} <= set(m.funds.index)                  # même nom, aucun identifiant commun : deux fonds


def test_champs_texte_nuls():
    rows = [aum_row("F1", "P1", D, 10, 100, pi_part="S1")]
    rows[0]["NOM_PART"] = None
    m = build(rows, [product("PR1", None, Portfolio_Manager=None, ESG_SFDR_Article=None)], [share("S1", "PR1", None, None)])
    assert m.funds.at["PR1", "name"] == "PR1"                     # jamais de nom nul
    svc = Service(m)
    idx = svc.search_index(None)["entries"]
    assert all(isinstance(e["label"], str) and e["label"] for e in idx)


@pytest.fixture(scope="module")
def dirty():
    src = DirtySource()
    src.reference_date = AS_OF
    return Service(build_model(src, is_mock=True))


def test_structure_reelle_aucun_doublon_dans_la_vue_finale(dirty):
    funds = dirty.funds(None, {})["funds"]
    live = [f for f in funds if (f["aum"] or 0) > 0]
    assert len({f["id"] for f in funds}) == len(funds)
    names = [L.norm(f["name"]) for f in live]
    assert len(set(names)) == len(names)
    assert not [f for f in live if f["family"] == "nc" and f["referenced"]]
    assert dirty.links()["duplicates"] == [] and dirty.links()["funds_jump_only"] == 0


def test_structure_reelle_r_co_4change_sur_une_seule_ligne(dirty):
    rows = [f for f in dirty.funds(None, {})["funds"] if L.norm(f["name"]) == L.norm(R4C)]
    assert len(rows) == 1 and rows[0]["referenced"] and (rows[0]["aum"] or 0) > 0 and rows[0]["manager"]


def test_structure_reelle_compteurs(dirty):
    r = dirty.links()
    p, f = r["parts"], r["funds"]
    assert p["total"] == p["by_pi_shareid"] + p["by_isin"] + p["unlinked"]
    assert p["by_pi_shareid"] > 0.85 * p["total"] and p["unlinked"] <= 5
    assert f["unlinked"] == 1                                       # le fonds liquidé, absent du référentiel actif
    assert r["ambiguous_isins"]                                      # l'ISIN dupliqué est signalé
    ctl = {c["key"]: c for c in dirty.controls(None)["controls"]}
    assert ctl["isin_ambiguous"]["count"] == len(r["ambiguous_isins"]) and ctl["duplicates"]["count"] == 0
