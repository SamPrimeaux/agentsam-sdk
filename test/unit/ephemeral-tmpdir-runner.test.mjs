import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runner = path.join(repoRoot, 'scripts/with-ephemeral-tmpdir.mjs');
const home = path.resolve(process.env.HOME || homedir());

function runChild(source) {
  const env = { ...process.env };
  delete env.AGENTSAM_RUN_TMPDIR;
  return spawnSync(process.execPath, [runner, '--', process.execPath, '-e', source], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  });
}

function assertOutsideHome(candidate) {
  const relative = path.relative(home, path.resolve(candidate));
  assert.ok(relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), `${candidate} must be outside ${home}`);
}

test('temporary run directory is outside home and removed after success', () => {
  const source = `
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = process.env.TMPDIR;
    fs.writeFileSync(path.join(os.tmpdir(), 'success-marker'), 'ok');
    process.stdout.write(JSON.stringify({ dir, logsMax: process.env.npm_config_logs_max }));
  `;
  const result = runChild(source);
  assert.equal(result.status, 0, result.stderr);
  const details = JSON.parse(result.stdout);
  assertOutsideHome(details.dir);
  assert.equal(details.logsMax, '0');
  assert.equal(existsSync(details.dir), false, 'successful run directory should be removed');
});

test('temporary run directory is removed when the command fails', () => {
  const result = runChild(`process.stdout.write(process.env.TMPDIR); process.exit(23);`);
  assert.equal(result.status, 23);
  const dir = result.stdout.trim();
  assertOutsideHome(dir);
  assert.equal(existsSync(dir), false, 'failed run directory should be removed');
});

test('nested runner reuses the parent directory and does not remove it early', () => {
  const nestedSource = `process.stdout.write(process.env.AGENTSAM_RUN_TMPDIR);`;
  const outerSource = `
    const fs = require('node:fs');
    const { spawnSync } = require('node:child_process');
    const dir = process.env.AGENTSAM_RUN_TMPDIR;
    const nested = spawnSync(process.execPath, [${JSON.stringify(runner)}, '--', process.execPath, '-e', ${JSON.stringify(nestedSource)}], { encoding: 'utf8', env: process.env });
    if (nested.status !== 0 || nested.stdout !== dir || !fs.existsSync(dir)) process.exit(41);
    process.stdout.write(dir);
  `;
  const result = runChild(outerSource);
  assert.equal(result.status, 0, result.stderr);
  const dir = result.stdout.trim();
  assertOutsideHome(dir);
  assert.equal(existsSync(dir), false, 'outer run should remove the shared directory after nested work finishes');
});


test('temporary run directory is removed when the runner is interrupted', { skip: process.platform === 'win32' }, async () => {
  const env = { ...process.env };
  delete env.AGENTSAM_RUN_TMPDIR;
  const child = spawn(process.execPath, [runner, '--', process.execPath, '-e', `process.stdout.write(process.env.TMPDIR + '\\n'); setInterval(() => {}, 1000);`], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';
  const dir = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('runner did not publish its temp directory within 5 seconds'));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf('\n');
      if (newline >= 0) {
        clearTimeout(timeout);
        resolve(buffer.slice(0, newline).trim());
      }
    });
  });

  child.kill('SIGTERM');
  const [code, signal] = await once(child, 'exit');
  assert.equal(signal, null);
  assert.equal(code, 143);
  assertOutsideHome(dir);
  assert.equal(existsSync(dir), false, 'interrupted run directory should be removed');
});
