import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);

test('agentsam env init creates provider profile and reusable source loader', { skip: process.platform === 'win32' }, t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-env-cli-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env = { ...process.env, HOME: home };
  const result = spawnSync(process.execPath, ['src/cli.js', 'env', 'init', 'openai'], { cwd: repoRoot, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /source ~\/.agentsam\/load-agent-env\.sh openai/);
  assert.equal(fs.statSync(path.join(home, '.agentsam', 'env.d', 'openai.env')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(home, '.agentsam', 'load-agent-env.sh')).mode & 0o777, 0o700);
});


test('Cloudflare env init backfills exactly one Wrangler account without printing credentials', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-env-cf-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const { runEnv } = await import('../../src/commands/env.js');
  let output = '';
  await runEnv(['init', 'cloudflare'], {
    home, env: { HOME: home }, write: text => { output += text; },
    spawnSyncImpl: () => ({ status: 0, stdout: JSON.stringify({ accounts: [{ id: '11111111111111111111111111111111', name: 'Example' }] }), stderr: '' }),
  });
  const profile = fs.readFileSync(path.join(home, '.agentsam', 'env.d', 'cloudflare.env'), 'utf8');
  assert.match(profile, /CLOUDFLARE_ACCOUNT_ID="11111111111111111111111111111111"/);
  assert.match(profile, /CLOUDFLARE_API_TOKEN=""/);
  assert.match(output, /account  detected\/configured/);
  assert.doesNotMatch(output, /CLOUDFLARE_API_TOKEN=.*[^ ]/);
});


test('generated loader exports the selected provider profile into the caller shell', { skip: process.platform === 'win32' }, t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-env-source-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env = { ...process.env, HOME: home };
  let result = spawnSync(process.execPath, ['src/cli.js', 'env', 'init', 'openai'], { cwd: repoRoot, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  fs.writeFileSync(path.join(home, '.agentsam', 'env.d', 'openai.env'), 'export OPENAI_API_KEY="sentinel-provider-key"\
', { mode: 0o600 });
  result = spawnSync('bash', ['-lc', 'source "$HOME/.agentsam/load-agent-env.sh" openai && test "$OPENAI_API_KEY" = "sentinel-provider-key"'], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
