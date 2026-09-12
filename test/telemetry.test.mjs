import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentEvent, createUsageSnapshot } from '../src/telemetry/index.js';

test('AgentEvent is compact serializable provider-neutral telemetry', () => {
  const event = createAgentEvent('context.compaction.completed', { before: 181_000, after: 72_000 }, {
    runId: 'run_test', sequence: 4, timestamp: '2026-09-12T00:00:00.000Z',
  });
  assert.equal(event.type, 'context.compaction.completed');
  assert.equal(event.run_id, 'run_test');
  assert.doesNotThrow(() => JSON.stringify(event));
});

test('current active context and cumulative run usage are different metrics', () => {
  const usage = createUsageSnapshot({
    current_context: { input_tokens: 48_000, window_tokens: 1_050_000 },
    cumulative: { input_tokens: 310_000, output_tokens: 22_000, cached_input_tokens: 120_000, cache_write_tokens: 12_000, reasoning_tokens: 8_000 },
    estimate_kind: 'provider',
  });
  assert.equal(usage.current_context.input_tokens, 48_000);
  assert.equal(usage.cumulative.input_tokens, 310_000);
  assert.equal(usage.provider_authoritative, true);
});
