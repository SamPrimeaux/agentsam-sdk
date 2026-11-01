import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPostgresAdapter } from '../src/adapters/postgres.js';
import { withHonestCapabilities } from '../src/runtime/capabilities.js';

describe('postgres adapter conformance (injected query)', () => {
  it('lists tables, describes, queries, and mutates via injected query fn', async () => {
    /** @type {Array<{sql:string, params:unknown[]}>} */
    const calls = [];
    const adapter = withHonestCapabilities(
      createPostgresAdapter({
        id: 'pg-conformance',
        query: async (sql, params = []) => {
          calls.push({ sql, params });
          if (/information_schema\.tables/i.test(sql)) {
            return {
              rows: [{ schema: 'public', name: 'items', kind: 'BASE TABLE' }],
              fields: [{ name: 'schema' }, { name: 'name' }, { name: 'kind' }],
              rowCount: 1,
            };
          }
          if (/information_schema\.columns/i.test(sql)) {
            return {
              rows: [
                {
                  name: 'id',
                  type: 'integer',
                  nullable: false,
                  primary_key: true,
                  column_default: null,
                },
              ],
              fields: [
                { name: 'name' },
                { name: 'type' },
                { name: 'nullable' },
                { name: 'primary_key' },
                { name: 'column_default' },
              ],
              rowCount: 1,
            };
          }
          if (/pg_indexes/i.test(sql) || /FOREIGN KEY/i.test(sql)) {
            return { rows: [], fields: [], rowCount: 0 };
          }
          if (/^SELECT 1/i.test(sql)) {
            return { rows: [{ ok: 1 }], fields: [{ name: 'ok' }], rowCount: 1 };
          }
          if (/INSERT INTO/i.test(sql)) {
            return { rows: [{ id: 1 }], fields: [{ name: 'id' }], rowCount: 1 };
          }
          if (/UPDATE /i.test(sql) || /DELETE FROM/i.test(sql)) {
            return { rows: [], fields: [], rowCount: 1 };
          }
          return { rows: [{ id: 1 }], fields: [{ name: 'id' }], rowCount: 1 };
        },
      }),
    );

    const tables = await adapter.listTables();
    assert.equal(tables[0].name, 'items');

    const schema = await adapter.describeTable('items');
    assert.equal(schema.columns[0].name, 'id');

    const health = await adapter.health();
    assert.equal(health.status, 'ok');

    await adapter.insert({ table: 'items', values: { id: 1 } });
    await adapter.update({ table: 'items', values: { id: 2 }, where: { id: 1 } });
    await adapter.delete({ table: 'items', where: { id: 2 } });

    const caps = adapter.capabilities();
    assert.equal(caps.sqlQuery, true);
    assert.equal(caps.rowMutations, true);
    assert.equal(caps.export, false);
    assert.ok(calls.length > 0);
  });
});
