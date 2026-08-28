from __future__ import annotations

import unittest

from agentsam_sdk.cli import build_parser
from agentsam_sdk.tui.frames import BRAILLE, COMET, MOON, THINK, WALKER


class TuiCliTests(unittest.TestCase):
    def test_tui_command_is_registered_without_importing_rich(self):
        args = build_parser().parse_args(["tui", "--scene", "card", "--check"])
        self.assertEqual(args.group, "tui")
        self.assertEqual(args.scene, "card")
        self.assertTrue(args.check)

    def test_animation_frames_are_available_without_rich(self):
        self.assertGreater(len(BRAILLE), 0)
        self.assertGreater(len(MOON), 0)
        self.assertGreater(len(WALKER), 0)
        self.assertGreater(len(THINK), 0)
        self.assertGreater(len(COMET), 0)


if __name__ == "__main__":
    unittest.main()
