from __future__ import annotations

import contextlib
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from agentsam_sdk import AgentSamClient
from agentsam_sdk.assets import AssetInventoryError, AssetsClient
from agentsam_sdk.cli import main
from agentsam_sdk.diagnostics import inspect_installation
from agentsam_sdk.terminal_ui import show_error
from rich.console import Console


class AssetInventoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "model.step").write_bytes(b"geometry")
        (self.root / "scene.GLB").write_bytes(b"glb")
        (self.root / "notes.txt").write_text("ignored")
        (self.root / ".hidden.stl").write_bytes(b"hidden")
        (self.root / "nested").mkdir()
        (self.root / "nested" / "toolpath.nc").write_text("fixture only")
        (self.root / "node_modules").mkdir()
        (self.root / "node_modules" / "nope.obj").write_bytes(b"skip")

    def test_client_assets_inventory_is_native_and_deterministic(self):
        client = AgentSamClient(cwd=self.root, node="/missing/node")
        result = client.assets.inventory(include_hashes=True)
        self.assertEqual(result["schema"], "agentsam.assets.inventory.v1")
        self.assertEqual(result["total"], 3)
        self.assertEqual(result["by_kind"], {"cad": 1, "scene": 1, "toolpath": 1})
        self.assertEqual(
            {row["path"] for row in result["items"]},
            {"model.step", "nested/toolpath.nc", "scene.GLB"},
        )
        self.assertEqual(
            next(row["sha256"] for row in result["items"] if row["path"] == "model.step"),
            hashlib.sha256(b"geometry").hexdigest(),
        )
        self.assertFalse(result["truncated"])
        self.assertIn("not verified", result["note"])
        operation = client.invoke("assets.inventory", {"path": ".", "limit": 10})
        self.assertTrue(operation["ok"])
        self.assertEqual(operation["data"]["total"], 3)
        self.assertEqual(operation["usage"]["provider_calls"], 0)
        self.assertEqual(operation["receipt"]["execution"]["lane"], "local")
        self.assertEqual(client.status("assets.inventory")["readiness"], "available")
        self.assertIn("assets.inventory", [row["id"] for row in client.discover(query="assets")["operations"]])

    def test_scoped_paths_and_symlinks_are_not_followed(self):
        outside = self.root.parent / "outside.glb"
        try:
            (self.root / "escape.glb").symlink_to(outside)
            (self.root / "escape-dir").symlink_to(self.root.parent, target_is_directory=True)
        except OSError:
            pass
        result = AssetsClient(self.root).inventory()
        self.assertEqual(result["total"], 3)
        with self.assertRaises(AssetInventoryError) as error:
            AssetsClient(self.root).inventory("../")
        self.assertEqual(error.exception.code, "asset_inventory_path_outside_scope")
        with self.assertRaises(AssetInventoryError):
            AssetsClient(self.root).inventory("/")

    def test_bounded_scans_flag_truncation(self):
        result = AssetsClient(self.root).inventory(limit=2)
        self.assertEqual(result["total"], 2)
        self.assertTrue(result["truncated"])
        self.assertEqual(AssetsClient(self.root).inventory(max_depth=0)["total"], 2)
        with self.assertRaises(AssetInventoryError):
            AssetsClient(self.root).inventory(limit=0)


class CliDistributionTests(unittest.TestCase):
    def test_public_cli_version(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            with self.assertRaises(SystemExit) as exit_state:
                main(["--version"])
        self.assertEqual(exit_state.exception.code, 0)
        import agentsam_sdk
        self.assertIn(f"agentsam-sdk {agentsam_sdk.__version__}", output.getvalue())

    def test_installed_doctor_and_json_inventory_preserve_stdout(self):
        output, errors = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            self.assertEqual(main(["doctor", "--json"]), 0)
        self.assertEqual(errors.getvalue(), "")
        self.assertTrue(json.loads(output.getvalue())["ok"])
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "object.glb").write_bytes(b"test")
            output, errors = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                self.assertEqual(main(["assets", "inventory", tmp, "--format", "json"]), 0)
            self.assertEqual(errors.getvalue(), "")
            self.assertEqual(json.loads(output.getvalue())["total"], 1)

    def test_invalid_inventory_reports_resolution_without_traceback(self):
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = main(["assets", "inventory", "--limit", "0"])
        self.assertEqual(code, 2)
        self.assertIn("next:", stderr.getvalue().lower())
        self.assertNotIn("Traceback", stderr.getvalue())

    def test_native_cad_proof_is_explicit(self):
        with mock.patch("agentsam_sdk.cad.occt.probe_occt", return_value={"ready": False, "error": "occt_host_not_found"}):
            result = inspect_installation(verify_cad=True)
        self.assertFalse(result["ok"])
        self.assertEqual(result["checks"][-1]["state"], "unavailable")
        self.assertNotEqual(inspect_installation(verify_cad=False)["checks"][-1]["state"], "verified")

    def test_interactive_default_uses_same_parser_and_rich_home(self):
        from agentsam_sdk.cli import build_parser
        from agentsam_sdk.terminal_ui import run_home

        class TtyStream(io.StringIO):
            def isatty(self):
                return True

        captured = TtyStream()
        with mock.patch("sys.stdin", TtyStream()), mock.patch("sys.stderr", captured):
            with mock.patch("agentsam_sdk.terminal_ui.Prompt.ask", side_effect=["help", "exit"]):
                self.assertEqual(run_home(build_parser()), 0)
        self.assertIn("AgentSam CLI", captured.getvalue())
        self.assertIn("Local tools", captured.getvalue())
        self.assertIn("Commands", captured.getvalue())

    def test_error_renderer_can_supply_verified_resolution_url(self):
        class BudgetError(ValueError):
            code = "provider_budget_exhausted"
            provider = "anthropic"

        output = io.StringIO()
        show_error(BudgetError("Balance unavailable"), console=Console(file=output, force_terminal=False))
        self.assertIn("https://platform.claude.com/settings/billing", output.getvalue())
        self.assertIn("next:", output.getvalue().lower())


if __name__ == "__main__":
    unittest.main()
