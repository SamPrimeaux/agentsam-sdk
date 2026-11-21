import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  listLiveAstFiles,
  searchLiveAst,
  matchLiveAst,
  createLiveAstRepositoryProvider,
} from '../src/indexing/live-ast.js';
import { assertRepositoryKnowledgeProvider } from '../src/indexing/provider.js';
import { inspectLiveGltf } from '../src/indexing/live-resource-graph.js';
import { inspectLiveCadProject } from '../src/indexing/live-cad-graph.js';
import { createCadProjectV2 } from '../src/lib/cad/project-v2.js';

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-live-ast-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'sample.ts'), [
    'export class Shape {',
    '  extrude() { return helper(); }',
    '}',
    'export function helper() { return 3; }',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'src', 'module.py'), 'def create_wall(height):\n    return height\n');
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, 'node_modules', 'ignored.ts'), 'function missingNode() {}');
  return root;
}

test('live TS AST finds symbols without git, init config, D1, SQLite, or index generation', (t) => {
  const root = project(t);
  const out = searchLiveAst(root, 'Shape', { path: 'src', edges: true });
  assert.equal(out.ok, true);
  assert.equal(out.index_required, false);
  assert.equal(out.matches[0].name, 'Shape');
  assert.equal(out.matches[0].path, 'src/sample.ts');
  assert.equal(out.matches[0].kind, 'ClassDeclaration');
  assert.equal(out.scanned_files, 1);
  assert.equal(fs.existsSync(path.join(root, '.agentsam')), false);
  assert.equal(listLiveAstFiles(root).files.includes('node_modules/ignored.ts'), false);
});

test('live AST provider satisfies portable knowledge contract without persistent snapshot', async (t) => {
  const root = project(t);
  const provider = assertRepositoryKnowledgeProvider(createLiveAstRepositoryProvider(root));
  const status = await provider.status();
  assert.equal(status.index_required, false);
  assert.equal(status.semantic, false);
  const symbols = await provider.findSymbol({ name: 'helper' });
  assert.ok(symbols.matches.some((symbol) => symbol.name === 'helper'));
  const graph = await provider.graph({ query: 'Shape.extrude' });
  assert.ok(graph.edges.some((edge) => edge.to === 'helper'));
  const snapshot = await provider.snapshot();
  assert.equal(snapshot.durable, false);
});

test('live AST confines paths and refuses symlink escapes', (t) => {
  const root = project(t);
  assert.throws(() => listLiveAstFiles(root, { path: '../' }), /relative/);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-live-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'secret.ts'), 'function secret() {}');
  fs.symlinkSync(outside, path.join(root, 'src', 'outside'));
  assert.equal(searchLiveAst(root, 'secret').matches.length, 0);
  assert.throws(() => matchLiveAst(root, 'def $X($$$Y): $$$BODY', { language: 'python', path: 'src/outside' }), /outside workspace/);
});

test('invalid syntax is reported without returning misleading symbol matches', (t) => {
  const root = project(t);
  fs.writeFileSync(path.join(root, 'src', 'broken.ts'), 'export function (');
  const result = searchLiveAst(root, 'helper');
  assert.ok(result.errors.some((item) => item.path === 'src/broken.ts'));
  assert.ok(result.matches.some((item) => item.name === 'helper'));
});

test('optional ast-grep uses a real non-JS grammar on a local file', (t) => {
  const sg = spawnSync('sg', ['--version'], { encoding: 'utf8' });
  if (sg.error) return t.skip('ast-grep binary not available on this machine');
  const root = project(t);
  const out = matchLiveAst(root, 'def $NAME($$$ARGS): $$$BODY', { language: 'python', path: 'src/module.py' });
  assert.equal(out.index_required, false);
  assert.ok(out.matches.some((m) => m.captures.NAME === 'create_wall'));
});

test('ast-grep unavailable is explicit; no silent grep fallback', (t) => {
  const root = project(t);
  assert.throws(() => matchLiveAst(root, 'def $NAME($$$ARGS): $$$BODY', { language: 'python', binary: 'grep' }), /must be/);
});

