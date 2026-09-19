import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  getSecureProviderKey,
  setSecureProviderKey,
  deleteSecureProviderKey,
  listSecureConfiguredProviders,
  hydrateSecureCredentials,
  localVaultPath,
  localVaultSaltPath,
} from '../src/security/local-vault.js';
import { resolveExecutableCommand } from '../src/security/process.js';
import {
  resolveProviderCredential,
  setProviderCredential,
  removeProviderCredential,
  exportProviderEnvProfile,
} from '../src/lib/provider-credentials.js';
import {
  validateAndSaveProviderCredential,
  providerChoices,
  runProviders,
} from '../src/commands/providers.js';
import { renderModelsStatus } from '../src/commands/models.js';

function createTempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-vault-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

test('resolveExecutableCommand resolves Windows .cmd shims with shell: true on win32', () => {
  const npxWin = resolveExecutableCommand('npx', 'win32');
  assert.equal(npxWin.command, 'npx.cmd');
  assert.equal(npxWin.shell, true);

  const npmWin = resolveExecutableCommand('npm', 'win32');
  assert.equal(npmWin.command, 'npm.cmd');
  assert.equal(npmWin.shell, true);

  const wranglerWin = resolveExecutableCommand('wrangler', 'win32');
  assert.equal(wranglerWin.command, 'wrangler.cmd');
  assert.equal(wranglerWin.shell, true);

  const scriptWin = resolveExecutableCommand('build.bat', 'win32');
  assert.equal(scriptWin.command, 'build.bat');
  assert.equal(scriptWin.shell, true);

  // Linux and macOS are untouched
  const npxMac = resolveExecutableCommand('npx', 'darwin');
  assert.equal(npxMac.command, 'npx');
  assert.equal(npxMac.shell, false);

  const npmLinux = resolveExecutableCommand('npm', 'linux');
  assert.equal(npmLinux.command, 'npm');
  assert.equal(npmLinux.shell, false);
});

test('local vault encrypts with AES-256-GCM and never writes plaintext secrets to disk', (t) => {
  const home = createTempHome(t);
  const opts = { home, disableOsStore: true };

  const secret = 'sk-proj-testsecret1234567890abcdef';
  setSecureProviderKey('openai', secret, opts);

  const retrieved = getSecureProviderKey('openai', opts);
  assert.equal(retrieved.value, secret);
  assert.equal(retrieved.source, 'local_vault');

  // Verify disk contents
  const encFile = localVaultPath(opts);
  assert.equal(fs.existsSync(encFile), true);
  const rawText = fs.readFileSync(encFile, 'utf8');

  // Plaintext MUST NOT appear anywhere in the file
  assert.equal(rawText.includes(secret), false);

  // Must have JSON with iv, tag, and data
  const parsed = JSON.parse(rawText);
  assert.ok(parsed.secrets.openai.iv);
  assert.ok(parsed.secrets.openai.tag);
  assert.ok(parsed.secrets.openai.data);

  // Salt file must exist with restrictive permissions
  const saltFile = localVaultSaltPath(opts);
  assert.equal(fs.existsSync(saltFile), true);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(saltFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(encFile).mode & 0o777, 0o600);
  }
});

test('local vault detects tampering of encrypted ciphertext', (t) => {
  const home = createTempHome(t);
  const opts = { home, disableOsStore: true };

  setSecureProviderKey('anthropic', 'sk-ant-test-key-12345', opts);

  // Tamper with the ciphertext
  const encFile = localVaultPath(opts);
  const parsed = JSON.parse(fs.readFileSync(encFile, 'utf8'));
  const originalData = parsed.secrets.anthropic.data;
  // Flip the last hex byte
  const tamperedData = originalData.slice(0, -2) + (originalData.slice(-2) === 'aa' ? 'bb' : 'aa');
  parsed.secrets.anthropic.data = tamperedData;
  fs.writeFileSync(encFile, JSON.stringify(parsed));

  // Decryption must fail and return null safely rather than corrupt data
  const retrieved = getSecureProviderKey('anthropic', opts);
  assert.equal(retrieved, null);
});

test('local vault stores and retrieves Cloudflare accountId alongside token', (t) => {
  const home = createTempHome(t);
  const opts = { home, disableOsStore: true };

  setSecureProviderKey('cloudflare', { value: 'cf-token-123', accountId: 'abcdef0123456789abcdef0123456789' }, opts);
  const retrieved = getSecureProviderKey('cloudflare', opts);

  assert.equal(retrieved.value, 'cf-token-123');
  assert.equal(retrieved.accountId, 'abcdef0123456789abcdef0123456789');
});

