"""Preview-only startup and onboarding compositions for the Agent Sam CLI.

These scenes intentionally do not perform setup or mutate local state. They let us
judge the terminal UX before wiring the same presentation primitives into
`agentsam`, `agentsam init`, and `agentsam shell`.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

from .bootstrap import require_rich

require_rich()

from rich.align import Align
from rich.console import Group
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .frames import BRAILLE, MOON, THINK


@dataclass(frozen=True)
class PreviewContext:
    project: str = "agentsam-sdk"
    cwd: str = "~/agentsam-sdk"
    shell: str = "zsh"
    platform: str = "macOS"
    version: str = "2.5.0"


def _sleep(seconds: float, *, fast: bool) -> None:
    time.sleep(0.0 if fast else seconds)


def _brand_header(ctx: PreviewContext, *, tick: int = 0) -> Group:
    pulse = MOON[tick % len(MOON)]
    title = Text()
    title.append("  Agent Sam", style="bold iam.heading")
    title.append(f"  {pulse}", style="bold iam.cyan")
    meta = Text(
        f"  SDK {ctx.version}  ·  {ctx.platform}  ·  {ctx.shell}",
        style="iam.muted",
    )
    return Group(title, meta)


def _boot_card(ctx: PreviewContext, *, tick: int, phase: int) -> Panel:
    states = (
        ("environment", "Detecting terminal", phase >= 1),
        ("project", ctx.project, phase >= 2),
        ("shell", f"{ctx.shell} · {ctx.cwd}", phase >= 3),
        ("runtime", "Local-first", phase >= 4),
    )
    rows = Table.grid(padding=(0, 2))
    rows.add_column(style="iam.muted", justify="right", min_width=12)
    rows.add_column(min_width=34)
    for index, (label, value, ready) in enumerate(states):
        if ready:
            mark = "[iam.green]✓[/]"
            body = f"[iam.text]{value}[/]"
        elif index == phase:
            mark = f"[bold iam.cyan]{BRAILLE[tick % len(BRAILLE)]}[/]"
            body = f"[iam.muted]{value}[/]"
        else:
            mark = "[dim]·[/]"
            body = f"[dim]{value}[/]"
        rows.add_row(label, f"{mark}  {body}")
    return Panel(
        Group(_brand_header(ctx, tick=tick), Text(""), rows),
        border_style="iam.cyan",
        padding=(1, 2),
        subtitle="[iam.muted]starting locally — no cloud required[/]",
        width=62,
    )


def preview_boot(console, *, fast: bool = False, ticks: int = 24) -> None:
    """Compact cold-start sequence: identity, environment, cwd, then handoff."""
    ctx = PreviewContext()
    frames = max(8, min(ticks, 28))
    with Live(console=console, refresh_per_second=18, transient=False) as live:
        for i in range(frames):
            phase = min(4, i // max(1, frames // 5))
            live.update(_boot_card(ctx, tick=i, phase=phase))
            _sleep(0.055, fast=fast)
        live.update(_boot_card(ctx, tick=frames, phase=4))
    console.print("  [iam.green]✓[/] Ready  [iam.muted]· type [bold]/help[/] when you want the map[/]")


def _setup_panel(step: int, tick: int, ctx: PreviewContext) -> Panel:
    steps = [
        ("Project", "Use this folder", ctx.cwd),
        ("Local runtime", "Keep execution on this machine", "recommended"),
        ("Terminal", "Use your existing shell", ctx.shell),
        ("Agent", "Enable Agent Sam when you need it", "optional"),
        ("Done", "Open the guided shell", "agentsam shell"),
    ]
    grid = Table.grid(padding=(0, 2))
    grid.add_column(width=3, justify="center")
    grid.add_column(min_width=15)
    grid.add_column(min_width=29)
    for i, (label, description, answer) in enumerate(steps):
        if i < step:
            marker = "[iam.green]✓[/]"
            label_style = "iam.text"
            detail = f"[iam.muted]{answer}[/]"
        elif i == step:
            marker = f"[bold iam.cyan]{MOON[tick % len(MOON)]}[/]"
            label_style = "bold iam.heading"
            detail = f"[iam.cyan]{description}[/]\n[dim]  {answer}[/]"
        else:
            marker = "[dim]○[/]"
            label_style = "dim"
            detail = f"[dim]{description}[/]"
        grid.add_row(marker, f"[{label_style}]{label}[/]", detail)
    footer = "Enter choose  ·  ↑↓ move  ·  Esc back" if step < len(steps) - 1 else "Enter open shell  ·  setup can be changed later"
    return Panel(
        grid,
        title="[bold iam.heading]Set up Agent Sam[/]",
        subtitle=f"[iam.muted]{footer}[/]",
        border_style="iam.cyan",
        padding=(1, 2),
        width=68,
    )


def preview_setup(console, *, fast: bool = False, ticks: int = 30) -> None:
    """Progressive-discovery wizard mock: one decision at a time, no wall of text."""
    ctx = PreviewContext()
    console.print(_brand_header(ctx))
    console.print("  [iam.muted]First run · five small choices. Nothing is uploaded.[/]")
    console.print()
    steps = 5
    with Live(console=console, refresh_per_second=12, transient=False) as live:
        for step in range(steps):
            loops = 1 if fast else max(2, min(5, ticks // steps))
            for tick in range(loops):
                live.update(_setup_panel(step, tick, ctx))
                _sleep(0.12, fast=fast)
        live.update(_setup_panel(steps - 1, 4, ctx))


def _ready_panel(ctx: PreviewContext, *, tick: int) -> Panel:
    hint = Table.grid(padding=(0, 2))
    hint.add_column(style="iam.cyan", min_width=14)
    hint.add_column(style="iam.muted")
    hint.add_row("/help", "show the command map")
    hint.add_row("/status", "check project + local services")
    hint.add_row("/agent <goal>", "ask Agent Sam to work with you")
    hint.add_row("regular shell", "git, npm, python, etc. stay normal")

    prompt = Text()
    prompt.append("sam", style="bold iam.cyan")
    prompt.append(f"  {ctx.cwd}", style="iam.muted")
    prompt.append("  › ", style="bold iam.heading")
    prompt.append("_" if tick % 2 == 0 else " ", style="iam.cyan")

    return Panel(
        Group(_brand_header(ctx, tick=tick), Text(""), hint, Text(""), prompt),
        title="[bold iam.heading]Ready[/]",
        border_style="iam.green",
        padding=(1, 2),
        width=68,
    )


def preview_ready(console, *, fast: bool = False, ticks: int = 12) -> None:
    """The final quiet landing state: useful hints, then get out of the way."""
    ctx = PreviewContext()
    loops = 2 if fast else max(4, min(ticks, 16))
    with Live(console=console, refresh_per_second=4, transient=False) as live:
        for i in range(loops):
            live.update(_ready_panel(ctx, tick=i))
            _sleep(0.22, fast=fast)


def preview_thinking(console, *, fast: bool = False, ticks: int = 18) -> None:
    """Small assistant activity animation intended for inline use, not a full screen."""
    loops = 3 if fast else max(6, min(ticks, 24))
    with Live(console=console, refresh_per_second=14, transient=False) as live:
        for i in range(loops):
            frame = THINK[i % len(THINK)]
            body = Text(frame, style="bold iam.cyan", no_wrap=True)
            live.update(
                Panel(
                    Align.center(body),
                    title="[bold iam.heading]Agent Sam[/]",
                    subtitle="[iam.muted]thinking · working locally[/]",
                    border_style="iam.cyan",
                    width=34,
                    padding=(0, 1),
                )
            )
            _sleep(0.09, fast=fast)


def preview_tour(console, *, fast: bool = False, ticks: int = 24) -> None:
    preview_boot(console, fast=fast, ticks=ticks)
    console.print()
    preview_setup(console, fast=fast, ticks=ticks)
    console.print()
    preview_thinking(console, fast=fast, ticks=ticks)
    console.print()
    preview_ready(console, fast=fast, ticks=ticks)
