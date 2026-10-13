#!/usr/bin/env python3
"""Complete the base catalogue: evolutions, breeding and transfer alternatives, per-version
encounter rates, version exclusives and regional map anchors."""

import csv
import html
import json
import re

from build_catalog import APP_DATA, CACHE, CATALOG, key, plain, revisions, wiki_url
from build_catalog import build as build_base

HIGHEST_SPECIES = 493
EEVEE = 133


def templates(text):
    start = None
    depth = 0
    i = 0
    while i < len(text) - 1:
        pair = text[i : i + 2]
        if pair == "{{":
            if depth == 0:
                start = i + 2
            depth += 1
            i += 2
            continue
        if pair == "}}" and depth:
            depth -= 1
            if depth == 0:
                yield text[start:i]
            i += 2
            continue
        i += 1


def parameters(t):
    out = []
    start = 0
    curly = 0
    links = 0
    i = 0
    while i < len(t):
        pair = t[i : i + 2]
        if pair == "{{":
            curly += 1
            i += 2
            continue
        if pair == "}}":
            curly -= 1
            i += 2
            continue
        if pair == "[[":
            links += 1
            i += 2
            continue
        if pair == "]]":
            links -= 1
            i += 2
            continue
        if t[i] == "|" and not curly and not links:
            out.append(t[start:i].strip())
            start = i + 1
        i += 1
    out.append(t[start:].strip())
    return out[0], [p for p in out[1:] if not re.match(r"^[A-Za-z][A-Za-z0-9_-]*=", p)]


def clean(t):
    t = re.sub(r"{{(?:[Oo]bjet|[Aa]bréviation|[Jj]eu|[Ss]up|[Tt]ype)\|([^}|]+)(?:\|[^}]*)?}}", r"\1", t)
    t = re.sub(r"<br\s*/?>", " · ", t, flags=re.I)
    return html.unescape(re.sub(r"<[^>]+>", "", plain(t))).strip()


def add_evolutions(data, mons, by_name):
    """Read evolution conditions from the species pages; parent/child links come from PokeAPI."""
    parents = {
        int(r["id"]): int(r["evolves_from_species_id"])
        for r in csv.DictReader((CACHE / "pokemon-species.csv").open())
        if int(r["id"]) <= HIGHEST_SPECIES
        and r["evolves_from_species_id"]
        and int(r["evolves_from_species_id"]) <= HIGHEST_SPECIES
    }
    pages = []
    for file in sorted(CACHE.glob("species-*.json")):
        pages.extend(json.loads(file.read_text())["query"]["pages"].values())
    seen = set()

    def add(target, condition, page, scope="general"):
        id = by_name.get(key(clean(target)))
        parent = parents.get(id)
        if not id or not parent:
            return
        signature = (parent, id, clean(condition))
        if signature in seen:
            return
        seen.add(signature)
        label = clean(condition)
        ambiguous = bool(
            re.search(r"Depuis|Avant|\bEB\b|\bLPA\b|\bGO\b|\bSL\b|Méga|champ magnétique", label, re.I)
            or "{{" in label
        )
        edge = {
            "from": parent,
            "to": id,
            "condition": label,
            "scope": scope,
            "needsReview": ambiguous,
            "source": wiki_url(page["title"]) + "#Évolution",
            "revision": page["revisions"][0]["revid"],
        }
        level = re.search(r"\b[Nn]iveau\s+(\d+)", label)
        if level:
            edge["level"] = int(level[1])
        mons[parent]["evolutions"].append(edge)
        mons[id].setdefault("evolvesFrom", []).append(edge)

    for page in pages:
        if "revisions" not in page:
            continue
        text = page["revisions"][0]["slots"]["main"]["*"]
        conditions = {}
        for template in templates(text):
            name, args = parameters(template)
            if name == "TableauEvolutionSimple" and len(args) >= 2:
                add(args[1], args[0], page)
            elif name.startswith("TableauEvolutionConditionBranche"):
                conditions[name.removeprefix("TableauEvolutionConditionBranche")] = args[0] if args else ""
            elif name.startswith("TableauEvolutionBranche") and args:
                suffix = name.removeprefix("TableauEvolutionBranche")
                add(args[0], conditions.get(suffix, ""), page)
    # Eevee's family uses a custom factual table instead of the standard templates.
    p = revisions(["Modèle:TableauEvolutionEvoli"], "eevee-evolution-template")[
        "Modèle:TableauEvolutionEvoli"
    ]
    text = p["revisions"][0]["slots"]["main"]["*"]
    for row in text.split("|-"):
        links = re.findall(r"\[\[([^]|]+)(?:\|[^]]+)?\]\]", row)
        targets = [x for x in links if key(x) in by_name and parents.get(by_name[key(x)]) == EEVEE]
        if not targets:
            continue
        condition = row.split("►", 1)[0]
        condition = re.sub(r"\| rowspan=.*?\n", "", condition)
        condition = condition.replace("[[Fichier:Évoli.png|x80px]]<br>[[Évoli]]", "").lstrip("| \n")
        if "Avant {{Abréviation|EB}} + {{Abréviation|DEPS}} :" in condition:
            condition = condition.split(":", 1)[1].split("<br>", 1)[0].strip()
            if "bonheur" in condition.lower():
                condition += " + gain d’un niveau"
        add(targets[-1], condition, p, scope="bdsp" if "DEPS" in row else "general")
    # Explicitly retain gaps instead of asserting that an unparsed evolution does not exist.
    for id, parent in parents.items():
        if not mons[id].get("evolvesFrom"):
            mons[id]["evolvesFrom"] = [
                {
                    "from": parent,
                    "to": id,
                    "condition": "Condition à vérifier sur la fiche source",
                    "needsReview": True,
                    "scope": "unknown",
                    "source": mons[id]["source"] + "#Évolution",
                }
            ]
            mons[parent]["evolutions"].extend(mons[id]["evolvesFrom"])
            data["issues"].append({"kind": "evolution-condition-missing", "dex": id})


