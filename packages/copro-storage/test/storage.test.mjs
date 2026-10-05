import test from "node:test";
import assert from "node:assert/strict";
import { createCoProProject } from "../../copro-project/src/index.js";
import { MemoryProjectStore, BrowserLocalStorageProjectStore } from "../src/index.js";

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
