# « Le fil d'or » — storyboard

Vidéo de présentation de l'application **Fonds & encours** · 58 s · 1920 × 1080 · 30 i/s (1 740 images).
Charte : `src/theme.ts`. Données : uniquement le jeu fictif de l'application (`MockSource`), affiché avec la mention
« Données illustratives ». Aucune donnée réelle, aucun nom de client.

## Le concept

Un seul fil d'or traverse tout le film sans jamais se rompre. C'est la donnée qui devient lisible. Il naît d'un point,
absorbe le bruit des données brutes, devient la courbe des encours, se découpe en périodes, se décompose en équation,
s'élève en tours de revenus, se déploie en routes vers les pays, se courbe en concentration du passif, puis se replie en
filet sous la signature. Chaque transition est un **raccord sur le fil**, jamais un fondu générique : la fin d'une scène
est la forme de départ de la suivante.

**Ce que le spectateur retient :** une maison de gestion qui lit toutes ses données au même endroit, du jour à l'année,
avec la sobriété de sa charte.

## Identité de mouvement (skill motion-design : personnalité « Premium »)

- **Courbe signature** `EASE.signature` (0.2, 0.7, 0.1, 1) pour 80 % des mouvements. Aucun rebond, aucun dépassement.
- **Trois durées :** 0,4 s (libellés), 0,6 s (blocs), 1 s (révélations). Le chiffre héros et le tracé principal durent 1,5 s.
- **Une seule entrée :** montée de 24 px avec fondu. Les sorties durent environ 65 % des entrées et accélèrent.
- **Trois couches dans chaque plan :**
  - le fil d'or (principal) ;
  - les graduations, libellés et chiffres (secondaire) ;
  - un halo d'or qui respire sur 8 s et un grain très léger (ambiance).
- **Cascades :** jamais plus d'un tiers des éléments en mouvement à la fois, cascade totale sous 0,5 s.
- **Chiffres :** compteurs en serif, chiffres tabulaires, avec une forte décélération `EASE.count`. Le dernier chiffre se fige
  une demi-seconde avant le texte qui l'explique.
- **Formes :** angles vifs partout, comme dans l'application. Aucune forme arrondie, aucune bulle.

## Plan par plan

