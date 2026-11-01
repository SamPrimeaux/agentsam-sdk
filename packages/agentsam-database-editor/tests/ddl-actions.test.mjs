import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDdlSql, DDL_ACTIONS } from '../src/runtime/ddl.js';

describe('buildDdlSql', () => {
  it('exposes create/alter/drop/index actions', () => {
    assert.ok(DDL_ACTIONS.includes('create_table'));
    assert.ok(DDL_ACTIONS.includes('drop_table'));
    assert.ok(DDL_ACTIONS.includes('alter_table_add_column'));
    assert.ok(DDL_ACTIONS.includes('create_index'));
    assert.ok(DDL_ACTIONS.includes('drop_index'));
  });

  it('builds drop_table', () => {
    const built = buildDdlSql({
      action: 'drop_table',
      table_name: 'notes',
      engine: 'sqlite',
    });
    assert.equal(built.sql, 'DROP TABLE IF EXISTS "notes";');
  });

  it('builds alter_table_add_column', () => {
    const built = buildDdlSql({
      action: 'alter_table_add_column',
      table_name: 'notes',
      column: { name: 'tag', type: 'TEXT', nullable: true },
      engine: 'sqlite',
    });
    assert.match(built.sql, /ALTER TABLE "notes" ADD COLUMN "tag" TEXT/);
  });

  it('builds create_index', () => {
    const built = buildDdlSql({
      action: 'create_index',
      table_name: 'notes',
      index_name: 'idx_notes_body',
      index_columns: ['body'],
      engine: 'sqlite',
    });
    assert.match(built.sql, /CREATE INDEX IF NOT EXISTS "idx_notes_body" ON "notes"/);
  });

  it('rejects unknown actions', () => {
    assert.throws(
      () => buildDdlSql({ action: 'rename_table', table_name: 'x' }),
      /ddl_action_unsupported/,
    );
  });
});
