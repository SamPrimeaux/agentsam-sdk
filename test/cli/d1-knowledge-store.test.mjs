import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openD1Store } from '../../src/knowledge/stores/d1.js';

// Fake wrangler: executes the SQL against an in-memory SQLite so the real SQL is exercised.
function fakeRunner() {
  const db = new DatabaseSync(':memory:');
  const calls = [];
  const runner = async (_bin, args) => {
    const sql = args.includes('--file') ? (await import('node:fs')).readFileSync(args[args.indexOf('--file') + 1], 'utf8') : args[args.indexOf('--command') + 1];
    calls.push(sql);
    const blocks = [];
    for (const stmt of sql.split(/;\n|;$/).map((x) => x.trim()).filter(Boolean)) {
      if (/^\s*(SELECT)/i.test(stmt)) blocks.push({ success: true, results: db.prepare(stmt).all(), meta: { changes: 0 } });
      else { const r = db.prepare(stmt).run(); blocks.push({ success: true, results: [], meta: { changes: Number(r.changes) } }); }
    }
    return { stdout: JSON.stringify(blocks) };
  };
  return { runner, calls };
}
const target = { root: process.cwd(), storage: { database: 'my-db' } };
const gen = (id, big = '') => ({ id, scope_key: 's1', created_at: '2026-11-22T00:00:00Z', files: [{ p: 'a' }], chunks: [{ text: `é'"${big}` }], config: { embedding: { provider: 'none', model: 'none' }, scope: { name: 'x' } } });

test('publish/active round trip with large, non-ASCII, quote-heavy payloads', async () => {
  const { runner, calls } = fakeRunner();
  const store = await openD1Store(target, { runner });
  const g = gen('g1', 'x'.repeat(200_000));
  await store.publish(g, null);
  assert.deepEqual(await store.active('s1'), g);
  assert.ok(calls.every((c) => Math.max(...c.split('\n').map((l) => l.length)) < 100_000), 'every statement under D1 100KB limit');
  assert.equal((await store.scopeStatus('s1')).active_id, 'g1');
  assert.deepEqual((await store.historicalSummaries())[0], { scope_key: 's1', generation_id: 'g1', created_at: g.created_at, files: 1, chunks: 1, provider: 'none', model: 'none', embedded: false, source_scope: { name: 'x' }, active: true });
});

test('publish is compare-and-swap', async () => {
  const { runner } = fakeRunner();
  const store = await openD1Store(target, { runner });
  await store.publish(gen('g1'), null);
  await assert.rejects(() => store.publish(gen('g2'), null), /concurrently/);
  await store.publish(gen('g2'), 'g1');
  assert.equal((await store.active('s1')).id, 'g2');
  assert.equal((await store.history('s1')).length, 2);
});

test('cache and observations', async () => {
  const { runner } = fakeRunner();
  const store = await openD1Store(target, { runner });
  await store.cachePut('k', { v: [1, 2] });
  assert.deepEqual(await store.cacheGet('k'), { v: [1, 2] });
  assert.equal(await store.cacheGet('missing'), null);
  await store.observe('ns', { id: 'o1', created_at: '2026-01-01', note: "it's" });
  assert.deepEqual(await store.observations('ns'), [{ id: 'o1', created_at: '2026-01-01', note: "it's" }]);
});

test('read-only open of an empty database returns null; no database name is rejected', async () => {
  const { runner } = fakeRunner();
  assert.equal(await openD1Store(target, { runner, readOnly: true }), null);
  await assert.rejects(() => openD1Store({ root: '.', storage: {} }, { runner }), /requires_database/);
});
