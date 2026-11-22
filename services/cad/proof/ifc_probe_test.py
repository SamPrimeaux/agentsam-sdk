#!/usr/bin/env python3
"""Unit tests for the CAD service's IFC capability probe.

Simulates the machines a customer might have, with no real IFC install needed:
nothing installed, IfcOpenShell only, the full toolchain, a broken interpreter,
and several interpreters where the most capable one must win.

  python3 services/cad/proof/ifc_probe_test.py
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

SERVER = Path(__file__).resolve().parents[1] / "server.py"
spec = importlib.util.spec_from_file_location("cad_server_under_test", SERVER)
assert spec and spec.loader
server: Any = importlib.util.module_from_spec(spec)
sys.modules["cad_server_under_test"] = server
spec.loader.exec_module(server)

FULL = {"ifcopenshell": "0.8.4", "ezdxf": "1.4.5", "pymupdf": "1.28.2", "pillow": "13.0.0"}
IFC_ONLY = {"ifcopenshell": "0.8.4", "ezdxf": None, "pymupdf": None, "pillow": None}
NOTHING = dict.fromkeys(FULL)


class IfcProbeTest(unittest.TestCase):
    def setUp(self) -> None:
        server._IFC_RUNTIME = None
        self._orig = (server._ifc_candidates, server._probe_ifc_modules)
        self.calls = 0

    def tearDown(self) -> None:
        server._ifc_candidates, server._probe_ifc_modules = self._orig
        server._IFC_RUNTIME = None

    def machine(self, interpreters: dict[str, dict[str, Any] | None]) -> None:
        """Pretend these interpreters exist; value is their module versions, or None if broken."""
        server._ifc_candidates = lambda: [(py, {"PATH": "x"}, f"source-{py}") for py in interpreters]

        def fake(python: str, env: dict[str, str]) -> dict[str, Any] | None:
            self.calls += 1
            return interpreters[python]

        server._probe_ifc_modules = fake

    def test_full_toolchain_is_installed_and_ready(self) -> None:
        self.machine({"/a/python": FULL})
        tool = server._extended_tool_version("ifc")
        self.assertTrue(tool["installed"])
        self.assertTrue(tool["ready"])
        self.assertEqual(tool["missing"], [])
        self.assertTrue(tool["dxf"] and tool["pdf"])

    def test_ifcopenshell_alone_is_installed_but_not_ready(self) -> None:
        # The case the old probe got wrong: IFC works, DXF and PDF libraries are absent.
        self.machine({"/a/python": IFC_ONLY})
        tool = server._extended_tool_version("ifc")
        self.assertTrue(tool["installed"])
        self.assertFalse(tool["ready"])
        self.assertEqual(tool["missing"], ["ezdxf", "pymupdf", "pillow"])
        self.assertFalse(tool["dxf"] or tool["pdf"])
        self.assertEqual(tool["version"], "ifcopenshell 0.8.4")

    def test_nothing_installed_says_where_it_looked(self) -> None:
        self.machine({"/a/python": NOTHING, "/b/python": NOTHING})
        tool = server._extended_tool_version("ifc")
        self.assertFalse(tool["installed"])
        self.assertFalse(tool["ready"])
        self.assertEqual(tool["searched"], ["source-/a/python", "source-/b/python"])
        self.assertIn("ifcopenshell", tool["error"])

    def test_no_working_interpreter_does_not_crash(self) -> None:
        self.machine({"/broken/python": None})
        tool = server._extended_tool_version("ifc")
        self.assertFalse(tool["installed"])
        self.assertEqual(tool["modules"], NOTHING)

    def test_broken_interpreter_falls_through_to_a_working_one(self) -> None:
        self.machine({"/broken/python": None, "/ok/python": FULL})
        runtime = server._ifc_runtime()
        self.assertEqual(runtime["python"], "/ok/python")

    def test_most_capable_interpreter_wins_regardless_of_order(self) -> None:
        self.machine({"/first/python": IFC_ONLY, "/second/python": FULL})
        self.assertEqual(server._ifc_runtime()["python"], "/second/python")

    def test_ifcopenshell_outranks_a_larger_pile_of_other_libraries(self) -> None:
        other = {"ifcopenshell": None, "ezdxf": "1", "pymupdf": "1", "pillow": "1"}
        self.machine({"/other/python": other, "/ifc/python": IFC_ONLY})
        self.assertEqual(server._ifc_runtime()["python"], "/ifc/python")

    def test_equal_candidates_prefer_the_earlier_one(self) -> None:
        self.machine({"/override/python": FULL, "/system/python": FULL})
        self.assertEqual(server._ifc_runtime()["python"], "/override/python")

    def test_result_is_cached_briefly_then_refreshed(self) -> None:
        self.machine({"/a/python": IFC_ONLY})
        server._ifc_runtime()
        server._ifc_runtime()
        self.assertEqual(self.calls, 1, "second call within the TTL must not re-probe")
        server._IFC_RUNTIME = (server._IFC_RUNTIME[0] - server.IFC_RUNTIME_TTL_SECONDS - 1, server._IFC_RUNTIME[1])
        server._ifc_runtime()
        self.assertEqual(self.calls, 2, "after the TTL a fresh install must be noticed")

    def test_route_refuses_cleanly_when_ifcopenshell_is_missing(self) -> None:
        self.machine({"/a/python": NOTHING})
        with tempfile.TemporaryDirectory() as root:
            (Path(root) / "x.ifc").write_text("ISO-10303-21;", encoding="utf-8")
            work = Path(root) / "work"
            saved_roots, saved_work = os.environ.get("AGENTSAM_CAD_FILE_ROOTS"), server.WORK_ROOT
            os.environ["AGENTSAM_CAD_FILE_ROOTS"] = json.dumps({"work": root})
            server.WORK_ROOT = work
            try:
                with self.assertRaises(RuntimeError) as ctx:
                    server._execute_ifc({"input": {"kind": "file", "mount": "work", "path": "x.ifc"}})
            finally:
                server.WORK_ROOT = saved_work
                if saved_roots is None:
                    os.environ.pop("AGENTSAM_CAD_FILE_ROOTS")
                else:
                    os.environ["AGENTSAM_CAD_FILE_ROOTS"] = saved_roots
        message = str(ctx.exception)
        self.assertIn("pip install ifcopenshell", message)
        self.assertIn("source-/a/python", message)


if __name__ == "__main__":
    unittest.main(verbosity=2)
