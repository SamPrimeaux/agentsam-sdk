import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSqliteAdapter } from '../src/adapters/sqlite.js';

describe('createSqliteAdapter', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsam-db-'));
  const path = join(dir, 'test.sqlite');
  /** @type {ReturnType<typeof createSqliteAdapter> & { close?: () => void }} */
  let adapter;

  after(() => {
    try {
      adapter?.close?.();
    } catch {
      /* ignore */
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('opens local sqlite, creates table, queries, mutates', async () => {
    adapter = createSqliteAdapter({ path, id: 'test-local' });
    assert.equal(adapter.dialect, 'sqlite');
    assert.equal(adapter.capabilities().rowMutations, true);

    await adapter.applyMigration(`
      CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);
    `);

    const tables = await adapter.listTables();
    assert.ok(tables.some((t) => t.name === 'notes'));

    await adapter.insert({ table: 'notes', values: { id: 1, body: 'hello' } });
    const result = await adapter.query({ sql: 'SELECT id, body FROM notes ORDER BY id' });
    assert.deepEqual(result.columns, ['id', 'body']);
    assert.deepEqual(result.rows, [[1, 'hello']]);

    await adapter.update({ table: 'notes', values: { body: 'world' }, where: { id: 1 } });
    const again = await adapter.query({ sql: 'SELECT body FROM notes WHERE id = ?', params: [1] });
    assert.equal(again.rows[0][0], 'world');

    const health = await adapter.health();
    assert.equal(health.status, 'ok');
  });
});
