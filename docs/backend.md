# Back end (`backend/rco/`)

## Dépendances

| Paquet | Version | Fichier | Usage |
|---|---|---|---|
| fastapi | ≥ 0.110, < 1 | `requirements.txt` | Routes HTTP |
| uvicorn | ≥ 0.29, < 1 | `requirements.txt` | Serveur ASGI |
| pandas | ≥ 2.1, < 4 | `requirements.txt` | Tables en mémoire |
| numpy | ≥ 1.26, < 3 | `requirements.txt` | Calcul numérique |
| mssql-python | ≥ 1.4 | `requirements-fabric.txt` | Connexion Fabric |
| pyarrow | ≥ 14 | `requirements-arrow.txt` | Lecture en colonnes (optionnel) |
| pytest, httpx | ≥ 8, ≥ 0.27 | `requirements-dev.txt` | Tests |

## Modules

### Racine

| Fichier | Rôle |
|---|---|
| `api.py` | Application FastAPI : routes, préchauffage, gestion des erreurs, service de `frontend/dist` |
| `service.py` | Classe `Service` : assemble les réponses à partir du modèle ; caches par date |
| `exports.py` | Extractions « une ligne par enregistrement » pour l'onglet Export (limite : 250 000 lignes) |
| `config.py` | `Settings` et `load_settings()` : configuration lue dans l'environnement ; `fabric_config_problems()` refuse les valeurs d'exemple |
| `bench.py` | Banc de mesure : temps par table, par vue, mémoire maximale (`peak_memory_mb`) |
| `fabric_check.py` | Diagnostic de connexion sans charger le modèle ; codes de sortie 0 à 4 |

### `data/` — accès aux données

| Fichier | Rôle |
|---|---|
| `fabric.py` | `FabricSource` : connexion, exécution des requêtes, lecture Arrow ; `connection_string()` ; hiérarchie d'erreurs `FabricError` (config, driver, connexion, auth, requête, délai) et `classify()` qui traduit une exception du pilote |
| `aum.py` | Lecture compacte de `JUMP_portfolio_aum` : faits (`facts_sql`) et attributs (`attributes_sql`, fenêtres `LAG`/`ROW_NUMBER`) puis `join_attributes()` |
| `sql_guard.py` | `assert_read_only()` : garde-fou lecture seule (voir [securite.md](securite.md)) |
| `schema.json`, `schema.py` | Schéma exact attendu des tables (noms et types) |
| `sources.py` | `make_source()` : source fictive par défaut, Fabric si `APP_DATA_SOURCE=fabric` |
| `mock.py` | `MockLakehouse`, `MockSource`, `ScaledMockSource` : données fictives déterministes au schéma exact (ISIN « DEMO ») |
| `passif_mock.py` | `PassifMock` : comptes, positions, transactions fictifs |

### `domain/` — règles métier

| Fichier | Rôle | Fonctions principales |
|---|---|---|
| `ids.py` | Normalisation des identifiants | `norm_id`, `norm_isin`, `norm_jump`, `align`, `shapes` |
| `linking.py` | Rattachement parts → référentiel → fonds | `link`, `KeyIndex`, `best_rows`, `is_active` |
| `model.py` | Modèle en mémoire | `build_model`, `assemble`, `Model`, `flow_matrix`, `ost_factor`, `asof_matrix`, `flows_disabled`, `find_duplicate_funds` |
| `analytics.py` | Variations, collecte, performances, risques | `variation`, `period_points`, `adjusted_index`, `perf_block`, `risk_stats`, `share_performance`, `main_part`, `fund_summary_rows` |
| `revenue.py` | Revenus estimés | `part_rates`, `accrued`, `revenue_view` |
| `holdings.py` | Inventaires | `latest_inventory`, `composition_summary`, `fund_composition`, `house_holdings`, `instrument_detail` |
| `passif.py` | Passif | `Passif`, `SqlReader`, `PandasReader`, `resolve_mapping`, `segment_of`, `allowed_statuts`, `check` |
| `demo.py` | Pages de démonstration | `config`, `resolve`, `country_info`, `DemoPassif` (`territory`, `funds_side`, `rmm_bank`) |
| `labels.py` | Vocabulaire | `family_of`, `country`, `country_iso_name`, `sfdr_short`, `rmm_funds`, `to_bool` |
| `fields.py` | Catalogue des champs du référentiel | `fmt_value`, `render_sections`, `render_list`, `render_flags` |
| `numeric.py` | Conversions numériques sûres | `safe_float`, `safe_divide`, `return_between`, `numeric_series`, `to_json_number` |

