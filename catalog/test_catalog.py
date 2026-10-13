#!/usr/bin/env python3
"""Checks on the generated catalogue and on the parsers that produce it."""

import json
import unittest

import build_catalog
from build_catalog import CATALOG


class CatalogueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((CATALOG / "bdsp-catalog.json").read_text())
        cls.mons = {m["dex"]: m for m in cls.data["species"]}

    def test_coverage_and_references(self):
        self.assertEqual(set(self.mons), set(range(1, 494)))
        for mon in self.mons.values():
            for e in mon["encounters"]:
                self.assertIn(e["placeId"], self.data["places"])
                self.assertTrue(e["source"].startswith("https://www.pokepedia.fr/"))
            for e in mon["evolutions"]:
                self.assertIn(e["to"], self.mons)
                self.assertEqual(e["from"], mon["dex"])

    def test_gible_conditions_and_map(self):
        gible = self.mons[443]
        surface = [e for e in gible["encounters"] if "egaresentreesecrete" in e["placeId"]]
        self.assertEqual(len(surface), 1)
        self.assertEqual(surface[0]["levels"], {"min": 15, "max": 17})
        self.assertEqual(surface[0]["ratesByVersion"]["brilliant-diamond"]["all"], "15")
        underground = [e for e in gible["encounters"] if "Badge Glaçon" in e["method"]]
        self.assertEqual(len(underground), 3)
        for e in underground:
            self.assertEqual(self.data["places"][e["placeId"]]["map"]["kind"], "underground-access")

    def test_garchomp_evolution(self):
        self.assertEqual(self.mons[444]["evolvesFrom"][0]["level"], 24)
        self.assertEqual(self.mons[445]["evolvesFrom"][0]["level"], 48)

    def test_riolu_gift_and_lucario(self):
        self.assertEqual(self.mons[447]["encounters"][0]["kind"], "gift")
        self.assertEqual(self.mons[447]["encounters"][0]["levelLabel"], "Œuf")
        edge = self.mons[448]["evolvesFrom"][0]
        self.assertEqual(edge["from"], 447)
        self.assertIn("jour", edge["condition"])
        self.assertIn("Bonheur", edge["condition"])

    def test_version_rates(self):
        e = build_catalog.normalize_encounter(
            {"milieu": "Hautes herbes", "niveau": "5-7", "taux": "Peu commun, PS"}
        )
        self.assertEqual(e["versions"], ["shining-pearl"])
        e = build_catalog.normalize_encounter(
            {"milieu": "Hautes herbes", "niveau": "5-7", "taux": "20, DE, 2, PS"}
        )
        self.assertEqual(len(e["versions"]), 2)
        mixed = [
            e
            for mon in self.mons.values()
            for e in mon["encounters"]
            if e["raw"].get("taux") == "20, DE, 2, PS"
        ]
        self.assertTrue(mixed)
        self.assertEqual(mixed[0]["ratesByVersion"]["brilliant-diamond"]["all"], "20")
        self.assertEqual(mixed[0]["ratesByVersion"]["shining-pearl"]["all"], "2")

    def test_eevee_bdsp_conditions(self):
        edge = self.mons[470]["evolvesFrom"][0]
        self.assertIn("Pierre Mousse", edge["condition"])
        self.assertNotIn("Pierre Plante", edge["condition"])
        self.assertNotIn(700, self.mons)

    def test_unknown_roaming_is_not_pinned(self):
        place = next(p for p in self.data["places"].values() if p["map"]["kind"] == "roaming")
        self.assertEqual(place["map"]["anchors"], [])
        for place in self.data["places"].values():
            for a in place["map"]["anchors"]:
                self.assertTrue(0 <= a["x"] <= 100 and 0 <= a["y"] <= 100)

    def test_exclusivity_crosscheck(self):
        self.assertEqual(self.data["versionExclusives"]["200"], "shining-pearl")
        for e in self.mons[200]["encounters"]:
            self.assertEqual(e["versions"], ["shining-pearl"])
        corrected = [e for e in self.mons[200]["encounters"] if e.get("sourceConsistency")]
        self.assertTrue(corrected)
        self.assertIn("revision", corrected[0]["sourceConsistency"])

    def test_no_execution_of_lua(self):
        self.assertEqual(
            build_catalog.LuaLiteral('return { ["x"] = {{["a"] = "hello"}} }').parse(),
            {"x": [{"a": "hello"}]},
        )
        for script in [
            'return os.execute("anything")',
            'return { ["x"] = function() end }',
            'return {}; os.execute("anything")',
        ]:
            with self.assertRaises(ValueError):
                build_catalog.LuaLiteral(script).parse()


if __name__ == "__main__":
    unittest.main()
