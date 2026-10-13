# Architecture

Trois parties qui se parlent peu : une coquille Android, une interface web, et des scripts de génération de
données qui ne tournent que sur l'ordinateur.

## La coquille Android (`src/fr/dabi/sinnoh/`)

Pas de Gradle, pas de bibliothèque : `scripts/build.sh` appelle directement `aapt`, `javac`, `d8` et
`apksigner`.

| Classe            | Rôle                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `MainActivity`    | Affiche l'interface dans un WebView plein écran, sert les fichiers de `assets/`, démarre et arrête le bridge |
| `MemoryBridge`    | Fil d'arrière-plan qui échantillonne le jeu et publie des instantanés JSON                                   |
| `BdspMemory`      | Sait où se trouve chaque donnée dans la mémoire de _Diamant Étincelant_ 1.3.0                                |
| `GdbClient`       | Client du protocole GDB, limité à la lecture                                                                 |
| `Pb8`             | Décode la structure d'un Pokémon stocké : déchiffrement, remise en ordre des blocs, somme de contrôle        |
| `Bytes`           | Lecture d'entiers petit-boutistes                                                                            |
| `BridgeException` | Lecture non fiable ; son message, en français, est montré au joueur                                          |

### Un WebView sans accès aux fichiers ni au réseau

`MainActivity` charge `https://sinnoh.local/index.html`. Ce domaine n'existe pas : chaque requête est
interceptée et servie depuis les `assets/` de l'APK. L'interface obtient ainsi un contexte web ordinaire
(`localStorage`, politique de sécurité du contenu) sans que l'accès aux fichiers soit ouvert.

- Toute requête vers une autre origine reçoit une réponse 404.
- La politique de sécurité de `index.html` interdit scripts en ligne et connexions sortantes
  (`connect-src 'none'`).
- Un lien `https` externe (une page source) s'ouvre dans le navigateur de la console, sur demande du joueur.
- Le débogage du WebView n'est actif que dans une construction `debug`.
- La sauvegarde automatique Android est désactivée (`allowBackup="false"`) : le carnet se sauvegarde par
  export.

### Les deux canaux entre le Java et l'interface

- **Interface → Java** : les boutons « Connecter » et « Déconnecter » sont des liens vers
  `https://sinnoh.local/bridge/connect` et `/bridge/disconnect`. `MainActivity` intercepte la navigation,
  vérifie qu'elle vient bien de sa propre page, et agit. Aucune interface JavaScript n'est exposée au WebView.
- **Java → interface** : chaque instantané est remis par `window.receiveBattleSnapshot(…)`.

## Le bridge mémoire

Eden embarque un serveur de débogage GDB. Le bridge s'y connecte en local (`127.0.0.1:6543`) et lit la
mémoire du jeu pendant qu'il tourne.

### Lecture seule, par construction

`GdbClient` ne laisse sortir que trois commandes : `qOffsets` (adresse de chargement du jeu), `m` (lecture
mémoire) et `c` (reprise). Tout le reste est rejeté avant d'atteindre la connexion : pas d'écriture, pas de
point d'arrêt, pas d'accès aux registres. Les adresses hors de l'espace utilisateur et les lectures de plus
de 4 096 octets sont refusées sans être envoyées.

Se connecter à un débogueur met le jeu en pause : le client envoie la reprise dès la connexion, et de nouveau
à la fermeture.

### Ce qui est lu

Toutes les adresses sont propres au profil validé : Eden Standard v0.2.1, CPU NCE, _Pokémon Diamant
Étincelant_ 1.3.0, identifiant de build `94CEAE325C205C4B9D6F7235552F28FD`. Les constantes sont nommées et
regroupées dans `BdspMemory`.

- **`PlayerWork`**, atteint par une chaîne de pointeurs depuis l'adresse de chargement : zone actuelle,
  masque des huit badges, Ligue terminée, Pokédex National, sac, équipe, et le drapeau `_isBattling`.
- **`BattleViewCore`**, retrouvé par les métadonnées de sa méthode singleton, mène au conteneur des Pokémon
  du combat. Les Pokémon **actifs** sont identifiés par les fenêtres de statut affichées à l'écran : le
  lecteur ne suppose pas que le premier du groupe est celui qui se bat.
