"""Fail loud with an install hint before any optional `rich` import."""
from __future__ import annotations

_MISSING = (
    "AgentSam CLI requires the 'rich' runtime dependency.\n"
    "  pip install --upgrade agentsam-sdk\n"
    "  python -m agentsam_sdk.tui --scene boot\n"
)


def require_rich() -> None:
    try:
        import rich  # noqa: F401
    except ImportError as exc:
        raise SystemExit(_MISSING) from exc
