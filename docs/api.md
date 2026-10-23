# API HTTP (`backend/rco/api.py`)

40 routes, toutes en `GET` : l'application n'a aucune route d'écriture. Les réponses sont en JSON, compressées
(gzip) au-delà de 1 Ko. Les NaN et infinis sont renvoyés en `null`.

Paramètre commun : `date` (`AAAA-MM-JJ`, facultatif) = date d'arrêté ; par défaut la dernière date disponible.

Pendant le chargement du modèle, les routes de données répondent `503` `{error: "model_loading"}` avec `Retry-After`.

## Supervision

| Route | Paramètres | Réponse |
|---|---|---|
| `/api/health` | — | État du serveur et du modèle (`idle`, `loading`, `ready`, `error`) ; ne déclenche jamais de chargement |
| `/api/health/fabric` | — | `SELECT 1` sur Fabric et latence, sans charger le modèle |
| `/api/meta` | — | Première et dernière date, données fictives ou non, date de rafraîchissement du Lakehouse, dernière mise à jour JUMP, familles |
| `/api/diagnostics/links` | — | Compteurs de rattachement JUMP ↔ Product Info, ISIN ambigus, doublons |

## Synthèse

| Route | Paramètres | Réponse |
|---|---|---|
| `/api/overview` | `date` | Chiffres clés de la maison : encours, variations, collecte, répartitions |
| `/api/revenue` | `date` | Revenus estimés : total, par fonds, famille, gamme, classe d'actifs ; couverture des taux |
| `/api/city` | `date` | Données de la ville 3D (un bâtiment par fonds) |
| `/api/cite/collecte` | `date` | Collecte nette estimée par fonds sur 1 mois, YTD, 1, 3 et 5 ans (Rothschild & Co City) |
| `/api/search-index` | `date` | Index de la recherche universelle (fonds, parts, gérants, pays, instruments) |

## Fonds et parts

| Route | Paramètres | Réponse |
|---|---|---|
| `/api/funds` | `date` + filtres en paramètres d'URL | Liste des fonds avec encours, variations, performances |
| `/api/funds/{fid}` | `date` | Fiche fonds complète : encours, performances, parts, portefeuille, ESG, distribution, contrôles |
| `/api/shares/{sid}` | `date` | Fiche part |
| `/api/fonds/{fid}/repartition` | `date` | Où est détenu le fonds au passif : pays, segment, teneur, part, devise |
| `/api/fonds/{fid}/positions` | `axe`, `cle`, `n` (25) | Positions du fonds au passif, ligne à ligne (**vue nominative**) |
| `/api/compare` | `ids` (liste), `period` (`3A`), `date` | Comparaison de fonds : séries base 100, indicateurs |
| `/api/breakdown/{dim}` | `date` | Encours réparti par dimension (famille, gamme, classe d'actifs, SFDR, SRI, domicile…) |
| `/api/encours/series` | `freq` (`M`), `range` (`1A`), `fonds`, `famille`, `date` | Série d'encours et collecte par période (jour → année) |

## Portefeuilles

| Route | Paramètres | Réponse |
|---|---|---|
| `/api/holdings` | `date` | Positions de la maison : classes d'actifs, devises, premières lignes, lignes partagées |
| `/api/instruments` | `key` (obligatoire), `date` | Fonds qui détiennent une ligne donnée |

## Distribution

| Route | Paramètres | Réponse |
|---|---|---|
| `/api/distribution` | `date`, `rmm` (`exclure`) | Pays de commercialisation, Sankey, chronologie, teneurs, plateformes |
| `/api/countries/{name}` | `date`, `rmm` | Fonds et parts autorisés dans un pays |

## Risques et contrôles

| Route | Paramètres | Réponse |
|---|---|---|
| `/api/risk` | `date` | SRI, volatilité, perte maximale, tracking error, concentration de tous les fonds |
| `/api/controls` | `date` | Contrôles de conformité et de qualité des données |

## Passif

| Route | Paramètres | Réponse |
|---|---|---|
| `/api/passif` | — | Vue agrégée : segments, teneurs, pays, classes d'actifs, desks (en parts et tranches) |
| `/api/passif/fonds/{fid}` | — | Passif agrégé d'un fonds |
| `/api/passif/fonds/{fid}/porteurs` | — | Clients porteurs d'un fonds (**vue nominative**) |
| `/api/passif/fonds/{fid}/flux` | — | Souscriptions et rachats d'un fonds d'après le passif |
| `/api/passif/carnet` | `top` (60) | Qui est investi dans quoi : premiers clients, leurs fonds et parts (**vue nominative**) |
| `/api/passif/clients` | `q` | Fonds détenus par les clients dont le nom contient `q` (**vue nominative**) |

## Démonstration

| Route | Paramètres | Réponse |
|---|---|---|
| `/api/demo` | — | Configuration : gestions, territoires de ventes (pays), banque privée |
| `/api/demo/gerant` | `nom` ou `famille`, `date` | Tableau de bord d'une gestion : performances 1M→5A, encours, collecte, souscriptions, zones, portefeuille |
| `/api/demo/territoire` | `pays` (codes ISO séparés par des virgules) | Ventes d'un territoire : collecte par pays et période, encours, clients (**vue nominative**) |
| `/api/demo/banque-privee` | `date` | Canal Rothschild Martin Maurel : encours, revenus, fonds, parts, flux, clients (**vue nominative**) |
| `/api/demo/fonds-rmm` | `date` | Tableau de bord des fonds Rothschild Martin Maurel (règle Product Info) |

## Exports

Chaque extraction renvoie `{columns, rows, grain, n}`. Au-delà de 250 000 lignes, elle est refusée avec le nombre de
lignes qu'elle aurait produit.

| Route | Paramètres | Grain |
|---|---|---|
| `/api/export/encours` | `niveau` (`fonds`/`part`), `pas` (`M`…), `debut`, `fin`, `fonds`, `familles`, `date` | Une ligne par entité et période |
| `/api/export/parts` | `date` | Une ligne par part |
| `/api/export/enregistrements` | `actifs` (`1`), `rmm`, `date` | Une ligne par part et pays d'enregistrement |
| `/api/export/referentiel` | `niveau` (`fonds`/`part`) | Une ligne par fonds ou par part |
| `/api/export/inventaires` | `fonds`, `date` | Une ligne par ligne d'inventaire |

## Interface

| Route | Réponse |
|---|---|
| `/{path}` | Fichiers de `frontend/dist` ; toute adresse inconnue renvoie `index.html` (application monopage) |

## Format des erreurs

```json
{ "error": "fabric_query", "message": "Colonne absente : …", "hint": "…", "table": "PI_OUT_Share" }
```

| `error` | HTTP | Cause |
|---|---|---|
| `fabric_config` | 500 | `.env` absent ou invalide |
| `fabric_driver` | 500 | Client SQL non installé |
| `fabric_connection` | 503 | Serveur injoignable |
| `fabric_auth` | 401 | Échec Entra ID |
| `fabric_timeout` | 504 | Délai dépassé |
| `fabric_query` | 502 | Table ou colonne absente (nommée) |
| `model_loading` | 503 | Modèle en cours de chargement |
