import assert from 'node:assert/strict';
import test from 'node:test';
import { queryAccountToolUsage } from '../backend/worker/analytics-tool-usage-v2.js';

test('account identity is required and cannot be supplied by a query range', async () => {
  await assert.rejects(queryAccountToolUsage({ DB: { prepare() {} } }, null), /authenticated_account_required/);
});

test('canonical analytics queries bind the authenticated account and selected range', async () => {
  const seen = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(accountId, since) {
            seen.push({ sql, accountId, since });
            return {
              async all() {
                if (sql.includes('GROUP BY tool_key')) return { results: [{
                  tool_key: 'terminal.exec', calls: 7, successes: 6, failures: 1,
                  average_duration_ms: 87, recorded_cost_usd: 0.03, priced_calls: 7,
                }] };
                if (sql.includes('AS bucket')) return { results: [{
                  bucket: '2026-10-28', calls: 7, successes: 6, failures: 1, recorded_cost_usd: 0.03,
                }] };
                if (sql.includes('SELECT id, tool_key')) return { results: [{
                  id: 'failure-1', tool_key: 'terminal.exec', status: 'failed',
                  error_code: 'command_failed', failure_origin: 'runtime', duration_ms: 87,
                  cost_usd: 0, created_at_unix: 30,
                }] };
                return { results: [{
                  calls: 7, successes: 6, failures: 1, recorded_cost_usd: 0.03,
                  priced_calls: 7, average_duration_ms: 87, first_event_unix: 20, last_event_unix: 30,
                }] };
              },
            };
          },
        };
      },
    },
  };

  const result = await queryAccountToolUsage(env, 'account-a', 'All');
  assert.equal(seen.length, 4);
  assert.ok(seen.every((query) => query.accountId === 'account-a' && query.since === 0));
  assert.ok(seen.every((query) => /WHERE account_id = \? AND created_at_unix >= \?/.test(query.sql)));
  assert.equal(result.schema, 'agentsam.tool-usage.v2');
  assert.equal(result.range, 'All');
  assert.equal(result.scope, 'authenticated_account');
  assert.equal(result.totals.calls, 7);
  assert.equal(result.by_tool[0].tool_key, 'terminal.exec');
  assert.equal(result.by_day[0].bucket, '2026-10-28');
  assert.equal(result.recent_failures[0].id, 'failure-1');
  assert.equal(result.coverage.measured_calls, 7);
});
