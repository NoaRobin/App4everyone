# « Le matin » — film de 1 min 30 (composition `Matin`)

Un ton lourd, puis l'explosion. Chaque matin, on lance l'extraction JUMP et l'on attend ; la réponse existe déjà mais
elle est éparpillée (Product Info, JUMP, Centaure, Doc Info). Et si tout était au même endroit ? Relié dans Fabric :
une seule application, **Jasmine**. Puis ses plus beaux plans 3D, un cas pratique, l'export Excel, un final sur les
derniers accords. Et pendant ce film, JUMP n'aurait pas terminé.

- Sources : `src/matin/` (grille dans `timeline.ts`), éléments partagés avec « Jasmine » (`src/jasmine/kit.tsx`).
- Prises de l'application (`record/takes.mjs`, préfixe `m`) sur le **jeu de données fictif** ; clients synthétiques.
- Voix off : `music/voix_matin.py` — voix féminine Kokoro **hors ligne** (aucun envoi à un service externe),
  abaissée d'un ton et demi, phrase par phrase choisie à la retranscription (Whisper small).
- Bande son : `music/matin.py` → `public/matin/bande-son.wav` : tic-tac, graves et souffle de synthèse, musique
  « Driving Concern » (FreePD, domaine public CC0), explosion à 30 s, coupe invisible de 16 mesures, fin du morceau à
  1:21, puis silence et tic-tac. La musique s'efface de 7 dB sous la voix.

| Temps | Plan | Voix off |
|---|---|---|
| 0:00–0:12 | L'horloge, « Lancement de l'extraction JUMP », du lundi au vendredi | Chaque matin, à la même heure… on lance l'extraction. Et l'on attend. |
| 0:12–0:22 | Product Info, JUMP, Centaure, Doc Info : quatre fenêtres éparpillées | La réponse existe déjà. Mais elle est éparpillée. Dans Product Info… |
| 0:22–0:30 | Le schéma : les quatre sources reliées à Fabric, puis un point | Et si tout était au même endroit ? Relié, dans Fabric. Une seule application. |
| 0:30–0:34 | L'explosion : le jasmin, JASMINE | Jasmine. Et plus encore. |
| 0:34–0:49 | Douze plans 3D, une coupe tous les deux temps | — |
| 0:49–1:11 | Frais de gestion ; Article 8 × Italie × architecture ouverte × Thomas Delorme ; le fonds qui rapporte le plus ; qui y est investi | Les questions, une par plan |
| 1:11–1:15 | L'export, en accéléré, puis la feuille Excel | Jasmine travaille aussi. Vos fichiers Excel, en un clic. |
| 1:15–1:22 | Le couloir d'écrans, puis le logo sur les trois derniers accords | — |
| 1:22–1:30 | Silence, tic-tac, le compteur JUMP (≈ 14 %) | Pendant ce film… JUMP n'aurait pas terminé. Jasmine. Tout, au même endroit. |

```console
APP_URL=http://127.0.0.1:8011 node record/recorder.mjs msfdr mrank mcarnet mhome mcity mville mcourbe mglobe mpassif mcomp mclavier
KOKORO_DIR=<modèle> WHISPER_DIR=<whisper> python3 music/voix_matin.py && python3 music/matin.py
npx remotion render Matin out/matin.mp4 --gl=swangle --codec=h264 --crf=17 --audio-codec=aac --audio-bitrate=320k
```
