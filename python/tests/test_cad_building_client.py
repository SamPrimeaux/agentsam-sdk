import hashlib
import io
import json
import unittest
from agentsam_sdk.cad.building import CadBuildingClient

class Response(io.BytesIO):
    def __enter__(self):return self
    def __exit__(self,*a):self.close()

SHA='a'*64
ARTIFACT=b'cad output artifact'
ART_SHA=hashlib.sha256(ARTIFACT).hexdigest()
FILE={'path':'shell.ifc','uri':'/v1/files/work/derived/building-abc/shell.ifc','bytes':len(ARTIFACT),'sha256':ART_SHA}
CAPS={'endpoints':{'cad_building_export':{'handler_installed':True,'operation':'cad.building.export','scope':'single_rectangular_shell_with_north_south_openings','status':'available'}},'tools':{x:{'installed':True} for x in ('freecad','occt','ifc','blender','media')}}
RECEIPT={'ok':True,'schema':'agentsam.cad.building-export.v1','output_scope':'runtime-derived',
 'source':{'source_sha256':SHA,'source_revision':1,'scope':'single_rectangular_shell_with_north_south_openings'},
 'files':[FILE,*[{**FILE,'path':p,'uri':'/v1/files/work/derived/building-abc/'+p} for p in ['shell.step','plan.dxf','plan.svg','preview.png','sheet-A101-proof.pdf','model.glb','model.opt.glb','turntable.mp4']]],
 'receipt':{'status':'passed','checks':[{'id':str(i),'passed':True} for i in range(16)]}}

def fake(request,timeout=5):
    if request.full_url.endswith('/v1/capabilities'):return Response(json.dumps(CAPS).encode())
    if request.full_url.endswith('/v1/cad/building/export'):return Response(json.dumps(RECEIPT).encode())
    return Response(ARTIFACT)

class CadBuildingPythonClientTests(unittest.TestCase):
    def test_python_host_without_node(self):
        client=CadBuildingClient('http://127.0.0.1:9001','dummy-bearer-token-only',fake)
        with self.assertRaisesRegex(RuntimeError,'unprobed'):
            client.export({'kind':'file','mount':'work','path':'scene.json'})
        self.assertTrue(client.probe())
        self.assertEqual(client.export({'kind':'file','mount':'work','path':'scene.json'},SHA)['receipt']['status'],'passed')
        self.assertEqual(client.download(FILE),ARTIFACT)

    def test_scope_and_hash_checks(self):
        client=CadBuildingClient('http://127.0.0.1:9001','dummy-bearer-token-only',fake)
        self.assertTrue(client.probe())
        with self.assertRaisesRegex(ValueError,'resource_ref'):
            client.export({'kind':'file','mount':'work','path':'../secret'})
        with self.assertRaisesRegex(RuntimeError,'receipt_invalid'):
            client.export({'kind':'file','mount':'work','path':'scene.json'},'b'*64)
        with self.assertRaisesRegex(RuntimeError,'integrity_invalid'):
            client.download({**FILE,'sha256':'b'*64})
        with self.assertRaisesRegex(ValueError,'endpoint_invalid'):
            CadBuildingClient('http://public.example.org','dummy-bearer-token-only')

if __name__=='__main__':unittest.main()
