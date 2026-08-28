"""Reusable Rich renderables for Agent Sam SDK CLI commands.

Presentation only: callers provide state; this module does not execute tools,
authorize actions, or own runtime behavior.
"""

from __future__ import annotations

import shutil
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable

from rich.align import Align
from rich.console import Console, Group, RenderableType
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .bootstrap import require_rich
from .frames import BRAILLE, COMET, MOON, THINK, WALKER
from .theme import IAM_THEME, LEVEL_STYLE


def get_console(*, force_terminal: bool | None = None) -> Console:
    require_rich()
    return Console(
        theme=IAM_THEME,
        highlight=False,
        force_terminal=force_terminal,
        color_system="truecolor" if force_terminal else "auto",
    )


def format_elapsed(seconds: float) -> str:
    total = max(0, int(seconds))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    if hours:
        return f"{hours}h {minutes:02d}m {secs:02d}s"
    return f"{minutes}m {secs:02d}s"


def format_int(n: int) -> str:
    return f"{n:,}"


@dataclass
class IndexState:
    """Mutable snapshot for a live code-index (or any staged job) card."""

    title: str = "Code Index"
    stage: str = "idle"
    files_done: int = 0
    files_total: int = 0
    symbols: int = 0
    errors: int = 0
    repo: str = "acme-corp/app"
    revision: str = "cafef00ddeadbeefcafef00ddeadbeefcafef00d"
    started_at: float = field(default_factory=time.time)
    events: list[tuple[str, str]] = field(default_factory=list)

    def note(self, message: str) -> None:
        stamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
        self.events.append((stamp, message))
        if len(self.events) > 6:
            self.events = self.events[-6:]


class IndexDashboard:
    """In-place dashboard. Pass the instance to rich.live.Live."""

    def __init__(self, state: IndexState | None = None, *, sprite: str = "walker"):
        self.state = state or IndexState()
        self.sprite = sprite
        self.tick = 0

    def advance(self) -> None:
        self.tick += 1

    def _sprite_text(self) -> Text:
        if self.sprite == "think":
            art = THINK[self.tick % len(THINK)]
        elif self.sprite == "comet":
            art = COMET[self.tick % len(COMET)]
        else:
            art = WALKER[self.tick % len(WALKER)]
        text = Text(art, style="bold iam.cyan")
        text.no_wrap = True
        return text

    def render(self) -> RenderableType:
        state = self.state
        stats = Table.grid(padding=(0, 2))
        stats.add_column(style="iam.muted", justify="right", min_width=10)
        stats.add_column(style="iam.text", min_width=22)
        stats.add_row("stage", f"[bold iam.cyan]{state.stage}[/]")
        stats.add_row(
            "files",
            f"{format_int(state.files_done)} / {format_int(state.files_total)}",
        )
        stats.add_row("symbols", format_int(state.symbols))
        err_style = "iam.red" if state.errors else "iam.green"
        stats.add_row("errors", f"[{err_style}]{state.errors}[/]")
        stats.add_row("elapsed", format_elapsed(time.time() - state.started_at))
        stats.add_row("repo", f"[iam.muted]{state.repo}[/]")
        stats.add_row("rev", Text(state.revision, style="dim", overflow="fold"))

        events = Table.grid(padding=(0, 1))
        events.add_column(style="dim", min_width=8)
        events.add_column(style="iam.text")
        if state.events:
            for stamp, message in state.events:
                events.add_row(stamp, message)
        else:
            events.add_row("—", "[iam.muted]waiting for first batch[/]")

        body = Table.grid(expand=True, padding=(0, 2))
        body.add_column(ratio=3)
        body.add_column(ratio=2, justify="center")
        body.add_row(stats, Align.center(self._sprite_text(), vertical="middle"))
        body.add_row(events, Text(""))

        moon = MOON[self.tick % len(MOON)]
        title = f"[bold iam.heading]{moon}  {state.title}[/bold iam.heading]"
        return Panel(
            body,
            title=title,
            subtitle="[iam.muted]live · redraw in place[/]",
            border_style="iam.magenta",
            padding=(1, 1),
        )

    def __rich__(self) -> RenderableType:
        return self.render()


def status_card(
    *,
    title: str,
    rows: Iterable[tuple[str, str]],
    footer: str | None = None,
    border: str = "iam.cyan",
) -> Panel:
    table = Table.grid(padding=(0, 2))
    table.add_column(style="iam.muted", justify="right", min_width=12)
    table.add_column(style="iam.text")
    for label, value in rows:
        table.add_row(label, value)
    return Panel(
        table,
        title=f"[bold]{title}[/bold]",
        subtitle=f"[iam.muted]{footer}[/]" if footer else None,
        border_style=border,
        width=min(56, shutil.get_terminal_size((80, 24)).columns),
    )


def sprite_panel(frame: str, *, caption: str, title: str = "agent activity") -> Panel:
    art = Text(frame, style="bold iam.cyan")
    art.no_wrap = True
    caption_text = Text(f"\n{caption}", style="iam.muted")
    return Panel(
        Group(art, caption_text),
        title=f"[bold]{title}[/bold]",
        border_style="iam.magenta",
        width=36,
        padding=(0, 1),
    )


def events_table(rows: Iterable[tuple[str, str, str, str]]) -> Table:
    table = Table(
        title="[iam.heading]recent events[/]",
        expand=False,
        show_lines=False,
        pad_edge=False,
    )
    table.add_column("time", style="dim", no_wrap=True)
    table.add_column("level", no_wrap=True)
    table.add_column("event", style="iam.text")
    table.add_column("detail", style="iam.muted")
    for stamp, level, event, detail in rows:
        style = LEVEL_STYLE.get(level, "iam.text")
        table.add_row(stamp, Text(level, style=style), event, detail)
    return table


def log_event(
    console: Console,
    level: str,
    message: str,
    detail: str = "",
    *,
    now: datetime | None = None,
) -> None:
    stamp = (now or datetime.now()).strftime("%H:%M:%S")
    style = LEVEL_STYLE.get(level, "iam.text")
    suffix = f" [dim]· {detail}[/dim]" if detail else ""
    console.print(
        f"[dim]{stamp}[/dim] [{style}]{level:>4}[/{style}] {message}{suffix}"
    )


def spinner_glyph(tick: int, *, kind: str = "braille") -> str:
    if kind == "moon":
        return MOON[tick % len(MOON)]
    if kind == "comet":
        return COMET[tick % len(COMET)].strip()
    return BRAILLE[tick % len(BRAILLE)]


def tty_hint() -> str:
    if sys.stdout.isatty():
        return "tty"
    return "not a tty — Live will print sequentially"
