#!/usr/bin/env python3
"""AgentSam local CAD execution service.

A narrow localhost API for native CAD tools installed in the container.
The first production endpoint is OpenSCAD compilation. FreeCAD and Blender can
be baked into the image as optional capabilities without exposing arbitrary
script execution through this service.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlsplit

# One implementation of native host discovery: the SDK's agentsam_sdk.cad. The container
# context stages it next to this file; a source checkout resolves it from ../../python.
try:
    from agentsam_sdk.cad import (
        discover_freecad,
        discover_occt,
        freecad_adapter_path,
        probe_freecad,
        probe_occt,
    )
except ImportError:
    _checkout_python = Path(__file__).resolve().parents[2] / "python"
    if not (_checkout_python / "agentsam_sdk" / "cad").is_dir():
        raise
    sys.path.insert(0, str(_checkout_python))
    from agentsam_sdk.cad import (
        discover_freecad,
        discover_occt,
        freecad_adapter_path,
        probe_freecad,
        probe_occt,
    )

PORT = int(os.environ.get("PORT", "8793"))


def _service_path(setting: str, linux_container: str, local_name: str) -> Path:
    """Honor explicit paths, then existing Linux volume mounts, then user-local storage."""
    override = os.environ.get(setting)
    if override:
        return Path(override).expanduser()
    if sys.platform.startswith("linux") and Path(linux_container).exists():
        return Path(linux_container)
    return Path.home() / ".agentsam" / "cad" / local_name


TOKEN_FILE = _service_path("AGENTSAM_CAD_TOKEN_FILE", "/config/service.token", "service.token")
WORK_ROOT = _service_path("AGENTSAM_CAD_WORK_ROOT", "/work", "work")
MAX_BODY_BYTES = 1_500_000
MAX_SOURCE_CHARS = 500_000
MAX_ARTIFACT_BYTES = 25 * 1024 * 1024
MAX_TIMEOUT_SECONDS = 120

TOOL_COMMANDS = {
    "openscad": ["openscad", "--version"],
    "freecad": ["FreeCADCmd", "--version"],
    "blender": ["blender", "--version"],
    "ifc": ["python3", "--version"],
    "media": ["ffmpeg", "-version"],
    "occt": ["agentsam-occt", "--doctor"],
}

OPENSCAD_FORMATS = {"stl", "3mf", "dxf", "svg", "csg", "off", "amf"}
FREECAD_FORMATS = {"step", "stp", "iges", "brep", "stl"}
BLENDER_FORMATS = {"glb", "stl", "obj", "png"}
FORBIDDEN_OPENSCAD = [
    (re.compile(r"\binclude\s*<", re.IGNORECASE), "include directives are disabled"),
    (re.compile(r"\buse\s*<", re.IGNORECASE), "use directives are disabled"),
    (re.compile(r"\bimport\s*\(", re.IGNORECASE), "import() is disabled"),
    (re.compile(r"\bsurface\s*\(", re.IGNORECASE), "surface() file loading is disabled"),
    (re.compile(r"\.\.[/\\]"), "path traversal is disabled"),
    (re.compile(r"(?:^|[\s\"'])/(?:etc|proc|sys|dev|var|home|root|run|mnt)/", re.IGNORECASE), "absolute host-style paths are disabled"),
]


def _read_token() -> str:
    try:
        return TOKEN_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _probe(command: list[str], env: dict[str, str] | None = None, timeout: int = 20) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, capture_output=True, text=True, timeout=timeout, env=env, check=False)


def _extended_tool_version(name: str) -> dict[str, Any]:
    """Probe the production-pipeline tools by actually exercising them, not by checking a binary exists."""
    if name == "occt":
        receipt = probe_occt(discover_occt())
        return {
            "installed": bool(receipt.get("installed")),
            "ready": bool(receipt.get("ready")),
            "binary": receipt.get("binary"),
            "version": receipt.get("version"),
            "kernel": "OCCT",
            "capabilities": receipt.get("reported_capabilities", []),
            "verified_operations": receipt.get("verified_operations", []),
            "error": receipt.get("error"),
            "detail": receipt.get("detail"),
        }
    if name == "ifc":
        runtime = _ifc_runtime()
        modules = runtime["modules"]
        installed = modules["ifcopenshell"] is not None
        missing = [key for key, version in modules.items() if version is None]
        dxf = modules["ezdxf"] is not None
        pdf = modules["pymupdf"] is not None and modules["pillow"] is not None
        if not installed:
            return {"installed": False, "ready": False, "binary": runtime["python"], "version": None, "dxf": dxf, "pdf": pdf,
                    "modules": modules, "missing": missing, "searched": runtime["searched"],
                    "error": "no Python interpreter with ifcopenshell was found"}
        parts = [f"{key} {version}" for key, version in modules.items() if version is not None]
        # installed: IFC read/write works. ready: the whole production toolchain
        # (IFC + DXF + PDF) is present, which the building export additionally needs.
        return {"installed": True, "ready": not missing, "binary": runtime["python"], "source": runtime["source"],
                "version": "; ".join(parts), "dxf": dxf, "pdf": pdf, "modules": modules, "missing": missing}
    if name == "media":
        ffmpeg, gltf = shutil.which("ffmpeg"), shutil.which("gltf-transform")
        if not ffmpeg or not gltf:
            return {"installed": False, "binary": None, "version": None,
                    "missing": [n for n, b in (("ffmpeg", ffmpeg), ("gltf-transform", gltf)) if not b]}
        ff = _probe([ffmpeg, "-version"]).stdout.splitlines()[:1]
        gl = [line for line in _probe([gltf, "--version"]).stdout.splitlines() if line[:1].isdigit()][:1]
        if not gl:
            return {"installed": False, "binary": gltf, "version": None, "error": "gltf-transform did not report a version"}
        return {"installed": True, "binary": ffmpeg, "version": f"{ff[0][:40] if ff else 'ffmpeg'}; gltf-transform {gl[0]}"}
    binary = shutil.which("agentsam-occt")
    if not binary:
        return {"installed": False, "binary": None, "version": None}
    probe = _probe([binary, "--doctor"])
    for line in probe.stdout.splitlines():
        if line.startswith("AGENTSAM_RESULT="):
            result = json.loads(line.split("=", 1)[1])
            return {"installed": bool(result.get("ok")), "binary": binary, "version": result.get("version"),
                    "kernel": "OCCT", "capabilities": result.get("capabilities", [])}
    return {"installed": False, "binary": binary, "version": None, "error": "agentsam-occt --doctor gave no result"}


def _tool_version(name: str) -> dict[str, Any]:
    if name in ("ifc", "media", "occt"):
        return _extended_tool_version(name)
    if name == "freecad":
        receipt = probe_freecad(discover_freecad())
        return {
            "installed": bool(receipt.get("installed")),
            "ready": bool(receipt.get("ready")),
            "binary": receipt.get("binary"),
            "version": receipt.get("version"),
            "kernel": receipt.get("kernel"),
            "error": receipt.get("error"),
            "detail": receipt.get("detail"),
        }

    command = TOOL_COMMANDS[name]
    binary = shutil.which(command[0])

    if not binary:
        return {"installed": False, "binary": None, "version": None}

    try:
        probe = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        lines = (probe.stdout or probe.stderr or "").strip().splitlines()
        version = lines[0][:240] if lines else None
    except Exception as exc:
        version = f"version check failed: {exc}"

    return {"installed": True, "binary": binary, "version": version}


def _capabilities() -> dict[str, Any]:
    tools = {name: _tool_version(name) for name in TOOL_COMMANDS}
    return {
        "service": "agentsam-cad",
        "version": "1",
        "tools": tools,
        "endpoints": {
            "cad_building_export": {"operation":"cad.building.export", "scope":"single_rectangular_shell_with_north_south_openings",
                "handler_installed": (Path(__file__).resolve().parent/"proof"/"building_proof.py").is_file(),
                "requires": ["freecad","occt","ifc","blender","media"],
                "status": "requires-runtime-proof"},
            "openscad_compile": tools["openscad"]["installed"],
            "freecad_execute": tools["freecad"].get("ready", tools["freecad"]["installed"]),
            "blender_execute": tools["blender"]["installed"],
            "ifc_execute": tools["ifc"]["installed"],
        },
        "limits": {
            "max_source_chars": MAX_SOURCE_CHARS,
            "max_artifact_bytes": MAX_ARTIFACT_BYTES,
            "max_timeout_seconds": MAX_TIMEOUT_SECONDS,
        },
    }


def _openscad_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if not (float("-inf") < float(value) < float("inf")):
            raise ValueError("OpenSCAD parameters must be finite numbers")
        return str(value)
    if isinstance(value, str):
        if len(value) > 4096:
            raise ValueError("OpenSCAD string parameter is too long")
        return json.dumps(value)
    raise ValueError("OpenSCAD parameters may only be numbers, booleans, or strings")


def _validate_openscad_source(source: Any) -> str:
    if not isinstance(source, str) or not source.strip():
        raise ValueError("source must be a non-empty OpenSCAD string")
    if len(source) > MAX_SOURCE_CHARS:
        raise ValueError(f"source exceeds {MAX_SOURCE_CHARS} characters")
    if "\x00" in source:
        raise ValueError("source contains NUL bytes")
    for pattern, message in FORBIDDEN_OPENSCAD:
        if pattern.search(source):
            raise ValueError(message)
    return source


def _compile_openscad(payload: dict[str, Any]) -> dict[str, Any]:
    binary = shutil.which("openscad")
    if not binary:
        raise RuntimeError("OpenSCAD is not installed in this CAD service image")

    source = _validate_openscad_source(payload.get("source"))
    output_format = str(payload.get("format", "stl")).lower().lstrip(".")
    if output_format not in OPENSCAD_FORMATS:
        raise ValueError(f"unsupported OpenSCAD format: {output_format}")

    timeout = payload.get("timeout_seconds", 30)
    try:
        timeout = int(timeout)
    except (TypeError, ValueError):
        timeout = 30
    timeout = max(1, min(timeout, MAX_TIMEOUT_SECONDS))

    parameters = payload.get("parameters") or {}
    if not isinstance(parameters, dict) or len(parameters) > 128:
        raise ValueError("parameters must be an object with at most 128 entries")

    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="job-", dir=WORK_ROOT) as temp:
        temp_path = Path(temp)
        source_path = temp_path / "model.scad"
        output_path = temp_path / f"artifact.{output_format}"
        source_path.write_text(source, encoding="utf-8")

        args = [binary, "-o", str(output_path)]
        for key, value in parameters.items():
            if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
                raise ValueError(f"invalid OpenSCAD parameter name: {key!r}")
            args.extend(["-D", f"{key}={_openscad_value(value)}"])
        args.append(str(source_path))

        xvfb = shutil.which("xvfb-run")
        command = [xvfb, "-a", *args] if xvfb else args
        env = os.environ.copy()
        env.setdefault("QT_QPA_PLATFORM", "offscreen")
        try:
            proc = subprocess.run(
                command,
                cwd=temp,
                env=env,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"OpenSCAD compilation exceeded {timeout}s") from exc

        logs = ((proc.stdout or "") + (proc.stderr or "")).strip()
        if proc.returncode != 0 or not output_path.exists():
            raise RuntimeError(f"OpenSCAD failed with exit {proc.returncode}: {logs[-4000:]}")

        artifact = output_path.read_bytes()
        if len(artifact) > MAX_ARTIFACT_BYTES:
            raise RuntimeError(
                f"artifact is {len(artifact)} bytes; JSON API limit is {MAX_ARTIFACT_BYTES}. "
                "Use a smaller model or a future streaming artifact endpoint."
            )

        digest = hashlib.sha256(artifact).hexdigest()
        filename = str(payload.get("filename") or f"model.{output_format}")
        filename = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(filename).name)[:160] or f"model.{output_format}"
        if not filename.lower().endswith(f".{output_format}"):
            filename += f".{output_format}"

        return {
            "ok": True,
            "tool": "openscad",
            "format": output_format,
            "filename": filename,
            "size_bytes": len(artifact),
            "sha256": digest,
            "artifact_base64": base64.b64encode(artifact).decode("ascii"),
            "logs": logs[-8000:],
        }


def _find_freecad_adapter() -> Path:
    adapter = freecad_adapter_path()
    if not adapter.is_file():
        raise RuntimeError(f"FreeCAD adapter missing from the SDK package: {adapter}")
    return adapter


def _find_blender_adapter() -> Path:
    candidates = [
        Path("/srv/blender/adapter.py"),
        Path("/srv/services/cad/blender/adapter.py"),
        Path(__file__).parent / "blender" / "adapter.py",
        Path(__file__).parent / "blender_adapter.py",
    ]
    for c in candidates:
        if c.exists():
            return c
    raise RuntimeError("Blender adapter script not found in CAD service container")


def _freecad_command(adapter_path: Path, request_path: Path, operation: str = "build") -> list[str]:
    host = discover_freecad()
    if host is None:
        raise RuntimeError("FreeCAD native runtime not found; configure AGENTSAM_FREECAD_HOME or AGENTSAM_FREECAD_PYTHON")
    return host.adapter_command(adapter_path, request_path, operation=operation)


def _blender_command(adapter_path: Path, request_path: Path, operation: str = "build") -> list[str]:
    for cmd in ["blender", "/usr/bin/blender", "/usr/local/bin/blender"]:
        binary = shutil.which(cmd)
        if binary or Path(cmd).exists():
            return [binary or cmd, "-b", "--python", str(adapter_path), "--", "--operation", operation, "--request", str(request_path)]
    raise RuntimeError("Blender runtime binary not found in container")


IFC_OPERATIONS = ("inspect",)
IFC_DEFAULT_MAX_ELEMENTS = 50_000


def _find_ifc_adapter() -> Path:
    candidates = [
        Path("/srv/ifc/adapter.py"),
        Path("/srv/services/cad/ifc/adapter.py"),
        Path(__file__).parent / "ifc" / "adapter.py",
    ]
    for c in candidates:
        if c.exists():
            return c
    raise RuntimeError("IFC adapter script not found in CAD service container")


IFC_MODULE_KEYS = ("ifcopenshell", "ezdxf", "pymupdf", "pillow")
CONTAINER_VENV_PYTHON = "/opt/agentsam-venv/bin/python"
IFC_RUNTIME_TTL_SECONDS = 30
_IFC_PROBE_SCRIPT = (
    "import importlib, json\n"
    "out = {}\n"
    "for name in ('ifcopenshell', 'ezdxf', 'pymupdf', 'PIL'):\n"
    "    try:\n"
    "        mod = importlib.import_module(name)\n"
    "        out[name] = str(getattr(mod, '__version__', None) or getattr(mod, 'version', None) or 'unknown')\n"
    "    except Exception:\n"
    "        out[name] = None\n"
    "print(json.dumps(out))\n"
)
_IFC_RUNTIME: tuple[float, dict[str, Any]] | None = None


def _ifc_candidates() -> list[tuple[str, dict[str, str], str]]:
    """Every interpreter that might carry the IFC libraries, most deliberate first."""
    base = os.environ.copy()
    found: list[tuple[str, dict[str, str], str]] = []
    override = os.environ.get("AGENTSAM_CAD_PYTHON")
    if override and Path(override).is_file():
        found.append((override, base, "AGENTSAM_CAD_PYTHON"))
    if Path(CONTAINER_VENV_PYTHON).is_file():
        found.append((CONTAINER_VENV_PYTHON, base, "container venv"))
    found.append((sys.executable, base, "service interpreter"))
    host = discover_freecad()
    if host is not None and host.mode == "python":
        found.append((host.executable, host.environment(), "FreeCAD python"))
    return found


def _probe_ifc_modules(python: str, env: dict[str, str]) -> dict[str, str | None] | None:
    """Import each library independently in this interpreter; None if it cannot run at all."""
    try:
        proc = _probe([python, "-c", _IFC_PROBE_SCRIPT], env=env, timeout=30)
        raw = json.loads(proc.stdout.strip().splitlines()[-1])
    except (OSError, subprocess.TimeoutExpired, ValueError, IndexError):
        return None
    if proc.returncode != 0 or not isinstance(raw, dict):
        return None
    return {"ifcopenshell": raw.get("ifcopenshell"), "ezdxf": raw.get("ezdxf"),
            "pymupdf": raw.get("pymupdf"), "pillow": raw.get("PIL")}


def _ifc_runtime() -> dict[str, Any]:
    """The most capable interpreter for IFC work. The probe and the route share this answer,
    so what the service reports is what it runs. Cached briefly; a fresh install is picked up
    within IFC_RUNTIME_TTL_SECONDS without a restart."""
    global _IFC_RUNTIME
    now = time.monotonic()
    if _IFC_RUNTIME is not None and now - _IFC_RUNTIME[0] < IFC_RUNTIME_TTL_SECONDS:
        return _IFC_RUNTIME[1]
    searched: list[str] = []
    best: dict[str, Any] | None = None
    best_rank: tuple[int, int] = (-1, -1)
    seen: set[str] = set()
    for index, (python, env, source) in enumerate(_ifc_candidates()):
        if python in seen:
            continue
        seen.add(python)
        searched.append(source)
        modules = _probe_ifc_modules(python, env)
        if modules is None:
            continue
        # IFC support outranks everything; then the number of toolchain libraries; then order.
        rank = (int(modules["ifcopenshell"] is not None), sum(v is not None for v in modules.values()) * 10 - index)
        if rank > best_rank:
            best_rank, best = rank, {"python": python, "env": env, "source": source, "modules": modules}
    runtime = {**best, "searched": searched} if best else {
        "python": None, "env": None, "source": None, "modules": dict.fromkeys(IFC_MODULE_KEYS), "searched": searched}
    _IFC_RUNTIME = (now, runtime)
    return runtime


def _execute_ifc(payload: dict[str, Any]) -> dict[str, Any]:
    operation = str(payload.get("operation", "inspect"))
    if operation not in IFC_OPERATIONS:
        raise ValueError(f"unsupported IFC operation: {operation}")
    ref = payload.get("input")
    if not isinstance(ref, dict) or ref.get("kind") != "file" or set(ref) - {"kind", "mount", "path"}:
        raise ValueError("ifc_input_must_be_file_ref")
    mount, relative = str(ref.get("mount", "")), str(ref.get("path", ""))
    _, _, source_path = _file_target(f"/v1/files/{mount}/{quote(relative, safe='/')}")
    if not source_path.is_file():
        raise ValueError("ifc_input_not_found")

    try:
        timeout = int(payload.get("timeout_seconds", 60))
    except (TypeError, ValueError):
        timeout = 60
    timeout = max(1, min(timeout, MAX_TIMEOUT_SECONDS))
    try:
        max_elements = int(payload.get("max_elements", IFC_DEFAULT_MAX_ELEMENTS))
    except (TypeError, ValueError):
        max_elements = IFC_DEFAULT_MAX_ELEMENTS

    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="ifc-", dir=WORK_ROOT) as temp:
        temp_path = Path(temp)
        request_path, output_path = temp_path / "request.json", temp_path / "model.json"
        request_path.write_text(json.dumps({
            "schema_version": 1, "input": str(source_path), "output": str(output_path),
            "max_elements": max_elements,
        }), encoding="utf-8")
        runtime = _ifc_runtime()
        if runtime["modules"]["ifcopenshell"] is None:
            raise RuntimeError("ifcopenshell is not installed for the CAD service (looked in: "
                               + ", ".join(runtime["searched"]) + "). Install it with: pip install ifcopenshell")
        command = [runtime["python"], str(_find_ifc_adapter()), "--operation", operation, "--request", str(request_path)]
        try:
            proc = subprocess.run(command, cwd=temp, env=runtime["env"], capture_output=True,
                                  text=True, timeout=timeout, check=False)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"IFC {operation} exceeded {timeout}s") from exc

        envelope = None
        for line in reversed((proc.stdout or "").splitlines()):
            if line.startswith("AGENTSAM_RESULT="):
                try:
                    envelope = json.loads(line[len("AGENTSAM_RESULT="):])
                    break
                except json.JSONDecodeError:
                    pass
        if not envelope or not envelope.get("ok"):
            err_msg = envelope.get("error") if envelope else f"exit {proc.returncode}"
            raise RuntimeError(f"IFC {operation} failed ({err_msg}): {(proc.stderr or '')[-2000:]}")
        if not output_path.is_file():
            raise RuntimeError("IFC adapter reported success but wrote no model")
        raw = output_path.read_bytes()
        if len(raw) > MAX_ARTIFACT_BYTES:
            raise RuntimeError(f"model is {len(raw)} bytes; exceeds {MAX_ARTIFACT_BYTES} bytes")
        model = json.loads(raw)
        return {
            "ok": True, "tool": "ifc", "operation": operation, "schema": model.get("schema"),
            "source_sha256": model["source"]["sha256"], "model_sha256": hashlib.sha256(raw).hexdigest(),
            "metrics": envelope.get("metrics", {}), "ifcopenshell": envelope.get("ifcopenshell"),
            "model": model,
        }


def _execute_freecad(payload: dict[str, Any]) -> dict[str, Any]:
    adapter_path = _find_freecad_adapter()
    operations = payload.get("operations") or (payload.get("recipe", {}).get("operations") if isinstance(payload.get("recipe"), dict) else None)
    if not isinstance(operations, list) or len(operations) == 0:
        raise ValueError("operations must be a non-empty list of modeling operations")
    if len(operations) > 256:
        raise ValueError("operations list exceeds maximum limit of 256")

    output_format = str(payload.get("format", "step")).lower().lstrip(".")
    if output_format not in FREECAD_FORMATS:
        raise ValueError(f"unsupported FreeCAD format: {output_format}")

    timeout = payload.get("timeout_seconds", 30)
    try:
        timeout = int(timeout)
    except (TypeError, ValueError):
        timeout = 30
    timeout = max(1, min(timeout, MAX_TIMEOUT_SECONDS))

    filename = str(payload.get("filename") or f"model.{output_format}")
    filename = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(filename).name)[:160] or f"model.{output_format}"
    if not filename.lower().endswith(f".{output_format}"):
        filename += f".{output_format}"

    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="freecad-", dir=WORK_ROOT) as temp:
        temp_path = Path(temp)
        output_path = temp_path / filename
        request_path = temp_path / "request.json"

        request_data = {
            "schema_version": 1,
            "output": str(output_path),
            "format": output_format,
            "operations": operations,
        }
        request_path.write_text(json.dumps(request_data, indent=2), encoding="utf-8")

        command = _freecad_command(adapter_path, request_path, operation="build")
        host = discover_freecad()
        env = host.environment() if host is not None else os.environ.copy()
        env.setdefault("QT_QPA_PLATFORM", "offscreen")

        try:
            proc = subprocess.run(
                command,
                cwd=temp,
                env=env,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"FreeCAD execution exceeded {timeout}s") from exc

        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
        logs = (stdout + "\n" + stderr).strip()

        result_envelope = None
        for line in reversed(stdout.splitlines()):
            if line.startswith("AGENTSAM_RESULT="):
                try:
                    result_envelope = json.loads(line[len("AGENTSAM_RESULT="):])
                    break
                except json.JSONDecodeError:
                    pass

        if not result_envelope or not result_envelope.get("ok"):
            err_msg = result_envelope.get("error") if result_envelope else f"exit {proc.returncode}"
            raise RuntimeError(f"FreeCAD modeling failed ({err_msg}): {logs[-4000:]}")

        if not output_path.exists():
            raise RuntimeError(f"FreeCAD failed to produce output file {filename}")

        artifact = output_path.read_bytes()
        if len(artifact) > MAX_ARTIFACT_BYTES:
            raise RuntimeError(f"artifact is {len(artifact)} bytes; exceeds {MAX_ARTIFACT_BYTES} bytes")

        digest = hashlib.sha256(artifact).hexdigest()

        return {
            "ok": True,
            "tool": "freecad",
            "format": output_format,
            "filename": filename,
            "size_bytes": len(artifact),
            "sha256": digest,
            "artifact_base64": base64.b64encode(artifact).decode("ascii"),
            "metrics": result_envelope.get("metrics", {}),
            "logs": logs[-8000:],
        }


def _execute_blender(payload: dict[str, Any]) -> dict[str, Any]:
    adapter_path = _find_blender_adapter()
    operation = str(payload.get("operation") or "build").lower()
    if operation not in ("build", "inspect", "render_preview", "export"):
        raise ValueError(f"unsupported Blender operation: {operation}")

    recipe = payload.get("recipe")
    if recipe is None and "operations" in payload:
        recipe = {"schema_version": 1, "operations": payload["operations"]}
    if not isinstance(recipe, dict):
        raise ValueError("recipe must be an object")

    output_format = str(payload.get("format", "glb")).lower().lstrip(".")
    if output_format not in BLENDER_FORMATS:
        raise ValueError(f"unsupported Blender format: {output_format}")

    timeout = payload.get("timeout_seconds", 30)
    try:
        timeout = int(timeout)
    except (TypeError, ValueError):
        timeout = 30
    timeout = max(1, min(timeout, MAX_TIMEOUT_SECONDS))

    filename = str(payload.get("filename") or f"model.{output_format}")
    filename = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(filename).name)[:160] or f"model.{output_format}"
    if not filename.lower().endswith(f".{output_format}"):
        filename += f".{output_format}"

    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="blender-", dir=WORK_ROOT) as temp:
        temp_path = Path(temp)
        output_path = temp_path / filename
        request_path = temp_path / "request.json"

        request_data = {
            "schema_version": 1,
            "output": str(output_path),
            "format": output_format,
            **recipe,
        }
        request_path.write_text(json.dumps(request_data, indent=2), encoding="utf-8")

        command = _blender_command(adapter_path, request_path, operation=operation)
        env = os.environ.copy()
        env.setdefault("HOME", "/tmp/home")

        try:
            proc = subprocess.run(
                command,
                cwd=temp,
                env=env,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"Blender execution exceeded {timeout}s") from exc

        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
        logs = (stdout + "\n" + stderr).strip()

        result_envelope = None
        for line in reversed(stdout.splitlines()):
            if line.startswith("AGENTSAM_RESULT="):
                try:
                    result_envelope = json.loads(line[len("AGENTSAM_RESULT="):])
                    break
                except json.JSONDecodeError:
                    pass

        if not result_envelope or not result_envelope.get("ok"):
            err_msg = result_envelope.get("error") if result_envelope else f"exit {proc.returncode}"
            raise RuntimeError(f"Blender execution failed ({err_msg}): {logs[-4000:]}")

        artifact = b""
        if output_path.exists():
            artifact = output_path.read_bytes()
            if len(artifact) > MAX_ARTIFACT_BYTES:
                raise RuntimeError(f"artifact is {len(artifact)} bytes; exceeds {MAX_ARTIFACT_BYTES} bytes")

        digest = hashlib.sha256(artifact).hexdigest() if artifact else None

        return {
            "ok": True,
            "tool": "blender",
            "operation": operation,
            "format": output_format,
            "filename": filename if artifact else None,
            "size_bytes": len(artifact),
            "sha256": digest,
            "artifact_base64": base64.b64encode(artifact).decode("ascii") if artifact else None,
            "result": result_envelope,
            "logs": logs[-8000:],
        }


def _file_roots() -> dict[str, Path]:
    # Only mounts explicitly provided by the runtime host are addressable.
    raw = json.loads(os.environ.get("AGENTSAM_CAD_FILE_ROOTS", '{"work":"/work"}'))
    if not isinstance(raw, dict) or not raw:
        raise ValueError("cad_file_roots_invalid")
    roots = {}
    for alias, directory in raw.items():
        if not isinstance(alias, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,39}", alias):
            raise ValueError("cad_file_alias_invalid")
        root = Path(directory)
        if not root.is_absolute():
            raise ValueError("cad_file_root_not_absolute")
        roots[alias] = root.resolve()
    return roots


def _file_target(url_path: str) -> tuple[str, Path, Path]:
    parts = url_path.split("/")
    if parts[:3] != ["", "v1", "files"] or len(parts) < 4:
        raise ValueError("cad_file_route_invalid")
    alias = parts[3]
    roots = _file_roots()
    if alias not in roots:
        raise ValueError("cad_file_mount_not_authorized")
    root = roots[alias]
    relative = unquote("/".join(parts[4:]))
    if "\x00" in relative or "\\" in relative or relative.startswith("/"):
        raise ValueError("cad_file_path_invalid")
    target = (root / relative).resolve()
    if not target.is_relative_to(root):
        raise ValueError("cad_file_path_escape")
    return alias, root, target


def _cad_building_export(payload: dict[str, Any]) -> dict[str, Any]:
    """Export a bounded CAD v2 rectangular shell using the six verified engines.

    Source paths are *resource references* to pre-authorized runtime mounts,
    never arbitrary host paths. No project ID is required by this operation.
    Outputs are isolated runtime-derived artifacts, not edits to source files.
    """
    source = payload.get("source")
    if not isinstance(source,dict) or source.get("kind") != "file":
        raise ValueError("cad_building_file_ref_required")
    mount,relative = source.get("mount"),source.get("path")
    if not isinstance(mount,str) or not isinstance(relative,str) or not relative or relative.startswith("/") or "\\" in relative or "\x00" in relative or any(p in (".","..") for p in relative.split("/")):
        raise ValueError("cad_building_file_ref_invalid")
    roots = _file_roots()
    if mount not in roots or "work" not in roots or roots["work"] != WORK_ROOT.resolve():
        raise ValueError("cad_building_runtime_mount_unavailable")
    _,_,source_path = _file_target(f"/v1/files/{mount}/{quote(relative,safe='/')}")
    if not source_path.is_file():
        raise ValueError("cad_building_source_file_not_found")
    import importlib.util
    parser_path=Path(__file__).resolve().parent/"proof"/"building_source.py"
    if not parser_path.is_file():
        raise RuntimeError("cad_building_parser_unavailable")
    parser_spec=importlib.util.spec_from_file_location("agentsam_cad_building_source",parser_path)
    if parser_spec is None or parser_spec.loader is None:
        raise RuntimeError("cad_building_parser_unavailable")
    parser_module=importlib.util.module_from_spec(parser_spec)
    parser_spec.loader.exec_module(parser_module)
    base=payload.get("base")
    if base is not None and (not isinstance(base,str) or not re.fullmatch(r"[a-fA-F0-9]{64}",base)):
        raise ValueError("cad_building_base_must_be_sha256")
    params,evidence=parser_module.load_building_source(source_path,expected_hash=base)
    if len(params["openings"])>80:
        raise ValueError("cad_building_unsupported_geometry")
    proof_script=Path(__file__).resolve().parent/"proof"/"building_proof.py"
    if not proof_script.is_file():
        raise RuntimeError("cad_building_export_engine_unavailable")
    derived=WORK_ROOT/"derived"
    derived.mkdir(parents=True,exist_ok=True)
    folder=Path(tempfile.mkdtemp(prefix="building-",dir=derived))
    # The child verifies `base` again before touching an output, closing the
    # revision race between authorization, validation and execution.
    argv=[sys.executable,str(proof_script),"all","--source",str(source_path),
          "--base",evidence["source_sha256"],"--out",str(folder)]
    env={**os.environ,"QT_QPA_PLATFORM":"offscreen"}
    env.pop("AGENTSAM_CAD_BUILDING_SOURCE",None)
    try:
        result=subprocess.run(argv,capture_output=True,text=True,env=env,check=False,
                              timeout=MAX_TIMEOUT_SECONDS)
        if result.returncode != 0:
            raise RuntimeError("cad_building_export_failed: " + (result.stdout+result.stderr)[-1200:])
        receipt_file=folder/"receipt.json"
        if not receipt_file.is_file():
            raise RuntimeError("cad_building_receipt_missing")
        receipt=json.loads(receipt_file.read_text())
        if receipt.get("status")!="passed" or receipt.get("source",{}).get("source_sha256")!=evidence["source_sha256"]:
            raise RuntimeError("cad_building_receipt_unverified")
        files=[]
        for artifact in receipt["artifacts"]:
            filename=artifact["path"]
            if Path(filename).name != filename:
                raise RuntimeError("cad_building_artifact_path_invalid")
            item=folder/filename
            if not item.is_file() or item.stat().st_size>MAX_ARTIFACT_BYTES:
                raise RuntimeError("cad_building_artifact_missing_or_oversize")
            metadata=_file_metadata(item)
            if metadata["sha256"]!=artifact["sha256"] or metadata["bytes"]!=artifact["bytes"]:
                raise RuntimeError("cad_building_artifact_integrity_failed")
            files.append({**artifact,"uri":f"/v1/files/work/derived/{folder.name}/{filename}"})
        return {"ok":True,"schema":"agentsam.cad.building-export.v1",
                "source":{"kind":"file","mount":mount,"path":relative,**evidence},
                "output_scope":"runtime-derived","job_id":folder.name,
                "files":files,"receipt":receipt}
    except BaseException:
        shutil.rmtree(folder,ignore_errors=True)
        raise


def _file_metadata(target: Path) -> dict[str, Any]:
    raw = target.read_bytes()
    if len(raw) > MAX_ARTIFACT_BYTES:
        raise ValueError("cad_file_too_large")
    return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


class Handler(BaseHTTPRequestHandler):
    server_version = "AgentSamCAD/1"

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[cad] {self.address_string()} {format % args}", flush=True)

    def _json(self, status: int, body: Any) -> None:
        payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def _authorized(self) -> bool:
        token = _read_token()
        if not token:
            return False
        return self.headers.get("Authorization", "") == f"Bearer {token}"

    def _require_auth(self) -> bool:
        if self._authorized():
            return True
        self._json(HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "unauthorized"})
        return False

    def _read_json(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("invalid Content-Length") from exc
        if length < 1 or length > MAX_BODY_BYTES:
            raise ValueError(f"request body must be 1..{MAX_BODY_BYTES} bytes")
        raw = self.rfile.read(length)
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError("JSON request must be an object")
        return value

    def _send_file(self, status: int, data: bytes, mime: str, sha: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("ETag", '"' + sha + '"')
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _handle_file_get(self) -> None:
        alias, _root, target = _file_target(urlsplit(self.path).path)
        if target.is_dir():
            entries = sorted(target.iterdir(), key=lambda entry: entry.name)
            self._json(HTTPStatus.OK, {"ok": True, "mount": alias,
                "entries": [{"name": p.name, "type": "directory" if p.is_dir() else "file",
                             "bytes": p.stat().st_size if p.is_file() else None} for p in entries if not p.is_symlink()]})
            return
        if not target.is_file():
            self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "cad_file_not_found"})
            return
        data = target.read_bytes()
        if len(data) > MAX_ARTIFACT_BYTES:
            raise ValueError("cad_file_too_large")
        self._send_file(HTTPStatus.OK, data, "application/octet-stream", hashlib.sha256(data).hexdigest())

    def do_PUT(self) -> None:
        if not self._require_auth():
            return
        try:
            _, root, target = _file_target(urlsplit(self.path).path)
            if target == root or self.path.endswith("/") or target.is_dir():
                raise ValueError("cad_file_target_required")
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > MAX_ARTIFACT_BYTES:
                raise ValueError("cad_file_size_invalid")
            data = self.rfile.read(length)
            if len(data) != length:
                raise ValueError("cad_file_incomplete")
            sha = hashlib.sha256(data).hexdigest()
            expected = self.headers.get("X-Content-Sha256")
            if expected and expected.lower() != sha:
                raise ValueError("cad_file_hash_mismatch")
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".cad-write-", delete=False) as fp:
                temporary = Path(fp.name)
                try:
                    fp.write(data)
                except Exception:
                    temporary.unlink(missing_ok=True)
                    raise
            try:
                os.replace(temporary, target)
            finally:
                temporary.unlink(missing_ok=True)
            self._json(HTTPStatus.OK, {"ok": True, "sha256": sha, "bytes": length,
                                       "path": str(target.relative_to(root))})
        except (ValueError, OSError) as exc:
            self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})

    def do_DELETE(self) -> None:
        if not self._require_auth():
            return
        try:
            _, root, target = _file_target(urlsplit(self.path).path)
            if target == root:
                raise ValueError("cad_file_root_delete_forbidden")
            if target.is_dir():
                target.rmdir()  # non-empty directories cannot be recursively deleted
            else:
                target.unlink()
            self._json(HTTPStatus.OK, {"ok": True, "deleted": str(target.relative_to(root))})
        except FileNotFoundError:
            self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "cad_file_not_found"})
        except (ValueError, OSError) as exc:
            self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})

    def _handle_file_action(self, payload: dict[str, Any]) -> None:
        route = urlsplit(self.path).path
        _, root, _ = _file_target(route.rsplit("/", 1)[0])
        kind = route.rsplit("/", 1)[1]
        if kind == "mkdir":
            relative = str(payload.get("path") or "")
            target = (root / relative).resolve()
            if not relative or not target.is_relative_to(root):
                raise ValueError("cad_file_path_escape")
            target.mkdir(parents=True, exist_ok=True)
            self._json(HTTPStatus.OK, {"ok": True, "directory": str(target.relative_to(root))})
        elif kind == "move":
            source = (root / str(payload.get("source") or "")).resolve()
            target = (root / str(payload.get("target") or "")).resolve()
            if source == root or target == root or not source.is_relative_to(root) or not target.is_relative_to(root):
                raise ValueError("cad_file_path_escape")
            if not source.is_file():
                raise ValueError("cad_file_source_not_found")
            if target.exists():
                raise ValueError("cad_file_destination_exists")
            target.parent.mkdir(parents=True, exist_ok=True)
            source.rename(target)
            self._json(HTTPStatus.OK, {"ok": True, "path": str(target.relative_to(root))})
        else:
            self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "not_found"})

    def do_GET(self) -> None:
        if urlsplit(self.path).path.startswith("/v1/files/"):
            if not self._require_auth():
                return
            try:
                self._handle_file_get()
            except ValueError as exc:
                self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
            return
        if self.path == "/healthz":
            caps = _capabilities()
            self._json(HTTPStatus.OK, {"ok": True, **caps})
            return
        if self.path == "/v1/capabilities":
            if not self._require_auth():
                return
            self._json(HTTPStatus.OK, {"ok": True, **_capabilities()})
            return
        self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:
        if not self._require_auth():
            return
        try:
            payload = self._read_json()
            if urlsplit(self.path).path.startswith("/v1/files/"):
                self._handle_file_action(payload)
                return
            if self.path == "/v1/cad/building/export":
                self._json(HTTPStatus.OK,_cad_building_export(payload))
                return
            if self.path == "/v1/openscad/compile":
                self._json(HTTPStatus.OK, _compile_openscad(payload))
                return
            if self.path == "/v1/freecad/execute":
                self._json(HTTPStatus.OK, _execute_freecad(payload))
                return
            if self.path == "/v1/blender/execute":
                self._json(HTTPStatus.OK, _execute_blender(payload))
                return
            if self.path == "/v1/ifc/execute":
                self._json(HTTPStatus.OK, _execute_ifc(payload))
                return
            self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "not_found"})
        except ValueError as exc:
            status=HTTPStatus.CONFLICT if str(exc)=="cad_building_source_revision_conflict" else HTTPStatus.BAD_REQUEST
            self._json(status, {"ok": False, "error": str(exc)})
        except RuntimeError as exc:
            self._json(HTTPStatus.UNPROCESSABLE_ENTITY, {"ok": False, "error": str(exc)})
        except Exception as exc:
            self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": f"internal_error: {exc}"})


def main() -> None:
    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    Path(os.environ.get("HOME", "/tmp/home")).mkdir(parents=True, exist_ok=True)
    Path(os.environ.get("XDG_CACHE_HOME", "/tmp/cache")).mkdir(parents=True, exist_ok=True)
    Path(os.environ.get("XDG_CONFIG_HOME", "/tmp/config")).mkdir(parents=True, exist_ok=True)
    print(json.dumps({"service": "agentsam-cad", "port": PORT, "capabilities": _capabilities()}), flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
