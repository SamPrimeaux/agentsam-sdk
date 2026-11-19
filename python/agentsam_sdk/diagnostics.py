"""Read-only Python installation diagnostics; no false native-engine readiness claims."""
from __future__ import annotations

import importlib.util
import platform
import sys
from pathlib import Path

from .terminal_art import version_string


def inspect_installation(*, verify_cad: bool = False) -> dict:
    """Report core readiness separately from optional host integrations."""
    from .cad.occt import discover_occt, probe_occt
    occt = discover_occt()
    checks = [
        {"name": "Python SDK", "state": "ready", "detail": f"{version_string()} · Python {sys.version_info.major}.{sys.version_info.minor}"},
        {"name": "Default terminal UI", "state": "ready" if importlib.util.find_spec("rich") else "missing",
         "detail": "Rich included in the base pip package"},
        {"name": "Local Python operations", "state": "ready", "detail": "Workspace, repository and asset inventory"},
        {"name": "Node bridge", "state": "optional", "detail": "Only needed for bridge-only operations"},
    ]
    if verify_cad:
        evidence = probe_occt(occt)
        checks.append({
            "name": "Native OCCT", "state": "verified" if evidence.get("ready") else "unavailable",
            "detail": evidence.get("binary") or evidence.get("detail") or evidence.get("error") or "No verified native engine",
            "evidence": evidence,
        })
    else:
        checks.append({
            "name": "Native OCCT", "state": "discovered" if occt else "optional",
            "detail": occt or "Not installed; run 'agentsam doctor --verify-cad' for an actual kernel proof",
        })
    ready = all(row["state"] == "ready" for row in checks[:3])
    if verify_cad:
        ready = ready and bool(checks[-1].get("evidence", {}).get("ready"))
    return {
        "schema": "agentsam.installation.diagnostic.v1", "ok": ready,
        "platform": platform.platform(), "executable": sys.executable,
        "cwd": str(Path.cwd()), "checks": checks,
        "note": "Discovered is not verified. Native CAD readiness requires a real geometry operation.",
    }
