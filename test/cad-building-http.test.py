"""CAD project v2 operation API: source scope, auth and optimistic concurrency."""
import hashlib
import importlib.util
import json
import os
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError

ROOT=Path(__file__).resolve().parents[1]
SERVER=ROOT/'services/cad/server.py'
spec=importlib.util.spec_from_file_location('cad_building_http_server',SERVER)
cad=importlib.util.module_from_spec(spec)
spec.loader.exec_module(cad)
FIXTURE=ROOT/'services/cad/proof/fixtures/building-project.v2.json'

class BuildingHTTPTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.source=self.root/'building.json'
        self.source.write_bytes(FIXTURE.read_bytes())
        self.token=self.root/'token'
        self.token.write_text('test-building-token-4321')
        old_token=cad.TOKEN_FILE
        old_work=cad.WORK_ROOT
        old_roots=os.environ.get('AGENTSAM_CAD_FILE_ROOTS')
        cad.TOKEN_FILE=self.token
        cad.WORK_ROOT=self.root
        os.environ['AGENTSAM_CAD_FILE_ROOTS']=json.dumps({'work':str(self.root)})
        def restore():
            cad.TOKEN_FILE=old_token
            cad.WORK_ROOT=old_work
            if old_roots is None:os.environ.pop('AGENTSAM_CAD_FILE_ROOTS',None)
            else:os.environ['AGENTSAM_CAD_FILE_ROOTS']=old_roots
        self.addCleanup(restore)
        self.httpd=ThreadingHTTPServer(('127.0.0.1',0),cad.Handler)
        self.thread=threading.Thread(target=self.httpd.serve_forever,daemon=True)
        self.thread.start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)
        self.url=f'http://127.0.0.1:{self.httpd.server_port}'

    def call(self,body,authorized=True):
        raw=json.dumps(body).encode()
        headers={'Content-Type':'application/json'}
        if authorized:headers['Authorization']='Bearer test-building-token-4321'
        req=Request(self.url+'/v1/cad/building/export',data=raw,method='POST',headers=headers)
        try:
            with urlopen(req,timeout=4) as resp:return resp.status,json.load(resp)
        except HTTPError as ex:
            status=ex.code
            with ex:return status,json.loads(ex.read())

    def test_no_anonymous_execution(self):
        result=self.call({'source':{'kind':'file','mount':'work','path':'building.json'}},authorized=False)
        self.assertEqual(result[0],401)

    def test_stale_content_hash_is_conflict_not_overwrite(self):
        status,result=self.call({'source':{'kind':'file','mount':'work','path':'building.json'},'base':'f'*64})
        self.assertEqual(status,409)
        self.assertEqual(result['error'],'cad_building_source_revision_conflict')
        self.assertEqual(self.source.read_bytes(),FIXTURE.read_bytes())
        self.assertFalse((self.root/'derived').exists())

    def test_mount_and_traversal_are_rejected(self):
        for resource in [{'kind':'file','mount':'unknown','path':'building.json'},
                         {'kind':'file','mount':'work','path':'../building.json'},
                         {'kind':'file','mount':'work','path':'/etc/passwd'},
                         {'kind':'project','id':'foreign-project'}]:
            with self.subTest(ref=resource):
                status,result=self.call({'source':resource})
                self.assertEqual(status,400,result)

    def test_file_download_supports_head_and_byte_ranges(self):
        payload = bytes(range(256)) * 8192
        target = self.root / 'large-model.glb'
        target.write_bytes(payload)
        headers = {'Authorization': 'Bearer test-building-token-4321'}
        head = Request(self.url + '/v1/files/work/large-model.glb', method='HEAD', headers=headers)
        with urlopen(head, timeout=4) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(int(response.headers['Content-Length']), len(payload))
            self.assertEqual(response.headers['X-Content-Sha256'], hashlib.sha256(payload).hexdigest())
            self.assertEqual(response.read(), b'')

        ranged = Request(self.url + '/v1/files/work/large-model.glb', method='GET',
                         headers={**headers, 'Range': 'bytes=100-199'})
        with urlopen(ranged, timeout=4) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(response.headers['Content-Range'], f'bytes 100-199/{len(payload)}')
            self.assertEqual(response.read(), payload[100:200])

        full = Request(self.url + '/v1/files/work/large-model.glb', headers=headers)
        with urlopen(full, timeout=4) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(), payload)

    def test_file_upload_streams_and_checks_hash(self):
        payload = bytes(range(251)) * 8192
        digest = hashlib.sha256(payload).hexdigest()
        request = Request(
            self.url + '/v1/files/work/uploaded-model.step',
            data=payload,
            method='PUT',
            headers={
                'Authorization': 'Bearer test-building-token-4321',
                'Content-Type': 'application/octet-stream',
                'X-Content-Sha256': digest,
            },
        )
        with urlopen(request, timeout=8) as response:
            result = json.load(response)
            self.assertEqual(response.status, 200)
        self.assertEqual(result['bytes'], len(payload))
        self.assertEqual(result['sha256'], digest)
        self.assertEqual((self.root / 'uploaded-model.step').read_bytes(), payload)

    def test_invalid_range_returns_416(self):
        target = self.root / 'small.bin'
        target.write_bytes(b'0123456789')
        request = Request(
            self.url + '/v1/files/work/small.bin',
            headers={'Authorization': 'Bearer test-building-token-4321', 'Range': 'bytes=99-'},
        )
        with self.assertRaises(HTTPError) as caught:
            urlopen(request, timeout=4)
        with caught.exception as error:
            self.assertEqual(error.code, 416)
            self.assertEqual(error.headers['Content-Range'], 'bytes */10')

if __name__=='__main__':unittest.main()
