#!/usr/bin/env node
/**
 * CMS release verification — requires private:false and a fresh outside-monorepo consumer proof.
 * Do not weaken checks. Run only when ready to publish alpha.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sdkRoot = join(packageRoot, '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const readJson = (abs) => JSON.parse(readFileSync(abs, 'utf8'));

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    ...opts,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || '');
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status})`);
  }
  return result;
}

const rootPkg = readJson(join(packageRoot, 'package.json'));
assert.equal(rootPkg.name, '@inneranimalmedia/client-cms-editor');

if (rootPkg.private === true) {
  console.error('verify:cms-release FAILED: private must be false before release proof');
  process.exit(1);
}

// Build + normal package gate first
run(npm, ['run', 'build'], { cwd: packageRoot, stdio: 'inherit' });
run(npm, ['run', 'verify:cms-package'], { cwd: packageRoot, stdio: 'inherit' });
run(npm, ['run', 'pack:check'], { cwd: packageRoot, stdio: 'inherit' });

const pack = run(npm, ['pack', '--json'], { cwd: packageRoot });
const packed = JSON.parse(pack.stdout)[0];
assert.equal(packed.name, rootPkg.name);
assert.equal(packed.version, rootPkg.version);
const tarballName = packed.filename;
const tarballPath = join(packageRoot, tarballName);
assert.ok(existsSync(tarballPath), `missing tarball ${tarballPath}`);

const consumer = mkdtempSync(join(tmpdir(), 'cms-editor-consumer-'));
const consumerTarball = join(consumer, tarballName);
cpSync(tarballPath, consumerTarball);

try {
  // Ensure consumer is outside the monorepo path
  assert.ok(!consumer.startsWith(sdkRoot), 'consumer temp dir must be outside agentsam-sdk');

  writeFileSync(
    join(consumer, 'package.json'),
    `${JSON.stringify(
      {
        name: 'cms-editor-fresh-consumer',
        private: true,
        type: 'module',
        dependencies: {
          react: '^19.2.0',
          'react-dom': '^19.2.0',
        },
      },
      null,
      2,
    )}\n`,
  );

  run(npm, ['install', '--ignore-scripts'], { cwd: consumer, stdio: 'inherit' });
  run(npm, ['install', `file:${consumerTarball}`, '--ignore-scripts'], {
    cwd: consumer,
    stdio: 'inherit',
  });

  const installed = readJson(join(consumer, 'node_modules/@inneranimalmedia/client-cms-editor/package.json'));
  assert.equal(installed.name, rootPkg.name);
  assert.equal(installed.version, rootPkg.version);
  assert.notEqual(installed.private, true);

  const lock = readJson(join(consumer, 'package-lock.json'));
  const lockText = JSON.stringify(lock);
  if (lockText.includes('"file:../') || lockText.includes('agentsam-sdk/packages')) {
    throw new Error('fresh consumer lock still references monorepo paths');
  }

  const require = createRequire(join(consumer, 'package.json'));
  const resolved = require.resolve('@inneranimalmedia/client-cms-editor');
  assert.ok(resolved.includes('node_modules/@inneranimalmedia/client-cms-editor'));

  const exportKeys = ['.', './adapter', './shared', './backend', './backend/api'];
  for (const key of exportKeys) {
    const target =
      key === '.'
        ? join(consumer, 'node_modules/@inneranimalmedia/client-cms-editor/dist/index.js')
        : join(
            consumer,
            'node_modules/@inneranimalmedia/client-cms-editor',
            key === './adapter'
              ? 'dist/adapter.js'
              : key === './shared'
                ? 'dist/shared/index.js'
                : key === './backend'
                  ? 'dist/backend/index.js'
                  : 'dist/backend/api.js',
          );
    assert.ok(existsSync(target), `missing installed export target for ${key}: ${target}`);
    await import(pathToFileURL(target).href);
  }

  const style = join(
    consumer,
    'node_modules/@inneranimalmedia/client-cms-editor/dist/styles/studio.css',
  );
  assert.ok(existsSync(style), 'studio.css missing from installed package');

  // Prove harvest archaeological folder was not shipped
  const harvest = join(
    consumer,
    'node_modules/@inneranimalmedia/client-cms-editor/reference/harvest',
  );
  assert.equal(existsSync(harvest), false, 'reference/harvest must not ship in npm tarball');

  console.log(
    `verify-cms-release OK ${installed.name}@${installed.version} · fresh consumer ${consumer}`,
  );
} finally {
  try {
    rmSync(tarballPath, { force: true });
  } catch {
    // ignore
  }
  try {
    rmSync(consumer, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
