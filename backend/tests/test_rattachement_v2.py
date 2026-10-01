"""Rattachement JUMP ↔ Product Info, cas réels reproduits sur données fictives (domain/linking.py)."""
from __future__ import annotations

import json

import numpy as np
import pytest

from dirtysource import DirtySource, HardSource
from helpers import aum_row, build, frame, product, share
from rco.data import schema as S
from rco.domain.model import build_model
from rco.service import Service

D = "2026-01-02"


def fund_of(m, part):
    return m.link.at[part, "fund_id"]


@pytest.mark.parametrize("jump,ref", [
    (12345, "12345"), ("12345", 12345), ("12345.0", "12345"), (12345.0, "12345"), ("0012345", "12345"),
    (" S1​ ", "S1"), (" s1", "S1"), ("{s1}", "S1"), ("S 1", "S1"), ("1.2345E4", "12345"),
])
def test_identifiants_formats_heterogenes(jump, ref):
    m = build([aum_row("F1", "P1", D, 10, 100, pi_part=jump)], [product("PR1", "Fonds Un")], [share(ref, "PR1", "FR1", "Un C")])
    assert m.link.at["P1", "link"] == "id" and fund_of(m, "P1") == "PR1"
    assert list(m.funds.index) == ["PR1"]


@pytest.mark.parametrize("empty", [None, "", "  ", "N/A", "null", " ", "{}", "nan"])
def test_valeurs_vides_jamais_rapprochees(empty):
    m = build([aum_row("F1", "P1", D, 10, 100, pi_part=empty, pi_fund=empty)], [product("PR1", "Fonds Un")],
              [share("S1", "PR1", "FR1", "Un C")])
    assert m.link.at["P1", "link"] == "none" and fund_of(m, "P1") == "J:F1"
    assert m.link.at["P1", "part_reason"] == "ni_id_pi_part_ni_isin"


def test_isin_unique_rattache_et_isin_ambigu_ecarte():
    ok = build([aum_row("F1", "P1", D, 10, 100, isin="fr 0001")], [product("PR1", "Un")], [share("S1", "PR1", "FR0001", "Un C")])
    assert ok.link.at["P1", "link"] == "isin" and fund_of(ok, "P1") == "PR1"
    # Même ISIN sur deux parts actives de deux fonds différents : ni part ni fonds démontrés
    amb = build([aum_row("F1", "P1", D, 10, 100, isin="FR0001")], [product("PR1", "Un"), product("PR2", "Deux")],
                [share("S1", "PR1", "FR0001", "Un C"), share("S2", "PR2", "FR0001", "Deux C")])
    assert amb.link.at["P1", "link"] == "none" and fund_of(amb, "P1") == "J:F1"
    assert amb.link.at["P1", "part_reason"] == "isin_ambigu_referentiel"
    assert amb.link_report["ambiguous_isins"] == ["FR0001"]


def test_isin_ambigu_mais_meme_fonds():
    """Deux parts actives du même fonds portent l'ISIN : la part reste non démontrée, le fonds l'est."""
    m = build([aum_row("F1", "P1", D, 10, 100, isin="FR0001")], [product("PR1", "Un")],
              [share("S1", "PR1", "FR0001", "Un C"), share("S2", "PR1", "FR0001", "Un C bis")])
    assert m.link.at["P1", "link"] == "none" and fund_of(m, "P1") == "PR1"
    assert m.link.at["P1", "fund_link"] == "product_id_isin"


def test_isin_double_actif_et_inactif():
    """L'enregistrement inactif (part liquidée, ancienne fiche) ne rend pas l'ISIN ambigu."""
    m = build([aum_row("F1", "P1", D, 10, 100, isin="FR0001")], [product("PR1", "Un"), product("PR2", "Deux")],
              [share("S1", "PR1", "FR0001", "Un C", statecodename="Active"),
               share("S2", "PR2", "FR0001", "Ancienne", statecodename="Inactive")])
    assert m.link.at["P1", "pi_shareid"] == "S1" and fund_of(m, "P1") == "PR1"


