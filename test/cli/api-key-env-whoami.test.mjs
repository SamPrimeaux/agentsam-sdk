import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runEnv } from '../../src/commands/env.js';
import { ensureAgentEnvLoader, renderEnvShellExports, setProviderCredential } from '../../src/lib/provider-credentials.js';
import { runApiKey } from '../../src/commands/api-key.js';
import { collectWhoami } from '../../src/commands/whoami.js';

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-env-api-'));
}

test('load-agent-env.sh delegates to agentsam env shell (no plaintext secrets)', () => {
  const home = tmpHome();
  const loader = ensureAgentEnvLoader({ home });
  const source = fs.readFileSync(loader, 'utf8');
  assert.match(source, /agentsam env shell --profile default/);
  assert.doesNotMatch(source, /export AGENTSAM_API_KEY=/);
  assert.doesNotMatch(source, /env\.d\//);
});

test('env boot-line prints source load-agent-env without provider args', async () => {
  const home = tmpHome();
  const result = await runEnv(['boot-line'], { home, write: () => {} });
  assert.equal(result.command, 'source ~/.agentsam/load-agent-env.sh');
});

test('env shell emits exports from vault without requiring ambient AGENTSAM_API_KEY', async () => {
  const home = tmpHome();
  setProviderCredential('inneranimalmedia', 'aak_testsecretvalue1234567890abcdef', {
    home,
    disableOsStore: true,
  });
  const result = await runEnv(['shell', '--profile', 'default'], {
    home,
    env: {},
    write: () => {},
  });
  assert.match(result.script, /export AGENTSAM_API_KEY=/);
  assert.ok(result.providers.includes('inneranimalmedia'));
});

test('renderEnvShellExports prefers vault over empty ambient env', () => {
  const home = tmpHome();
  setProviderCredential('cursor', 'cursor_test_key_value_xxxxxxxx', {
    home,
    disableOsStore: true,
  });
  const result = renderEnvShellExports({ home, env: {}, profile: 'default' });
  assert.ok(result.providers.includes('cursor'));
  assert.match(result.script, /export CURSOR_API_KEY=/);
});

test('api-key create stores secret via host mint response', async () => {
  const home = tmpHome();
  const result = await runApiKey(['create', '--name', 'Test Mac', '--store', 'vault', '--activate'], {
    home,
    env: {},
    disableOsStore: true,
    authorityLoader: async () => ({ value: 'oauth_session_token', kind: 'browser_oauth', source: 'test' }),
    postJsonImpl: async () => ({
      ok: true,
      credential: { id: 'aakcred_1', name: 'Test Mac', prefix: 'aak_abc…', scopes: ['account:read'] },
      secret_once: 'aak_mintedsecretvalue1234567890abcd',
    }),
    write: () => {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.activated, true);
  assert.equal(result.credential.prefix, 'aak_abc…');
});

test('whoami surfaces tokenPermissions and authType from context', async () => {
  const home = tmpHome();
  const status = await collectWhoami({
    home,
    env: {},
    authorityLoader: async () => ({ value: 'aak_presented', kind: 'api_key', source: 'environment' }),
    contextLoader: async () => ({
      user_id: 'au_1',
      account_id: 'acct_1',
      email: 'dev@example.test',
      auth_type: 'api_key',
      tokenPermissions: ['account:read', 'repository:read', 'models:invoke'],
      credential: {
        id: 'aakcred_1',
        name: 'Sams-iMac',
        prefix: 'aak_7fm…',
        environment: 'development',
        status: 'active',
      },
      cloudflare: { ok: true },
      byok: {},
      terminal: { available: false, instances: [], connections: [] },
    }),
  });
  assert.equal(status.loggedIn, true);
  assert.equal(status.authType, 'api_key');
  assert.deepEqual(status.tokenPermissions, ['account:read', 'repository:read', 'models:invoke']);
  assert.equal(status.credential.name, 'Sams-iMac');
  assert.doesNotMatch(JSON.stringify(status), /aak_presented/);
});

test('repository does not normalize AGENTSAM_DEFAULT_APP', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
  const hits = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|ts|tsx|sh|json|md)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        // Allow docs that explicitly forbid the variable.
        if (/AGENTSAM_DEFAULT_APP/.test(text) && !/no AGENTSAM_DEFAULT_APP|not normalize AGENTSAM_DEFAULT_APP|Remove.*AGENTSAM_DEFAULT_APP|doesNotMatch.*AGENTSAM_DEFAULT_APP|APP_SELECTOR=/.test(text)) {
          if (/process\.env\.AGENTSAM_DEFAULT_APP|AGENTSAM_DEFAULT_APP\s*\|\||\$\{AGENTSAM_DEFAULT_APP/.test(text)) {
            hits.push(full);
          }
        }
      }
    }
  }
  walk(path.join(root, 'src'));
  walk(path.join(root, 'scripts'));
  walk(path.join(root, 'apps/local-studio/backend'));
  assert.deepEqual(hits, []);
});
