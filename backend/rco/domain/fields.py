"""Catalogue métier : chaque colonne utile du référentiel, son libellé, sa rubrique et son format.

Aucun nom de table ou de colonne n'est jamais affiché à l'utilisateur : seuls ces libellés le sont.
Formats : text, long (paragraphe), date, pct (valeur déjà exprimée en %), pct_int, bool, int, money, code.
"""
from __future__ import annotations

from typing import Any

from . import labels as L
from .model import _clean

# ---------------------------------------------------------------------- fonds (pi_out_product_active)
FUND_SECTIONS: list[tuple[str, str, list[tuple[str, str, str]]]] = [
    ("identite", "Identité", [
        ("Product_Name", "Nom du fonds", "text"),
        ("Management_Expertise_Level_1", "Expertise", "text"),
        ("Management_Expertise_Level_2", "Sous-expertise", "text"),
        ("Fund_Range", "Gamme", "text"),
        ("Asset_Class", "Classe d'actifs", "text"),
        ("Legal_Form", "Forme juridique", "text"),
        ("Umbrella_Name", "SICAV ombrelle", "text"),
        ("Domiciliation", "Pays de domiciliation", "text"),
        ("Applicable_UCI_Regulation", "Réglementation", "text"),
        ("Product_Type", "Type de produit", "text"),
        ("AMF_Classification", "Classification AMF", "text"),
        ("Accounting_Currency", "Devise de référence", "code"),
        ("Creation_Date", "Date de création", "date"),
        ("First_NAV_Date", "Première VL", "date"),
        ("Maturity_date", "Échéance", "date"),
        ("Statut_Du_Produit", "Statut", "text"),
    ]),
    ("gestion", "Gestion", [
        ("Portfolio_Manager", "Gérant principal", "text"),
        ("Start_date_Portfolio_manager", "Gérant depuis le", "date"),
        ("Portfolio_Manager_backup_1", "Gérant suppléant", "text"),
        ("Portfolio_Manager_backup_2", "Second suppléant", "text"),
        ("Portfolio_Manager_backup_3", "Troisième suppléant", "text"),
        ("Investment_Manager", "Société de gestion", "text"),
        ("Investment_Management_Delegation", "Délégation de gestion", "bool"),
        ("Delegation_investment_manager", "Délégataire de gestion", "text"),
        ("Investment_Advisor", "Conseiller en investissement", "text"),
        ("Benchmark_Name", "Indicateur de référence", "text"),
        ("Comparison_index", "Indice de comparaison", "text"),
        ("Investment_Zone", "Zone d'investissement", "text"),
        ("Recommended_Investment_Period", "Durée de placement recommandée", "text"),
        ("Investment_objective_FR", "Objectif de gestion", "long"),
        ("Strategic_allocation_FR", "Allocation stratégique", "long"),
        ("Typical_investor_profile_FR", "Profil de l'investisseur type", "long"),
        ("Fund_of_Funds", "Fonds de fonds", "bool"),
        ("Feeder_Fund_", "Fonds nourricier", "bool"),
        ("External_master_fund_name", "Fonds maître", "text"),
        ("ETF_Fund", "ETF", "bool"),
    ]),
    ("risques", "Risques", [
        ("Official_Risk_Scale", "Indicateur de risque (SRI)", "text"),
        ("Previous_month_SRI", "SRI du mois précédent", "text"),
        ("Official_Risk_Scale_SRRI", "SRRI", "int"),
        ("Global_Exposure_Calculation", "Calcul du risque global", "text"),
        ("Strategy_based_on_derivatives", "Stratégie reposant sur des dérivés", "bool"),
        ("Leveraged_Financial_or_Contingent_Liability_Instr", "Recours à l'effet de levier", "bool"),
        ("Volatility_target", "Objectif de volatilité", "bool"),
        ("volatility_maximum_target_PerCent", "Volatilité maximale cible", "pct"),
        ("Liquidity_risk", "Risque de liquidité", "bool"),
        ("Liquidity_risk_Equity", "Risque de liquidité actions", "bool"),
        ("Liquidity_risk_Alternative", "Risque de liquidité alternatif", "bool"),
        ("Credit_risk", "Risque de crédit", "bool"),
        ("Counterparty_risk", "Risque de contrepartie", "bool"),
        ("Impact_of_techniques_such_as_derivatives", "Impact des techniques dérivées", "bool"),
        ("Operational_and_custody_related_risks", "Risque opérationnel et de conservation", "bool"),
        ("Minimum_PerCent_of_High_Yields", "Part minimale de haut rendement", "pct"),
        ("Maximum_PerCent_of_High_Yields", "Part maximale de haut rendement", "pct"),
        ("No_Capital_Guarantee", "Sans garantie en capital", "bool"),
        ("Entity_in_charge_of_risk_monitoring", "Entité en charge du suivi des risques", "text"),
    ]),
    ("frais", "Frais du fonds", [
        ("Max_management_fee_PerCent", "Frais de gestion maximum", "pct"),
        ("Actual_Management_Fees_PerCent", "Frais de gestion réels", "pct"),
        ("Performance_fees", "Commission de surperformance", "bool"),
        ("Performance_Fee_Formula", "Mode de calcul de la surperformance", "long"),
        ("High_Water_Mark", "High water mark", "bool"),
        ("Max_Indirect_Management_fees_PerCent", "Frais de gestion indirects maximum", "pct"),
        ("Subscription_Fee_Retained_PerCent", "Commission de souscription acquise", "pct"),
        ("Redemption_Fee_Retained_PerCent", "Commission de rachat acquise", "pct"),
        ("Explicit_Transaction_costs_ex_ante_3_years_mean", "Coûts de transaction explicites (moy. 3 ans)", "pct"),
        ("Implicit_trans_costs_ex_ante3Y_mean", "Coûts de transaction implicites (moy. 3 ans)", "pct"),
    ]),
    ("fonctionnement", "Fonctionnement", [
        ("NAV_Frequency", "Fréquence de valorisation", "text"),
        ("NAV_Calculation_Day", "Jour de calcul de la VL", "text"),
        ("Annual_closing_date", "Clôture de l'exercice", "text"),
        ("Asset_accounting_method", "Méthode de comptabilisation", "text"),
        ("Depositary", "Dépositaire", "text"),
        ("Custodian", "Conservateur", "text"),
        ("Fund_Administrator", "Valorisateur", "text"),
        ("Transfer_Agent", "Agent de transfert", "text"),
        ("Centralizing_Agent", "Centralisateur", "text"),
        ("Commissaire_Aux_Comptes", "Commissaire aux comptes", "text"),
        ("Auditors_Mandate_Start_Date", "Début du mandat du commissaire aux comptes", "date"),
        ("Auditors_Mandate_Termination_Date", "Fin du mandat du commissaire aux comptes", "date"),
        ("Clearer", "Compensateur", "text"),
    ]),
    ("reglementaire", "Réglementaire & fiscalité", [
        ("Priips_Fund", "PRIIPs", "bool"),
        ("Mifid_Fund", "MiFID", "bool"),
        ("KID_Generation", "Génération du DIC", "bool"),
        ("EET_Fund", "EET produit", "bool"),
        ("Article_29", "Article 29 LEC", "text"),
        ("OPC_Eligible_US_Person", "Accessible aux US Persons", "bool"),
        ("FATCA_Family", "Statut FATCA", "text"),
        ("European_Savings_Tax_Directive_Interest_Decla", "Directive épargne", "text"),
        ("Italian_White_List", "Liste blanche italienne", "bool"),
        ("Is_Fund_With_Tax_Exemption_In_Germany", "Exonération partielle en Allemagne", "bool"),
        ("Applicable_Tax_Procedure_In_Germany", "Régime fiscal allemand", "text"),
        ("PEA_taxation_effective_Date", "Éligibilité PEA depuis", "date"),
        ("Website_Publication", "Publié sur le site internet", "bool"),
        ("Dissemination_Blocker", "Diffusion bloquée", "bool"),
    ]),
    ("codes", "Codes", [
        ("Product_Global_ID", "Identifiant produit", "code"),
        ("LEI_Code", "Code LEI", "code"),
        ("AMF_Code", "Code AMF", "code"),
        ("CSSF_Code", "Code CSSF", "code"),
        ("FSMA_Code", "Code FSMA", "code"),
        ("CNMV_Code", "Code CNMV", "code"),
        ("GIIN_Code", "Code GIIN", "code"),
        ("AIM_Portfolio_Code", "Code portefeuille AIM", "code"),
        ("Fund_Administrator_Portfolio_Code", "Code portefeuille valorisateur", "code"),
        ("National_identification_code", "Code d'identification national", "code"),
        ("Code_CIC", "Code CIC", "code"),
    ]),
]

