import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverIfcPython, ifcStatus, sha256File } from '../../src/lib/cad/ifc.js';
import { createAgentSamClient } from '../../src/sam/index.js';

const runtime = await discoverIfcPython({ fresh: true });
const skip = runtime.available ? false : 'IfcOpenShell is not installed on this machine';

const BUILD = `
import sys, ifcopenshell, ifcopenshell.api as api, importlib, json
np = importlib.import_module("numpy")
f = api.run("project.create_file", version="IFC4")
project = api.run("root.create_entity", f, ifc_class="IfcProject", name="Fixture")
api.run("unit.assign_unit", f, length={"is_metric": True, "raw": "METERS"})
model = api.run("context.add_context", f, context_type="Model")
body = api.run("context.add_context", f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model)
site = api.run("root.create_entity", f, ifc_class="IfcSite", name="Site")
building = api.run("root.create_entity", f, ifc_class="IfcBuilding", name="B")
storey = api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name="L1")
api.run("aggregate.assign_object", f, products=[site], relating_object=project)
api.run("aggregate.assign_object", f, products=[building], relating_object=site)
api.run("aggregate.assign_object", f, products=[storey], relating_object=building)
wall = api.run("root.create_entity", f, ifc_class="IfcWall", name="W1")
api.run("geometry.assign_representation", f, product=wall, representation=api.run("geometry.add_wall_representation", f, context=body, length=5.0, height=3.0, thickness=0.2))
api.run("geometry.edit_object_placement", f, product=wall, matrix=np.eye(4))
api.run("spatial.assign_container", f, products=[wall], relating_structure=storey)
f.write(sys.argv[1])
print(json.dumps({"wall": wall.GlobalId}))
`;

test('real IFC: inspect, edit by GlobalId, diff and validate through SAM operations', { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ifc-real-'));
  try {
    const source = path.join(dir, 'fixture.ifc');
    const built = spawnSync(runtime.python, ['-c', BUILD, source], { encoding: 'utf8' });
    assert.equal(built.status, 0, built.stderr);
    const { wall } = JSON.parse(built.stdout);
    const sam = createAgentSamClient({ cwd: dir });

    const inspected = await sam.invoke('cad.bim.ifc.inspect', { input: 'fixture.ifc' });
    assert.equal(inspected.ok, true, JSON.stringify(inspected.error));
    assert.equal(inspected.data.model.truncated, false);
    assert.ok(inspected.data.model.elements.some(e => e.globalId === wall && e.ifcClass === 'IfcWall'));

    const before = sha256File(source);
    const edited = await sam.invoke('cad.bim.ifc.edit', {
      input: 'fixture.ifc', output: 'revB.ifc', base: before,
      edits: [
        { op: 'attribute.set', globalId: wall, attribute: 'Name', value: 'W1 (rev B)' },
        { op: 'solid.extrusion_depth', globalId: wall, depth_m: 3.5 },
        { op: 'placement.move', globalId: wall, delta_m: [0, 1.25, 0] },
      ],
    });
    assert.equal(edited.ok, true, JSON.stringify(edited.error));
    assert.equal(sha256File(source), before, 'the source file is never modified');
    assert.deepEqual({ ...edited.data.diff.counts }, { added: 0, removed: 0, changed: 1, unchanged: edited.data.diff.counts.unchanged });
    assert.equal(edited.data.output.sha256, sha256File(path.join(dir, 'revB.ifc')));

    const diff = await sam.invoke('cad.bim.ifc.diff', { input: 'fixture.ifc', other: 'revB.ifc' });
    const fields = diff.data.changed[0].fields;
    assert.equal(fields['attributes.Name'].to, 'W1 (rev B)');
    assert.equal(fields.geometry.from[0][1], 3);
    assert.equal(fields.geometry.to[0][1], 3.5);
    assert.equal(fields.placement.to[7], 1.25);

    const validation = await sam.invoke('cad.bim.ifc.validate', { input: 'revB.ifc' });
    assert.equal(validation.data.valid, true, JSON.stringify(validation.data.issues));

    const stale = await sam.invoke('cad.bim.ifc.edit', { input: 'fixture.ifc', output: 'revC.ifc', base: '0'.repeat(64),
      edits: [{ op: 'attribute.set', globalId: wall, attribute: 'Name', value: 'x' }] });
    assert.equal(stale.ok, false, 'a stale base revision is a conflict, not a silent overwrite');
    assert.equal(fs.existsSync(path.join(dir, 'revC.ifc')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('status reports the interpreter that will actually be used', { skip }, async () => {
  const status = await ifcStatus();
  assert.equal(status.available, true);
  assert.match(status.ifcopenshell, /^\d+\.\d+/);
});
