import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { createPostgresStore, defaultConfig, runIndex, retrieve, scopeKey } from '../src/knowledge/index.js';

test('real Postgres/pgvector schema, exact retrieval, profile isolation and publication rollback', async t => {
  const db = new PGlite({ extensions: { vector } });
  // PGlite exposes the same parameterized SQL execution; exec supports DDL batches.
  const store = createPostgresStore({ query: (sql, params) => params ? db.query(sql, params) : db.exec(sql).then(results => results.at(-1)), end: () => db.close() });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-pg-'));
  t.after(async () => { await store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  await store.setup(); await store.setup();
  fs.writeFileSync(path.join(root, 'math.ts'), 'export function add(a: number, b: number) { return a + b; }\nexport const name = "math";');
  const config = defaultConfig();
  config.embedding = { provider: 'fixture', model: 'vector-test', revision: '1', dimensions: 3, parameters: {} };
  const embedder = { async embed(text) { return text.includes('add') ? [1, 0, 0] : [0, 1, 0]; } };
  const first = await runIndex({ root, config, store, embedder, embed: true });
  const result = await retrieve({ config, store, embedder, text: 'add', semantic: true });
  assert.equal(result.hits[0].metadata.symbol, 'add'); assert.equal(result.hits[0].score, 1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM agentsam_knowledge.cache WHERE embedding IS NOT NULL')).rows[0].n, 2);
  assert.equal((await runIndex({ root, config, store, embedder, embed: true })).embedding_inputs, 0);
  // A different-dimensional profile in the same table must not break retrieval.
  await store.cachePut('foreign:vector:other', [1, 0, 0, 0]);
  assert.equal((await retrieve({ config, store, embedder, text: 'add', semantic: true })).hits[0].score, 1);
  const generation = await store.active(scopeKey(config));
  await assert.rejects(store.publish({ ...generation, id: 'bad-cas' }, 'wrong-parent'), /concurrently/);
  assert.equal((await store.active(scopeKey(config))).id, first.generation_id);
  // Force SQL failure after the CAS check; the old generation remains visible.
  await assert.rejects(store.publish(generation, generation.id), /duplicate key/);
  assert.equal((await store.active(scopeKey(config))).id, first.generation_id);
  assert.equal((await store.history(scopeKey(config))).length, 1);
  const observation = { id: 'obs-1', created_at: new Date().toISOString(), data: { files: 1 } };
  await store.observe('customer', observation);
  assert.deepEqual(await store.observations('customer'), [observation]);
  assert.deepEqual(await store.observations('another-customer'), []);
});
