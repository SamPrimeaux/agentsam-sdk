import io
import unittest
from contextlib import redirect_stderr, redirect_stdout

from agentsam_sdk.cli import main
from agentsam_sdk.terminal_art import boot_header, load_companion_art, render_half_block


class CompanionTerminalArtTests(unittest.TestCase):
    def test_geaux_is_a_real_indexed_art_asset(self):
        art = load_companion_art()
        self.assertEqual(art["companionId"], "geaux")
        self.assertEqual(len(art["grid"]), art["height"])
        self.assertTrue(all(len(row) == art["width"] for row in art["grid"]))
        self.assertGreater(sum(ch != "." for row in art["grid"] for ch in row), 60)

    def test_monochrome_has_no_ansi_and_header_uses_package_version(self):
        art = load_companion_art()
        plain = render_half_block(art["grid"], color=False)
        self.assertIn("█", plain)
        self.assertNotIn("\x1b[", plain)
        header = boot_header(width=90, color=False)
        self.assertIn("AgentSam CLI", header)
        self.assertIn("v", header)
        self.assertNotIn("\x1b[", header)

    def test_noarg_non_tty_has_clean_stdout(self):
        data, chrome = io.StringIO(), io.StringIO()
        with redirect_stdout(data), redirect_stderr(chrome):
            self.assertEqual(main([]), 0)
        self.assertEqual(data.getvalue(), "")
        self.assertIn("usage:", chrome.getvalue())


if __name__ == "__main__":
    unittest.main()
