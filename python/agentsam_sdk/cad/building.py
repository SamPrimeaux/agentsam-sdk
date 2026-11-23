"""Backward-compatible building-export façade over the generic CAD transport.

New code should prefer CadServiceClient for provider operations and CadJobClient
for durable project work. This class remains for the experimental rectangular-
building proof endpoint.
"""
from __future__ import annotations

from typing import Any, Mapping

from .service import CadServiceClient, CadServiceError

SCENE_FORMAT = "agentsam.cad.building-export.v1"
REQUIRED_FILES = frozenset((
    "shell.step",
    "shell.ifc",
    "plan.dxf",
    "plan.svg",
    "preview.png",
    "sheet-A101-proof.pdf",
    "model.glb",
    "model.opt.glb",
    "turntable.mp4",
))


class CadBuildingClient(CadServiceClient):
    """Compatibility wrapper for the bounded building proof export."""

    def probe(self) -> bool:
        try:
            return super().probe() and self.operation_ready("cad_building_export")
        except CadServiceError:
            return False

    def export(self, source: Mapping[str, Any], base: str | None = None) -> dict[str, Any]:
        if not self.probe():
            raise CadServiceError("cad_host_unprobed_or_unavailable")
        return self.export_building(source, base=base, required_files=REQUIRED_FILES)
