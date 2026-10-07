# Vidéos de présentation — Rothschild & Co Asset Management

Cinq films Remotion en 1920 × 1080, 30 i/s, qui partagent la charte de `src/theme.ts` :

- **« Le matin »** (`Matin`, 1 min 30) : avec voix off. L'extraction JUMP de chaque matin et le tic-tac, les outils
  éparpillés, Fabric qui relie tout, puis Jasmine : plans 3D, cas pratique, export Excel ; JUMP n'aurait pas terminé.
  Voir `MATIN.md`.
- **« Jasmine »** (`Jasmine`, 1 min 30) : le film de l'application sous son nouveau nom, dans la lignée du « Fil d'or »
  (le fil et le point d'or, la charte, sans voix), monté sur les temps d'une musique libre de droits. Il va droit au
  métier : recherche de fonds, frais de gestion, questions à la fiche (ISIN, cut-off, SFDR, dépositaire, gérant), puis
  l'export Excel (champs Product Info, packs, style, téléchargement) et le fichier obtenu. Ni encours ni R-co Valor.
  Voir `JASMINE.md`.
- **« Entrée »** (`Nexus`, 2 min 15) : la publicité. Le clavier 3D de l'application seul pendant une minute, la touche
  Entrée sur l'explosion de la musique, puis l'application ; l'extraction JUMP tourne en parallèle. Voir `NEXUS.md`.

- **« Dix minutes »** (`DixMinutes`, 2 min 56) : le teaser avec voix off. Pendant qu'une extraction JUMP tourne, le film
  explique comment ça marche : les outils d'aujourd'hui (Product Info, JUMP, Centaure, Doc Info, Adjuto), Fabric qui
  réunit les données, l'application qui les lit sans les modifier et les met en forme. Il montre ensuite l'application
  en direct. Le compteur d'extraction court pendant tout le film ; à la fin, il n'en est qu'à un quart. Le film se termine sur le nom de l'application, **Nexus**. Le texte de la
  voix off est dans `VOIX_OFF.md`.
- **« Le fil d'or »** (`FilDor`, 55,8 s) : le premier film, sans voix, sur les données fictives (`STORYBOARD.md`).

## Les films rendus

| Fichier | Contenu |
|---|---|
| `rendus/matin.mp4`, `rendus/matin-leger.mp4` | « Le matin », pleine qualité et allégée |
| `rendus/jasmine.mp4`, `rendus/jasmine-leger.mp4` | « Jasmine », pleine qualité et allégée |
| `rendus/nexus.mp4`, `rendus/nexus-leger.mp4` | « Entrée », la publicité Nexus, pleine qualité et allégée |
| `rendus/dix-minutes.mp4` | « Dix minutes », pleine qualité (1920 × 1080, H.264, son AAC 320 kb/s, 71 Mo), voix off hors ligne affinée |
| `rendus/dix-minutes-leger.mp4` | La même vidéo allégée (23 Mo), pour l'envoyer par messagerie |

## Commandes

```console
npm i                      # dépendances
npm run dev                # Remotion Studio : aperçu interactif, une composition par scène dans « Scenes »
npx remotion render Jasmine out/jasmine.mp4 --codec=h264 --crf=17 --audio-codec=aac --audio-bitrate=320k
node record/recorder.mjs jcherche jfiche jexport   # prises du film « Jasmine »
npx remotion render DixMinutes out/dix-minutes.mp4 --codec=h264 --crf=17 --audio-codec=aac --audio-bitrate=320k
node record/recorder.mjs   # réenregistre les prises de l'application (application lancée sur APP_URL, Playwright requis)
python3 music/voiceover.py --compare   # comparatif de voix Azure (Rémy, Henri), sans toucher au film
python3 music/voiceover.py             # voix off Azure AI Speech si AZURE_SPEECH_KEY et AZURE_SPEECH_REGION sont définies,
                                       # sinon voix de travail hors ligne (KOKORO_DIR=<modèle>) ; vérifie que tout tient
                                       # dans les plans
KOKORO_DIR=<modèle> WHISPER_DIR=<whisper> python3 music/affiner_voix.py   # affine la voix hors ligne (variantes jugées par Whisper, traitement studio)
python3 music/echantillons.py   # une fois : instruments réels de la partition (.cache/, non versionné)
python3 music/teaser.py    # musique du teaser, jouée par ces instruments, effacée sous la voix (public/teaser.wav)
python3 music/mixage.py out/mix.wav   # bande son finale (musique + voix, rééchantillonnage sans souffle), à remonter sur la vidéo
python3 music/score.py     # musique du « Fil d'or » (public/music.wav)
```

Dans un environnement sans Chrome téléchargeable, ajoutez `--browser-executable=<chemin de chrome-headless-shell>`.

## Organisation

| Chemin | Rôle |
|---|---|
| `src/Video.tsx` | Le montage (`TransitionSeries`) et les durées des scènes |
| `src/scenes/S01…S10` | Une scène par fichier, chacune enregistrée comme composition dans Studio |
| `src/lib/chart.ts` | Échelles partagées par les scènes 3 et 4 : le zoom de l'une aboutit au cadrage de l'autre |
| `src/components/` | Fond, grain, repères de chapitre, mention « Données illustratives », balayage d'or |
| `src/data/sample.ts` | Chiffres d'exemple, générés une fois depuis le jeu **fictif** de l'application |
| `public/app/` | Captures de l'application sur ce même jeu fictif |
| `public/fonts/` | Polices de l'application (Instrument Serif, Inter Tight, JetBrains Mono, licence OFL), servies en local |
| `music/score.py` | Partition originale synthétisée, calée sur le montage, d'où `public/music.wav` |
| `src/matin/`, `public/matin/` | « Le matin » : actes I à III, bande son (`music/matin.py`), voix off hors ligne (`music/voix_matin.py`) |
| `src/jasmine/` | « Jasmine » : grille musicale (`timeline.ts`), logo qui se plie, caméra virtuelle sur les prises, plans 1 à 9 |
| `public/jasmine/` | Musique du film : « Fireworks », FreePD (domaine public, CC0), extrait de 86,8 s à 176,8 s |
| `src/nexus/` | « Entrée » : clavier 3D (three.js), actes I à III, minutage sur la grille de la musique |
| `src/teaser/` | « Dix minutes » : minutage (`timeline.ts`), actes I à III, plan « Comment ça marche », voix off et sous-titres |
| `record/` | Enregistreur de l'application en temps virtuel : 1/30 s exactement entre deux captures, donc des prises sans saccade |
| `public/rec/` | Les prises de l'application, sur son jeu de données fictif |
| `public/vo/`, `VOIX_OFF.md` | Voix off (Azure AI Speech, voix masculine fr-FR-RemyMultilingualNeural ; seul le texte de la voix off est envoyé au service) et texte minuté |
| `music/synth.py`, `music/teaser.py` | Mixage et réverbération ; partition du teaser, jouée par de vrais instruments échantillonnés (piano à queue Salamander d'Alexander Holm ; violons, violoncelle, contrebasse, harpe et cor de tonejs-instruments, Nicholaus Brosowsky ; licence CC-BY 3.0) |

## Règles

- **Aucune donnée réelle.** Tous les chiffres viennent du jeu synthétique de l'application, et chaque scène chiffrée
  porte la mention « Données illustratives, issues d'un jeu fictif ». Ne remplacez jamais `sample.ts` par un export
  Fabric. Seule exception, dans « Dix minutes » : l'encours (50,278 Md€) et R-co Valor (10 Md€), chiffres communiqués par
  la direction et signalés à l'écran comme tels (`src/teaser/timeline.ts`, `FACTS`). Les images de l'application portent
  la mention « jeu de données fictif ».
- **Hors ligne.** Polices et musique sont locales, le rendu n'appelle aucun service externe.
- **Si le montage change** (durées dans `src/Video.tsx`), reportez-les dans `music/score.py` puis régénérez la musique.
