import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IAMGEOMETRY_MEDIA_TYPE, parseIAMGeometry, serializeIAMGeometry,
  getIAMGeometryRender, createSceneDocument, createSceneEditor,
} from '../dist/src/index.js';

const source = () => ({
  format: 'iamgeometry',
  formatVersion: '1.0.0',
  id: 'chair-variant-a',
  name: 'Chair',
  units: 'mm',
  source: { schema: 'cad.project.v2', uri: './chair-project.json', elementId: 'chair-01', revision: 2 },
  defaultRenderId: 'web',
  representations: [
    { id: 'cad', role: 'source', format: 'brep', uri: './chair.brep' },
    { id: 'web', role: 'render', format: 'glb', uri: './chair.glb', sha256: 'a'.repeat(64) },
    { id: 'mobile', role: 'lod', format: 'gltf', uri: './chair-low.gltf', lod: 1 },
  ],
});

test('IAMGeometry manifest retains native source and portable render representations', () => {
  const initial = source();
  const doc = parseIAMGeometry(serializeIAMGeometry(initial));
  assert.deepEqual(doc, initial);
  assert.equal(getIAMGeometryRender(doc).uri, './chair.glb');
  doc.representations[0].uri = 'changed';
  assert.equal(initial.representations[0].uri, './chair.brep');
});

test('IAMGeometry rejects duplicate representations, unknown formats and unrenderable manifests', () => {
  const duplicate = source();
  duplicate.representations.push({ ...duplicate.representations[0] });
  assert.throws(() => parseIAMGeometry(duplicate), /representation_invalid/);
  const badFormat = source();
  badFormat.representations[1].format = 'internal-renderer';
  assert.throws(() => parseIAMGeometry(badFormat), /representation_invalid/);
  const badDefault = source();
  badDefault.defaultRenderId = 'cad';
  assert.throws(() => parseIAMGeometry(badDefault), /render_representation_invalid/);
  const stale = source();
  stale.formatVersion = '2.0.0';
  assert.throws(() => parseIAMGeometry(stale), /version_unsupported/);
});

test('scene editor switches .iamgeometry assets without changing node identity, placement or undo history', () => {
  const scene = createSceneDocument({ id: 'design', name: 'Design' });
  scene.assets.push(
    { id: 'chair-a', uri: './chairs/wood.iamgeometry', mediaType: IAMGEOMETRY_MEDIA_TYPE, role: 'geometry-source' },
    { id: 'chair-b', uri: './chairs/metal.iamgeometry', mediaType: IAMGEOMETRY_MEDIA_TYPE, role: 'geometry-source' },
  );
  scene.scene.nodes.push({
    id: 'chair-instance', name: 'Chair',
    kind: 'mesh', parentId: 'scene-root',
    assetRef: 'chair-a', materialRef: undefined,
    transform: { position: [2, 3, 4], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    visible: true,
  });
  const editor = createSceneEditor(scene);
  editor.setNodeGeometryAsset('chair-instance', 'chair-b');
  let node = editor.document.scene.nodes.find(n => n.id === 'chair-instance');
  assert.equal(node.assetRef, 'chair-b');
  assert.deepEqual(node.transform.position, [2, 3, 4]);
  assert.equal(node.parentId, 'scene-root');
  editor.undo();
  node = editor.document.scene.nodes.find(n => n.id === 'chair-instance');
  assert.equal(node.assetRef, 'chair-a');
  editor.redo();
  assert.equal(editor.document.scene.nodes.find(n => n.id === 'chair-instance').assetRef, 'chair-b');
  assert.throws(() => editor.setNodeGeometryAsset('chair-instance', 'missing'), /asset_not_found/);
  assert.equal(editor.document.scene.nodes.find(n => n.id === 'chair-instance').assetRef, 'chair-b');
});
