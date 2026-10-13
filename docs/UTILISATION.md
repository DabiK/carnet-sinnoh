# Utilisation

Le menu du bas est toujours visible et donne accès aux cinq onglets. Le bouton Retour de la console ferme la
fiche ouverte, puis ramène à _Quêtes_.

Rien n'est obligatoire : aucun Pokémon, parcours ou objectif n'est imposé. L'application démarre avec un
modèle de parcours pour _Diamant Étincelant_ que vous pouvez modifier entièrement.

## Quêtes

Trois affichages, en haut de l'onglet.

### Ici

Ce qui vaut le coup **dans la zone où vous êtes** : les Pokémon de vos objectifs qu'on y rencontre, les
évolutions possibles des membres de votre équipe, les objets utiles et les services du lieu.

- Avec le bridge connecté, la zone, les badges, le sac et l'équipe sont lus dans le jeu. Un objet déjà dans
  le sac ou tenu par un Pokémon est reconnu.
- Sans bridge, la zone est celle que vous saisissez dans _Badges et progression_ ; l'affichage le signale par
  « POSITION DU CARNET · MANUELLE ».
- _Zones déjà visitées_ ajoute les lieux réellement traversés depuis que le bridge tourne. Rien n'est déduit
  du nombre de badges.
- Les cases « Fait » et « Récupéré » sont manuelles. Un objet absent du sac a pu être utilisé : cochez la
  case pour vous en souvenir.

Les rencontres dont la condition n'a pas pu être vérifiée (capacité à utiliser hors combat, événement, étage
particulier) restent masquées plutôt que promises à tort.

### Checklist

Les étapes vers votre équipe cible, regroupées par phase du parcours : captures, objets à récupérer,
évolutions. L'encart « Prochaine chose à penser » désigne la première tâche disponible.

- Pour un Pokémon du parcours modèle, l'ordre conseillé du modèle est repris.
- Pour tout autre Pokémon, les étapes sont générées depuis le catalogue : première possibilité d'obtention,
  puis évolutions.
- Les cases sont manuelles et toujours cochables, même si les badges saisis sont en retard. Rien n'est
  déduit automatiquement d'un combat.

### Mes Pokémon

La liste de vos objectifs. Pour chacun : « Comment l'obtenir », ses lieux sur la carte, et « Je l'ai ! ».

## Carte

Par défaut, la carte montre **toutes les rencontres documentées de la zone actuelle**, que les espèces
fassent partie de vos objectifs ou non. Chaque fiche indique la méthode, les niveaux et les taux de rencontre
par moment de la journée.

- Le pourcentage est un **taux de rencontre**, pas une chance de capture.
- Les rencontres soumises à une condition non confirmée (essaim du jour, arbre à miel, Poké Radar, accès à
  une sous-zone) sont regroupées à part.
- Les deux entrées de la Grotte des Égarés sont distinguées. Dans les Grands Souterrains, le biome n'est pas
  identifié : aucune liste n'est affichée plutôt qu'un mélange de toutes les cachettes.

Depuis la fiche d'un objectif, « Carte » affiche à la place les lieux où l'obtenir. Les repères sont
**régionaux et approximatifs** : ils situent une ville ou une route, pas une entrée de grotte. Pour une
cachette des Souterrains, le repère indique l'accès en surface à Vestigion.

## Pokédex

Recherche par nom ou par numéro. Le filtre _4G_ montre les 107 espèces introduites en quatrième génération,
_National_ les 493 disponibles jusqu'à celle-ci.

Dans une fiche, **« Je veux ce Pokémon »** l'ajoute à vos objectifs. L'application propose alors :

- chaque stade de la famille capturable dans _Diamant Étincelant_, comme point de départ possible ;
- les étapes d'évolution qui suivent, avec leur condition ;
- la reproduction ou l'échange quand il n'existe pas de capture directe ;
- un avertissement quand l'espèce n'est documentée que dans _Perle Scintillante_.

