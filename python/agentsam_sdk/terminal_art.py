"""AgentSam's stdlib-only CLI home and companion artwork renderer.

Terminal chrome goes to stderr. Commands keep stdout available for data/JSON.
The indexed Geaux art is generated from the canonical companion PNG at build time.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
from importlib import metadata, resources
from pathlib import Path
from typing import Any

ROLES = {
    "d": (90, 100),   # terminal-theme dark role: dim foreground/background
    "m": (37, 47),    # terminal-theme mid role
    "h": (97, 107),   # terminal-theme highlight
}
RESET = "\x1b[0m"


def load_companion_art() -> dict[str, Any]:
    path = resources.files("agentsam_sdk").joinpath("assets/geaux_boot.json")
    return json.loads(path.read_text(encoding="utf-8"))


def render_half_block(grid: list[str], *, color: bool) -> str:
    """Render two indexed source rows per terminal row. Never embeds RGB values."""
    if not grid or len({len(row) for row in grid}) != 1:
        return ""
    if len(grid) % 2:
        grid = [*grid, "." * len(grid[0])]
    lines: list[str] = []
    for y in range(0, len(grid), 2):
        cells: list[str] = []
        for top, bottom in zip(grid[y], grid[y + 1]):
            if top == bottom == ".":
                cells.append(" ")
            elif not color:
                cells.append("█" if top != "." and bottom != "." else "▀" if top != "." else "▄")
            elif top == ".":
                cells.append(f"\x1b[{ROLES[bottom][0]}m▄{RESET}")
            elif bottom == ".":
                cells.append(f"\x1b[{ROLES[top][0]}m▀{RESET}")
            else:
                cells.append(f"\x1b[{ROLES[top][0]};{ROLES[bottom][1]}m▀{RESET}")
        lines.append("".join(cells))
    return "\n".join(lines)


def version_string() -> str:
    try:
        return metadata.version("agentsam-sdk")
    except metadata.PackageNotFoundError:
        from . import __version__
        return __version__


def boot_header(*, width: int | None = None, color: bool | None = None) -> str:
    if width is None:
        width = shutil.get_terminal_size((80, 24)).columns
    if color is None:
        color = not os.environ.get("NO_COLOR") and os.environ.get("TERM") != "dumb"
    cwd = str(Path.cwd())
    home = str(Path.home())
    if cwd == home or cwd.startswith(home + os.sep):
        cwd = "~" + cwd[len(home):]
    info = [f"AgentSam CLI  v{version_string()}", f"local · Python {sys.version_info.major}.{sys.version_info.minor}", cwd]
    if width < 52:
        return "\n".join(info) + "\n"
    art = load_companion_art()
    lines = render_half_block(art["grid"], color=color).splitlines()
    pad = " " * art["width"]
    size = max(len(lines), len(info))
    lines.extend([pad] * (size - len(lines)))
    info.extend([""] * (size - len(info)))
    return "\n".join(f"{left}  {right}" for left, right in zip(lines, info)) + "\n"


def run_home(parser: Any) -> int:
    """Compatibility entrypoint for the built-in Rich terminal home."""
    from .terminal_ui import run_home as rich_home
    return rich_home(parser)
