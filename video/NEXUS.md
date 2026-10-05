# « Entrée » — la publicité Nexus

Composition `Nexus` (2 min 15, 4 050 images à 30 i/s), dans `src/nexus/`. « Dix minutes » reste inchangé.

## L'idée

Pendant la première minute, on ne voit pas l'application : seulement son clavier 3D, filmé comme un objet, en
cinémascope, dans le noir. Les questions de tous les jours s'y tapent ; cinq touches se détachent et portent le nom des
outils d'aujourd'hui (Product Info, JUMP, Centaure, Doc Info, Adjuto) ; des fils d'or les réunissent (Fabric) ; elles
reprennent leur place. La caméra plonge vers la touche Entrée, qui s'enfonce exactement sur l'explosion de la musique :
le cadre s'ouvre, l'application déferle. Une extraction JUMP tourne pendant tout le film (le compteur vit dans la bande
noire, puis en bas de l'écran) ; à la fin, elle n'en est qu'à 18 % — l'application, elle, a tout montré. Les touches
N, E, X, U, S se lèvent du clavier et écrivent le nom.

## Le découpage (une mesure = 1,5 s = 45 images, `src/nexus/timeline.ts`)

| Mesures | Plan |
|---|---|
| 0–8 | La lumière rasante révèle les touches |
| 8–16 | « Où en est l'encours ? », « Qui détient nos fonds ? » se tapent |
| 16–26 | Cinq touches se détachent : les outils, nommés un par un sur le temps |
| 26–34 | Fils d'or vers Fabric ; les touches reprennent leur place |
| 34–40 | « R-co Valor » ; plongée vers Entrée |
| 40 | Entrée, l'onde de choc, le cadre s'ouvre |
| 41–72 | 50,3 Md€ · encours · R-co Valor (la touche V devient une tour) · revenus · distribution · passif · performances · fiche |
| 72–77 | Le compte : l'extraction n'a pas fini |
| 77–90 | N, E, X, U, S ; « Toutes les informations métiers. Au même endroit. » ; signature ; « Bientôt. » |

## Voix off (voix féminine Kokoro, comme « Dix minutes »)

| Début | Durée | Fichier | Texte |
|---|---|---|---|
| 0:02.27 | 2.1 s | `nexus/vo/question.wav` | Chaque jour, on pose les mêmes questions. |
| 0:25.50 | 2.8 s | `nexus/vo/disperse.wav` | Les réponses existent. Mais elles sont dispersées. |
| 0:31.50 | 1.1 s | `nexus/vo/outil-1.wav` | Product Info. |
| 0:33.00 | 0.8 s | `nexus/vo/outil-2.wav` | JUMP. |
| 0:34.50 | 1.0 s | `nexus/vo/outil-3.wav` | Centaure. |
| 0:36.00 | 1.1 s | `nexus/vo/outil-4.wav` | Doc Info. |
| 0:37.50 | 1.0 s | `nexus/vo/outil-5.wav` | Adjuto. |
| 0:40.50 | 1.8 s | `nexus/vo/fabric.wav` | Fabric les réunit, chaque jour. |
| 0:45.00 | 3.3 s | `nexus/vo/nexus-lit.wav` | Nexus les lit, sans jamais les modifier, et les met en forme. |
| 0:53.27 | 1.4 s | `nexus/vo/touche.wav` | Il ne reste qu'une touche. |
| 1:02.27 | 1.9 s | `nexus/vo/encours.wav` | Cinquante milliards d'euros d'encours. |
| 1:07.50 | 1.3 s | `nexus/vo/courbe.wav` | Jour après jour. |
| 1:12.73 | 1.6 s | `nexus/vo/valor.wav` | R-co Valor : dix milliards. |
| 1:18.73 | 1.7 s | `nexus/vo/revenus.wav` | Ce qui nous fait gagner le plus. |
| 1:24.73 | 1.4 s | `nexus/vo/pays.wav` | Nos fonds, pays par pays. |
| 1:30.73 | 1.2 s | `nexus/vo/passif.wav` | Et qui les détient. |
| 1:36.73 | 2.0 s | `nexus/vo/perf.wav` | Leurs performances, côte à côte. |
| 1:42.73 | 1.8 s | `nexus/vo/fiche.wav` | Et la réponse, sur chaque fiche. |
| 1:48.73 | 3.2 s | `nexus/vo/compte.wav` | Pendant ce film, une extraction JUMP n'aurait pas fini. |
| 1:53.27 | 2.2 s | `nexus/vo/montre.wav` | L'application, elle, vous a tout montré. |
| 2:03.00 | 0.8 s | `nexus/vo/nom.wav` | Nexus. |
| 2:05.27 | 2.6 s | `nexus/vo/signature.wav` | Toutes les informations métiers. Au même endroit. |

## Son

- Musique : « From Page to Practice », FreePD (miroir github.com/0lhi/FreePD), domaine public CC0 — aucune
  attribution exigée. Choisie pour sa courbe : introduction douce, montée d'une minute, explosion à 1:00 (mesure 40),
  retour au piano à 1:48.
- `python3 music/voix_nexus.py` (KOKORO_DIR, WHISPER_DIR) puis `python3 music/mixage_nexus.py` → `public/nexus/bande-son.wav`.

## Rendu

```console
npx remotion render Nexus out/nexus.mp4 --gl=swangle --concurrency=4 --codec=h264 --crf=17 --audio-codec=aac --audio-bitrate=320k
```

Le clavier 3D est rendu par three.js (`@remotion/three`) ; sans carte graphique, `--gl=swangle` (rendu logiciel).
