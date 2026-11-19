import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseBrowserFsaIDEWorkspace,
  restoreBrowserFsaIDEWorkspace,
  reconnectBrowserFsaIDEWorkspace,
} from '../dist/workspace/browser-fsa.js';

test('a persisted browser folder is scoped by account and never prompts permission on load', async () => {
  const before = {
    window: globalThis.window,
    indexedDB: globalThis.indexedDB,
    localStorage: globalThis.localStorage,
  };
  let permission = 'prompt';
  let prompts = 0;
  let pickers = 0;
  const records = new Map();
  const database = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction() {
      const tx = {
        objectStore() {
          return {
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = records.get(key);
                request.onsuccess?.();
              });
              return request;
            },
            put(value, key) {
              queueMicrotask(() => {
                records.set(key, value);
                tx.oncomplete?.();
              });
            },
          };
        },
      };
      return tx;
    },
  };
  const folder = {
    kind: 'directory',
    name: 'project-alpha',
    async *entries() {},
    async queryPermission() { return permission; },
    async requestPermission() { prompts += 1; permission = 'granted'; return permission; },
  };
  const names = new Map();
  try {
    globalThis.window = {
      async showDirectoryPicker() { pickers += 1; return folder; },
    };
    globalThis.localStorage = {
      getItem(key) { return names.get(key) ?? null; },
      setItem(key, value) { names.set(key, value); },
    };
    globalThis.indexedDB = {
      open() {
        const request = { result: database };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    };
    const chosen = await chooseBrowserFsaIDEWorkspace('account-a');
    assert.equal(chosen.name, 'project-alpha');
    assert.equal(prompts, 1);
    assert.equal(pickers, 1);

    permission = 'prompt'; // A new page load must not request permission.
    const pending = await restoreBrowserFsaIDEWorkspace('account-a');
    assert.equal(pending.name, 'project-alpha');
    assert.equal(pending.workspace, null);
    assert.equal(pending.handle, folder);
    assert.equal(prompts, 1);
    assert.equal(await restoreBrowserFsaIDEWorkspace('account-b'), null);

    const resumed = await reconnectBrowserFsaIDEWorkspace('account-a', pending.handle);
    assert.equal(resumed.name, 'project-alpha');
    assert.equal(prompts, 2);
    assert.equal(pickers, 1); // Direct handle reconnect, no second picker.
    assert.ok((await restoreBrowserFsaIDEWorkspace('account-a')).workspace);
    assert.equal(await restoreBrowserFsaIDEWorkspace('account-b'), null);
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
