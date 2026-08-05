"""Repository-level audits (inventory, scan_bloat, inspect).

Lazy exports so `python -m agentsam_sdk.repository.inspect` does not warn.
"""

from __future__ import annotations

from typing import Any

__all__ = ["inventory", "scan_bloat", "inspect"]


def __getattr__(name: str) -> Any:
    if name == "inventory":
        from agentsam_sdk.repository import inventory as mod

        return mod
    if name == "scan_bloat":
        from agentsam_sdk.repository import scan_bloat as mod

        return mod
    if name == "inspect":
        from agentsam_sdk.repository import inspect as mod

        return mod
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
