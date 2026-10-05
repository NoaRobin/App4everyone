# Voix off — « Dix minutes »

Texte définitif de la voix off, avec le minutage du montage (`src/teaser/vo.json`). Voix de diffusion : Azure AI Speech,
voix masculine `fr-FR-RemyMultilingualNeural`, débit posé et registre grave (`python3 music/voiceover.py`, avec
`AZURE_SPEECH_KEY` et `AZURE_SPEECH_REGION`). Sans clé, la voix est produite hors ligne (Kokoro, voix française) puis affinée par `music/affiner_voix.py` : pour chaque phrase, plusieurs graphies et débits sont essayés, une reconnaissance vocale (Whisper) retient la plus intelligible, et un traitement studio discret est appliqué. L'erreur de retranscription passe de 12,1 % à 5,7 %. Un comédien peut
aussi enregistrer ce texte phrase par phrase et déposer les fichiers dans `public/vo/` sous les mêmes noms.

Ton : posé, chaleureux, sans emphase publicitaire ; un léger sourire sur « Et si tout était déjà là ? » et sur la dernière
phrase du compte. Prononciations : JUMP « djeump », R-co « ère-co », Rothschild & Co « Rotchild and Co ».

| Début | Durée max. | Plan | Fichier | Texte |
|---|---|---|---|---|
| 0:00.60 | 1.7 s | Lancement | `vo/launch-0.wav` | Chaque matin, la même scène. |
| 0:02.57 | 1.9 s | Lancement | `vo/launch-1.wav` | On lance une extraction JUMP. |
| 0:04.73 | 1.4 s | Lancement | `vo/launch-2.wav` | Dix minutes d'attente. |
| 0:07.80 | 1.6 s | Le rituel | `vo/ritual-0.wav` | Pendant ce temps, on cherche. |
| 0:09.70 | 1.7 s | Le rituel | `vo/ritual-1.wav` | Une fiche dans Product Info. |
| 0:11.73 | 1.7 s | Le rituel | `vo/ritual-2.wav` | Un document dans Doc Info. |
| 0:13.70 | 1.9 s | Le rituel | `vo/ritual-3.wav` | Puis Centaure, puis Adjuto. |
| 0:15.87 | 2.5 s | Le rituel | `vo/ritual-4.wav` | Chaque outil détient une partie de la réponse. |
| 0:21.87 | 1.6 s | La rupture | `vo/rupture-0.wav` | Et si tout était déjà là ? |
| 0:26.53 | 1.8 s | Comment ça marche | `vo/fabric-0.wav` | Toutes ces données existent déjà. |
| 0:28.60 | 4.1 s | Comment ça marche | `vo/fabric-1.wav` | Elles sont réunies dans Fabric, la plateforme de données de Microsoft : |
| 0:32.97 | 2.4 s | Comment ça marche | `vo/fabric-2.wav` | un seul endroit, mis à jour chaque jour. |
| 0:36.00 | 3.3 s | Comment ça marche | `vo/fabric-3.wav` | Notre application lit ces données, sans jamais les modifier. |
| 0:39.57 | 2.7 s | Comment ça marche | `vo/fabric-4.wav` | Elle les relie, les calcule, et les met en forme. |
| 0:45.87 | 3.4 s | Manifeste | `vo/manifesto-0.wav` | Résultat : toutes les informations métiers, au même endroit. |
| 0:57.00 | 3.6 s | 50,3 Md€ | `vo/aum-0.wav` | Plus de cinquante milliards d'euros d'encours, suivis au jour le jour. |
| 1:06.13 | 2.8 s | R-co Valor | `vo/valor-0.wav` | Notre plus gros fonds, R-co Valor : dix milliards. |
| 1:09.27 | 1.6 s | R-co Valor | `vo/valor-1.wav` | Près d'un euro sur cinq. |
| 1:16.00 | 3.9 s | Courbe des encours | `vo/courbe-0.wav` | L'encours de chaque fonds, par jour, par semaine, par mois ou par année. |
| 1:20.17 | 1.1 s | Courbe des encours | `vo/courbe-1.wav` | En un clic. |
| 1:28.33 | 1.9 s | Revenus | `vo/revenus-0.wav` | Les fonds qui nous font gagner le plus, |
| 1:30.53 | 3.2 s | Revenus | `vo/revenus-1.wav` | estimés à partir des encours et des frais de gestion. |
| 1:39.33 | 3.0 s | Distribution | `vo/distribution-0.wav` | Où chaque fonds est autorisé à la vente, pays par pays, |
| 1:42.60 | 1.2 s | Distribution | `vo/distribution-1.wav` | et pour quels clients. |
| 1:49.80 | 3.9 s | Passif | `vo/passif-0.wav` | Qui détient nos fonds : par type de client, par teneur de compte, par pays. |
| 2:00.00 | 3.7 s | Performance | `vo/perf-0.wav` | Les performances, comparées côte à côte, sur la même période. |
| 2:08.73 | 2.4 s | Recherche | `vo/search-0.wav` | Plus besoin de chercher dans Product Info. |
| 2:12.00 | 3.6 s | Recherche | `vo/search-1.wav` | Une question sur un fonds ? Les frais, le dépositaire, un pays ? |
| 2:17.07 | 2.9 s | Recherche | `vo/search-2.wav` | La réponse s'affiche, directement sur la fiche. |
| 2:21.27 | 0.9 s | Le mur | `vo/wall-0.wav` | Encours. |
| 2:22.27 | 0.8 s | Le mur | `vo/wall-1.wav` | Revenus. |
| 2:23.27 | 1.2 s | Le mur | `vo/wall-2.wav` | Distribution. |
| 2:24.27 | 0.9 s | Le mur | `vo/wall-3.wav` | Passif. |
| 2:25.27 | 1.1 s | Le mur | `vo/wall-4.wav` | Performance. |
| 2:26.47 | 1.1 s | Le mur | `vo/wall-5.wav` | Tout est relié. |
| 2:30.33 | 3.2 s | Le compte | `vo/count-0.wav` | Pendant ce film, une extraction JUMP n'aurait pas fini. |
| 2:35.53 | 2.3 s | Le compte | `vo/count-1.wav` | L'application, elle, vous a tout montré. |
| 2:41.80 | 2.5 s | Signature | `vo/sign-0.wav` | Rothschild & Co Asset Management. |
| 2:44.20 | 2.7 s | Signature | `vo/sign-1.wav` | Toutes les informations métiers, au même endroit. |

Durée totale du film : 2:56.00 (5280 images à 30 i/s). Le film se termine sur le nom de l'application, Nexus (sans voix).
