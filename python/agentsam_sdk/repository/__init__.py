"""Repository-scoped portable tools (inventory, cleanup plans, dead paths)."""

from __future__ import annotations

from typing import Any

__all__ = ["run_inventory", "scan", "main"]


def __getattr__(name: str) -> Any:
    if name in __all__:
        from . import inventory as _inv

        return getattr(_inv, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
