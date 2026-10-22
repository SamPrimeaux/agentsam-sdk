"""Shared workspace/runtime conformance tests; all filesystem data is temporary."""
from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

from agentsam_sdk import AgentSamClient, AsyncAgentSamClient
from agentsam_sdk.runtime.native import (
    NativeRuntime,
    NativeOperationError,
    workspace_read,
    workspace_list,
    workspace_stat,
    workspace_write,
    workspace_patch,
    workspace_remove,
    terminal_exec,
)

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "protocol" / "runtime" / "workspace-fs.conformance.v1.json"


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def setup_workspace(root: Path) -> Path:
    for name, content in json.loads(FIXTURE.read_text())["setup"]["files"].items():
        (root / name).write_text(content, encoding="utf-8")
    outside = root.parent / (root.name + "-outside")
    outside.mkdir()
    (outside / "secret.txt").write_text("outside", encoding="utf-8")
    (root / "escape").symlink_to(outside, target_is_directory=True)
    return outside


def fixture_input(row: dict, root: Path) -> dict:
    value = json.loads(json.dumps(row["input"]))
    for key, item in list(value.items()):
        if isinstance(item, str) and item.startswith("@sha256:"):
            value[key] = sha((root / item[len("@sha256:"):]).read_bytes())
    return value


def run_workspace_case(operation: str, value: dict, root: Path) -> dict:
    handlers = {
        "read": workspace_read,
        "list": workspace_list,
        "stat": workspace_stat,
        "write": workspace_write,
        "patch": workspace_patch,
        "remove": workspace_remove,
    }
    return handlers[operation](value, root)


class WorkspaceConformanceTests(unittest.TestCase):
    def test_shared_success_fixtures(self):
        fixture = json.loads(FIXTURE.read_text())
        for row in fixture["cases"]:
            with self.subTest(case=row["id"]), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                outside = setup_workspace(root)
                try:
                    result = run_workspace_case(row["operation"], fixture_input(row, root), root)
                    for key, value in row["expected"].items():
                        self.assertEqual(result[key], value, row["id"] + ":" + key)
                    if row.get("expected_paths"):
                        self.assertEqual([entry["path"] for entry in result["entries"]], row["expected_paths"])
                    if row["operation"] in ("read", "stat"):
                        self.assertRegex(result["sha256"], r"^[a-f0-9]{64}$")
                finally:
                    outside_name = outside
                    if outside_name.exists():
                        import shutil
                        shutil.rmtree(outside_name, ignore_errors=True)

    def test_shared_failure_fixtures(self):
        fixture = json.loads(FIXTURE.read_text())
        for row in fixture["failures"]:
            with self.subTest(case=row["id"]), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                outside = setup_workspace(root)
                try:
                    with self.assertRaises(NativeOperationError) as caught:
                        run_workspace_case(row["operation"], fixture_input(row, root), root)
                    self.assertEqual(caught.exception.code, row["expected_error"])
                finally:
                    import shutil
                    shutil.rmtree(outside, ignore_errors=True)