test('glTF source graph preserves independently addressable scene objects and PBR materials', (t) => {
  const root = project(t);
  const gltf = {
    asset: { version: '2.0' }, scene: 0,
    scenes: [{ name: 'Building', nodes: [0] }],
    nodes: [{ name: 'Exterior Wall', mesh: 0, translation: [2, 0, 0], extras: { agentsam_id: 'wall-a' } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ name: 'Paint', pbrMetallicRoughness: { baseColorFactor: [1, 0.9, 0.8, 1], metallicFactor: 0.1 } }],
  };
  fs.writeFileSync(path.join(root, 'wall.gltf'), JSON.stringify(gltf));
  const result = inspectLiveGltf(root, 'wall.gltf');
  assert.equal(result.ok, true);
  assert.equal(result.index_required, false);
  assert.equal(result.root_scene, '/scenes/0');
  assert.equal(result.nodes.length, 4);
  const wall = result.nodes.find((n) => n.name === 'Exterior Wall');
  assert.equal(wall.locator.json_pointer, '/nodes/0');
  assert.equal(wall.persistent_id, 'wall-a');
  assert.deepEqual(wall.transform.translation, [2, 0, 0]);
  const material = result.nodes.find((n) => n.kind === 'material');
  assert.equal(material.locator.json_pointer, '/materials/0');
  assert.equal(material.pbr.metallicFactor, 0.1);
  assert.ok(result.edges.some((edge) => edge.from === '/meshes/0' && edge.to === '/materials/0' && edge.type === 'material'));
  assert.ok(result.edges.some((edge) => edge.from === '/scenes/0' && edge.to === '/nodes/0'));
  assert.deepEqual(result.diagnostics, []);
});

test('glTF resource parser reports invalid references and rejects traversal', (t) => {
  const root = project(t);
  fs.writeFileSync(path.join(root, 'bad.gltf'), JSON.stringify({
    asset: { version: '2.0' }, scenes: [{ nodes: [99] }],
  }));
  const out = inspectLiveGltf(root, 'bad.gltf');
  assert.equal(out.edges[0].resolved, false);
  assert.equal(out.diagnostics[0].code, 'broken_gltf_reference');
  assert.throws(() => inspectLiveGltf(root, '../bad.gltf'), /workspace-relative/);
});

test('canonical CAD v2 live graph preserves entity identities, relationships and units', (t) => {
  const root = project(t);
  const cad = createCadProjectV2({
    id: 'house-a', name: 'House', domain: 'general.cad', unit: 'mm',
    geometry: {
      entities: [
        { id: 'wall-1', kind: 'solid', data: { length: 3500 } },
        { id: 'mat-1', kind: 'material', data: { name: 'Plaster' } },
      ],
      relationships: [{ id: 'rel-1', from: 'wall-1', to: 'mat-1', kind: 'uses_material' }],
      constraints: [],
    },
  });
  fs.writeFileSync(path.join(root, 'cad-v2.json'), JSON.stringify({ project: cad, revision: 1 }));
  const graph = inspectLiveCadProject(root, 'cad-v2.json');
  assert.equal(graph.schema, 'cad.project.v2');
  assert.equal(graph.valid, true, JSON.stringify(graph.validation_errors));
  assert.equal(graph.units, 'mm');
  assert.ok(graph.nodes.some((n) => n.stable_id === 'wall-1' && n.locator.json_pointer === '/project/geometry/entities/0'));
  assert.ok(graph.edges.some((edge) => edge.type === 'uses_material' && edge.resolved));
  assert.equal(graph.index_required, false);
});

test('canonical CAD v1 live graph retains wall assembly layers and opening references', (t) => {
  const root = project(t);
  const p = {
    id: 'legacy-project', name: 'Legacy', scale: 1,
    walls: [{
      id: 'wall-a', x1: 0, y1: 0, x2: 120, y2: 0, thickness: 4, height3D: 96,
      assembly: { name: 'Shell', layers: [{ id: 'layer-a', name: 'Drywall', thickness: 4, material: 'drywall' }] },
    }],
    rooms: [], doors: [{
      id: 'door-a', wallId: 'wall-a', width: 36, height: 80, distanceAlongWall: 0.5,
    }],
    windows: [], furniture: [], annotations: [],
  };
  fs.writeFileSync(path.join(root, 'legacy-cad.json'), JSON.stringify(p));
  const graph = inspectLiveCadProject(root, 'legacy-cad.json');
  assert.equal(graph.schema, 'cad.project.v1');
  assert.equal(graph.valid, true, JSON.stringify(graph.validation_errors));
  assert.ok(graph.nodes.some((n) => n.stable_id === 'layer-a' && n.parent === '/walls/0'));
  assert.ok(graph.edges.some((edge) => edge.type === 'opening_of_wall' && edge.resolved));
  assert.deepEqual(graph.validation_errors, []);
});
