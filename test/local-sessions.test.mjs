import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalSession, listLocalSessions, loadLocalSession, saveLocalSession, sessionTitleFromInput } from '../src/lib/local-sessions.js';
import { renderSessionReceipt } from '../src/commands/shell.js';

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-session-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

test('local sessions persist provider-neutral continuation, usage, cost, and last-input title', t => {
  const home = tempHome(t);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-session-project-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  let session = createLocalSession({ cwd, last_input: 'Run wrangler whoami' }, { home });
  assert.match(session.id, /^asess_[0-9a-f-]{36}$/i);
  session = saveLocalSession({
    ...session,
    title: sessionTitleFromInput('Run wrangler whoami'),
    model_key: 'openai:gpt-6-astra',
    actual_service_tier: 'fast',
    provider_state: { provider: 'openai', previous_response_id: 'resp_123' },
    usage_snapshot: { current_context: { input_tokens: 21_244, window_tokens: 1_050_000 } },
    cumulative_usage: { input_tokens: 21_244, cached_input_tokens: 60_544, output_tokens: 219, reasoning_tokens: 31 },
    total_cost_usd: 0.123456,
    cost_breakdown_usd: { input: 0.08, cached_input: 0.01, cache_write: 0.003456, output: 0.03 },
    status: 'paused',
    active_elapsed_ms: 90_000,
    active_started_at: null,
  }, { home });

  const loaded = loadLocalSession(session.id, { home });
  assert.equal(loaded.provider_state.previous_response_id, 'resp_123');
  assert.equal(loaded.cumulative_usage.cached_input_tokens, 60_544);
  assert.equal(listLocalSessions({ home, cwd })[0].id, session.id);

  const receipt = renderSessionReceipt(loaded);
  assert.match(receipt, /Token usage: total=21,463 input=21,244 \(\+ 60,544 cached\) output=219 reasoning=31/);
  assert.match(receipt, /Spent: \$0\.1235/);
  assert.match(receipt, /Elapsed: 1m 30s/);
  assert.match(receipt, /Cost breakdown: input \$0\.0800 · cached \$0\.0100 · cache write \$0\.003456 · output \$0\.0300/);
  assert.match(receipt, new RegExp(`agentsam resume ${session.id}`));
  assert.match(receipt, /Run wrangler whoami/);
});
