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
}

OPENSCAD_FORMATS = {"stl", "3mf", "dxf", "svg", "csg", "off", "amf"}
FORBIDDEN_OPENSCAD = [
    (re.compile(r"\binclude\s*<", re.I), "include directives are disabled"),
    (re.compile(r"\buse\s*<", re.I), "use directives are disabled"),
    (re.compile(r"\bimport\s*\(", re.I), "import() is disabled"),
    (re.compile(r"\bsurface\s*\(", re.I), "surface() file loading is disabled"),
    (re.compile(r"\.\.[/\\]"), "path traversal is disabled"),
    (re.compile(r"(?:^|[\s\"'])/(?:etc|proc|sys|dev|var|home|root|run|mnt)/", re.I), "absolute host-style paths are disabled"),
]


def _read_token() -> str:
    try:
        return TOKEN_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _tool_version(name: str) -> dict[str, Any]:
    command = TOOL_COMMANDS[name]
    binary = shutil.which(command[0])
    if not binary:
        # Debian sometimes exposes FreeCADCmd in /usr/lib/freecad/bin only.
        if name == "freecad":
            candidate = Path("/usr/lib/freecad/bin/FreeCADCmd")
            if candidate.exists():
                binary = str(candidate)
                command = [binary, "--version"]
        if not binary:
            return {"installed": False, "binary": None, "version": None}
    try:
        proc = subprocess.run(command, capture_output=True, text=True, timeout=5, check=False)
        text = (proc.stdout or proc.stderr or "").strip().splitlines()
        version = text[0][:240] if text else None
    except Exception as exc:  # health must never crash the service
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
            "freecad_execute": False,
            "blender_execute": False,
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


class Handler(BaseHTTPRequestHandler):
    server_version = "AgentSamCAD/1"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[cad] {self.address_string()} {fmt % args}", flush=True)

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

    def do_GET(self) -> None:  # noqa: N802
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

    def do_POST(self) -> None:  # noqa: N802
        if not self._require_auth():
            return
        try:
            payload = self._read_json()
            if self.path == "/v1/openscad/compile":
                self._json(HTTPStatus.OK, _compile_openscad(payload))
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
