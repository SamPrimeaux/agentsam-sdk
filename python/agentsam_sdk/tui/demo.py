"""Agent Sam Rich TUI demos — six reusable terminal patterns.

Run from repo root:

    pip install -e './python[tui]'
    agentsam tui
    agentsam tui --scene dashboard
    agentsam tui --check
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime

from .bootstrap import require_rich

require_rich()

from rich.live import Live
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeElapsedColumn,
)
from rich.rule import Rule
from rich.text import Text

from .frames import COMET, THINK, WALKER
from .theme import CYAN
from .widgets import (
    IndexDashboard,
    IndexState,
    events_table,
    get_console,
    log_event,
    spinner_glyph,
    sprite_panel,
    status_card,
    tty_hint,
)

SCENES = ("card", "progress", "dashboard", "events", "sprite", "logs", "ship")


def _sleep(seconds: float, *, fast: bool) -> None:
    time.sleep(0.0 if fast else seconds)


def demo_status_card(console, *, fast: bool = False) -> None:
    console.print(
        status_card(
            title="Agent Sam",
            rows=[
                ("mode", "[iam.cyan]operator cockpit[/]"),
                ("lane", "[bold]agentsam CLI[/] → local"),
                ("index", "[iam.green]idle[/] · 0 jobs running"),
                ("tty", tty_hint()),
            ],
            footer="solar cyan · in-place redraws",
        )
    )
    _sleep(0.4, fast=fast)


def demo_progress(console, *, ticks: int = 40, fast: bool = False) -> None:
    files_total = max(8, ticks) if fast else 80
    with Progress(
        SpinnerColumn(style="iam.magenta"),
        TextColumn("[iam.heading]{task.description}"),
        BarColumn(bar_width=32, complete_style=CYAN),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        parse = progress.add_task("parse_chunks", total=files_total)
        embed = progress.add_task("embed_symbols", total=files_total)
        for i in range(files_total):
            progress.advance(parse)
            if i > files_total // 4:
                progress.advance(embed)
            _sleep(0.04, fast=fast)


def demo_live_dashboard(console, *, ticks: int = 48, fast: bool = False) -> None:
    stages = (
        "tree_crawl",
        "parse_chunks",
        "write_symbols",
        "embed_symbols",
        "verify",
    )
    state = IndexState(
        stage=stages[0],
        files_total=2320,
        files_done=0,
        symbols=0,
    )
    dash = IndexDashboard(state, sprite="walker")
    refresh = 16 if not fast else 4
    with Live(dash, console=console, refresh_per_second=refresh, transient=False) as live:
        steps = 12 if fast else ticks
        for i in range(steps):
            dash.advance()
            state.files_done = min(state.files_total, 40 + i * (2320 // max(steps, 1)))
            state.symbols = int(state.files_done * 2.76)
            state.stage = stages[min(len(stages) - 1, i * len(stages) // steps)]
            if i == 0:
                state.note("tree crawl started")
            elif i == steps // 3:
                state.note("parse_chunks batch 24 files")
            elif i == (steps * 2) // 3:
                state.note("checkpoint committed")
            elif i == steps - 1:
                state.stage = "complete"
                state.files_done = state.files_total
                state.note("index activated")
            live.refresh()
            _sleep(0.09, fast=fast)


def demo_events_table(console, *, fast: bool = False) -> None:
    now = datetime.now().strftime("%H:%M:%S")
    console.print(
        events_table(
            [
                (now, "INFO", "Hyperdrive connected", "471 ms"),
                (now, "INFO", "HEAD pinned", "cafef00ddeadbeefcafef00ddeadbeefcafef00d"),
                (now, "WORK", "tree crawl complete", "4752 blobs"),
                (now, "WORK", "parsing batch", "24 files"),
                (now, "OK", "checkpoint committed", "durable"),
            ]
        )
    )
    _sleep(0.3, fast=fast)


def demo_agent_animation(console, *, ticks: int = 32, fast: bool = False) -> None:
    sets = [("walker", WALKER), ("think", THINK), ("comet", COMET)]
    name, frames = sets[0]
    cycles = 2 if fast else 1
    total = min(len(frames) * cycles, ticks if fast else len(frames) * 4)
    with Live(console=console, refresh_per_second=14, transient=False) as live:
        for i in range(total):
            # Rotate sprite family every full walker cycle.
            family = sets[(i // len(WALKER)) % len(sets)]
            name, frames = family
            frame = frames[i % len(frames)]
            caption = f"Agent Sam is {name}ing · frame {i + 1:02d}"
            if name == "think":
                caption = f"Agent Sam is thinking · frame {i + 1:02d}"
            elif name == "comet":
                caption = f"ship in flight · frame {i + 1:02d}"
            else:
                caption = f"Agent Sam is walking · frame {i + 1:02d}"
            live.update(sprite_panel(frame, caption=caption, title=f"agent · {name}"))
            _sleep(0.09, fast=fast)


def demo_log_stream(console, *, fast: bool = False) -> None:
    messages = [
        ("INFO", "Connected to Hyperdrive", "471 ms"),
        ("INFO", "GitHub HEAD pinned", "cafef00ddeadbeefcafef00ddeadbeefcafef00d"),
        ("INFO", "Tree crawl complete", "4752 blobs"),
        ("WORK", "Parsing batch", "24 files"),
        ("WORK", "Writing symbols", "180"),
        ("OK", "Checkpoint committed", "durable"),
        ("SHIP", "PWA cache_bust published", "ok"),
    ]
    for level, message, detail in messages:
        log_event(console, level, message, detail)
        _sleep(0.12, fast=fast)


def demo_ship_lane(console, *, ticks: int = 24, fast: bool = False) -> None:
    """Compact command receipt that updates in place for SDK CLI operations."""
    steps = [
        ("validate", "python tests"),
        ("package", "agentsam-sdk"),
        ("cli", "agentsam tui"),
        ("run", "operator action"),
        ("receipt", "status captured"),
        ("done", "command complete"),
    ]
    with Live(console=console, refresh_per_second=12, transient=False) as live:
        for i, (key, detail) in enumerate(steps):
            glyph = spinner_glyph(i, kind="moon")
            rows = []
            for j, (name, desc) in enumerate(steps):
                if j < i:
                    mark = "[iam.green]ok[/]"
                elif j == i:
                    mark = f"[bold iam.cyan]{glyph}[/]"
                else:
                    mark = "[dim]·[/]"
                rows.append((name, f"{mark}  {desc}"))
            live.update(
                status_card(
                    title=f"{COMET[i % len(COMET)]}",
                    rows=rows,
                    footer=f"step {i + 1}/{len(steps)} · {key} · {detail}",
                    border="iam.magenta",
                )
            )
            _sleep(0.35, fast=fast)
        live.update(
            status_card(
                title="SAM  landed  ═══════●",
                rows=[(name, f"[iam.green]ok[/]  {desc}") for name, desc in steps],
                footer="complete",
                border="iam.green",
            )
        )


SCENE_FNS = {
    "card": demo_status_card,
    "progress": demo_progress,
    "dashboard": demo_live_dashboard,
    "events": demo_events_table,
    "sprite": demo_agent_animation,
    "logs": demo_log_stream,
    "ship": demo_ship_lane,
}


def run_scene(name: str, console, *, ticks: int, fast: bool) -> None:
    fn = SCENE_FNS[name]
    console.print()
    console.print(Rule(f"[bold iam.cyan]{name}[/]"))
    kwargs = {"fast": fast}
    if name in {"progress", "dashboard", "sprite", "ship"}:
        kwargs["ticks"] = ticks
    fn(console, **kwargs)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="agentsam-tui",
        description="Rich terminal UI examples for Agent Sam operator scripts.",
    )
    parser.add_argument(
        "--scene",
        choices=("all", *SCENES),
        default="all",
        help="Which demo to run (default: all)",
    )
    parser.add_argument("--ticks", type=int, default=48, help="Frames for live scenes")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Render one pass of each scene with no delays (CI / smoke)",
    )
    parser.add_argument(
        "--force-color",
        action="store_true",
        help="Force color even when stdout is not a tty",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    console = get_console(force_terminal=True if args.force_color else None)
    fast = bool(args.check)
    ticks = 8 if fast else args.ticks

    console.print(
        Text.from_markup(
            "[bold iam.heading]Agent Sam · Rich terminal UI[/]\n"
            "[iam.muted]optional presentation layer for the Agent Sam SDK CLI; "
            "not a tool or execution capability[/]"
        )
    )

    names = SCENES if args.scene == "all" else (args.scene,)
    for name in names:
        run_scene(name, console, ticks=ticks, fast=fast)

    console.print()
    console.print("[bold iam.green]Done.[/]  Next: wire these renderables into real SDK CLI commands.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
