"""CAD v2 to bounded real-engine building export source-contract tests."""
import copy
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FIXTURE=ROOT/'services/cad/proof/fixtures/building-project.v2.json'
PATH=ROOT/'services/cad/proof/building_source.py'
spec=importlib.util.spec_from_file_location('cad_building_source_test',PATH)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class BuildingSourceTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/'building.json'
        self.document=json.loads(FIXTURE.read_text())
        self.write()

    def write(self):
        self.path.write_text(json.dumps(self.document,sort_keys=True))

    def load(self,base=None):
        self.write()
        return mod.load_building_source(self.path,base)

    def test_authoritative_v2_project_source_and_hash(self):
        raw=self.path.read_bytes()
        params,evidence=self.load(hashlib.sha256(raw).hexdigest())
        self.assertEqual(params['length'],480)
        self.assertEqual(params['frames'],8)
        self.assertEqual(params['openings'][0]['id'],'door-south')
        self.assertEqual(evidence['source_id'],'cad-proof-shell-01')
        self.assertEqual(evidence['source_revision'],1)
        self.assertEqual(evidence['storey_id'],'level-01')
        self.assertEqual(evidence['source_sha256'],hashlib.sha256(raw).hexdigest())

    def test_changes_are_source_driven(self):
        shell=self.document['geometry']['entities'][0]['properties']
        shell.update(length=600,width=300,height=130,wallThickness=8)
        self.document['revision']=2
        self.document['modules']['architecture']['extensions']['iamscene.building-shell.v1']['frames']=4
        params,evidence=self.load()
        self.assertEqual((params['length'],params['width'],params['wall'],params['frames']),(600,300,8,4))
        self.assertEqual(evidence['source_revision'],2)
        self.assertEqual(len(params['openings']),3)

    def test_units_are_explicit_not_guessed(self):
        self.document['coordinateSystem']['unit']='mm'
        self.document['geometry']['entities'][0]['properties'].update(length=15240,width=7620,height=3302,wallThickness=203.2)
        for opening in self.document['geometry']['entities'][1:]:
            for key in ('x','sill','width','height'): opening['properties'][key]*=25.4
        params,_=self.load()
        self.assertAlmostEqual(params['length'],600)
        self.assertAlmostEqual(params['wall'],8)
        self.assertAlmostEqual(params['openings'][0]['width'],36)

    def test_revision_conflict_rejected(self):
        with self.assertRaisesRegex(ValueError,'revision_conflict'): self.load('a'*64)

    def test_missing_or_overlapping_entities_rejected(self):
        self.document['geometry']['entities'].pop()
        with self.assertRaisesRegex(ValueError,'opening_entity_required'): self.load()
        self.document=json.loads(FIXTURE.read_text())
        self.document['geometry']['entities'][2]['properties']['x']=61
        with self.assertRaisesRegex(ValueError,'openings_overlap'): self.load()

    def test_unsupported_geometry_refuses_to_silently_drop_parts(self):
        self.document['geometry']['entities'].append({'id':'extra-part','kind':'mechanical.box'})
        with self.assertRaisesRegex(ValueError,'unhandled_entities'): self.load()

    def test_rejects_invalid_spatial_hierarchy_and_placement(self):
        a=self.document['modules']['architecture']
        a['storeys'][0]['buildingId']='unrelated'
        with self.assertRaisesRegex(ValueError,'spatial_hierarchy_invalid'): self.load()
        self.document=json.loads(FIXTURE.read_text())
        self.document['geometry']['entities'][1]['properties']['x']=99000
        with self.assertRaisesRegex(ValueError,'opening_outside_wall'): self.load()

    def test_rejects_malformed_source_unit_dimensions_and_media(self):
        for bad,kind in [(0,'invalid_length'),(-1,'invalid_length'),(float('nan'),'invalid_length')]:
            self.document=json.loads(FIXTURE.read_text())
            self.document['geometry']['entities'][0]['properties']['length']=bad
            with self.assertRaisesRegex(ValueError,kind): self.load()
        self.document=json.loads(FIXTURE.read_text())
        self.document['coordinateSystem']['unit']='deg'
        with self.assertRaisesRegex(ValueError,'coordinate_system_unsupported'): self.load()
        self.document=json.loads(FIXTURE.read_text())
        self.document['modules']['architecture']['extensions']['iamscene.building-shell.v1']['frames']=300
        with self.assertRaisesRegex(ValueError,'media_bounds_invalid'): self.load()

if __name__=='__main__':unittest.main()
