"""Render live Agent Sam local status supplied by the Node CLI."""

from __future__ import annotations

import json
import os

from .bootstrap import require_rich

require_rich()

from .widgets import get_console, status_card


def _load_status() -> dict:
    raw = os.environ.get("AGENTSAM_STATUS_JSON", "{}")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {}
    return data if isinstance(data, dict) else {}


def main() -> int:
    status = _load_status()
    console = get_console()

    if not status.get("configured"):
        console.print(
            status_card(
                title="Agent Sam · local",
                rows=[
                    ("project", "[iam.yellow]not configured[/]"),
                    ("root", str(status.get("root") or ".")),
                    ("next", "[bold iam.cyan]agentsam init[/]"),
                ],
                footer="local-first",
            )
        )
        return 0

    git = status.get("git") or {}
    db = status.get("db") or {}
    api = status.get("api") or {}
    pty = status.get("pty") or {}

    git_state = "dirty" if git.get("dirty") else "clean"
    db_state = "ready" if db.get("ready") else "not initialized"
    api_state = "online" if api.get("online") else "offline"
    pty_state = "online" if pty.get("online") else "offline"

    rows = [
        ("project", str(status.get("project") or "?")),
        ("lane", f"{status.get('lane') or '?'} · {status.get('agent') or '?'}"),
        (
            "git",
            f"{git.get('branch') or 'detached'} · {git_state} · {str(git.get('revision') or '')[:8]}",
        ),
        ("sqlite", f"{db_state} · {len(db.get('tables') or [])} tables"),
        ("api", f"{api_state} · {api.get('url') or ''}"),
        ("pty", f"{pty_state} · {str(pty.get('url') or '').replace('/health', '')}"),
        ("deploy", str(status.get("deployTarget") or "local only")),
    ]

    actions: list[str] = []
    if not db.get("ready"):
        actions.append("agentsam db init")
    if not api.get("online"):
        actions.append("npm run dev")
    if not pty.get("online"):
        actions.append("npm run pty")
    if not actions:
        actions.append("local stack healthy")

    console.print(
        status_card(
            title=f"Agent Sam · {status.get('project') or 'local'}",
            rows=rows,
            footer=" · ".join(actions),
            border="iam.cyan",
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
