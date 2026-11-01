"""CAD engine discovery has explicit Darwin/Linux/Windows contract tests."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from agentsam_sdk.cad import FreeCADHost, discover_freecad, probe_freecad


class NativeCADTests(unittest.TestCase):
    def test_macos_bundle_and_user_identity(self):
        root = "/Applications/FreeCAD.app/Contents/Resources"
        host = discover_freecad(
            platform_name="darwin",
            environment={"HOME": "/Users/example"},
            exists=lambda path: path == root + "/bin/python",
            which=lambda _: None,
        )
        self.assertIsNotNone(host)
        self.assertEqual(host.mode, "python")
        self.assertEqual(host.library_dir, root + "/lib")
        env = host.environment({"HOME": "/Users/example"})
        self.assertEqual(env["FREECAD_USER_HOME"], "/Users/example")
        self.assertEqual(env["LOGNAME"], "example")
        self.assertIn(root + "/lib", env["PYTHONPATH"])

    def test_linux_system_python_preserves_environment(self):
        host = discover_freecad(
            platform_name="linux",
            environment={"HOME": "/home/runner"},
            exists=lambda path: path in ("/usr/lib/freecad/lib/FreeCAD.so", "/usr/bin/python3"),
            which=lambda name: "/usr/bin/python3" if name == "python3" else None,
        )
        self.assertEqual(host.executable, "/usr/bin/python3")
        env = host.environment({"HOME": "/home/runner", "PYTHONPATH": "/workspace"})
        self.assertEqual(env["PYTHONPATH"], "/usr/lib/freecad/lib:/workspace")

    def test_windows_custom_root_and_path_separator(self):
        with tempfile.TemporaryDirectory() as root:
            bundle = Path(root) / "FreeCAD" / "bin"
            bundle.mkdir(parents=True)
            (bundle / "python.exe").touch()
            host = discover_freecad(
                platform_name="win32",
                environment={"AGENTSAM_FREECAD_HOME": str(Path(root) / "FreeCAD")},
            )
            self.assertIsNotNone(host)
            self.assertTrue(host.executable.endswith("python.exe"))
            env = host.environment({"USERPROFILE": r"C:\Users\Operator", "PATH": "C:\\Windows"})
            self.assertIn(";", env["PATH"])
            self.assertEqual(env["FREECAD_USER_HOME"], r"C:\Users\Operator")

    def test_missing_runtime_is_not_claimed_ready(self):
        self.assertEqual(
            probe_freecad(None), {"installed": False, "ready": False, "error": "freecad_host_not_found"}
        )

    def test_kernel_receipt_is_not_a_version_only_check(self):
        host = FreeCADHost("python3", "python", "linux", "test", "/some/lib")
        class Result:
            stdout = 'AGENTSAM_RESULT={"ok": true, "version": "1.1.1", "volume": 24, "kernel":"OCCT"}\n'
            stderr = ""
            returncode = 0
        with patch("agentsam_sdk.cad.native.subprocess.run", return_value=Result()) as run:
            receipt = probe_freecad(host)
        self.assertTrue(receipt["ready"])
        self.assertEqual(receipt["volume"], 24)
        self.assertIn("-c", run.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
