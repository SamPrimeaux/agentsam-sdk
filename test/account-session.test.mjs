import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { accountSessionPath, clearAccountSession, readAccountSession, resolveAccountSdkKey, saveAccountSession } from '../src/lib/account-session.js';

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-account-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

test('browser-auth SDK bearer persists in machine-local storage, not project state', t => {
  const home = tempHome(t);
  const saved = saveAccountSession({ access_token: 'sdk_machine_session', user_id: 'au_test', account_id: 'acct_test', email: 'dev@example.test' }, { home });
  assert.equal(saved.user_id, 'au_test');
  const filename = accountSessionPath({ home });
  assert.equal(fs.existsSync(filename), true);
  if (process.platform !== 'win32') assert.equal(fs.statSync(filename).mode & 0o077, 0);

  const loaded = readAccountSession({ home });
  assert.equal(loaded.sdk_key, 'sdk_machine_session');
  const resolved = resolveAccountSdkKey({ env: {}, home });
  assert.equal(resolved.source, 'agentsam_account_session');
  assert.equal(resolved.value, 'sdk_machine_session');
  assert.equal(clearAccountSession({ home }), true);
  assert.equal(readAccountSession({ home }), null);
});

test('explicit/environment SDK bearer remains higher authority than local session fallback', t => {
  const home = tempHome(t);
  saveAccountSession({ access_token: 'sdk_disk' }, { home });
  assert.equal(resolveAccountSdkKey({ env: { AGENTSAM_SDK_KEY: 'sdk_env' }, home }).value, 'sdk_env');
  assert.equal(resolveAccountSdkKey({ env: { AGENTSAM_SDK_KEY: 'sdk_env' }, explicit: 'sdk_explicit', home }).value, 'sdk_explicit');
});