def test_isin_partage_par_plusieurs_parts_jump():
    rows = [aum_row("F1", "P1", D, 10, 100, isin="FR0001"), aum_row("F1", "P2", D, 10, 100, isin="FR0001")]
    m = build(rows, [product("PR1", "Un")], [share("S1", "PR1", "FR0001", "Un C")])
    assert set(m.link["link"]) == {"none"}
    assert set(m.link["part_reason"]) == {"isin_partage_par_plusieurs_parts_jump"}
    # Le fonds reste démontré : l'unique part du référentiel portant cet ISIN appartient à PR1
    assert set(m.link["fund_id"]) == {"PR1"}


def test_doublon_de_part_sans_productid_en_premier():
    """Cas R-co Valor : la fiche part apparaît deux fois, la première sans ProductID. La fiche complète l'emporte."""
    m = build([aum_row("F1", "P1", D, 10, 100, pi_part="S1")], [product("PR1", "Un")],
              [share("S1", None, "FR0001", "Un C"), share("s1 ", "PR1", "FR0001", "Un C")])
    assert fund_of(m, "P1") == "PR1" and m.link.at["P1", "fund_link"] == "product_id"
    assert m.link_report["referential_duplicates"]["shares"] == 1


def test_doublon_de_produit_inactif_en_premier():
    m = build([aum_row("F1", "P1", D, 10, 100, pi_part="S1")],
              [product("PR1", "Ancien", statecodename="Inactive"), product("pr1", "Un", statecodename="Active", Portfolio_Manager="X")],
              [share("S1", "PR1", "FR0001", "Un C")])
    assert list(m.funds.index) == ["pr1"] and m.funds.at["pr1", "name"] == "Un"
    assert fund_of(m, "P1") == "pr1"


def test_part_sans_productid_rattachee_par_id_pi_fonds():
    m = build([aum_row("F1", "P1", D, 10, 100, pi_part="S1", pi_fund="pr1")], [product("PR1", "Un")],
              [share("S1", None, "FR0001", "Un C")])
    assert fund_of(m, "P1") == "PR1" and m.link.at["P1", "fund_link"] == "pi_fonds"


def test_fonds_hors_referentiel_actif():
    m = build([aum_row("F1", "P1", D, 10, 100, pi_part="S1")], [product("PR1", "Un")], [share("S1", "PRX", "FR0001", "X C")])
    assert fund_of(m, "P1") == "J:F1" and not bool(m.funds.at["J:F1", "referenced"])
    assert m.link.at["P1", "fund_reason"].startswith("productid_hors_referentiel_actif")
    assert m.funds.at["J:F1", "family"] == "nc"


def test_plusieurs_parts_jump_meme_produit():
    rows = [aum_row("F1", f"P{i}", D, 10, 100 * i, pi_part=f"S{i}") for i in (1, 2, 3)]
    m = build(rows, [product("PR1", "Un")], [share(f"S{i}", "PR1", f"FR000{i}", f"Un {i}") for i in (1, 2, 3)])
    assert list(m.funds.index) == ["PR1"] and float(m.fund_aum.loc[D, "PR1"]) == 1000 + 2000 + 3000


def test_meme_nom_deux_produits_distincts():
    rows = [aum_row("F1", "P1", D, 10, 100, pi_part="S1"), aum_row("F2", "P2", D, 10, 100, pi_part="S2")]
    m = build(rows, [product("PR1", "Fonds Un"), product("PR2", "Fonds Un")],
              [share("S1", "PR1", "FR1", "Un C"), share("S2", "PR2", "FR2", "Un C")])
    assert {"PR1", "PR2"} == set(m.funds.index)
    svc = Service(m)
    assert len(svc.links()["duplicates"]) == 1                       # signalé, jamais fusionné


