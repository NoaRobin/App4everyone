# Rothschild & Co — Fonds & encours

Application de référence sur les fonds et les encours de Rothschild & Co Asset Management, construite uniquement sur les
données du Lakehouse Fabric `LKH_RFPTeam_Bronze` (SQL analytics endpoint) : **JUMP** (encours, VL, nombre de parts,
dividendes, indices, inventaires) croisé avec **Product Info** (référentiel fonds et parts, ESG/SFDR, pays d'enregistrement…).

> Par défaut l'application tourne sur des **données fictives** générées au schéma exact des tables (ISIN contenant « DEMO »,
> noms de fonds, gérants et émetteurs inventés). Un badge « Données fictives » l'indique en permanence.

## Ce que l'on y trouve

| Rubrique | Question à laquelle elle répond |
|---|---|
| **Accueil — la ville** | Combien gérons-nous, qu'est-ce qui a bougé ? Une ville 3D : un immeuble par fonds, volume ∝ encours, quatre quartiers = quatre familles de gestion. Machine à remonter le temps sur tout l'historique. |
| **Fonds** | Un clavier 3D et une barre de recherche : nom, ISIN, gérant, gamme, pays… tolérante aux accents et aux fautes. |
| **Fiche fonds** | Tout sur un fonds : encours et leur décomposition (collecte / marché), performance vs indice, parts, portefeuille, ESG, distribution, caractéristiques, contrôles. |
| **Encours** | Répartition par famille, gamme, classe d'actifs, expertise, gérant, SFDR, SRI, domicile, devise, type de part… Chaque ligne ouvre la liste des fonds. |
| **Sélection** | Toute combinaison de critères, avec agrégat en tête et détail en dessous, exportable. |
| **Portefeuilles** | Ce que nous détenons, et quels fonds détiennent une ligne donnée. |
| **Distribution** | Pays d'enregistrement et plateformes ; par pays, les fonds et parts autorisés. |
| **Risques & contrôles** | SRI, volatilité, drawdown, tracking error, concentration ; contrôles automatiques de conformité et de qualité des données. |

La recherche universelle est accessible partout (`Ctrl K` / `⌘ K` ou `/`). Elle comprend les combinaisons
(« article 9 italie », « encours fixed income », « fonds de Claire Vasseur ») et répond directement : nombre de fonds et encours.

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
| `--fabric` | données du Lakehouse Fabric (installe alors pyodbc) |
| `--doctor` | diagnostic du poste : Python, accès aux paquets, proxy, Node.js, port |
| `--port 8080` | autre port (si le port demandé est pris, le suivant libre est choisi automatiquement) |
| `--test` | lance les tests |
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
| Page blanche dans le navigateur | ancien navigateur | Edge, Chrome ou Firefox récents (WebGL requis pour la ville ; sinon vue liste) |

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

Copier `.env.example` en `.env` (jamais commité) ou définir les variables d'environnement :

```
APP_DATA_SOURCE=fabric
FABRIC_SQL_SERVER=<serveur du SQL analytics endpoint>
FABRIC_SQL_DATABASE=<base>
```

La connexion utilise `pyodbc` avec `Authentication=ActiveDirectoryInteractive` : une fenêtre Microsoft Entra ID s'ouvre au
premier chargement. Aucun secret n'est stocké. L'application charge l'historique au démarrage (4 ans par défaut,
`APP_HISTORY_YEARS`), le garde en mémoire et ne l'écrit jamais sur disque.

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

### Hypothèses à valider sur les données réelles

- Les quatre familles (*Actions internationales et gestion diversifiée*, *Actions européennes*, *Fixed Income*,
  *Architecture ouverte*) sont déduites de `Management_Expertise_Level_1` (puis niveau 2, gamme, classe d'actifs) par
  mots-clés : la table de correspondance est dans `backend/rco/domain/labels.py` et se règle en une ligne.
- `COEFFICIENT_OST` est lu comme le multiplicateur de parts à la date de l'opération (1 sinon) ; `DIVIDEND_AMOUNT` comme le
  dividende par part à la date de détachement, dans la devise de la VL.
- Les frais et pourcentages du référentiel sont supposés exprimés en points de pourcentage (1,35 = 1,35 %).
- Holdings : `ID_PI_FONDS` est supposé égal à `pi_productid` (secours par l'identifiant JUMP du fonds).

### Ce que les données ne permettent pas (et que l'application n'invente pas)

- Collecte par client ou par distributeur : aucune donnée client — seule une collecte estimée par part est calculée.
- Mesures ESG chiffrées (empreinte carbone, scores) : les champs EET indiquent la *prise en compte*, pas la valeur.
- Répartition sectorielle ou géographique des portefeuilles : les inventaires ne portent ni secteur ni pays d'émetteur.
- VaR, stress tests, attribution de performance, classements concurrentiels (hors note Morningstar).

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
| Ville 3D | Accueil | Le poids de chaque fonds et de chaque famille, et son évolution dans le temps |
| Pont des encours | Accueil, fiche fonds, fiche part, sélection | D'où vient la variation : encours de départ → collecte → marché → encours d'arrivée (axe tronqué signalé) |
| Mosaïque | Sélection, Encours, fiche fonds | Qui pèse (surface) et qui progresse (couleur) ; pour un portefeuille, ce qui a été renforcé, allégé ou acheté |
| Risque / rendement | Sélection, Risques | Performance et volatilité sur 1 an, taille = encours |
| Comparateur de parts | Fiche fonds | Quelle part proposer : filtres client / devise / revenus, frais les plus bas signalés |
| Année par année | Fiche fonds | Performances civiles du fonds et de son indice, écart en clair |

## Architecture

```
backend/rco/
  config.py            variables d'environnement
  data/  sql_guard.py  garde-fou lecture seule
         fabric.py     connexion pyodbc (Entra ID interactif)
         mock.py       données fictives au schéma exact
         schema.json   noms et types des colonnes (aucune donnée)
  domain/ model.py     jointures, matrices d'encours à date, collecte
          analytics.py variations, performances, risques
          holdings.py  inventaires
          fields.py    vocabulaire métier (libellés de ~250 colonnes)
          labels.py    familles, pays, booléens
  service.py / api.py  réponses de l'API (FastAPI) et service du front
frontend/src/
  three/  CityScene.ts, KeyboardScene.ts   scènes Three.js
  pages/  Home, FundsSearch, Fund, Share, Encours, Selection, Holdings, Instrument, Distribution, Country, Risk
  lib/    search.ts (recherche tolérante), format.ts (formats français), api.ts, context.tsx
```

Accessibilité : navigation clavier complète, lien d'évitement, focus visible, graphiques pilotables au clavier (flèches),
alternative en liste de la ville 3D, respect de `prefers-reduced-motion` (aucune animation, état final immédiat),
repli sans WebGL.
