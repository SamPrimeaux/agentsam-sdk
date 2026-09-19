import assert from 'node:assert/strict';
import test from 'node:test';
import { createInlineActivity, INTERRUPT_HINT, renderShimmer } from '../../src/ui/cli/activity.js';
import { renderCliFooter, renderDiffPreview } from '../../src/ui/cli/footer.js';
import { createCliRuntimePresenter, normalizeRuntimeEventEnvelope, RUNTIME_EVENT_ENVELOPE_SCHEMA } from '../../src/ui/cli/runtime-events.js';
import { renderWaitingInput } from '../../src/ui/cli/waiting.js';

const stripAnsi = (text) => String(text || '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

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

test('CLI footer shows project identity, branch, and shortcut hints', () => {
  const text = stripAnsi(renderCliFooter({
    project: 'agentsam-sdk',
    cwd: '/Users/sam/agentsam-sdk',
    branch: 'feat/cli-interactive-presence',
    model: 'claude-test',
  }));
  assert.match(text, /agentsam-sdk/);
  assert.match(text, /feat\/cli-interactive-presence/);
  assert.match(text, /ctrl-c to cancel/);
  assert.match(text, /\/ commands/);
});

test('diff preview colors hunks and keeps NO_COLOR output readable', () => {
  const diff = [
    'diff --git a/src/ui/cli/footer.js b/src/ui/cli/footer.js',
    '--- a/src/ui/cli/footer.js',
    '+++ b/src/ui/cli/footer.js',
    '@@ -1,3 +1,4 @@',
    ' import pc from \'picocolors\';',
    '-const old = 1;',
    '+const next = 2;',
    ' keep',
  ].join('\n');
  const colored = renderDiffPreview(diff, { color: true });
  assert.match(colored, /\x1b\[/);
  assert.match(stripAnsi(colored), /\+const next = 2;/);
  const plain = renderDiffPreview(diff, { color: false });
  assert.doesNotMatch(plain, /\x1b\[/);
  assert.match(plain, /-const old = 1;/);
  assert.equal(stripAnsi(renderDiffPreview('', { color: false })).trim(), 'no changes');
});

test('inline activity shows elapsed time and ctrl-c cancel hint', () => {
  let output = '';
  let now = 0;
  let tick = null;
  const activity = createInlineActivity({
    write: (value) => { output += value; },
    interactive: true,
    env: { NO_COLOR: '1' },
    now: () => now,
    setInterval: (fn) => { tick = fn; return 1; },
    clearInterval() {},
  });
  activity.start('Working');
  now = 1500;
  tick();
  const clean = stripAnsi(output);
  assert.match(clean, /Working/);
  assert.match(clean, /1\.5s/);
  assert.match(clean, new RegExp(INTERRUPT_HINT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  activity.clear();
});

test('shimmer uses color when allowed and stays plain under NO_COLOR', () => {
  const colored = renderShimmer('Working', 4, { env: { COLORTERM: 'truecolor' } });
  assert.match(colored, /\x1b\[38;2;/);
  assert.match(stripAnsi(colored), /Working/);
  const fallback = renderShimmer('Working', 4, { env: { TERM: 'xterm-256color' } });
  assert.match(fallback, /\x1b\[38;5;/);
  const plain = renderShimmer('Working', 4, { env: { NO_COLOR: '1', COLORTERM: 'truecolor' } });
  assert.equal(plain, 'Working');
});

test('runtime event envelope is the single standalone/platform producer contract', () => {
  const envelope = normalizeRuntimeEventEnvelope({
    schema_version: 1,
    type: 'tool.started',
    timestamp: '2026-09-18T00:00:00.000Z',
    run_id: 'run_1',
    sequence: 3,
    payload: { capability_id: 'repo.inspect' },
  });
  assert.equal(envelope.schema, RUNTIME_EVENT_ENVELOPE_SCHEMA);
  assert.equal(envelope.schema_version, 1);
  assert.equal(envelope.type, 'tool.started');
  assert.equal(envelope.run_id, 'run_1');
  assert.equal(envelope.sequence, 3);
  assert.deepEqual(envelope.payload, { capability_id: 'repo.inspect' });
  assert.throws(() => normalizeRuntimeEventEnvelope({ payload: {} }), /type is required/);
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
