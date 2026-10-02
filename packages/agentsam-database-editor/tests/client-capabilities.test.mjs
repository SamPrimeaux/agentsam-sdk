import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDatabaseCapabilities } from '../src/ui/client.ts';

test('normalizes provider wire capability arrays into the portable capability map', () => {
  assert.deepEqual(
    normalizeDatabaseCapabilities(['schema', 'read', 'query', 'insert', 'metrics', 'unknown']),
    {
      schema: true,
      read_rows: true,
      query: true,
      insert: true,
      metrics: true,
    },
  );
});

test('preserves explicit boolean capability maps and the read alias', () => {
  assert.deepEqual(
    normalizeDatabaseCapabilities({ read: true, query: false, delete: true, nonsense: true }),
    { read_rows: true, query: false, delete: true },
  );
});
