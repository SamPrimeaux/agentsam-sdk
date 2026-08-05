"""Unit tests for agentsam_sdk.repository.inspect — call SDK directly (no subprocess)."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from agentsam_sdk.repository.inspect import (
    build_report,
    find_dupes,
    summarize,
    walk_repo,
)


class TestRepositoryInspect(unittest.TestCase):
    def test_walk_summarize_and_dupes_via_direct_import(self):
        """Proof of SDK reuse: import + call without shelling out to repo_inspect.py."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "src").mkdir()
            (root / "src" / "a.txt").write_bytes(b"hello-dup")
            (root / "copy").mkdir()
            (root / "copy" / "b.txt").write_bytes(b"hello-dup")  # identical content
            (root / "src" / "unique.txt").write_bytes(b"only-once-content-xyz")
            (root / "node_modules").mkdir()
            (root / "node_modules" / "skip.js").write_bytes(b"x" * 5000)

            errors: list[dict] = []
            files = walk_repo(root, errors=errors)
            paths = {f["path"] for f in files}
            self.assertIn("src/a.txt", paths)
            self.assertIn("copy/b.txt", paths)
            self.assertIn("src/unique.txt", paths)
            self.assertNotIn("node_modules/skip.js", paths)

            rollup = summarize(files, recent_n=10, largest_n=10)
            self.assertEqual(rollup["file_count"], 3)
            self.assertGreater(rollup["total_bytes"], 0)

            warnings: list[str] = []
            dupes = find_dupes(files, repo_root=root, warnings=warnings)
            self.assertEqual(len(dupes), 1)
            group = dupes[0]
            self.assertEqual(group["count"], 2)
            self.assertEqual(group["size_bytes"], len(b"hello-dup"))
            self.assertEqual(group["wasted_bytes"], len(b"hello-dup"))
            self.assertEqual(set(group["paths"]), {"src/a.txt", "copy/b.txt"})
            self.assertEqual(len(group["sha256"]), 64)

            report = build_report(root, include_dupes=True, recent_n=5, largest_n=5)
            self.assertIn("summary", report)
            self.assertIn("recent", report)
            self.assertIn("largest", report)
            self.assertEqual(report["summary"]["duplicate_groups"], 1)
            self.assertEqual(report["summary"]["duplicate_wasted_bytes"], len(b"hello-dup"))
            self.assertEqual(len(report["duplicates"]), 1)

    def test_find_dupes_skips_unreadable_without_crash(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "ok.txt").write_bytes(b"same")
            (root / "also.txt").write_bytes(b"same")
            # Fabricate a row pointing at a missing path (same size) — hash should warn
            files = walk_repo(root)
            files.append(
                {
                    "path": "missing-ghost.txt",
                    "top_dir": "(root)",
                    "ext": ".txt",
                    "size_bytes": len(b"same"),
                    "mtime_unix": 0,
                }
            )
            warnings: list[str] = []
            errors: list[dict] = []
            dupes = find_dupes(files, repo_root=root, warnings=warnings, errors=errors)
            self.assertTrue(any("missing-ghost" in w for w in warnings))
            self.assertEqual(len(dupes), 1)
            self.assertEqual(dupes[0]["count"], 2)


if __name__ == "__main__":
    unittest.main()
