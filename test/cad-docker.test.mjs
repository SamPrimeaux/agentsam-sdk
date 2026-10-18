import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDockerizeArgs } from '../src/commands/dockerize.js';
import {
  CAD_PINS,
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

test('production tools (ifc, media, occt) are allowlisted and ride along with "all"', () => {
  for (const tool of ['ifc', 'media', 'occt']) assert.ok(CAD_TOOLS.includes(tool), tool);
  assert.deepEqual(normalizeCadTools('ifc,occt'), ['ifc', 'occt']);
  assert.throws(() => normalizeCadTools('cadquery'), /Unknown CAD tool/);
});

test('all-tools image pins every production dependency and verifies Node by checksum', () => {
  const { dockerfile } = generateCadDocker({ appSlug: 'agentsam-cad', tools: 'all' });
  assert.match(dockerfile, new RegExp(`ifcopenshell==${CAD_PINS.ifcopenshell.replaceAll('.', '\\.')}`));
  assert.match(dockerfile, new RegExp(`ezdxf==${CAD_PINS.ezdxf.replaceAll('.', '\\.')}`));
  assert.match(dockerfile, new RegExp(`@gltf-transform/cli@${CAD_PINS.gltfTransformCli.replaceAll('.', '\\.')}`));
  assert.match(dockerfile, /install_node\.py v\d+\.\d+\.\d+ \/opt\/node/);
  assert.doesNotMatch(dockerfile, /pip install[^\n]*\s(ifcopenshell|ezdxf)(\s|$)/, 'no unpinned pip installs');
  assert.doesNotMatch(dockerfile, /@latest|npm install -g [^@\n]*$/m, 'no unpinned npm installs');
  assert.match(dockerfile, /AGENTSAM_CAD_PYTHON=\/opt\/agentsam-venv\/bin\/python/);
});

test('OCCT is compiled in a builder stage and only the binary reaches the runtime image', () => {
  const { dockerfile } = generateCadDocker({ appSlug: 'agentsam-cad', tools: 'occt' });
  assert.match(dockerfile, /FROM debian:bookworm-slim AS occt-build/);
  assert.match(dockerfile, /COPY --from=occt-build \/build\/agentsam-occt \/usr\/local\/bin\/agentsam-occt/);
  const runtime = dockerfile.slice(dockerfile.lastIndexOf('FROM debian:bookworm-slim\n'));
  assert.doesNotMatch(runtime, /\bg\+\+\b|\bcmake\b|libocct-[a-z-]+-dev/, 'compiler and headers stay out of the runtime image');
});

test('tool selection stays minimal: openscad-only image has no production toolchain', () => {
  const { dockerfile } = generateCadDocker({ appSlug: 'agentsam-cad', tools: 'openscad' });
  assert.doesNotMatch(dockerfile, /occt-build|ifcopenshell|gltf-transform|ffmpeg/);
});

test('stageCadContext stages the Node installer and OCCT sources only when their tools are selected', () => {
  const stage = (tools) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-stage-'));
    try {
      const context = stageCadContext(dir, { tools });
      return { installer: fs.existsSync(path.join(context, 'provision', 'install_node.py')),
        occt: fs.existsSync(path.join(context, 'occt', 'main.cpp')) && fs.existsSync(path.join(context, 'occt', 'CMakeLists.txt')) };
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  assert.deepEqual(stage('all'), { installer: true, occt: true });
  assert.deepEqual(stage('openscad'), { installer: false, occt: false });
});
