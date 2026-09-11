import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BLENDER_ADAPTER_PATH,
  blenderBuild,
  blenderInspect,
  blenderStatus,
  createBlenderInvocation,
  discoverBlender,
  parseBlenderResult,
  validateBlenderRecipe,
} from '../src/lib/cad/index.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-blender-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const binary = path.join(root, process.platform === 'win32' ? 'blender.exe' : 'blender');
  fs.writeFileSync(binary, 'fake blender\n');
  const blend = path.join(root, 'source.blend');
  fs.writeFileSync(blend, 'blend fixture\n');
  return { root, binary, blend };
}

function resultEnvelope(value) {
  return { code: 0, stdout: `Blender startup noise\nAGENTSAM_RESULT=${JSON.stringify(value)}\n`, stderr: '' };
}

test('Blender adapter is packaged at the SDK-owned fixed path', () => {
  assert.equal(path.basename(BLENDER_ADAPTER_PATH), 'adapter.py');
  assert.ok(fs.existsSync(BLENDER_ADAPTER_PATH));
});

test('discoverBlender honors explicit binary before environment discovery', t => {
  const { binary } = fixture(t);
  assert.equal(discoverBlender({ blenderBin: binary, env: { AGENTSAM_BLENDER_BIN: '/wrong' } }), path.resolve(binary));
  assert.throws(() => discoverBlender({ blenderBin: path.join(path.dirname(binary), 'missing') }), /not found/);
});

test('Blender status uses argv execution and returns version without shell parsing', async t => {
  const { binary } = fixture(t);
  const calls = [];
  const result = await blenderStatus({
    blenderBin: binary,
    runProcessImpl: async (command, args) => {
      calls.push({ command, args });
      return { code: 0, stdout: 'Blender 4.5.3 LTS\n', stderr: '' };
    },
  });
  assert.equal(result.available, true);
  assert.equal(result.version, 'Blender 4.5.3 LTS');
  assert.deepEqual(calls, [{ command: path.resolve(binary), args: ['--version'] }]);
});

test('typed Blender recipe rejects arbitrary or unknown operations', () => {
  const valid = validateBlenderRecipe({
    schema_version: 1,
    operations: [
      { op: 'add', primitive: 'cube', name: 'Body', size: 20 },
      { op: 'bevel', object: 'Body', width: 1, segments: 3 },
    ],
  });
  assert.equal(valid.operations.length, 2);
  assert.throws(() => validateBlenderRecipe({ schema_version: 1, operations: [{ op: 'python', code: 'import bpy' }] }), /unsupported Blender recipe operation/);
});

test('Blender invocation is background + fixed adapter + typed request, never shell code', t => {
  const { binary, blend, root } = fixture(t);
  const requestPath = path.join(root, 'request.json');
  const value = createBlenderInvocation({ operation: 'inspect', input: blend, requestPath, blenderBin: binary });
  assert.equal(value.command, binary);
  assert.deepEqual(value.args.slice(0, 2), ['--background', blend]);
  assert.ok(value.args.includes('--python'));
  assert.ok(value.args.includes(BLENDER_ADAPTER_PATH));
  assert.deepEqual(value.args.slice(-4), ['--operation', 'inspect', '--request', requestPath]);
});

test('parseBlenderResult ignores Blender logs and reads the machine envelope', () => {
  assert.deepEqual(parseBlenderResult('noise\nAGENTSAM_RESULT={"ok":true,"value":7}\n'), { ok: true, value: 7 });
  assert.throws(() => parseBlenderResult('noise only'), /did not return/);
});

test('blenderInspect returns source hash and scene evidence without writing source', async t => {
  const { binary, blend } = fixture(t);
  const before = fs.readFileSync(blend, 'utf8');
  const result = await blenderInspect({
    input: blend,
    blenderBin: binary,
    runProcessImpl: async () => resultEnvelope({
      ok: true,
      blender_version: '4.5.3',
      scene: { active: 'Scene', objects: [{ name: 'Body', type: 'MESH' }] },
      warnings: [],
    }),
  });
  assert.equal(result.capability, 'blender.inspect');
  assert.equal(result.scene.objects[0].name, 'Body');
  assert.match(result.input.sha256, /^[a-f0-9]{64}$/);
  assert.equal(fs.readFileSync(blend, 'utf8'), before);
});

test('blenderBuild executes a bounded recipe and produces a hashed .blend artifact', async t => {
  const { binary, root } = fixture(t);
  const output = path.join(root, 'built.blend');
  const recipe = {
    schema_version: 1,
    units: { system: 'METRIC', scale_length: 0.001, length_unit: 'MILLIMETERS' },
    operations: [
      { op: 'clear_scene' },
      { op: 'add', primitive: 'cube', name: 'Body', size: 20 },
      { op: 'add', primitive: 'cylinder', name: 'Hole', radius: 3, depth: 30 },
      { op: 'boolean', object: 'Body', with: 'Hole', operation: 'DIFFERENCE', delete_operand: true },
    ],
  };
  let seenRequest;
  const result = await blenderBuild({
    output,
    recipe,
    blenderBin: binary,
    runProcessImpl: async (_command, args) => {
      const requestPath = args[args.indexOf('--request') + 1];
      seenRequest = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
      fs.writeFileSync(seenRequest.output, 'generated blend artifact\n');
      return resultEnvelope({ ok: true, blender_version: '4.5.3', operations_applied: recipe.operations.length, objects: ['Body'], warnings: [] });
    },
  });
  assert.equal(seenRequest.recipe.operations[3].operation, 'DIFFERENCE');
  assert.equal(result.capability, 'blender.build');
  assert.equal(result.artifact.path, output);
  assert.equal(result.artifact.format, 'blend');
  assert.match(result.artifact.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.objects, ['Body']);
});

test('Blender build refuses to overwrite an input source .blend', async t => {
  const { binary, blend } = fixture(t);
  await assert.rejects(() => blenderBuild({
    input: blend,
    output: blend,
    blenderBin: binary,
    recipe: { schema_version: 1, operations: [{ op: 'clear_scene' }] },
    runProcessImpl: async () => { throw new Error('runner should not execute'); },
  }), /never overwrite/);
});
