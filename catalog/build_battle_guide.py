#!/usr/bin/env python3
"""Offline, transparent beginner hints derived from BDSP-era base stats."""

import csv
import json
import statistics

from build_catalog import APP_DATA, CACHE, CATALOG

KEYS = ["hp", "attack", "defense", "special-attack", "special-defense", "speed"]


def build():
    species = json.loads((CATALOG / "bdsp-catalog.json").read_text())["species"]
    bydex = {m["dex"]: m for m in species}
    defaults = {
        int(r["species_id"]): int(r["id"])
        for r in csv.DictReader((CACHE / "pokemon.csv").open())
        if r["is_default"] == "1" and int(r["species_id"]) <= 493
    }
    raw = {pid: {} for pid in defaults.values()}
    for r in csv.DictReader((CACHE / "pokemon_stats.csv").open()):
        pid, sid = int(r["pokemon_id"]), int(r["stat_id"])
        if pid in raw and 1 <= sid <= 6:
            raw[pid][KEYS[sid - 1]] = int(r["base_stat"])
    past = {}
    for r in csv.DictReader((CACHE / "pokemon_stats_past.csv").open()):
        pid, sid, gen = int(r["pokemon_id"]), int(r["stat_id"]), int(r["generation_id"])
        if pid in raw and 1 <= sid <= 6 and gen >= 8:
            key = (pid, sid)
            if key not in past or gen < past[key][0]:
                past[key] = (gen, int(r["base_stat"]))
    for (pid, sid), (_, value) in past.items():
        raw[pid][KEYS[sid - 1]] = value
    children = {dex: set() for dex in bydex}
    for r in csv.DictReader((CACHE / "pokemon-species.csv").open()):
        dex = int(r["id"])
        parent = int(r["evolves_from_species_id"] or 0)
        if dex in bydex and parent in bydex:
            children[parent].add(dex)

    def endpoints(dex, seen=None):
        seen = set() if seen is None else seen
        if dex in seen:
            raise ValueError("Evolution cycle")
        if not children[dex]:
            return [dex]
        return sorted({v for child in children[dex] for v in endpoints(child, seen | {dex})})

    profiles = {}
    for dex, mon in bydex.items():
        finals = endpoints(dex)
        stats = {key: statistics.mean(raw[defaults[d]][key] for d in finals) for key in KEYS}
        atk, spa = stats["attack"], stats["special-attack"]
        defense = max(stats["defense"], stats["special-defense"])
        if dex in (132, 201, 202, 235, 292):
            role = "particular"
            priorities = []
        elif stats["hp"] >= 150 or defense >= max(atk, spa) + 15:
            role = "defensive"
            priorities = [
                "hp",
                "defense" if stats["defense"] >= stats["special-defense"] else "special-defense",
            ]
        else:
            role = "physical" if atk >= spa + 15 else "special" if spa >= atk + 15 else "mixed"
            priorities = (
                ["attack", "special-attack"]
                if role == "mixed"
                else [
                    "attack" if role == "physical" else "special-attack",
                    "speed" if stats["speed"] >= 75 else "hp",
                ]
            )
        profiles[str(dex)] = {
            "dex": dex,
            "name": mon["name"],
            "baseStats": raw[defaults[dex]],
            "referenceDex": finals,
            "role": role,
            "priorities": priorities,
            "branched": len(finals) > 1,
        }
    data = {
        "schemaVersion": 1,
        "gameGeneration": 8,
        "method": "Repère débutant calculé à partir des statistiques de base des évolutions finales (moyenne en cas de branches). Ce ne sont pas des builds compétitifs. Formes par défaut uniquement.",
        "ivBands": {"perfect": 31, "high": 25, "middle": 16},
        "ivBandNote": "Seuils éditoriaux pour lire le potentiel naturel, sans effet sur les règles du jeu.",
        "sources": [
            {
                "url": "https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv",
                "use": "Stats de base, historique des stats, formes par défaut et parents.",
            },
            {"url": "https://www.pokepedia.fr/IV", "use": "Explication du potentiel naturel (0 à 31)."},
        ],
        "profiles": profiles,
        "moveCategories": {
            r["id"]: {"1": "status", "2": "physical", "3": "special"}[r["damage_class_id"]]
            for r in csv.DictReader((CACHE / "moves.csv").open())
        },
    }
    (CATALOG / "battle-guide.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    (APP_DATA / "battle-guide-data.js").write_text(
        "/* Beginner hints inferred by the companion; base facts from PokeAPI. */\nconst BATTLE_GUIDE="
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    print("Battle guide:", len(profiles), "species")


if __name__ == "__main__":
    build()
