"""Portable HTTP transport for an AgentSam CAD provider.

This module is deliberately Python-standard-library only. It does not import
Node, FreeCAD, Blender, OCCT, or any geometry implementation.

Short provider operations use the CAD service HTTP API. Long-running project
work belongs to the host-owned CAD job operations (see cad.jobs), not a second
service-local queue or client-created job database.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
import threading
import time
import uuid
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlsplit
from urllib.request import Request, urlopen

JSON_MIME = "application/json"
HEX = re.compile(r"^[a-f0-9]{64}$")
MOUNT = re.compile(r"^[a-z][a-z0-9_-]{0,39}$")
MAX_INLINE_ARTIFACT_BYTES = 25 * 1024 * 1024
DEFAULT_MAX_ARTIFACT_BYTES = 2 * 1024 * 1024 * 1024
CHUNK_BYTES = 1024 * 1024

_ENGINE_ROUTES = {
    "openscad": ("/v1/openscad/compile", "openscad_compile"),
    "freecad": ("/v1/freecad/execute", "freecad_execute"),
    "blender": ("/v1/blender/execute", "blender_execute"),
    "ifc": ("/v1/ifc/execute", "ifc_execute"),
}


class CadServiceError(RuntimeError):
    """Stable machine-readable failure from the CAD service transport."""

    def __init__(
        self,
        code: str,
        message: str | None = None,
        *,
        status: int | None = None,
        details: Mapping[str, Any] | None = None,
        retryable: bool | None = None,
        request_id: str | None = None,
    ):
        self.code = str(code or "cad_service_failed")
        self.status = status
        self.details = dict(details or {})
        self.retryable = (
            status in (408, 425, 429, 500, 502, 503, 504)
            if retryable is None else bool(retryable)
        )
        self.request_id = request_id
        super().__init__(message or self.code)


def validate_file_resource_ref(source: Any) -> dict[str, str]:
    """Validate a mount-relative file ref; the service still resolves its mount."""
    if not isinstance(source, dict) or set(source) != {"kind", "mount", "path"}:
        raise ValueError("cad_resource_ref_invalid")
    mount, relative = source.get("mount"), source.get("path")
    if source.get("kind") != "file" or not isinstance(mount, str) or not MOUNT.fullmatch(mount):
        raise ValueError("cad_resource_ref_invalid")
    if (not isinstance(relative, str) or not relative or len(relative) > 1024
            or relative.startswith("/") or "\\" in relative or "\x00" in relative):
        raise ValueError("cad_resource_ref_invalid")
    parts = relative.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise ValueError("cad_resource_ref_invalid")
    return {"kind": "file", "mount": mount, "path": relative}


def validate_artifact_uri(uri: Any) -> str:
    """Accept only same-service, mount-scoped file URIs; never arbitrary URLs."""
    if not isinstance(uri, str) or not uri or len(uri) > 4096:
        raise ValueError("cad_artifact_reference_invalid")
    parsed = urlsplit(uri)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or not parsed.path.startswith("/v1/files/"):
        raise ValueError("cad_artifact_reference_invalid")
    decoded = unquote(parsed.path)
    parts = decoded.split("/")
    if (len(parts) < 5 or parts[:3] != ["", "v1", "files"]
            or not MOUNT.fullmatch(parts[3]) or any(p in ("", ".", "..") for p in parts[4:])
            or "\\" in decoded or "\x00" in decoded):
        raise ValueError("cad_artifact_reference_invalid")
    return parsed.path


def _artifact_metadata(artifact: Any, *, max_bytes: int) -> tuple[str, int, str]:
    if not isinstance(artifact, Mapping):
        raise ValueError("cad_artifact_metadata_invalid")
    uri = validate_artifact_uri(artifact.get("uri"))
    digest = artifact.get("sha256")
    size = artifact.get("bytes")
    if not isinstance(digest, str) or not HEX.fullmatch(digest.lower()):
        raise ValueError("cad_artifact_metadata_invalid")
    if isinstance(size, bool) or not isinstance(size, int) or not (0 < size <= max_bytes):
        raise ValueError("cad_artifact_size_invalid")
    return uri, size, digest.lower()


def _safe_relative_output_path(value: Any) -> str:
    if not isinstance(value, str) or not value or len(value) > 512 or value.startswith("/") or "\\" in value or "\x00" in value:
        raise ValueError("cad_artifact_path_invalid")
    if any(part in ("", ".", "..") for part in value.split("/")):
        raise ValueError("cad_artifact_path_invalid")
    return value


class CadServiceClient:
    """Python-only transport to the authenticated local/remote CAD provider.

    The client owns transport, capability inspection and artifact integrity.
    The provider owns file mounts and native engines. This client never accepts
    arbitrary host paths as execution inputs and never launches local commands.
    """

    def __init__(
        self,
        endpoint: str,
        token: str,
        transport: Callable[..., Any] = urlopen,
        *,
        timeout: float = 20.0,
        allow_insecure_http: bool = False,
        max_inline_artifact_bytes: int = MAX_INLINE_ARTIFACT_BYTES,
        max_artifact_bytes: int = DEFAULT_MAX_ARTIFACT_BYTES,
        max_json_bytes: int = 16 * 1024 * 1024,
        capabilities_ttl: float = 15.0,
    ):
        if not isinstance(endpoint, str) or not endpoint.strip():
            raise ValueError("cad_host_endpoint_invalid")
        address = urlsplit(endpoint.strip())
        try:
            port = address.port
        except ValueError as exc:
            raise ValueError("cad_host_endpoint_invalid") from exc
        base_path = unquote(address.path)
        if (address.scheme not in ("https", "http") or not address.hostname
                or address.username or address.password or address.query or address.fragment
                or (port is not None and not 1 <= port <= 65535)
                or "\\" in base_path or "\x00" in base_path
                or any(part in (".", "..") for part in base_path.split("/"))
                or "//" in base_path):
            raise ValueError("cad_host_endpoint_invalid")
        local_hosts = {"localhost", "127.0.0.1", "::1"}
        if (address.scheme == "http" and not allow_insecure_http
                and address.hostname.lower() not in local_hosts):
            raise ValueError("cad_host_endpoint_https_required")
        if (not isinstance(token, str) or len(token.strip()) < 16
                or "\r" in token or "\n" in token):
            raise ValueError("cad_host_token_required")
        if not callable(transport):
            raise ValueError("cad_host_transport_invalid")
        if not (0 < float(timeout) <= 3600):
            raise ValueError("cad_host_timeout_invalid")
        for value, code in (
            (max_inline_artifact_bytes, "cad_inline_limit_invalid"),
            (max_artifact_bytes, "cad_artifact_limit_invalid"),
            (max_json_bytes, "cad_json_limit_invalid"),
        ):
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                raise ValueError(code)
        if max_inline_artifact_bytes > max_artifact_bytes:
            raise ValueError("cad_inline_limit_exceeds_artifact_limit")
        if capabilities_ttl < 0:
            raise ValueError("cad_capabilities_ttl_invalid")

        self.endpoint = endpoint.strip().rstrip("/")
        self._token = token.strip()
        self._transport = transport
        self.timeout = float(timeout)
        self.max_inline_artifact_bytes = max_inline_artifact_bytes
        self.max_artifact_bytes = max_artifact_bytes
        self.max_json_bytes = max_json_bytes
        self.capabilities_ttl = float(capabilities_ttl)
        self._capabilities: dict[str, Any] | None = None
        self._capabilities_at = 0.0
        self._capabilities_lock = threading.RLock()

    def _url(self, path: str) -> str:
        if not isinstance(path, str) or not path.startswith("/") or path.startswith("//"):
            raise ValueError("cad_service_path_invalid")
        parsed = urlsplit(path)
        decoded = unquote(parsed.path)
        if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or any(
            part == ".." for part in decoded.split("/")
        ) or "\x00" in decoded or "\\" in decoded:
            raise ValueError("cad_service_path_invalid")
        return self.endpoint + path

    @staticmethod
    def _status(response: Any) -> int:
        value = getattr(response, "status", None)
        if value is None:
            getter = getattr(response, "getcode", None)
            value = getter() if callable(getter) else 200
        return int(value)

    @staticmethod
    def _headers(response: Any) -> Any:
        return getattr(response, "headers", {}) or {}

    @staticmethod
    def _decode_error(raw: bytes, status: int, request_id: str | None = None) -> CadServiceError:
        try:
            value = json.loads(raw.decode("utf-8")) if raw else {}
        except (ValueError, UnicodeDecodeError):
            value = {}
        if not isinstance(value, dict):
            value = {}
        nested = value.get("error")
        if isinstance(nested, dict):
            code = nested.get("code") or "cad_host_http_error"
            message = nested.get("message") or code
            details = nested.get("details") if isinstance(nested.get("details"), dict) else {}
        else:
            code = nested or value.get("code") or "cad_host_http_error"
            message = value.get("message") or code
            details = value.get("details") if isinstance(value.get("details"), dict) else {}
        return CadServiceError(
            str(code), str(message), status=status, details=details,
            request_id=request_id,
        )

    def _open(self, request: Request, timeout: float | None = None) -> Any:
        try:
            response = self._transport(request, timeout=self.timeout if timeout is None else timeout)
            final_url = getattr(response, "geturl", lambda: request.full_url)()
            original, final = urlsplit(request.full_url), urlsplit(final_url)
            if final.scheme != original.scheme or final.netloc != original.netloc:
                close = getattr(response, "close", None)
                if callable(close):
                    close()
                raise CadServiceError("cad_service_cross_origin_redirect_rejected")
            return response
        except HTTPError as exc:
            try:
                raw = exc.read(64 * 1024)
                error = self._decode_error(raw, exc.code, request.headers.get("X-request-id"))
            finally:
                exc.close()
            raise error from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise CadServiceError(
                "cad_host_transport_unavailable",
                "The CAD service could not be reached.",
                retryable=True,
                request_id=request.headers.get("X-request-id"),
            ) from exc

    def _request_json(
        self,
        method: str,
        path: str,
        payload: Mapping[str, Any] | None = None,
        *,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        body = None if payload is None else json.dumps(
            dict(payload), ensure_ascii=False, separators=(",", ":")
        ).encode("utf-8")
        request_id = str(uuid.uuid4())
        request_headers = {
            "Accept": JSON_MIME,
            "Authorization": "Bearer " + self._token,
            "X-Request-ID": request_id,
        }
        if body is not None:
            request_headers["Content-Type"] = JSON_MIME
        if idempotency_key:
            if not isinstance(idempotency_key, str) or len(idempotency_key) > 200:
                raise ValueError("cad_idempotency_key_invalid")
            request_headers["Idempotency-Key"] = idempotency_key
        if headers:
            request_headers.update({str(k): str(v) for k, v in headers.items()})
        request = Request(self._url(path), data=body, headers=request_headers, method=method.upper())
        with self._open(request, timeout) as response:
            status = self._status(response)
            raw = response.read(self.max_json_bytes + 1)
        if status < 200 or status >= 300:
            raise self._decode_error(raw[:64 * 1024], status, request_id)
        if len(raw) > self.max_json_bytes:
            raise CadServiceError("cad_service_response_too_large", status=status, request_id=request_id)
        try:
            value = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as exc:
            raise CadServiceError("cad_service_invalid_json", status=status, request_id=request_id) from exc
        if not isinstance(value, dict):
            raise CadServiceError("cad_service_response_invalid", status=status, request_id=request_id)
        if value.get("ok") is False:
            raise self._decode_error(raw, status, request_id)
        return value

    def get_capabilities(self, *, refresh: bool = False) -> dict[str, Any]:
        with self._capabilities_lock:
            now = time.monotonic()
            if (not refresh and self._capabilities is not None
                    and now - self._capabilities_at <= self.capabilities_ttl):
                return copy.deepcopy(self._capabilities)
            value = self._request_json("GET", "/v1/capabilities")
            if value.get("ok") is not True or not isinstance(value.get("endpoints"), dict):
                raise CadServiceError("cad_host_capabilities_invalid")
            self._capabilities = value
            self._capabilities_at = now
            return copy.deepcopy(value)

    def probe(self) -> bool:
        """Probe the authenticated service itself, not whether every tool is ready."""
        try:
            value = self.get_capabilities(refresh=True)
        except CadServiceError:
            return False
        return value.get("service") == "agentsam-cad"

    def operation_ready(self, key: str) -> bool:
        capabilities = self.get_capabilities()
        endpoint = capabilities.get("endpoints", {}).get(key)
        if endpoint is True:
            return True
        if not isinstance(endpoint, dict):
            return False
        # An installed handler is not proof that its full native toolchain ran.
        if endpoint.get("handler_installed") is not True:
            return False
        if endpoint.get("status") != "available" and endpoint.get("verified") is not True:
            return False
        tools = capabilities.get("tools", {})
        for name in endpoint.get("requires", []):
            tool = tools.get(name, {})
            if tool.get("installed") is not True:
                return False
            if "ready" in tool and tool.get("ready") is not True:
                return False
        return True

    def _effective_limit(self, name: str, configured: int) -> int:
        limits = self.get_capabilities().get("limits", {})
        advertised = limits.get(name) if isinstance(limits, dict) else None
        if isinstance(advertised, int) and not isinstance(advertised, bool) and advertised > 0:
            return min(configured, advertised)
        return configured

    def execute(self, engine: str, payload: Mapping[str, Any], *, timeout: float | None = None) -> dict[str, Any]:
        if engine not in _ENGINE_ROUTES or not isinstance(payload, Mapping):
            raise ValueError("cad_engine_operation_invalid")
        route, capability = _ENGINE_ROUTES[engine]
        if not self.operation_ready(capability):
            raise CadServiceError("cad_engine_operation_unavailable")
        return self._request_json("POST", route, payload, timeout=timeout)

    def list_files(self, mount: str = "work", path: str = "") -> dict[str, Any]:
        if not isinstance(mount, str) or not MOUNT.fullmatch(mount):
            raise ValueError("cad_resource_mount_invalid")
        if not isinstance(path, str) or path.startswith("/") or "\\" in path or "\x00" in path:
            raise ValueError("cad_resource_path_invalid")
        if path and any(part in ("", ".", "..") for part in path.split("/")):
            raise ValueError("cad_resource_path_invalid")
        suffix = "/".join(quote(part, safe="") for part in path.split("/")) if path else ""
        uri = f"/v1/files/{mount}/" + suffix
        return self._request_json("GET", uri)

    def export_building(
        self,
        source: Mapping[str, Any],
        *,
        base: str | None = None,
        required_files: frozenset[str] | set[str] | None = None,
        timeout: float = 135.0,
    ) -> dict[str, Any]:
        ref = validate_file_resource_ref(dict(source) if isinstance(source, Mapping) else source)
        if base is not None and (not isinstance(base, str) or not HEX.fullmatch(base.lower())):
            raise ValueError("cad_building_base_invalid")
        if not self.operation_ready("cad_building_export"):
            raise CadServiceError("cad_host_unprobed_or_unavailable")
        payload: dict[str, Any] = {"source": ref}
        if base is not None:
            payload["base"] = base.lower()
        data = self._request_json("POST", "/v1/cad/building/export", payload, timeout=timeout)
        endpoint = self.get_capabilities().get("endpoints", {}).get("cad_building_export", {})
        validate_building_export(
            data,
            base=base,
            required_files=required_files,
            max_artifact_bytes=self._effective_limit("max_artifact_bytes", self.max_artifact_bytes),
            expected_source=ref,
            expected_scope=endpoint.get("scope") if isinstance(endpoint, dict) else None,
        )
        return data

    def download_to(
        self,
        artifact: Mapping[str, Any],
        destination: str | Path,
        *,
        resume: bool = False,
        timeout: float | None = None,
    ) -> Path:
        uri, expected_bytes, expected_hash = _artifact_metadata(
            artifact, max_bytes=self._effective_limit("max_artifact_bytes", self.max_artifact_bytes)
        )
        target = Path(destination).expanduser()
        partial = target.with_name(target.name + ".part")
        if target.is_symlink() or partial.is_symlink():
            raise ValueError("cad_download_destination_symlink")
        target.parent.mkdir(parents=True, exist_ok=True)
        offset = partial.stat().st_size if resume and partial.is_file() else 0
        if offset > expected_bytes:
            partial.unlink(missing_ok=True)
            offset = 0
        if offset == expected_bytes:
            digest = _hash_file(partial)
            if digest == expected_hash:
                partial.replace(target)
                return target
            partial.unlink(missing_ok=True)
            offset = 0

        request_id = str(uuid.uuid4())
        headers = {
            "Authorization": "Bearer " + self._token,
            "Accept": "application/octet-stream",
            "X-Request-ID": request_id,
        }
        if offset:
            headers["Range"] = f"bytes={offset}-"
        request = Request(self._url(uri), headers=headers, method="GET")
        with self._open(request, timeout) as response:
            status = self._status(response)
            if status == 206:
                content_range = self._headers(response).get("Content-Range", "")
                match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", str(content_range))
                if not match or int(match.group(1)) != offset or int(match.group(3)) != expected_bytes:
                    raise CadServiceError("cad_artifact_range_invalid", status=status, request_id=request_id)
                if int(match.group(2)) != expected_bytes - 1:
                    raise CadServiceError("cad_artifact_range_incomplete", status=status, request_id=request_id)
                mode = "ab"
            elif status == 200:
                offset = 0
                mode = "wb"
            else:
                raw = response.read(64 * 1024)
                raise self._decode_error(raw, status, request_id)

            digest = hashlib.sha256()
            if mode == "ab":
                with partial.open("rb") as existing:
                    for chunk in iter(lambda: existing.read(CHUNK_BYTES), b""):
                        digest.update(chunk)
            received = 0
            with partial.open(mode) as output:
                while True:
                    chunk = response.read(CHUNK_BYTES)
                    if not chunk:
                        break
                    received += len(chunk)
                    if offset + received > expected_bytes:
                        raise CadServiceError("cad_artifact_size_mismatch")
                    digest.update(chunk)
                    output.write(chunk)
                output.flush()
        total = offset + received
        if total != expected_bytes or digest.hexdigest() != expected_hash:
            partial.unlink(missing_ok=True)
            raise CadServiceError("cad_artifact_integrity_invalid")
        partial.replace(target)
        return target

    def download(self, artifact: Mapping[str, Any], *, timeout: float | None = None) -> bytes:
        uri, expected_bytes, expected_hash = _artifact_metadata(
            artifact, max_bytes=self._effective_limit("max_artifact_bytes", self.max_artifact_bytes)
        )
        inline_limit = min(
            self._effective_limit("max_inline_artifact_bytes", self.max_inline_artifact_bytes),
            self._effective_limit("max_artifact_bytes", self.max_artifact_bytes),
        )
        if expected_bytes > inline_limit:
            raise CadServiceError(
                "cad_artifact_requires_streaming",
                "Use download_to() for artifacts larger than the configured inline limit.",
            )
        request_id = str(uuid.uuid4())
        request = Request(self._url(uri), headers={
            "Authorization": "Bearer " + self._token,
            "Accept": "application/octet-stream",
            "X-Request-ID": request_id,
        }, method="GET")
        with self._open(request, timeout) as response:
            status = self._status(response)
            if status != 200:
                raw = response.read(64 * 1024)
                raise self._decode_error(raw, status, request_id)
            raw = response.read(expected_bytes + 1)
        if len(raw) != expected_bytes or hashlib.sha256(raw).hexdigest() != expected_hash:
            raise CadServiceError("cad_artifact_integrity_invalid")
        return raw


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(CHUNK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_building_export(
    data: Any,
    *,
    base: str | None = None,
    required_files: frozenset[str] | set[str] | None = None,
    max_artifact_bytes: int = DEFAULT_MAX_ARTIFACT_BYTES,
    expected_source: Mapping[str, Any] | None = None,
    expected_scope: str | None = None,
) -> None:
    if not isinstance(data, dict) or data.get("ok") is not True or data.get("schema") != "agentsam.cad.building-export.v1":
        raise CadServiceError("cad_building_receipt_invalid")
    source = data.get("source")
    if (not isinstance(source, dict) or data.get("output_scope") != "runtime-derived"
            or not isinstance(source.get("scope"), str) or not source.get("scope")
            or (expected_scope is not None and source.get("scope") != expected_scope)
            or not isinstance(source.get("source_sha256"), str)
            or not HEX.fullmatch(source["source_sha256"].lower())
            or isinstance(source.get("source_revision"), bool)
            or not isinstance(source.get("source_revision"), int) or source["source_revision"] < 1
            or (base is not None and source["source_sha256"].lower() != base.lower())):
        raise CadServiceError("cad_building_source_evidence_invalid")
    if expected_source is not None and any(
        source.get(key) != expected_source.get(key) for key in ("kind", "mount", "path")
    ):
        raise CadServiceError("cad_building_source_identity_mismatch")
    if (not isinstance(data.get("job_id"), str)
            or not re.fullmatch(r"[A-Za-z0-9_-]{1,160}", data["job_id"])):
        raise CadServiceError("cad_building_job_identity_invalid")
    files = data.get("files")
    if not isinstance(files, list) or not files:
        raise CadServiceError("cad_building_artifacts_missing")
    paths: set[str] = set()
    uris: set[str] = set()
    for artifact in files:
        path = _safe_relative_output_path(artifact.get("path") if isinstance(artifact, dict) else None)
        uri, _, _ = _artifact_metadata(artifact, max_bytes=max_artifact_bytes)
        if path in paths or uri in uris:
            raise CadServiceError("cad_building_artifact_duplicate")
        paths.add(path)
        uris.add(uri)
    if required_files and not set(required_files).issubset(paths):
        raise CadServiceError("cad_building_required_artifacts_missing")
    receipt = data.get("receipt")
    checks = receipt.get("checks") if isinstance(receipt, dict) else None
    check_ids: set[str] = set()
    if not isinstance(checks, list) or not checks:
        raise CadServiceError("cad_building_validation_receipt_invalid")
    for check in checks:
        if (not isinstance(check, dict) or not isinstance(check.get("id"), str)
                or not check["id"] or check["id"] in check_ids or check.get("passed") is not True):
            raise CadServiceError("cad_building_validation_receipt_invalid")
        check_ids.add(check["id"])
    if not isinstance(receipt, dict) or receipt.get("status") != "passed":
        raise CadServiceError("cad_building_validation_receipt_invalid")
