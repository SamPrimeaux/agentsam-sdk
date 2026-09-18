import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  accountSessionPath,
  clearAccountSession,
  readAccountSession,
  resolveAccountApiKey,
  resolveAccountAuth,
  resolveBrowserSessionCredential,
  saveAccountSession,
} from '../src/lib/account-session.js';

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-account-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

test('opaque browser login persists in machine-local storage and resolves independently from API keys', t => {
  const home = tempHome(t);
  const saved = saveAccountSession({
    access_token: 'browser_session_machine_test',
    user_id: 'au_test',
    account_id: 'acct_test',
    email: 'dev@example.test',
  }, { home });
  assert.equal(saved.user_id, 'au_test');

  const filename = accountSessionPath({ home });
  assert.equal(fs.existsSync(filename), true);
  if (process.platform !== 'win32') assert.equal(fs.statSync(filename).mode & 0o077, 0);

  const loaded = readAccountSession({ home });
  assert.equal(loaded.access_token, 'browser_session_machine_test');
  const browser = resolveBrowserSessionCredential({ env: {}, home });
  assert.equal(browser.source, 'agentsam_browser_oauth');
  assert.equal(browser.kind, 'browser_oauth');
  assert.equal(browser.value, 'browser_session_machine_test');
  assert.equal(resolveAccountApiKey({ env: {}, home }).value, '');
  assert.equal(resolveAccountAuth({ env: {}, home }).value, 'browser_session_machine_test');

  assert.equal(clearAccountSession({ home }), true);
  assert.equal(readAccountSession({ home }), null);
});

test('explicit/environment aak_ API key outranks browser login while legacy SDK env names are ignored', t => {
  const home = tempHome(t);
  saveAccountSession({ access_token: 'browser_session_disk' }, { home });

  assert.equal(
    resolveAccountAuth({ env: { AGENTSAM_API_KEY: 'aak_env_test' }, home }).value,
    'aak_env_test',
  );
  assert.equal(
    resolveAccountAuth({ env: { AGENTSAM_API_KEY: 'aak_env_test' }, explicit: 'aak_explicit_test', home }).value,
    'aak_explicit_test',
  );
  assert.equal(
    resolveAccountAuth({ env: { AGENTSAM_SDK_KEY: 'legacy_ignored' }, home }).value,
    'browser_session_disk',
  );
});

test('browser session storage refuses reusable aak_ credentials', t => {
  const home = tempHome(t);
  assert.throws(
    () => saveAccountSession({ access_token: 'aak_should_not_be_browser_session' }, { home }),
    /account_browser_oauth_session_required/,
  );
});
