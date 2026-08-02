"""Unit tests for data.d1_bloat -- pure-function parsing, no live D1/network."""
import unittest

from agentsam_sdk.data.d1_bloat import (
    ColStat, TableStat, _pick_bloat_columns, _flag_suspicious, _render_markdown, _fmt_bytes,
)


class TestBloatColumnPicking(unittest.TestCase):
    def test_picks_json_and_body_columns(self):
        cols = [("id", "INTEGER"), ("input_json", "TEXT"), ("output_json", "TEXT"), ("created_at", "TEXT")]
        picked = _pick_bloat_columns(cols)
        self.assertIn("input_json", picked)
        self.assertIn("output_json", picked)
        self.assertNotIn("id", picked)
        self.assertNotIn("created_at", picked)

    def test_skips_id_and_fk_like_columns(self):
        cols = [("tenant_id", "TEXT"), ("workspace_id", "TEXT"), ("metadata", "TEXT")]
        picked = _pick_bloat_columns(cols)
        self.assertNotIn("tenant_id", picked)
        self.assertNotIn("workspace_id", picked)
        self.assertIn("metadata", picked)


class TestFlagging(unittest.TestCase):
    def test_flags_large_table_high_severity(self):
        big = TableStat(name="agentsam_tool_call_log", row_count=250_000, text_bytes=18_874_368,
                         est_bytes=18_874_368, columns=[ColStat(name="output_json", bytes=12_582_912)])
        small = TableStat(name="cms_pages", row_count=0, text_bytes=0, est_bytes=0)
        flags = _flag_suspicious([big, small])
        names = {f["table"] for f in flags}
        self.assertIn("agentsam_tool_call_log", names)
        big_flag = next(f for f in flags if f["table"] == "agentsam_tool_call_log")
        self.assertEqual(big_flag["severity"], "high")

    def test_empty_table_not_flagged(self):
        small = TableStat(name="cms_pages", row_count=0, text_bytes=0, est_bytes=0)
        flags = _flag_suspicious([small])
        self.assertEqual(flags, [])


class TestFormatting(unittest.TestCase):
    def test_fmt_bytes_scales(self):
        self.assertEqual(_fmt_bytes(500), "500 B")
        self.assertEqual(_fmt_bytes(2048), "2.0 KB")
        self.assertEqual(_fmt_bytes(5 * 1024 * 1024), "5.00 MB")

    def test_render_markdown_includes_table_names(self):
        stats = [TableStat(name="agentsam_memory", row_count=40, text_bytes=12000, est_bytes=12000)]
        md = _render_markdown(stats, "1.2 MB", "quick", 10, 1)
        self.assertIn("agentsam_memory", md)
        self.assertIn("D1 bloat audit", md)


if __name__ == "__main__":
    unittest.main()
