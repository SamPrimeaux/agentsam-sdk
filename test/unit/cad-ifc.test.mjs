import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverIfcPython, ifcEdit, ifcDiff, parseIfcResult } from '../../src/lib/cad/ifc.js';
import { createAgentSamClient } from '../../src/sam/index.js';

const ok = stdout => ({ code: 0, stdout, stderr: '' });

test('IFC runtime discovery reports every interpreter it tried when none has ifcopenshell', async () => {
  const runProcessImpl = async cmd => {
    if (cmd === 'python') throw new Error('spawn ENOENT');
    return { code: 1, stdout: '', stderr: 'No module named ifcopenshell' };
  };
  const found = await discoverIfcPython({ python: '/custom/py', env: {}, platform: 'linux', fresh: true, runProcessImpl });
  assert.equal(found.available, false);
  assert.ok(found.searched.length >= 2, 'it names what it searched');
  assert.match(found.guidance, /pip install ifcopenshell/);
});

test('IFC runtime discovery returns the first interpreter that really imports ifcopenshell', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ifc-disc-'));
  const python = path.join(tmp, 'python');
  fs.writeFileSync(python, '');
  const found = await discoverIfcPython({ python, env: {}, platform: 'linux', fresh: true,
    runProcessImpl: async cmd => (cmd === python ? ok('{"version":"0.8.9"}\n') : { code: 1, stdout: '', stderr: '' }) });
  assert.deepEqual({ available: found.available, source: found.source, ifcopenshell: found.ifcopenshell },
    { available: true, source: 'option', ifcopenshell: '0.8.9' });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('edit refuses bad input before any interpreter runs', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ifc-in-'));
  const model = path.join(tmp, 'a.ifc');
  fs.writeFileSync(model, 'ISO-10303-21;');
  const never = async () => { throw new Error('must not run'); };
  const edits = [{ op: 'attribute.set', globalId: 'x'.repeat(22), attribute: 'Name', value: 'n' }];
  await assert.rejects(ifcEdit({ input: path.join(tmp, 'a.txt'), output: 'o.ifc', edits, cwd: tmp, runProcessImpl: never }), /must be an \.ifc/);
  await assert.rejects(ifcEdit({ input: model, output: 'o.step', edits, cwd: tmp, runProcessImpl: never }), /must be an \.ifc/);
  await assert.rejects(ifcEdit({ input: model, output: 'o.ifc', edits: [], cwd: tmp, runProcessImpl: never }), /non-empty/);
  await assert.rejects(ifcEdit({ input: model, output: 'o.ifc', edits, base: 'nope', cwd: tmp, runProcessImpl: never }), /sha256/);
  await assert.rejects(ifcDiff({ input: model, other: path.join(tmp, 'missing.ifc'), cwd: tmp, runProcessImpl: never }), /not found/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('adapter envelope parsing takes the last result line and rejects garbage', () => {
  assert.deepEqual(parseIfcResult('noise\nAGENTSAM_RESULT={"ok":false}\nAGENTSAM_RESULT={"ok":true}\n'), { ok: true });
  assert.throws(() => parseIfcResult('no envelope'), /result envelope/);
  assert.throws(() => parseIfcResult('AGENTSAM_RESULT={bad'), /malformed/);
});

test('SAM advertises the four IFC operations with real input schemas and the right risk', async () => {
  const sam = createAgentSamClient({ cwd: process.cwd() });
  const expected = { 'cad.bim.ifc.inspect': 'read_only', 'cad.bim.ifc.validate': 'read_only', 'cad.bim.ifc.diff': 'read_only', 'cad.bim.ifc.edit': 'write' };
  for (const [id, risk] of Object.entries(expected)) {
    const d = await sam.describe(id);
    assert.equal(d.ok, true, id);
    assert.equal(d.risk, risk, id);
    assert.equal(d.input_schema.type, 'object', id);
  }
  const edit = (await sam.describe('cad.bim.ifc.edit')).input_schema;
  const ops = edit.properties.edits.items.oneOf.map(o => o.properties.op.const).sort();
  assert.deepEqual(ops, ['attribute.set', 'element.remove', 'placement.move', 'property.remove', 'property.set', 'solid.extrusion_depth']);
});

test('SAM rejects malformed edits before the engine is reached', async () => {
  const sam = createAgentSamClient({ cwd: process.cwd() });
  const r = await sam.invoke('cad.bim.ifc.edit', { input: 'a.ifc', output: 'b.ifc', edits: [{ op: 'run.code', globalId: 'x' }] });
  assert.equal(r.ok, false);
});
