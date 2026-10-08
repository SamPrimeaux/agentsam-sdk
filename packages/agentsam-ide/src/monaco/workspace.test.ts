import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceDocumentUri, disposeWorkspaceModels } from './workspace.ts';
import { createDocument, languageIdFromPath } from './model.ts';

test('distinct projects have distinct Monaco models for the same relative source file', () => {
  const a = workspaceDocumentUri({ workspaceId: 'merchant-a', path: 'src/App.tsx' });
  const b = workspaceDocumentUri({ workspaceId: 'merchant-b', path: 'src/App.tsx' });
  assert.notEqual(a, b);
  assert.ok(a.endsWith('/src/App.tsx'));
  assert.ok(b.endsWith('/src/App.tsx'));
});

test('workspace URI is stable, URI-encoded, and rejects path traversal', () => {
  const doc = { workspaceId: 'Project A / UI', path: 'pages/landing page.tsx' };
  assert.equal(workspaceDocumentUri(doc), workspaceDocumentUri(doc));
  assert.match(workspaceDocumentUri(doc), /Project%20A%20%2F%20UI\/pages\/landing%20page.tsx$/);
  assert.throws(() => workspaceDocumentUri({ workspaceId: 'x', path: '../secret' }), /ide_document_path_invalid/);
  assert.throws(() => workspaceDocumentUri({ workspaceId: '', path: 'a.ts' }), /workspace_id_required/);
});

test('document and language contracts work without importing a browser/editor', () => {
  assert.equal(createDocument('/repo/lib.ts', 'export const x = 1', 4).version, 4);
  assert.equal(languageIdFromPath('src/page.tsx'), 'typescript');
  assert.equal(languageIdFromPath('backend/handler.go'), 'go');
  assert.equal(languageIdFromPath('rust/main.rs'), 'rust');
  assert.equal(languageIdFromPath('notes.txt'), 'plaintext');
});


test('only the closed workspace releases its editor models', () => {
  const disposed: string[] = [];
  const models = ['merchant-a:src/App.tsx', 'merchant-b:src/App.tsx', 'merchant-a:README.md'].map(label => {
    const [workspaceId, path] = label.split(':');
    return { uri: { toString: () => workspaceDocumentUri({workspaceId,path}) }, dispose: () => disposed.push(label) };
  });
  const count = disposeWorkspaceModels({editor:{getModels:()=>models}}, 'merchant-a');
  assert.equal(count, 2);
  assert.deepEqual(disposed, ['merchant-a:src/App.tsx','merchant-a:README.md']);
});
