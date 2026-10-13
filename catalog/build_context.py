#!/usr/bin/env python3
"""Build the data behind the "Ici" board: named zones and a curated list of items and tips.

Cards are short facts written for the app and linked to their reference page. The reference
pages themselves are neither committed nor shipped.
"""

import json
import re

from bs4 import BeautifulSoup

from build_catalog import APP_DATA, CACHE, CATALOG, SESSION, key

# Small factual inputs with no public API to fetch them from.
SOURCES = CATALOG / "sources"
ZONES_SOURCE = "https://teamlumi.github.io/luminescent-team-dev/rom-hacking/dictionary/zones"
POKEBIP = "https://www.pokebip.com/page/jeux-video/pokemon-diamant-etincelant-perle-scintillante/"

# English location names of the zone dictionary to the French names used by the catalogue.
CITIES = {
    "Jubilife": "Féli-Cité",
    "Canalave": "Joliberges",
    "Oreburgh": "Charbourg",
    "Eterna": "Vestigion",
    "HeartHome": "Unionpolis",
    "Pastoria": "Verchamps",
    "Veilstone": "Voilaroc",
    "Sunyshore": "Rivamar",
    "Snowpoint": "Frimapic",
    "Pokemon League": "Ligue Pokémon",
    "Twinleaf": "Bonaugure",
    "Sandgem": "Littorella",
    "Floaroma": "Floraville",
    "Solaceon": "Bonville",
    "Celestic": "Célestia",
    "Ramanas Park": "Parc Rosa Rugosa",
    "Underground": "Grands Souterrains",
}
# Zone code prefixes of dungeons, lakes and other named areas.
DUNGEONS = {
    "D01": "Mine de Charbourg",
    "D02": "Les Éoliennes",
    "D03": "Forêt de Vestigion",
    "D04": "Forge Fuego",
    "D05": "Mont Couronné",
    "D06": "Grand Marais",
    "D07": "Ruines de Bonville",
    "D09": "Route Victoire",
    "D11": "Square Paisible",
    "D12": "Chemin Rocheux",
    "D13": "Pré de Floraville",
    "D14": "Entrée de Charbourg",
    "D16": "Mont Abrupt",
    "D17": "Grotte Retour",
    "D18": "Paradis Fleuri",
    "D20": "Temple de Frimapic",
    "D21": "Grotte des Égarés",
    "D22": "Tunnel Ruinemaniac",
    "D23": "Jardin Trophée",
    "D24": "Île de Fer",
    "D25": "Vieux Château",
    "D26": "QG Galaxie",
    "D27": "Lac Vérité",
    "D28": "Lac Courage",
    "D29": "Lac Savoir",
    "C11": "Aire de Combat",
    "L02": "Rive du Lac Courage",
    "L03": "Rive du Lac Savoir",
}

# Editorial selection: useful during the adventure, normalized facts and concise original
# explanations. (item name, item ID, regions, where, summary, target species, source page)
ITEM_CARDS = [
    (
        "Vive Griffe",
        217,
        ["Féli-Cité"],
        "Résidence au nord-est : parle à la fille.",
        "Peut aider Torterra à agir avant un adversaire aussi prioritaire.",
        [389],
        "feli-cite",
    ),
    (
        "Canne",
        445,
        ["Féli-Cité", "Route 218"],
        "Parle au pêcheur dans le portail vers la Route 218.",
        "Permet de pêcher Magicarpe pour obtenir Léviator.",
        [130],
        "feli-cite",
    ),
    (
        "Explorakit",
        428,
        ["Vestigion"],
        "Parle à l’Homme du Souterrain dans sa maison.",
        "Ouvre les Grands Souterrains et leurs rencontres.",
        [],
        "vestigion",
    ),
    (
        "Super Canne",
        446,
        ["Route 209"],
        "Parle au pêcheur près de l’entrée depuis Unionpolis.",
        "Élargit les possibilités de pêche.",
        [130],
        "route-209",
    ),
    (
        "Grelot Zen",
        218,
        ["Manoir Pokémon"],
        "Demande-le à la servante du manoir.",
        "Accélère l’amitié de Riolu pour son évolution en Lucario.",
        [448],
        "manoir-pokemon",
    ),
    (
        "Pièce Rune",
        223,
        ["Square Paisible"],
        "Ramasse-la dans le Square Paisible.",
        "Confie-la à un Pokémon qui participe pour gagner davantage d’argent.",
        [],
        "square-paisible",
    ),
    (
        "Grelot Coque",
        253,
        ["Unionpolis"],
        "Récupère-le dans Unionpolis.",
        "Le porteur récupère des PV lorsqu’il inflige des dégâts.",
        [],
        "unionpolis",
    ),
    (
        "Écaille Coeur",
        93,
        ["Route 212", "Route 213", "Route 214"],
        "Cherche les objets cachés du lieu.",
        "Sert à réapprendre une attaque à Verchamps.",
        [],
        "liste-objets",
    ),
]