def test_encours_reparti_ligne_jump_et_ligne_referentiel_resolu_par_inventaires():
    """Une part sans identifiant, d'un autre fonds JUMP : les inventaires de ce fonds JUMP portent l'ID_PI_FONDS."""
    rows = [aum_row("F1", "P1", D, 10, 100, pi_part="S1"), aum_row("F2", "P2", D, 10, 50)]
    hold = [dict(ID_JUMP_FONDS="F2", ID_PI_FONDS=" {pr1} ", DATE_INVENTAIRE=D)]
    m = build(rows, [product("PR1", "Un")], [share("S1", "PR1", "FR1", "Un C")], holdings=hold)
    assert fund_of(m, "P2") == "PR1" and m.link.at["P2", "fund_link"] == "pi_fonds_inventaires"
    assert list(m.funds.index) == ["PR1"] and float(m.fund_aum.loc[D, "PR1"]) == 1500


def test_inventaires_ambigus_ne_rattachent_pas():
    rows = [aum_row("F2", "P2", D, 10, 50)]
    hold = [dict(ID_JUMP_FONDS="F2", ID_PI_FONDS="PR1", DATE_INVENTAIRE=D), dict(ID_JUMP_FONDS="F2", ID_PI_FONDS="PR2", DATE_INVENTAIRE=D)]
    m = build(rows, [product("PR1", "Un"), product("PR2", "Deux")], [], holdings=hold)
    assert fund_of(m, "P2") == "J:F2"
    assert "inventaires_sur_plusieurs_fonds" in m.link.at["P2", "fund_reason"]


def test_code_aim_des_inventaires():
    rows = [aum_row("F2", "P2", D, 10, 50)]
    hold = [dict(ID_JUMP_FONDS="F2", CODE_AIM_FONDS="aim 300", DATE_INVENTAIRE=D)]
    m = build(rows, [product("PR1", "Un", AIM_Portfolio_Code="AIM300")], [], holdings=hold)
    assert fund_of(m, "P2") == "PR1" and m.link.at["P2", "fund_link"] == "code_aim_inventaires"


def test_cle_alternative_unique_seulement():
    """ID_PI_FONDS porte le Product_Global_ID : rattaché s'il désigne un seul fonds, jamais s'il est ambigu."""
    ok = build([aum_row("F1", "P1", D, 10, 100, pi_fund="PG7")], [product("PR1", "Un", Product_Global_ID="pg7")], [])
    assert fund_of(ok, "P1") == "PR1"
    amb = build([aum_row("F1", "P1", D, 10, 100, pi_fund="PG7")],
                [product("PR1", "Un", Product_Global_ID="PG7"), product("PR2", "Deux", Product_Global_ID="PG7")], [])
    assert fund_of(amb, "P1") == "J:F1"


def test_cas_valor_quinze_parts():
    """Reproduction de la structure observée (R-co Valor C EUR, J:275) : 15 parts, identifiants de part en
    majuscules entre accolades, fiche part dupliquée sans ProductID, ISIN partagés, ID_PI_FONDS vide."""
    rows, shares = [], []
    for i in range(15):
        sid = f"aaaaaaaa-0000-0000-0000-{i:012d}"
        rows.append(aum_row("275", f"P{i}", D, 10, 100, pi_part="{" + sid.upper() + "}" if i % 3 else None,
                            isin="FR0011253624" if i < 4 else f"FR00{i:08d}"))
        shares.append(share(sid, None, f"FR00{i:08d}", f"Valor {i}", statecodename="Active"))
        shares.append(share(sid.upper() + " ", "PR-VALOR", f"FR00{i:08d}", f"Valor {i}", statecodename="Active"))
    m = build(rows, [product("PR-VALOR", "R-co Valor", Portfolio_Manager="Gérant", ESG_SFDR_Article="8")], shares)
    assert set(m.link["fund_id"]) == {"PR-VALOR"}
    assert list(m.funds.index) == ["PR-VALOR"] and bool(m.funds.at["PR-VALOR", "referenced"])
    assert float(m.fund_aum.loc[D, "PR-VALOR"]) == 15 * 1000
    f = {r["id"]: r for r in Service(m).funds(None, {})["funds"]}["PR-VALOR"]
    assert f["manager"] == "Gérant" and f["sfdr"] is not None


