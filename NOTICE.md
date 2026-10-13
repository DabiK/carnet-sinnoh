# Attributions

Carnet Sinnoh est un projet de fan non officiel. Il n'est ni affilié à Nintendo, Creatures Inc., GAME FREAK
inc. ou The Pokémon Company, ni approuvé par eux. Pokémon et les noms de personnages Pokémon sont des marques
de Nintendo.

Ce dépôt ne contient aucun jeu, aucune clé, aucune sauvegarde et aucun extrait de la mémoire du jeu.

## Données redistribuées

### Poképédia — CC BY-NC-SA 3.0

`catalog/bdsp-catalog.json` et `assets/data/acquisition-catalog.js` sont dérivés de
[Poképédia](https://www.pokepedia.fr/) : module de localisations de _Pokémon Diamant Étincelant et Perle
Scintillante_, tableaux d'évolution des fiches d'espèces, tableau des exclusivités de version.

Ces contenus sont l'œuvre de Poképédia et de ses contributeurs, publiés sous licence
[Creative Commons Attribution – Pas d'Utilisation Commerciale – Partage dans les Mêmes Conditions 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/deed.fr).
Les deux fichiers dérivés sont redistribués sous cette même licence. Ils ont été restructurés et recoupés ;
chaque entrée conserve l'adresse de sa page source.

### PokeAPI

`assets/data/battle-dex.js`, `catalog/battle-guide.json` et `assets/data/battle-guide-data.js` sont dérivés
des tables de [PokeAPI](https://github.com/PokeAPI/pokeapi) : noms français, types, statistiques de base,
attaques, liens de parenté entre espèces.

### Autres références

- `catalog/sources/bdsp-zones.json` : dictionnaire des zones documenté par la
  [Luminescent Team](https://teamlumi.github.io/luminescent-team-dev/rom-hacking/dictionary/zones).
- `catalog/sources/items-fr.txt` : noms français des objets, dans l'ordre des identifiants du jeu.
- `catalog/context-catalog.json` : fiches rédigées pour l'application. Chacune renvoie à la page de
  [Pokébip](https://www.pokebip.com/) qui a servi de référence ; aucun texte de ces pages n'est repris.

## Police

`assets/fonts/Nunito.ttf` : Nunito, sous [SIL Open Font License 1.1](assets/fonts/OFL.txt).

## Images

Les sprites des Pokémon et les cartes de Sinnoh sont des œuvres protégées de Nintendo, Creatures Inc. et GAME
FREAK inc. Ils sont inclus pour que l'application fonctionne telle quelle, dans un cadre personnel et non
commercial. Aucune licence n'est accordée sur ces fichiers, et ils seront retirés sur simple demande de leurs
ayants droit.

- `assets/sprites/` : sprites de _Pokémon Diamant et Perle_, tels que distribués par
  [PokeAPI/sprites](https://github.com/PokeAPI/sprites) ; dix-huit d'entre eux viennent de
  [Poképédia](https://www.pokepedia.fr/) (liste dans `assets/js/sprite-catalog.js`).
- `assets/sinnoh-2d.png` : carte de Sinnoh de _Diamant Étincelant et Perle Scintillante_, via
  [Bulbagarden Archives](https://archives.bulbagarden.net/wiki/File:Sinnoh_BDSP.png).
- `assets/sinnoh.png` : illustration de Sinnoh, via
  [Poképédia](https://www.pokepedia.fr/Fichier:Sinnoh-DEPS.png).

`scripts/fetch-assets.mjs` retélécharge les sprites et l'illustration depuis ces sources.