def add_alternatives_and_rates(mons):
    """Derive breeding/transfer alternatives from notes and split rates by game version."""
    for mon in mons.values():
        mon["notes"] = [clean(n) for n in mon["notes"] if "À compléter" not in n]
        mon["alternatives"] = []
        for note in mon["notes"]:
            if note.startswith("Faire reproduire "):
                candidates = [
                    v for v in mons.values() if note.removeprefix("Faire reproduire ").startswith(v["name"])
                ]
                if candidates:
                    parent = max(candidates, key=lambda v: len(v["name"]))
                    mon["alternatives"].append(
                        {
                            "kind": "breeding",
                            "parentDex": parent["dex"],
                            "condition": note,
                            "placeId": "garderiebonville",
                            "source": mon["source"] + "#Localisations",
                        }
                    )
                    if mon["availability"] == "indirect-or-unavailable":
                        mon["availability"] = "breeding"
            elif "transférer" in note:
                mon["alternatives"].append(
                    {
                        "kind": "transfer",
                        "condition": note,
                        "source": mon["source"] + "#Localisations",
                        "requiresOfficialGame": True,
                        "note": "Pokémon HOME concerne les jeux officiels ; aucune fonction HOME ou échange réseau n’est fournie par ce compagnon Eden.",
                    }
                )
                if mon["availability"] == "indirect-or-unavailable":
                    mon["availability"] = "transfer"
        for e in mon["encounters"]:
            e["method"] = clean(e["method"])
            e["rates"] = {k: clean(v) for k, v in e["rates"].items()}
            rates = {"brilliant-diamond": {}, "shining-pearl": {}}
            for time, value in e["rates"].items():
                pairs = re.findall(r"([^,]+),\s*(DE|PS)\b", value)
                if pairs:
                    for amount, version in pairs:
                        rates["brilliant-diamond" if version == "DE" else "shining-pearl"][time] = (
                            amount.strip()
                        )
                else:
                    for version in e["versions"]:
                        rates[version][time] = value
            e["ratesByVersion"] = rates
            if e["kind"] == "fossil":
                e["requirements"].append(
                    {"id": "fossil", "label": clean(e["rates"].get("all", "Fossile")), "scope": "method"}
                )
        if mon.get("evolvesFrom") and mon["availability"] == "indirect-or-unavailable":
            mon["availability"] = "evolution"


def apply_version_exclusives(data, mons):
    """Correct version tags that contradict the game page's exclusivity table."""
    game = revisions(["Pokémon Diamant Étincelant et Perle Scintillante"], "bdsp-game-page")[
        "Pokémon Diamant Étincelant et Perle Scintillante"
    ]
    section = (
        game["revisions"][0]["slots"]["main"]["*"]
        .split("=== Différences entre les versions ===", 1)[1]
        .split("=== Autres ===", 1)[0]
    )
    exclusives = {}
    for row in section.split("|-"):
        ids = re.findall(r"{{Miniature\|0*(\d+)\|jeu=DEPS}}", row)
        if len(ids) == 2:
            for dex, version in zip(ids, ["brilliant-diamond", "shining-pearl"]):
                exclusives[int(dex)] = version
    if exclusives.get(200) != "shining-pearl" or exclusives.get(408) != "brilliant-diamond":
        raise ValueError("Game exclusivity table format changed")
    source = {
        "url": wiki_url(game["title"]) + "#Différences_entre_les_versions",
        "revision": game["revisions"][0]["revid"],
        "use": "Recoupement des exclusivités de version.",
    }
    data["sources"].append(source)
    data["versionExclusives"] = {str(k): v for k, v in exclusives.items()}
    for dex, version in exclusives.items():
        for encounter in mons[dex]["encounters"]:
            if encounter["versions"] != [version]:
                encounter["sourceConsistency"] = {
                    "kind": "version-exclusive-crosscheck",
                    "originalVersions": encounter["versions"],
                    "source": source["url"],
                    "revision": source["revision"],
                }
                encounter["versions"] = [version]
                encounter["ratesByVersion"] = {version: encounter["ratesByVersion"].get(version, {})}
                data["issues"].append(
                    {
                        "kind": "version-tag-corrected",
                        "dex": dex,
                        "placeId": encounter["placeId"],
                        "source": source["url"],
                    }
                )
        if mons[dex]["encounters"]:
            mons[dex]["availability"] = "direct" if version == "brilliant-diamond" else "other-version"


