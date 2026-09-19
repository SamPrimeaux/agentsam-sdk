import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  discoverOpenScad,
  openScadStatus,
  discoverFreeCad,
  freeCadStatus,
  meshyStatus,
  mujocoStatus,
  discoverAllCadTools,
} from '../src/lib/cad/index.js';

function makeFixture(t, name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `agentsam-${name}-test-`));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const binary = path.join(root, process.platform === 'win32' ? `${name}.exe` : name);
  fs.writeFileSync(binary, `fake ${name}\n`);
  return { root, binary };
}

test('discoverOpenScad honors explicit binary before env and path', (t) => {
  const { binary } = makeFixture(t, 'openscad');
  const result = discoverOpenScad({
    openscadBin: binary,
    env: { AGENTSAM_OPENSCAD_BIN: '/nonexistent/bin' },
  });
  assert.equal(result.source, 'explicit');
  assert.equal(result.binary, fs.realpathSync(binary));
});

test('discoverOpenScad honors AGENTSAM_OPENSCAD_BIN when explicit is not set', (t) => {
  const { binary } = makeFixture(t, 'openscad');
  const result = discoverOpenScad({
    env: { AGENTSAM_OPENSCAD_BIN: binary },
  });
  assert.equal(result.source, 'env');
  assert.equal(result.binary, fs.realpathSync(binary));
});

test('openScadStatus probes version boundedly and returns deterministic receipt', async (t) => {
  const { binary } = makeFixture(t, 'openscad');
  const calls = [];
  const status = await openScadStatus({
    openscadBin: binary,
    runProcessImpl: async (command, args) => {
      calls.push({ command, args });
      return { code: 0, stdout: '', stderr: 'OpenSCAD version 2026.04.26\n' };
    },
  });

  assert.equal(status.tool, 'openscad');
  assert.equal(status.available, true);
  assert.equal(status.version, '2026.04.26');
  assert.equal(status.execution_lane, 'native');
  assert.deepEqual(calls[0], { command: fs.realpathSync(binary), args: ['-v'] });
});

test('discoverFreeCad honors explicit binary and AGENTSAM_FREECAD_BIN', (t) => {
  const { binary } = makeFixture(t, 'FreeCADCmd');
  const result = discoverFreeCad({
    freecadBin: binary,
    env: { AGENTSAM_FREECAD_BIN: '/nonexistent/path' },
  });
  assert.equal(result.source, 'explicit');
  assert.equal(result.binary, fs.realpathSync(binary));

  const envResult = discoverFreeCad({
    env: { AGENTSAM_FREECAD_BIN: binary },
  });
  assert.equal(envResult.source, 'env');
  assert.equal(envResult.binary, fs.realpathSync(binary));
});

test('freeCadStatus probes version and returns deterministic receipt', async (t) => {
  const { binary } = makeFixture(t, 'FreeCADCmd');
  const calls = [];
  const status = await freeCadStatus({
    freecadBin: binary,
    runProcessImpl: async (command, args) => {
      calls.push({ command, args });
      return { code: 0, stdout: 'FreeCAD 1.1.1 Revision: 20260414 (Git shallow)\n', stderr: '' };
    },
  });

  assert.equal(status.tool, 'freecad');
  assert.equal(status.available, true);
  assert.equal(status.version, 'FreeCAD 1.1.1 Revision: 20260414 (Git shallow)');
  assert.equal(status.execution_lane, 'native');
  assert.deepEqual(calls[0], { command: fs.realpathSync(binary), args: ['--version'] });
});

test('meshyStatus discovers API key configuration via environment', () => {
  const noKey = meshyStatus({ env: {} });
  assert.equal(noKey.available, false);
  assert.equal(noKey.source, 'none');
  assert.equal(noKey.execution_lane, 'cloud_byok');

  const withKey = meshyStatus({ env: { MESHY_API_KEY: 'msy_test_secret_key' } });
  assert.equal(withKey.available, true);
  assert.equal(withKey.source, 'env');
  assert.equal(withKey.version, 'v2-api');
});

test('mujocoStatus returns browser WASM bundled capability', () => {
  const status = mujocoStatus();
  assert.equal(status.tool, 'mujoco');
  assert.equal(status.available, true);
  assert.equal(status.execution_lane, 'browser_wasm');
});

test('discoverAllCadTools aggregates deterministic receipts across engines', async (t) => {
  const { binary: openscad } = makeFixture(t, 'openscad');
  const { binary: freecad } = makeFixture(t, 'FreeCADCmd');
  const { binary: blender } = makeFixture(t, 'blender');

  const report = await discoverAllCadTools({
    openscadBin: openscad,
    freecadBin: freecad,
    blenderBin: blender,
    env: { MESHY_API_KEY: 'test_key' },
    runProcessImpl: async (command, args) => {
      if (args[0] === '-v') return { code: 0, stdout: '', stderr: 'OpenSCAD version 2026.04.26\n' };
      if (command.includes('FreeCAD')) return { code: 0, stdout: 'FreeCAD 1.1.1 Revision: 20260414\n', stderr: '' };
      return { code: 0, stdout: 'Blender 5.0.1\n', stderr: '' };
    },
  });

  assert.equal(report.schema_version, 1);
  assert.equal(report.total_tools, 5);
  assert.equal(report.available_tools, 5);
  assert.equal(report.all_systems_ready, true);
  assert.equal(report.tools.length, 5);
});
