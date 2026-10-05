# « Le fil d'or » — vidéo de présentation

Vidéo Remotion de **Rothschild & Co Asset Management** : 55,8 s, 1920 × 1080, 30 i/s. Le storyboard est dans
`STORYBOARD.md` et la charte dans `src/theme.ts`.

## Commandes

```console
npm i                      # dépendances
npm run dev                # Remotion Studio : aperçu interactif, une composition par scène dans « Scenes »
npx remotion render FilDor out/fil-dor.mp4 --codec=h264 --crf=16 --audio-codec=aac --audio-bitrate=320k
python3 music/score.py     # régénère public/music.wav (numpy requis)
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

## Règles

- **Aucune donnée réelle.** Tous les chiffres viennent du jeu synthétique de l'application, et chaque scène chiffrée
  porte la mention « Données illustratives, issues d'un jeu fictif ». Ne remplacez jamais `sample.ts` par un export
  Fabric.
- **Hors ligne.** Polices et musique sont locales, le rendu n'appelle aucun service externe.
- **Si le montage change** (durées dans `src/Video.tsx`), reportez-les dans `music/score.py` puis régénérez la musique.
