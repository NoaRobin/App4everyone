"""Passif : correspondance exacte des colonnes, valeurs manquantes, dates américaines, transactions, comptes, positions,
confidentialité. Données entièrement fictives, au schéma exact des tables sources."""
from __future__ import annotations

import json
import re

import numpy as np
import pandas as pd
import pytest

from rco.data.mock import AS_OF
from rco.data.passif_mock import CPT_COLS, POS_COLS, TRX_COLS, PassifMock
from rco.data.sql_guard import assert_read_only
from rco.domain import passif as P


# ---------------------------------------------------------------- outils
def table(name: str, rows: list[dict], real_names: bool = False) -> pd.DataFrame:
    """Petite table au schéma exact : `rows` donne des valeurs par clé (teneur, montant_eur…), le reste est vide."""
    spec = P.SCHEMA[name]
    cols = [n if real_names else f"_c{i}" for i, (_, n, _) in enumerate(spec)]
    return pd.DataFrame([{c: r.get(k) for c, (k, _, _) in zip(cols, spec)} for r in rows], columns=cols)


def reader(**tables: pd.DataFrame) -> P.PandasReader:
    empty = {"compte": table("compte", [{"id_compte": f"C{i}", "teneur": "TA"} for i in range(6)]),
             "position": table("position", []), "transaction": table("transaction", [])}
    empty.update(tables)
    return P.PandasReader(lambda t: empty[t])


def positions(n: int, **kw) -> list[dict]:
    base = {"date": "9/30/2026 12:00:00 AM", "desk": "Valor", "classe_actif": "Equities", "devise": "EUR", "isin": "FR0000000001",
            "montant_eur": "100.00", "montant_devise": "100.00", "teneur": "TA", "classification": "TA/Client Actif", "pays": "France"}
    return [{**base, "compte": f"C{i % 6}", **kw} for i in range(n)]


def trx(n: int, **kw) -> list[dict]:
    base = {"date_centralisation": "9/30/2026 12:00:00 AM", "desk": "Valor", "classe_actif": "Equities", "devise": "EUR", "sens": "Souscription",
            "statut": "Valorisé", "montant_eur": "100.00", "montant_devise": "100.00", "isin": "FR0000000001"}
    return [{**base, "compte": f"C{i % 6}", "reference": f"R{i}", **kw} for i in range(n)]


