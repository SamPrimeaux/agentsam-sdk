from __future__ import annotations

import contextlib
import io
import unittest

from agentsam_sdk.cli import build_parser
from agentsam_sdk.tui.frames import BRAILLE, COMET, MOON, THINK, WALKER


class TuiCliTests(unittest.TestCase):
    def test_tui_is_not_a_public_python_cli_command(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                build_parser().parse_args(["tui"])

    def test_animation_frames_remain_available_to_internal_renderers(self):
        self.assertGreater(len(BRAILLE), 0)
        self.assertGreater(len(MOON), 0)
        self.assertGreater(len(WALKER), 0)
        self.assertGreater(len(THINK), 0)
        self.assertGreater(len(COMET), 0)


if __name__ == "__main__":
    unittest.main()