- Pour chaque Pokémon actif : PV actuels et maximum, niveau, IV, statistiques de combat, types, variations.
  Surnom, sexe et attaques viennent du PB8 de la copie de combat, décodé une fois puis gardé en cache pour la
  durée du combat ; les PV et statistiques, eux, sont relus à chaque échantillon.

Les statistiques affichées sont les valeurs de base de combat, les variations étant données à part : ce n'est
pas un calcul de dégâts.

### Lire un jeu qui tourne

La mémoire change pendant la lecture. Plutôt que de publier une donnée douteuse, le bridge contrôle et
abandonne :

- le nom de classe IL2CPP de chaque objet clé est comparé à celui attendu ; un autre jeu ou une autre version
  donne l'erreur « Jeu/version non compatible », jamais une fiche ;
- les tailles de tableaux, les bornes (espèce, niveau, PV, quantités) et la somme de contrôle de chaque PB8
  sont vérifiées ;
- le drapeau de combat est relu après l'échantillon : un combat terminé pendant la lecture n'est pas affiché ;
- la zone est relue après le sac et l'équipe, pour détecter un changement de zone en cours de route.

Une lecture du monde qui échoue est signalée dans l'instantané sans interrompre le suivi du combat. Une
erreur de connexion ou de protocole ferme la connexion, puis le bridge réessaie deux secondes plus tard.

### Cadence et cycle de vie

Un échantillon toutes les 500 ms environ ; zone, sac et équipe ne sont relus que toutes les 2,5 secondes. Le
bridge s'arrête quand l'application passe en arrière-plan et reprend à son retour s'il était connecté. Côté
interface, un instantané de plus de dix secondes est considéré périmé et les données lues sont retirées.

### Instantané publié

```json
{
  "status": "battle",
  "timestamp": 1760000000000,
  "durationMs": 1500,
  "world": {
    "status": "live",
    "zoneId": 354,
    "badgeMask": 0,
    "badges": 0,
    "leagueCleared": false,
    "nationalDex": false,
    "items": { "4": 37 },
    "party": [{ "dex": 387, "nickname": "Rapidos", "heldItem": 0 }]
  },
  "player": [{ "dex": 387, "hp": 20, "maxHp": 23, "level": 6, "…": "…" }],
  "opponents": [
    {
      "dex": 399,
      "nickname": "Keunotor",
      "gender": 1,
      "heldItem": 0,
      "moves": [33, 45, 0, 0],
      "hp": 9,
      "maxHp": 16,
      "level": 3,
      "battleId": 12,
      "stats": [8, 7, 6, 7, 7],
      "ivs": [2, 25, 11, 2, 5, 28],
      "ranks": [0, 0, 0, 0, 0, 0, 0],
      "typeIds": [0, 0]
    }
  ]
}
```

`status` vaut `connecting`, `idle` (pas de combat), `battle`, `error` (nouvelle tentative en cours) ou `off`.
`stats` est dans l'ordre Attaque, Défense, Vitesse, Atq. Spé., Déf. Spé. ; `ivs` commence en plus par les PV.

### Explorer la mémoire

`tools/bridge-probe/` contient l'application de diagnostic autonome et un script Python qui ont servi à
établir ces adresses. Leurs résultats vont dans `tools/bridge-probe/captures/`, jamais versionné : ce sont
des extraits bruts de la mémoire du jeu.

## L'interface (`assets/`)

Des scripts classiques chargés dans l'ordre par `index.html`, qui partagent l'espace global. Il n'y a ni
module, ni empaqueteur, ni étape de compilation : ce qui est dans `assets/` est ce qui s'exécute.

| Fichier (`assets/js/`) | Rôle                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `html.js`              | L'étiquette de gabarit `html` (voir plus bas)                                                   |
| `default-config.js`    | Le parcours modèle chargé au premier lancement                                                  |
| `sprite-catalog.js`    | Les sprites choisis à la main pour ce parcours                                                  |
| `ui.js`                | Icônes, sprites, fiche d'un Pokémon du parcours                                                 |
| `battle.js`            | Onglet Combat et réception des instantanés du bridge                                            |
| `battle-guide.js`      | Lecture du potentiel et aide sur les statistiques                                               |
| `acquisition.js`       | Pokédex, objectifs, calcul des possibilités d'obtention, carte d'un objectif                    |
| `roadmap.js`           | Checklist                                                                                       |
| `context.js`           | Tableau _Ici_                                                                                   |
| `nearby-map.js`        | Carte des rencontres de la zone                                                                 |
| `app.js`               | État, validation, enregistrement, vues du carnet d'origine, tous les gestionnaires d'événements |

