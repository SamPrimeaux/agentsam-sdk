from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from agentsam_sdk.repository.intelligence import build_snapshot, render_text
from agentsam_sdk.repository.intelligence.discovery import active_paths


class TestRepositoryIntelligence(unittest.TestCase):
    def test_snapshot_discovers_arbitrary_layout_without_repo_presets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "engine").mkdir()
            (root / "web").mkdir()
            (root / "notes").mkdir()
            (root / "engine" / "main.py").write_text("def main():\n    return 1\n", encoding="utf-8")
            (root / "web" / "App.tsx").write_text("export const App = () => <main />;\n", encoding="utf-8")
            (root / "notes" / "design.md").write_text("# Design\n", encoding="utf-8")
            (root / "package.json").write_text(json.dumps({"name": "fixture"}), encoding="utf-8")

            snapshot = build_snapshot(root, churn_days=30, top=10)

            self.assertEqual(snapshot["summary"]["file_count"], 4)
            self.assertEqual(snapshot["discovery"], "filesystem")
            top = {row["path"] for row in snapshot["top_level"]}
            self.assertTrue({"engine", "web", "notes"}.issubset(top))
            languages = {row["language"] for row in snapshot["languages"]}
            self.assertIn("Python", languages)
            self.assertIn("TypeScript", languages)
            self.assertIn({"path": "package.json", "kind": "node"}, snapshot["manifests"])
            self.assertIn("Pressure points:", render_text(snapshot))

    def test_git_discovery_respects_gitignore_and_churn(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            try:
                subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
                subprocess.run(["git", "config", "user.email", "fixture@example.com"], cwd=root, check=True)
                subprocess.run(["git", "config", "user.name", "Fixture"], cwd=root, check=True)
            except (FileNotFoundError, subprocess.CalledProcessError):
                self.skipTest("git unavailable")

            (root / ".gitignore").write_text("ignored/\n", encoding="utf-8")
            (root / "src").mkdir()
            (root / "ignored").mkdir()
            (root / "src" / "a.py").write_text("x = 1\n", encoding="utf-8")
            (root / "ignored" / "noise.js").write_text("x" * 1000, encoding="utf-8")
            subprocess.run(["git", "add", "."], cwd=root, check=True)
            subprocess.run(["git", "commit", "-m", "initial"], cwd=root, check=True, capture_output=True)
            (root / "src" / "a.py").write_text("x = 1\ny = 2\n", encoding="utf-8")
            subprocess.run(["git", "add", "src/a.py"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-m", "touch source"], cwd=root, check=True, capture_output=True)

            paths, source = active_paths(root)
            self.assertEqual(source, "git")
            self.assertIn("src/a.py", paths)
            self.assertNotIn("ignored/noise.js", paths)

            snapshot = build_snapshot(root, churn_days=30, top=10)
            self.assertGreaterEqual(snapshot["summary"]["changed_file_count"], 1)
            self.assertTrue(any(row["path"] == "src/a.py" for row in snapshot["hot_files"]))


if __name__ == "__main__":
    unittest.main()
