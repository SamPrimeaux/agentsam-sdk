import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSqliteAdapter } from '../backend/sqlite.js';
import { createPostgresAdapter } from '../src/adapters/postgres.js';
import {
  deriveCapabilities,
  withHonestCapabilities,
} from '../src/runtime/capabilities.js';

describe('capability honesty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsam-caps-'));
  const path = join(dir, 'caps.sqlite');
  /** @type {ReturnType<typeof createSqliteAdapter>} */
  let sqlite;

  after(() => {
    try {
      sqlite?.close?.();
    } catch {
      /* ignore */
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('sqlite advertises transactions only because transaction() exists; never export', () => {
    sqlite = createSqliteAdapter({ path, id: 'caps-sqlite' });
    const honest = withHonestCapabilities(sqlite);
    const caps = honest.capabilities();
    assert.equal(caps.export, false);
    assert.equal(caps.transactions, true);
    assert.equal(caps.migrationApply, 'statement');
    assert.equal(typeof honest.transaction, 'function');
    assert.equal(typeof honest.applyMigration, 'function');
    assert.equal(typeof honest.export, 'undefined');
  });

  it('deriveCapabilities refuses aspirational flags without methods', () => {
    const fake = {
      id: 'fake',
      dialect: 'postgres',
      capabilities: () => ({
        schemaIntrospection: true,
        sqlQuery: true,
        rowMutations: true,
        export: true,
        transactions: true,
        multiStatement: true,
        migrationApply: 'statement',
      }),
      listTables: async () => [],
      describeTable: async () => ({ name: 't', columns: [] }),
      query: async () => ({ columns: [], rows: [] }),
      // no insert/update/delete/export/transaction/applyMigration
    };
    const caps = deriveCapabilities(fake, fake.capabilities());
    assert.equal(caps.rowMutations, false);
    assert.equal(caps.export, false);
    assert.equal(caps.transactions, false);
    assert.equal(caps.migrationApply, 'none');
  });

  it('postgres applyMigration exists; export/transactions stay false until implemented', async () => {
    const statements = [];
    const adapter = withHonestCapabilities(
      createPostgresAdapter({
        id: 'pg-test',
        query: async (sql) => {
          statements.push(sql);
          return { rows: [], fields: [], rowCount: 0 };
        },
      }),
    );
    const caps = adapter.capabilities();
    assert.equal(caps.export, false);
    assert.equal(caps.transactions, false);
    assert.equal(caps.migrationApply, 'statement');
    const result = await adapter.applyMigration('CREATE TABLE t (id int); SELECT 1');
    assert.equal(result.ok, true);
    assert.ok(statements.length >= 1);
  });
});
