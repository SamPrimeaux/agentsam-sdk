import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../../packages/agentsam-desktop-shell/src-tauri/src/main.rs', import.meta.url), 'utf8');
const keychain = readFileSync(new URL('../../packages/agentsam-desktop-shell/src-tauri/src/commands/keychain.rs', import.meta.url), 'utf8');
const tauriClient = readFileSync(new URL('../../apps/local-studio/frontend/src/lib/desktop/tauri.ts', import.meta.url), 'utf8');
const identityBridge = readFileSync(new URL('../../packages/identity/src/frontend/auth-portal/shared/desktop-identity-bridge.js', import.meta.url), 'utf8');
const localIdentity = readFileSync(new URL('../../packages/agentsam-desktop-shell/src-tauri/src/commands/local_identity.rs', import.meta.url), 'utf8');
const googleIdentity = readFileSync(new URL('../../packages/agentsam-desktop-shell/src-tauri/src/commands/google_desktop_identity.rs', import.meta.url), 'utf8');

test('desktop webview cannot invoke a generic secure-store read', () => {
  for (const forbidden of [
    'keychain::get_token',
    'keychain::secure_store_get',
    '"secure_store_get"',
  ]) {
    assert.equal(main.includes(forbidden), false, `main.rs must not register ${forbidden}`);
    assert.equal(tauriClient.includes(forbidden), false, `frontend must not invoke ${forbidden}`);
    assert.equal(identityBridge.includes(forbidden), false, `desktop identity bridge must not invoke ${forbidden}`);
  }
});

test('provider key command surface never exposes get', () => {
  assert.match(main, /keychain::provider_key_exists/);
  assert.match(main, /keychain::provider_key_set/);
  assert.match(main, /keychain::provider_key_delete/);
  assert.doesNotMatch(main, /keychain::provider_key_get/);
  assert.match(keychain, /pub\(crate\) fn provider_key_get_internal/);
  assert.doesNotMatch(keychain, /#\[tauri::command\]\s*\npub\(crate\) fn provider_key_get_internal/);
});

test('keychain app namespace is derived natively', () => {
  assert.match(keychain, /const KEYCHAIN_APP_ID: &str = "local-studio"/);
  assert.doesNotMatch(keychain, /pub fn .*\(app_id:/);
});

test('desktop bearer sessions stay behind Rust', () => {
  assert.doesNotMatch(tauriClient, /identity_store_get|identity_store_set|identity_store_delete/);
  assert.doesNotMatch(identityBridge, /identity_store_get|identity_store_set|identity_store_delete/);
  assert.match(localIdentity, /identity_session_get_internal/);
  assert.match(localIdentity, /identity_session_set_internal/);
  assert.match(googleIdentity, /#\[serde\(skip_serializing\)\]\s*pub session_id/);
  assert.match(googleIdentity, /identity_session_set_internal/);
});
