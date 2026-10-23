# Front end (`frontend/`)

## Dépendances

| Paquet | Version | Usage |
|---|---|---|
| react, react-dom | 19.3 | Composants d'interface |
| react-router-dom | 7.18 | Navigation |
| three | 0.186 | Scènes 3D (WebGL) |
| gsap | 3.15 | Animations (ScrollTrigger, SplitText) |
| d3-scale, d3-shape, d3-geo | 4.0 / 3.2 / 3.1 | Échelles, tracés, projections |
| topojson-client, world-atlas | 3.1 / 2.0 | Contours des pays (embarqués) |
| exceljs, jszip | 4.4.0 / 3.10.1 | Classeurs Excel générés dans le navigateur |
| country-flag-icons | 1.6 | Drapeaux SVG embarqués |
| @fontsource/* | 5.3 | Polices embarquées : Instrument Serif, Inter Tight, JetBrains Mono |
| typescript, vite, vitest | 7.0 / 8.3 / 5.0 | Développement, compilation, tests |

## Compilation

- `vite.config.ts` : cible `es2022` ; en développement, `/api` est relayé vers `http://127.0.0.1:8000`.
- Les fichiers produits ont des noms courts (`a/<hash>.js`) pour rester sous la limite de 260 caractères des chemins
  Windows.
- La sortie `frontend/dist` (≈ 5 Mo) est versionnée : l'application s'utilise sans Node.js.
- `frontend/dist/.source-hash` : empreinte du code source, que le lanceur compare pour détecter une interface non
  recompilée.

## Structure de `src/`

```
src/
├── main.tsx, App.tsx      point d'entrée, routes
├── pages/                 une page par rubrique
├── components/            composants partagés
│   └── demo/              pages de démonstration
├── three/                 scènes 3D (Three.js)
├── lib/                   accès à l'API, formats, recherche, exports, mouvement
└── styles/                feuilles de style par rubrique (tokens.css = variables de couleur et d'espacement)
```

## Pages (`pages/`, routes dans `App.tsx`)

| Adresse | Fichier | Contenu |
|---|---|---|
| `/` | `Home.tsx` | Accueil : ouverture animée (`HomeIntro`), chiffres clés, revenus, Rothschild & Co City (`RothschildCity`) |
| `/metiers` | `Workspace.tsx` | Espace métiers : recherche, fiches épinglées, répertoire |
| `/fonds` | `FundsSearch.tsx` | Recherche de fonds, risques (`RiskPanels`), contrôles |
| `/fonds/:id` | `Fund.tsx` | Fiche fonds |
| `/parts/:id` | `Share.tsx` | Fiche part |
| `/encours` | `Encours.tsx` | Ville des encours, courbe 3D (`AumCurve`), répartitions |
| `/selection` | `Selection.tsx` | Sélection multicritère |
| `/portefeuilles`, `/portefeuilles/ligne` | `Holdings.tsx`, `Instrument.tsx` | Inventaires ; fonds détenant une ligne |
| `/distribution`, `/distribution/:pays` | `Distribution.tsx`, `Country.tsx` | Commercialisation, Sankey, globe ; détail d'un pays |
| `/passif` | `Passif.tsx` | Porteurs : segments, teneurs, pays ; vues clients ↔ fonds |
| `/comparateur` | `Compare.tsx`, `CompareCharts.tsx` | Comparaison de fonds |
| `/export` | `Export.tsx`, `ExportReport.tsx` | Studio d'export Excel et rapports |
| `/demo/*` | `Demo.tsx` | Démonstration : sommaire, gestions, ventes, banque privée |
| `/risques` | — | Redirection (les risques sont dans `/fonds`) |
| `*` | `NotFound.tsx` | Page introuvable |

### Démonstration (`components/demo/`)

| Fichier | Contenu |
|---|---|
| `ManagerBoard.tsx` | Tableau de bord d'une gestion : performances (cumulées / annualisées, écart à l'indicateur), encours empilés, décomposition collecte / marché, collecte par fonds, souscriptions, zones (globe), portefeuille |
| `Sales.tsx` | Ventes : vue d'ensemble des territoires et une page par territoire (collecte par pays, mois par mois, fonds, encours, clients) |
| `PrivateBank.tsx` | Banque privée RMM : poids du canal, revenus par fonds et par part, flux, fonds RMM, clients |
| `kit.tsx` | Éléments communs : onglets de période, indicateurs, barres souscriptions / rachats, tableau des clients |
| `types.ts` | Types des réponses de l'API de démonstration |

## Accès à l'API (`lib/api.ts`)

- `fetchJson()` et le hook `useApi()` : requêtes GET mises en cache par adresse pendant la session ; `prefetch()` les anticipe ; `withDate()` ajoute la date d'arrêté.
- Erreurs typées `ApiError` (`status`, `code`, `hint`, `detail`), à partir du format `{error, message, hint}`.
- Chargement du modèle : une seule boucle interroge `/api/health` et relance toutes les requêtes en attente une fois
  le modèle prêt.
- `lib/context.tsx` (`AppProvider`, `useApp()`) fournit la date d'arrêté choisie et la fonction `api()` qui l'ajoute aux adresses.

## Autres modules de `lib/`

| Fichier | Rôle |
|---|---|
| `format.ts` | Formats français : M€, Md€, %, dates JJ/MM/AAAA, espaces insécables |
| `search.ts` | Recherche universelle locale : accents, casse, fautes de frappe (distance d'édition), préfixes, codes (ISIN…), combinaisons (« article 9 italie ») |
| `fiche.ts` | « Chercher dans la fiche » : chaque information d'une fiche devient une réponse avec un lien vers sa position |
| `desk.ts` | Fiches épinglées et récentes, en `localStorage` (identifiants et libellés seulement, jamais de chiffres) |
| `families.ts` | Couleurs des familles et palette catégorielle |
| `rmm.ts` | Interrupteur « fonds RMM » de la Distribution (`?rmm=exclure`) |
| `gsap.ts`, `motion.ts` | Système de mouvement ; respect de `prefers-reduced-motion` |
| `xlsx.ts`, `exportCols.ts`, `export/` | Classeurs Excel construits dans le navigateur (ExcelJS chargé à la demande) ; catalogues de colonnes |
| `report/` | Rapports : jeux de données, graphiques, thèmes, export PDF |
| `types.ts` | Types partagés |

## Scènes 3D (`three/`)

| Fichier | Scène |
|---|---|
| `RevenueScene.ts` | Rothschild & Co City : une tour par fonds, hauteur = revenus ; vues de collecte (`setValues`) |
| `CityScene.ts` | Ville des encours : un immeuble par fonds (hauteur ∝ √encours) |
| `AumScene.ts` | Courbe 3D des encours par période |
| `GlobeScene.ts` | Globe de la distribution (d3-geo, Natural Earth via world-atlas) |
| `MapScene.ts` | Carte 3D des pays de commercialisation |
| `PassifScene.ts` | Tours des teneurs du passif |
| `CompareScene.ts`, `ComparePodium.ts` | Trajectoires base 100 et podium d'un indicateur |
| `KeyboardScene.ts` | Clavier 3D de la recherche de fonds |
| `quality.ts` | Gouverneur de fluidité commun : 30 images/s au repos, 60 en interaction |

Sans WebGL, les pages restent lisibles sans la 3D.

## Tests

`npx vitest run` : 44 tests (formats, recherche, fiche, exports, rapports, courbe des encours, client API).
