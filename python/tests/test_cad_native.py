"""CAD engine discovery has explicit Darwin/Linux/Windows contract tests."""
import json
import os
import subprocess
import sys
import tempfile
import types
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


    def test_command_mode_hands_adapter_its_argv_through_a_fixed_trampoline(self):
        # FreeCADCmd rejects --operation/--request itself, so they must never be top-level argv.
        host = FreeCADHost("/opt/fc/bin/FreeCADCmd", "command", "linux", "test")
        adapter, request = "/srv/ad'apter\"; import os.py", "/tmp/r\nq.json"
        command = host.adapter_command(adapter, request, operation="inspect")
        self.assertEqual(command[:2], ["/opt/fc/bin/FreeCADCmd", "-c"])
        self.assertEqual(len(command), 3)
        self.assertNotIn("--operation", command)
        captured, saved = {}, list(sys.argv)
        fake = types.SimpleNamespace(run_path=lambda path, run_name: captured.update(
            path=path, run_name=run_name, argv=list(sys.argv)))
        try:
            with patch.dict(sys.modules, {"runpy": fake}):
                exec(command[2], {})
        finally:
            sys.argv[:] = saved
        self.assertEqual(captured["path"], adapter)
        self.assertEqual(captured["run_name"], "__main__")
        self.assertEqual(captured["argv"], [adapter, "--operation", "inspect", "--request", request])

    def test_python_mode_adapter_argv_is_direct(self):
        host = FreeCADHost("/opt/fc/bin/python", "python", "linux", "test", "/opt/fc/lib")
        self.assertEqual(
            host.adapter_command("/srv/adapter.py", "/tmp/r.json"),
            ["/opt/fc/bin/python", "/srv/adapter.py", "--operation", "build", "--request", "/tmp/r.json"],
        )

    def test_macos_user_level_bundle_and_lowercase_command_name(self):
        home = "/Users/example/Applications/FreeCAD.app/Contents/Resources"
        host = discover_freecad(
            platform_name="darwin", environment={"HOME": "/Users/example"},
            exists=lambda path: path == home + "/bin/python", which=lambda name: None,
        )
        self.assertEqual((host.executable, host.mode, host.library_dir), (home + "/bin/python", "python", home + "/lib"))
        root = "/Applications/FreeCAD.app/Contents/Resources"
        host = discover_freecad(
            platform_name="darwin", environment={"HOME": "/Users/example"},
            exists=lambda path: path == root + "/bin/freecadcmd", which=lambda name: None,
        )
        self.assertEqual((host.executable, host.mode), (root + "/bin/freecadcmd", "command"))

    def test_linux_lib64_layout(self):
        host = discover_freecad(
            platform_name="linux", environment={"HOME": "/home/runner"},
            exists=lambda path: path in ("/usr/lib64/freecad/lib/FreeCAD.so", "/usr/bin/python3"),
            which=lambda name: "/usr/bin/python3" if name == "python3" else None,
        )
        self.assertEqual((host.executable, host.library_dir), ("/usr/bin/python3", "/usr/lib64/freecad/lib"))

    def test_real_adapter_runs_in_every_installed_mode(self):
        """Skipped unless FreeCAD and the SDK adapter are present; proves the launcher, not mocks."""
        adapter = Path(__file__).resolve().parents[2] / "services" / "cad" / "freecad" / "adapter.py"
        found = discover_freecad()
        if found is None or not adapter.is_file() or not probe_freecad(found).get("ready"):
            self.skipTest("FreeCAD or the SDK adapter is not available here")
        hosts = [found]
        for name in ("FreeCADCmd", "freecadcmd", "FreeCADCmd.exe"):
            sibling = Path(found.executable).with_name(name)
            if sibling.is_file():
                hosts.append(FreeCADHost(str(sibling), "command", found.platform, "test", found.library_dir))
                break
        for host in hosts:
            with self.subTest(mode=host.mode), tempfile.TemporaryDirectory() as directory:
                request = Path(directory) / "request.json"
                request.write_text(json.dumps({
                    "schema_version": 1, "output": str(Path(directory) / "box.step"), "format": "step",
                    "operations": [{"op": "box", "name": "b", "length": 2, "width": 3, "height": 4}],
                }))
                done = subprocess.run(host.adapter_command(adapter, request), capture_output=True, text=True,
                                      env=host.environment(), timeout=120, check=False)
                receipt = json.loads([l for l in done.stdout.splitlines() if l.startswith("AGENTSAM_RESULT=")][-1][16:])
                self.assertEqual(done.returncode, 0)
                self.assertTrue(receipt["ok"])
                self.assertAlmostEqual(receipt["metrics"]["volume"], 24.0, places=6)


if __name__ == "__main__":
    unittest.main()