class NativeClientRuntimeTests(unittest.TestCase):
    def test_native_read_and_receipt_work_without_node_bridge(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "hello.txt").write_text("hello", encoding="utf-8")
            receipts = root / "receipt-store"
            sam = AgentSamClient(
                cwd=root, workspace_root=root, receipt_dir=receipts,
                node="/does/not/exist/node", bridge="/does/not/exist/stdio.mjs",
            )
            result = sam.invoke("workspace.read", {"path": "hello.txt"})
            self.assertTrue(result["ok"])
            self.assertEqual(result["data"]["content"], "hello")
            receipt = receipts / f"receipt-workspace.read-{result['receipt']['id'][5:]}.json"
            self.assertTrue(receipt.is_file())
            saved = json.loads(receipt.read_text())
            self.assertEqual(saved["execution"]["operation"], "workspace.read")
            self.assertEqual(saved["execution"]["approval"]["decision"], "not_required")
            self.assertIsInstance(saved["written_at_unixepoch"], int)
            with self.assertRaises(Exception) as caught:
                sam.invoke("artifact.render", {"title": "Node required"})
            self.assertEqual(getattr(caught.exception, "code", None), "sam_node_required")

    def test_write_requires_flag_and_host_approval_and_records_refusals(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            receipts = root / "receipts"
            sam = AgentSamClient(cwd=root, receipt_dir=receipts, authorize_operation=lambda _: True)
            no_flag = sam.invoke("workspace.write", {"path": "a.txt", "content": "x"})
            self.assertFalse(no_flag["ok"])
            self.assertEqual(no_flag["error"]["code"], "sam_write_flag_required")
            saved_path = receipts / f"receipt-workspace.write-{no_flag['receipt']['id'][5:]}.json"
            saved = json.loads(saved_path.read_text())
            self.assertEqual(saved["execution"]["approval"]["decision"], "denied")

            denied = AgentSamClient(cwd=root, receipt_dir=receipts, authorize_operation=lambda _: False)
            result = denied.invoke("workspace.write", {"path": "a.txt", "content": "x"}, write=True)
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"]["code"], "sam_host_approval_denied")
            self.assertFalse((root / "a.txt").exists())
            self.assertTrue((receipts / f"receipt-workspace.write-{result['receipt']['id'][5:]}.json").is_file())

            approved = AgentSamClient(cwd=root, receipt_dir=receipts, authorize_operation=lambda request: request["id"] == "workspace.write")
            created = approved.invoke("workspace.write", {"path": "a.txt", "content": "x"}, write=True)
            self.assertTrue(created["ok"])
            self.assertEqual((root / "a.txt").read_text(), "x")
            created_receipt = receipts / f"receipt-workspace.write-{created['receipt']['id'][5:]}.json"
            self.assertEqual(json.loads(created_receipt.read_text())["execution"]["approval"]["decision"], "approved")

    def test_stale_write_is_rejected_and_receipted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / "a.txt"
            target.write_text("before", encoding="utf-8")
            receipts = root / "receipts"
            sam = AgentSamClient(cwd=root, receipt_dir=receipts, authorize_operation=lambda _: True)
            before = sam.invoke("workspace.read", {"path": "a.txt"})["data"]["sha256"]
            target.write_text("changed externally", encoding="utf-8")
            result = sam.invoke(
                "workspace.write",
                {"path": "a.txt", "content": "new", "expected_sha256": before},
                write=True,
            )
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"]["code"], "workspace_write_conflict_expected_sha256_required")
            self.assertEqual(target.read_text(), "changed externally")
            self.assertTrue((receipts / f"receipt-workspace.write-{result['receipt']['id'][5:]}.json").is_file())

    def test_patch_and_remove_are_approved_versioned_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / "notes.txt"
            target.write_text("alpha\n", encoding="utf-8")
            receipts = root / "receipts"
            sam = AgentSamClient(cwd=root, receipt_dir=receipts, authorize_operation=lambda request: True)
            original = sam.invoke("workspace.read", {"path": "notes.txt"})["data"]["sha256"]
            patched = sam.invoke(
                "workspace.patch",
                {"path": "notes.txt", "expected_sha256": original, "old_text": "alpha", "new_text": "beta"},
                write=True,
            )
            self.assertTrue(patched["ok"])
            self.assertTrue(patched["data"]["patched"])
            self.assertEqual(target.read_text(), "beta\n")
            removed = sam.invoke(
                "workspace.remove",
                {"path": "notes.txt", "expected_sha256": patched["data"]["sha256"]},
                write=True,
            )
            self.assertTrue(removed["ok"])
            self.assertTrue(removed["data"]["removed"])
            self.assertFalse(target.exists())
            for result in (patched, removed):
                receipt = receipts / f"receipt-{result['receipt']['operation']}-{result['receipt']['id'][5:]}.json"
                self.assertTrue(receipt.is_file())

    def test_shared_terminal_exec_conformance_fixtures(self):
        fixture = json.loads((ROOT / "protocol" / "runtime" / "terminal-exec.conformance.v1.json").read_text())
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            outside = root.parent / (root.name + "-terminal-outside")
            outside.mkdir()
            (outside / "outside.txt").write_text("outside", encoding="utf-8")
            (root / "external-link").symlink_to(outside, target_is_directory=True)
            try:
                success_input = dict(fixture["success"]["input"], cwd=str(root))
                result = terminal_exec(success_input, root)
                for field in fixture["success"]["required_fields"]:
                    self.assertIn(field, result)
                for field, expected in fixture["success"]["expected"].items():
                    self.assertEqual(result[field], expected, field)
                for row in fixture["failures"]:
                    with self.subTest(case=row["id"]):
                        value = dict(row["input"], cwd=str(root))
                        with self.assertRaises(NativeOperationError) as caught:
                            terminal_exec(value, root)
                        self.assertEqual(caught.exception.code, row["expected_error"])
            finally:
                import shutil
                shutil.rmtree(outside, ignore_errors=True)

    def test_terminal_exec_is_argv_only_bounded_and_approved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            receipts = root / "receipts"
            sam = AgentSamClient(cwd=root, receipt_dir=receipts, authorize_operation=lambda _: True)
            base = {
                "command": "python3",
                "args": ["-c", "print('hello')"],
                "cwd": str(root),
                "relative_cwd": ".",
                "timeout_ms": 5000,
                "max_output_bytes": 1024,
            }
            ok = sam.invoke("terminal.exec", base, write=True)
            self.assertTrue(ok["ok"])
            self.assertEqual(ok["data"]["stdout"], "hello\n")
            self.assertEqual(ok["data"]["project_root"], str(root.resolve()))
            self.assertTrue((receipts / f"receipt-terminal.exec-{ok['receipt']['id'][5:]}.json").is_file())

            timeout = dict(base, args=["-c", "import time; time.sleep(2)"], timeout_ms=100)
            timed = sam.invoke("terminal.exec", timeout, write=True)
            self.assertFalse(timed["ok"])
            self.assertEqual(timed["error"]["code"], "process_timeout")
            self.assertIsNone(timed["data"])
            timed_receipt = receipts / f"receipt-terminal.exec-{timed['receipt']['id'][5:]}.json"
            self.assertTrue(timed_receipt.is_file())
            self.assertEqual(json.loads(timed_receipt.read_text())["data"]["status"], "timed_out")

            cap = dict(base, args=["-c", "print('x' * 10000)"], max_output_bytes=1024)
            limited = sam.invoke("terminal.exec", cap, write=True)
            self.assertFalse(limited["ok"])
            self.assertEqual(limited["error"]["code"], "process_output_limit")
            self.assertIsNone(limited["data"])
            limited_receipt = receipts / f"receipt-terminal.exec-{limited['receipt']['id'][5:]}.json"
            self.assertEqual(json.loads(limited_receipt.read_text())["data"]["status"], "output_limit")

    def test_terminal_exec_redacts_secrets_and_rejects_shell_strings(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sam = AgentSamClient(cwd=root, receipt_dir=root / "receipts", authorize_operation=lambda _: True)
            base = {
                "command": "python3",
                "args": ["-c", "print('API_KEY=sk-proj-abcdefghijklmnop')"],
                "cwd": str(root), "relative_cwd": ".", "timeout_ms": 5000, "max_output_bytes": 1024,
            }
            result = sam.invoke("terminal.exec", base, write=True)
            self.assertTrue(result["ok"])
            self.assertIn("API_KEY=[REDACTED]", result["data"]["stdout"])
            invalid = dict(base, command="python3;rm")
            rejected = sam.invoke("terminal.exec", invalid, write=True)
            self.assertFalse(rejected["ok"])
            self.assertEqual(rejected["error"]["code"], "terminal_command_must_be_pathless_executable")

    def test_d1_writes_use_only_injected_adapter(self):
        class Adapter:
            def __init__(self):
                self.calls = []
            def execute_write(self, sql, *, database_id):
                self.calls.append((sql, database_id))
                return {"schema": "agentsam.d1.write.v1", "ok": True, "database_id": database_id, "rows_written": 1}

        with tempfile.TemporaryDirectory() as tmp:
            adapter = Adapter()
            sam = AgentSamClient(cwd=tmp, receipt_dir=Path(tmp) / "receipts",
                                 d1_adapter=adapter, authorize_operation=lambda _: True)
            request = {"database_id": "fixture-db", "sql": "UPDATE sample SET value = 'ok' WHERE id = 1"}
            result = sam.invoke("agentsam_d1_write", request, write=True)
            self.assertTrue(result["ok"])
            self.assertEqual(adapter.calls, [(request["sql"], "fixture-db")])
            self.assertTrue((Path(tmp) / "receipts" / f"receipt-agentsam_d1_write-{result['receipt']['id'][5:]}.json").is_file())

            bad = sam.invoke("agentsam_d1_write", {"database_id": "fixture-db", "sql": "DROP TABLE sample"}, write=True)
            self.assertFalse(bad["ok"])
            self.assertEqual(bad["error"]["code"], "d1_write_statement_not_allowed")
            self.assertEqual(len(adapter.calls), 1)


if __name__ == "__main__":
    unittest.main()
