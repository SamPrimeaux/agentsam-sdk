"""Executable JSON-mode crawl -> evidence integration test with synthetic pages/assets."""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from agentsam_site_scrape.contract import build_result
from agentsam_site_scrape.crawl import CrawlResult, DiscoveryResult, ImageResult, PageResult
from agentsam_site_scrape.evidence import verify_evidence
from agentsam_site_scrape.jsonrun import run_json

ACCOUNT = 'au_testaccount123'
PROJECT = 'proj_testproject'


class EvidencePipelineTests(unittest.TestCase):
    def test_json_run_stages_pages_and_assets_before_temp_cleanup(self):
        paths = []
        def synthetic_crawl(_target, _seeds, tmp, **options):
            self.assertTrue(options['download_images'])
            page = tmp / 'pages' / 'home.json'
            page.parent.mkdir(parents=True)
            page.write_text('{"url":"https://example.com/","content":[{"text":"Test"}]}', encoding='utf-8')
            photo = tmp / 'assets' / 'hero.png'
            photo.parent.mkdir()
            photo.write_bytes(b'synthetic-image-contents')
            paths.extend([page, photo])
            return CrawlResult(
                target='example-com', seed_urls=['https://example.com/'], pages=[
                    PageResult(url='https://example.com/', title='Test', json_path=str(page), image_count=1)
                ], images=[ImageResult(url='https://example.com/hero.png', ok=True,
                                       page_slug='home', optimized_path=str(photo),
                                       section='hero')], pages_visited=1,
            )
        args = SimpleNamespace(url='https://example.com', max_pages=1, delay=0,
                               ignore_robots=False, expand_domain=False,
                               capture_assets=True, no_optimize=True, workers=2,
                               allow_unoptimized=False, upload_archive=False)
        with tempfile.TemporaryDirectory(prefix='agentsam-archive-test-') as temp:
            args.archive_dir = temp
            args.account_id = ACCOUNT
            args.project_id = PROJECT
            stdout, stderr = io.StringIO(), io.StringIO()
            discovery = DiscoveryResult('https://example.com/', 'Test', [], [])
            with patch('agentsam_site_scrape.jsonrun.discover', return_value=discovery), \
                 patch('agentsam_site_scrape.jsonrun.crawl', side_effect=synthetic_crawl), \
                 contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = run_json(args)
            self.assertEqual(code, 0)
            receipt = json.loads(stdout.getvalue())
            self.assertEqual(receipt['counts']['images_fetched'], 1)
            self.assertEqual(receipt['applied']['capture']['assets'], True)
            self.assertIn('Private evidence staged:', stderr.getvalue())
            self.assertTrue(all(not path.exists() for path in paths), 'crawl temporary files should be released')
            run = Path(temp) / 'v1' / 'accounts' / ACCOUNT / 'projects' / PROJECT / 'runs' / receipt['run_id']
            manifest = verify_evidence(run)
            self.assertEqual(len(manifest['objects']), 4)
            image = next(o for o in manifest['objects'] if o.get('kind') == 'image')
            self.assertEqual(image['source_url'], 'https://example.com/hero.png')
            self.assertEqual(image['section'], 'hero')
            self.assertTrue((run / image['key']).exists())
            self.assertEqual(json.loads((run / 'receipt.json').read_text())['run_id'], receipt['run_id'])

    def test_archive_upload_failure_still_emits_crawl_receipt(self):
        def synthetic_crawl(_target, _seeds, tmp, **_kwargs):
            page = tmp / 'home.json'
            page.write_text('{"url":"https://example.com/"}', encoding='utf-8')
            return CrawlResult(target='example', seed_urls=['https://example.com/'],
                               pages=[PageResult(url='https://example.com/', title='Test',
                                                 json_path=str(page), image_count=0)])
        args = SimpleNamespace(url='https://example.com', max_pages=1, delay=0,
                               ignore_robots=False, expand_domain=False,
                               capture_assets=False, no_optimize=True, workers=2,
                               allow_unoptimized=False, upload_archive=True,
                               archive_bucket='agentsam-crawl-evidence', repo_root='.',
                               wrangler_config=None, account_id=ACCOUNT, project_id=PROJECT)
        with tempfile.TemporaryDirectory() as archive_dir:
            args.archive_dir = archive_dir
            stdout, stderr = io.StringIO(), io.StringIO()
            with patch('agentsam_site_scrape.jsonrun.discover',
                       return_value=DiscoveryResult('https://example.com/', 'Test', [], [])), \
                 patch('agentsam_site_scrape.jsonrun.crawl', side_effect=synthetic_crawl), \
                 patch('agentsam_site_scrape.evidence.upload_evidence',
                       side_effect=RuntimeError('R2 permission denied')), \
                 contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = run_json(args)
            receipt = json.loads(stdout.getvalue())
            self.assertEqual(code, 1)
            self.assertEqual(receipt['status'], 'completed')
            self.assertEqual(receipt['storage']['status'], 'failed')
            self.assertIn('R2 permission denied', receipt['storage']['error'])
            self.assertIn('Evidence archive failed', stderr.getvalue())

    def test_image_failure_is_partial_without_corrupting_page_failure_counts(self):
        result = CrawlResult(target='test', seed_urls=['https://example.com/'], pages=[
            PageResult(url='https://example.com/', title='Test', json_path='unused', image_count=1)
        ], images=[ImageResult(url='https://example.com/bad.png', ok=False,
                               page_slug='home', error='image_unavailable')])
        receipt = build_result(result, started_at=1, completed_at=2,
                               scope={}, policy={}, capture={'assets': True})
        self.assertEqual(receipt['status'], 'partial')
        self.assertEqual(receipt['counts']['pages_failed'], 0)
        self.assertEqual(receipt['counts']['images_failed'], 1)
        self.assertEqual(receipt['errors'][0]['url'], 'https://example.com/bad.png')


if __name__ == '__main__':
    unittest.main()
