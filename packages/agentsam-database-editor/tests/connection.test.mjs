import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLocalSqliteConnection, isVectorsNone } from '../src/contracts/connection.js';

describe('createLocalSqliteConnection', () => {
  it('is a first-class healthy config with vectors none', () => {
    const conn = createLocalSqliteConnection({ path: '/tmp/demo.sqlite', id: 'local-demo' });
    assert.equal(conn.schema, 'agentsam.database-connection.v1');
    assert.equal(conn.engine, 'sqlite');
    assert.equal(conn.provider, 'local');
    assert.equal(conn.connection.path, '/tmp/demo.sqlite');
    assert.equal(conn.vectors.driver, 'none');
    assert.equal(isVectorsNone(conn.vectors), true);
    assert.equal(isVectorsNone(undefined), true);
  });

  it('requires a path', () => {
    assert.throws(() => createLocalSqliteConnection({ path: '' }), /sqlite_path_required/);
  });
});
