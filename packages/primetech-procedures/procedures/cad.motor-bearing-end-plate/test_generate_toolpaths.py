#!/usr/bin/env python3
"""Pure-Python regression test for generated toolpaths and review-only NC output."""
from __future__ import annotations
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree

PROC = Path(__file__).resolve().parent

class ToolpathGenerationTest(unittest.TestCase):
    def test_candidate_paths_and_nc_program_are_generated_and_checked(self):
        with tempfile.TemporaryDirectory(prefix="primetech-cam-test-") as temp:
            out = Path(temp)
            (out / "verification.json").write_text(
                json.dumps({"all_checks_pass": True}) + "\n", encoding="utf-8"
            )
            result = subprocess.run(
                [
                    sys.executable, str(PROC / "generate_toolpaths.py"),
                    "--parameters", str(PROC / "parameters.json"),
                    "--output-dir", str(out),
                ],
                capture_output=True, text=True, timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
            toolpath = json.loads((out / "toolpath.json").read_text(encoding="utf-8"))
            result_doc = json.loads((out / "toolpath-result.json").read_text(encoding="utf-8"))
            verification = json.loads((out / "gcode-verification.json").read_text(encoding="utf-8"))
            self.assertTrue(result_doc["ok"])
            self.assertTrue(verification["all_checks_pass"])
            self.assertGreater(toolpath["summary"]["move_count"], 700)
            self.assertGreater(result_doc["gcode_motion_line_count"], 700)
            self.assertEqual(toolpath["post_status"], "UNVERIFIED")
            operations = {row["id"] for row in toolpath["operations"]}
            self.assertTrue({"pocket-rough", "clearance-drill", "bore-interpolate", "counterbore-interpolate"} <= operations)
            nc = (out / "toolpath-unverified.nc").read_text(encoding="utf-8")
            self.assertIn("NOT APPROVED", nc)
            self.assertIn("UNVERIFIED", nc)
            self.assertIn("G21 G17 G90 G94", nc)
            self.assertIn("G54", nc)
            self.assertIn("M30", nc)
            self.assertTrue(all(check["pass"] for check in verification["checks"]))
            ElementTree.parse(out / "toolpath-preview.svg")

if __name__ == "__main__":
    unittest.main()