Une condition suivie de « à confirmer pour BDSP » vient d'une source qui mélange plusieurs jeux : un lien
permet de la vérifier.

## Combat

Appuyez sur **Connecter** pour démarrer le bridge
([mise en place](INSTALLATION.md#5-facultatif--activer-le-bridge-mémoire)). Pendant un combat, la fiche du
Pokémon adverse tient sur un écran, sans défilement :

- PV actuels et maximum, relus en continu ;
- les six statistiques et les six IV avec leur jauge, le total sur 186 ;
- jusqu'à quatre attaques : type, catégorie (Phys., Spé., Statut), puissance, précision ;
- les faiblesses de type, et les variations de statistiques en cours.

L'encart de lecture du potentiel s'adresse à qui ne connaît pas les IV. Les étoiles marquent les deux
statistiques qui comptent le plus pour la tendance de l'espèce, et le verdict ne regarde que celles-là :

| Verdict             | Condition sur les deux IV prioritaires |
| ------------------- | -------------------------------------- |
| Bons IV utiles      | les deux à 25 ou plus                  |
| IV utiles corrects  | les deux à 16 ou plus                  |
| Potentiel contrasté | l'un à 25 ou plus, l'autre sous 16     |
| IV utiles modestes  | les autres cas                         |

« Comprendre » et le nom de chaque statistique ouvrent une aide. Ce sont des **repères pour débutant**, pas
des conseils stratégiques : la nature, le talent, les EV et les attaques ne sont pas pris en compte. Quelques
espèces au fonctionnement particulier (Métamorph, Zarbi, Qulbutoké, Queulorior, Munja) n'obtiennent pas de
verdict. On termine très bien l'aventure sans IV parfaits.

Le combat ne modifie jamais votre carnet : une capture n'est pas cochée automatiquement.

## Carnet

- **Objectifs personnels et notes** : une checklist libre et un bloc de texte, enregistrés au fil de la
  frappe.
- **Badges et progression** : nombre de badges, ville ou route actuelle, déblocages obtenus.
- **Configurer** : tout le modèle est modifiable (voir plus bas).
- **Afficher le carnet précédent** : les vues d'origine, organisées autour d'une équipe de six Pokémon
  planifiée à l'avance, restent disponibles.

### Sauvegarder son carnet

Le carnet est enregistré dans le stockage privé de l'application. Il survit aux mises à jour, mais pas à une
désinstallation ni à un effacement des données de l'application.

_Carnet → Sauvegarder / restaurer tout le carnet → Générer_ produit un texte JSON à copier et conserver
ailleurs. _Restaurer_ remplace le carnet après confirmation. La sauvegarde du jeu n'est jamais touchée.

### Configurer le parcours

_Carnet → Configurer_ permet d'ajouter, modifier, réordonner ou retirer :

| Élément        | Champs notables                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Pokémon**    | Formes, de « absent » (la première) à la forme visée (la dernière). « Temporaire » l'exclut du compteur final.       |
| **Étapes**     | Badges requis de 0 à 8, déblocage requis.                                                                            |
| **Objectifs**  | Simple case, capture, forme finale ou déblocage. « Ignorer le prérequis de l'étape » sert à l'objet qui la débloque. |
| **Déblocages** | Un nom libre : Canne, Explorakit, Surf…                                                                              |
| **Repères**    | Position en pourcentages sur la carte ; « Déplacer le repère » permet de la choisir du doigt.                        |

_Configuration avancée · JSON_ expose tous les champs, dont le fond de carte (`map.image`) et une image
personnalisée par Pokémon (`team[].sprite`), sous forme de data URL PNG, JPEG ou WebP d'environ 2 Mo au plus.
Conserver les identifiants en important une configuration conserve la progression correspondante.

Les imports sont validés : tailles, nombres d'éléments, identifiants, liens `https` uniquement. Un import
invalide est refusé en entier.
