"""Python-only CAD building service transport, with no Node or CAD package import.

A host supplies an authorized service endpoint and bearer token. The service
resolves file references against its own scoped mounts. This client verifies
source-linked receipts and output artifacts; it never executes local commands.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

MIME = "application/json"
SCENE_FORMAT = "agentsam.cad.building-export.v1"
REQUIRED_FILES = frozenset(("shell.step", "shell.ifc", "plan.dxf", "plan.svg", "preview.png", "sheet-A101-proof.pdf", "model.glb", "model.opt.glb", "turntable.mp4"))
REF_PATTERN = re.compile(r"^/v1/files/work/derived/building-[a-zA-Z0-9_-]+/[^/?]+$")
HEX = re.compile(r"^[a-f0-9]{64}$")


class CadBuildingClient:
    def __init__(self, endpoint: str, token: str, transport: Callable[..., Any] = urlopen):
        uri = urlparse(endpoint)
        if uri.scheme not in ("https", "http") or uri.username or uri.password or uri.query or uri.fragment or not uri.netloc or (uri.scheme == "http" and uri.hostname not in ("127.0.0.1", "localhost", "::1")):
            raise ValueError("cad_host_endpoint_invalid")
        if not isinstance(token, str) or len(token) < 16:
            raise ValueError("cad_host_token_required")
        self.endpoint = endpoint.rstrip("/")
        self._token = token
        self._transport = transport
        self._ready = False

    def _read(self, path: str, payload: dict[str, Any] | None = None, timeout: int = 20) -> bytes:
        request = Request(self.endpoint + path,
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={"Authorization": "Bearer " + self._token,
                     **({"Content-Type": MIME} if payload is not None else {})},
            method="POST" if payload is not None else "GET")
        try:
            with self._transport(request, timeout=timeout) as response:
                return response.read()
        except HTTPError as exc:
            try:
                detail = json.loads(exc.read())
            except (ValueError, UnicodeDecodeError):
                detail = {"error": "cad_host_http_error"}
            raise RuntimeError(detail.get("error", "cad_host_http_error")) from exc
        except URLError as exc:
            raise RuntimeError("cad_host_transport_unavailable") from exc

    def probe(self) -> bool:
        self._ready = False
        data = json.loads(self._read("/v1/capabilities"))
        endpoint = data.get("endpoints", {}).get("cad_building_export", {})
        tools = data.get("tools", {})
        self._ready = (endpoint.get("operation") == "cad.building.export" and
            endpoint.get("handler_installed") is True and
            endpoint.get("scope") == "single_rectangular_shell_with_north_south_openings" and
            all(tools.get(name, {}).get("installed") is True and tools[name].get("ready") is not False
                for name in ("freecad", "occt", "ifc", "blender", "media")))
        return self._ready

    def export(self, source: dict[str, str], base: str | None = None) -> dict[str, Any]:
        if not self._ready:
            raise RuntimeError("cad_host_unprobed_or_unavailable")
        if not isinstance(source, dict) or set(source) != {"kind", "mount", "path"} or source["kind"] != "file" or not re.fullmatch(r"[a-z][a-z0-9_-]{0,39}",source["mount"]) or not isinstance(source["path"],str) or not source["path"] or source["path"].startswith("/") or "\\" in source["path"] or any(part in ("", ".", "..") for part in source["path"].split("/")):
            raise ValueError("cad_building_resource_ref_invalid")
        if base is not None and (not isinstance(base,str) or not HEX.fullmatch(base.lower())):
            raise ValueError("cad_building_base_invalid")
        data = json.loads(self._read("/v1/cad/building/export",{"source": source, **({"base":base} if base else {})},timeout=135))
        receipt=data.get("receipt",{})
        files=data.get("files",[])
        if (data.get("ok") is not True or data.get("schema") != SCENE_FORMAT or
            data.get("output_scope") != "runtime-derived" or
            data.get("source",{}).get("scope") != "single_rectangular_shell_with_north_south_openings" or
            not HEX.fullmatch(data.get("source",{}).get("source_sha256","")) or
            (base and data["source"]["source_sha256"] != base.lower()) or
            receipt.get("status") != "passed" or len(receipt.get("checks",[])) < 16 or
            any(check.get("passed") is not True for check in receipt["checks"]) or
            not REQUIRED_FILES.issubset({f.get("path") for f in files}) or
            any(not REF_PATTERN.fullmatch(f.get("uri","")) or not HEX.fullmatch(f.get("sha256","")) or not (0 < f.get("bytes",0) <= 25*1024*1024) for f in files)):
            raise RuntimeError("cad_building_receipt_invalid")
        return data

    def download(self, artifact: dict[str, Any]) -> bytes:
        if not self._ready or not isinstance(artifact,dict) or not REF_PATTERN.fullmatch(artifact.get("uri","")):
            raise RuntimeError("cad_building_artifact_reference_invalid")
        raw = self._read(artifact["uri"])
        if len(raw) != artifact.get("bytes") or hashlib.sha256(raw).hexdigest() != artifact.get("sha256"):
            raise RuntimeError("cad_building_artifact_integrity_invalid")
        return raw
