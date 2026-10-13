# Données

L'application n'interroge aucun service : tout ce qu'elle affiche est embarqué dans l'APK. Ce document décrit
d'où viennent ces données, sous quelles conditions elles sont redistribuées, et comment les régénérer.

## Fichiers

| Fichier lisible (`catalog/`) | Copie embarquée (`assets/data/`) | Contenu                                                                   |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| `bdsp-catalog.json`          | `acquisition-catalog.js`         | 493 espèces, 1 955 rencontres, 246 relations d'évolution, 130 lieux       |
| `battle-guide.json`          | `battle-guide-data.js`           | Profil de 493 espèces pour la lecture des IV, catégorie de chaque attaque |
| `context-catalog.json`       | `context-catalog.js`             | 16 conseils de l'onglet _Ici_, noms français des objets                   |
| `zone-catalog.json`          | `zone-catalog.js`                | 572 zones du jeu reliées à leur nom de lieu français                      |
| `map-anchors.json`           | (fusionné dans le catalogue)     | Position approximative de chaque lieu sur la carte, écrite à la main      |
| —                            | `battle-dex.js`                  | Noms et types des espèces, attaques, table des types                      |

Les fichiers de `assets/data/` sont **générés** : on ne les modifie pas à la main, on relance les scripts.
Seul `battle-dex.js` n'a pas de générateur dans ce dépôt ; il a été produit une fois à partir des tables CSV
de PokeAPI.

Dans `bdsp-catalog.json`, `species[].encounters[].placeId` renvoie à `places`, dont le champ `map` porte les
repères, leur précision et leurs limites. `evolutions` et `evolvesFrom` décrivent les relations et leurs
conditions ; `alternatives` couvre la reproduction et le transfert. Les deux versions du jeu sont conservées
dans les données ; l'interface filtre _Diamant Étincelant_.

## Sources et licences

| Source                                                                                           | Ce qui en vient                                                                             | Conditions                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [Poképédia](https://www.pokepedia.fr/)                                                           | Localisations (module Lua de données BDSP), conditions d'évolution, exclusivités de version | [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/deed.fr), attribution à Poképédia et ses contributeurs |
| [PokeAPI](https://github.com/PokeAPI/pokeapi)                                                    | Noms, types, statistiques de base, attaques, liens parent/enfant des évolutions, sprites    | Voir le dépôt PokeAPI                                                                                                      |
| [Pokébip](https://www.pokebip.com/)                                                              | Référence des conseils de l'onglet _Ici_                                                    | Seuls des faits reformulés et un lien vers la page sont repris ; aucun texte n'est copié                                   |
| [Luminescent Team](https://teamlumi.github.io/luminescent-team-dev/rom-hacking/dictionary/zones) | Dictionnaire des identifiants de zones (`catalog/sources/bdsp-zones.json`)                  | Table factuelle                                                                                                            |
| [Bulbagarden Archives](https://archives.bulbagarden.net/wiki/File:Sinnoh_BDSP.png)               | Fond de la carte                                                                            | Image protégée, non redistribuée ici                                                                                       |

**Conséquence pour une réutilisation.** `bdsp-catalog.json` et `acquisition-catalog.js` dérivent de Poképédia :
ils ne peuvent être redistribués qu'avec l'attribution, sans usage commercial, et sous la même licence. Chaque
entrée garde l'adresse de sa page source et, quand elle existe, le numéro de révision utilisé.

Les copies des pages téléchargées restent dans `catalog/cache/`, qui n'est ni versionné ni embarqué dans
l'APK.

## Régénérer le catalogue

```bash
python3 -m pip install -r catalog/requirements.txt
```

```bash
python3 catalog/refresh_catalog.py            # réutilise le cache local s'il existe
```

```bash
python3 catalog/refresh_catalog.py --refresh  # interroge les sources actuelles
```

```bash
npm run test:catalog
```

Sans `--refresh`, le résultat est reproductible : mêmes entrées, mêmes sorties, à l'horodatage
`retrievedAt` près. Avec `--refresh`, relisez le résultat : les sources ont pu changer de format, et les
tests signalent les régressions les plus visibles.

Reconstruisez ensuite l'APK (`bash scripts/build.sh`).

Les scripts, dans l'ordre où `refresh_catalog.py` les enchaîne :

| Script                  | Rôle                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `build_catalog.py`      | Lit le module de localisations de Poképédia et normalise chaque rencontre                      |
| `enrich_catalog.py`     | Ajoute évolutions, reproduction et transfert, taux par version, exclusivités, repères de carte |
| `build_battle_guide.py` | Calcule le profil de chaque espèce à partir des statistiques de base                           |
| `build_context.py`      | Produit les zones nommées et les conseils de l'onglet _Ici_                                    |

Pour **déplacer un repère** de la carte, modifiez ses coordonnées (en pourcentages de l'image) dans
`catalog/map-anchors.json`, puis relancez `refresh_catalog.py`.

## Précautions prises à l'extraction

- **Aucun code récupéré n'est exécuté.** Le module de Poképédia est une table Lua ; le parseur n'accepte que
  des valeurs littérales et rejette tout le reste, appels de fonction compris. Un test le vérifie.
- **Les exclusivités sont recoupées.** Les étiquettes de version du module sont comparées au tableau des
  différences entre versions de la page du jeu. Les incohérences sont corrigées et tracées
  (`sourceConsistency`, `issues`). C'est ce qui évite de proposer Feuforêve en capture directe dans
  _Diamant Étincelant_.
- **Les taux restent séparés** par version et par moment de la journée.
- **Les trous sont explicites.** Une évolution dont la condition n'a pas pu être lue est gardée avec la
  mention « à vérifier » plutôt que supprimée.

## Limites

- Le catalogue est un instantané daté (champ `retrievedAt`), qui ne se met pas à jour depuis l'application.
- 16 évolutions ont une condition qui mêle plusieurs jeux ou demande une vérification : champ `needsReview`,
  liste `coverage.reviewEvolutions`. L'interface le signale.
- Les prérequis extraits des méthodes de rencontre ne forment pas un inventaire complet des conditions
  d'accès aux lieux.
- Les méthodes passant par Pokémon HOME concernent les jeux officiels ; l'application n'apporte ni HOME ni
  échange en réseau à l'émulateur.
- Les repères de carte sont des annotations approximatives de l'image, pas des coordonnées du jeu. Les
  Pokémon nomades n'ont volontairement aucun point.
- Le profil de combat est une heuristique : rôle physique, spécial, mixte ou défensif déduit des statistiques
  de base des évolutions finales, moyennées quand la famille a plusieurs branches. Formes par défaut
  uniquement.
- Le parcours modèle (`assets/js/default-config.js`) a été rédigé à partir de guides communautaires et peut
  contenir des erreurs.
