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

if __name__=='__main__':unittest.main()
