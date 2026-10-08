"""site.scrape receipt contract tests — no network, schema read from protocol/."""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from types import SimpleNamespace

from agentsam_site_scrape.contract import build_result, classify_error

SCHEMA_DIR = Path(__file__).resolve().parents[3] / "protocol" / "capabilities"
RESULT_SCHEMA = json.loads((SCHEMA_DIR / "site-scrape-result.schema.json").read_text())
INPUT_SCHEMA = json.loads((SCHEMA_DIR / "site-scrape-input.schema.json").read_text())


def _crawl(pages, errors, visited=None):
    return SimpleNamespace(
        seed_urls=["https://example.com/"],
        pages=[SimpleNamespace(url=u, title=t, image_count=n) for u, t, n in pages],
        errors=errors,
        pages_visited=visited if visited is not None else len(pages) + len(errors),
    )


def _build(crawl_result):
    return build_result(
        crawl_result, started_at=1_700_000_000.0, completed_at=1_700_000_005.0,
        scope={"maxPages": 10}, policy={"respectRobots": True}, capture={"assets": False},
    )


class TestContract(unittest.TestCase):
    def test_schemas_parse_and_ids_follow_convention(self):
        for schema in (RESULT_SCHEMA, INPUT_SCHEMA):
            self.assertTrue(schema["$id"].startswith("https://schemas.inneranimalmedia.com/agentsam/capabilities/"))

    def test_receipt_has_every_required_key(self):
        r = _build(_crawl([("https://example.com/", "Home", 3)], []))
        for key in RESULT_SCHEMA["required"]:
            self.assertIn(key, r)
        for key in RESULT_SCHEMA["properties"]["counts"]["required"]:
            self.assertIn(key, r["counts"])
        self.assertRegex(r["run_id"], RESULT_SCHEMA["properties"]["run_id"]["pattern"])
        self.assertRegex(r["content_hash"], RESULT_SCHEMA["properties"]["content_hash"]["pattern"])
        json.dumps(r)  # serializable

    def test_status_vocabulary(self):
        allowed = set(RESULT_SCHEMA["properties"]["status"]["enum"])
        ok = _build(_crawl([("https://example.com/", "Home", 0)], []))
        partial = _build(_crawl([("https://example.com/", "Home", 0)], [{"url": "x", "error": "boom"}]))
        failed = _build(_crawl([], [{"url": "x", "error": "blocked_by_robots"}]))
        self.assertEqual([ok["status"], partial["status"], failed["status"]], ["completed", "partial", "failed"])
        self.assertTrue({ok["status"], partial["status"], failed["status"]} <= allowed)

    def test_error_kinds_and_counts(self):
        errs = [
            {"url": "a", "error": "blocked_by_robots"},
            {"url": "b", "error": "redirect_left_site"},
            {"url": "c", "error": "HTTPError: 500"},
        ]
        r = _build(_crawl([("https://example.com/", "Home", 1)], errs, visited=4))
        self.assertEqual([e["kind"] for e in r["errors"]], ["blocked", "skipped", "failed"])
        self.assertEqual(
            r["counts"],
            {"pages_visited": 4, "pages_fetched": 1, "pages_blocked": 1, "pages_skipped": 1, "pages_failed": 1},
        )
        self.assertEqual(classify_error("anything else"), "failed")

    def test_content_hash_is_order_independent_and_run_id_stable(self):
        a = _build(_crawl([("https://a/", "A", 0), ("https://b/", "B", 0)], []))
        b = _build(_crawl([("https://b/", "B", 0), ("https://a/", "A", 0)], []))
        self.assertEqual(a["content_hash"], b["content_hash"])
        self.assertEqual(a["run_id"], b["run_id"])

    def test_unsupported_inputs_are_reported_not_hidden(self):
        r = _build(_crawl([("https://example.com/", "Home", 0)], []))
        self.assertIn("scope.maxDepth", r["applied"]["ignored"])


if __name__ == "__main__":
    unittest.main()
