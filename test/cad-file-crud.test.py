"""Native HTTP integration coverage for mounted CAD filesystem CRUD."""
import hashlib
import importlib.util
import json
import os
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

SERVER = Path(__file__).resolve().parents[1] / "services/cad/server.py"
spec = importlib.util.spec_from_file_location("cad_service_under_test", SERVER)
cad = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cad)


class MountedFileCRUD(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.secret = self.root / "service.token"
        self.secret.write_text("test-service-token")
        self.old_token = cad.TOKEN_FILE
        self.old_roots = os.environ.get("AGENTSAM_CAD_FILE_ROOTS")
        cad.TOKEN_FILE = self.secret
        os.environ["AGENTSAM_CAD_FILE_ROOTS"] = json.dumps({"project": str(self.root)})
        self.addCleanup(self.restore)
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), cad.Handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)
        self.url = f"http://127.0.0.1:{self.httpd.server_port}"

    def restore(self):
        cad.TOKEN_FILE = self.old_token
        if self.old_roots is None:
            os.environ.pop("AGENTSAM_CAD_FILE_ROOTS", None)
        else:
            os.environ["AGENTSAM_CAD_FILE_ROOTS"] = self.old_roots

    def request(self, path, method="GET", body=None, authorized=True, headers=None):
        h = {"authorization": "Bearer test-service-token"} if authorized else {}
        h.update(headers or {})
        request = Request(self.url + path, data=body, headers=h, method=method)
        try:
            with urlopen(request, timeout=3) as response:
                return response.status, dict(response.headers), response.read()
        except HTTPError as error:
            return error.code, dict(error.headers), error.read()

    def test_full_crud_preserves_bytes_and_hashes(self):
        self.assertEqual(self.request("/v1/files/project")[0], 200)
        self.assertEqual(self.request("/v1/files/project/doc.step", authorized=False)[0], 401)
        raw = b"ISO-10303-21;\nEND-ISO-10303-21;\n"
        expected = hashlib.sha256(raw).hexdigest()
        status, _, payload = self.request("/v1/files/project/drawings/plan.step", "PUT", raw,
                                          headers={"X-Content-Sha256": expected})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(payload)["sha256"], expected)
        status, response_headers, result = self.request("/v1/files/project/drawings/plan.step")
        self.assertEqual((status, result), (200, raw))
        self.assertEqual(response_headers["ETag"], f'"{expected}"')
        self.assertEqual(json.loads(self.request("/v1/files/project/drawings")[2])["entries"][0]["name"], "plan.step")
        self.assertEqual(self.request("/v1/files/project/move", "POST",
                          json.dumps({"source": "drawings/plan.step", "target": "latest/plan.step"}).encode(),
                          headers={"Content-Type": "application/json"})[0], 200)
        self.assertEqual(self.request("/v1/files/project/drawings/plan.step")[0], 404)
        self.assertEqual(self.request("/v1/files/project/latest/plan.step")[2], raw)
        self.assertEqual(self.request("/v1/files/project/latest/plan.step", "DELETE")[0], 200)
        self.assertEqual(self.request("/v1/files/project/latest/plan.step")[0], 404)

    def test_no_traversal_or_unconfigured_mount(self):
        self.assertEqual(self.request("/v1/files/missing/file.txt", "PUT", b"denied")[0], 400)
        self.assertEqual(self.request("/v1/files/project/%2e%2e/escape.txt", "PUT", b"denied")[0], 400)
        self.assertEqual(self.request("/v1/files/project", "DELETE")[0], 400)
        self.assertEqual(self.request("/v1/files/project/new.txt", "PUT", b"no", headers={"X-Content-Sha256": "0"*64})[0], 400)
        self.assertFalse((self.root / "new.txt").exists())


if __name__ == "__main__":
    unittest.main()
