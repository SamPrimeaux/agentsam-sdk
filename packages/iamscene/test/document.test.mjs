import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneDocument, parseSceneDocument, serializeSceneDocument, validateSceneDocument } from '../dist/src/index.js';

test('creates, validates and round-trips a canonical v1 scene document', () => {
  const document = createSceneDocument({ id: 'portable-scene', name: 'Portable Scene' });
  assert.equal(document.format, 'iamscene');
  assert.equal(document.formatVersion, '1.0.0');
  assert.equal(validateSceneDocument(document).valid, true);
  const serialized = serializeSceneDocument(document);
  const reopened = parseSceneDocument(serialized);
  assert.deepEqual(reopened, document);
});

test('rejects duplicate identities, broken references and scene hierarchy cycles', () => {
  const document = createSceneDocument({ id: 'invalid-scene', name: 'Invalid Scene' });
  document.scene.nodes.push({ id: 'child', name: 'Child', kind: 'group', parentId: 'missing', transform: {}, visible: true });
  document.scene.nodes.push({ id: 'child', name: 'Duplicate', kind: 'group', parentId: 'scene-root', transform: {}, visible: true });
  const result = validateSceneDocument(document);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.keyword === 'uniqueId'));
  assert.ok(result.errors.some(error => error.message.startsWith('unknown_parent:')));
});

test('rejects executable or unknown document versions instead of silently coercing them', () => {
  const document = createSceneDocument({ id: 'version-scene', name: 'Version Scene' });
  document.formatVersion = '9.0.0';
  assert.throws(() => serializeSceneDocument(document), /iamscene_document_invalid/);
});
