"""Portable orchestration for the native agentsam-occt C++ binary.

No Python geometry implementations. A real STEP solid is exported and
re-imported through the native OpenCascade kernel before marking ready.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Mapping

_PREFIX = "AGENTSAM_RESULT="


def discover_occt(*, environment: Mapping[str, str] | None = None) -> str | None:
    env = dict(os.environ if environment is None else environment)
    binary_name = "agentsam-occt.exe" if sys.platform.startswith("win") else "agentsam-occt"
    configured = env.get("AGENTSAM_OCCT_BIN")
    if configured:
        resolved = shutil.which(configured) or configured
        return str(resolved) if Path(resolved).is_file() else None
    found = shutil.which(binary_name)
    if found:
        return found
    home = env.get("USERPROFILE") if sys.platform.startswith("win") else env.get("HOME")
    candidate = Path(home or str(Path.home())) / ".agentsam" / "bin" / binary_name
    return str(candidate) if candidate.is_file() else None


def _receipt(stdout: str) -> dict[str, object] | None:
    for line in reversed(stdout.splitlines()):
        if line.startswith(_PREFIX):
            try:
                result = json.loads(line[len(_PREFIX):])
                if isinstance(result, dict):
                    return result
            except json.JSONDecodeError:
                return None
    return None


def probe_occt(binary: str | None = None, *, timeout: int = 15) -> dict[str, object]:
    resolved = binary or discover_occt()
    if not resolved:
        return {"installed": False, "ready": False, "error": "occt_host_not_found"}
    timeout = max(1, min(timeout, 60))
    try:
        with tempfile.TemporaryDirectory(prefix="agentsam-occt-proof-") as tmp:
            step = Path(tmp) / "solid.step"
            commands = [
                [resolved, "--doctor"],
                [resolved, "--box", "20", "30", "10", str(step)],
                [resolved, "--inspect", str(step)],
            ]
            receipts = []
            for command in commands:
                proc = subprocess.run(
                    command, capture_output=True, text=True,
                    timeout=timeout, check=False,
                )
                result = _receipt(proc.stdout)
                if proc.returncode != 0 or not result or not result.get("ok"):
                    return {
                        "installed": True, "ready": False, "binary": resolved,
                        "error": "occt_native_operation_failed",
                        "operation": command[1],
                        "detail": (proc.stderr or proc.stdout or "no native receipt")[-600:],
                        "exit_code": proc.returncode,
                    }
                receipts.append(result)
            _, export, inspect = receipts
            if not step.is_file() or step.stat().st_size == 0:
                raise ValueError("OCCT did not write a STEP solid")
            export_volume = float(export.get("volume_mm3", -1))
            inspected_volume = float(inspect.get("volume_mm3", -1))
            if abs(export_volume - 6000) > 1e-5 or abs(inspected_volume - export_volume) > 1e-5:
                raise ValueError("OCCT STEP export/reopen volume mismatch")
            return {
                "installed": True, "ready": True, "binary": resolved,
                "kernel": "OCCT", "version": receipts[0].get("version"),
                "reported_capabilities": receipts[0].get("capabilities", []),
                "verified_operations": ["solid.box.create", "solid.export.step", "solid.inspect.step"],
                "volume_mm3": inspected_volume, "step_size_bytes": step.stat().st_size,
                "step_sha256": hashlib.sha256(step.read_bytes()).hexdigest(),
            }
    except (OSError, subprocess.TimeoutExpired, ValueError) as exc:
        return {
            "installed": True, "ready": False, "binary": resolved,
            "error": "occt_native_operation_failed", "detail": str(exc)[:600],
        }
