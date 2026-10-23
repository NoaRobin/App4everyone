# Règles métier

Toutes ces règles sont dans `backend/rco/domain/` et couvertes par des tests (`backend/tests/`). Principe commun :
**aucune valeur n'est inventée** ; une donnée absente reste absente et le calcul qui en dépend vaut `null`.

## Rattachement JUMP ↔ Product Info (`ids.py`, `linking.py`)

### Normalisation des identifiants (`ids.py`)

Avant toute comparaison, chaque identifiant est ramené à une forme canonique : casse, accolades, guillemets, espaces
de début et de fin, espaces insécables ou invisibles, tirets typographiques, identifiants numériques lus en nombre
(`12345.0`, `1.2345E4`) ou en texte avec zéros de tête, chaînes vides ou `NULL`.

### Part JUMP → part du référentiel (`PI_OUT_Share`)

1. `ID_PI_PART` = `pi_shareid`. À défaut, la même valeur dans une autre clé technique de la part (`Id`,
   `Share_ID_Global`), si elle désigne une seule part et ne se confond avec aucun `pi_shareid`.
2. Pour les parts restantes : `CODE_ISIN_PART` = `ISIN_Code`, seulement si l'ISIN désigne une seule part active du
   référentiel, une seule part JUMP encore à rattacher, et une part que l'identifiant n'a pas déjà prise.

### Part JUMP → fonds (`pi_out_product_active`)

1. `ProductID` de la part rattachée (fonds actif). Si l'ISIN est porté par plusieurs parts actives toutes du même
   fonds, ce fonds est retenu même si la part exacte ne l'est pas.