**Rendu.** Chaque vue est une fonction qui renvoie une chaîne HTML ; `render()` remplace le contenu de la
page, puis un petit nombre de gestionnaires délégués réagissent aux attributs `data-*`. Tout texte venant de
l'utilisateur ou de la mémoire du jeu passe par `esc()` avant d'entrer dans le HTML.

**Gabarits.** Les longs gabarits sont écrits sur plusieurs lignes avec l'étiquette `html` :

```js
return html`
  <div class="road-progress">
    <span>${done} / ${tasks.length} choses faites</span>
  </div>
`;
```

`html` supprime chaque retour à la ligne et l'indentation qui le suit : la mise en page du source n'atteint
jamais le DOM. Une espace qui compte doit donc rester à l'intérieur d'une ligne, jamais en début de ligne.
`html` n'échappe rien ; c'est le rôle de `esc()`.

**État.** Un seul objet `state`, enregistré dans `localStorage` sous la clé `sinnoh-v1`. `validate()` et
`validateConfig()` reconstruisent un état sûr à partir de n'importe quelle entrée : c'est par elles que
passent le chargement comme les imports.

## Les données (`catalog/`)

Voir [DONNEES.md](DONNEES.md). Les scripts Python lisent les sources, écrivent un JSON lisible dans
`catalog/` et sa copie compacte dans `assets/data/`. Ils ne sont pas nécessaires pour construire l'APK : les
fichiers générés sont versionnés.

## Tests

| Dossier          | Lancement              | Principe                                                                                        |
| ---------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `tests/unit/`    | `npm run test:unit`    | Charge les scripts de lecture des IV dans une machine virtuelle Node                            |
| `tests/webview/` | `npm run test:ui`      | Pilote l'interface réelle par le protocole Chrome DevTools                                      |
| `tests/bridge/`  | `npm run test:bridge`  | Lance le vrai `MemoryBridge` contre un faux serveur GDB qui sert une mémoire de jeu synthétique |
| `catalog/`       | `npm run test:catalog` | Contrôle le catalogue généré et les parseurs                                                    |
| `tests/device/`  | à la main              | Contrôle pendant un combat réel sur la console                                                  |

### Tests d'interface : ordinateur ou console

`tests/lib/webview.mjs` ouvre une session sur le carnet et fournit `evaluate`, `check` et `reload`. Par
défaut, il sert `assets/` sur un port local et lance un Chrome sans fenêtre à la taille de l'écran de la Thor
(538 × 469). Chaque scénario enregistre le carnet avant de commencer et le restaure à la fin, même en cas
d'échec.

Les mêmes scénarios tournent sur le **vrai WebView de la console**. Il faut une construction `debug` :

```bash
bash scripts/build.sh debug && CARNET_DISPLAY=4 bash scripts/install.sh
```

```bash
eval "$(bash scripts/forward-devtools.sh)"
```

```bash
npm run test:ui
```

`forward-devtools.sh` redirige le port de débogage du WebView et définit `CARNET_DEVTOOLS`. Ne touchez pas au
carnet pendant l'exécution : les scénarios remplacent temporairement son contenu. Réinstallez ensuite une
construction normale, qui n'est pas débogable.

### Tests du bridge : un faux Eden

`tests/bridge/` ne demande ni console ni émulateur. `BdspImage` construit en mémoire les objets que le bridge
parcourt (aucune donnée du jeu n'y figure), `Pb8Fixture` fabrique et chiffre des Pokémon, et `FakeGdbServer`
sert le tout sur une vraie connexion TCP. Le bridge testé est exactement celui de l'APK.

Le serveur enregistre chaque commande reçue : un test vérifie que le bridge n'envoie jamais autre chose que
`qOffsets`, des lectures et des reprises.

`MainActivity` est la seule classe hors de portée de ces tests, car elle dépend du framework Android.

## Mise en forme du code

```bash
npm run format
```

[Prettier](https://prettier.io/) met en forme JavaScript, CSS, HTML, Java et Markdown ; les scripts Python
suivent `ruff format --line-length 110`. Les fichiers générés sont exclus (`.prettierignore`). Le formatage
des gabarits `html` par Prettier est désactivé (`embeddedLanguageFormatting`), car il modifierait leurs
espaces.
