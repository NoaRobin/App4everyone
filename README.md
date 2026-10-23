# Rothschild & Co — Fonds & encours

Application de référence sur les fonds et les encours de Rothschild & Co Asset Management, construite uniquement sur les
données du Lakehouse Fabric `LKH_RFPTeam_Bronze` (SQL analytics endpoint) : **JUMP** (encours, VL, nombre de parts,
dividendes, indices, inventaires) croisé avec **Product Info** (référentiel fonds et parts, ESG/SFDR, pays d'enregistrement…).

> Par défaut l'application tourne sur des **données fictives** générées au schéma exact des tables (ISIN contenant « DEMO »,
> noms de fonds, gérants et émetteurs inventés). Un badge « Données fictives » l'indique en permanence.

## Ce que l'on y trouve

Le site a **deux espaces**, commutés par le sélecteur de l'en-tête :

- **Accueil** (`/`) — **ce qui rapporte** : la cité des revenus. Une tour par fonds, de hauteur proportionnelle à ses revenus
  de gestion estimés (encours × frais), groupées en quatre quartiers de familles autour d'une place centrale, les fonds qui
  rapportent le plus au plus près du centre ; les six premiers sont étiquetés, le survol ouvre la fiche du fonds, la légende
  isole une famille, des boutons font tourner la vue (formes nettes, aucune particule ronde). Suivent le classement des fonds qui rapportent le plus,
  ce qui a fait bouger les revenus en un an (collecte ou marché), la répartition par famille, gamme et classe d'actifs, la
  trajectoire mois par mois, les encours, le tableau des départs (pays, drapeaux) et l'entrée vers l'espace métiers.
- **Espace métiers** (`/metiers` et toutes les rubriques ci-dessous) — pour aller chercher une information vite.

