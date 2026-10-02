import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, cwd) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^npm_config_allow[_-]?scripts$/i.test(key)) delete env[key];
  }
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

test('packed vault exposes every declared public subpath to a clean consumer', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-vault-packed-'));
  const packs = path.join(tmp, 'packs');
  const consumer = path.join(tmp, 'consumer');
  fs.mkdirSync(packs);
  fs.mkdirSync(consumer);

  const tar = run('npm', ['pack', '--silent', '--pack-destination', packs], packageRoot);
  fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({
    name: 'agentsam-vault-packed-consumer',
    version: '1.0.0',
    private: true,
    type: 'module',
  }, null, 2) + '\n');

  run('npm', ['install', '--ignore-scripts', path.join(packs, tar)], consumer);

  const script = `
    const root = await import('@inneranimalmedia/agentsam-vault');
    const contracts = await import('@inneranimalmedia/agentsam-vault/contracts');
    const providers = await import('@inneranimalmedia/agentsam-vault/providers');
    const crypto = await import('@inneranimalmedia/agentsam-vault/crypto');
    const resolver = await import('@inneranimalmedia/agentsam-vault/resolver');
    const oauth = await import('@inneranimalmedia/agentsam-vault/oauth');
    const pkg = await import('@inneranimalmedia/agentsam-vault/package.json', { with: { type: 'json' } });
    if (!root.createCredentialResolver || !root.encryptVaultSecret) throw new Error('root vault exports incomplete');
    if (!contracts.normalizeCredentialRecord) throw new Error('contracts export missing');
    if (!providers.createProviderRegistry) throw new Error('providers export missing');
    if (!crypto.encryptVaultSecret) throw new Error('crypto export missing');
    if (!resolver.createCredentialResolver) throw new Error('resolver export missing');
    if (!oauth.sealOauthToken) throw new Error('oauth export missing');
    if (pkg.default.name !== '@inneranimalmedia/agentsam-vault') throw new Error('package identity mismatch');
    if (pkg.default.version !== '2.6.8') throw new Error('package version mismatch');
  `;
  run(process.execPath, ['--input-type=module', '-e', script], consumer);

  assert.ok(true);
});
