"""Cross-platform CAD host adapters and portable service clients.

Geometry remains authoritative in the native engines; this package provides
portable discovery, transport and host-owned job facades.
"""
from .native import FreeCADHost, discover_freecad, freecad_adapter_path, probe_freecad
from .occt import discover_occt, probe_occt
from .service import CadServiceClient, CadServiceError, validate_artifact_uri, validate_file_resource_ref
from .jobs import CadJobClient, AsyncCadJobClient, CadJobHandle, CadJobError
from .building import CadBuildingClient

__all__ = [
    "FreeCADHost",
    "discover_freecad",
    "freecad_adapter_path",
    "probe_freecad",
    "discover_occt",
    "probe_occt",
    "CadServiceClient",
    "CadServiceError",
    "CadJobClient",
    "AsyncCadJobClient",
    "CadJobHandle",
    "CadJobError",
    "CadBuildingClient",
    "validate_artifact_uri",
    "validate_file_resource_ref",
]
