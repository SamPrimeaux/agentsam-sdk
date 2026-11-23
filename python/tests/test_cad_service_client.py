import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit

from agentsam_sdk.cad import (
    CadBuildingClient,
    CadServiceClient,
    CadServiceError,
    validate_artifact_uri,
    validate_file_resource_ref,
)

TOKEN = "test-cad-service-token"
DATA = b"portable-cad-artifact"
DIGEST = hashlib.sha256(DATA).hexdigest()
SHA = "a" * 64
REQUIRED = (
    "shell.step", "shell.ifc", "plan.dxf", "plan.svg", "preview.png",
    "sheet-A101-proof.pdf", "model.glb", "model.opt.glb", "turntable.mp4",
)


class Response(io.BytesIO):
    def __init__(self, body=b"", status=200, headers=None):
        super().__init__(body)
        self.status = status
        self.headers = headers or {}

    def getcode(self):
        return self.status

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def capabilities(status="available"):
    return {
        "ok": True,
        "service": "agentsam-cad",
        "version": "1",
        "tools": {name: {"installed": True} for name in ("freecad", "occt", "ifc", "blender", "media")},
        "endpoints": {
            "openscad_compile": True,
            "cad_building_export": {
                "operation": "cad.building.export",
                "handler_installed": True,
                "status": status,
                "requires": ["freecad", "occt", "ifc", "blender", "media"],
            },
        },
    }


def building_receipt():
    files = []
    for name in REQUIRED:
        files.append({
            "path": name,
            "uri": "/v1/files/work/derived/building-abc/" + name,
            "bytes": len(DATA),
            "sha256": DIGEST,
            "mediaType": "application/octet-stream",
        })
    return {
        "ok": True,
        "schema": "agentsam.cad.building-export.v1",
        "output_scope": "runtime-derived",
        "job_id": "building-abc",
        "source": {
            "kind": "file",
            "mount": "work",
            "path": "models/source.json",
            "source_sha256": SHA,
            "source_revision": 3,
            "scope": "single_rectangular_shell_with_north_south_openings",
        },
        "files": files,
        "receipt": {
            "status": "passed",
            "checks": [{"id": f"check-{i}", "passed": True} for i in range(16)],
        },
    }


class FakeTransport:
    def __init__(self):
        self.requests = []
        self.caps = capabilities()
        self.receipt = building_receipt()

    def __call__(self, request, timeout=5):
        self.requests.append(request)
        path = urlsplit(request.full_url).path
        if path == "/v1/capabilities":
            return Response(json.dumps(self.caps).encode())
        if path == "/v1/cad/building/export":
            return Response(json.dumps(self.receipt).encode())
        if path.startswith("/v1/files/"):
            start = request.get_header("Range")
            if start:
                offset = int(start.removeprefix("bytes=").removesuffix("-"))
                return Response(DATA[offset:], 206, {
                    "Content-Range": f"bytes {offset}-{len(DATA)-1}/{len(DATA)}",
                })
            return Response(DATA)
        if path == "/v1/openscad/compile":
            return Response(json.dumps({"ok": True, "tool": "openscad"}).encode())
        return Response(json.dumps({"ok": False, "error": "not_found"}).encode(), 404)


