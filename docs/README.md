# Eureka — documentation du code

Eureka est une application web de consultation des fonds, des encours, de la distribution et du passif de
Rothschild & Co Asset Management. Elle lit le Lakehouse Microsoft Fabric `LKH_RFPTeam_Bronze` en lecture seule,
calcule les indicateurs dans un serveur Python et les affiche dans une interface React.

Le `README.md` à la racine explique comment **utiliser** l'application. Ce dossier explique comment elle est **construite**.

| Document | Contenu |
|---|---|
| [architecture.md](architecture.md) | Vue d'ensemble, composants, cycle de vie du processus, parcours d'une requête |
| [backend.md](backend.md) | Serveur Python : modules, modèle en mémoire, couche service, caches |
| [api.md](api.md) | Les 40 routes HTTP : paramètres et réponses |
| [regles-metier.md](regles-metier.md) | Rattachement JUMP ↔ Product Info, encours, collecte, performances, revenus, familles, RMM, passif, démo |
| [frontend.md](frontend.md) | Interface : structure, pages, composants, scènes 3D, recherche, exports |
| [securite.md](securite.md) | Lecture seule, requêtes paramétrées, données personnelles, secrets, réseau |
| [exploitation.md](exploitation.md) | Lancement, configuration, diagnostics, tests, banc de mesure |

## En bref

| | |
|---|---|
| Langages | Python 3.10+ (serveur), TypeScript (interface) |
| Serveur | FastAPI + Uvicorn, pandas, NumPy, pyarrow, mssql-python |
| Interface | React 19, React Router 7, Vite 8, Three.js, GSAP, D3, ExcelJS |
| Source | Microsoft Fabric uniquement (SQL analytics endpoint), en lecture seule |
| Authentification | Entra ID interactive, avec le compte de l'utilisateur |
| Stockage | Aucun : données en mémoire, perdues à l'arrêt |
| Réseau | Écoute sur `127.0.0.1` par défaut ; aucun appel externe |
| Tests | 225 fonctions pytest (≈ 340 cas), 44 tests Vitest |

## Arborescence

```
App4everyone/
├── run.py · run.bat · run.sh     lanceur (installation, démarrage, diagnostics)
├── .env.example                  modèle de configuration (sans secret)
├── backend/
│   ├── requirements*.txt         dépendances Python
│   ├── rco/                      code du serveur          → backend.md
│   │   ├── api.py                routes HTTP              → api.md
│   │   ├── service.py            couche service
│   │   ├── exports.py            extractions pour l'onglet Export
│   │   ├── config.py             configuration (environnement)
│   │   ├── bench.py              banc de mesure
│   │   ├── fabric_check.py       diagnostic de connexion
│   │   ├── data/                 accès aux données, garde-fou SQL, données fictives
│   │   └── domain/               règles métier            → regles-metier.md
│   └── tests/                    tests pytest
├── frontend/
│   ├── src/                      code de l'interface      → frontend.md
│   ├── dist/                     interface compilée, servie par le serveur
│   └── package.json
├── docs/                         cette documentation
└── video/                        films de présentation (Remotion), hors application
```
