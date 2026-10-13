# Carnet Sinnoh

[![Tests](https://github.com/DabiK/carnet-sinnoh/actions/workflows/tests.yml/badge.svg)](https://github.com/DabiK/carnet-sinnoh/actions/workflows/tests.yml)

Un compagnon Android **hors ligne** pour _Pokémon Diamant Étincelant_, pensé pour l'écran du bas d'une
console à double écran comme l'[AYN Thor](https://www.ayntec.com/) : le jeu tourne en haut dans l'émulateur
[Eden](https://eden-emu.dev/), le carnet reste ouvert en bas.

Il répond à trois questions pendant la partie : **où trouver ce Pokémon**, **que faire ici**, et **que vaut
celui que j'ai en face**.

> Projet personnel de fan, non officiel, sans lien avec Nintendo, Creatures, GAME FREAK ou The Pokémon Company.
> Le dépôt ne contient ni jeu, ni clé. Les sprites et la carte de Sinnoh qu'il embarque restent la propriété de
> leurs ayants droit. Voir [Crédits et licences](#crédits-et-licences).

## Ce que fait l'application

| Onglet      | Rôle                                                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Quêtes**  | _Ici_ : rencontres, objets et services utiles dans la zone actuelle. _Checklist_ : les étapes vers l'équipe visée. _Mes Pokémon_ : les objectifs choisis. |
| **Carte**   | Toutes les rencontres documentées de la zone actuelle, avec méthode, niveaux et taux par horaire. Carte des lieux d'obtention d'un objectif.              |
| **Pokédex** | Les 493 espèces jusqu'à la 4ᵉ génération. « Je veux ce Pokémon » génère les possibilités d'obtention et les étapes d'évolution.                           |
| **Combat**  | Fiche du Pokémon adverse pendant le combat : PV, statistiques, IV, attaques, faiblesses, et une lecture du potentiel pour débutant.                       |
| **Carnet**  | Objectifs personnels, notes, badges, export et restauration en JSON, configuration complète du parcours.                                                  |

Les onglets _Ici_, _Carte_ et _Combat_ peuvent se remplir tout seuls grâce au **bridge mémoire** : l'application
lit, en lecture seule, la mémoire du jeu à travers le débogueur d'Eden, directement sur la console. Le bridge
est facultatif et expérimental ; sans lui, tout fonctionne en saisie manuelle.

## Comment ça marche

```
┌──────────────── console Android ────────────────┐
│                                                 │
│  Eden (émulateur)          Carnet Sinnoh (APK)  │
│  ┌───────────────┐         ┌──────────────────┐ │
│  │ jeu en cours  │  GDB    │ MemoryBridge     │ │
│  │ stub GDB :6543│◄────────│ (Java, lecture   │ │
│  └───────────────┘ lecture │  seule)          │ │
│                    seule   │        │ JSON    │ │
│                            │        ▼         │ │
│                            │ WebView : assets/│ │
│                            │ (HTML, CSS, JS)  │ │
│                            └──────────────────┘ │
└─────────────────────────────────────────────────┘

  catalog/*.py ──► assets/data/*.js      (sur l'ordinateur, à la construction)
  Poképédia, PokeAPI      catalogue embarqué dans l'APK
```

- **`src/`** : une activité Android minimale qui affiche l'interface dans un WebView et héberge le bridge.
- **`assets/`** : l'interface, en HTML/CSS/JavaScript sans dépendance ni étape de compilation.
- **`catalog/`** : les scripts Python qui produisent le catalogue de données embarqué.

Aucun serveur, aucun compte, aucune requête réseau depuis l'application : la permission `INTERNET` ne sert qu'à
la connexion locale à Eden. Détails dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Démarrage rapide

Il faut un JDK et le SDK Android en ligne de commande. Le
**[tutoriel d'installation](docs/INSTALLATION.md)** détaille chaque étape, de l'ordinateur vierge à la console.

```bash
git clone https://github.com/DabiK/carnet-sinnoh.git
cd carnet-sinnoh
bash scripts/build.sh     # produit build/carnet-sinnoh.apk
bash scripts/install.sh   # l'installe sur la console branchée en USB
```

Pour seulement jeter un œil à l'interface, sans Android :

```bash
python3 -m http.server --directory assets 8000
```

puis ouvrir <http://localhost:8000/index.html>. Le bouton « Connecter » du bridge n'a d'effet que dans
l'application.

## Documentation

| Document                                     | Contenu                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Prérequis, construction, installation sur la console, activation du bridge |
| [docs/UTILISATION.md](docs/UTILISATION.md)   | Les onglets, la configuration du carnet, la sauvegarde                     |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Organisation du code, fonctionnement du bridge, tests                      |
| [docs/DONNEES.md](docs/DONNEES.md)           | Sources, licences, régénération du catalogue, limites des données          |

## Tests

```bash
npm install   # une fois : installe Prettier, seule dépendance de développement
npm test
```

| Suite                  | Ce qu'elle vérifie                                                                                | Besoin             |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ------------------ |
| `npm run test:unit`    | Les règles de lecture des IV (15 contrôles)                                                       | Node.js            |
| `npm run test:ui`      | L'interface réelle dans un Chrome sans fenêtre, à la taille de l'écran de la Thor (122 contrôles) | Chrome             |
| `npm run test:bridge`  | Le bridge complet contre un faux Eden et une mémoire de jeu synthétique (20 tests)                | JDK                |
| `npm run test:catalog` | La cohérence du catalogue et le refus d'exécuter du Lua (9 tests)                                 | Python, `requests` |

Les tests d'interface se rejouent à l'identique sur le vrai WebView de la console : voir
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#tests).

## Organisation du dépôt

```
AndroidManifest.xml, res/   manifeste et icône de l'application
src/fr/dabi/sinnoh/         code Java : activité, bridge mémoire, client GDB, décodeur PB8
assets/                     interface web embarquée
  js/                       code écrit à la main
  data/                     catalogues générés par catalog/ (ne pas modifier à la main)
  css/, fonts/
catalog/                    génération des données depuis Poképédia et PokeAPI
scripts/                    construction, installation, récupération des images, tests du bridge
tests/                      tests unitaires, d'interface, du bridge, et contrôle manuel en combat réel
tools/bridge-probe/         application et script de diagnostic pour explorer la mémoire
docs/                       documentation
```

## Limites connues

- Le bridge est validé pour **un seul profil** : Eden v0.2.1, Pokémon Diamant Étincelant **1.3.0**. Toute autre
  version est refusée avec un message d'erreur plutôt que d'afficher des données fausses. Perle Scintillante
  n'est pas validée.
- Combats doubles, changements de Pokémon et transformations n'ont pas été vérifiés en jeu.
- Le débogueur d'Eden écoute sur toutes les interfaces réseau et autorise l'écriture mémoire, même si le
  carnet ne fait que lire en local : ne l'activez que sur un réseau de confiance.
  [Détails](docs/INSTALLATION.md#5-facultatif--activer-le-bridge-mémoire).
- Les repères de la carte sont régionaux et approximatifs, pas des positions exactes.
- Le catalogue est un instantané hors ligne daté ; 16 conditions d'évolution restent marquées « à vérifier ».
- L'interface est en français et filtre les rencontres de Diamant Étincelant.

## Crédits et licences

- **Données de localisation et d'évolution** : [Poképédia](https://www.pokepedia.fr/) et ses contributeurs,
  sous licence [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/deed.fr). Les fichiers
  dérivés (`catalog/bdsp-catalog.json`, `assets/data/acquisition-catalog.js`) sont redistribués sous cette
  même licence : attribution, pas d'usage commercial, partage dans les mêmes conditions.
- **Noms, statistiques, attaques et sprites** : [PokeAPI](https://pokeapi.co/).
- **Conseils de l'onglet _Ici_** : fiches rédigées pour l'application, avec lien vers les pages de
  [Pokébip](https://www.pokebip.com/) qui ont servi de référence.
- **Police** : Nunito, sous licence OFL (`assets/fonts/OFL.txt`).
- **Images** : les sprites (PokeAPI, Poképédia) et les cartes de Sinnoh (Bulbagarden Archives, Poképédia)
  appartiennent à leurs ayants droit. Elles sont incluses pour que l'application fonctionne telle quelle, sans
  aucune licence accordée sur elles, et seront retirées sur simple demande.

Le détail des sources est dans [NOTICE.md](NOTICE.md) et [docs/DONNEES.md](docs/DONNEES.md). Le code n'a pas
encore de licence explicite : en l'absence de fichier `LICENSE`, tous les droits sont réservés par l'auteur.

Pokémon et les noms de personnages Pokémon sont des marques de Nintendo.
