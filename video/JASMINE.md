# « Jasmine » — le film de 1 min 30

L'application s'appelle désormais **Jasmine**. Le film reprend l'image du « Fil d'or » : fond noir bleuté, point et fil
d'or, Instrument Serif, angles vifs, aucune voix. Il est monté sur les temps de la musique et va droit au métier : on
cherche un fonds, on lit ses frais, on interroge sa fiche, on exporte vers Excel. Il ne parle ni d'encours ni de R-co Valor.

- 1920 × 1080, 30 i/s, 2 700 images (90 s). Composition `Jasmine`, sources dans `src/jasmine/`.
- Musique : « Fireworks » (FreePD, domaine public, CC0), extrait de 86,8 s à 176,8 s, 117 battements par minute.
  Un temps = 15,385 images, une mesure = 61,54 images. Chaque coupe, chaque mot, chaque clic tombe sur un temps.
- Images de l'application : prises `jcherche`, `jfiche`, `jexport` (`record/takes.mjs`), enregistrées en temps virtuel
  sur le **jeu de données fictif**. La mention « Images de l'application · jeu de données fictif » reste à l'écran.
- Les cadrages évitent les montants d'encours affichés par l'application (colonne de droite des résultats, en-tête
  de la fiche, colonnes par défaut de l'export).

## Le logo

Une fleur de jasmin à cinq pétales pliée comme un origami : chaque pétale a une face claire (`#e8c788`) et une face
pliée (`#b0823c`), autour d'un cœur pentagonal (`#fff3d6`). Uniquement des angles vifs. La même géométrie sert à
l'application (`frontend/src/components/JasmineLogo.tsx`, en-tête, accueil, favicon) et au film (`src/jasmine/logo.ts`).
Dans le film, chaque pétale arrive en tournant sur une croche, puis sa face pliée s'ouvre ; le cœur s'allume sur le temps.

## Plan par plan

| Mesures | Temps | Plan |
|---|---|---|
| 0–5 | 0:00–0:10 | **Ouverture.** Le point d'or ; un mot par temps (« Un fonds. Une part. Un ISIN. Des frais. Un cut-off. Un gérant. Une réponse. ») pendant que le fil s'allonge d'un cran à chaque temps. Levée : les champs Product Info défilent sur le fil, « Toute la donnée fonds. ». Le fil se replie, le jasmin se plie pétale par pétale, « Jasmine » s'écrit lettre à lettre. |
| 5–11 | 0:10–0:22 | **Chercher.** L'écran de la rubrique Fonds posé dans l'espace, puis plein cadre : « europe valeur » se tape sur le clavier 3D, les résultats arrivent ; puis la question directe « frais de gestion europe valeur » ; Entrée sur le temps, la fiche répond. |
| 11–13 | 0:22–0:26 | **Les frais.** « 2 % maximum », « 1,6 % réels » (valeurs du jeu fictif), « Directement depuis Product Info. » |
| 13–20 | 0:26–0:41 | **Comprendre.** Une question à la fiche par mesure : ISIN, cut-off, SFDR, dépositaire, gérant. L'écran bascule de côté à chaque mesure, le mot géant en filigrane. Puis « Tous les champs Product Info. Une seule question. » |
| 20–31 | 0:41–1:04 | **Exporter.** « En Excel. En un clic. » Puis l'outil d'export : source Fonds · Product Info, packs Fiche d'identité, Frais du fonds, Codes ; style Bordeaux ; Télécharger. Une onde d'or carrée marque chaque clic. |
| 31–35 | 1:04–1:12 | **Le fichier.** La feuille Excel arrive en 3D : en-tête Bordeaux, une ligne par fonds sur chaque croche, la cellule active parcourt « Frais de gestion réels » (vrai nombre, la barre de formule l'affiche). « Une ligne par fonds. De vrais nombres, sans cellule fusionnée. Prêt pour Excel et Copilot. » |
| 35–39 | 1:12–1:20 | **Chercher. Comprendre. Exporter.** Un mot et un écran par mesure, puis le triptyque traversé par le fil, qui se resserre vers le centre. |
| 39–44 | 1:20–1:30 | **Signature.** Le jasmin se plie, « Jasmine », « Rothschild & Co Asset Management », « Chercher · Comprendre · Exporter ». La musique s'éteint. |

## Refaire le film

```console
python run.py --mock                                   # l'application sur son jeu fictif (ou vite + uvicorn)
APP_URL=http://127.0.0.1:8011 node record/recorder.mjs jcherche jfiche jexport
npx remotion render Jasmine out/jasmine.mp4 --gl=swangle --codec=h264 --crf=17 --audio-codec=aac --audio-bitrate=320k
```
