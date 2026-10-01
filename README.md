# Rothschild & Co — Fonds & encours

Application de référence sur les fonds et les encours de Rothschild & Co Asset Management, construite uniquement sur les
données du Lakehouse Fabric `LKH_RFPTeam_Bronze` (SQL analytics endpoint) : **JUMP** (encours, VL, nombre de parts,
dividendes, indices, inventaires) croisé avec **Product Info** (référentiel fonds et parts, ESG/SFDR, pays d'enregistrement…).

> Par défaut l'application tourne sur des **données fictives** générées au schéma exact des tables (ISIN contenant « DEMO »,
> noms de fonds, gérants et émetteurs inventés). Un badge « Données fictives » l'indique en permanence.

## Ce que l'on y trouve

Le site a **deux espaces**, commutés par le sélecteur de l'en-tête :

- **Panorama** (`/`) — la maison en chiffres, racontée au défilement. Une ville 3D reste en fond (un immeuble par fonds,
  volume ∝ encours, quatre quartiers = quatre familles) et la caméra se déplace de chapitre en chapitre :
  la maison · quatre ans d'histoire (la ville grandit mois par mois au fil du défilement) · les quatre familles
  (vol vers chaque quartier) · d'où vient la croissance (encours de départ + collecte + effet marché = encours d'arrivée)
  · le monde (pays de commercialisation, tableau à palettes) · l'entrée vers l'espace métiers.
- **Espace métiers** (`/metiers` et toutes les rubriques ci-dessous) — pour aller chercher une information vite.

| Rubrique | Question à laquelle elle répond |
|---|---|
| **Accueil métiers** | Une grande barre de recherche, vos fiches épinglées et consultées récemment (mémorisées sur le poste, identifiants et libellés seulement), les questions de tous les jours, le répertoire de tous les fonds de A à Z, les contrôles à surveiller. |
| **Fonds** | Un clavier 3D et une barre de recherche : nom, ISIN, gérant, gamme, pays… tolérante aux accents et aux fautes. |
| **Fiche fonds** | Tout sur un fonds : encours et leur décomposition (collecte / marché), performance vs indice, parts, portefeuille, ESG, distribution, caractéristiques, contrôles. |
| **Encours** | Répartition par famille, gamme, classe d'actifs, expertise, gérant, SFDR, SRI, domicile, devise, type de part… Chaque ligne ouvre la liste des fonds. |
| **Sélection** | Toute combinaison de critères, avec agrégat en tête et détail en dessous, exportable. |
| **Portefeuilles** | Ce que nous détenons, et quels fonds détiennent une ligne donnée. |
| **Distribution** | Où nos fonds sont commercialisés : carte 3D (hauteur = fonds enregistrés, arcs depuis le pays de domiciliation), Sankey 3D famille → domiciliation → pays, frise de l'ouverture des pays année après année, carte en tuiles et classement, plateformes ; par pays, les fonds et parts autorisés. Un interrupteur retire les fonds **Rothschild Martin Maurel (RMM)** de toute la rubrique (chiffres, visuels, pays), et reste appliqué d'une page à l'autre (`?rmm=exclure`). |
| **Risques & contrôles** | SRI, volatilité, drawdown, tracking error, concentration ; contrôles automatiques de conformité et de qualité des données. |

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
Les journaux indiquent, par table, la durée et le nombre de lignes, jamais leur contenu. L'historique (4 ans par défaut,
`APP_HISTORY_YEARS`) est gardé en mémoire et jamais écrit sur disque.

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
| Encours à date | Dernière VL connue à la date d'arrêté, si elle date de moins de 12 jours (`APP_STALE_DAYS`) — gère les VL hebdomadaires. |
| Collecte nette estimée | Σ (parts_t − parts_t−1 × coefficient OST) × VL en euros ; lancement d'une part = souscription initiale, disparition = rachat. |
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
- `COEFFICIENT_OST` est lu comme le multiplicateur de parts à la date de l'opération (1 sinon) ; `DIVIDEND_AMOUNT` comme le
  dividende par part à la date de détachement, dans la devise de la VL.