def add_map_anchors(data):
    """Attach an approximate position on the region map to every place."""
    anchors = json.loads((CATALOG / "map-anchors.json").read_text())
    lookup = {key(n): {"name": n, "x": p[0], "y": p[1]} for n, p in anchors["anchors"].items()}
    aliases = {
        "Entrée de Charbourg": "Charbourg",
        "Mine de Charbourg": "Charbourg",
        "Musée Minier de Charbourg": "Charbourg",
        "Pré de Floraville": "Floraville",
        "Salle Originelle": "Mont Couronné",
        "Colonnes Lances": "Mont Couronné",
        "Temple de Frimapic": "Frimapic",
        "Rive du Lac Courage": "Lac Courage",
        "Rive du Lac Savoir": "Lac Savoir",
        "Chemin Rocheux": "Route 204",
    }
    wild_caves = ["Grotte des Égarés", "Grotte du Retour"]
    for place in data["places"].values():
        name = clean(place["name"])
        short = re.sub(r"\s*\(Sinnoh\)", "", name).strip()
        place["name"] = name
        place["subarea"] = clean(place["subarea"]) if place["subarea"] else None
        if short.startswith(("Caverne", "Grotte")) and not any(short.startswith(x) for x in wild_caves):
            place["map"] = {
                "kind": "underground-access",
                "accuracy": "regional-approximate",
                "anchors": [lookup[key("Vestigion")]],
                "note": "Repère d’accès aux Grands Souterrains à Vestigion. La position de cette cachette sous terre varie selon la zone de descente ; ce point ne situe pas la grotte.",
            }
        elif short == "Pokémon nomade":
            place["map"] = {
                "kind": "roaming",
                "accuracy": "unknown",
                "anchors": [],
                "note": "Pokémon mobile : aucun emplacement fixe.",
            }
        else:
            target = aliases.get(short, short)
            anchor = lookup.get(key(target))
            if not anchor:
                for label in sorted(anchors["anchors"], key=len, reverse=True):
                    if key(short).startswith(key(label)):
                        anchor = lookup[key(label)]
                        break
            if anchor:
                place["map"] = {
                    "kind": "regional",
                    "accuracy": "regional-approximate",
                    "anchors": [anchor],
                    "note": "Repère régional approximatif ; consulter la fiche du lieu pour les entrées et étages.",
                }
            else:
                place["map"] = {
                    "kind": "unmapped",
                    "accuracy": "unknown",
                    "anchors": [],
                    "note": "Lieu documenté, emplacement sur cette carte à vérifier.",
                }
                data["issues"].append({"kind": "map-anchor-missing", "placeId": place["id"]})
    data["places"]["garderiebonville"] = {
        "id": "garderiebonville",
        "name": "Garderie de Bonville",
        "subarea": None,
        "source": wiki_url("Pension Pokémon"),
        "map": {
            "kind": "regional",
            "accuracy": "regional-approximate",
            "anchors": [lookup[key("Bonville")]],
            "note": "Repère régional de Bonville. Consulte la fiche de la Garderie pour les modalités de reproduction.",
        },
    }
    data["map"] = {k: v for k, v in anchors.items() if k != "anchors"}


def build():
    """Write the catalogue as JSON and as the script loaded by the app."""
    data = build_base()
    mons = {v["dex"]: v for v in data["species"]}
    by_name = {key(v["name"]): v["dex"] for v in mons.values()}
    add_evolutions(data, mons, by_name)
    add_alternatives_and_rates(mons)
    apply_version_exclusives(data, mons)
    add_map_anchors(data)
    data["sources"][0]["license"] = "CC BY-NC-SA 3.0"
    data["sources"].append(
        {
            "url": "https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_species.csv",
            "use": "Identifiants des relations parent/enfant ; les conditions viennent de Poképédia.",
        }
    )
    data["coverage"] = {
        "species": len(mons),
        "places": len(data["places"]),
        "encounters": sum(len(mon["encounters"]) for mon in mons.values()),
        "evolutionEdges": sum(len(mon["evolutions"]) for mon in mons.values()),
        "mappedPlaces": sum(bool(p["map"]["anchors"]) for p in data["places"].values()),
        "unknownSpecies": [
            mon["dex"] for mon in mons.values() if mon["availability"] == "indirect-or-unavailable"
        ],
        "reviewEvolutions": [
            mon["dex"] for mon in mons.values() if any(e["needsReview"] for e in mon.get("evolvesFrom", []))
        ],
    }
    pretty = json.dumps(data, ensure_ascii=False, indent=2)
    (CATALOG / "bdsp-catalog.json").write_text(pretty)
    (APP_DATA / "acquisition-catalog.js").write_text(
        "/* Factual offline acquisition catalogue. Poképédia contributors, CC BY-NC-SA 3.0. */\nconst ACQUISITION_CATALOG="
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    print(json.dumps(data["coverage"], ensure_ascii=False), flush=True)


if __name__ == "__main__":
    build()
