"""Pure-Python distribution/bridge-configuration tests: no Node installation required."""
import unittest
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import patch

from agentsam_sdk import AgentSamClient, AsyncAgentSamClient, SamClientError


class BridgeIndependenceTests(unittest.TestCase):
    def test_bridge_timeout_is_configurable_and_validated(self):
        with TemporaryDirectory() as directory:
            sam = AgentSamClient(cwd=directory, bridge_timeout_seconds=600)
            self.assertEqual(sam.bridge_timeout_seconds, 600)
            asynchronous = AsyncAgentSamClient(
                cwd=directory, env={"AGENTSAM_BRIDGE_TIMEOUT_SECONDS": "300"}
            )
            self.assertEqual(asynchronous.bridge_timeout_seconds, 300)
            for bad in (-1, 0, 3601, float("nan"), "bad"):
                with self.subTest(bad=bad), self.assertRaises(SamClientError):
                    AgentSamClient(cwd=directory, bridge_timeout_seconds=bad)

    def test_native_operations_work_without_node(self):
        with TemporaryDirectory() as directory:
            Path(directory, "sample.txt").write_text("native works", encoding="utf-8")
            with patch("agentsam_sdk.client._binary", side_effect=SamClientError("sam_node_not_available")):
                sam = AgentSamClient(cwd=directory)
                native = sam.invoke("workspace.read", {"path": "sample.txt"})
                self.assertTrue(native["ok"])
                self.assertEqual(native["schema"], "agentsam.result.v1")
                self.assertIn("native works", str(native["data"]))
                ops = sam.discover(limit=200)["operations"]
                self.assertIn("workspace.read", {op["id"] for op in ops})
                with self.assertRaises(SamClientError) as error:
                    sam.invoke("artifact.render", {"title": "Requires optional JS adapter"})
                self.assertEqual(error.exception.code, "sam_node_required")


if __name__ == "__main__":
    unittest.main()