class CadServiceClientTests(unittest.TestCase):
    def test_endpoint_security_and_explicit_insecure_override(self):
        with self.assertRaisesRegex(ValueError, "https_required"):
            CadServiceClient("http://cad.example.com", TOKEN)
        with self.assertRaisesRegex(ValueError, "endpoint_invalid"):
            CadServiceClient("https://user:pass@cad.example.com", TOKEN)
        client = CadServiceClient("http://cad.example.com", TOKEN, allow_insecure_http=True)
        self.assertEqual(client.endpoint, "http://cad.example.com")
        local = CadServiceClient("http://127.0.0.1:9001", TOKEN)
        self.assertEqual(local.endpoint, "http://127.0.0.1:9001")

    def test_probe_is_distinct_from_operation_readiness(self):
        fake = FakeTransport()
        client = CadServiceClient("http://127.0.0.1:9001", TOKEN, fake)
        self.assertTrue(client.probe())
        self.assertTrue(client.operation_ready("cad_building_export"))
        fake.caps = capabilities("requires-runtime-proof")
        client.get_capabilities(refresh=True)
        self.assertFalse(client.operation_ready("cad_building_export"))

    def test_generic_engine_dispatch_uses_advertised_operation(self):
        fake = FakeTransport()
        client = CadServiceClient("http://127.0.0.1:9001", TOKEN, fake)
        result = client.execute("openscad", {"source": "cube([1,1,1]);"})
        self.assertTrue(result["ok"])
        self.assertEqual(urlsplit(fake.requests[-1].full_url).path, "/v1/openscad/compile")
        fake.caps["endpoints"]["openscad_compile"] = False
        client.get_capabilities(refresh=True)
        with self.assertRaisesRegex(CadServiceError, "unavailable"):
            client.execute("openscad", {"source": "cube([1,1,1]);"})

    def test_building_receipt_is_dynamic_and_source_linked(self):
        fake = FakeTransport()
        client = CadServiceClient("http://127.0.0.1:9001", TOKEN, fake)
        receipt = client.export_building(
            {"kind": "file", "mount": "work", "path": "models/source.json"},
            base=SHA,
        )
        self.assertEqual(len(receipt["files"]), 9)
        fake.receipt["source"]["source_sha256"] = "b" * 64
        with self.assertRaisesRegex(CadServiceError, "source_evidence"):
            client.export_building(
                {"kind": "file", "mount": "work", "path": "models/source.json"},
                base=SHA,
            )
        fake.receipt["source"]["source_sha256"] = SHA
        fake.receipt["source"]["path"] = "models/other.json"
        with self.assertRaisesRegex(CadServiceError, "source_identity"):
            client.export_building(
                {"kind": "file", "mount": "work", "path": "models/source.json"},
                base=SHA,
            )

    def test_legacy_building_client_preserves_required_output_profile(self):
        fake = FakeTransport()
        client = CadBuildingClient("http://127.0.0.1:9001", TOKEN, fake)
        self.assertTrue(client.probe())
        self.assertEqual(client.export(
            {"kind": "file", "mount": "work", "path": "models/source.json"}, SHA
        )["receipt"]["status"], "passed")
        fake.receipt["files"] = fake.receipt["files"][:-1]
        with self.assertRaisesRegex(CadServiceError, "required_artifacts"):
            client.export({"kind": "file", "mount": "work", "path": "models/source.json"})

    def test_download_to_resumes_and_verifies_streamed_artifact(self):
        fake = FakeTransport()
        client = CadServiceClient("http://127.0.0.1:9001", TOKEN, fake)
        artifact = {
            "uri": "/v1/files/work/derived/building-abc/model.step",
            "bytes": len(DATA),
            "sha256": DIGEST,
        }
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "model.step"
            partial = destination.with_name(destination.name + ".part")
            partial.write_bytes(DATA[:5])
            result = client.download_to(artifact, destination, resume=True)
            self.assertEqual(result.read_bytes(), DATA)
            self.assertFalse(partial.exists())
            self.assertEqual(fake.requests[-1].get_header("Range"), "bytes=5-")

    def test_inline_download_limit_and_integrity(self):
        fake = FakeTransport()
        client = CadServiceClient(
            "http://127.0.0.1:9001", TOKEN, fake,
            max_inline_artifact_bytes=4, max_artifact_bytes=1024,
        )
        artifact = {
            "uri": "/v1/files/work/derived/building-abc/model.step",
            "bytes": len(DATA),
            "sha256": DIGEST,
        }
        with self.assertRaisesRegex(CadServiceError, "requires_streaming"):
            client.download(artifact)
        client.max_inline_artifact_bytes = 1024
        self.assertEqual(client.download(artifact), DATA)
        artifact["sha256"] = "b" * 64
        with self.assertRaisesRegex(CadServiceError, "integrity"):
            client.download(artifact)

    def test_file_ref_and_artifact_uri_reject_traversal_and_external_urls(self):
        with self.assertRaisesRegex(ValueError, "resource_ref"):
            validate_file_resource_ref({"kind": "file", "mount": "work", "path": "../private"})
        with self.assertRaisesRegex(ValueError, "artifact_reference"):
            validate_artifact_uri("https://attacker.example/file.step")
        with self.assertRaisesRegex(ValueError, "artifact_reference"):
            validate_artifact_uri("/v1/files/work/%2e%2e/private.step")
        self.assertEqual(
            validate_artifact_uri("/v1/files/customer-1/projects/p1/model.step"),
            "/v1/files/customer-1/projects/p1/model.step",
        )

    def test_provider_artifact_limits_are_honored(self):
        fake = FakeTransport()
        fake.caps["limits"] = {
            "max_artifact_bytes": 10,
            "max_inline_artifact_bytes": 5,
        }
        client = CadServiceClient(
            "http://127.0.0.1:9001", TOKEN, fake,
            max_inline_artifact_bytes=1024, max_artifact_bytes=1024,
        )
        artifact = {
            "uri": "/v1/files/work/derived/building-abc/model.step",
            "bytes": len(DATA),
            "sha256": DIGEST,
        }
        with self.assertRaisesRegex(ValueError, "artifact_size_invalid"):
            client.download_to(artifact, Path(tempfile.gettempdir()) / "not-created.step")
        artifact["bytes"] = 8
        with self.assertRaisesRegex(CadServiceError, "requires_streaming"):
            client.download(artifact)

    def test_cross_origin_redirect_is_rejected(self):
        class RedirectResponse(Response):
            def geturl(self):
                return "https://attacker.example/collect"
        client = CadServiceClient(
            "http://127.0.0.1:9001", TOKEN,
            lambda request, timeout=5: RedirectResponse(b"{}"),
        )
        with self.assertRaisesRegex(CadServiceError, "cross_origin_redirect"):
            client.get_capabilities()

    def test_http_errors_keep_code_status_and_retryability(self):
        def unavailable(request, timeout=5):
            raise HTTPError(
                request.full_url, 503, "Unavailable", {},
                io.BytesIO(b'{"ok":false,"error":"cad_service_busy"}'),
            )
        client = CadServiceClient("http://127.0.0.1:9001", TOKEN, unavailable)
        with self.assertRaises(CadServiceError) as caught:
            client.get_capabilities()
        self.assertEqual(caught.exception.code, "cad_service_busy")
        self.assertEqual(caught.exception.status, 503)
        self.assertTrue(caught.exception.retryable)

    def test_resource_refs_are_mount_relative_and_strict(self):
        self.assertEqual(validate_file_resource_ref({
            "kind": "file", "mount": "customer-assets", "path": "projects/a/source.cad",
        })["mount"], "customer-assets")
        for bad in ("", "/absolute", "a//b", "a/./b", "a/../b", "a\\b"):
            with self.subTest(path=bad), self.assertRaises(ValueError):
                validate_file_resource_ref({"kind": "file", "mount": "work", "path": bad})


if __name__ == "__main__":
    unittest.main()