ESG_FIELDS: list[tuple[str, str, str]] = [
    ("ESG_SFDR_Article", "Classification SFDR", "text"),
    ("ESG_AMF_Category", "Catégorie AMF (doctrine ESG)", "text"),
    ("RSI_french_label", "Label ISR", "bool"),
    ("Finansol_Label", "Label Finansol", "bool"),
    ("Belgium_Towards_Sustainability_label", "Label Towards Sustainability", "bool"),
    ("Main_ESG_Focus_EET_20090", "Axe ESG principal", "text"),
    ("Type_of_approach", "Type d'approche", "text"),
    ("Does_it_consider_PAI_EET_20100", "Prise en compte des principales incidences négatives", "bool"),
    ("Does_it_invest_in_SI_EET_20170", "Investit en investissements durables", "bool"),
    ("PerCent_Min_SI_EET_20420", "Part minimale d'investissements durables", "pct_int"),
    ("PerCent_Min_SI_Env_EET_20440", "… dont objectif environnemental", "pct_int"),
    ("PerCent_Min_SI_Social_EET_20470", "… dont objectif social", "pct_int"),
    ("PerCent_Min_with_ES_Characteristics_EET_20400", "Part minimale alignée E/S", "pct_int"),
    ("PerCent_Min_Aligned_Taxonomy_Incl_Sovereing_EET_20600", "Alignement taxonomie minimum (souverains inclus)", "pct_int"),
    ("PerCent_Min_Aligned_Taxonomy_Excl_Sovereign_EET20610", "Alignement taxonomie minimum (hors souverains)", "pct_int"),
    ("Aligned_With_Paris_Agreement_EET_20580", "Aligné sur l'Accord de Paris", "bool"),
    ("Objective_Reduction_Carbon_Emissions_EET_20570", "Objectif de réduction carbone", "bool"),
    ("Reference_ESG_Benchmark_EET_20370", "Indice de référence ESG", "bool"),
]

