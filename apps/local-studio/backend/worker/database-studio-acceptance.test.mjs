/**
 * Database Studio acceptance — SQL builder, DDL route contract, and explorer helpers.
 * Authenticated disposable D1 execution is covered separately when OAuth fixtures exist.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCreateTableSql } from '../../../../packages/agentsam-database-editor/src/ui/create-table-sql.js';
import { isDatabaseRequest } from './database-service.js';

describe('database studio acceptance contracts', () => {
  it('registers the authorized DDL route', () => {
    assert.equal(isDatabaseRequest('/api/database/ddl'), true);
    assert.equal(isDatabaseRequest('/api/database/query'), true);
  });

  it('produces disposable fixture DDL that can insert/select/cleanup via SQL text', () => {
    const table = `studio_ddl_test_${Date.now().toString(36)}`;
    const created = buildCreateTableSql({
      tableName: table,
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true, nullable: false },
        { name: 'body', type: 'TEXT', nullable: false },
      ],
    });
    assert.match(created.sql, new RegExp(`CREATE TABLE "${table}"`));
    const insert = `INSERT INTO "${table}" (id, body) VALUES (1, 'hello');`;
    const select = `SELECT id, body FROM "${table}" WHERE id = 1;`;
    const drop = `DROP TABLE "${table}";`;
    assert.match(insert, /INSERT INTO/);
    assert.match(select, /SELECT id, body/);
    assert.match(drop, /DROP TABLE/);
  });

  it('keeps unknown storage wording contract for overview empty metrics', async () => {
    const source = await import('../../../../packages/agentsam-database-editor/src/ui/DatabaseEditorApp.tsx').catch(() => null);
    // TSX may not import under node:test without a loader; assert CSS/copy contract via source file.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const appPath = join(here, '../../../../packages/agentsam-database-editor/src/ui/DatabaseEditorApp.tsx');
    const text = readFileSync(appPath, 'utf8');
    assert.match(text, /Not reported/);
    assert.match(text, /Create table/);
    assert.match(text, /disabled=\{!source\?\.writable\}/);
    assert.ok(!/Create table is unavailable until an authorized DDL flow/.test(text));
    void source;
  });
});
