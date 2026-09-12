import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { describeProviderCredential, resolveProviderCredential } from '../src/lib/provider-credentials.js';

function fixtureHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-credentials-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.agentsam', 'env.d'), { recursive: true });
  return home;
}

test('provider credential resolver loads a secure AgentSam env file without exposing it in status', t => {
  const home = fixtureHome(t);
  const filename = path.join(home, '.agentsam', 'env.d', 'openai.env');
  fs.writeFileSync(filename, 'export OPENAI_API_KEY="secret-from-file"\n', { mode: 0o600 });
  if (process.platform !== 'win32') fs.chmodSync(filename, 0o600);

  const resolved = resolveProviderCredential('openai', { env: {}, home });
  assert.equal(resolved.configured, true);
  assert.equal(resolved.source, 'agentsam_env_file');
  assert.equal(resolved.value, 'secret-from-file');

  const safe = describeProviderCredential('openai', { env: {}, home });
  assert.equal(safe.configured, true);
  assert.equal(safe.source, 'agentsam_env_file');
  assert.equal(Object.hasOwn(safe, 'value'), false);
  assert.doesNotMatch(JSON.stringify(safe), /secret-from-file/);
});

test('environment credential wins over disk fallback', t => {
  const home = fixtureHome(t);
  const filename = path.join(home, '.agentsam', 'env.d', 'openai.env');
  fs.writeFileSync(filename, 'OPENAI_API_KEY=file-value\n', { mode: 0o600 });
  if (process.platform !== 'win32') fs.chmodSync(filename, 0o600);
  const resolved = resolveProviderCredential('openai', { env: { OPENAI_API_KEY: 'env-value' }, home });
  assert.equal(resolved.source, 'environment');
  assert.equal(resolved.value, 'env-value');
});

test('AgentSam refuses provider credential files with broad POSIX permissions', { skip: process.platform === 'win32' }, t => {
  const home = fixtureHome(t);
  const filename = path.join(home, '.agentsam', 'env.d', 'openai.env');
  fs.writeFileSync(filename, 'OPENAI_API_KEY=unsafe-value\n', { mode: 0o644 });
  fs.chmodSync(filename, 0o644);
  const resolved = resolveProviderCredential('openai', { env: {}, home });
  assert.equal(resolved.configured, false);
  assert.equal(resolved.error, 'permissions_too_open');
  assert.equal(resolved.value, '');
});