EXCLUSIONS: list[tuple[str, str]] = [
    ("Controversial_Weapons_Considered_EET_31140", "Armes controversées"),
    ("Nuclear_Weapons_Exclusion_EET_51400", "Armes nucléaires"),
    ("Conventional_Weapons_Exclusion_EET_50500", "Armes conventionnelles"),
    ("Tobacco_Exclusion_EET_52000", "Tabac"),
    ("Alcohol_Exclusion_EET_50200", "Alcool"),
    ("Gambling_Exclusion_EET_50900", "Jeux d'argent"),
    ("Pornography_Exclusion_EET_50100", "Pornographie"),
    ("Oil_Exclusion_EET_51500", "Pétrole"),
    ("Gas_Exclusion_EET_51000", "Gaz"),
    ("Other_Fossil_Fuel_Exclusion_EET_51600", "Autres énergies fossiles"),
    ("Nuclear_Energy_Exclusion_EET_51300", "Énergie nucléaire"),
    ("Palm_Oil_Exclusion_EET_51700", "Huile de palme"),
    ("GMO_Exclusion_EET_51200", "OGM"),
    ("OECD_Guidelines_Exclusion_EET_52210", "Principes directeurs de l'OCDE"),
    ("ILO_Exclusion_EET_52220", "Conventions de l'OIT"),
    ("Sovereign_Corruption_Exclusion_EET_53030", "États : corruption"),
    ("Sovereign_Non_Ratifi_Paris_Agreement_EET_53060", "États : non-signataires de l'Accord de Paris"),
]

