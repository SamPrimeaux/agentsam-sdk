"""Source-asset procedure API for the installed Python AgentSam SDK.

The SDK owns this discoverable client API, but never spawns the PrimeTech
procedure or duplicates its native inventory algorithm. The host-supplied
ProcedureClient enforces authorization and validates the verified receipt.
"""
from __future__ import annotations

from typing import Any

from agentsam_sdk.procedures import ProcedureClient


class AssetProcedures:
    """Typed, portable facade for the canonical source asset inventory workflow."""

    def __init__(self, procedures: ProcedureClient):
        if not isinstance(procedures, ProcedureClient):
            raise TypeError("agentsam_asset_procedure_client_required")
        self._procedures = procedures

    def inventory(self, *, version: str = "0.1.0") -> dict[str, Any]:
        """Run the authorized inventory through whichever host execution lane is bound.

        No caller-selected paths or shell commands. Only the existing procedure
        host determines scope and verifies the artifact/receipt.
        """
        return self._procedures.run("repo.asset.inventory", version, {})

    async def ainventory(self, *, version: str = "0.1.0") -> dict[str, Any]:
        """Async version of inventory() using the same authoritative procedure."""
        return await self._procedures.arun("repo.asset.inventory", version, {})

    def inventory_native(self, *, version: str = "0.1.0") -> dict[str, Any]:
        """Compatibility alias; prefer inventory(), independent of the execution lane."""
        return self.inventory(version=version)

    async def ainventory_native(self, *, version: str = "0.1.0") -> dict[str, Any]:
        """Compatibility alias; prefer ainventory()."""
        return await self.ainventory(version=version)
