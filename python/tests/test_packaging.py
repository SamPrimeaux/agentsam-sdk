import re
import unittest
from pathlib import Path

import agentsam_sdk

try:
    import tomllib
except ModuleNotFoundError:  # Python 3.10
    tomllib = None

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipIf(tomllib is None, "tomllib needs Python 3.11+")
class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.meta = tomllib.loads((ROOT / "pyproject.toml").read_text())

    def test_version_is_single_sourced(self):
        self.assertIn("version", self.meta["project"]["dynamic"])
        self.assertNotIn("version", self.meta["project"])
        self.assertRegex(agentsam_sdk.__version__, r"^\d+\.\d+\.\d+")

    def test_required_pypi_metadata(self):
        project = self.meta["project"]
        for key in ("name", "description", "readme", "license", "authors", "classifiers"):
            self.assertIn(key, project)
        self.assertIn("urls", self.meta["project"])
        self.assertTrue((ROOT / "LICENSE").is_file())
        self.assertTrue((ROOT / "agentsam_sdk" / "py.typed").is_file())

    def test_readme_has_no_repo_relative_links(self):
        text = (ROOT / "README.md").read_text()
        self.assertIsNone(re.search(r"\]\(\.\./", text), "PyPI cannot resolve ../ links")

    def test_core_stays_stdlib_only(self):
        self.assertEqual(self.meta["project"]["dependencies"], [])


if __name__ == "__main__":
    unittest.main()