- Les frais et pourcentages du référentiel sont supposés exprimés en points de pourcentage (1,35 = 1,35 %).
- Holdings : `ID_PI_FONDS` est supposé égal à `pi_productid` (secours par l'identifiant JUMP du fonds).
- Fonds **RMM** (Rothschild Martin Maurel) : le référentiel n'a pas de colonne dédiée. Un fonds est considéré comme RMM quand
  « RMM » (mot entier) ou « Martin Maurel » figure dans `Sponsoring_Entity`, `Investment_Manager`, `Owning_Business_Unit`,
  `Owning_Team`, `Fund_Range`, `Umbrella_Name` ou `Product_Name`. Réglable sans toucher au code :
  `APP_RMM_COLUMNS` (liste de colonnes séparées par des virgules) et `APP_RMM_PATTERN` (expression régulière).
- Sankey de la distribution : l'unité est l'**enregistrement actif** (une part autorisée dans un pays), additive d'une colonne
  à l'autre. Les encours, eux, ne se répartissent pas par pays dans les données : ils ne sont jamais ventilés ainsi.

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
| Ville 3D | Panorama | Le poids de chaque fonds et de chaque famille, et son évolution dans le temps |
| Équation de l'année | Panorama | Encours au 31/12 + collecte + effet marché = encours du jour, barres proportionnelles |
| Tableau à palettes | Panorama | Les pays de commercialisation, par nombre de parts enregistrées |
| Carte 3D | Distribution | Où nos fonds sont autorisés (relief = fonds ou parts enregistrés), depuis quel pays de domiciliation (arcs) |
| Sankey 3D | Distribution | Le parcours des autorisations : famille de gestion → domiciliation → pays, une famille par couloir de profondeur |
| Frise d'ouverture | Distribution | Depuis quand chaque pays est ouvert, et le rythme des enregistrements |
| Échelle du risque | Risques | Encours par SRI de 1 à 7 ; une marche filtre les fonds |
| Bande proportionnelle | Portefeuilles | De quoi sont faits nos portefeuilles (classes d'actifs, devises) |
| Pont des encours | Fiche fonds, fiche part, sélection | D'où vient la variation : encours de départ → collecte → marché → encours d'arrivée (axe tronqué signalé) |
| Mosaïque | Sélection, Encours, fiche fonds | Qui pèse (surface) et qui progresse (couleur) ; pour un portefeuille, ce qui a été renforcé, allégé ou acheté |
| Risque / rendement | Sélection, Risques | Performance et volatilité sur 1 an, taille = encours |
| Comparateur de parts | Fiche fonds | Quelle part proposer : filtres client / devise / revenus, frais les plus bas signalés |
| Année par année | Fiche fonds | Performances civiles du fonds et de son indice, écart en clair |

## Architecture

```
backend/rco/
  config.py            variables d'environnement
  data/  sql_guard.py  garde-fou lecture seule
         fabric.py     connexion mssql-python ou pyodbc (Entra ID interactif), lecture par lots (Arrow ou lignes)
         aum.py        lecture compacte des encours (faits + changements de libellés)
         mock.py       données fictives au schéma exact
         schema.json   noms et types des colonnes (aucune donnée)
  domain/ model.py     jointures, matrices d'encours à date, collecte
          analytics.py variations, performances, risques
          holdings.py  inventaires
          fields.py    vocabulaire métier (libellés de ~250 colonnes)
          labels.py    familles, pays, booléens
  service.py / api.py  réponses de l'API (FastAPI) et service du front
  bench.py             mesure du chargement (python run.py --bench)
frontend/src/
  three/  CityScene.ts, KeyboardScene.ts   scènes Three.js
  pages/  Panorama, Workspace, FundsSearch, Fund, Share, Encours, Selection, Holdings, Instrument, Distribution, Country, Risk
  lib/    search.ts (recherche tolérante), desk.ts (épingles, récents), format.ts (formats français), api.ts, context.tsx
```

Accessibilité : navigation clavier complète, lien d'évitement, focus visible, graphiques pilotables au clavier (flèches),
chiffres du panorama portés par le texte (la ville est décorative), répertoire des fonds en tableau dans l'espace métiers,
respect de `prefers-reduced-motion` (aucune animation ni mouvement de caméra au défilement : plans fixes, état final immédiat),
repli sans WebGL.
