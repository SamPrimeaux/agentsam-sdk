"""Repository-level audits (inventory, scan_bloat, inspect).

Plain relative imports — avoid lazy ``__getattr__`` re-exports. Under unittest
discovery, ``from agentsam_sdk.repository import X as mod`` inside
``__getattr__`` recurses and blows the stack.
"""

from __future__ import annotations

from . import inspect, inventory, scan_bloat

__all__ = ["inventory", "scan_bloat", "inspect"]
