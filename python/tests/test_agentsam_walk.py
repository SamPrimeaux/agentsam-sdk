"""Unit tests for data.agentsam_walk -- pure-function logic, no live D1."""
import unittest

from agentsam_sdk.data.agentsam_walk import _capability_for, TableWalk, _render_markdown


class TestCapabilityHeuristic(unittest.TestCase):
    def test_tool_chain_maps_to_tools_commands_mcp(self):
        self.assertEqual(_capability_for("agentsam_tool_chain"), "tools_commands_mcp")

    def test_workflow_runs_maps_to_workflow_dag(self):
        self.assertEqual(_capability_for("agentsam_workflow_runs"), "workflow_dag")

    def test_unknown_table_is_uncategorized(self):
        self.assertEqual(_capability_for("zzz_totally_unmatched_xyz"), "uncategorized")


class TestRenderMarkdown(unittest.TestCase):
    def test_groups_by_capability(self):
        walks = [
            TableWalk(name="agentsam_tool_chain", capability="tools_commands_mcp", row_count=10),
            TableWalk(name="agentsam_memory", capability="memory_rag", row_count=5),
        ]
        md = _render_markdown(walks, "agentsam_")
        self.assertIn("tools_commands_mcp", md)
        self.assertIn("memory_rag", md)
        self.assertIn("agentsam_tool_chain", md)


if __name__ == "__main__":
    unittest.main()