def _walk(o, path=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from _walk(v, f"{path}.{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from _walk(v, f"{path}[{i}]")
    else:
        yield path, o


@pytest.fixture(scope="module")
def mock():
    return PassifMock(AS_OF, {"Actions": ["FR0000000001", "FR0000000002"], "Obligations": ["FR0000000003"]})


@pytest.fixture(scope="module")
def data(mock):
    return P.Passif(P.PandasReader(mock.table), {"FR0000000001": "PR1"}).compute()


# ---------------------------------------------------------------- 1 à 4 : correspondance exacte
def test_schema_exact_des_tables_fictives(mock):
    assert list(mock.table("compte").columns) == CPT_COLS and len(CPT_COLS) == 11
    assert list(mock.table("position").columns) == POS_COLS and len(POS_COLS) == 21
    assert list(mock.table("transaction").columns) == TRX_COLS and len(TRX_COLS) == 28
    assert P.N_COLS == {"compte": 11, "position": 21, "transaction": 28}


def test_correspondance_generique_exacte():
    m = {t: P.cols_of(P.resolve_mapping([f"_c{i}" for i in range(P.N_COLS[t])], t)) for t in P.TABLES}
    assert m["compte"] == {"teneur": "_c0", "id_compte": "_c1", "nom_compte": "_c2", "id_parent": "_c3", "nom_parent": "_c4", "id_client": "_c5",
                           "nom_client": "_c6", "classification": "_c7", "devise": "_c8", "date_creation": "_c9", "date_dissolution": "_c10"}
    p = m["position"]
    assert (p["compte"], p["isin"], p["fonds"], p["date"], p["quantite"], p["cours"], p["montant_devise"], p["devise"], p["montant_eur"],
            p["dernier_trade"], p["premier_trade"]) == ("_c3", "_c10", "_c9", "_c13", "_c14", "_c15", "_c16", "_c17", "_c18", "_c19", "_c20")
    t = m["transaction"]
    assert (t["date_centralisation"], t["date_vl"], t["date_valeur"], t["sens"], t["statut"], t["montant_devise"], t["montant_eur"],
            t["reference"], t["date_creation"], t["compte_indirect"]) == ("_c13", "_c14", "_c15", "_c16", "_c17", "_c21", "_c22", "_c25", "_c26", "_c27")


def test_position_c3_jamais_montant_et_c18_montant_eur():
    """1 et 2. Compte Centaure (_c3) n'est jamais lu comme montant ; la pondération est Montant EUR (_c18)."""
    rows = positions(10, montant_eur="100") + positions(10, desk="Conviction", montant_eur="300")
    for r in rows:                       # _c3 numérique et énorme, Montant Devise trompeur : sans effet
        r["compte"] = "999999999"
        r["montant_devise"] = "1" if r["desk"] == "Conviction" else "1000000"
    d = P.Passif(reader(position=table("position", rows))).compute()
    desks = {x["desk"]: x["pct"] for x in d["positions"]["by_desk"]}
    assert desks == {"Conviction": 75.0, "Valor": 25.0}
    assert d["lecture"]["tables"]["position"]["columns"][3]["field"] == "compte"
    assert d["lecture"]["tables"]["position"]["columns"][18]["field"] == "montant_eur"


def test_transaction_c21_montant_devise_c22_montant_eur():
    """3 et 4. Montant Devise (_c21) n'est jamais la pondération ; Montant EUR (_c22) l'est."""
    rows = trx(10, montant_eur="100", montant_devise="900000") + trx(10, sens="Rachat", montant_eur="300", montant_devise="1")
    for i, r in enumerate(rows):
        r["reference"] = f"R{i}"
    d = P.Passif(reader(transaction=table("transaction", rows))).compute()
    sens = {x["sens"]: x["pct"] for x in d["transactions"]["period_sens"]}
    assert sens == {"Rachat": 75.0, "Souscription": 25.0}
    cols = {c["field"]: c["col"] for c in d["lecture"]["tables"]["transaction"]["columns"]}
    assert cols["montant_devise"] == "_c21" and cols["montant_eur"] == "_c22"


def test_ajustement_configure_et_ajustement_ignore(monkeypatch):
    monkeypatch.setenv("APP_PASSIF_MAP_POSITION", "montant_eur=_c16, date=_c99, inconnu=_c1")
    m = P.resolve_mapping([f"_c{i}" for i in range(21)], "position")
    assert m["fields"]["montant_eur"] == {**m["fields"]["montant_eur"], "col": "_c16", "how": "configuré"}
    assert m["fields"]["date"]["col"] == "_c13"                                     # _c99 n'existe pas : ignoré, signalé
    assert {x["field"] for x in m["ignored"]} == {"date", "inconnu"}
    monkeypatch.setenv("APP_PASSIF_MAP_POSITION", "compte=_c3,isin=_c10,montant_eur=_c18")   # valeurs par défaut : confirmées
    m = P.resolve_mapping([f"_c{i}" for i in range(21)], "position")
    assert m["fields"]["montant_eur"]["col"] == "_c18" and not m["ignored"]


# ---------------------------------------------------------------- 5 : dates américaines
def test_dates_americaines():
    s = pd.Series(["9/30/2026 12:00:00 AM", "10/1/2026 3:12:45 PM", "1/2/2026", "2026-09-30", "2026-09-30T00:00:00", "30/09/2026",
                   "nan", "", None, "  ", "N/A", "abc"])
    d = P.to_date(s)
    assert [x.date().isoformat() if pd.notna(x) else None for x in d] == [
        "2026-09-30", "2026-10-01", "2026-01-02", "2026-09-30", "2026-09-30", None, None, None, None, None, None, None]
    assert P.shape("30/09/2026") == "99/99/9999" and P.shape("Sept 30") == "aaaa 99"


def test_valeurs_manquantes_et_nombres():
    s = pd.Series([None, "", "  ", "nan", "NaN", "none", "None", "null", "NULL", "N/A", "n/a", "x"])
    assert P.norm_text(s).isna().tolist() == [True] * 11 + [False]
    assert P.to_num(pd.Series(["1234.5", "1 234,5", "1,234.5", "-12", "nan", ""])).tolist()[:4] == [1234.5, 1234.5, 1234.5, -12.0]


# ---------------------------------------------------------------- 6 : jamais « nan » affiché
def test_nan_jamais_une_categorie():
    rows = positions(8, desk="nan", teneur="nan") + positions(8, desk="", teneur=" ") + positions(8)
    tr = trx(8, sens="nan") + trx(8)
    for i, r in enumerate(tr):
        r["reference"] = f"R{i}"
    cpt = table("compte", [{"id_compte": f"C{i}", "teneur": "nan" if i < 6 else "TA", "classification": "N/A"} for i in range(12)])
    d = P.Passif(reader(compte=cpt, position=table("position", rows), transaction=table("transaction", tr))).compute()
    text = json.dumps({k: v for k, v in d.items() if k != "lecture"}, ensure_ascii=False)
    assert not re.search(r'"(nan|NaN|None|null|N/A)"', text)
    assert {x["desk"] for x in d["positions"]["by_desk"]} == {"Valor", P.NOT_SET}
    assert P.NOT_SET in {x["teneur"] for x in d["comptes"]["teneurs"]}


# ---------------------------------------------------------------- 7 : dissolution
def test_dissolution_vide_ou_illisible_non_dissous():
    rows = ([{"id_compte": f"A{i}", "teneur": "TA", "date_dissolution": v} for i, v in enumerate(["", "nan", " ", None, "N/A", "31/12/2025"])]
            + [{"id_compte": f"B{i}", "teneur": "TA", "date_dissolution": "3/31/2025 12:00:00 AM"} for i in range(5)])
    d = P.Passif(reader(compte=table("compte", rows))).compute()
    c = d["comptes"]
    assert c["dissolved"]["label"] == "5 à 19" and c["open"]["label"] == "5 à 19"          # 5 dissous, 6 ouverts
    dd = next(x for x in d["lecture"]["tables"]["compte"]["columns"] if x["field"] == "date_dissolution")
    assert (dd["valid"], dd["invalid"], dd["nulls"]) == (5, 1, 5)
    assert dd["rejected"] == [{"shape": "99/99/9999", "n": 1}]


def test_compte_parent_sur_id_non_vide_et_enregistrements_ignores():
    rows = [{}]                                                                   # premier enregistrement vide de l'export
    rows += [{k: n for k, n, _ in P.SCHEMA["compte"]}]                          # en-tête relue comme donnée
    rows += [{"id_compte": f"P{i}", "teneur": "TA", "id_parent": "PARENT"} for i in range(5)]
    rows += [{"id_compte": f"S{i}", "teneur": "TA", "id_parent": v} for i, v in enumerate(["", "nan", None, " ", "null", "NaN", "N/A"])]
    d = P.Passif(reader(compte=table("compte", rows))).compute()
    assert d["comptes"]["with_parent"]["label"] == "5 à 19" and d["comptes"]["without_parent"]["label"] == "5 à 19"
    lt = d["lecture"]["tables"]["compte"]
    assert (lt["rows"], lt["usable"], lt["ignored_rows"]) == (14, 12, 2)


# ---------------------------------------------------------------- 8 : période des transactions
def test_transaction_datee_dans_la_periode():
    tr = trx(6, date_centralisation="9/28/2026 12:00:00 AM") + trx(6, date_centralisation="9/30/2026 4:10:00 PM")
    for i, r in enumerate(tr):
        r["reference"] = f"R{i}"
    d = P.Passif(reader(transaction=table("transaction", tr))).compute()
    t = d["transactions"]
    assert t["available"] and (t["first"], t["last"]) == ("2026-09-28", "2026-09-30") and [x["date"] for x in t["days"]] == ["2026-09-28", "2026-09-30"]


def test_soixante_jours_ouvres_et_statuts_autorises(data):
    t = data["transactions"]
    assert t["n_days"] == 60 and all(pd.Timestamp(x["date"]).dayofweek < 5 for x in t["days"])
    inc = {x["statut"]: x["included"] for x in t["statuts"]}
    assert inc == {"Valorisé": True, "Clôturé / après cut-off": True, "Annulé": False, "En attente": False}
    assert t["late"]["calculable"] and 0 < t["late"]["pct"] < 100


def test_statut_non_autorise_exclu_meme_avec_montant():
    tr = trx(6, statut="Annulé", montant_eur="1000000") + trx(6)
    for i, r in enumerate(tr):
        r["reference"] = f"R{i}"
    t = P.Passif(reader(transaction=table("transaction", tr))).compute()["transactions"]
    assert t["ops"]["label"] == "5 à 19" and {x["sens"]: x["pct"] for x in t["period_sens"]} == {"Souscription": 100.0}


def test_apres_cut_off_non_calculable_sans_statut():
    tr = trx(6, statut=None)
    for i, r in enumerate(tr):
        r["reference"] = f"R{i}"
    t = P.Passif(reader(transaction=table("transaction", tr))).compute()["transactions"]
    assert t["available"] is False and "statut autorisé" in t["reason"]
    # statut renseigné mais aucun « après cut-off » : calculable, 0 %
    tr = trx(6)
    t = P.Passif(reader(transaction=table("transaction", tr))).compute()["transactions"]
    assert t["late"] == {**t["late"], "calculable": True, "pct": 0.0}


def test_doublons_de_reference():
    """Une ligne n'est écartée que si référence, compte, ISIN, sens, statut, date et montant sont identiques."""
    tr = trx(6)
    tr += [dict(tr[0]), dict(tr[0])]                                            # doublons exacts : comptés une fois
    tr += [{**tr[1], "isin": "FR0000000002"}]                                   # même référence, autre ISIN : conservée
    d = P.Passif(reader(transaction=table("transaction", tr))).compute()
    assert d["lecture"]["duplicates"] == {"references": 6, "refs_repeated": 2, "exact_duplicates": 2, "refs_multi_lines": 1, "without_reference": 0}
    assert d["transactions"]["ops"]["label"] == "5 à 19"


def test_aucune_date_valide_diagnostic():
    rows = positions(6, date="30.09.2026")
    d = P.Passif(reader(position=table("position", rows))).compute()
    assert d["positions"]["available"] is False and d["positions_as_of"] is None
    assert "99.99.9999" in d["positions"]["reason"] and "m/j/aaaa" in d["positions"]["reason"]
    assert any(p["level"] == "erreur" and p["table"] == "position" for p in d["lecture"]["problems"])


def test_photo_a_la_date_maximale_valide():
    rows = positions(6, date="9/29/2026 12:00:00 AM", desk="Conviction") + positions(6) + positions(6, date="13/45/2026")
    d = P.Passif(reader(position=table("position", rows))).compute()
    assert d["positions_as_of"] == "2026-09-30" and {x["desk"] for x in d["positions"]["by_desk"]} == {"Valor"}


# ---------------------------------------------------------------- 9 à 13 : confidentialité
SECRETS = ("CPT-", "CLI-", "Client synthétique", "Compte synthétique", "Commercial synthétique", "Commentaire synthétique", "REF0")


def test_donnees_confidentielles_agregees(data):
    text = json.dumps(data, ensure_ascii=False)
    for s in SECRETS:
        assert s not in text, s


def test_aucun_nom_ni_ligne_ne_quitte_fabric():
    """10. Les requêtes Fabric sont des SELECT agrégés ; les colonnes de noms n'y figurent qu'en comptage de valeurs nulles."""
    seen: list[str] = []

    class Fake:
        def query(self, sql, params=(), **kw):
            seen.append(assert_read_only(sql))
            if "TOP 0 *" in sql:
                n = 28 if "transaction" in sql else 21 if "position" in sql else 11
                return pd.DataFrame(columns=[f"_c{i}" for i in range(n)])
            return pd.DataFrame([{a: 0 for a in re.findall(r"AS \[(\w+)\]", sql)}])
    r = P.SqlReader(Fake(), P.table_names())
    P.Passif(r).compute()
    assert seen and all(re.match(r"^\s*(SELECT|WITH)\b", s) for s in seen)
    conf = {t: [f"p.[_c{i}]" for i, (_, _, k) in enumerate(P.SCHEMA[t]) if k == "confidentiel"] for t in P.TABLES}
    for s in seen:
        t = "transaction" if "[transaction]" in s else "position" if "[position]" in s else "compte"
        if "(lecture)" in s or "AS [n0]" in s:                           # lecture : seulement IS NULL / COUNT
            continue
        for c in conf[t]:
            assert c not in s, (c, s[:200])
        assert "SELECT TOP" not in s.replace("SELECT TOP 0 *", "") and "TOP 5" not in s
    with pytest.raises(ValueError):
        P.SqlReader(Fake(), {"position": "position]; DROP TABLE x --"}).columns("position")
    with pytest.raises(ValueError):
        r._q("position", "_c1]; --")


def test_sql_fabric_valide():
    sqlglot = pytest.importorskip("sqlglot")
    seen: list[str] = []

    class Fake:
        def query(self, sql, params=(), **kw):
            seen.append(sql)
            e = sqlglot.parse_one(sql, read="tsql")
            if "TOP 0 *" in sql:
                n = 28 if "transaction" in sql else 21 if "position" in sql else 11
                return pd.DataFrame(columns=[f"_c{i}" for i in range(n)])
            return pd.DataFrame([{k: 0 for k in e.named_selects}])
    r = P.SqlReader(Fake(), P.table_names())
    maps = {t: P.resolve_mapping(r.columns(t), t) for t in P.TABLES}
    for t in P.TABLES:
        r.stats(t, maps[t])
    r.group("position", maps["position"], {"d": ("date", "date"), "y": ("year", "premier_trade"), "m": ("matched", "compte")},
            {"n": ("count", None), "v": ("sum", "montant_eur"), "a": ("distinct", "compte")}, [("date_eq", "date", "2026-09-30")], m_compte=maps["compte"])
    r.group("transaction", maps["transaction"], {"d": ("date", "date_centralisation")}, {"v": ("sumabs", "montant_eur")},
            [("date_ge", "date_centralisation", "2026-07-01")], dedup=["reference", "compte", "montant_eur"])
    r.concentration("position", maps["position"], [("date_eq", "date", "2026-09-30")])
    r.duplicates("transaction", maps["transaction"], ["reference", "compte", "isin", "date_centralisation", "montant_eur"])
    assert len(seen) >= 10


def test_groupes_de_moins_de_cinq_masques():
    g = pd.DataFrame({"desk": ["Valor", "OPAL", "RMM"], "n": [4, 30, 200], "v": [5.0, 30.0, 65.0]})
    v = P._shares(g, ["desk"], "v", 100.0)
    assert [x["desk"] for x in v] == ["RMM", "OPAL"] and P._residual(v) == pytest.approx(5.0)
    assert P.tranche(4) is None and P.tranche(5)["label"] == "5 à 19" and P.tranche(1234)["label"] == "1 000 et plus"
    d = P.Passif(reader(position=table("position", positions(12) + positions(4, desk="OPAL")))).compute()
    assert {x["desk"] for x in d["positions"]["by_desk"]} == {"Valor"} and d["positions"]["by_desk"][0]["pct"] == 75.0


def test_parts_sur_montant_eur(data):
    p = data["positions"]
    assert p["measure"] == "part de l'encours (Montant EUR)"
    assert sum(x["pct"] for x in p["by_desk"]) == pytest.approx(100, abs=0.6)


ALLOWED_NUM = {"pct", "residual_pct", "late_pct", "period_late_pct", "rank", "top_pct", "amount_pct", "rows_pct", "amount_valid_pct",
               "n_days", "window_days", "encours_pct", "in_pct", "out_pct", "activity", "top_funds_pct"}
LECTURE_COUNTS = {"rows", "accounts", "usable", "ignored_rows", "n_columns", "expected", "nulls", "filled", "valid", "invalid", "distinct", "n", "linked",
                  "references", "refs_repeated", "exact_duplicates", "refs_multi_lines", "without_reference", "amount_pct", "rows_pct", "pct", "rank"}


def test_aucun_montant_absolu_vers_le_frontend(data):
    """13. Hors lecture des tables (comptages de lignes), seules des parts 0–100 % et des rangs sortent."""
    for path, v in _walk({k: v for k, v in data.items() if k != "lecture"}):
        if isinstance(v, bool) or v is None or isinstance(v, str):
            continue
        last = re.sub(r"\[\d+\]$", "", path.rsplit(".", 1)[-1])
        assert last in ALLOWED_NUM, path
        assert 0 <= v <= 100, path
    for path, v in _walk(data["lecture"]):
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            assert re.sub(r"\[\d+\]$", "", path.rsplit(".", 1)[-1]) in LECTURE_COUNTS, path
            assert float(v).is_integer() or v <= 100, path          # des comptages entiers, jamais une somme de montants


# ---------------------------------------------------------------- 14 : vrais noms = _c0…_cN
def test_vrais_noms_et_generiques_memes_agregats(mock, data):
    def renamed(t):
        df = mock.table(t)
        return df.rename(columns={f"_c{i}": n for i, (_, n, _) in enumerate(P.SCHEMA[t])})
    named = {t: renamed(t) for t in P.TABLES}
    d2 = P.Passif(P.PandasReader(lambda t: named[t]), {"FR0000000001": "PR1"}).compute()
    assert d2["lecture"]["tables"]["position"]["mode"] == "noms" and data["lecture"]["tables"]["position"]["mode"] == "_cN"
    for k in ("comptes", "positions", "transactions", "funds", "positions_as_of", "model"):
        assert d2[k] == data[k], k


# ---------------------------------------------------------------- lecture des tables, rattachements, contrôle Fabric
def test_lecture_des_tables(data):
    lt = data["lecture"]["tables"]
    assert lt["position"]["to_confirm"] == [] and lt["transaction"]["to_confirm"] == [] and lt["compte"]["to_confirm"] == []
    pos = {c["field"]: c for c in lt["position"]["columns"]}
    assert pos["montant_eur"]["detected"] == "nombre" and pos["date"]["detected"] == "date" and pos["date"]["invalid"] == 0
    assert pos["nom_client"]["used"] is False and pos["nom_client"]["distinct"] is None
    assert lt["transaction"]["ignored_rows"] == 1                                  # ligne d'en-tête relue comme donnée
    assert lt["compte"]["ignored_rows"] == 1                                        # premier enregistrement vide
    links = data["lecture"]["links"]
    assert links["accounts"]["rows_pct"] == 100.0 and links["isin"]["linked"] == 1
    assert data["positions"]["concentration"]["available"]


def test_controle_fabric_passif(mock):
    res = P.check(P.PandasReader(mock.table))
    assert all(ok is not False for ok, _ in res), [m for ok, m in res if ok is False]
    msgs = " | ".join(m for _, m in res)
    assert "compte : 11 colonnes sur 11" in msgs and "position : 21 colonnes sur 21" in msgs and "transaction : 28 colonnes sur 28" in msgs
    assert "Date centralisation (_c13)" in msgs and "lignes exploitables" in msgs
    bad = P.check(reader(position=table("position", positions(6, date="30.09.2026"))))
    assert any(ok is False and "Date (_c13)" in m and "99.99.9999" in m for ok, m in bad)


def test_tables_absentes_passif_indisponible():
    class Broken:
        kind = "fabric"

        def columns(self, name):
            raise RuntimeError("table inconnue")
    d = P.Passif(Broken()).get()
    assert d["available"] is False and "reason" in d


# ---------------------------------------------------------------- vue nominative (choix explicite de l'équipe)
@pytest.fixture(scope="module")
def nominatif(mock):
    return P.Passif(P.PandasReader(mock.table), {"FR0000000001": "PR1", "FR0000000002": "PR2"}, fund_names={"PR1": "Fonds Un", "PR2": "Fonds Deux"})


def test_porteurs_d_un_fonds(nominatif):
    h = nominatif.holders("PR1")
    assert h["available"] and h["nominatif"] and h["n_clients"] > 10
    assert sum(x["pct"] for x in h["clients"]) + (h["others_pct"] or 0) == pytest.approx(100, abs=1.5)
    assert all(x["client"].startswith("Client synthétique") for x in h["clients"])
    pcts = [x["pct"] for x in h["clients"]]
    assert pcts == sorted(pcts, reverse=True)
    for path, v in _walk(h):                                   # des parts et des comptages, jamais un montant
        if isinstance(v, float):
            assert 0 <= v <= 100, path
    assert nominatif.holders("INCONNU")["clients"] == []


def test_recherche_d_un_client(nominatif):
    top = nominatif.holders("PR1")["clients"][0]["client"]
    r = nominatif.client_search(top)
    hit = next(x for x in r["clients"] if x["client"] == top)
    f = next(x for x in hit["funds"] if x["fund"] == "PR1")
    assert f["name"] == "Fonds Un" and f["pct_of_fund"] == pytest.approx(nominatif.holders("PR1")["clients"][0]["pct"], abs=0.2)
    assert nominatif.client_search("a")["clients"] == []                     # au moins deux caractères


def test_vue_nominative_sql_parametree():
    """Le nom recherché et les ISIN passent en paramètres, jamais dans le texte de la requête."""
    seen: list[tuple[str, list]] = []

    class Fake:
        def query(self, sql, params=(), **kw):
            seen.append((assert_read_only(sql), list(params)))
            if "TOP 0 *" in sql:
                return pd.DataFrame(columns=[f"_c{i}" for i in range(21)])
            return pd.DataFrame(columns=["client", "isin", "n", "v", "comptes", "teneur", "pays", "classification"])
    r = P.SqlReader(Fake(), P.table_names())
    m = P.resolve_mapping(r.columns("position"), "position")
    r.holders("position", m, ["FR0000000001"], [("date_eq", "date", "2026-09-30")])
    r.client_funds("position", m, "Dupont'; DROP TABLE x --", [("date_eq", "date", "2026-09-30")])
    assert seen[-2][1] == ["FR0000000001"] and "FR0000000001" not in seen[-2][0]
    assert "Dupont" not in seen[-1][0] and seen[-1][1][0].startswith("%dupont")
