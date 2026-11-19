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

    def inventory_native(self, *, version: str = "0.1.0") -> dict[str, Any]:
        """Run the registered read-only CAD/BIM/scene inventory on host-owned project scope.

        The caller does not supply a filesystem path or raw shell command.
        Returns the original verified procedure receipt, including evidence.
        """
        return self._procedures.run("repo.asset.inventory", version, {})

    async def ainventory_native(self, *, version: str = "0.1.0") -> dict[str, Any]:
        """Async counterpart using the same host authorization and procedure."""
        return await self._procedures.arun("repo.asset.inventory", version, {})
