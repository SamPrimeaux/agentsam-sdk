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
import tempfile
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

PORT = int(os.environ.get("PORT", "8793"))
TOKEN_FILE = Path(os.environ.get("AGENTSAM_CAD_TOKEN_FILE", "/config/service.token"))
WORK_ROOT = Path(os.environ.get("AGENTSAM_CAD_WORK_ROOT", "/work"))
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
    if name == "ifc":
        python = os.environ.get("AGENTSAM_CAD_PYTHON", "/opt/agentsam-venv/bin/python")
        if not Path(python).is_file():
            return {"installed": False, "binary": None, "version": None}
        probe = _probe([python, "-c", "import ifcopenshell, ezdxf\ntry:\n import pymupdf; p = pymupdf.__version__\nexcept Exception:\n p = '-'\ntry:\n import PIL; q = PIL.__version__\nexcept Exception:\n q = '-'\nprint(ifcopenshell.version, ezdxf.__version__, p, q)"])
        if probe.returncode != 0:
            return {"installed": False, "binary": python, "version": None, "error": (probe.stderr or "import failed")[-300:]}
        ifc_version, dxf_version, pdf_version, pil_version = probe.stdout.split()
        pdf_ready = pdf_version != "-" and pil_version != "-"
        return {"installed": True, "binary": python, "version": f"ifcopenshell {ifc_version}; ezdxf {dxf_version}" + (f"; pymupdf {pdf_version}" if pdf_ready else ""),
                "pdf": pdf_ready,
                "modules": {"ifcopenshell": ifc_version, "ezdxf": dxf_version, "pymupdf": pdf_version, "pillow": pil_version}}
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
        binary = shutil.which("python3")
        module = Path("/usr/lib/freecad/lib/FreeCAD.so")

        if not binary or not module.is_file():
            return {"installed": False, "binary": None, "version": None}

        env = os.environ.copy()
        env["PYTHONPATH"] = "/usr/lib/freecad/lib"

        probe = subprocess.run(
            [binary, "-c",
             ("import FreeCAD, Part; "
              "assert Part.makeBox(1,2,3).isValid(); "
              "print('.'.join(FreeCAD.Version()[:3]))")],
            capture_output=True,
            text=True,
            timeout=10,
            env=env,
            check=False,
        )

        if probe.returncode != 0:
            return {
                "installed": False,
                "binary": binary,
                "version": None,
                "error": (probe.stderr or "FreeCAD kernel probe failed")[-500:],
            }

        return {
            "installed": True,
            "binary": binary,
            "version": probe.stdout.strip(),
            "kernel": "OCCT",
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
            "openscad_compile": tools["openscad"]["installed"],
            "freecad_execute": tools["freecad"]["installed"],
            "blender_execute": tools["blender"]["installed"],
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
    candidates = [
        Path("/srv/freecad/adapter.py"),
        Path("/srv/services/cad/freecad/adapter.py"),
        Path(__file__).parent / "freecad" / "adapter.py",
        Path(__file__).parent / "freecad_adapter.py",
    ]
    for c in candidates:
        if c.exists():
            return c
    raise RuntimeError("FreeCAD adapter script not found in CAD service container")


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
    for cmd in ["FreeCADCmd", "freecadcmd", "/usr/lib/freecad/bin/FreeCADCmd"]:
        binary = shutil.which(cmd)
        if binary or Path(cmd).exists():
            return [binary or cmd, str(adapter_path), "--operation", operation, "--request", str(request_path)]
    for py in ["/usr/lib/freecad/bin/python", "python3"]:
        binary = shutil.which(py)
        if binary or Path(py).exists():
            return [binary or py, str(adapter_path), "--operation", operation, "--request", str(request_path)]
    raise RuntimeError("FreeCAD runtime binary not found in container")


def _blender_command(adapter_path: Path, request_path: Path, operation: str = "build") -> list[str]:
    for cmd in ["blender", "/usr/bin/blender", "/usr/local/bin/blender"]:
        binary = shutil.which(cmd)
        if binary or Path(cmd).exists():
            return [binary or cmd, "-b", "--python", str(adapter_path), "--", "--operation", operation, "--request", str(request_path)]
    raise RuntimeError("Blender runtime binary not found in container")


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
        env = os.environ.copy()
        env.setdefault("QT_QPA_PLATFORM", "offscreen")
        env.setdefault("PYTHONPATH", "/usr/lib/freecad/lib")

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
            if self.path == "/v1/openscad/compile":
                self._json(HTTPStatus.OK, _compile_openscad(payload))
                return
            if self.path == "/v1/freecad/execute":
                self._json(HTTPStatus.OK, _execute_freecad(payload))
                return
            if self.path == "/v1/blender/execute":
                self._json(HTTPStatus.OK, _execute_blender(payload))
                return
            self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "not_found"})
        except ValueError as exc:
            self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
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
