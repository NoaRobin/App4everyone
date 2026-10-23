# Architecture

## Vue d'ensemble

```
┌──────────── Microsoft Fabric · Lakehouse LKH_RFPTeam_Bronze ────────────┐
│  JUMP · Product Info · Passif (compte, position, transaction)            │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ SELECT uniquement · chiffré · Entra ID interactif
┌────────────────────────── Poste de l'utilisateur ────────────────────────┐
│  Processus Python : Uvicorn + FastAPI, 127.0.0.1:8000                    │
│    data/      lecture (Arrow, garde-fou SQL)                             │
│    domain/    rattachement → modèle en mémoire → calculs                 │
│    service.py assemblage par écran + caches par date                     │
│    api.py     routes JSON + service de frontend/dist                     │
│                         │ HTTP local, JSON                               │
│  Navigateur : interface React compilée (frontend/dist)                   │
└──────────────────────────────────────────────────────────────────────────┘
```

Un seul processus sert l'API (`/api/...`) et les fichiers de l'interface. Il n'y a ni base de données intermédiaire,
ni serveur web séparé, ni file de messages.

## Les deux familles de données

| | JUMP + Product Info | Passif |
|---|---|---|
| Tables | `JUMP_portfolio_aum`, `JUMP_portfolio_holdings`, `pi_out_product_active`, `PI_OUT_Share`, `PI_OUT_CountryOfRegistration`, `calendar`, `sys_dq_metrics` | `compte`, `position`, `transaction` |
| Lecture | Une fois, au démarrage, en entier (6 ans d'historique) | À la demande, par requêtes agrégées (`GROUP BY`) ou paramétrées |
| En mémoire | Modèle complet (`domain/model.py`) | Agrégats conservés 6 h ; vues nominatives jamais conservées |
| Code | `data/`, `domain/model.py`, `analytics.py`, `holdings.py`, `revenue.py`, `linking.py` | `domain/passif.py`, `domain/demo.py` |

## Cycle de vie du processus

1. **Démarrage** — `run.py` prépare l'environnement Python, lance Uvicorn sur `rco.api:app`, ouvre le navigateur.
2. **Préchauffage** (`api.py`, fil `rco-warmup`) — en arrière-plan :
   - choix de la source (`data/sources.py` : données fictives par défaut, Fabric sur demande) ;
   - lecture des tables (`data/fabric.py`, `data/aum.py`) ;
   - rattachement JUMP ↔ Product Info (`domain/linking.py`) ;
   - construction du modèle (`domain/model.py`) ;
   - préparation des vues principales (vue d'ensemble, revenus, panorama, recherche, risques, contrôles,
     portefeuilles, distribution).
   Pendant ce temps, toute route de données répond `503 model_loading` avec `Retry-After`. Le client
   (`frontend/src/lib/api.ts`) interroge `/api/health` et relance les requêtes une fois le modèle prêt.
3. **Service** — chaque requête lit le modèle en mémoire ; les résultats coûteux sont mis en cache par date.
4. **Passif** — instancié à la première demande (`passif_obj()` dans `api.py`), avec un lecteur SQL sur Fabric ou un
   lecteur pandas sur les données fictives.
5. **Arrêt** — tout ce qui est en mémoire disparaît ; rien n'est écrit sur disque.

## Parcours d'une requête

Exemple : `GET /api/demo/gerant?famille=fi`.

1. `api.py` → `demo_manager()` vérifie que le modèle est prêt (`_api_service()`).
2. `service.py` → `Service.demo_family("fi", date)` sélectionne les fonds de la famille, plus ceux dont la classe
   d'actifs Product Info relève de la famille, puis appelle `_funds_board()` (mis en cache par liste de fonds et date).
3. `_funds_board()` combine `domain/analytics.py` (performances, variations, collecte), `domain/revenue.py`
   (revenus) et `domain/holdings.py` (portefeuille).
4. `api.py` complète avec le passif (`domain/demo.py` → `DemoPassif.funds_side()` : zones, dernières souscriptions),
   par requêtes paramétrées.
5. La réponse est nettoyée (`_sanitize` : NaN et infinis → `null`) et compressée (gzip).

## Choix de conception

| Choix | Raison |
|---|---|
| Modèle en mémoire chargé une fois | Toutes les pages répondent sans relire Fabric |
| Lecture JUMP en deux requêtes (faits / attributs) | Les libellés répétés chaque jour représentaient l'essentiel du volume (`data/aum.py`) |
| `CAST ... AS FLOAT` côté SQL | Évite les objets `Decimal` en Python, plus lents et plus gros |
| Caches par date | Un même écran à une même date n'est calculé qu'une fois |
| Passif agrégé côté source | Aucune ligne de client ne quitte Fabric hors vues nominatives explicites |
| Interface compilée et versionnée | Node.js n'est pas nécessaire à l'usage |