| Rubrique | Question à laquelle elle répond |
|---|---|
| **Accueil métiers** | Une grande barre de recherche, vos fiches épinglées et consultées récemment (mémorisées sur le poste, identifiants et libellés seulement), les questions de tous les jours, le répertoire de tous les fonds de A à Z, les contrôles à surveiller. |
| **Fonds** | Un clavier 3D et une barre de recherche (nom, ISIN, gérant, gamme, pays… tolérante aux accents et aux fautes), puis les **risques** de tous les fonds (SRI, volatilité, drawdown, tracking error, concentration, carte risque/rendement) et les **contrôles** (conformité, qualité des données, rattachement JUMP ↔ Product Info). |
| **Fiche fonds** | Tout sur un fonds : courbe 3D de ses encours (du jour à l'année, collecte de chaque période) et leur décomposition (collecte / marché), performance vs indice, parts, portefeuille, ESG, distribution, caractéristiques, contrôles. |
| **Encours** | En deux parties : **I. la ville des encours** (ville 3D, un immeuble par fonds, rejouable mois par mois, familles en surbrillance) ; **II. l'analyse** (la **courbe 3D des encours** — un point par jour, semaine, mois, trimestre ou année, fenêtre de 1 mois à tout l'historique, total ou empilé par famille, collecte nette estimée de chaque période en dessous, vue de face 2D, lecture au curseur ou au clavier, tableau des données —, l'équation de l'année, répartition par famille, gamme, classe d'actifs, expertise, gérant, SFDR, SRI, domicile, devise, type de part…). |
| **Sélection** | Toute combinaison de critères, avec agrégat en tête et détail en dessous, exportable. |
| **Portefeuilles** | Ce que nous détenons (anneaux par classe d'actifs et par devise, ruban et classement des premières positions, lignes les plus partagées), et quels fonds détiennent une ligne donnée. |
| **Distribution** | Où nos fonds sont commercialisés : le parcours d'une autorisation en Sankey 3D **clientèle → pays → famille de gestion**, les clients nommés (parts dédiées) d'abord, puis les pools de clientèle, un globe 3D interactif (rotation, survol, clic pour centrer un pays, filtre par clientèle, arcs depuis le pays de domiciliation), frise de l'ouverture des pays année après année, tableau des départs (drapeaux, palettes), teneurs de compte du passif, plateformes ; par pays, les fonds et parts autorisés. Un interrupteur retire les fonds **Rothschild Martin Maurel (RMM)** de toute la rubrique (chiffres, visuels, pays), et reste appliqué d'une page à l'autre (`?rmm=exclure`). |
| **Passif** | Qui détient nos fonds, lu comme un analyste : les milliers de positions regroupées en segments de clientèle (clients directs actifs, banque privée et institutionnels, OPC, omnibus et plateformes, inactifs), quatre teneurs et six pays (le reste regroupé), classes d'actifs et desks. Pour chacun : part de l'encours, part des entrées et des sorties de la période, lecture (« pèse plus dans les entrées / les sorties ») et activité relative (×2 = deux fois plus de mouvements que son poids). Tours 3D des teneurs empilées par segment, concentration, fidélité, fonds les plus détenus, rythme hebdomadaire des mouvements, lecture des tables sources. Uniquement des parts et des tranches, jamais un nom, un montant ni un flux net. **Clients et fonds** : pour un fonds, ses clients porteurs (part du fonds détenue, nombre de positions et de comptes, teneur, pays, segment) ; pour un client, les fonds qu'il détient. Vue nominative calculée à la demande dans Fabric (requêtes paramétrées), jamais conservée ni journalisée, en parts sans montant. |
| **Comparateur** | Jusqu'à six fonds sur une même base 100 en 3D (vue de face en 2D), tableau d'indicateurs (performances, volatilité, perte maximale, ratios, mois en hausse, encours, collecte, revenus, frais, SRI), podium 3D par indicateur et carte risque / rendement ; sélection dans l'adresse. |

La recherche universelle est accessible partout (`Ctrl K` / `⌘ K` ou `/`). Elle comprend les combinaisons
(« article 9 italie », « encours fixed income », « fonds de Claire Vasseur ») et répond directement : nombre de fonds et encours.
Elle comprend aussi les questions posées sur une fiche : « cut-off Europe Valeur » ouvre la fiche du fonds avec la recherche
« cut-off » déjà lancée (heure limite de chaque part).

## Démarrer

Prérequis : **Python 3.10 ou plus récent**, c'est tout. L'interface est livrée déjà compilée (`frontend/dist`) :
Node.js n'est nécessaire que pour modifier le front. Pour Fabric, il faut en plus le pilote *ODBC Driver 18 for SQL Server*.

### En une commande

| Système | Commande |
|---|---|
| Windows | double-cliquer sur `run.bat` |
| macOS / Linux | `./run.sh` |
| Partout | `python run.py` |

Le lanceur crée l'environnement Python hors du projet (`%LOCALAPPDATA%\RCoFonds` sous Windows, `~/.cache/rco-fonds` ailleurs ;
modifiable avec `RCO_VENV`), installe les dépendances (quelques minutes la première fois),
démarre le serveur et ouvre le navigateur. Les données fictives sont utilisées par défaut.

| Option | Effet |
|---|---|
| `--mock` | force les données fictives (même si `.env` indique Fabric) |
| `--fabric` | données du Lakehouse Fabric (installe `mssql-python` par pip seulement s'il manque, sans droits administrateur) |
| `--fabric-check` | teste la configuration Fabric et `SELECT 1`, vérifie tables et colonnes, sans charger les données |
| `--doctor` | diagnostic du poste : Python, accès aux paquets, proxy, Node.js, port |
| `--port 8080` | autre port (si le port demandé est pris, le suivant libre est choisi automatiquement) |
| `--test` | lance les tests |
| `--bench` | mesure le temps de chargement, de chaque vue et la mémoire (avec `--fabric` : sur les données réelles, sans les afficher) |
| `--scale 17` | données fictives démultipliées (≈ 75 millions de cellules) pour éprouver l'application |
| `--dev` / `--rebuild` | modifier le front (Node.js 20+ requis) |
| `--no-browser` | n'ouvre pas le navigateur |

### Ça ne démarre pas ?

Lancez d'abord `python run.py --doctor`, puis :

| Symptôme | Cause probable | Solution |
|---|---|---|
| `No module named 'pip._internal…'` | projet dans un dossier OneDrive/SharePoint ou au chemin trop long (limite Windows de 260 caractères) | déjà corrigé : l'environnement Python est créé dans `%LOCALAPPDATA%\RCoFonds`. Pour plus de fiabilité, copier le projet dans un chemin court et local (`C:\dev\App4everyone`) |
| « Échec : installation de requirements.txt » | proxy d'entreprise | `set HTTPS_PROXY=http://proxy:port` (Windows) ou `export HTTPS_PROXY=…`, puis relancer |
| « Python 3.10 ou plus récent est requis » | Python trop ancien | installer Python depuis python.org (cocher « Add to PATH ») |
| `python` introuvable sous Windows | Python absent du PATH | utiliser `run.bat` (il essaie `py` puis `python`) |
| « Mode Fabric : … ne sont pas définis » | `.env` configuré pour Fabric | `python run.py --mock` |
| Page « Not Found » | serveur lancé à la main sans l'interface | lancer via `run.py`, ou `git pull` pour récupérer `frontend/dist` |
| Page blanche dans le navigateur | ancien navigateur | Edge, Chrome ou Firefox récents (WebGL requis pour la ville 3D ; sans WebGL, le panorama reste lisible sans la ville) |

### Étape par étape (sans le lanceur)

```bash
cd backend
python -m pip install -r requirements.txt          # + requirements-fabric.txt pour Fabric
python -m uvicorn rco.api:app --host 127.0.0.1 --port 8000
# → http://127.0.0.1:8000  (l'interface compilée est servie depuis frontend/dist)
```

Développement du front : `cd frontend && npm install && npm run dev` (http://localhost:5173, API relayée vers le port 8000),
puis `npm run build` pour régénérer `frontend/dist`.

### Brancher le Lakehouse Fabric

1. Fichier `.env` à la racine (jamais commité) :
   ```
   APP_DATA_SOURCE=fabric
   FABRIC_SQL_SERVER=<adresse réelle>.datawarehouse.fabric.microsoft.com
   FABRIC_SQL_DATABASE=LKH_RFPTeam_Bronze
   ```
   Les valeurs d'exemple (`<…>`, `xxxx…`, « votre serveur »…) sont refusées au lancement.
2. Test de la connexion, sans charger les données : `python run.py --fabric-check`
   (configuration → connecteur → connexion et `SELECT 1` → présence des tables et colonnes en `SELECT TOP 0`, aucune ligne lue).
3. Lancement : `python run.py --fabric --port 8080 --no-browser`

Connecteur : **`mssql-python`**, le pilote Python officiel de Microsoft ; sous Windows il embarque tout le nécessaire,
**aucun pilote ODBC à installer** (ODBC Driver 18 n'est jamais vérifié). `FABRIC_CLIENT=pyodbc` reste possible si le pilote
ODBC 18 est installé. Authentification `ActiveDirectoryInteractive` : une fenêtre Microsoft Entra ID s'ouvre au premier
chargement. Une seule connexion et un seul chargement du modèle par processus. Délais réglables : `FABRIC_LOGIN_TIMEOUT`
(120 s, fenêtre Microsoft comprise) et `FABRIC_QUERY_TIMEOUT` (600 s par requête).

Environnement Python : `RCO_VENV` s'il pointe vers un Python valide, sinon `%USERPROFILE%\venv-rco` s'il existe, sinon un
environnement géré (`%LOCALAPPDATA%\RCoFonds`, ou `%USERPROFILE%\venv-rco` avec le Python du Microsoft Store, qui virtualise
`%LOCALAPPDATA%`). Un environnement valide n'est jamais recréé ; les dépendances ne sont installées que si elles manquent.

Suivi : `GET /api/health` (état du serveur et du modèle, ne déclenche rien), `GET /api/health/fabric` (`SELECT 1`).
Toutes les erreurs sont renvoyées en JSON `{error, message, hint}` : `fabric_config`, `fabric_driver`, `fabric_connection`,
`fabric_auth`, `fabric_timeout`, `fabric_query` (table ou colonne nommée), `model_loading` (503 pendant le chargement).
Les journaux indiquent, par table, la durée et le nombre de lignes, jamais leur contenu. L'historique (6 ans par défaut, pour les vues « 5 ans »,
`APP_HISTORY_YEARS`) est gardé en mémoire et jamais écrit sur disque.

### Rattachement JUMP ↔ Product Info

Les identifiants ne sont jamais comparés tels quels : casse, accolades, espaces (y compris insécables), identifiants
numériques lus en nombre (`12345.0`) ou en texte, valeurs vides (`""`, `NULL`, `N/A`) sont ramenés à une forme canonique
(`backend/rco/domain/ids.py`), et chaque identifiant JUMP est réécrit sous la forme exacte du référentiel.

1. Part : `ID_PI_PART` = `pi_shareid` ; à défaut `CODE_ISIN_PART` = `ISIN_Code`, **seulement si l'ISIN est unique** (une seule
   part du référentiel, une seule part JUMP à rattacher, part non déjà rattachée par son identifiant).
2. Fonds : `ProductID` de la part (fonds actif) ; à défaut `ID_PI_FONDS` de JUMP (encours, puis inventaires du même fonds
   JUMP) ; à défaut `ID_JUMP_FONDS` égal au code portefeuille du référentiel (`Fund_Administrator_Portfolio_Code`,
   `AIM_Portfolio_Code`), s'il est unique ; à défaut le fonds auquel sont rattachées les autres parts du **même fonds JUMP**.
   Les clés techniques alternatives (Id, Share_ID_Global, BOne_Share_ID, FIC_Code, Product_Global_ID) ne servent que si elles
   désignent un seul enregistrement et ne sont contredites par aucun autre identifiant (ISIN, ID_PI_FONDS). **Jamais de rapprochement sur le nom** : deux fonds de même nom
   restent deux lignes, signalées dans le contrôle « Fonds en double après consolidation ».

Compteurs (parts par pi_shareid / par ISIN / non rattachées ; fonds par ProductID / par ID_PI_FONDS / non rattachés ; ISIN
ambigus ; doublons restants ; **couverture du référentiel**) : rubrique Fonds → Contrôles, `GET /api/diagnostics/links`, et
`python run.py --fabric --bench`. La lecture tranche entre deux cas : si les fonds actifs du référentiel reçoivent leurs parts
JUMP, les fonds « JUMP seuls » restants sont des portefeuilles hors du référentiel des fonds ouverts (mandats, fonds dédiés,
fonds liquidés) ; sinon, les identifiants ne se rejoignent pas (formes, sondes et raisons techniques détaillées).

### Revenus de gestion estimés (Accueil, fiche fonds, comparateur)

Revenu annuel d'une part = encours en euros × taux de frais de gestion financière : `Actual_Financial_Management_Fees` de la
part, à défaut `Max_Financial_Management_Fees`, puis les frais réels ou maximum du fonds. Une part sans taux n'est pas
valorisée (sa part d'encours est signalée). Montants bruts, avant rétrocessions ; une estimation nette des rétrocessions
standard (`Standard_Trailer_Fees_Holdings`, en % des frais) est donnée lorsqu'elle est renseignée. Une colonne de taux
exprimée en fraction (0,015) est détectée et convertie. `GET /api/revenue`.

### Passif (tables `compte`, `position`, `transaction`)

Correspondance **exacte** des colonnes, sans devinette : si une table porte ses vrais noms (« Montant EUR »…), ils sont
utilisés ; si elle porte des noms génériques, la position fixe s'applique — Compte : `_c0` TeneurCompte, `_c1` Id Compte,
`_c3` Id CompteParent, `_c5` Id Client, `_c7` Classification, `_c8` Devise, `_c9` DateCreation, `_c10` DateDissolution ;
Position : `_c2` Teneur de compte, `_c3` Compte Centaure, `_c10` ISIN, `_c11` Classe d'Actif, `_c12` Desk, `_c13` Date,
`_c14` Quantite, `_c15` Cours, `_c16` Montant Devise, `_c17` Devise, `_c18` **Montant EUR**, `_c19` Dernier trade,
`_c20` Premier trade ; Transaction : `_c13` Date centralisation, `_c14` Date VL, `_c15` Date Valeur, `_c16` Sens, `_c17` Statut,
`_c21` Montant Devise, `_c22` **Montant EUR**, `_c25` Reference, `_c26` Date de création (schéma complet dans
`backend/rco/domain/passif.py`). `APP_PASSIF_MAP_*` peut ajuster une colonne (voir `.env.example`).

- **Valeurs manquantes** : NULL, vide, espaces, `nan`, `none`, `null`, `N/A` sont nuls ; jamais affichés (« Non renseigné »).
- **Dates** au format américain des exports (`9/30/2026 12:00:00 AM`), à défaut ISO ; l'heure est ignorée. La photo de
  l'encours est à la dernière date valide de Position ; la période des transactions couvre les 60 derniers jours ouvrés
  valides de Date centralisation. Sans date valide, la page affiche le format rejeté (forme `9/99/9999`, jamais la valeur).
- **Transactions** : pondération Montant EUR ; seuls les statuts autorisés sont retenus (`APP_PASSIF_STATUTS_AUTORISES`,
  par défaut « Valorisé » et « Clôturé / après cut-off ») ; une ligne n'est écartée comme doublon que si référence, compte,
  ISIN, sens, statut, date et montant sont identiques ; « après cut-off » n'est calculé que si le statut est renseigné.
- **Comptes** : dissous seulement si DateDissolution est une date valide ; « avec compte parent » = Id CompteParent non vide.
  L'enregistrement vide et une éventuelle ligne d'en-tête relue comme donnée sont écartés.
- **Rattachements** : Compte Centaure ↔ Compte.Id Compte, ISIN ↔ `PI_OUT_Share.ISIN_Code` (après normalisation) ; jamais
  par nom de fonds. Le passif (positions détenues par les comptes) n'est jamais mélangé aux inventaires des portefeuilles.

Tout est agrégé dans Fabric (`SELECT … GROUP BY`, garde-fou lecture seule) : aucune ligne de compte ni d'opération ne
quitte le Lakehouse, les colonnes de noms (client, compte, commercial, commentaire) ne sont jamais lues. Groupes de moins de 5
jamais montrés, effectifs en tranches, positions en part de l'encours, transactions en part du volume absolu (souscriptions et
rachats côte à côte, jamais soustraits). La section « Lecture des tables sources » donne la correspondance appliquée, le
type détecté, les valeurs nulles, les dates valides et invalides et les taux de rattachement ; `python run.py --fabric-check`
vérifie les 11 / 21 / 28 colonnes, la correspondance, la lecture des dates et les lignes exploitables. Agrégats recalculés
toutes les 6 heures (`APP_PASSIF_TTL_HOURS`), les tables étant mises à jour chaque jour. Sans Fabric : données synthétiques.
`GET /api/passif`, `GET /api/passif/fonds/{id}`, `GET /api/passif/fonds/{id}/porteurs`, `GET /api/passif/clients?q=`.

Courbe des encours : `GET /api/encours/series?freq=J|S|M|T|A&range=1M|3M|YTD|1A|3A|Tout[&fonds=ID|&famille=clé]`. Chaque point
est la dernière date disponible de sa période (semaine du lundi au dimanche) ; collecte d'une période = écart de collecte
cumulée avec le point précédent (même antérieur à la fenêtre), effet marché = Δencours − collecte ; pour la maison, les
familles se somment exactement au total.

### Volumétrie (des dizaines de millions de cellules)

L'application est éprouvée sur des données fictives démultipliées à l'échelle réelle : `python run.py --scale 17`
(≈ 75 millions de cellules lues, 765 fonds, 3 247 parts, 3 millions de lignes d'encours).

- **Lecture compacte de `JUMP_portfolio_aum`** (la table la plus lourde) : deux `SELECT` au lieu d'un. Les montants
  quotidiens (identifiant de part, dates et 8 colonnes numériques converties en `FLOAT` côté SQL), puis seulement les lignes
  où un libellé de part change (fonds, ISIN, nom, devise, indicateur), calculées par Fabric (`LAG`/`ROW_NUMBER`).
  Les libellés ne sont plus répétés sur chaque ligne quotidienne ; chaque ligne est ensuite reconstituée à l'identique. Si
  Fabric refusait cette requête, l'application relit les libellés ligne à ligne (plus lent, même résultat).
- **Lecture en colonnes** : avec `pyarrow` (installé automatiquement par pip s'il manque, sans droits administrateur ;
  facultatif), mssql-python transmet des colonnes Arrow : aucun objet Python par cellule. Sans `pyarrow`, lecture par lots de
  50 000 lignes convertis au fur et à mesure (jamais toute la table en objets `Decimal`).
- **Colonnes utiles seulement** : 18 colonnes d'encours lues sur 23, 17 d'inventaires sur 30.
- **Calculs vectorisés** (tris, dédoublonnage, matrices date × part, risques, compositions) et mémorisés par date :
  résultats identiques au chiffre près à la version précédente (vérifié route par route).
- **Vues préparées pendant le chargement** (liste des fonds, panorama, recherche, risques, contrôles…) : une fois le bandeau
  « Chargement » disparu, les pages répondent immédiatement. Le bandeau indique l'étape en cours et, avec Fabric, le nombre
  de lignes lues sur le total (`/api/health` : `model.step`, `model.progress`).
- **Interface** : recherche universelle 15 à 90 fois plus rapide sur 24 000 entrées (mêmes résultats), longues listes
  affichées par tranches (« Afficher 60 de plus », « Tout afficher »), ville 3D allégée (textures partagées, 4 fois moins
  d'appels de dessin, cadrage et brouillard adaptés au nombre de fonds).

Mesure sur votre poste : `python run.py --bench` (données fictives) ou `python run.py --fabric --bench` (données réelles) :
durées de lecture, de calcul et de chaque vue, et mémoire maximale ; aucune donnée affichée.

## Garanties

- **Lecture seule** : toute requête passe par `rco/data/sql_guard.py`, qui refuse tout ce qui n'est pas un `SELECT` unique
  (INSERT, UPDATE, DELETE, MERGE, DDL, EXEC, `SELECT … INTO`, requêtes multiples…). La connexion est ouverte en `readonly`
  et `ApplicationIntent=ReadOnly`. Colonnes explicites, filtres paramétrés.
- **Aucune donnée réelle** n'est affichée dans les journaux (seulement des volumétries) ni commitée : `.gitignore` exclut `.env`
  et tout export (`*.csv`, `*.xlsx`, `*.parquet`, `exports/`…). Les exports CSV proposés à l'écran sont générés dans le
  navigateur de l'utilisateur.
- **Tests** : `cd backend && python -m pytest` (agrégats d'encours, variations, collecte/effet marché, jointures, performances,
  garde-fou SQL, conformité du jeu fictif au schéma) et `cd frontend && npm test` (moteur de recherche, formats français).

## Règles de calcul

| Indicateur | Règle |
|---|---|
| Rattachement d'une part | `JUMP_portfolio_aum.ID_PI_PART = PI_OUT_Share.pi_shareid`, à défaut `CODE_ISIN_PART = ISIN_Code` (ISIN unique). Les parts non rattachées restent comptées et sont signalées dans *Contrôles*. |
| Rattachement au fonds | `PI_OUT_Share.ProductID = pi_out_product_active.pi_productid`, à défaut `JUMP.ID_PI_FONDS`. Un fonds JUMP absent du référentiel actif reste visible comme « hors référentiel ». |
| Encours d'un fonds | Somme de `ACTIF_NET_PART_EURO` de ses parts. `ACTIF_NET_TOTAL_EURO`, répété sur chaque part, n'est jamais additionné : il sert au contrôle de cohérence. |
| Encours à date | Dernière VL connue à la date d'arrêté, si elle date de moins de 12 jours (`APP_STALE_DAYS`), délai allongé à 3 × l'écart habituel entre deux VL (100 jours au plus) pour les VL hebdomadaires et mensuelles. |
| Collecte nette estimée | Σ (parts_t − parts_t−1 × k) × VL en euros, k = facteur d'opération sur titres retrouvé par continuité de la VL (coefficient vide, nul, cumulé ou inversé, division non déclarée). Lancement d'une part = souscription initiale ; seule la disparition définitive d'une part est un rachat (un trou de VL n'en est pas un) ; nombre de parts nul avec un actif net positif = valeur erronée, ignorée. |
| Effet marché | Variation d'encours − collecte nette estimée. |
| Performance | Indice base 100 : (VL + dividende) × coefficient OST / VL précédente ; part principale du fonds (`Main_Share`), sinon la plus grosse. 3 ans annualisé. |
| Risque réalisé | Volatilité et tracking error annualisées sur 1 an (fréquence quotidienne ou hebdomadaire détectée), perte maximale sur 1 an. |
| Montants d'inventaire en euros | `MONTANT_DEVISE_FONDS` × (actif net EUR / actif net devise fonds) à la date d'inventaire. |

### Données invalides (données réelles du Lakehouse)

- Les colonnes SQL `DECIMAL` arrivent en `decimal.Decimal` avec mssql-python : les colonnes financières de JUMP (encours,
  VL, parts, indices, inventaires) sont converties en `float64` à la lecture, et toute valeur isolée passe par
  `backend/rco/domain/numeric.py` (`safe_float`, `safe_divide`, `numeric_series`, `finite_or_none`, `fmt_meur`).
- Une valeur absente, non numérique ou infinie devient `null` (JSON), jamais zéro ni une valeur arbitraire. Un
  dénominateur nul rend le quotient indisponible (il n'est jamais remplacé par 1).
- Indice de performance : un rendement élémentaire non fini ou ≤ −100 % (VL nulle, incohérente) rend la chaîne non
  calculable à partir de ce point ; les performances, risques et années civiles qui en dépendent sont `null`, et la fiche
  l'indique. Les performances valides ne sont ni écrêtées ni modifiées.
- Indicateur de référence : un niveau nul ou négatif est écarté (performance de l'indice `null`), le fonds reste calculé.
- Inventaires : taux de change = actif net EUR / actif net en devise du fonds ; incalculable → montant en euros `null`
  (taux 1 seulement pour un fonds libellé en euros). Une somme dont toutes les valeurs sont indisponibles reste `null`.
- Les journaux comptent les valeurs écartées ; ils n'affichent jamais une valeur métier.

### Hypothèses à valider sur les données réelles

- Les quatre familles (*Actions internationales et gestion diversifiée*, *Actions européennes*, *Fixed Income*,
  *Architecture ouverte*) sont déduites de `Management_Expertise_Level_1` (puis niveau 2, gamme, classe d'actifs) par
  mots-clés : la table de correspondance est dans `backend/rco/domain/labels.py` et se règle en une ligne.
- `COEFFICIENT_OST` : pour la collecte, sa convention est déduite de la continuité de la VL ; `DIVIDEND_AMOUNT` est lu comme le
  dividende par part à la date de détachement, dans la devise de la VL.
- Les frais et pourcentages du référentiel sont supposés exprimés en points de pourcentage (1,35 = 1,35 %).
- Holdings : `ID_PI_FONDS` est supposé égal à `pi_productid` (secours par l'identifiant JUMP du fonds).
- Fonds **RMM** (Rothschild Martin Maurel) : le référentiel n'a pas de colonne dédiée. Un fonds est considéré comme RMM quand
  « RMM » (mot entier) ou « Martin Maurel » figure dans `Sponsoring_Entity`, `Investment_Manager`, `Owning_Business_Unit`,
  `Owning_Team`, `Fund_Range`, `Umbrella_Name` ou `Product_Name`. Réglable sans toucher au code :
  `APP_RMM_COLUMNS` (liste de colonnes séparées par des virgules) et `APP_RMM_PATTERN` (expression régulière).
- Sankey de la distribution : l'unité est l'**enregistrement actif** (une part autorisée dans un pays), additive d'une colonne
  à l'autre. Les encours, eux, ne se répartissent pas par pays dans les données : ils ne sont jamais ventilés ainsi.
  Seules les 12 plus grosses clientèles (encours des parts enregistrées) sont dessinées, par encours décroissant.
- **Collecte JUMP neutralisée** : pour des fonds ou parts dont la collecte JUMP est erronée (par défaut Mediobanca R-co Valor,
  environ 2,5 Md€ de collecte fausse), la collecte estimée est mise à zéro dans les calculs, sans rien effacer : encours et
  données sources inchangés. La fiche du fonds n'attribue alors la variation ni à la collecte ni à l'effet marché et affiche, à
  la place, les souscriptions et rachats lus dans le passif (table Transaction, fenêtre du passif). Règle réglable :
  `APP_FLOWS_DISABLED` (expression régulière, insensible à la casse et aux accents, appliquée aux noms de fonds, de parts et
  au client nommé ; vide = aucune neutralisation). Le contrôle « Collecte JUMP neutralisée » liste les fonds concernés.

### Ce que les données ne permettent pas (et que l'application n'invente pas)

- Collecte par client ou par distributeur : aucune donnée client — seule une collecte estimée par part est calculée.
- Mesures ESG chiffrées (empreinte carbone, scores) : les champs EET indiquent la *prise en compte*, pas la valeur.
- Répartition sectorielle ou géographique des portefeuilles : les inventaires ne portent ni secteur ni pays d'émetteur.
- VaR, stress tests, attribution de performance, classements concurrentiels (hors note Morningstar).

Fond de carte : Natural Earth (domaine public) via le paquet `world-atlas` (licence ISC), projeté avec `d3-geo`.
Palettes des graphiques d'analyse (catégorielle et rampe du SRI) vérifiées par script : luminance, chroma, séparation
pour les daltonismes et contraste sur le fond sombre.

## Fluidité

Les scènes 3D (ville, clavier, carte, Sankey) partagent un gouverneur de qualité (`frontend/src/three/quality.ts`) :
elles ne se dessinent que lorsqu'elles sont à l'écran, passent à 30 images/s au repos, et si le poste peine, la qualité
baisse d'elle-même d'un cran (résolution 1:1, puis sans halo lumineux, ombres ni reflets), sans que la lisibilité change.
Aucun flou d'arrière-plan n'est appliqué sur ce qui est collant ou en mouvement.

## Système de design

Établi avec le skill **UI/UX Pro Max** (Next Level Builder, licence MIT) et appliqué directement dans les styles
(`frontend/src/styles/tokens.css` et feuilles par page) : jetons d'espacement, de
mouvement et de calques, aucun texte sous 12 px, cibles tactiles de 44 px, bouton de pause des animations dans l'en-tête,
alternatives clavier et boutons à toute rotation 3D, identité des séries jamais portée par la seule couleur, liens profonds.
La palette et les polices proposées par le skill sont écartées au profit de la charte Rothschild & Co (aucun appel externe).
Recherche dans ses bases : `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<requête>" --domain ux`.

## Charte graphique

Interface sombre partout, sur la charte Rothschild & Co : Rothschild Blue `#1C355E` (fond et surfaces), blanc `#FFFFFF`,
noir `#000000`, or `#CC9F53` (accent), rouge `#8A1E41`, rose `#E8C9BA`, pierre `#D6D1CA` (textes secondaires).
Les quatre familles reprennent la charte, éclaircie pour rester lisible sur fond sombre : bleu `#6189D6`
(Actions internationales et gestion diversifiée), rouge `#C2476F` (Actions européennes), or `#CC9F53` (Fixed Income),
rose `#E8C9BA` (Architecture ouverte). Les variations utilisent une échelle divergente rouge ↔ pierre ↔ bleu ;
les hausses et baisses portent toujours un signe et une flèche. Tout est dans `frontend/src/styles/tokens.css`.

## Représentations

| Vue | Où | Ce qu'elle rend évident |
|---|---|---|
| Ville 3D | Encours | Le poids de chaque fonds et de chaque famille, et son évolution dans le temps |
| Courbe 3D des encours | Encours, fiche fonds | L'encours période par période (jour → année) et, dessous, la collecte nette estimée de chaque période ; chaque point est la dernière valeur de sa période, jamais une moyenne ; vue de face = graphique 2D |
| Équation de l'année | Encours | Encours au 31/12 + collecte + effet marché = encours du jour, barres proportionnelles |
| Cité des revenus 3D | Accueil | Ce que chaque fonds rapporte (hauteur), son encours (emprise), sa famille (quartier) |
| Tableau des départs | Accueil, Distribution | Les pays de commercialisation, avec drapeaux, par nombre de parts enregistrées |
| Globe 3D | Distribution | Où nos parts sont autorisées (colonnes de lumière = fonds ou parts enregistrés), filtrable par clientèle, arcs depuis le pays de domiciliation |
| Sankey 3D | Distribution | Le parcours des autorisations : clientèle → pays → famille de gestion, une famille par couloir de profondeur |
| Frise d'ouverture | Distribution | Depuis quand chaque pays est ouvert, et le rythme des enregistrements |
| Échelle du risque | Risques | Encours par SRI de 1 à 7 ; une marche filtre les fonds |
| Bande proportionnelle | Portefeuilles | De quoi sont faits nos portefeuilles (classes d'actifs, devises) |
| Pont des encours | Fiche fonds, fiche part, sélection | D'où vient la variation : encours de départ → collecte → marché → encours d'arrivée (axe tronqué signalé) |
| Ruban et classement | Sélection, Encours, Portefeuilles, fiche fonds | Qui pèse (ruban 100 % et barres classées, valeurs lues directement) et, pour un portefeuille, ce qui a été renforcé, allégé ou acheté |
| Courbes base 100 en 3D, podium | Comparateur | Les trajectoires et les indicateurs de plusieurs fonds, côte à côte |
| Carte du modèle, matrice 3D | Passif | La chaîne clients → comptes → positions / transactions ; desk × classe d'actifs |
| Risque / rendement | Sélection, Risques | Performance et volatilité sur 1 an, taille = encours |
| Comparateur de parts | Fiche fonds | Quelle part proposer : filtres client / devise / revenus, frais les plus bas signalés |
| Année par année | Fiche fonds | Performances civiles du fonds et de son indice, écart en clair |

## Architecture

Documentation détaillée du code : [`docs/`](docs/README.md) (architecture, back end, API, règles métier, front end,
sécurité, exploitation).

```
backend/rco/
  config.py            variables d'environnement
  data/  sql_guard.py  garde-fou lecture seule
         fabric.py     connexion mssql-python ou pyodbc (Entra ID interactif), lecture par lots (Arrow ou lignes)
         aum.py        lecture compacte des encours (faits + changements de libellés)
         mock.py       données fictives au schéma exact
         passif_mock.py passif synthétique (comptes, positions, transactions au schéma _c0…_cN)
         schema.json   noms et types des colonnes (aucune donnée)
  domain/ model.py     matrices d'encours à date, collecte
          linking.py   rattachement JUMP ↔ Product Info et son diagnostic
          revenue.py   revenus de gestion estimés
          passif.py    passif : reconnaissance des colonnes, agrégats anonymes (seuil 5, tranches)
          analytics.py variations, performances, risques
          holdings.py  inventaires
          fields.py    vocabulaire métier (libellés de ~250 colonnes)
          labels.py    familles, pays, booléens
  service.py / api.py  réponses de l'API (FastAPI) et service du front
  bench.py             mesure du chargement (python run.py --bench)
frontend/src/
  three/  CityScene, KeyboardScene, SankeyScene, GlobeScene, RevenueScene, PassifScene, CompareScene, ComparePodium
  pages/  Home, Workspace, FundsSearch (+ risques et contrôles), Fund, Share, Encours, Selection, Holdings, Instrument, Distribution, Country, Passif, Compare
  lib/    search.ts (recherche tolérante), desk.ts (épingles, récents), format.ts (formats français), api.ts, context.tsx
```

Accessibilité : navigation clavier complète, lien d'évitement, focus visible, graphiques pilotables au clavier (flèches),
chiffres du panorama portés par le texte (la ville est décorative), répertoire des fonds en tableau dans l'espace métiers,
respect de `prefers-reduced-motion` (aucune animation ni mouvement de caméra au défilement : plans fixes, état final immédiat),
repli sans WebGL.



CONTEXTE

Les fichiers fournis décrivent un modèle de données de distribution de fonds. Toutes les données transmises sont agrégées ou structurelles. Aucune donnée client, aucun compte réel, aucun collaborateur nominatif et aucun montant absolu ne doivent être reconstitués.

SOURCES ORIGINALES

compte Référentiel des comptes. Une ligne originale représente un compte. Le fichier original contient 11 colonnes.
Colonnes originales : _c0 = TeneurCompte _c1 = IdCompte _c2 = NomCompte _c3 = IdCompteParent _c4 = NomCompteParent _c5 = IdClient _c6 = NomClient _c7 = Classification _c8 = Devise _c9 = DateCreation _c10 = DateDissolution

Les identifiants et libellés réels ne sont pas fournis. L’application doit utiliser des données synthétiques si une démonstration de comptes individuels est nécessaire.

position Photographie des encours à une date donnée. Une ligne originale représente une position détenue sur un fonds depuis un compte.
Dimensions utilisées dans l’export anonymisé :

classe_actif
desk
devise
tranche_nombre_positions
part_encours_pct
part_encours_pct représente la contribution relative au total des encours. Il ne s’agit pas d’un montant en euros. Les groupes comptant moins de cinq positions sont exclus.

transaction Historique des mouvements de souscription, de rachat et de transfert. Une ligne originale représente une transaction.
Dimensions utilisées dans l’export anonymisé :

date_centralisation
classe_actif
desk
sens
statut
devise
tranche_nombre_operations
part_volume_journalier_pct
part_volume_journalier_pct représente la contribution du groupe au volume absolu total de la journée. Il ne s’agit pas d’un montant en euros. Les groupes comptant moins de cinq opérations sont exclus.

RELATIONS LOGIQUES ORIGINALES

Dans le modèle source :

un client peut être associé à plusieurs comptes ;
un compte peut être rattaché à un compte parent ;
un compte peut porter plusieurs positions ;
un compte peut être associé à plusieurs transactions ;
les positions représentent un stock à une date donnée ;
les transactions représentent des flux sur une période.
Les clés de jointure réelles ne sont volontairement pas fournies. L’application de démonstration ne doit pas tenter de joindre les exports agrégés ligne par ligne.

RÈGLES D’UTILISATION

Ne pas inventer ou tenter de reconstituer des clients réels.
Ne pas reconstituer de montants absolus à partir des pourcentages.
Ne pas traiter les tranches comme des nombres exacts.
Ne pas présenter les pourcentages de transaction comme des flux nets.
Utiliser des données synthétiques pour les vues détaillées.
Utiliser les CSV fournis uniquement pour comprendre les dimensions, les filtres, les répartitions et le fonctionnement métier.
Aucun appel à une API ou à un service externe.
L’application doit fonctionner localement.
