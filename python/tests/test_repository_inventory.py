import unittest
from tempfile import TemporaryDirectory
from pathlib import Path

from agentsam_sdk.repository import inventory
from agentsam_sdk.runtime.contract import ToolInput


class TestRepositoryInventory(unittest.TestCase):
    def test_counts_files_by_category_size_and_extension(self):
        with TemporaryDirectory() as repo, TemporaryDirectory() as out:
            root = Path(repo)
            (root / "src").mkdir()
            (root / "src" / "a.py").write_text("x" * 100)
            (root / "src" / "b.py").write_text("y" * 50)
            (root / "docs").mkdir()
            (root / "docs" / "c.md").write_text("z" * 20)
            (root / "node_modules").mkdir()
            (root / "node_modules" / "skip.js").write_text("skip me" * 1000)

            ti = ToolInput(
                params={"repo_root": str(root), "top": 5, "by_ext": True},
                output_dir=out,
            )
            result = inventory.run(ti)

            self.assertTrue(result.ok)
            self.assertEqual(result.data["file_total"], 3)  # node_modules excluded
            self.assertEqual(result.data["by_extension"][".py"], 2)
            self.assertEqual(result.data["by_top_level_dir"]["src"], 2)
            ids = {c["id"] for c in result.data["categories"]}
            self.assertIn("worker_src", ids)
            self.assertIn("docs", ids)
            self.assertGreater(result.data["totals"]["bytes"], 0)
            self.assertTrue((Path(out) / "repository-inventory.json").exists())
            self.assertTrue((Path(out) / "repository-inventory.md").exists())
            # largest list prefers bigger src file
            self.assertEqual(result.data["largest_files"][0]["path"], "src/a.py")

    def test_missing_repo_root_is_reported_not_raised(self):
        ti = ToolInput(params={"repo_root": "/definitely/does/not/exist/xyz"})
        result = inventory.run(ti)
        self.assertFalse(result.ok)
        self.assertEqual(result.error, "repo_root_not_found")

    def test_categorize_helpers(self):
        self.assertEqual(inventory.categorize(Path("dashboard/App.tsx")), "dashboard")
        self.assertEqual(inventory.categorize(Path("README.md")), "root_misc")
        self.assertIn("KiB", inventory.human_bytes(2048))


if __name__ == "__main__":
    unittest.main()
