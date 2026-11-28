import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const modulePath = new URL('../src/creative-artifact-store.ts', import.meta.url);
async function loadStore() {
  const result = await build({ entryPoints: [modulePath.pathname], bundle: true, platform: 'node', format: 'esm', write: false });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const artifact = {
  id: 'canvas_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  type: 'page',
  workspace: 'page',
  name: 'To-do List',
  createdAt: '2026-11-27T00:00:00.000Z',
  updatedAt: '2026-11-27T00:00:00.000Z',
  data: { title: 'To-do List', subtitle: '', blocks: [] },
};

test('creative artifact loader reopens the existing private Canvas artifact lifecycle', async () => {
  const store = await loadStore();
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/work/canvases?workspace=creative') {
      return Response.json({ ok: true, canvases: [{ id: artifact.id, contentHash: 'a'.repeat(64), revision: 2 }] });
    }
    return Response.json({ ok: true, document: { creativeWorkspace: { schema: 'agentsam.creative-workspace.v1', artifact } } });
  };
  const loaded = await store.loadCreativeArtifacts(fetcher);
  assert.deepEqual(loaded.artifacts, [artifact]);
  assert.equal(loaded.records.get(artifact.id).revision, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, '/api/work/canvases/' + artifact.id);
});

test('creative artifact create and update use optimistic concurrency and preserve native type', async () => {
  const store = await loadStore();
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    return Response.json({ ok: true, canvas: { contentHash: 'b'.repeat(64), revision: calls.length } });
  };
  const created = await store.persistCreativeArtifact(artifact, undefined, fetcher);
  assert.equal(calls[0].options.method, 'POST');
  const createBody = JSON.parse(calls[0].options.body);
  assert.equal(createBody.document.creativeWorkspace.artifact.type, 'page');
  assert.equal(createBody.document.creativeWorkspace.artifact.data.title, 'To-do List');
  const updated = await store.persistCreativeArtifact({ ...artifact, name: 'My To-do List' }, created, fetcher);
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[1].options.headers['if-match'], '"' + 'b'.repeat(64) + '"');
  assert.equal(JSON.parse(calls[1].options.body).document.name, 'My To-do List');
  assert.equal(updated.revision, 2);
});

test('creative artifact deletion archives through the same artifact API with its current ETag', async () => {
  const store = await loadStore();
  let request;
  const fetcher = async (url, options = {}) => {
    request = { url, options };
    return Response.json({ ok: true, archived: true });
  };
  await store.archiveCreativeArtifact(artifact.id, { contentHash: 'c'.repeat(64), revision: 1, snapshot: '' }, fetcher);
  assert.equal(request.options.method, 'DELETE');
  assert.equal(request.options.headers['if-match'], '"' + 'c'.repeat(64) + '"');
});
