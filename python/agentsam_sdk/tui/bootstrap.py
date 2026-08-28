"""Fail loud with an install hint before any optional `rich` import."""
from __future__ import annotations

_MISSING = (
    "Python package 'rich' is required for the Agent Sam TUI.\n"
    "  pip install -e './python[tui]'\n"
    "  agentsam tui\n"
)


def require_rich() -> None:
    try:
        import rich  # noqa: F401
    except ImportError as exc:
        raise SystemExit(_MISSING) from exc
