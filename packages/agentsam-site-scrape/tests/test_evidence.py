"""Private evidence staging and R2 integration tests (no external writes)."""
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from agentsam_site_scrape.evidence import (
    evidence_prefix, stage_evidence, upload_evidence, verify_evidence,
)

ACCOUNT = 'au_testaccount123'
PROJECT = 'proj_testproject'
RUN = 'scrp_' + '1' * 24


class EvidenceTests(unittest.TestCase):
    def fixture(self, root):
        base = Path(root)
        page = base / 'page.json'
        page.write_text('{"url":"https://example.com"}', encoding='utf-8')
        photo = base / 'hero.png'
        photo.write_bytes(b'png-proof')
        result = SimpleNamespace(
            pages=[SimpleNamespace(url='https://example.com/', json_path=str(page))],
            images=[SimpleNamespace(url='https://example.com/hero.png', ok=True,
                                   optimized_path=str(photo))],
        )
        receipt = {'run_id': RUN, 'status': 'completed', 'capability': 'site.scrape'}
        return result, receipt

    def test_keys_have_valid_identity_and_no_path_escape(self):
        self.assertEqual(evidence_prefix(ACCOUNT, PROJECT, RUN),
                         'v1/accounts/' + ACCOUNT + '/projects/' + PROJECT + '/runs/' + RUN)
        for invalid in ('../au_admin', 'au_bad/../path', 'au_', 'AU_notvalid'):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                evidence_prefix(invalid, PROJECT, RUN)
        with self.assertRaises(ValueError):
            evidence_prefix(ACCOUNT, 'proj_../../other', RUN)

    def test_archives_are_private_content_addressed_and_immutable(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, receipt = self.fixture(tmp)
            archive = stage_evidence(result, receipt, account_id=ACCOUNT,
                                     project_id=PROJECT, archive_dir=Path(tmp) / 'archives')
            root = Path(archive['root'])
            manifest = verify_evidence(root)
            self.assertEqual(manifest['visibility'], 'private')
            self.assertEqual(len(manifest['objects']), 3)
            self.assertEqual(sorted(o['key'].split('/')[0] for o in manifest['objects']),
                             ['assets', 'pages', 'receipt.json'])
            with self.assertRaises(FileExistsError):
                stage_evidence(result, receipt, account_id=ACCOUNT,
                               project_id=PROJECT, archive_dir=Path(tmp) / 'archives')
            (root / 'pages/00001.json').write_text('tampered', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                verify_evidence(root)

    def test_upload_is_explicit_and_manifest_last(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, receipt = self.fixture(tmp)
            archive = stage_evidence(result, receipt, account_id=ACCOUNT,
                                     project_id=PROJECT, archive_dir=Path(tmp) / 'archives')
            with patch('agentsam_site_scrape.evidence.wrangler_put') as put:
                summary = upload_evidence(archive['root'], bucket='agentsam-crawl-evidence',
                                          repo_root=Path(tmp))
            self.assertEqual(summary['uploaded'], 4)
            self.assertEqual(put.call_count, 4)
            self.assertTrue(put.call_args.args[2].endswith('/manifest.json'))
            self.assertTrue(all(call.args[5] == 'private, no-store' for call in put.call_args_list))
            with self.assertRaises(ValueError):
                upload_evidence(archive['root'], bucket='../other', repo_root=Path(tmp))

    def test_failed_remote_object_does_not_upload_commit_marker(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, receipt = self.fixture(tmp)
            archive = stage_evidence(result, receipt, account_id=ACCOUNT,
                                     project_id=PROJECT, archive_dir=Path(tmp) / 'archives')
            with patch('agentsam_site_scrape.evidence.wrangler_put', side_effect=RuntimeError('network unavailable')) as put:
                with self.assertRaisesRegex(RuntimeError, 'network unavailable'):
                    upload_evidence(archive['root'], bucket='agentsam-crawl-evidence', repo_root=Path(tmp))
            self.assertEqual(put.call_count, 1)
            self.assertFalse(put.call_args.args[2].endswith('/manifest.json'))


if __name__ == '__main__':
    unittest.main()
