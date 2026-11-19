from __future__ import annotations

import contextlib
import io
import json
import unittest
from unittest import mock

from agentsam_sdk.cli import build_parser, main
from agentsam_sdk.diagnostics import inspect_installation
from agentsam_sdk.terminal_ui import show_error
from rich.console import Console


class CliDistributionTests(unittest.TestCase):
    def test_installed_cli_version(self):
        import agentsam_sdk
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            with self.assertRaises(SystemExit) as exit_state:
                main(["--version"])
        self.assertEqual(exit_state.exception.code, 0)
        self.assertIn(f"agentsam-sdk {agentsam_sdk.__version__}", output.getvalue())

    def test_installed_doctor_preserves_json_stdout(self):
        output, errors = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            self.assertEqual(main(["doctor", "--json"]), 0)
        self.assertEqual(errors.getvalue(), "")
        report = json.loads(output.getvalue())
        self.assertTrue(report["ok"])
        self.assertEqual(report["schema"], "agentsam.installation.diagnostic.v1")

    def test_interactive_default_uses_same_parser_and_rich_home(self):
        from agentsam_sdk.terminal_ui import run_home

        class TtyStream(io.StringIO):
            def isatty(self):
                return True

        captured = TtyStream()
        with mock.patch("sys.stdin", TtyStream()), mock.patch("sys.stderr", captured), mock.patch.dict("os.environ", {"CI": ""}):
            with mock.patch("agentsam_sdk.terminal_ui.Prompt.ask", side_effect=["help", "exit"]):
                self.assertEqual(run_home(build_parser()), 0)
        self.assertIn("AgentSam CLI", captured.getvalue())
        self.assertIn("Local tools", captured.getvalue())
        self.assertIn("Commands", captured.getvalue())

    def test_no_competing_inventory_command(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as caught:
                build_parser().parse_args(["assets", "inventory"])
        self.assertEqual(caught.exception.code, 2)

    def test_native_cad_proof_is_explicit(self):
        with mock.patch("agentsam_sdk.cad.occt.probe_occt", return_value={"ready": False, "error": "occt_host_not_found"}):
            result = inspect_installation(verify_cad=True)
        self.assertFalse(result["ok"])
        self.assertEqual(result["checks"][-1]["state"], "unavailable")
        self.assertNotEqual(inspect_installation(verify_cad=False)["checks"][-1]["state"], "verified")

    def test_canonical_procedure_error_has_resolution(self):
        class HostError(RuntimeError):
            code = "sam_procedure_host_not_configured"

        output = io.StringIO()
        show_error(HostError("Host unavailable"), console=Console(file=output, force_terminal=False))
        self.assertIn("authorized AgentSam procedure host", output.getvalue())
        self.assertIn("next:", output.getvalue().lower())

    def test_verified_provider_billing_link(self):
        class BudgetError(ValueError):
            code = "provider_budget_exhausted"
            provider = "anthropic"

        output = io.StringIO()
        show_error(BudgetError("Balance unavailable"), console=Console(file=output, force_terminal=False))
        self.assertIn("https://platform.claude.com/settings/billing", output.getvalue())


if __name__ == "__main__":
    unittest.main()
