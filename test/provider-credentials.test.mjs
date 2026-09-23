import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { describeProviderCredential, ensureProviderEnvProfile, resolveProviderCredential } from '../src/lib/provider-credentials.js';

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


test('provider env profiles create a secure reusable source loader without embedding secrets', { skip: process.platform === 'win32' }, t => {
  const home = fixtureHome(t);
  const openai = ensureProviderEnvProfile('openai', { home });
  assert.equal(openai.source_command, 'source ~/.agentsam/load-agent-env.sh openai');
  assert.equal(fs.statSync(openai.file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(openai.loader).mode & 0o777, 0o700);
  assert.match(fs.readFileSync(openai.file, 'utf8'), /OPENAI_API_KEY=""/);
  assert.doesNotMatch(fs.readFileSync(openai.loader, 'utf8'), /sk-|secret-/);

  const cloudflare = ensureProviderEnvProfile('cloudflare', { home });
  const source = fs.readFileSync(cloudflare.file, 'utf8');
  assert.match(source, /CLOUDFLARE_ACCOUNT_ID=""/);
  assert.match(source, /CLOUDFLARE_API_TOKEN=""/);
});

test('Cloudflare credential identity never falls back to generic ACCOUNT_ID', t => {
  const home = fixtureHome(t);
  const resolved = resolveProviderCredential('cloudflare', {
    env: { CLOUDFLARE_API_TOKEN: 'token-secret', ACCOUNT_ID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    home,
  });
  assert.equal(resolved.configured, true);
  assert.equal(resolved.account_id, null);
});

test('Cloudflare credential status carries non-secret account identity from the provider profile', t => {
  const home = fixtureHome(t);
  const profile = path.join(home, '.agentsam', 'env.d', 'cloudflare.env');
  fs.writeFileSync(profile, 'export CLOUDFLARE_ACCOUNT_ID="0123456789abcdef0123456789abcdef"\nexport CLOUDFLARE_API_TOKEN="token-secret"\n', { mode: 0o600 });
  if (process.platform !== 'win32') fs.chmodSync(profile, 0o600);
  const resolved = resolveProviderCredential('cloudflare', { env: {}, home });
  assert.equal(resolved.account_id, '0123456789abcdef0123456789abcdef');
  const safe = describeProviderCredential('cloudflare', { env: {}, home });
  assert.equal(safe.account_id, '0123456789abcdef0123456789abcdef');
  assert.doesNotMatch(JSON.stringify(safe), /token-secret/);
});


test('Cloudflare profile account backfill never overwrites an existing token or account choice', t => {
  const home = fixtureHome(t);
  const profile = path.join(home, '.agentsam', 'env.d', 'cloudflare.env');
  fs.writeFileSync(profile, 'export CLOUDFLARE_ACCOUNT_ID=""\nexport CLOUDFLARE_API_TOKEN="keep-me"\n', { mode: 0o600 });
  ensureProviderEnvProfile('cloudflare', { home, accountId: '11111111111111111111111111111111' });
  let source = fs.readFileSync(profile, 'utf8');
  assert.match(source, /CLOUDFLARE_ACCOUNT_ID="11111111111111111111111111111111"/);
  assert.match(source, /CLOUDFLARE_API_TOKEN="keep-me"/);

  ensureProviderEnvProfile('cloudflare', { home, accountId: '22222222222222222222222222222222' });
  source = fs.readFileSync(profile, 'utf8');
  assert.match(source, /CLOUDFLARE_ACCOUNT_ID="11111111111111111111111111111111"/);
  assert.doesNotMatch(source, /22222222222222222222222222222222/);
});
