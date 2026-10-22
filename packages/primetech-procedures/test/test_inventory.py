from __future__ import annotations

import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "procedures" / "repo.asset.inventory" / "run.py"
spec = importlib.util.spec_from_file_location("primetech_asset_inventory", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


class AssetInventoryTests(unittest.TestCase):
    def test_inventory_is_read_only_deterministic_and_hashes_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cad = root / "model.FCStd"
            cad.write_bytes(b"real native cad")
            (root / "scene.blend").write_bytes(b"real scene")
            (root / ".hidden").mkdir()
            (root / ".hidden" / "secret.ifc").write_bytes(b"hidden")
            (root / "node_modules").mkdir()
            (root / "node_modules" / "vendor.stl").write_bytes(b"vendor")
            external = root.parent / (root.name + "-outside")
            external.mkdir()
            (external / "outside.ifc").write_bytes(b"outside")
            (root / "linked").symlink_to(external, target_is_directory=True)
            first = module.inventory(root, {})
            second = module.inventory(root, {})
            self.assertEqual(first, second)
            self.assertEqual(first["total"], 2)
            self.assertEqual(first["counts"], {"blender": 1, "freecad": 1})
            self.assertEqual({row["path"] for row in first["assets"]}, {"model.FCStd", "scene.blend"})
            for row in first["assets"]:
                self.assertEqual(row["hash_status"], "hashed")
                self.assertEqual(row["sha256"], hashlib.sha256((root / row["path"]).read_bytes()).hexdigest())
            self.assertEqual(first["engine"]["name"], "python")
            self.assertFalse(first["truncated"])
            import shutil
            shutil.rmtree(external, ignore_errors=True)

    def test_inventory_rejects_unexpected_input_and_does_not_write_project_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "model.step").write_bytes(b"step")
            before = sorted(path.relative_to(root).as_posix() for path in root.rglob("*"))
            with self.assertRaisesRegex(ValueError, "inventory_input_must_be_empty_object"):
                module.inventory(root, {"project_root": "/tmp"})
            after = sorted(path.relative_to(root).as_posix() for path in root.rglob("*"))
            self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
