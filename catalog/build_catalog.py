#!/usr/bin/env python3
"""Extract where each species is found in BDSP from Poképédia's localisation module.

The module is a Lua data table. It is parsed as a literal and never executed. API responses are
cached in ``catalog/cache`` so that a catalogue can be rebuilt offline and reproducibly.
"""

import argparse
import datetime
import json
import re
import time
import unicodedata
import urllib.parse
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalog"
# Downloaded copies of third-party pages: never committed, never shipped in the APK.
CACHE = CATALOG / "cache"
CACHE.mkdir(exist_ok=True)
# Generated data files loaded by the web UI.
APP_DATA = ROOT / "assets/data"
API = "https://www.pokepedia.fr/api.php"
MODULE = "Module:Localisations/Données/Pokémon Diamant Étincelant et Perle Scintillante"
SESSION = requests.Session()
SESSION.headers["User-Agent"] = (
    "SinnohPersonalCatalogue/0.1 (offline factual data extraction; Pokepedia attribution retained)"
)
# Set by --refresh: ignore cached responses and fetch current revisions.
REFRESH = False


def api(params, key):
    """Query the MediaWiki API, or return the response cached under ``key``."""
    f = CACHE / (key + ".json")
    if f.exists() and not REFRESH:
        return json.loads(f.read_text())
    for attempt in range(4):
        try:
            r = SESSION.get(API, params={**params, "format": "json", "maxlag": 5}, timeout=60)
            r.raise_for_status()
            j = r.json()
            if "error" in j:
                raise ValueError(str(j["error"]))
            f.write_text(json.dumps(j, ensure_ascii=False))
            return j
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2**attempt)


def revisions(titles, key):
    """Current wikitext of each page, by title."""
    j = api(
        {
            "action": "query",
            "prop": "revisions",
            "rvprop": "content|ids|timestamp",
            "rvslots": "main",
            "titles": "|".join(titles),
            "redirects": 1,
        },
        key,
    )
    return {p["title"]: p for p in j["query"]["pages"].values()}


class LuaLiteral:
    """Parser for a Lua table made only of literals. Anything executable is rejected."""

    def __init__(self, text):
        text = re.sub(r"^\s*return\s+", "", text)
        self.tokens = []
        pos = 0
        regex = re.compile(r'\s*("(?:\\.|[^"\\])*"|[{}\[\]=,;]|-?\d+(?:\.\d+)?|true|false|nil)')
        while text[pos:].strip():
            m = regex.match(text, pos)
            if not m:
                raise ValueError("Nonliteral Lua rejected at " + repr(text[pos : pos + 60]))
            self.tokens.append(m[1])
            pos = m.end()
        self.index = 0

    def take(self, expected=None):
        t = self.tokens[self.index]
        self.index += 1
        if expected is not None and t != expected:
            raise ValueError("Expected " + expected + ", got " + t)
        return t

    def value(self):
        t = self.take()
        if t == "{":
            obj = {}
            arr = []
            while self.tokens[self.index] != "}":
                if self.tokens[self.index] == "[":
                    self.take("[")
                    key = self.value()
                    self.take("]")
                    self.take("=")
                    obj[key] = self.value()
                else:
                    arr.append(self.value())
                if self.tokens[self.index] in [",", ";"]:
                    self.take()
                elif self.tokens[self.index] != "}":
                    raise ValueError("Invalid literal table")
            self.take("}")
            if obj and arr:
                raise ValueError("Mixed table rejected")
            return obj if obj or not arr else arr
        if t.startswith('"'):
            return json.loads(t)
        if t in ["true", "false", "nil"]:
            return {"true": True, "false": False, "nil": None}[t]
        return float(t) if "." in t else int(t)

    def parse(self):
        out = self.value()
        if self.index != len(self.tokens):
            raise ValueError("Trailing executable Lua rejected")
        return out


def key(name):
    """Accent-, case- and punctuation-insensitive identifier for a name."""
    name = name.replace("♀", "female").replace("♂", "male")
    return re.sub(
        r"[^a-z0-9]", "", unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode().lower()
    )


def wiki_url(name):
    return "https://www.pokepedia.fr/" + urllib.parse.quote(name.replace(" ", "_"), safe="")


def plain(s):
    """Strip wiki links and emphasis markup."""
    s = re.sub(r"\[\[([^]|]+)\|([^]]+)\]\]", r"\2", s)
    s = re.sub(r"\[\[([^]]+)\]\]", r"\1", s)
    s = s.replace("{{Abréviation{{!}}LPA}}", "Légendes Pokémon : Arceus").replace("{{!}}", "|")
    return re.sub(r"\s+", " ", s.replace("'''", "").replace("''", "")).strip()