# ---------------------------------------------------------------- cohérence de bout en bout (structure réelle)
@pytest.fixture(scope="module")
def dirty():
    return Service(build_model(DirtySource()))


def test_pas_de_doublon_artificiel_dans_api_funds(dirty):
    ids = [f["id"] for f in dirty.funds(None, {})["funds"]]
    assert len(ids) == len(set(ids))
    assert dirty.links()["exact_duplicates"] == 0 and dirty.links()["duplicates"] == []


def test_somme_des_parts_egale_encours_du_fonds(dirty):
    m = dirty.m
    end = m.dates[-1]
    parts = m.share_aum.loc[end]
    for fid, g in m.link.groupby("fund_id"):
        expected = parts.reindex(g.index).sum(min_count=1)
        got = m.fund_aum.at[end, fid] if fid in m.fund_aum.columns else np.nan
        assert (np.isnan(expected) and np.isnan(got)) or abs(expected - got) < 1e-6


def test_referenced_et_famille_coherents(dirty):
    m = dirty.m
    ref = m.funds["referenced"].astype(bool)
    assert set(m.funds.index[ref]) == set(m.products.index)
    assert set(m.funds.index[~ref]) == set(m.link.loc[~m.link["fund_linked"], "fund_id"])
    assert (m.funds.loc[ref, "family"] != "nc").all()               # référentiel classable : jamais « nc »
    funds = {f["id"]: f for f in dirty.funds(None, {})["funds"]}
    for fid in m.funds.index[~ref]:
        assert funds[fid]["manager"] is None and funds[fid]["sfdr"] is None   # aucune métadonnée inventée


def test_diagnostic_sans_donnee_metier(dirty):
    """Le diagnostic du modèle (journalisé et imprimé par --bench) ne contient ni nom de fonds ni montant."""
    m = dirty.m
    text = json.dumps(m.link_report, ensure_ascii=False, default=str)
    for name in m.funds["name"].dropna().astype(str):
        if len(name) > 6:
            assert name not in text
    rep = dirty.links()
    p, f = rep["parts"], rep["funds"]
    assert p["total"] == p["by_pi_shareid"] + p["by_isin"] + p["unlinked"]
    assert f["total"] == f["by_product_id"] + f["by_id_pi_fonds"] + f["by_propagation"] + f["unlinked"]
    assert rep["aum"]["linked"] > 0
    assert rep["watch"] and rep["watch"][0]["referenced"]           # R-co 4Change Net Zero Credit Euro : une seule ligne


def test_diagnostic_api(dirty):
    from fastapi.testclient import TestClient
    from rco import api
    saved = api._S
    api._S = api._State()
    api._S.service, api._S.state = dirty, "ready"
    try:
        r = TestClient(api.app).get("/api/diagnostics/links").json()
    finally:
        api._S = saved
    assert {"parts", "funds", "aum", "watch", "unlinked_funds", "shapes", "joins", "probes"} <= set(r)


def test_schema_inventaires_contient_code_aim():
    assert "CODE_AIM_FONDS" in S.columns(S.HOLDINGS)
    frame(S.HOLDINGS, [dict(ID_JUMP_FONDS="F", CODE_AIM_FONDS="A")])


def test_structure_severe_aucun_fonds_jump_seul_avec_encours():
    """Toutes les parts d'un fonds touchées à la fois (cas J:275) : plus aucune ligne « JUMP seul » doublonnant le
    fonds du référentiel, encours entièrement portés par la ligne du référentiel."""
    svc = Service(build_model(HardSource()))
    rep = svc.links()
    assert rep["funds"]["unlinked_with_aum"] == 0 and rep["aum"]["unlinked"] == 0
    assert rep["duplicates"] == [] and rep["exact_duplicates"] == 0
    assert rep["referential_duplicates"]["shares"] > 0
    assert rep["methods"].get("pi_fonds_inventaires", 0) > 0           # le fonds sans ISIN : rattaché par ses inventaires
    ids = [f["id"] for f in svc.funds(None, {})["funds"]]
    assert len(ids) == len(set(ids)) == len(svc.m.products) + rep["funds"]["unlinked"]
