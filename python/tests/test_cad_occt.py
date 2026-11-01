"""Dedicated OCCT binary must prove actual STEP export and reopen."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from agentsam_sdk.cad.occt import _receipt, discover_occt, probe_occt


class NativeOcctTests(unittest.TestCase):
    def test_missing_binary_is_not_ready(self):
        with patch("agentsam_sdk.cad.occt.discover_occt", return_value=None):
            self.assertEqual(
                probe_occt(),
                {"installed": False, "ready": False, "error": "occt_host_not_found"},
            )

    def test_explicit_override_resolves_without_shell(self):
        with tempfile.TemporaryDirectory() as temp:
            exe = Path(temp) / "agentsam-occt"
            exe.write_bytes(b"test")
            self.assertEqual(discover_occt(environment={"AGENTSAM_OCCT_BIN": str(exe)}), str(exe))

    def test_native_receipts_ignore_unstructured_engine_output(self):
        self.assertIsNone(_receipt("OCCT debug output\n"))
        self.assertEqual(_receipt('OCCT logs\nAGENTSAM_RESULT={"ok":true,"volume_mm3":6000}\n')["volume_mm3"], 6000)

    def test_three_real_native_commands_required(self):
        class Result:
            def __init__(self, receipt):
                self.returncode = 0
                self.stderr = ""
                self.stdout = "AGENTSAM_RESULT=" + json.dumps(receipt)
        calls = []
        def run(argv, **kwargs):
            calls.append(argv[1])
            if argv[1] == "--doctor":
                return Result({"ok": True, "version": "7.9.3", "capabilities": ["solid.export.step"]})
            if argv[1] == "--box":
                Path(argv[-1]).write_bytes(b"sample-step")
                return Result({"ok": True, "volume_mm3": 6000})
            return Result({"ok": True, "volume_mm3": 6000})
        with patch("agentsam_sdk.cad.occt.subprocess.run", side_effect=run):
            result = probe_occt("/tmp/fake-occt")
        self.assertTrue(result["ready"])
        self.assertEqual(calls, ["--doctor", "--box", "--inspect"])
        self.assertEqual(result["step_size_bytes"], len(b"sample-step"))


if __name__ == "__main__":
    unittest.main()
