"""Unit tests — no network."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from agentsam_site_scrape.classify import AssetNamer, aspect_label, classify_section
from agentsam_site_scrape.htmlparse import parse
from agentsam_site_scrape.imageops import sniff_image_ext
from agentsam_site_scrape.pageextract import clean_url, extract_page, page_slug
from agentsam_site_scrape.ssrf import assert_public_http_url
from agentsam_site_scrape.wrangler_bucket import resolve_website_assets_bucket


class TestSsrf(unittest.TestCase):
    def test_allows_public(self):
        assert_public_http_url("https://example.com/path")

    def test_blocks_localhost(self):
        with self.assertRaises(ValueError):
            assert_public_http_url("http://127.0.0.1/")
        with self.assertRaises(ValueError):
            assert_public_http_url("http://localhost/x")

    def test_blocks_metadata(self):
        with self.assertRaises(ValueError):
            assert_public_http_url("http://169.254.169.254/latest/meta-data")


class TestHtmlParse(unittest.TestCase):
    def test_nested_text_content(self):
        root = parse("<p>Hello <span>world</span></p>")
        p = root.find_all("p")[0]
        self.assertIn("Hello", p.text_content())
        self.assertIn("world", p.text_content())

    def test_nav_ancestor_tokens(self):
        root = parse('<nav class="Main-Nav"><a href="/about">About</a></nav>')
        a = root.find_all("a")[0]
        tokens = set(a.ancestor_tokens())
        self.assertIn("nav", tokens)
        self.assertIn("main", tokens)


class TestPageExtract(unittest.TestCase):
    def test_clean_strips_utm(self):
        url = clean_url("https://Example.com/a?utm_source=x&id=1")
        self.assertEqual(url, "https://example.com/a?id=1")

    def test_page_slug_home(self):
        self.assertEqual(page_slug("https://x.com/"), "home")
        self.assertEqual(page_slug("https://x.com/about-us"), "about-us")

    def test_nested_paragraph_content(self):
        html = """
        <html><head><title>T</title></head>
        <body><p>Outer <strong>inner</strong> text</p>
        <nav><a href="/about">About</a></nav>
        <div class="hero"><img src="/h.jpg" alt="hero"></div>
        </body></html>
        """
        page = extract_page(html, "https://example.com/")
        self.assertEqual(page.title, "T")
        self.assertTrue(any("inner" in c["text"] for c in page.content))
        self.assertTrue(any(i.url.endswith("/h.jpg") for i in page.images))
        hero = next(i for i in page.images if i.url.endswith("/h.jpg"))
        self.assertEqual(classify_section(hero.ancestor_context), "hero")


class TestClassify(unittest.TestCase):
    def test_nav_token_match(self):
        self.assertEqual(classify_section("a nav header"), "nav")
        self.assertEqual(classify_section("div logo brand"), "logo")

    def test_aspect_16x9(self):
        self.assertEqual(aspect_label(1920, 1080), "16x9")

    def test_namer_collision(self):
        n = AssetNamer()
        a = n.next("home", "hero", "16x9")
        b = n.next("home", "hero", "16x9")
        self.assertEqual(a.stem(), "home-hero-16x9")
        self.assertEqual(b.stem(), "home-hero-16x9-02")


class TestSniff(unittest.TestCase):
    def test_png_magic(self):
        data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
        self.assertEqual(sniff_image_ext(data), ".png")

    def test_jpeg_magic(self):
        self.assertEqual(sniff_image_ext(b"\xff\xd8\xff" + b"\x00" * 20), ".jpg")


class TestWranglerBucket(unittest.TestCase):
    def test_jsonc_resolve(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "wrangler.jsonc").write_text(
                '{\n  // comment\n  "r2_buckets": [\n'
                '    { "binding": "WEBSITE_ASSETS", "bucket_name": "companionscpas" }\n'
                "  ]\n}\n",
                encoding="utf-8",
            )
            self.assertEqual(resolve_website_assets_bucket(root), "companionscpas")

    def test_missing_fails_loud(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "wrangler.jsonc").write_text(json.dumps({"name": "x"}), encoding="utf-8")
            with self.assertRaises(RuntimeError):
                resolve_website_assets_bucket(root)


if __name__ == "__main__":
    unittest.main()
