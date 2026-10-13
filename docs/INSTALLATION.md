# Tutoriel d'installation

Deux chemins, selon ce que vous voulez faire.

- **Juste utiliser l'application** : [installez l'APK](#installer-lapk-sans-rien-compiler). Deux minutes, rien
  à installer sur un ordinateur.
- **Modifier le code ou construire vous-même** : suivez le reste du tutoriel, à partir des
  [prérequis](#prérequis). Comptez une vingtaine de minutes, surtout du téléchargement.

## Installer l'APK, sans rien compiler

Tout se fait sur la console.

1. Ouvrez le navigateur de la console et allez sur
   <https://github.com/DabiK/carnet-sinnoh/releases/latest>.
2. Dans « Assets », touchez le fichier `carnet-sinnoh-….apk` pour le télécharger.
3. Ouvrez le fichier téléchargé. Android prévient que l'installation depuis cette source n'est pas
   autorisée : touchez **Paramètres**, activez **Autoriser cette source**, revenez en arrière.
4. Touchez **Installer**, puis **Ouvrir**.

L'application est complète : catalogue, sprites et carte sont dedans, elle fonctionne hors ligne. Il faut
Android 8 ou plus.

- **Sur une AYN Thor**, pour l'ouvrir toujours sur l'écran du bas : dans Cocoon, sélectionnez _Carnet
  Sinnoh_, appuyez sur Y, puis _Modifier l'application → écran du bas_.
- **Pour mettre à jour**, refaites la même chose avec la nouvelle version : elle remplace l'ancienne et votre
  carnet est conservé.
- **Un avertissement Play Protect** peut apparaître, comme pour toute application installée hors du Play
  Store : choisissez « Installer quand même ».
- La **lecture automatique du jeu** est facultative et se règle à part :
  [activer le bridge mémoire](#5-facultatif--activer-le-bridge-mémoire).

Le reste de ce document ne concerne que ceux qui veulent construire l'application eux-mêmes.

- [Prérequis](#prérequis)
- [1. Récupérer le projet](#1-récupérer-le-projet)
- [2. Installer le SDK Android](#2-installer-le-sdk-android)
- [3. Construire l'APK](#3-construire-lapk)
- [4. Installer sur la console](#4-installer-sur-la-console)
- [5. Facultatif : activer le bridge mémoire](#5-facultatif--activer-le-bridge-mémoire)
- [Mettre à jour](#mettre-à-jour)
- [Dépannage](#dépannage)

## Prérequis

### Sur l'ordinateur

| Outil                      | Version                    | Pour quoi faire                     | Vérifier            |
| -------------------------- | -------------------------- | ----------------------------------- | ------------------- |
| Git                        | récente                    | récupérer le projet                 | `git --version`     |
| JDK                        | 17 ou plus                 | compiler le code Java, signer l'APK | `javac -version`    |
| SDK Android                | build-tools 36.0.0         | assembler l'APK (étape 2)           | voir étape 2        |
| `adb`                      | fourni par le SDK          | installer sur la console            | `adb version`       |
| `zip`                      | présent sur macOS et Linux | ajouter le code à l'APK             | `zip --version`     |
| _Facultatif_ : Node.js 22+ | et Chrome                  | lancer les tests                    | `node --version`    |
| _Facultatif_ : Python 3.9+ | avec `requests`, `bs4`     | régénérer le catalogue de données   | `python3 --version` |

Le projet a été développé sur macOS. Les scripts sont en Bash et fonctionnent tels quels sous Linux ; sous
Windows, utilisez WSL.

Sur macOS avec [Homebrew](https://brew.sh/) :

```bash
brew install --cask temurin android-commandlinetools android-platform-tools
```

```bash
brew install node
```

### Sur la console

- Une console Android (Android 8 ou plus). L'application est pensée pour l'**AYN Thor** et son écran du bas
  (538 × 469 points CSS), mais fonctionne sur tout appareil Android.
- Le **débogage USB** activé : _Paramètres → À propos_, appuyez sept fois sur « Numéro de build », puis
  _Paramètres → Système → Options pour les développeurs → Débogage USB_.
- Un câble USB qui transporte les données.

Pour le bridge mémoire (étape 5) uniquement : l'émulateur **Eden v0.2.1** et votre propre copie de
_Pokémon Diamant Étincelant_ en version **1.3.0**. Le projet ne fournit ni l'un ni l'autre.

## 1. Récupérer le projet

```bash
git clone https://github.com/DabiK/carnet-sinnoh.git
```

```bash
cd carnet-sinnoh
```

Toutes les commandes suivantes se lancent depuis ce dossier.

## 2. Installer le SDK Android

Le projet n'utilise ni Android Studio ni Gradle : seulement trois outils du SDK (`aapt`, `d8`, `apksigner`)
et la bibliothèque `android.jar`.

Choisissez un dossier pour le SDK et déclarez-le. Ajoutez cette ligne à `~/.zshrc` ou `~/.bashrc` pour la
conserver :

```bash
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
```

Installez ensuite les composants. La commande demande d'accepter les licences du SDK Android :

```bash
sdkmanager --sdk_root="$ANDROID_SDK_ROOT" "build-tools;36.0.0" "platforms;android-36.1" "platform-tools"
```

Vérifiez :

```bash
ls "$ANDROID_SDK_ROOT/build-tools/36.0.0/aapt" "$ANDROID_SDK_ROOT/platforms/android-36.1/android.jar"
```

Vous avez déjà un SDK avec d'autres versions ? Indiquez-les au script plutôt que de tout réinstaller :

```bash
ANDROID_BUILD_TOOLS=35.0.0 ANDROID_PLATFORM=android-35 bash scripts/build.sh
```

## 3. Construire l'APK

```bash
bash scripts/build.sh
```

Le script compile le code Java, empaquette `assets/` et `res/`, puis signe l'APK. La dernière ligne doit être :

```
APK prête : build/carnet-sinnoh.apk
```

> **Gardez `build/dev.keystore`.** Ce fichier, créé à la première construction, est la clé qui signe l'APK.
> Android ne met à jour une application installée que si la clé est la même, et votre carnet est enregistré
> dans le stockage privé de l'application. Si vous perdez la clé, il faudra désinstaller l'application, donc
> perdre le carnet (exportez-le d'abord, voir [UTILISATION.md](UTILISATION.md#sauvegarder-son-carnet)).
> Cette clé de développement ne doit pas servir à une publication sur un magasin d'applications.

Variables reconnues par le script :

| Variable                   | Défaut                  | Rôle                                                  |
| -------------------------- | ----------------------- | ----------------------------------------------------- |
| `ANDROID_SDK_ROOT`         | `~/Library/Android/sdk` | emplacement du SDK (`ANDROID_HOME` est aussi accepté) |
| `ANDROID_BUILD_TOOLS`      | `36.0.0`                | version des build-tools                               |
| `ANDROID_PLATFORM`         | `android-36.1`          | plateforme de compilation                             |
| `CARNET_KEYSTORE`          | `build/dev.keystore`    | fichier de clés de signature                          |
| `CARNET_KEYSTORE_PASSWORD` | `android`               | son mot de passe                                      |

## 4. Installer sur la console

Branchez la console en USB et acceptez la demande « Autoriser le débogage USB » qui s'affiche sur son écran.
Vérifiez qu'elle est vue :

```bash
adb devices
```

La liste doit contenir une ligne terminée par `device`. Installez et lancez :

```bash
bash scripts/install.sh
```

Sur une console à deux écrans, précisez l'écran. Sur l'AYN Thor, l'écran du bas porte le numéro 4 et celui
du haut le numéro 0 :

```bash
CARNET_DISPLAY=4 bash scripts/install.sh
```

Lancer le carnet ne ferme pas le jeu en cours sur l'autre écran. Si plusieurs appareils sont branchés,
désignez le bon avec la variable standard d'adb : `ANDROID_SERIAL=<numéro de série> bash scripts/install.sh`.

**Pour qu'il s'ouvre toujours en bas** depuis le lanceur Cocoon de la Thor : sélectionnez _Carnet Sinnoh_,
appuyez sur Y, puis _Modifier l'application → écran du bas_.

L'application est installée. Tout ce qui suit est facultatif.

## 5. Facultatif : activer le bridge mémoire

Le bridge remplit tout seul la zone actuelle, le sac, l'équipe et la fiche du Pokémon adverse. Il lit la
mémoire du jeu à travers le débogueur GDB intégré à Eden, sur la console elle-même : aucun ordinateur, aucun
accès root.

**Profil pris en charge, et seulement celui-ci** : Eden v0.2.1 (Standard, CPU NCE) avec _Pokémon Diamant
Étincelant_ 1.3.0. Avec un autre jeu ou une autre version, le carnet affiche « Jeu/version non compatible »
et rien d'autre.

1. Dans les réglages de débogage d'Eden, activez le **stub GDB** sur le port **6543**. L'intitulé du menu
   peut varier selon la version ; dans le fichier de configuration d'Eden, ce sont les clés
   `use_gdbstub=true` et `gdbstub_port=6543`. Notez l'ancienne valeur pour pouvoir revenir en arrière.
2. Lancez le jeu. Le réglage n'est pris en compte qu'au démarrage du jeu.
3. Dans le carnet, onglet **Combat**, appuyez sur **Connecter**.

Le statut passe à « En attente d'un combat ». À la connexion, Eden met le jeu en pause une fraction de
seconde ; le carnet le relance aussitôt.

À savoir avant de l'activer :

- **Sécurité.** Le débogueur d'Eden écoute sur toutes les interfaces réseau (`0.0.0.0:6543`) et autorise
  l'écriture mémoire. Le carnet, lui, ne se connecte qu'en local et n'envoie que des lectures, mais tant que
  l'option est active, tout appareil du même réseau peut atteindre ce port. Activez-la sur un réseau de
  confiance et désactivez-la (`use_gdbstub=false`) quand vous n'en avez plus besoin.
- **Un seul client.** Eden n'accepte qu'une connexion : ne branchez pas un autre débogueur en même temps.
- **Expérimental.** Combats doubles, changements de Pokémon et transformations ne sont pas validés.

## Mettre à jour

```bash
git pull
```

```bash
bash scripts/build.sh && bash scripts/install.sh
```

Le carnet est conservé, à condition d'avoir gardé `build/dev.keystore`.

## Dépannage

| Symptôme                                                    | Cause et solution                                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `build: build-tools not found in …`                         | Le SDK n'est pas là où le script le cherche. Définissez `ANDROID_SDK_ROOT` (étape 2), ou `ANDROID_BUILD_TOOLS` si votre version diffère.    |
| `build: platform not found: …/android.jar`                  | La plateforme n'est pas installée, ou sous un autre nom : `ls "$ANDROID_SDK_ROOT/platforms"` puis `ANDROID_PLATFORM=<nom>`.                 |
| `error: release version 8 not supported`                    | Votre JDK ne sait plus produire du code Java 8. Utilisez un JDK 17 à 25 (le projet est testé avec le 25).                                   |
| `adb devices` n'affiche rien                                | Câble de charge seul, ou débogage USB désactivé.                                                                                            |
| `adb devices` affiche `unauthorized`                        | Acceptez la demande d'autorisation sur l'écran de la console.                                                                               |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE`                        | L'application installée a été signée avec une autre clé. Exportez votre carnet, désinstallez (`adb uninstall fr.dabi.sinnoh`), réinstallez. |
| L'application s'ouvre sur le mauvais écran                  | Passez `CARNET_DISPLAY`. `adb shell dumpsys display \| grep mDisplayId` liste les écrans.                                                   |
| Combat : « Lecture indisponible · … Connection refused »    | Eden n'est pas lancé, ou son stub GDB n'est pas activé, ou le jeu a été lancé avant d'activer l'option.                                     |
| Combat : « Jeu/version non compatible · BDSP 1.3.0 requis » | Le jeu en cours n'est pas Diamant Étincelant 1.3.0. Le bridge refuse volontairement de lire.                                                |
| Combat : « Lecture interrompue · reconnexion en cours »     | Plus de données depuis dix secondes (jeu en pause, application passée en arrière-plan). La lecture reprend seule.                           |