## Le modèle en mémoire (`domain/model.py`)

`build_model(source, stale_days, history_years)` lit les tables puis appelle `assemble()`, qui produit un objet
`Model` contenant notamment :

| Attribut | Contenu |
|---|---|
| `reference_date`, `dates` | Date d'arrêté et calendrier des dates d'observation |
| `products` | Fonds actifs du référentiel (index `pi_productid`) |
| `shares` | Parts du référentiel (index `pi_shareid`) |
| `funds` | Une ligne par fonds : référentiel + fonds JUMP non rattachés (`J:…`), avec leur famille |
| `countries` | Pays d'enregistrement |
| `holdings` | Inventaires |
| `dq` | Indicateurs de qualité de données |
| `link` | Une ligne par part JUMP : part du référentiel, fonds, et règle de rattachement utilisée |
| `link_report` | Compteurs du rattachement (diagnostic) |
| `aum_raw` | Lignes JUMP utiles, triées |
| `share_aum`, `fund_aum` | Matrices date × part et date × fonds de l'encours EUR « à date » |
| `share_flow_cum`, `fund_flow_cum` | Collecte nette estimée cumulée (EUR) par part et par fonds |
| `flows_off` | Parts et fonds dont la collecte est neutralisée (`APP_FLOWS_DISABLED`) |
| `memo` | Mémorisation des calculs coûteux |

`Model.period_start(end, période)` donne la date de départ d'une période (`1S`, `1M`, `3M`, `6M`, `YTD`, `1A`, `3A`,
`5A`) : date calendaire (par exemple `YTD` = 31 décembre précédent, `1A` = même jour un an avant), puis dernière
date d'observation inférieure ou égale ; `None` si elle sort de l'historique.

`memo(m)` fournit un dictionnaire de mémorisation attaché au modèle, utilisé par les calculs coûteux.

## La couche service (`service.py`)

`Service` reçoit le modèle et expose une méthode par écran. Méthodes publiques :

| Groupe | Méthodes |
|---|---|
| Synthèse | `meta`, `overview`, `revenue`, `city`, `flow_city`, `search_index` |
| Fonds et parts | `funds`, `fund`, `share`, `compare`, `breakdown` |
| Encours | `aum_series` |
| Portefeuilles | `holdings`, `instrument` |
| Distribution | `distribution`, `country` |
| Risques et contrôles | `risk`, `controls`, `links`, `flows_off` |
| Démonstration | `demo_managers`, `demo_manager`, `demo_family`, `demo_rmm`, `isin_rates` |

Les méthodes coûteuses sont décorées `@lru_cache` (22 caches), avec la date comme clé. Les résultats mis en cache sont
copiés avant modification (`dict(...)`), pour ne jamais altérer la valeur conservée.

## Le passif (`domain/passif.py`)

- **Lecteurs** : `SqlReader` (Fabric) et `PandasReader` (données fictives) exposent la même interface :
  `columns()`, `group()` (agrégation `GROUP BY` côté source), `rows()` (lignes, avec plafond), filtres `inn`
  (listes de valeurs) passés en paramètres.
- **Correspondance des colonnes** (`resolve_mapping`) : exacte, par nom réel ou par position fixe (`_c0 … _cN`),
  ajustable par `APP_PASSIF_MAP_COMPTE / _POSITION / _TRANSACTION`.
- **Valeurs** : `NULL`, chaîne vide, `nan`, `none`, `N/A` sont nulles ; dates américaines (`9/30/2026 12:00:00 AM`)
  ou ISO.
- **Classe `Passif`** : vue agrégée (`get()`), vue par fonds, porteurs, flux, carnet, recherche de clients.
  Les agrégats sont conservés `APP_PASSIF_TTL_HOURS` heures (6 par défaut).

Les règles de confidentialité sont détaillées dans [regles-metier.md](regles-metier.md#passif) et [securite.md](securite.md).

## Gestion des erreurs (`api.py`)

| Exception | Réponse |
|---|---|
| `FabricError` et sous-classes | `{error, message, hint, detail?, table?}` avec le code HTTP de la classe |
| `ServiceUnavailable` (`model_loading`) | 503 + `Retry-After: 3` |
| Autre exception | 500, message générique, sans donnée |

Les valeurs non finies (NaN, infini) sont remplacées par `null` avant sérialisation (`_sanitize`).
