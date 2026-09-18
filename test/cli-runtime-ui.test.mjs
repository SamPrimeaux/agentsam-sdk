import assert from 'node:assert/strict';
import test from 'node:test';
import { createInlineActivity } from '../src/ui/cli/activity.js';
import { renderCliFooter } from '../src/ui/cli/footer.js';
import { createCliRuntimePresenter, normalizeRuntimeEventEnvelope, RUNTIME_EVENT_ENVELOPE_SCHEMA } from '../src/ui/cli/runtime-events.js';
import { renderWaitingInput } from '../src/ui/cli/waiting.js';

test('CLI footer reports unknown context honestly', () => {
  const text = renderCliFooter({
    model: 'claude-test',
    usageSnapshot: {
      current_context: { input_tokens: 1234, window_tokens: 0 },
      cumulative: { input_tokens: 5000, output_tokens: 600, cached_input_tokens: 2000 },
    },
  });
  assert.match(text, /claude-test/);
  assert.match(text, /ctx 1\.2k \/ unknown/);
  assert.match(text, /↑5k ↓600/);
  assert.match(text, /cache 2k/);
});

test('runtime presenter turns events into one-line activity and waiting handoff', () => {
  let output = '';
  let now = 1_000;
  const timers = [];
  const activity = createInlineActivity({
    write: (value) => { output += value; },
    interactive: false,
    now: () => now,
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    clearInterval() {},
  });
  const state = {};
  const presenter = createCliRuntimePresenter({ activity, write: (value) => { output += value; }, state });
  activity.start('Thinking');
  presenter.handle({ type: 'tool.started', payload: { capability_id: 'repo.inspect' } });
  presenter.handle({ type: 'usage.snapshot', payload: { current_context: { input_tokens: 10, window_tokens: 100 }, cumulative: {} } });
  presenter.handle({ type: 'context.compaction.started', payload: { provider: 'test' } });
  now += 500;
  presenter.handle({ type: 'context.compaction.completed', payload: { provider: 'test', tokens_before: 80, tokens_after: 20, summary_text: 'kept state' } });
  presenter.handle({ type: 'runtime.waiting_input', payload: { reason: 'authentication', auth_url: 'https://example.test/auth', user_code: 'ABCD' } });
  assert.equal(state.usageSnapshot.current_context.input_tokens, 10);
  assert.equal(state.lastCompaction.tokens_before, 80);
  assert.match(output, /Waiting for you/);
  assert.match(output, /https:\/\/example\.test\/auth/);
  assert.match(output, /ABCD/);
  assert.match(presenter.compactionReceipt(), /80 → 20/);
});

test('waiting renderer gives CLI-native auth instructions', () => {
  const text = renderWaitingInput({ awaiting_input_reason: 'otp', auth_url: 'https://example.test/login', user_code: '123456' });
  assert.match(text, /Waiting for you/);
  assert.match(text, /otp/);
  assert.match(text, /Open/);
  assert.match(text, /123456/);
});