test('hydrateSecureCredentials populates process.env for unconfigured providers without overwriting', (t) => {
  const home = createTempHome(t);
  const opts = { home, disableOsStore: true };

  setSecureProviderKey('gemini', 'gemini-key-val-789', opts);

  const mockEnv = {
    EXISTING_KEY: 'pre-existing',
  };

  const hydrated = hydrateSecureCredentials(mockEnv, opts);
  assert.ok(hydrated.includes('gemini'));
  assert.equal(mockEnv.GEMINI_API_KEY, 'gemini-key-val-789');

  // Second run does not overwrite
  mockEnv.GEMINI_API_KEY = 'user-override';
  hydrateSecureCredentials(mockEnv, opts);
  assert.equal(mockEnv.GEMINI_API_KEY, 'user-override');
});

test('resolveProviderCredential resolves keys from local secure vault across any directory', (t) => {
  const home = createTempHome(t);
  const opts = { home, disableOsStore: true };

  setProviderCredential('cursor', 'cur-key-secret-456', opts);

  const resolved = resolveProviderCredential('cursor', { env: {}, home, disableOsStore: true });
  assert.equal(resolved.configured, true);
  assert.equal(resolved.value, 'cur-key-secret-456');

  // Deleting removes it
  removeProviderCredential('cursor', opts);
  const afterRemove = resolveProviderCredential('cursor', { env: {}, home, disableOsStore: true });
  assert.equal(afterRemove.configured, false);
});

test('validateAndSaveProviderCredential rejects invalid key and does NOT persist it', async (t) => {
  const home = createTempHome(t);
  const opts = {
    home,
    disableOsStore: true,
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Incorrect API key provided' } }),
    }),
  };

  const result = await validateAndSaveProviderCredential('openai', 'sk-invalid-test-key', opts);
  assert.equal(result.ok, false);
  assert.equal(result.saved, false);
  assert.match(result.error, /Incorrect API key/i);

  // Verify it was NOT stored in the vault!
  const retrieved = getSecureProviderKey('openai', opts);
  assert.equal(retrieved, null);
});

test('validateAndSaveProviderCredential verifies valid key and saves ONLY to local vault without plaintext file', async (t) => {
  const home = createTempHome(t);
  const opts = {
    home,
    disableOsStore: true,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }],
      }),
    }),
  };

  const result = await validateAndSaveProviderCredential('openai', 'sk-valid-key-xyz', opts);
  assert.equal(result.ok, true);
  assert.equal(result.saved, true);
  assert.equal(result.model_count, 2);

  // Verify it was saved to local vault
  const retrieved = getSecureProviderKey('openai', opts);
  assert.equal(retrieved.value, 'sk-valid-key-xyz');

  // CRITICAL: Plaintext .env profile file MUST NOT be created automatically!
  const plaintextFile = path.join(home, '.agentsam', 'env.d', 'openai.env');
  assert.equal(fs.existsSync(plaintextFile), false, 'Plaintext .env file must NOT exist after secure provider setup');
});

test('exportProviderEnvProfile and agentsam providers export create plaintext .env file ONLY on explicit opt-in', async (t) => {
  const home = createTempHome(t);
  const opts = { home, disableOsStore: true };

  // Set up provider key in secure vault
  setProviderCredential('anthropic', 'sk-ant-test-export-key', opts);

  // Confirm NO plaintext file exists yet
  const plaintextFile = path.join(home, '.agentsam', 'env.d', 'anthropic.env');
  assert.equal(fs.existsSync(plaintextFile), false);

  // Explicit opt-in export via CLI command
  let output = '';
  const exported = await runProviders(['export', 'anthropic'], {
    ...opts,
    write: (text) => { output += text; },
  });

  assert.equal(exported.provider, 'anthropic');
  assert.equal(fs.existsSync(plaintextFile), true);
  const content = fs.readFileSync(plaintextFile, 'utf8');
  assert.match(content, /ANTHROPIC_API_KEY="sk-ant-test-export-key"/);
  assert.match(output, /Exported anthropic profile/);
});

test('renderModelsStatus shows tip: Select your preferred provider when providers are unconfigured', () => {
  const status = {
    providers: [
      { id: 'openai', label: 'OpenAI', configured: false, credential: 'OPENAI_API_KEY' },
      { id: 'anthropic', label: 'Anthropic', configured: false, credential: 'ANTHROPIC_API_KEY' },
    ],
    discovery: {},
    providerModels: {},
    local: { online: false, models: [] },
  };

  const output = renderModelsStatus(status);
  assert.match(output, /Tip:\s*Select your preferred provider/i);
});

test('providerChoices returns valid choice list for select picker', () => {
  const choices = providerChoices();
  assert.ok(choices.length >= 6);
  assert.ok(choices.some((c) => c.value === 'openai'));
  assert.ok(choices.some((c) => c.value === 'anthropic'));
  assert.ok(choices.some((c) => c.value === 'gemini'));
});
