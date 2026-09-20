import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  openScadCompile,
  validateOpenScadSource,
  freeCadBuild,
  freeCadInspect,
  blenderBuild,
  blenderInspect,
  blenderExport,
  discoverAllCadTools,
} from '../../src/lib/cad/index.js';

// These tests exercise real local CAD/3D engine binaries (OpenSCAD, FreeCAD,
// Blender). They are not installed on the generic CI runner and are heavy
// desktop applications — deliberately not force-installed there (matches
// the local-first storage/tooling stance elsewhere in this repo). Each
// execution test below skips itself with a clear reason when its engine
// isn't present, rather than failing CI for an environment gap. On a
// machine that has the tool installed (e.g. local dev), the test runs for
// real with the full original assertions, unchanged.
const cadReport = await discoverAllCadTools();
const toolAvailable = (name) => cadReport.tools.find((t) => t.tool === name)?.available === true;

test('CAD Tool Discovery identifies local engines on the machine (schema is always validated; per-tool availability is informational)', async () => {
  const report = await discoverAllCadTools();
  assert.equal(report.schema_version, 1);
  assert.ok(report.total_tools >= 5);

  for (const toolName of ['openscad', 'freecad', 'blender']) {
    const tool = report.tools.find((t) => t.tool === toolName);
    assert.ok(tool, `${toolName} entry missing from discovery report`);
    assert.equal(typeof tool.available, 'boolean');
    if (tool.available) {
      assert.ok(tool.binary, `${toolName} reported available but has no binary path`);
      assert.ok(tool.version, `${toolName} reported available but has no version`);
    } else {
      assert.ok(tool.install_guidance, `${toolName} reported unavailable but has no install_guidance`);
    }
  }
});

test('OpenSCAD execution rejects security-violating scripts', async () => {
  assert.throws(
    () => validateOpenScadSource('use <child_process>;'),
    /Security Violation/
  );
  assert.throws(
    () => validateOpenScadSource('exec("cat /etc/passwd");'),
    /Security Violation/
  );
  assert.throws(
    () => validateOpenScadSource('import("../../secret.scad");'),
    /Security Violation/
  );
});

test('OpenSCAD real compilation produces watertight geometry and returns typed receipt', { skip: !toolAvailable('openscad') && 'openscad binary not available on this machine' }, async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-openscad-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const source = `
    difference() {
      cube([width, depth, height], center=true);
      cylinder(h=height + 2, r=holeRadius, center=true, $fn=24);
    }
  `;

  const result = await openScadCompile({
    source,
    outputFormat: 'stl',
    parameters: {
      width: 30,
      depth: 20,
      height: 10,
      holeRadius: 4,
    },
    filename: 'flange.stl',
  });

  assert.equal(result.success, true);
  assert.equal(result.engine, 'openscad-native');
  assert.equal(result.filename, 'flange.stl');
  assert.equal(result.outputFormat, 'stl');
  assert.equal(result.mimeType, 'model/stl');
  assert.ok(result.sizeBytes > 0);
  assert.ok(result.artifactContent.includes('solid OpenSCAD_Model'));
  assert.ok(result.artifactContent.includes('facet normal'));
  assert.ok(result.artifactContent.includes('outer loop'));
  assert.ok(result.logs.some(l => l.includes('[KERNEL] OpenSCAD Native Compiler')));
});

test('FreeCAD solid kernel executes precision B-Rep operations and exports valid ISO STEP', { skip: !toolAvailable('freecad') && 'freecad binary not available on this machine' }, async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-freecad-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const stepOutput = path.join(tmpDir, 'bracket.step');

  const recipe = {
    operations: [
      { op: 'box', name: 'main_block', length: 40.0, width: 25.0, height: 12.0 },
      { op: 'cylinder', name: 'bore', radius: 5.0, height: 14.0, translate: [20.0, 12.5, -1.0] },
      { op: 'cut', base: 'main_block', tool: 'bore' },
    ],
  };

  const buildResult = await freeCadBuild({
    recipe,
    output: stepOutput,
    format: 'step',
  });

  assert.equal(buildResult.ok, true);
  assert.equal(buildResult.capability, 'freecad.build');
  assert.equal(buildResult.format, 'step');
  assert.ok(buildResult.sizeBytes > 0);
  assert.ok(fs.existsSync(stepOutput));

  // Verify solid shape metrics
  const expectedSolidVolume = 40.0 * 25.0 * 12.0 - Math.PI * 25.0 * 12.0;
  assert.ok(Math.abs(buildResult.metrics.volume - expectedSolidVolume) < 1.0, 'Volume matches geometry');
  assert.equal(buildResult.metrics.faces_count, 7);

  // Read raw STEP content to verify ISO-10303 signature
  const stepText = fs.readFileSync(stepOutput, 'utf8');
  assert.ok(stepText.includes('ISO-10303-21;'));
  assert.ok(stepText.includes('Open CASCADE STEP processor'));

  // Inspect the exported STEP file using FreeCAD inspection
  const inspectResult = await freeCadInspect({ input: stepOutput });
  assert.equal(inspectResult.ok, true);
  assert.equal(inspectResult.capability, 'freecad.inspect');
  assert.ok(Math.abs(inspectResult.metrics.volume - expectedSolidVolume) < 1.0);
  assert.equal(inspectResult.metrics.faces_count, 7);
});

test('Blender real execution builds, inspects, and exports production 3D assets', { skip: !toolAvailable('blender') && 'blender binary not available on this machine' }, async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-blender-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const blendPath = path.join(tmpDir, 'scene.blend');
  const glbPath = path.join(tmpDir, 'scene.glb');

  const recipe = {
    schema_version: 1,
    operations: [
      { op: 'clear_scene' },
      { op: 'add', primitive: 'cylinder', name: 'Pillar', radius: 1.5, depth: 4.0 },
      { op: 'add_light', light_type: 'SUN', energy: 2.5 },
    ],
  };

  // 1. Build .blend file
  const buildResult = await blenderBuild({
    recipe,
    output: blendPath,
  });

  assert.equal(buildResult.ok, true);
  assert.equal(buildResult.capability, 'blender.build');
  assert.ok(fs.existsSync(blendPath));
  assert.ok(buildResult.objects.includes('Pillar'));

  // 2. Inspect built scene
  const inspectResult = await blenderInspect({ input: blendPath });
  assert.equal(inspectResult.ok, true);
  assert.equal(inspectResult.capability, 'blender.inspect');
  assert.ok(inspectResult.scene.objects.some(o => o.name === 'Pillar'));

  // 3. Export to GLB
  const exportResult = await blenderExport({
    input: blendPath,
    output: glbPath,
    format: 'glb',
  });

  assert.equal(exportResult.ok, true);
  assert.equal(exportResult.capability, 'blender.export');
  assert.ok(fs.existsSync(glbPath));
  assert.ok(fs.statSync(glbPath).size > 0);
});