# (id, title, regions, where, summary, target species, source page)
TIPS = [
    (
        "potions-201",
        "Les potions du vendeur",
        ["Route 201"],
        "Vendeur de la Boutique sur la route.",
        "Il donne des potions après ton passage au Lac Vérité. Coche si tu lui as déjà parlé.",
        [],
        "guide-des-lieux/route-201",
    ),
    (
        "riolu-iron",
        "L’œuf de Riolu",
        ["Île de Fer"],
        "Termine l’exploration avec Armand.",
        "Armand te remet un œuf. Fais-le éclore, puis augmente l’amitié de Riolu et gagne un niveau de jour pour Lucario.",
        [448],
        "guide-des-lieux/ile-de-fer",
    ),
    (
        "friendship-eterna",
        "Vérifier l’amitié",
        ["Vestigion"],
        "Évaluatrice d’amitié de Vestigion.",
        "Son avis aide à suivre la préparation de Riolu à l’évolution.",
        [448],
        "personnages-utiles",
    ),
    (
        "friendship-hearthome",
        "Vérifier l’amitié",
        ["Unionpolis"],
        "Fan Club Pokémon.",
        "Place Riolu en tête d’équipe et demande l’avis de l’évaluatrice.",
        [448],
        "personnages-utiles",
    ),
    (
        "massage-veilstone",
        "Faire masser Riolu",
        ["Voilaroc"],
        "Masseuse de Voilaroc.",
        "Un service utile pour son amitié et l’évolution en Lucario.",
        [448],
        "guide-des-lieux/voilaroc",
    ),
    (
        "move-reminder",
        "Réapprendre une attaque",
        ["Verchamps"],
        "Maître des Capacités.",
        "Apporte une Écaille Cœur pour récupérer une attaque oubliée. Le service devient gratuit après dix utilisations.",
        [],
        "personnages-utiles",
    ),
    (
        "rename",
        "Renommer un Pokémon",
        ["Vestigion"],
        "Immeuble à droite de la Boutique.",
        "Le Spécialiste des Noms peut renommer les Pokémon que tu as capturés.",
        [],
        "personnages-utiles",
    ),
    (
        "move-delete",
        "Faire oublier une attaque",
        ["Joliberges"],
        "Maison au-dessus de la Boutique.",
        "L’Effaceur de Capacités retire une attaque connue de ton Pokémon.",
        [],
        "personnages-utiles",
    ),
]


def named_zones():
    """Zone ID to French place name, for every zone whose place is known."""
    zones = {}
    for ident, location, place, _asset_path, code in json.loads((SOURCES / "bdsp-zones.json").read_text()):
        name = CITIES.get(location) or DUNGEONS.get(code[:3])
        route = re.match(r"Route (\d{3})\b", place)
        if route and not location:
            name = "Route " + route[1]
        elif not name and re.match(r"R\d{3}", code):
            name = "Route " + code[1:4]
        if not name:
            continue  # Unknown rooms remain explicit in UI, never guessed.
        # Exterior and interior of the mansion belong to the Route 212 code.
        if "Mansion" in place or code.startswith("R212AR01"):
            name = "Manoir Pokémon"
        detail = ""
        if "Pokémon Center" in place:
            detail = "Centre Pokémon"
        elif "Poké Mart" in place:
            detail = "Boutique"
        elif "Gym" in place:
            detail = "Arène"
        elif "House" in place or "Building" in place:
            detail = "Bâtiment"
        zones[ident] = {
            "id": int(ident),
            "name": name,
            "regionKey": key(name),
            "detail": detail,
            "code": code,
        }
    return zones


def item_list_page():
    """The reference item list, downloaded once and kept in the local cache."""
    page = CACHE / "pokebip-liste-objets.html"
    if not page.exists():
        response = SESSION.get(POKEBIP + "liste-objets", timeout=60)
        response.raise_for_status()
        page.write_text(response.text)
    return page.read_text()


def item_evidence():
    """The source row backing each item card. Provenance only: it stays in the cache."""
    rows = {}
    for row in BeautifulSoup(item_list_page(), "html.parser").select("tr"):
        cells = row.select("td")
        if len(cells) >= 4:
            name = cells[1].get_text(" ", strip=True)
            for spec in ITEM_CARDS:
                if name.startswith(spec[0] + " "):
                    rows[spec[0]] = row.get_text(" ", strip=True)
    return rows


def build():
    """Write both catalogues as JSON and as the scripts loaded by the app."""
    zones = named_zones()
    items = (SOURCES / "items-fr.txt").read_text().splitlines()
    evidence = item_evidence()
    cards = []
    for title, item_id, regions, where, summary, targets, slug in ITEM_CARDS:
        # A card is only kept while its source still lists the item.
        assert title in evidence, title
        source = POKEBIP + ("liste-objets" if slug == "liste-objets" else "guide-des-lieux/" + slug)
        cards.append(
            dict(
                id="item-" + str(item_id),
                kind="item",
                title=items[item_id],
                itemId=item_id,
                regionKeys=[key(s) for s in regions],
                where=where,
                summary=summary,
                targetDex=targets,
                source=source,
            )
        )
    for ident, title, regions, where, summary, targets, slug in TIPS:
        cards.append(
            dict(
                id=ident,
                kind="tip",
                title=title,
                regionKeys=[key(s) for s in regions],
                where=where,
                summary=summary,
                targetDex=targets,
                source=POKEBIP + slug,
            )
        )
    catalog = dict(
        version=1,
        game="brilliant-diamond",
        sources=[POKEBIP + "liste-objets", POKEBIP + "personnages-utiles"],
        cards=cards,
        itemNames={str(i): n for i, n in enumerate(items[:3000]) if n},
    )
    zonecatalog = dict(version=1, source=ZONES_SOURCE, zones=zones)
    for name, var, data in [
        ("context-catalog", "CONTEXT_CATALOG", catalog),
        ("zone-catalog", "ZONE_CATALOG", zonecatalog),
    ]:
        (CATALOG / (name + ".json")).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        (APP_DATA / (name + ".js")).write_text(
            "const " + var + "=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
        )
    (CACHE / "context-evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    print(
        len(zones),
        "named zones;",
        len(cards),
        "curated cards; encounters supplied by the existing 493-species catalogue",
    )


if __name__ == "__main__":
    build()
