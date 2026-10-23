# Sécurité et protection des données

## Synthèse

| Mesure | Mise en œuvre | Vérification |
|---|---|---|
| Lecture seule | Garde-fou SQL (`data/sql_guard.py`), `ApplicationIntent=ReadOnly`, aucune route d'écriture | `tests/test_sql_guard.py` |
| Pas d'injection SQL | Valeurs passées en paramètres, jamais concaténées | `tests/test_demo.py`, `tests/test_passif.py` |
| Pas de secret dans le code | Configuration par l'environnement ; `.env` exclu de Git ; valeurs d'exemple refusées (`config.fabric_config_problems`) | `.gitignore` |
| Connexion chiffrée | `Encrypt=yes;TrustServerCertificate=no` | `data/fabric.py` |
| Identité de l'utilisateur | Entra ID interactif : chaque utilisateur n'a que ses droits Fabric | `data/fabric.py` |
| Pas d'exposition réseau | Écoute sur `127.0.0.1` par défaut | `run.py --host` |
| Pas de stockage | Aucune base, aucun fichier écrit ; données en mémoire | — |
| Journaux sans contenu | Durées et nombres de lignes uniquement | `bench.py`, `data/fabric.py` |
| Vues nominatives non conservées | À la demande, sans cache ni journal | `domain/passif.py`, `domain/demo.py` |
| Aucun appel externe | Polices, drapeaux, contours de pays embarqués ; pas de télémétrie | — |
| Données fictives par défaut | ISIN contenant « DEMO », badge permanent à l'écran | `tests/test_mock_and_api.py` |

## Garde-fou lecture seule (`data/sql_guard.py`)

Toute requête passe par `assert_read_only(sql)` avant exécution. Après retrait des commentaires et neutralisation des
littéraux, la requête est refusée (`ReadOnlyViolation`) si :

- elle contient plus d'une instruction (`;` interne) ;
- elle ne commence pas par `SELECT` ou `WITH` ;
- elle contient, hors noms entre crochets, l'un des mots-clés : `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `DROP`,
  `ALTER`, `CREATE`, `TRUNCATE`, `EXEC`, `EXECUTE`, `GRANT`, `REVOKE`, `DENY`, `INTO`, `BACKUP`, `RESTORE`, `DBCC`,
  `SHUTDOWN`, `KILL`, `OPENROWSET`, `OPENQUERY`, `OPENDATASOURCE`, `BULK`, `SP_*`, `XP_*`, `WAITFOR`, `DECLARE`, `SET`,
  `USE`, `UPDATETEXT`, `WRITETEXT`.

## Requêtes paramétrées

Les valeurs choisies par l'utilisateur (nom de client recherché, liste de pays, identifiant de fonds) sont transmises
au pilote en paramètres (`?`), jamais insérées dans le texte SQL. Un test injecte `Fausto'; DROP TABLE x --` et
vérifie que la valeur arrive intacte en paramètre et que le texte SQL ne contient pas `DROP`.

## Données personnelles (passif)

| Vue | Conservation |
|---|---|
| Agrégats (segments, teneurs, pays, classes) | Mémoire, `APP_PASSIF_TTL_HOURS` (6 h par défaut) ; groupes de moins de 5 masqués ; parts et tranches, pas de montants |
| Vues nominatives (porteurs, carnet, clients, positions, territoires, canal RMM) | Aucune : calculées à chaque demande, ni cache ni journal |

Les exports Excel sont construits dans le navigateur ; le fichier n'existe qu'à l'endroit où l'utilisateur l'enregistre.

## Stockage dans le navigateur

`localStorage` contient uniquement des préférences d'affichage et les fiches épinglées ou récentes (identifiants et
libellés de fonds, `lib/desk.ts`). Aucun chiffre, aucune donnée de porteur.

## Fichiers exclus de Git (`.gitignore`)

`.env`, `.env.*` (sauf `.env.example`), `*.csv`, `*.tsv`, `*.xlsx`, `*.xls`, `*.parquet`, `*.feather`, `*.pkl`,
`*.db`, `*.sqlite`, `exports/`, `data_exports/`, `snapshots/`, `screenshots/`.
