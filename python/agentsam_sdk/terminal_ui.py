"""The installed AgentSam CLI presentation — one UI, never a separate 'tui' product.

UI/chrome go to stderr; all JSON and tool data remain on stdout. Non-TTY use is
stable and non-interactive. The renderer is not an execution authority.
"""
from __future__ import annotations

import contextlib
import io
import os
import shlex
import sys
from typing import Any

from rich.console import Console
from rich.markup import escape
from rich.panel import Panel
from rich.prompt import Prompt
from rich.table import Table
from rich.text import Text

from .terminal_art import boot_header
from .tui.theme import IAM_THEME

_RECOVERY = {
    "asset_inventory_path_outside_scope": (
        "The requested directory is outside the selected project.",
        "Choose a path inside the project root.", None,
    ),
    "asset_inventory_limit_invalid": (
        "The requested asset inventory limit is invalid.",
        "Choose a limit between 1 and 100000.", None,
    ),
    "asset_inventory_depth_invalid": (
        "The requested directory scan depth is invalid.",
        "Choose a maximum depth between 0 and 32.", None,
    ),
    "asset_inventory_read_failed": (
        "An asset could not be read or hashed.",
        "Check file permissions and retry with a smaller project scope.", None,
    ),
    "asset_inventory_target_not_found": (
        "The selected directory could not be opened.",
        "Check the directory name and try again.", None,
    ),
    "occt_host_not_found": (
        "The native CAD runtime is not installed or discoverable.",
        "Install the supported native engine or set AGENTSAM_OCCT_BIN.", None,
    ),
    "sam_node_required": (
        "This operation currently needs the JavaScript SAM bridge.",
        "Use a native Python operation, or install the SDK's Node bridge.", None,
    ),
    "sam_bridge_not_installed": (
        "This operation isn't available in the Python runtime.",
        "Use a native Python capability or configure the existing Node bridge.", None,
    ),
    "provider_budget_exhausted": (
        "The selected provider reported insufficient available budget.",
        "Review the provider's billing settings before retrying.", None,
    ),
    "process_timeout": (
        "The command exceeded its execution time limit.",
        "Inspect the execution receipt before attempting a retry.", None,
    ),
    "process_output_limit": (
        "The command exceeded its permitted output size.",
        "Narrow the operation or reduce the requested output.", None,
    ),
}


def get_cli_console() -> Console:
    plain = bool(os.environ.get("NO_COLOR") or os.environ.get("AGENTSAM_PLAIN"))
    return Console(stderr=True, theme=IAM_THEME, highlight=False, no_color=plain,
                   color_system=None if plain else "auto", soft_wrap=False)


def show_error(error: Any, *, console: Console | None = None) -> None:
    console = console or get_cli_console()
    reason = str(getattr(error, "code", None) or getattr(error, "reason", None) or type(error).__name__)
    default = str(error).strip() or "The operation failed."
    why, fix, url = _RECOVERY.get(reason, (default, "Inspect the command help or diagnostic output.", None))
    provider = str(getattr(error, "provider", "")).lower()
    if reason == "provider_budget_exhausted" and provider == "anthropic":
        url = "https://platform.claude.com/settings/billing"
    if not console.is_terminal or os.environ.get("AGENTSAM_PLAIN"):
        console.print(f"Error: {why}\n  reason: {reason}\n  next: {fix}")
        if url:
            console.print(f"  help: {url}")
        return
    text = Text()
    text.append(f"{why}\n", style="bold")
    if why != default:
        text.append(f"{default}\n", style="dim")
    text.append("\nNext: ", style="bold")
    text.append(fix)
    if url:
        text.append(f"\nHelp: {url}", style="underline")
    text.append(f"\nReason: {reason}", style="dim")
    console.print(Panel(text, title="Unable to complete", border_style="red", expand=False))


def show_result(result: Any, *, console: Console | None = None) -> None:
    console = console or get_cli_console()
    ok = bool(getattr(result, "ok", False))
    status = "Completed" if ok else "Failed"
    tool = getattr(result, "tool", "operation")
    summary = getattr(result, "summary", "") or ""
    if not console.is_terminal:
        console.print(f"[{status.upper()}] {tool} — {summary}")
        if not ok and getattr(result, "error", None):
            show_error(RuntimeError(str(result.error)), console=console)
        return
    body = Table.grid(padding=(0, 2))
    body.add_column(style="dim", min_width=8)
    body.add_column()
    body.add_row("Operation", escape(str(tool)))
    body.add_row("Summary", escape(str(summary)))
    artifacts = getattr(result, "artifacts", []) or []
    for item in artifacts:
        body.add_row("Artifact", escape(str(item)))
    console.print(Panel(body, title=status, border_style="green" if ok else "red", expand=False))
    if not ok and getattr(result, "error", None):
        show_error(RuntimeError(str(result.error)), console=console)


def show_data_table(title: str, rows: list[tuple[str, str]], *, console: Console | None = None) -> None:
    console = console or get_cli_console()
    table = Table(title=title, show_header=False, box=None, expand=False, padding=(0, 2))
    table.add_column(style="dim", min_width=16)
    table.add_column(overflow="fold")
    for key, value in rows:
        table.add_row(escape(str(key)), escape(str(value)))
    console.print(table)


def _help(parser: Any, console: Console) -> None:
    output = io.StringIO()
    parser.print_help(file=output)
    console.print(Panel(Text(output.getvalue().rstrip()), title="Commands", border_style="dim"))


def run_home(parser: Any) -> int:
    if not (sys.stdin.isatty() and sys.stderr.isatty()) or os.environ.get("CI"):
        parser.print_help(file=sys.stderr)
        return 0
    console = get_cli_console()
    console.print(Text.from_ansi(boot_header(width=min(console.width, 100), color=not console.no_color)))
    commands = Table.grid(expand=False, padding=(0, 2))
    commands.add_column(style="bold", width=8)
    commands.add_column()
    commands.add_row("doctor", "Check installed SDK and optional runtimes")
    commands.add_row("assets", "Inventory project CAD, media and scene assets")
    commands.add_row("cad", "Verify the native OCCT/FreeCAD adapters")
    commands.add_row("repository", "Inspect a local source tree")
    commands.add_row("data", "Run configured D1 audits")
    console.print(Panel(commands, title="Local tools", border_style="dim", expand=False))
    console.print("[dim]Type a command, 'help', or 'exit'. No cloud credentials are required for local operations.[/]")
    while True:
        try:
            line = Prompt.ask("[bold]agentsam[/]", console=console)
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]Session closed.[/]")
            break
        try:
            words = shlex.split(line)
        except ValueError as exc:
            show_error(exc, console=console)
            continue
        if not words:
            continue
        if words[0] in ("exit", "quit", "/exit", "/quit"):
            break
        if words[0] in ("help", "/help", "?") and len(words) == 1:
            _help(parser, console)
            continue
        if words[0] == "clear":
            console.clear()
            continue
        out, err = io.StringIO(), io.StringIO()
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                arguments = parser.parse_args(words)
        except SystemExit as exc:
            if exc.code == 0:
                console.print(Text(out.getvalue() or err.getvalue()))
            else:
                console.print(Panel(Text((err.getvalue() or "Invalid command").strip()),
                                    title="Command not recognized", border_style="yellow", expand=False))
                console.print("[dim]Run 'help' for all supported commands.[/]")
            continue
        try:
            exit_code = arguments.func(arguments)
            if exit_code:
                console.print(f"[yellow]Command exited with code {exit_code}.[/]")
        except (OSError, RuntimeError, ValueError) as exc:
            show_error(exc, console=console)
    return 0
