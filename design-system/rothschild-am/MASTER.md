# Système de design — Rothschild & Co Asset Management (source de vérité)

Établi avec le skill **UI/UX Pro Max** (Next Level Builder, `.claude/skills/ui-ux-pro-max`) :
`search.py "asset management financial dashboard premium dark" --design-system --variance 7 --motion 8 --density 7`,
puis recherches ciblées (`product`, `chart`, `gsap`, `--stack threejs`, `quick-reference.md` §1–7).
Les surcharges par page sont dans `pages/` ; elles l'emportent sur ce fichier.

## Ce que le skill recommande, et ce qui est retenu
| Recommandation du skill | Décision | Raison |
|---|---|---|
| Produit : *Financial Dashboard* — Dark Mode (OLED) + Data-Dense Dashboard | **Retenu** | Interface sombre partout, données denses |
| Motif : *Enterprise Gateway* (choix du parcours « Je suis… », signaux de confiance) | **Retenu** | Accueil : « Par où commencer — Je suis… » (Direction, Commercial, Gestion, Risques) |
| Palette proposée (vert #22C55E sur bleu nuit) | **Écartée** | Charte Rothschild & Co obligatoire (bleu #1C355E, or #CC9F53, rouge #8A1E41, rose #E8C9BA, pierre #D6D1CA) |
| Typographie Fira Code / Fira Sans via Google Fonts | **Écartée** | Polices de la maison embarquées (Instrument Serif, Inter Tight, JetBrains Mono) ; aucun appel externe |
| Cadrans : variance 7, mouvement 8 (chorégraphie), densité 7 | **Retenu** | Récits épinglés, 3D, GSAP ; tableaux denses dans l'espace métiers |

## Jetons (`frontend/src/styles/tokens.css`)
- Couleurs : jetons sémantiques uniquement (`--paper`, `--card`, `--ink`, `--ink-2`, `--ink-3`, `--gold`, `--fam-*`, `--up`, `--down`), jamais de hex dans un composant.
- Espacement : pas de 4/8 — `--space-1` 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · `--space-9` 96.
- Mouvement : `--dur-press` 120 ms · `--dur-ui` 220 ms · `--dur-panel` 420 ms · `--dur-reveal` 700 ms · `--dur-hero` 1 200 ms ;
  arrivée en décélération (`--ease`, `expo.out`), sortie plus courte (≈ 65 %) en accélération (`--ease-in`) ; cascade 30–50 ms par élément.
- Calques : `--z-base` 0 · `--z-raised` 10 · `--z-sticky` 40 · `--z-overlay` 100 · `--z-curtain` 1000.
- Typographie : aucun texte sous 12 px ; chiffres tabulaires ; titres en serif, interface en sans.

## Règles (extraites du skill, appliquées)
1. **Contraste** ≥ 4,5:1 pour le texte (≥ 3:1 éléments non textuels), mesuré sur fond sombre.
2. **Cibles** ≥ 24 px partout (WCAG 2.2), ≥ 44 px sur écran tactile (`@media (pointer: coarse)`, attribut `data-touch`).
3. **Mouvement** : respect de `prefers-reduced-motion` **et** bouton de pause global dans l'en-tête (`html[data-motion="off"]`) :
   rotations au repos, particules, balancements et orbites s'arrêtent ; état final lisible immédiatement.
4. **Glisser** : toute rotation 3D au glisser a une alternative boutons et clavier (cité des revenus : ⟲ ◎ ⟳, flèches ; comparateur : « vue de face » ; passif : bascule tableau).
5. **Couleur jamais seule** : lettres A–F et styles de trait (plein, tirets, pointillés…) dans le comparateur ; libellés et valeurs directs dans les classements ; légende + tableau.
6. **Graphiques** : courbes pour le temps (≤ 6 séries), barres pour les classements, pas de mosaïque ; infobulle au survol et au focus ; tableau de repli.
7. **Chargement** : espace réservé et squelette scintillant plutôt que des valeurs qui sautent (CLS) ; vues lourdes chargées à la demande (`import()`).
8. **Liens profonds** : chaque section a une ancre (`#h-…`) atteignable depuis une URL ; décalage sous l'en-tête collant (`scroll-margin-top`).
9. **Formes : institutionnelles, à l'équerre.** Rayon 0 à 2 px (`--radius`), aucune pastille, bulle, bouton rond ni particule ronde ;
   repères carrés ou losanges, filets d'or, coins de cadre. Graphiques en nuage : carrés ∝ encours, pas de disques.
10. **Épinglage** : une seule section épinglée par page (l'ouverture de l'Accueil), jamais quand le mouvement est réduit ou en pause.
11. **Three.js** : `dispose()` de toute géométrie, matière et texture ; rendu suspendu hors écran ; qualité adaptée au poste (`quality.ts`).

## Liste de contrôle avant livraison
- [ ] 375 / 768 / 1024 / 1440 px sans défilement horizontal de la page
- [ ] Animations réduites et bouton pause : contenu complet, rien d'invisible
- [ ] Clavier : ordre de tabulation, focus visible, alternatives au glisser
- [ ] Aucun texte < 12 px, contraste vérifié sur fond sombre
- [ ] Aucune donnée métier en dur, aucun appel externe
