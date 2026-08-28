"""Repository audits and repository intelligence.

The older inventory/scan modules keep their compatibility contracts. New repo-shape
analysis belongs under ``repository.intelligence`` so it can observe arbitrary
repositories without encoding one product's directory layout.
"""

from __future__ import annotations

from . import inspect, intelligence, inventory, scan_bloat

__all__ = ["inventory", "scan_bloat", "inspect", "intelligence"]