PAI: list[tuple[str, str]] = [
    ("GHG_Emissions_Scope123_Considered_EET_30190", "Émissions de GES (scopes 1-2-3)"),
    ("Carbon_Footprint_Scope_123_Considered_EET_30270", "Empreinte carbone"),
    ("GHG_Intensity_Scope_123_Considered_EET_30350", "Intensité de GES"),
    ("Exposure_to_Fossil_Fuel_Considered_EET_30390", "Exposition aux énergies fossiles"),
    ("Energy_Conso_From_NonEnR_Considered_EET_30430", "Énergie non renouvelable"),
    ("Biodiversity_Considered_EET_30870", "Biodiversité"),
    ("Water_Emissions_Considered_EET_30910", "Rejets dans l'eau"),
    ("Hazardous_Waste_Considered_EET_30950", "Déchets dangereux"),
    ("Violation_UNGC_OECD_Considered_EET_30990", "Violations du Pacte mondial / OCDE"),
    ("Gender_Pay_Gap_Considered_EET_31060", "Écart de rémunération femmes-hommes"),
    ("Board_Gender_Diversity_Considered_EET_31100", "Mixité des conseils"),
    ("Controversial_Weapons_Considered_EET_31140", "Armes controversées"),
    ("Sovereign_GHG_Intensity_Considered_EET_31180", "Intensité GES des États"),
    ("Countries_Social_Violation_Considered_EET_31220", "États : violations sociales"),
]

VALIDATIONS: list[tuple[str, str]] = [
    ("PM_Validation", "Gestion"), ("Risks_Validation", "Risques"), ("JUR_Validation", "Juridique"),
    ("MOA_Validation", "MOA"), ("MO_Validation", "Middle office"), ("MOR_Validation", "MO réglementaire"),
    ("REP_Validation", "Reporting"), ("Sales_Validation", "Commercial"),
]

# ---------------------------------------------------------------------- parts (PI_OUT_Share)
SHARE_SECTIONS: list[tuple[str, str, list[tuple[str, str, str]]]] = [
    ("identite", "Identité de la part", [
        ("Share_Name", "Nom de la part", "text"), ("ISIN_Code", "Code ISIN", "code"),
        ("Share_Class", "Catégorie", "text"), ("Subscription_Currency", "Devise", "code"),
        ("Share_Hedged_Against_FX_Exposure", "Couverte contre le risque de change", "bool"),
        ("Income_Distribution", "Affectation des revenus", "text"), ("Distribution_Frequency", "Fréquence de distribution", "text"),
        ("Investor_Type", "Souscripteurs concernés", "text"), ("Investor_Type_Retail", "Clients non professionnels", "bool"),
        ("Investor_Type_Professional", "Clients professionnels", "bool"), ("Investor_Type_Eligible_Counterparty", "Contreparties éligibles", "bool"),
        ("Main_Share", "Part principale", "bool"), ("Lifecycle", "Cycle de vie", "text"),
        ("Product_Status", "Statut", "text"), ("First_NAV_Date", "Première VL", "date"), ("Initial_NAV", "VL d'origine", "num"),
        ("Morningstar_rating", "Note Morningstar", "stars"), ("Morningstar_rating_date", "Note au", "date"),
    ]),
    ("frais", "Frais de la part", [
        ("Ongoing_Charges_ex_post", "Frais courants (ex post)", "pct"), ("Ongoing_Charges_ex_postCalculation_Date", "Frais courants calculés au", "date"),
        ("Ongoing_Charges_ex_ante", "Frais courants (ex ante)", "pct"),
        ("Max_Financial_Management_Fees", "Frais de gestion financière maximum", "pct"),
        ("Actual_Financial_Management_Fees", "Frais de gestion financière réels", "pct"),
        ("Max_admin_fees", "Frais administratifs maximum", "pct"), ("TER_Max", "TER maximum", "pct"),
        ("Performance_fees", "Commission de surperformance", "bool"), ("Performance_Fee_Formula", "Mode de calcul", "long"),
        ("Maximum_Subscription_Fee_Rate_Not_Retained", "Droits d'entrée maximum", "pct"),
        ("Maximum_Redemption_Fee_Rate_Not_Retained", "Droits de sortie maximum", "pct"),
        ("Subscription_Fee_Retained", "Commission de souscription acquise", "pct"),
        ("Redemption_Fee_Retained", "Commission de rachat acquise", "pct"),
        ("Standard_Trailer_Fees_Holdings", "Rétrocession standard", "pct"),
        ("Premium_Trailer_Fees_Holdings", "Rétrocession premium", "pct"),
    ]),
    ("souscription", "Souscriptions & rachats", [
        ("Initial_Subscription_Minimum_Amount", "Minimum de souscription initiale", "money"),
        ("Initial_Subscription_Minimum_Quantity", "Minimum de souscription (parts)", "num"),
        ("Subscription_cut_off_time", "Heure limite de souscription", "text"),
        ("Redemption_cut_off_time", "Heure limite de rachat", "text"),
        ("Centralisation_day", "Centralisation", "text"),
        ("Subscription_Settlement_Date", "Règlement des souscriptions", "text"),
        ("Redemption_Settlement_Date", "Règlement des rachats", "text"),
        ("NAV_Frequency", "Fréquence de VL", "text"), ("Share_Class_Decimalisation", "Décimalisation", "text"),
        ("Swing_Pricing", "Swing pricing", "bool"), ("Gate", "Gates", "bool"), ("Gaterate", "Seuil de gate", "pct"),
        ("Redemption_Notice", "Préavis de rachat (jours)", "int"),
    ]),
    ("plateformes", "Plateformes & diffusion", [
        ("Clearstream_Referencing", "Clearstream", "bool"), ("Euroclear_France_Admission", "Admission Euroclear France", "bool"),
        ("Euroclear_France_Platform_Referencing", "Plateforme Euroclear France", "bool"), ("Fundsettle_Referencing", "FundSettle", "bool"),
        ("Iznes_Referencing", "Iznes", "bool"), ("Export_AllFunds", "Allfunds", "bool"),
        ("Export_Morningstar", "Diffusion Morningstar", "bool"), ("Export_Bloomberg", "Diffusion Bloomberg", "bool"),
        ("Export_Quantalys", "Diffusion Quantalys", "bool"), ("Website_Publication", "Publiée sur le site internet", "bool"),
    ]),
    ("codes", "Codes", [
        ("ISIN_Code", "ISIN", "code"), ("Bloomberg_Ticker", "Ticker Bloomberg", "code"), ("Code_RIC", "Code RIC", "code"),
        ("Wkn_Number", "WKN", "code"), ("Sedol_Code", "SEDOL", "code"), ("Swiss_Valor_Number", "Valor", "code"),
        ("CSSF_Code", "Code CSSF", "code"), ("FIC_Code", "Code FIC", "code"), ("Share_ID_Global", "Identifiant part", "code"),
    ]),
    ("fiscalite", "Réglementaire & fiscalité", [
        ("Mifid2_Share", "MiFID II", "bool"), ("Priips_Share", "PRIIPs", "bool"), ("FATCA", "FATCA", "bool"),
        ("Tax_StatusUK", "Reporting fund (Royaume-Uni)", "bool"), ("Fiscal_Transparency_In_Germany", "Transparence fiscale Allemagne", "bool"),
        ("Fiscal_Transparency_In_Austria", "Transparence fiscale Autriche", "bool"),
        ("Fiscal_Transparency_In_Switzerland", "Transparence fiscale Suisse", "bool"),
        ("Last_DIC_Modification_Date", "Dernière mise à jour du DIC", "date"),
    ]),
]