| # | Temps | Idée (une par scène) | Image | Chiffres mis en valeur | Mouvement | Raccord vers la suite |
|---|---|---|---|---|---|---|
| 1 | 0:00–0:04 | **Tout part d'un point.** | Noir bleuté `paper`. Un point d'or apparaît au centre et respire, puis un filet de 1,5 px s'étire de bord à bord. Surtitre : « Rothschild & Co Asset Management ». | — | Point : opacité et échelle 0,6 → 1 sur 1 s. Filet : tracé `evolvePath` de 1,5 s depuis le centre. | Le filet devient l'horizon de la scène 2. |
| 2 | 0:04–0:09 | **Le bruit des données brutes.** | Des milliers de caractères mono gris (dates, codes, nombres fictifs) défilent en colonnes au-dessus et au-dessous du filet. Puis ils sont aspirés vers lui et s'y condensent. Texte : « Des dizaines de millions de cellules. » puis « Une seule lecture. » | **75 millions de cellules** (le banc d'essai de l'application) | Champ de points en d3 avec une opacité par colonne. Aspiration vers le filet en 1,2 s (`EASE.signature`), le filet s'épaissit à 3 px. | Le filet s'incline et monte : il devient la courbe de la scène 3. |
| 3 | 0:09–0:17 | **L'encours, en un trait.** | La courbe des encours sur trois ans se dessine de gauche à droite (`d3.line`, `curveMonotoneX`). Arête lumineuse `goldGlow`, aire en dégradé vertical qui s'efface vers le bas. Graduations en Md€ qui apparaissent avec le tracé. Le chiffre héros compte jusqu'au point d'arrivée. | **34,4 Md€** · +36,7 % sur 3 ans · 44 fonds · 187 parts | Tracé de 4 s (`EASE.draw`) avec une tête d'or qui laisse une traînée. Compteur synchronisé sur la tête. Lent travelling latéral de 3 % (parallaxe entre courbe et graduations). | La caméra plonge sur l'extrémité droite de la courbe. |
| 4 | 0:17–0:23 | **Du jour à l'année.** | Gros plan sur la dernière année. Un sélecteur à angles vifs passe Année → Trimestre → Mois → Semaine → Jour. À chaque cran, la courbe se reforme avec plus de points, et la collecte de chaque période pousse en barres sous l'axe (or au-dessus, rouge au-dessous). | **Du jour à l'année** · 1 042 jours d'historique · collecte de la semaine : +75 M€ | Changement de forme de la courbe par interpolation des points (0,6 s par cran, de gauche à droite). Barres qui montent depuis l'axe en cascade de 1 image. Le cran actif glisse sous le libellé. | Les barres de collecte s'additionnent et glissent vers la gauche : elles deviennent un segment de l'équation. |
| 5 | 0:23–0:29 | **D'où vient la croissance.** | Un pont horizontal en barres proportionnelles. L'encours au 31/12 + la collecte nette estimée (or) + l'effet marché (bleu) = l'encours du jour. Les opérateurs + et = en serif, géants et très fins. | **31,0 Md€ + 2,98 Md€ + 0,44 Md€ = 34,4 Md€** · **+11,0 %** depuis le 1er janvier | Chaque segment entre de la gauche et se pose bord à bord avec le précédent (0,6 s, cascade de 5 images). Un compteur par segment, puis le total. | Le dernier segment pivote à la verticale : la première tour de la scène 6. |
| 6 | 0:29–0:37 | **Ce qui rapporte.** | La cité des revenus en 2,5D isométrique (SVG extrudé) : une tour par fonds, hauteur = revenus, quatre quartiers de familles autour d'une place carrée. Les 22 fonds qui font 80 % des revenus restent allumés, les autres s'éteignent à 25 %. Étiquette du n° 1. | **397 M€ de revenus de gestion par an** · 1,15 % de frais moyens · **22 fonds = 80 % des revenus** · n° 1 : Europe Valeur, 39,5 M€ | Tours qui montent du plus gros au plus petit (cascade 0,5 s au total, `EASE.signature`). Lente orbite de 12° sur toute la scène. Traits de lumière verticaux sur les toits. | La caméra passe au-dessus de la cité, qui s'aplatit en plan : la place centrale devient le point de départ des routes. |
| 7 | 0:37–0:43 | **Partout où nous sommes autorisés.** | Un tableau des départs d'aéroport à palettes, à angles vifs, avec les drapeaux SVG locaux de l'application. Les lignes se retournent : France, Luxembourg, Suisse, Autriche, Norvège, Royaume-Uni… Derrière, des routes d'or partent de Paris. | **18 pays** · **185 parts enregistrées** | Palettes qui basculent en 3D CSS (`rotateX`) en cascade de 2 images, avec un son de palette discret. Les routes se dessinent avec `evolvePath`. | Les routes convergent en une seule courbe qui se plie : la courbe de concentration. |
| 8 | 0:43–0:48 | **Qui détient nos fonds.** | Une courbe de concentration (part des comptes en x, part de l'encours en y) qui se dessine. Un repère carré se fixe sur 10 %. À droite, les segments de porteurs en barres fines. | **10 % des comptes détiennent 53 % de l'encours** · clients directs : 46,9 % · parts et tranches uniquement, aucun nom | Tracé de 1,5 s. Repère qui glisse le long de la courbe et se pose. Le chiffre monte au repère. | La courbe se redresse en filet vertical, qui découpe l'écran en panneaux. |
| 9 | 0:48–0:54 | **Une seule application.** | Les écrans de l'application (Accueil, Encours, Fiche fonds, Distribution, Passif, Comparateur), en captures stylisées sur données fictives. Ils se rangent en une pile 3D à angles vifs, puis s'alignent de face. Texte : « Locale. En lecture seule. Vos données ne quittent pas Fabric. » | 6 rubriques · 1 commande pour lancer | Pile en perspective (`rotateY` de −18° → 0°), panneaux qui entrent l'un après l'autre (cascade de 3 images, total sous 0,5 s), puis mise à plat. | Les panneaux se replient vers le centre jusqu'à ne laisser qu'un filet d'or horizontal. |
| 10 | 0:54–0:58 | **Signature.** | Le filet se raccourcit sous « Fonds & encours », en serif, et la ligne « Rothschild & Co Asset Management ». Le point d'or du début revient au bout du filet. Mention « Données illustratives » en pied de cadre. | — | Rétraction du filet (`EASE.exit`), apparition du titre en montée et fondu, dernier battement du halo, noir. | Fin. |

## Son (proposition)

- Une nappe de piano et de cordes, retenue, à 60–70 BPM. Les coupes tombent sur les temps : 0:09, 0:17, 0:29, 0:48.
- Effets très discrets : un « tic » mécanique sur chaque compteur qui se fige, des palettes sur le tableau des départs, un
  souffle sur le raccord de la cité.
- Pas de voix off : tout se lit à l'écran, ce qui permet aussi une lecture sans le son.

## Construction (skills Remotion)

- Une scène par fichier dans `src/scenes/`, chacune enregistrée comme composition connectée, plus `src/Video.tsx`
  avec `<TransitionSeries>`. Les raccords sur le fil sont des présentations personnalisées (`@remotion/transitions`) qui
  partagent la géométrie du fil entre deux scènes.
- Courbes : `d3-scale` et `d3-shape` pour les tracés, `@remotion/paths` (`evolvePath`, `interpolatePath`) pour le dessin
  et les changements de forme.
- Tout est animé par `useCurrentFrame()` et `interpolate()`, sans transition ni animation CSS. `premountFor={fps}` sur chaque séquence.
- Données : un fichier `src/data/sample.ts` généré une fois depuis le jeu fictif de l'application (séries mensuelles et
  quotidiennes, revenus par fonds, pays, concentration). Il est versionné, et aucune lecture de Fabric n'a lieu.
- Contrôle : images clés rendues en PNG pour vérifier les marges de sécurité (144 px de côté, 100 px en haut et en bas)
  et la taille minimale des textes.
