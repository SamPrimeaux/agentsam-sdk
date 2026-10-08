import json
import tempfile
import unittest
from pathlib import Path
from agentsam_site_scrape.storage import resolve_evidence_bucket

class StorageResolutionTests(unittest.TestCase):
    def test_no_default_bucket_even_when_sdk_credentials_exist(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(ValueError, 'No project-owned'):
                resolve_evidence_bucket(Path(root))

    def test_project_native_r2_selection(self):
        with tempfile.TemporaryDirectory() as root:
            d = Path(root) / '.agentsam'
            d.mkdir()
            (d / 'site-scrape.json').write_text(json.dumps({'storage': {'evidence': {'provider': 'r2','bucket': 'client-1234-crawls'}}}))
            self.assertEqual(resolve_evidence_bucket(Path(root))['bucket'], 'client-1234-crawls')
            self.assertEqual(resolve_evidence_bucket(Path(root), selected_bucket='chosen-target')['bucket'], 'chosen-target')

    def test_wrangler_project_binding_and_delivery_independence(self):
        with tempfile.TemporaryDirectory() as root:
            (Path(root) / 'wrangler.jsonc').write_text('{"r2_buckets":[{"binding":"WEBSITE_ASSETS","bucket_name":"public-media"},{"binding":"CRAWL_EVIDENCE","bucket_name":"user-evidence"}]}')
            self.assertEqual(resolve_evidence_bucket(Path(root))['bucket'], 'user-evidence')

    def test_local_selection_denies_implicit_remote_upload(self):
        with tempfile.TemporaryDirectory() as root:
            d = Path(root) / '.agentsam'
            d.mkdir()
            (d / 'site-scrape.json').write_text(json.dumps({'storage': {'evidence': {'provider': 'local'}}}))
            with self.assertRaisesRegex(ValueError, 'local evidence'):
                resolve_evidence_bucket(Path(root))
            with self.assertRaises(ValueError):
                resolve_evidence_bucket(Path(root), selected_bucket='../unsafe')
