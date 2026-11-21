"""Offline publication-path invariants. No Cloudflare access or staging needed."""
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
module_path = ROOT / "scripts/schema-registry/publish_package_schemas.py"
spec = importlib.util.spec_from_file_location("scene_schema_publisher", module_path)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SceneV2PublicationTests(unittest.TestCase):
    def test_versioned_schema_paths_match_declared_ids_without_replacing_v1(self):
        registry = {item[0]: item for item in module.PACKAGE_SPECS}
        for slug, wanted in [
            ("iamscene-v2", "https://schemas.inneranimalmedia.com/packages/iamscene/v2/scene.canonical.schema.json"),
            ("agentsam-contracts-scene-v2", "https://schemas.inneranimalmedia.com/packages/agentsam-contracts/v2/scene-document.schema.json"),
        ]:
            entry = registry[slug]
            publication_slug = entry[8]
            self.assertEqual(len(entry[7]), 1)
            source, published_name = entry[7][0]
            self.assertTrue((ROOT / source).is_file())
            self.assertEqual(f"https://schemas.inneranimalmedia.com/packages/{publication_slug}/{entry[6]}/{published_name}", wanted)
            self.assertEqual(json.loads((ROOT / source).read_text())["$id"], wanted)
        v1 = registry["iamscene"]
        self.assertEqual(v1[6], "v1")
        self.assertEqual(v1[7][0][1], "scene.canonical.schema.json")
        self.assertNotIn("theme-heuristic", registry, "removed source pack should not be advertised as publishable")
    def test_scene_pack_ids_are_distinct_and_sources_exist(self):
        ids=[item[4] for item in module.PACKAGE_SPECS]
        self.assertEqual(len(ids),len(set(ids)))
        for entry in module.PACKAGE_SPECS:
            self.assertTrue((ROOT / entry[2]).exists(),entry[0])
            for source,_ in entry[7]:
                self.assertTrue((ROOT / source).exists(), source)

if __name__ == "__main__":
    unittest.main()
