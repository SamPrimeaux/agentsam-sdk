"""Offline redirect gate tests: no forbidden destination may reach Session.get."""
import unittest
from unittest.mock import Mock

from agentsam_site_scrape.net import get_with_retry, Robots
from agentsam_site_scrape.pageextract import clean_url


class FakeResponse:
    def __init__(self, status, location=None, body=''):
        self.status_code = status
        self.headers = {'location': location} if location else {}
        self.text = body
        self.ok = 200 <= status < 400
        self.close = Mock()


class RedirectTests(unittest.TestCase):
    def test_rejects_private_redirect_before_network_request(self):
        session = Mock()
        session.get.return_value = FakeResponse(302, 'http://127.0.0.1/admin')
        with self.assertRaisesRegex(ValueError, 'blocked address'):
            get_with_retry(session, 'https://example.com/')
        self.assertEqual(session.get.call_count, 1)
        self.assertFalse(session.get.call_args.kwargs['allow_redirects'])

    def test_rejects_local_and_internal_hostnames_before_network_request(self):
        for target in ['http://localhost/secret', 'http://metadata.internal/', 'http://cache.local/']:
            with self.subTest(target=target):
                session = Mock()
                session.get.return_value = FakeResponse(301, target)
                with self.assertRaises(ValueError):
                    get_with_retry(session, 'https://example.com/start')
                self.assertEqual(session.get.call_count, 1)

    def test_multiple_public_redirects_allowed_and_closed(self):
        first, second, final = FakeResponse(301, '/a'), FakeResponse(302, 'https://cdn.example.com/b'), FakeResponse(200)
        session = Mock()
        session.get.side_effect = [first, second, final]
        self.assertIs(get_with_retry(session, 'https://example.com/'), final)
        self.assertEqual([x.args[0] for x in session.get.call_args_list],
                         ['https://example.com/', 'https://example.com/a', 'https://cdn.example.com/b'])
        first.close.assert_called_once()
        second.close.assert_called_once()

    def test_redirect_loop_stops(self):
        session = Mock()
        session.get.return_value = FakeResponse(302, '/same')
        with self.assertRaisesRegex(ValueError, 'redirect_loop'):
            get_with_retry(session, 'https://example.com/same')
        self.assertEqual(session.get.call_count, 1)

    def test_robots_uses_safe_redirect_path(self):
        session = Mock()
        session.get.return_value = FakeResponse(302, 'http://169.254.169.254/latest/meta-data/')
        with self.assertRaises(ValueError):
            Robots(session).allowed('https://example.com/allowed')
        self.assertEqual(session.get.call_count, 1)

    def test_normalization_equivalent_origins_and_tracking(self):
        self.assertEqual(clean_url('HTTPS://EXAMPLE.COM'), 'https://example.com/')
        self.assertEqual(clean_url('https://example.com/#top'), 'https://example.com/')
        self.assertEqual(clean_url('https://example.com:443/?utm_source=a'), 'https://example.com/')
        self.assertEqual(clean_url('http://EXAMPLE.COM:80'), 'http://example.com/')


if __name__ == '__main__':
    unittest.main()
