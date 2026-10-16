import test from "node:test";
import assert from "node:assert/strict";
import { createCoProProject } from "../../copro-project/src/index.js";
import { MemoryProjectStore, BrowserLocalStorageProjectStore, BrowserIndexedDbMediaStore } from "../src/index.js";

test("memory store round-trips projects", async () => {
  const store = new MemoryProjectStore();
  const project = createCoProProject({ id:"project:1", now:"2026-10-04T00:00:00.000Z" });
  await store.save(project);
  const loaded = await store.load(project.id);
  assert.deepEqual(loaded, project);
});

test("browser adapter works against Storage-compatible contract", async () => {
  const data = new Map();
  const storage = {
    get length(){ return data.size; },
    key(index){ return [...data.keys()][index] ?? null; },
    getItem(key){ return data.has(key) ? data.get(key) : null; },
    setItem(key,value){ data.set(key,String(value)); },
    removeItem(key){ data.delete(key); },
  };
  const store = new BrowserLocalStorageProjectStore({ storage, prefix:"test:" });
  const project = createCoProProject({ id:"project:browser", now:"2026-10-04T00:00:00.000Z" });
  await store.save(project);
  assert.equal((await store.loadRecent()).id, project.id);
});

function makeIndexedDbFixture() {
  const rows = new Map();
  let created = false;
  const db = {
    objectStoreNames: { contains: () => created },
    createObjectStore: () => { created = true; },
    close: () => {},
    transaction() {
      const transaction = { oncomplete: null, onabort: null, onerror: null };
      transaction.objectStore = () => {
        function requestFor(action) {
          const request = { onsuccess: null, error: null, result: undefined };
          queueMicrotask(() => {
            request.result = action();
            request.onsuccess?.({ target: request });
            queueMicrotask(() => transaction.oncomplete?.());
          });
          return request;
        }
        return {
          put: (entry) => requestFor(() => { rows.set(entry.id, structuredClone(entry)); return entry.id; }),
          get: (id) => requestFor(() => rows.get(id)),
          getAll: () => requestFor(() => [...rows.values()]),
          delete: (id) => requestFor(() => rows.delete(id)),
        };
      };
      return transaction;
    },
  };
  return {
    open: () => {
      const request = { onupgradeneeded: null, onsuccess: null, onerror: null, result: db };
      queueMicrotask(() => { if (!created) request.onupgradeneeded?.(); request.onsuccess?.(); });
      return request;
    },
  };
}

test('IndexedDB media source preserves actual Blob bytes after reopening the store', async () => {
  const factory = makeIndexedDbFixture();
  const first = new BrowserIndexedDbMediaStore({ indexedDB: factory, name: 'test-media' });
  const blob = new Blob(['original media contents'], { type: 'video/mp4' });
  await first.put({ id: 'asset:video1', name: 'bug-reproduction.mp4', kind: 'video', file: blob, durationUs: 5_000_000 });
  const reopened = new BrowserIndexedDbMediaStore({ indexedDB: factory, name: 'test-media' });
  const saved = await reopened.get('asset:video1');
  assert.equal(saved.id, 'asset:video1');
  assert.equal(saved.name, 'bug-reproduction.mp4');
  assert.equal(saved.durationUs, 5_000_000);
  assert.equal(saved.file.type, 'video/mp4');
  assert.equal(await saved.file.text(), 'original media contents');
  assert.equal((await reopened.list()).length, 1);
  await reopened.remove('asset:video1');
  assert.equal(await reopened.get('asset:video1'), null);
});

test('IndexedDB media store reports unsupported browsers', () => {
  assert.throws(() => new BrowserIndexedDbMediaStore({ indexedDB: null }), /copro_media_indexeddb_unavailable/);
});