def requirement(s):
    """Items and unlocks named by an encounter method."""
    out = []
    labels = {
        "Explorakit": "kit",
        "Pokédex National": "national-dex",
        "Badge Glaçon": "badge-7",
        "CS Force": "strength",
        "CS Anti-Brume": "defog",
        "Sur l’eau": "surf",
        "Sur l'eau": "surf",
        "Méga Canne": "super-rod",
        "Super Canne": "good-rod",
        "Pêche à la Canne": "old-rod",
        "Poké Radar": "poke-radar",
        "Clé de Voûte": "odd-keystone",
        "Carte Membre": "member-card",
        "Lettre Chen": "oaks-letter",
        "Flûte Azur": "azure-flute",
    }
    for label, id in labels.items():
        if label in s:
            out.append({"id": id, "label": label, "evidence": s, "scope": "method"})
    return out


def normalize_encounter(raw):
    """Turn one row of the localisation module into a structured encounter."""
    medium = plain(raw.get("milieu", ""))
    rate = ", ".join(v for k, v in raw.items() if k.startswith("taux"))
    versions = ["brilliant-diamond", "shining-pearl"]
    if re.search(r"\bDE\b", rate) and not re.search(r"\bPS\b", rate):
        versions = ["brilliant-diamond"]
    if re.search(r"\bPS\b", rate) and not re.search(r"\bDE\b", rate):
        versions = ["shining-pearl"]
    kind = "wild"
    for match, k in [
        ("Échange", "npc-trade"),
        ("Donné", "gift"),
        ("Bonus de sauvegarde", "save-bonus"),
        ("Rencontre", "static"),
        ("Fossile", "fossil"),
    ]:
        if match in medium:
            kind = k
            break
    if "Pêche" in medium:
        kind = "fishing"
    elif "Sur l'eau" in medium:
        kind = "surfing"
    nums = re.fullmatch(r"(\d+)(?:[-–](\d+))?", raw.get("niveau", ""))
    levels = {"min": int(nums[1]), "max": int(nums[2] or nums[1])} if nums else None
    rates = {}
    for name, value in raw.items():
        if name == "taux" or name.startswith("taux-"):
            rates[name.removeprefix("taux-") if name != "taux" else "all"] = plain(value)
    return {
        "kind": kind,
        "method": medium.replace(",,", " · "),
        "levels": levels,
        "levelLabel": raw.get("niveau", ""),
        "rates": rates,
        "versions": versions,
        "requirements": requirement(medium),
        "raw": raw,
    }


def build():
    """Species with their encounters, and the places they refer to."""
    js = (APP_DATA / "battle-dex.js").read_text()
    dex = json.loads(js.split("const BATTLE_DEX=", 1)[1].split(";\n", 1)[0])
    by_name = {key(v["name"]): int(k) for k, v in dex.items()}
    pages = revisions([MODULE, MODULE + "/Indisponibles"], "bdsp-localisations")
    module = pages[MODULE]
    raw = LuaLiteral(module["revisions"][0]["slots"]["main"]["*"]).parse()
    unavailable = LuaLiteral(pages[MODULE + "/Indisponibles"]["revisions"][0]["slots"]["main"]["*"]).parse()
    catalog = {
        "schemaVersion": 1,
        "game": "brilliant-diamond",
        "gameVersions": ["brilliant-diamond", "shining-pearl"],
        "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sources": [
            {
                "url": wiki_url(MODULE),
                "revision": module["revisions"][0]["revid"],
                "license": "CC BY-NC-SA 3.0",
                "attribution": "Poképédia et ses contributeurs",
            }
        ],
        "species": [],
        "places": {},
        "issues": [],
    }
    mons = {
        int(i): {
            **v,
            "source": wiki_url(v["name"]),
            "encounters": [],
            "evolutions": [],
            "availability": "unknown",
            "notes": [],
        }
        for i, v in dex.items()
    }
    for place, entries in raw.items():
        base, _, sub = place.partition("@")
        place_id = key(place)
        catalog["places"][place_id] = {
            "id": place_id,
            "name": base,
            "subarea": sub or None,
            "source": wiki_url(base),
            "map": None,
        }
        for name, methods in entries.items():
            id = by_name.get(key(name.split(" forme(")[0]))
            if not id:
                catalog["issues"].append({"kind": "unmatched-species", "name": name, "place": place})
                continue
            for method in methods:
                encounter = normalize_encounter(method)
                encounter.update(placeId=place_id, source=wiki_url(base), sourceSpecies=name)
                mons[id]["encounters"].append(encounter)
    for name, text in unavailable.items():
        id = by_name.get(key(name))
        if id:
            mons[id]["notes"].append(plain(text))
    for mon in mons.values():
        mon["availability"] = (
            "direct"
            if any("brilliant-diamond" in e["versions"] for e in mon["encounters"])
            else "other-version"
            if mon["encounters"]
            else "indirect-or-unavailable"
        )
    catalog["species"] = list(mons.values())
    (CACHE / "bdsp-base.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2))
    print(
        "Base:",
        len(mons),
        "species,",
        len(raw),
        "places,",
        sum(len(m["encounters"]) for m in mons.values()),
        "encounters;",
        len(catalog["issues"]),
        "unmatched entries",
        flush=True,
    )
    return catalog


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    REFRESH = args.refresh
    build()
