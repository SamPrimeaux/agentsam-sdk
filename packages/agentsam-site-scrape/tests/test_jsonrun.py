"""Noninteractive site.scrape JSON boundary tests, with injected crawler (no network)."""
import contextlib
import io
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from agentsam_site_scrape.crawl import CrawlResult, PageResult, DiscoveryResult
from agentsam_site_scrape.jsonrun import run_json


def args(max_pages=2):
    return SimpleNamespace(url='https://example.com', max_pages=max_pages, delay=0,
                           ignore_robots=False, expand_domain=False)


class JsonRunTests(unittest.TestCase):
    def test_stdout_is_exactly_one_valid_receipt_without_network(self):
        found = DiscoveryResult('https://example.com/', 'Test', [], [])
        result = CrawlResult(target='example-com', seed_urls=['https://example.com/'],
                             pages=[PageResult(url='https://example.com/', title='Home',
                                               json_path='/temporary/page.json', image_count=0)],
                             pages_visited=1)
        out, err = io.StringIO(), io.StringIO()
        with patch('agentsam_site_scrape.jsonrun.discover', return_value=found), \
             patch('agentsam_site_scrape.jsonrun.crawl', return_value=result) as run, \
             contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = run_json(args())
        payload = json.loads(out.getvalue())
        self.assertEqual(code, 0)
        self.assertEqual(payload['capability'], 'site.scrape')
        self.assertEqual(payload['seed_urls'], ['https://example.com/'])
        self.assertEqual(payload['applied']['capture']['text'], False)
        self.assertIn('capture.text', payload['applied']['ignored'])
        self.assertEqual(err.getvalue(), '')
        self.assertTrue(out.getvalue().endswith('\n'))
        self.assertEqual(run.call_args.kwargs['max_pages'], 2)

    def test_discovery_failure_produces_failed_json_receipt(self):
        found = DiscoveryResult('https://example.com/', '', [], [], fetch_error='blocked_by_robots')
        out, err = io.StringIO(), io.StringIO()
        with patch('agentsam_site_scrape.jsonrun.discover', return_value=found), \
             contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = run_json(args())
        payload = json.loads(out.getvalue())
        self.assertEqual(code, 1)
        self.assertEqual(payload['status'], 'failed')
        self.assertEqual(payload['counts']['pages_blocked'], 1)
        self.assertIn('Discovery failed', err.getvalue())

    def test_invalid_page_budget_rejects_without_fetch(self):
        out, err = io.StringIO(), io.StringIO()
        with patch('agentsam_site_scrape.jsonrun.discover') as discover, \
             contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = run_json(args(max_pages=0))
        self.assertEqual(code, 2)
        self.assertEqual(out.getvalue(), '')
        discover.assert_not_called()


if __name__ == '__main__':
    unittest.main()
