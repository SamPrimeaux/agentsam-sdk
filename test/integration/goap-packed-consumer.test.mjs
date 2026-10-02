import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

test('packed root GOAP resolves the single published AgentSam errors runtime', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-goap-packed-'));
  const packDir = path.join(tmp, 'packs');
  const consumer = path.join(tmp, 'consumer');
  fs.mkdirSync(packDir);
  fs.mkdirSync(consumer);

  const errorsTar = run('npm', ['pack', '--silent', '--pack-destination', packDir], path.join(root, 'packages/agentsam-errors'));
  const rootTar = run('npm', ['pack', '--silent', '--pack-destination', packDir], root);

  fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({
    name: 'agentsam-goap-packed-consumer',
    version: '1.0.0',
    private: true,
    type: 'module',
  }, null, 2) + '\n');

  run('npm', [
    'install',
    '--ignore-scripts',
    path.join(packDir, errorsTar),
    path.join(packDir, rootTar),
  ], consumer);

  const script = `
    const sdk = await import('@inneranimalmedia/agentsam-sdk');
    const sdkErrors = await import('@inneranimalmedia/agentsam-sdk/errors');
    const errors = await import('@inneranimalmedia/agentsam-errors');
    const goap = await import('@inneranimalmedia/agentsam-sdk/goap');
    if (sdkErrors.AgentSamError !== errors.AgentSamError) {
      throw new Error('root errors export does not share canonical AgentSamError identity');
    }
    if (!goap || Object.keys(goap).length === 0) {
      throw new Error('root GOAP export did not hydrate');
    }
    if (!sdk) throw new Error('root SDK did not hydrate');
  `;
  run(process.execPath, ['--input-type=module', '-e', script], consumer);

  assert.equal(true, true);
});
