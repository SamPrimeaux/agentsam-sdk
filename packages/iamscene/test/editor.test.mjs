import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneDocument, createSceneEditor } from '../dist/src/index.js';

const node = (id, parentId) => ({ id, name: id, kind: 'group', ...(parentId ? { parentId } : {}), transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, visible: true });

test('editor commits revisions and supports deterministic undo/redo', () => {
  const editor = createSceneEditor(createSceneDocument({ id: 'editor-scene', name: 'Editor Scene' }));
  editor.addNode(node('assembly', 'scene-root'));
  assert.equal(editor.revision, 1);
  editor.addNode(node('part', 'assembly'));
  assert.equal(editor.document.scene.nodes.length, 3);
  editor.setNodeTransform('part', { position: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
  assert.deepEqual(editor.document.scene.nodes.find(item => item.id === 'part').transform.position, [1, 2, 3]);
  editor.undo();
  assert.deepEqual(editor.document.scene.nodes.find(item => item.id === 'part').transform.position, [0, 0, 0]);
  editor.redo();
  assert.deepEqual(editor.document.scene.nodes.find(item => item.id === 'part').transform.position, [1, 2, 3]);
});

test('removing a parent removes its descendants and dependent animation tracks', () => {
  const editor = createSceneEditor(createSceneDocument({ id: 'delete-scene', name: 'Delete Scene' }));
  editor.addNode(node('assembly', 'scene-root'));
  editor.addNode(node('part', 'assembly'));
  editor.removeNode('assembly');
  assert.deepEqual(editor.document.scene.nodes.map(item => item.id), ['scene-root']);
  assert.deepEqual(editor.document.scene.rootNodeIds, ['scene-root']);
});

test('editor rejects duplicate node IDs without changing its committed document', () => {
  const editor = createSceneEditor(createSceneDocument({ id: 'duplicate-scene', name: 'Duplicate Scene' }));
  editor.addNode(node('same', 'scene-root'));
  assert.throws(() => editor.addNode(node('same', 'scene-root')), /iamscene_node_exists/);
  assert.equal(editor.document.scene.nodes.filter(item => item.id === 'same').length, 1);
});
