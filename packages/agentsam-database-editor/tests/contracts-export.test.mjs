import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createLocalSqliteConnection,
  isVectorsNone,
  DATABASE_CAPABILITY_KEYS,
  DATABASE_ENGINES,
  DATABASE_PROVIDERS,
} from '../src/contracts/index.js';

describe('contracts public entry', () => {
  it('exports connection helpers and vocabularies (not an empty module)', () => {
    assert.equal(typeof createLocalSqliteConnection, 'function');
    assert.equal(typeof isVectorsNone, 'function');
    assert.ok(DATABASE_CAPABILITY_KEYS.includes('schemaIntrospection'));
    assert.ok(DATABASE_ENGINES.includes('sqlite'));
    assert.ok(DATABASE_PROVIDERS.includes('cloudflare-d1'));
    const conn = createLocalSqliteConnection({ path: '/tmp/x.sqlite' });
    assert.equal(conn.schema, 'agentsam.database-connection.v1');
  });
});
