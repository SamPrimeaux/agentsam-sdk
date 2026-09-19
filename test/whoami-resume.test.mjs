import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { saveAccountSession } from '../src/lib/account-session.js';
import { createLocalSession } from '../src/lib/local-sessions.js';
import { collectWhoami } from '../src/commands/whoami.js';
import { runResume } from '../src/commands/resume.js';

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-ux-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

test('whoami validates persisted IAM browser identity while never returning account or provider secrets', async t => {
  const home = tempHome(t);
  saveAccountSession({ access_token: 'browser_session_do_not_print', user_id: 'au_local' }, { home });
  const envDir = path.join(home, '.agentsam', 'env.d');
  fs.mkdirSync(envDir, { recursive: true });
  const openaiFile = path.join(envDir, 'openai.env');
  fs.writeFileSync(openaiFile, 'OPENAI_API_KEY=sk-never-print-this\n', { mode: 0o600 });
  if (process.platform !== 'win32') fs.chmodSync(openaiFile, 0o600);

  const status = await collectWhoami({
    env: {}, home,
    contextLoader: async token => {
      assert.equal(token, 'browser_session_do_not_print');
      return {
        user_id: 'au_server', account_id: 'acct_server', email: 'dev@example.test',
        cloudflare: { ok: true }, byok: { openai: { configured: true, masked: 'secret' } },
        terminal: {
          available: true,
          instances: [{ id: 'inst_1', name: 'Mac', metadata_json: 'secret' }],
          connections: [{ id: 'conn_1', instance_id: 'inst_1', name: 'Tunnel', is_active: true, endpoint_url: 'wss://secret' }],
        },
      };
    },
  });
  assert.equal(status.authenticated, true);
  assert.equal(status.identity.account_id, 'acct_server');
  assert.equal(status.active_auth.source, 'agentsam_browser_oauth');
  assert.equal(status.active_auth.kind, 'browser_oauth');
  assert.equal(status.provider_credentials.find(row => row.provider === 'openai').configured, true);
  assert.equal(status.terminal.connections[0].id, 'conn_1');
  const serialized = JSON.stringify(status);
  assert.doesNotMatch(serialized, /browser_session_do_not_print|sk-never-print-this|masked|endpoint_url|metadata_json|wss:\/\/secret/);
});

test('whoami uses a valid browser session when a stale environment API key is invalid', async t => {
  const home = tempHome(t);
  saveAccountSession({ access_token: 'browser_session_do_not_print', user_id: 'au_local' }, { home });
  const status = await collectWhoami({
    env: { AGENTSAM_API_KEY: 'stale-invalid-key' },
    home,
    contextLoader: async token => {
      assert.equal(token, 'browser_session_do_not_print');
      return { user_id: 'au_server', account_id: 'acct_server' };
    },
  });
  assert.equal(status.authenticated, true);
  assert.equal(status.active_auth.kind, 'browser_oauth');
  assert.equal(status.api_key.valid, false);
  assert.equal(status.api_key.error, 'invalid_api_key_prefix');
});

test('whoami refreshes an expired browser session before validating IAM context', async t => {
  const home = tempHome(t);
  const nowMs = Date.now();
  saveAccountSession({
    access_token: 'expired_browser_token',
    refresh_token: 'refresh_token',
    expires_in: 1,
  }, { home, nowMs: nowMs - 120_000 });
  let refreshed = 0;
  const status = await collectWhoami({
    env: {},
    home,
    nowMs,
    refreshImpl: async ({ session }) => {
      refreshed += 1;
      return { ...session, access_token: 'fresh_browser_token', expires_at: new Date(nowMs + 3_600_000).toISOString() };
    },
    contextLoader: async token => {
      assert.equal(token, 'fresh_browser_token');
      return { user_id: 'au_server', account_id: 'acct_server' };
    },
  });
  assert.equal(refreshed, 1);
  assert.equal(status.authenticated, true);
  assert.equal(status.active_auth.kind, 'browser_oauth');
});

test('resume restores saved cwd and session through the canonical shell runtime', async t => {
  const home = tempHome(t);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-resume-project-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const session = createLocalSession({ cwd, title: 'Run wrangler whoami', model_key: 'openai:gpt-6-astra' }, { home });
  let called = null;
  const restored = await runResume([session.id], {
    home,
    write() {},
    runShellImpl: async (argv, options) => { called = { argv, options }; },
  });
  assert.equal(restored.id, session.id);
  assert.deepEqual(called.argv, []);
  assert.equal(called.options.cwd, cwd);
  assert.equal(called.options.session.id, session.id);
});
