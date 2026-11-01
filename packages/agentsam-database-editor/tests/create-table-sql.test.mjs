import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertSafeIdent, buildCreateTableSql } from '../src/ui/create-table-sql.js';

describe('create-table-sql', () => {
  it('rejects unsafe identifiers', () => {
    assert.throws(() => assertSafeIdent('bad-name'), /identifier_invalid|must match/);
    assert.throws(() => assertSafeIdent('sqlite_master'), /reserved/);
  });

  it('builds previewable CREATE TABLE DDL with PK and nullability', () => {
    const built = buildCreateTableSql({
      tableName: 'studio_ddl_test_notes',
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true, nullable: false },
        { name: 'body', type: 'TEXT', nullable: false },
        { name: 'score', type: 'REAL', nullable: true },
      ],
    });
    assert.match(built.sql, /CREATE TABLE "studio_ddl_test_notes"/);
    assert.match(built.sql, /"id" INTEGER PRIMARY KEY/);
    assert.match(built.sql, /"body" TEXT NOT NULL/);
    assert.match(built.sql, /"score" REAL/);
    assert.equal(built.tableName, 'studio_ddl_test_notes');
  });

  it('rejects duplicate columns', () => {
    assert.throws(
      () =>
        buildCreateTableSql({
          tableName: 't',
          columns: [
            { name: 'id', type: 'INTEGER', primaryKey: true },
            { name: 'ID', type: 'TEXT' },
          ],
        }),
      (err) => err?.code === 'duplicate_column' || /Duplicate column/i.test(String(err?.message || err)),
    );
  });
});