PLATFORMS: list[tuple[str, str]] = [
    ("Clearstream_Referencing", "Clearstream"), ("Euroclear_France_Platform_Referencing", "Euroclear France"),
    ("Fundsettle_Referencing", "FundSettle"), ("Iznes_Referencing", "Iznes"), ("Export_AllFunds", "Allfunds"),
]


def fmt_value(kind: str, v: Any) -> Any:
    v = _clean(v)
    if v is None or v == "":
        return None
    if kind == "bool":
        return L.to_bool(v)
    if kind in ("pct", "pct_int", "num", "money", "int", "stars"):
        try:
            return float(v)
        except (TypeError, ValueError):
            return v
    return v


def render_sections(row: dict, sections) -> list[dict]:
    out = []
    for key, title, fields in sections:
        items = []
        for col, label, kind in fields:
            val = fmt_value(kind, row.get(col))
            if val is None:
                continue
            items.append({"label": label, "value": val, "kind": kind})
        if items:
            out.append({"key": key, "title": title, "items": items})
    return out


def render_list(row: dict, fields) -> list[dict]:
    return [{"label": lab, "value": fmt_value(kind, row.get(col)), "kind": kind}
            for col, lab, kind in fields if fmt_value(kind, row.get(col)) is not None]


def render_flags(row: dict, pairs) -> list[dict]:
    return [{"label": lab, "value": L.to_bool(row.get(col))} for col, lab in pairs]
