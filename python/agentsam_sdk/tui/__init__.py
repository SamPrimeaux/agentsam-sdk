"""Optional Rich terminal UI for the Agent Sam SDK CLI.

This package is presentation only. It is not an Agent Sam tool, tool catalog,
execution adapter, or authorization surface.

Core imports remain stdlib-only. Rich-backed renderables are loaded lazily when
requested so `agentsam_sdk` itself does not require the optional TUI extra.
"""
from __future__ import annotations

from .frames import BRAILLE, COMET, MOON, THINK, WALKER, normalize_frames

_RICH_EXPORTS = {
    "IAM_THEME",
    "IndexDashboard",
    "IndexState",
    "events_table",
    "get_console",
    "log_event",
    "spinner_glyph",
    "sprite_panel",
    "status_card",
}


def __getattr__(name: str):
    if name == "IAM_THEME":
        from .theme import IAM_THEME
        return IAM_THEME
    if name in _RICH_EXPORTS:
        from . import widgets
        return getattr(widgets, name)
    raise AttributeError(name)


__all__ = [
    "BRAILLE",
    "COMET",
    "IAM_THEME",
    "IndexDashboard",
    "IndexState",
    "MOON",
    "THINK",
    "WALKER",
    "events_table",
    "get_console",
    "log_event",
    "normalize_frames",
    "spinner_glyph",
    "sprite_panel",
    "status_card",
]
