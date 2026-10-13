#!/usr/bin/env python3
"""Regenerate every data file of the app, from cached sources or from the current ones.

Without ``--refresh`` the cached responses are reused, so the output is reproducible offline.
"""

import argparse
import time

import build_battle_guide
import build_catalog
import build_context
import enrich_catalog
from build_catalog import CACHE, SESSION, revisions

POKEAPI_CSV = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"
SPECIES_PAGES_PER_REQUEST = 40


def download(remote_name, local_name, refresh):
    """Fetch one PokeAPI table unless a cached copy can be reused."""
    file = CACHE / local_name
    if refresh or not file.exists():
        response = SESSION.get(POKEAPI_CSV + remote_name, timeout=60)
        response.raise_for_status()
        file.write_text(response.text)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh", action="store_true", help="Retrieve current source revisions instead of cached responses"
    )
    args = parser.parse_args()
    build_catalog.REFRESH = args.refresh

    # Species pages hold the evolution tables read by enrich_catalog.
    names = [species["name"] for species in build_catalog.build()["species"]]
    for start in range(0, len(names), SPECIES_PAGES_PER_REQUEST):
        batch = names[start : start + SPECIES_PAGES_PER_REQUEST]
        revisions(batch, "species-" + str(start // SPECIES_PAGES_PER_REQUEST))
        print("Species sources:", min(start + len(batch), len(names)), "/", len(names), flush=True)
        time.sleep(0.1)
    revisions(["Modèle:TableauEvolutionEvoli"], "eevee-evolution-template")
    revisions(["Pokémon Diamant Étincelant et Perle Scintillante"], "bdsp-game-page")
    download("pokemon_species.csv", "pokemon-species.csv", args.refresh)
    enrich_catalog.build()

    for name in ["pokemon.csv", "pokemon_stats.csv", "pokemon_stats_past.csv", "moves.csv"]:
        download(name, name, args.refresh)
    build_battle_guide.build()
    build_context.build()


if __name__ == "__main__":
    main()
