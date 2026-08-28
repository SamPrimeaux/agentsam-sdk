"""Agent Sam SDK terminal palette, derived from Inner Animal Media solar tokens."""

from __future__ import annotations

from rich.theme import Theme

# Kept as SDK-local presentation tokens; no browser/dashboard dependency.
CYAN = "#2dd4bf"
MAGENTA = "#d33682"
YELLOW = "#e6ac00"
ORANGE = "#d95f1c"
RED = "#e63333"
VIOLET = "#7c83d4"
BLUE = "#3a9fe8"
GREEN = "#a3b800"
MUTED = "#7a9aaa"
TEXT = "#9cb5bc"
HEADING = "#b0ccd2"
PANEL = "#0a2d38"
CANVAS = "#00212b"
BORDER = "#1e3e4a"

IAM_THEME = Theme(
    {
        "iam.cyan": CYAN,
        "iam.magenta": MAGENTA,
        "iam.yellow": YELLOW,
        "iam.orange": ORANGE,
        "iam.red": RED,
        "iam.violet": VIOLET,
        "iam.blue": BLUE,
        "iam.green": GREEN,
        "iam.muted": MUTED,
        "iam.text": TEXT,
        "iam.heading": HEADING,
        "info": BLUE,
        "warning": YELLOW,
        "error": RED,
        "success": GREEN,
        "repr.number": CYAN,
        "repr.str": TEXT,
        "progress.percentage": CYAN,
        "progress.remaining": MUTED,
        "bar.complete": CYAN,
        "bar.finished": GREEN,
        "bar.pulse": MAGENTA,
    }
)

LEVEL_STYLE = {
    "INFO": "iam.blue",
    "WORK": "iam.yellow",
    "OK": "iam.green",
    "WARN": "bold iam.yellow",
    "ERR": "bold iam.red",
    "SHIP": "iam.magenta",
}
