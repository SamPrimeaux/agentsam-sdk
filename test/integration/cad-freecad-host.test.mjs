import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverFreeCadHost, freeCadAdapterCommand, freeCadHostEnvironment } from '../../src/lib/cad/freecad-host.js';
import { FREECAD_ADAPTER_PATH, freeCadBuild } from '../../src/lib/cad/freecad.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { cases } = JSON.parse(fs.readFileSync(path.join(root, 'python/tests/fixtures/freecad_host_cases.json'), 'utf8'));

test('Node discovery matches the fixture the Python SDK replays (no drift between the two ports)', () => {
  for (const item of cases) {
    const files = new Set(item.files);
    const host = discoverFreeCadHost({
      platform: item.platform,
      env: item.env,
      exists: candidate => files.has(candidate),
      which: name => item.which[name] ?? null,
    });
    const expected = item.expect && {
      executable: item.expect.executable, mode: item.expect.mode, platform: item.expect.platform,
      source: item.expect.source, libraryDir: item.expect.library_dir,
    };
    assert.deepEqual(host, expected, item.name);
  }
});

test('command mode hands the unmodified adapter its argv through a trampoline; python mode is direct', () => {
  const adapter = '/srv/it\'s a "path"/adapter.py';
  const direct = freeCadAdapterCommand({ executable: '/fc/python', mode: 'python' }, adapter, '/tmp/r.json', 'inspect');
  assert.deepEqual(direct, ['/fc/python', adapter, '--operation', 'inspect', '--request', '/tmp/r.json']);
  const [executable, flag, code] = freeCadAdapterCommand({ executable: '/fc/freecadcmd', mode: 'command' }, adapter, '/tmp/r.json');
  assert.equal(executable, '/fc/freecadcmd');
  assert.equal(flag, '-c');
  assert.ok(!code.includes('--pass'), 'FreeCADCmd --pass forwards only one value');
  // The trampoline must be valid Python that rebuilds the exact argv, whatever quotes the paths contain.
  const check = spawnSync('python3', ['-I', '-c', code.replace(/runpy\.run_path\(.*\)$/, 'print(__import__("json").dumps(sys.argv))')], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(JSON.parse(check.stdout), [adapter, '--operation', 'build', '--request', '/tmp/r.json']);
});

test('host environment carries identity, offscreen Qt and the library path', () => {
  const env = freeCadHostEnvironment({ platform: 'linux', libraryDir: '/usr/lib/freecad/lib' }, { HOME: '/home/u', PYTHONPATH: '/x' });
  assert.equal(env.PYTHONPATH, '/usr/lib/freecad/lib:/x');
  assert.equal(env.QT_QPA_PLATFORM, 'offscreen');
  assert.equal(env.USER, 'u');
  assert.equal(env.FREECAD_USER_HOME, '/home/u');
});

test('the adapter Node runs is the one inside the Python SDK package', () => {
  assert.ok(FREECAD_ADAPTER_PATH.endsWith(path.join('python', 'agentsam_sdk', 'cad', 'adapters', 'freecad.py')));
  assert.ok(fs.existsSync(FREECAD_ADAPTER_PATH));
});

test('live: a real build runs through every installed host mode and the geometry is dimensionally right', async t => {
  const found = discoverFreeCadHost();
  if (!found) return t.skip('FreeCAD is not installed here');
  const hosts = [found];
  for (const name of ['FreeCADCmd', 'freecadcmd', 'FreeCADCmd.exe']) {
    const sibling = path.join(path.dirname(found.executable), name);
    if (found.mode === 'python' && fs.existsSync(sibling)) {
      hosts.push({ ...found, executable: sibling, mode: 'command' });
      break;
    }
  }
  for (const host of hosts) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-host-'));
    try {
      const saved = { ...process.env };
      // Pin discovery to this host so freeCadBuild exercises exactly the mode under test.
      process.env[host.mode === 'command' ? 'AGENTSAM_FREECAD_CMD' : 'AGENTSAM_FREECAD_PYTHON'] = host.executable;
      if (host.libraryDir) process.env.AGENTSAM_FREECAD_LIB = host.libraryDir;
      if (host.mode === 'command') delete process.env.AGENTSAM_FREECAD_PYTHON;
      let result;
      try {
        result = await freeCadBuild({
          recipe: { operations: [{ op: 'box', name: 'b', length: 2, width: 3, height: 4 }] },
          output: path.join(directory, 'box.step'), format: 'step', cwd: directory,
        });
      } finally {
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
      }
      assert.equal(result.ok, true, host.mode);
      assert.ok(Math.abs(result.metrics.volume - 24) < 1e-6, `${host.mode} volume ${result.metrics.volume}`);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});
