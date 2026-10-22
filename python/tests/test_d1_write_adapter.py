from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

from agentsam_sdk.data.d1_adapter import D1Adapter, D1AdapterError


class FakeD1Adapter(D1Adapter):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.args_seen = None
        self.return_code = 0
        self.stdout = '[{"results":[],"meta":{"changes":1}}]'
        self.stderr = ""

    def _run_wrangler(self, args):
        self.args_seen = args
        return subprocess.CompletedProcess(args, self.return_code, self.stdout, self.stderr)


class D1WriteAdapterTests(unittest.TestCase):
    def test_write_uses_only_configured_database_and_existing_wrangler_adapter(self):
        with tempfile.TemporaryDirectory() as tmp:
            adapter = FakeD1Adapter(db_name="fixture-db", wrangler_config="wrangler.toml",
                                    repo_root=Path(tmp), remote=True, database_id="fixture-uuid")
            result = adapter.execute_write("UPDATE example SET value = 'ok' WHERE id = 1", database_id="fixture-uuid")
            self.assertTrue(result["ok"])
            self.assertEqual(result["database_id"], "fixture-uuid")
            self.assertIn("d1", adapter.args_seen)
            self.assertIn("execute", adapter.args_seen)
            self.assertIn("--remote", adapter.args_seen)
            self.assertIn("--command", adapter.args_seen)
            self.assertEqual(adapter.args_seen[-1], "UPDATE example SET value = 'ok' WHERE id = 1")

    def test_database_identity_is_required_and_must_match(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = FakeD1Adapter(db_name="fixture-db", repo_root=Path(tmp))
            with self.assertRaises(D1AdapterError) as caught:
                missing.execute_write("UPDATE example SET value = 1", database_id="fixture-uuid")
            self.assertEqual(caught.exception.code, "d1_database_identity_not_configured")
            adapter = FakeD1Adapter(db_name="fixture-db", repo_root=Path(tmp), database_id="expected-uuid")
            with self.assertRaises(D1AdapterError) as caught:
                adapter.execute_write("UPDATE example SET value = 1", database_id="other-uuid")
            self.assertEqual(caught.exception.code, "d1_database_identity_mismatch")
            self.assertIsNone(adapter.args_seen)

    def test_rejects_ddl_multiple_statements_and_failed_wrangler_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            adapter = FakeD1Adapter(db_name="fixture-db", repo_root=Path(tmp), database_id="fixture-uuid")
            with self.assertRaises(D1AdapterError) as caught:
                adapter.execute_write("DROP TABLE example", database_id="fixture-uuid")
            self.assertEqual(caught.exception.code, "d1_write_statement_not_allowed")
            with self.assertRaises(D1AdapterError) as caught:
                adapter.execute_write("UPDATE example SET value = 1; DELETE FROM example", database_id="fixture-uuid")
            self.assertEqual(caught.exception.code, "d1_write_multiple_statements_not_allowed")
            adapter.return_code = 1
            with self.assertRaises(D1AdapterError) as caught:
                adapter.execute_write("UPDATE example SET value = 1", database_id="fixture-uuid")
            self.assertEqual(caught.exception.code, "d1_write_failed")


if __name__ == "__main__":
    unittest.main()
