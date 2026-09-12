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

test('whoami validates persisted IAM identity while never returning the SDK or provider secret', async t => {
  const home = tempHome(t);
  saveAccountSession({ access_token: 'sdk_do_not_print', user_id: 'au_local' }, { home });
  const envDir = path.join(home, '.agentsam', 'env.d');
  fs.mkdirSync(envDir, { recursive: true });
  const openaiFile = path.join(envDir, 'openai.env');
  fs.writeFileSync(openaiFile, 'OPENAI_API_KEY=sk-never-print-this\n', { mode: 0o600 });
  if (process.platform !== 'win32') fs.chmodSync(openaiFile, 0o600);

  const status = await collectWhoami({
    env: {}, home,
    contextLoader: async token => {
      assert.equal(token, 'sdk_do_not_print');
      return { user_id: 'au_server', account_id: 'acct_server', email: 'dev@example.test', cloudflare: { ok: true }, byok: { openai: { configured: true, masked: 'secret' } } };
    },
  });
  assert.equal(status.authenticated, true);
  assert.equal(status.identity.account_id, 'acct_server');
  assert.equal(status.sdk_credential.source, 'agentsam_account_session');
  assert.equal(status.provider_credentials.find(row => row.provider === 'openai').configured, true);
  const serialized = JSON.stringify(status);
  assert.doesNotMatch(serialized, /sdk_do_not_print|sk-never-print-this|masked/);
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
