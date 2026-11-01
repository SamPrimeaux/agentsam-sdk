/**
 * Critical acceptance: a second host integrates the package without copying
 * database handlers, adapters, schema logic, or CRUD — only runtime config.
 */
import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSqliteAdapter } from '../backend/sqlite.js';
import {
  createDatabaseRequestHandler,
  withHonestCapabilities,
} from '../src/runtime/index.js';

describe('second-host integration (SQLite only)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsam-host2-'));
  const path = join(dir, 'host2.sqlite');
  /** @type {ReturnType<typeof createSqliteAdapter>} */
  let adapter;

  after(() => {
    try {
      adapter?.close?.();
    } catch {
      /* ignore */
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('powers Database Studio HTTP with only host-owned source resolution', async () => {
    adapter = withHonestCapabilities(
      createSqliteAdapter({ path, id: 'local-sqlite:host2', managedWal: true }),
    );
    const source = {
      id: 'local-sqlite:host2',
      provider: 'local-sqlite',
      engine: 'sqlite',
      label: 'Host2 SQLite',
      writable: true,
      metrics: false,
    };

    // Second application: configure runtime + identity only.
    const handler = createDatabaseRequestHandler({
      pathPrefix: '/api/database',
      listSources: async () => ({ sources: [source], connections: { local: { status: 'connected' } } }),
      resolveSource: async (_ctx, sourceId) => {
        if (sourceId !== source.id) throw new Error('database_source_not_found');
        return { source, adapter };
      },
    });

    async function call(method, pathname, body) {
      const request = new Request(`https://host2.example${pathname}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const response = await handler.handle(request, { accountId: 'acct_host2' });
      const json = await response.json();
      return { status: response.status, json };
    }

    const sources = await call('GET', '/api/database/sources');
    assert.equal(sources.status, 200);
    assert.equal(sources.json.sources.length, 1);

    const tableName = `studio_ddl_test_${Date.now().toString(36)}`;
    const preview = await call('POST', '/api/database/ddl', {
      source_id: source.id,
      action: 'create_table',
      table_name: tableName,
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true },
        { name: 'body', type: 'TEXT', nullable: false },
      ],
      preview_only: true,
    });
    assert.equal(preview.json.preview, true);
    assert.match(preview.json.sql, /CREATE TABLE/);

    const created = await call('POST', '/api/database/ddl', {
      source_id: source.id,
      action: 'create_table',
      table_name: tableName,
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true },
        { name: 'body', type: 'TEXT', nullable: false },
      ],
      studio_approved: true,
      destructive_confirmed: true,
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    assert.equal(created.json.ok, true);

    const inserted = await call('POST', '/api/database/rows', {
      source_id: source.id,
      table: tableName,
      values: { id: 1, body: 'portable' },
    });
    assert.equal(inserted.json.ok, true);

    const tables = await call('GET', `/api/database/tables?source_id=${encodeURIComponent(source.id)}`);
    assert.ok(tables.json.tables.some((t) => t.name === tableName));

    const queried = await call('POST', '/api/database/query', {
      source_id: source.id,
      sql: `SELECT body FROM ${tableName} WHERE id = ?`,
      params: [1],
    });
    assert.equal(queried.json.rows[0][0], 'portable');

    const dropped = await call('POST', '/api/database/ddl', {
      source_id: source.id,
      action: 'drop_table',
      table_name: tableName,
      studio_approved: true,
      destructive_confirmed: true,
    });
    assert.equal(dropped.json.ok, true);
  });
});
