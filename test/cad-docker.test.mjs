import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDockerizeArgs } from '../src/commands/dockerize.js';
import {
  CAD_TOOLS,
  normalizeCadTools,
  cadDefaultResources,
  generateCadDocker,
  prepareCadDeployment,
  stageCadContext,
  cadRunArguments,
} from '../src/lib/cad-docker.js';
import { buildDockerDeployPlan, generateDockerFileSet } from '../src/lib/dockerize.js';

test('dockerize cad positional shortcut selects cad_service', () => {
  const opts = parseDockerizeArgs(['cad', '--tools', 'openscad,freecad', '--port', '9911']);
  assert.equal(opts.type, 'cad_service');
  assert.equal(opts.tools, 'openscad,freecad');
  assert.equal(opts.port, 9911);
});

test('CAD tools are allowlisted, deterministic, and all expands safely', () => {
  assert.deepEqual(normalizeCadTools(), ['openscad']);
  assert.deepEqual(normalizeCadTools('freecad,openscad,freecad'), ['openscad', 'freecad']);
  assert.deepEqual(normalizeCadTools('all'), [...CAD_TOOLS]);
  assert.throws(() => normalizeCadTools('openscad,evil-package;rm -rf /'), /Unknown CAD tool/);
});

test('CAD resource defaults scale only when heavier tools are selected', () => {
  assert.deepEqual(cadDefaultResources('openscad'), { memory: '1g', cpus: '1' });
  assert.deepEqual(cadDefaultResources('openscad,freecad'), { memory: '2g', cpus: '2' });
  assert.deepEqual(cadDefaultResources('all'), { memory: '4g', cpus: '2' });
});

test('CAD Docker generator is localhost-only, non-root, read-only and tool-selective', () => {
  const files = generateCadDocker({ appSlug: 'agentsam-cad', port: 8793, tools: 'openscad' });
  assert.match(files.dockerfile, /FROM debian:bookworm-slim/);
  assert.match(files.dockerfile, /apt-get install[^\n]*openscad/);
  assert.doesNotMatch(files.dockerfile, /apt-get install[^\n]*\bfreecad\b/);
  assert.doesNotMatch(files.dockerfile, /apt-get install[^\n]*\bblender\b/);
  assert.match(files.dockerfile, /USER cad/);
  assert.match(files.compose, /127\.0\.0\.1:8793:8793/);
  assert.match(files.compose, /read_only: true/);
  assert.match(files.compose, /cap_drop: \[ALL\]/);
  assert.match(files.compose, /no-new-privileges:true/);
  assert.match(files.compose, /\/work:rw,noexec,nosuid,size=512m,mode=1777/);
  assert.deepEqual(files.tools, ['openscad']);
});

test('CAD all-tools image includes OpenSCAD, FreeCAD and Blender packages', () => {
  const files = generateDockerFileSet('cad_service', { appSlug: 'cad-all', tools: 'all' });
  assert.match(files.dockerfile, /\bopenscad\b/);
  assert.match(files.dockerfile, /\bfreecad\b/);
  assert.match(files.dockerfile, /\bblender\b/);
});

test('CAD deploy plan uses 8793 and hash changes with selected toolchain', () => {
  const core = buildDockerDeployPlan('cad_service', { appSlug: 'agentsam-cad', tools: 'openscad' });
  const heavy = buildDockerDeployPlan('cad_service', { appSlug: 'agentsam-cad', tools: 'all' });
  assert.equal(core.hostPort, 8793);
  assert.equal(core.containerPort, 8793);
  assert.notEqual(core.hash, heavy.hash);
});

test('CAD deployment creates private token config and isolated build context', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-cad-docker-test-'));
  try {
    const prepared = prepareCadDeployment(tmp, { appSlug: 'agentsam-cad', tools: 'openscad' });
    assert.ok(fs.existsSync(prepared.tokenFile));
    assert.equal(fs.readFileSync(prepared.tokenFile, 'utf8').trim().length, 64);
    assert.deepEqual(prepared.tools, ['openscad']);

    const versionDir = path.join(tmp, '.agentsam', 'docker', 'fakehash');
    fs.mkdirSync(versionDir, { recursive: true });
    const context = stageCadContext(versionDir);
    assert.ok(fs.existsSync(path.join(context, 'server.py')));
    assert.deepEqual(fs.readdirSync(context).sort(), ['server.py']);

    const args = cadRunArguments(prepared);
    assert.ok(args.includes('--read-only'));
    assert.ok(args.includes('--cap-drop=ALL'));
    assert.ok(args.some(value => value.includes('dst=/config,readonly')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CAD service type is represented in generic dockerize registry', () => {
  const plan = buildDockerDeployPlan('cad_service', { appSlug: 'agentsam-cad' });
  assert.equal(plan.slug, 'agentsam-cad');
  assert.equal(plan.hostPort, 8793);
  assert.match(plan.files.compose, /agentsam\.type: cad_service/);
});
