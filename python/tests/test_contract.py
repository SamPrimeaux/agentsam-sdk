"""Unit tests for runtime.contract -- receipts, no I/O beyond a tmp dir."""
import tempfile
import unittest
from pathlib import Path

from agentsam_sdk.runtime.contract import ToolInput, ToolResult, write_receipt, start_timer


class TestReceipts(unittest.TestCase):
    def test_write_receipt_creates_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            ti = ToolInput(output_dir=tmp)
            started = start_timer()
            result = ToolResult(
                ok=True, tool="data.d1_bloat", mode="quick", request_id=ti.request_id,
                started_at=started, finished_at=start_timer(), summary="test run",
            )
            path = write_receipt(result, ti.output_path())
            self.assertIsNotNone(path)
            self.assertTrue(Path(path).exists())

    def test_write_receipt_noop_without_output_dir(self):
        ti = ToolInput()
        result = ToolResult(
            ok=True, tool="data.d1_bloat", mode="quick", request_id=ti.request_id,
            started_at=0.0, finished_at=1.0, summary="test",
        )
        self.assertIsNone(write_receipt(result, ti.output_path()))


if __name__ == "__main__":
    unittest.main()
