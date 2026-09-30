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

Prérequis : Python 3.11+, Node 20+ ; pour Fabric, le pilote *ODBC Driver 18 for SQL Server*.

```bash
# 1. Back-end
cd backend
python -m pip install -r requirements-dev.txt

# 2. Front-end (compilé une fois, servi par le back-end)
cd ../frontend
npm install
npm run build

# 3. Lancer
cd ../backend
python -m uvicorn rco.api:app --host 127.0.0.1 --port 8000
# → http://127.0.0.1:8000
```

Développement du front avec rechargement à chaud : `npm run dev` dans `frontend/` (http://localhost:5173, l'API est relayée vers le port 8000).

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

Toutes les couleurs sont des jetons CSS dans `frontend/src/styles/tokens.css` (papier, encre, or, nuit, et les quatre
couleurs de famille, validées pour le contraste et le daltonisme). La ville et le clavier lisent ces mêmes jetons :
appliquer la charte officielle revient à modifier ce seul fichier.

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
