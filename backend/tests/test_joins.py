from helpers import aum_row, build, product, share

D = "2026-01-02"


def test_rattachement_par_id_puis_isin_puis_orphelin():
    rows = [
        aum_row("F1", "P1", D, 10, 100, pi_part="S1", isin="FR1"),          # par identifiant
        aum_row("F1", "P2", D, 10, 100, pi_part=None, isin="FR2"),          # secours ISIN
        aum_row("F1", "P3", D, 10, 100, pi_part="INCONNU", isin="FR9", pi_fund="PR1"),  # orpheline, fonds via JUMP
    ]
    m = build(rows, [product("PR1", "Fonds Un")], [share("S1", "PR1", "FR1", "Un C"), share("S2", "PR1", "FR2", "Un D")])
    link = m.link
    assert link.at["P1", "link"] == "id" and link.at["P1", "pi_shareid"] == "S1"
    assert link.at["P2", "link"] == "isin" and link.at["P2", "pi_shareid"] == "S2"
    assert link.at["P3", "link"] == "none"
    assert set(link["fund_id"]) == {"PR1"}


def test_isin_ambigu_non_utilise():
    rows = [aum_row("F1", "P1", D, 10, 100, isin="FRX")]
    m = build(rows, [product("PR1", "Fonds")], [share("S1", "PR1", "FRX", "a"), share("S2", "PR1", "FRX", "b")])
    assert m.link.at["P1", "link"] == "none"


def test_fonds_hors_referentiel_conserve_ses_encours():
    rows = [aum_row("FX", "PX", D, 5, 100), aum_row("F1", "P1", D, 10, 100, pi_part="S1")]
    m = build(rows, [product("PR1", "Fonds Un")], [share("S1", "PR1", "FR1", "Un C")])
    assert "J:FX" in m.funds.index and not m.funds.at["J:FX", "referenced"]
    assert m.fund_aum.loc["2026-01-02"].sum() == 1500


def test_pays_rattaches_par_part():
    from rco.service import Service
    rows = [aum_row("F1", "P1", D, 10, 100, pi_part="S1")]
    regs = [dict(Id="r1", pi_shareid="S1", Country="Italy", statecodename="Active", statuscodename="Active"),
            dict(Id="r2", pi_shareid="S1", Country="Germany", statecodename="Inactive", statuscodename="Inactive")]
    m = build(rows, [product("PR1", "Fonds Un")], [share("S1", "PR1", "FR1", "Un C")], countries=regs)
    svc = Service(m)
    assert svc.country("Italie", None)["n_funds"] == 1
    assert svc.country("Allemagne", None)["n_shares"] == 0
    assert svc.funds(None, {"country": "Italy"})["n_funds"] == 1
