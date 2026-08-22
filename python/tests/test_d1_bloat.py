"""Unit tests for data.d1_bloat -- pure-function parsing, no live D1/network."""
import unittest

from agentsam_sdk.data.d1_bloat import (
    ColStat,
    TableStat,
    _build_briefing,
    _build_doing_well,
    _build_findings,
    _fmt_bytes,
    _pick_measure_columns,
)


class TestMeasureColumnPicking(unittest.TestCase):
    def test_picks_json_and_body_columns(self):
        cols = [
            ("id", "INTEGER"),
            ("input_json", "TEXT"),
            ("output_json", "TEXT"),
            ("created_at", "TEXT"),
        ]
        picked = _pick_measure_columns(cols)
        self.assertIn("input_json", picked)
        self.assertIn("output_json", picked)
        # id is INTEGER — never measured; created_at is TEXT but not payload-ish
        # when preferred names exist, only preferred are kept
        self.assertNotIn("id", picked)
        self.assertNotIn("created_at", picked)

    def test_falls_back_to_any_text_when_no_preferred(self):
        cols = [("tenant_id", "TEXT"), ("workspace_id", "TEXT"), ("label", "TEXT")]
        picked = _pick_measure_columns(cols)
        # No SKIP_COL_RE — database-scoped; without preferred names, all text cols qualify
        self.assertIn("tenant_id", picked)
        self.assertIn("workspace_id", picked)
        self.assertIn("label", picked)

    def test_prefers_metadata_over_ids_when_mixed(self):
        cols = [("tenant_id", "TEXT"), ("workspace_id", "TEXT"), ("metadata", "TEXT")]
        picked = _pick_measure_columns(cols)
        self.assertEqual(picked, ["metadata"])


class TestFindings(unittest.TestCase):
    def test_full_flags_large_table_high_severity(self):
        big = TableStat(
            name="agentsam_tool_call_log",
            row_count=250_000,
            text_bytes=18_874_368,
            est_bytes=18_874_368,
            columns=[ColStat(name="output_json", bytes=12_582_912)],
        )
        small = TableStat(name="cms_pages", row_count=0, text_bytes=0, est_bytes=0)
        findings = _build_findings([big, small], "full")
        names = {f["table"] for f in findings}
        self.assertIn("agentsam_tool_call_log", names)
        big_flag = next(f for f in findings if f["table"] == "agentsam_tool_call_log")
        self.assertEqual(big_flag["severity"], "high")

    def test_full_empty_table_not_flagged(self):
        small = TableStat(name="cms_pages", row_count=0, text_bytes=0, est_bytes=0)
        findings = _build_findings([small], "full")
        self.assertEqual(findings, [])

    def test_quick_flags_high_row_count(self):
        big = TableStat(name="otlp_traces", row_count=120_000, est_bytes=120_000 * 120)
        findings = _build_findings([big], "quick")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["severity"], "high")
        self.assertIn("--full", findings[0]["why"])


class TestFormatting(unittest.TestCase):
    def test_fmt_bytes_scales(self):
        self.assertEqual(_fmt_bytes(500), "500 B")
        self.assertEqual(_fmt_bytes(2048), "2.0 KB")
        self.assertEqual(_fmt_bytes(5 * 1024 * 1024), "5.00 MB")

    def test_briefing_includes_table_and_verdict(self):
        stats = [
            TableStat(name="agentsam_memory", row_count=40, text_bytes=12000, est_bytes=12000)
        ]
        findings = _build_findings(stats, "quick")
        well = _build_doing_well(stats, findings)
        md = _build_briefing(stats, findings, well, "example-d1-database", "1.2 MB", "quick", 1)
        self.assertIn("D1 health", md)
        self.assertIn("database-scoped", md)
        self.assertIn("Verdict", md)


if __name__ == "__main__":
    unittest.main()