2. `ID_PI_FONDS` de JUMP (encours, puis inventaires du même fonds JUMP s'ils désignent un seul fonds) ; clés
   alternatives (`Id`, `Product_Global_ID`) ; puis `CODE_AIM_FONDS` des inventaires = `AIM_Portfolio_Code`, s'il est
   unique ; code portefeuille (`Fund_Administrator_Portfolio_Code`, `AIM_Portfolio_Code`) s'il est unique.
3. Propagation : le fonds unique auquel sont rattachées les autres parts du même fonds JUMP.

**Jamais de rapprochement sur le nom.** Ce qui ne peut pas être démontré reste un fonds « JUMP seul » (`J:…`).
Deux fonds de même nom restent deux lignes, signalées par `find_duplicate_funds()`.

Le diagnostic (`link_report`, route `/api/diagnostics/links`) compte les parts et fonds par règle, les non rattachés,
les ISIN ambigus et la couverture du référentiel. `APP_LINK_WATCH` désigne des fonds suivis en détail.

## Encours (`model.py`)

- L'encours d'un fonds est la **somme de ses parts** (`ACTIF_NET_PART_EURO`). `ACTIF_NET_TOTAL_EURO`, répété sur
  chaque part, ne sert qu'au contrôle de cohérence ; il n'est jamais additionné.
- Encours « à date » : dernière VL connue à cette date, tant qu'elle a moins de `APP_STALE_DAYS` jours (12 par défaut).

## Collecte nette estimée (`model.py` → `flow_matrix`, `ost_factor`)

JUMP ne transporte pas les souscriptions et rachats ; la collecte est **estimée** à partir du nombre de parts :

```
flux_t = (parts_t − parts_{t−1} × k_t) × VL_EUR_t        VL_EUR_t = actif net EUR / parts
```

`k_t` est le facteur d'opération sur titres. JUMP fournit `COEFFICIENT_OST` sous des conventions variables ; seule la
continuité de la VL tranche : parmi `{c, 1/c, 1}`, celui qui rend la VL continue. Une division non déclarée (VL et
nombre de parts qui sautent en sens inverse d'un facteur ≥ 1,6) est détectée.

Règles de robustesse (chacune corrigeait une collecte de signe faux sur données réelles) :

- un trou de VL n'est jamais un rachat ; seule la disparition définitive d'une part solde son encours ;
- nombre de parts nul avec un actif net positif : saisie erronée, ignorée ;
- lancement (première VL bien après le début de l'historique) : souscription initiale = encours.

Variation d'encours entre deux dates (`analytics.variation`) :

```
ΔEncours = collecte nette estimée + effet marché       effet marché = ΔEncours − collecte
```

`APP_FLOWS_DISABLED` (expression régulière) neutralise la collecte de certaines parts : leur variation d'encours
n'est alors pas attribuée à la collecte.

## Performances et risques (`analytics.py`)

- **Indice de performance** (`adjusted_index`), base 100, dividendes réinvestis et OST corrigées :
  `r_t = (VL_t + dividende_t) × coefficient_OST_t / VL_{t−1} − 1`. Un rendement non fini ou ≤ −100 % interrompt
  l'indice : les mesures qui en dépendent valent `null`, rien n'est écrêté.
- **Périodes** : `1M`, `3M`, `6M`, `YTD`, `1A`, `3A`, `5A`. Une période qui commence avant le premier point de la part
  vaut `null`. Les valeurs à 3 et 5 ans sont fournies **annualisées** ; l'interface calcule la version cumulée
  (`(1 + r)^n − 1`).
- **Part principale d'un fonds** (`main_part`) : la part marquée `Main_Share` avec un encours, sinon la plus grosse
  part en encours, sinon la plus récente.
- **Risques** (`risk_stats`), sur un an glissant : volatilité, perte maximale, tracking error, volatilité de
  l'indicateur. Si l'indice est interrompu dans la fenêtre, les mesures valent `null`.

## Revenus estimés (`revenue.py`)

```
revenu annuel estimé d'une part = encours EUR × taux de frais de gestion de la part
```

Taux retenu, dans cet ordre (premier renseigné et positif) :

1. frais de gestion financière réels de la part (`Actual_Financial_Management_Fees`) ;
2. frais maximum de la part (`Max_Financial_Management_Fees`) ;
3. frais de gestion réels du fonds (`Actual_Management_Fees_PerCent`) ;
4. frais maximum du fonds (`Max_management_fee_PerCent`).

Les taux sont lus en pourcentage ; une colonne entièrement en fraction (0,015) est détectée et convertie. Un taux
au-delà de 10 % est jugé aberrant et écarté. Une part sans taux n'est pas valorisée : son encours est compté à part
(« encours sans taux »). Estimation brute, avant rétrocessions, commissions de surperformance et frais
administratifs ; une estimation nette des rétrocessions standard est donnée quand ce taux est renseigné.

## Familles de gestion (`labels.py`)

Quatre familles, attribuées par mots-clés (sans accents, minuscules) appliqués aux champs du référentiel dans cet
ordre : `Management_Expertise_Level_1`, `Management_Expertise_Level_2`, `Management_Expertise_Path`, `Fund_Range`,
`Asset_Class`, `Product_Name`. Pour chaque champ, les familles sont testées dans cet ordre :

| Clé | Famille | Mots-clés (extrait) |
|---|---|---|
| `ao` | Architecture ouverte | architecture ouverte, multigestion, fonds de fonds, sélection |
| `fi` | Fixed Income | fixed income, taux, obligat, crédit, monétaire, trésorerie, convertible, échéance, haut rendement |
| `ae` | Actions européennes | actions européennes, actions europe, actions france, europe, euro |
| `aid` | Actions internationales et gestion diversifiée | international, diversifié, allocation, patrimoine, monde, émergent, thématique, actions |
| `nc` | Non classé | aucun mot-clé trouvé |

Le premier champ renseigné qui contient un mot-clé décide.

## Fonds Rothschild Martin Maurel (`labels.rmm_funds`, `config.py`)

Aucune colonne dédiée dans le référentiel : un fonds est « RMM » si l'une des colonnes `Sponsoring_Entity`,
`Investment_Manager`, `Owning_Business_Unit`, `Owning_Team`, `Fund_Range`, `Umbrella_Name`, `Product_Name` contient
le motif `\bRMM\b|martin\s*maurel` (réglables : `APP_RMM_COLUMNS`, `APP_RMM_PATTERN`). L'interrupteur de la rubrique
Distribution (`?rmm=exclure`) retire ces fonds.

## Passif (`passif.py`)

### Règles de confidentialité des vues agrégées

- Tout est agrégé côté source (`GROUP BY`) : aucune ligne de compte, de client ou d'opération ne quitte Fabric.
  Les colonnes de noms (client, compte, commercial, commentaire) ne sont pas lues, seulement comptées (taux de
  remplissage).
- Un groupe de moins de **5** positions, opérations ou comptes n'est jamais montré ; il reste compté dans les totaux.
- Aucun montant absolu : l'encours est exprimé en part du total, les transactions en part du volume ; les effectifs en
  tranches (« 5 à 19 », « 20 à 99 »…).
- Souscriptions et rachats sont montrés côte à côte, jamais soustraits.

### Exception : les vues nominatives

Porteurs d'un fonds, fonds d'un client, carnet « qui est investi dans quoi », positions d'un fonds ligne à ligne,
territoires de ventes et canal RMM de la démonstration. Ces vues sont :

- calculées à la demande dans la source, par requêtes paramétrées ;
- jamais mises en cache ni journalisées ;
- jamais reconstruites à partir de parts en pourcentage.

### Lecture des tables

- Statuts de transaction retenus : `Valorisé`, `Clôturé / après cut-off` (`APP_PASSIF_STATUTS_AUTORISES`).
- Segments de clientèle (`segment_of`), dérivés de la classification du compte : inactifs, omnibus et plateformes
  (y compris « passage global »), OPC et fonds, banque privée et institutionnels, clients directs actifs, autres.
- Doublons de transaction : les lignes identiques sur la référence, le compte, l'ISIN, le sens, le statut, la date de
  centralisation et le montant (référence non nulle) ne sont comptées qu'une fois.

## Pages de démonstration (`demo.py`)

| Page | Périmètre |
|---|---|
| Gestion par gérant (Valor) | Fonds dont le gérant principal (`Portfolio_Manager`) correspond au nom configuré |
| Gestion par famille (Fixed Income) | Tous les fonds de la famille `fi`, plus les fonds d'une autre famille dont la classe d'actifs Product Info relève de `fi` (signalés `via_asset_class`) |
| Ventes, par territoire | Porteurs dont le pays du compte est dans la liste de pays du territoire, tous canaux confondus |
| Banque privée | Comptes dont la classification commence par RMM (`RMM/OPC`, `RMM/Banque Privée`, `RMM/Institutionnel`…) ou tenus par RMM sans autre classification. Les classifications qui ne font que mentionner RMM (`EOC/…`, `TA/…`, « hors RMM ») sont exclues. Revenus = encours × taux de la part détenue |

Recherche d'un gérant (`resolve`) : tolérance aux accents, à la casse et à une lettre d'écart (similarité ≥ 0,78 et
clé phonétique) ; homonymes et variantes proches renvoyés pour validation ; aucune correspondance inventée.

Configuration : `APP_DEMO_GERANTS`, `APP_DEMO_COMMERCIAUX` (`Thème:Nom:FR,MC;…`), `APP_DEMO_BANQUE_PRIVEE`.
