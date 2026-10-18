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
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

test('standalone SDK tarball installs and launches with authenticated release dependencies', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-sdk-packed-'));
  try {
    const packDir = path.join(tmp, 'packs');
    const consumer = path.join(tmp, 'consumer');
    fs.mkdirSync(packDir);
    fs.mkdirSync(consumer);
    const rootTar = run('npm', ['pack', '--silent', '--pack-destination', packDir], root);
    fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({
      name: 'agentsam-sdk-packed-consumer',
      version: '1.0.0',
      private: true,
      type: 'module',
    }, null, 2) + '\n');

    // A pending npm release cannot fetch a version that does not exist.
    // In CI candidate mode, first seed the EXACT matching errors-package
    // tarball from this checkout, without linking a monorepo workspace.
    // Postpublication verifies a standalone root-tarball install instead.
    if (process.env.AGENTSAM_REQUIRE_PUBLISHED_SDK !== '1') {
      const errorTar = run('npm', [
        'pack', '--silent', '--pack-destination', packDir,
      ], path.join(root, 'packages/agentsam-errors'));
      run('npm', [
        'install', '--ignore-scripts', '--no-audit', '--no-fund',
        path.join(packDir, errorTar),
      ], consumer);
    }
    // No sibling workspaces, second checkout, CMS source dependency or NODE_PATH.
    run('npm', [
      'install', '--ignore-scripts', '--no-audit', '--no-fund',
      path.join(packDir, rootTar),
    ], consumer);

    const installed = JSON.parse(fs.readFileSync(
      path.join(consumer, 'node_modules/@inneranimalmedia/agentsam-sdk/package.json'), 'utf8'));
    assert.equal(installed.dependencies?.['@inneranimalmedia/agentsam-cms'], undefined);
    const script = [
      "const sdk = await import('@inneranimalmedia/agentsam-sdk');",
      "const sdkErrors = await import('@inneranimalmedia/agentsam-sdk/errors');",
      "const errors = await import('@inneranimalmedia/agentsam-errors');",
      "const goap = await import('@inneranimalmedia/agentsam-sdk/goap');",
      "const sam = await import('@inneranimalmedia/agentsam-sdk/sam');",
      "if (!sam.createCmsOperations || !sam.CMS_OPERATION_CONTRACTS) throw new Error('bundled CMS runtime unavailable');",
      "if (sdkErrors.AgentSamError !== errors.AgentSamError) throw new Error('canonical errors identity mismatch');",
      "if (!goap || Object.keys(goap).length === 0 || !sdk) throw new Error('SDK / GOAP exports missing');",
    ].join('\n');
    run(process.execPath, ['--input-type=module', '-e', script], consumer);
    const cli = path.join(consumer, 'node_modules/.bin/agentsam');
    for (const argv of [['--version'], ['--help'], ['models', '--help'], ['rust', '--help']]) {
      const output = run(cli, argv, consumer);
      assert.ok(output.length > 0, 'packaged agentsam ' + argv.join(' ') + ' returned no output');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
