#!/usr/bin/env node
/**
 * Browser-safety smoke — pack/install into a fresh temp consumer, then prove the
 * root package import graph does not pull node:sqlite (or other Node-only builtins)
 * when resolved/bundled for platform=browser.
 *
 * ./sqlite-adapter is intentionally Node-only and is NOT tested here.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sdkRoot = join(packageRoot, '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const NODE_ONLY_BUILTINS = new Set([
  'node:sqlite',
  'sqlite',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'node:child_process',
  'node:worker_threads',
  'fs',
  'path',
  'child_process',
]);

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || '');
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status})`);
  }
  return result;
}

/** Fresh-consumer npm must not inherit this package's allow-scripts .npmrc via npm_config_*. */
function consumerNpmEnv() {
  const env = { ...process.env, npm_config_ignore_scripts: 'true' };
  delete env.npm_config_allow_scripts;
  delete env.npm_config_allowScripts;
  return env;
}

const pack = run(npm, ['pack', '--json'], { cwd: packageRoot });
const packed = JSON.parse(pack.stdout)[0];
assert.equal(packed.name, '@inneranimalmedia/client-cms-editor');
const tarballName = packed.filename;
const tarballPath = join(packageRoot, tarballName);
assert.ok(existsSync(tarballPath), `missing tarball ${tarballPath}`);

const consumer = mkdtempSync(join(tmpdir(), 'cms-browser-smoke-'));
const consumerTarball = join(consumer, tarballName);
cpSync(tarballPath, consumerTarball);

try {
  assert.ok(!consumer.startsWith(sdkRoot), 'consumer temp dir must be outside agentsam-sdk');

  writeFileSync(
    join(consumer, 'package.json'),
    `${JSON.stringify(
      {
        name: 'cms-editor-browser-smoke',
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
  writeFileSync(join(consumer, '.npmrc'), 'ignore-scripts=true\n');

  writeFileSync(
    join(consumer, 'entry.jsx'),
    `import { CmsEditor } from '@inneranimalmedia/client-cms-editor';\nexport default CmsEditor;\n`,
  );

  run(npm, ['install'], { cwd: consumer, stdio: 'inherit', env: consumerNpmEnv() });
  run(npm, ['install', `file:${consumerTarball}`], {
    cwd: consumer,
    stdio: 'inherit',
    env: consumerNpmEnv(),
  });

  const installedRoot = join(consumer, 'node_modules/@inneranimalmedia/client-cms-editor');
  for (const rel of ['dist/index.js', 'dist/adapter.js', 'dist/shared/index.js']) {
    const text = readFileSync(join(installedRoot, rel), 'utf8');
    assert.equal(
      text.includes('node:sqlite'),
      false,
      `${rel} must not reference node:sqlite`,
    );
  }
  assert.ok(
    readFileSync(join(installedRoot, 'dist/sqlite-adapter.js'), 'utf8').includes('node:sqlite'),
    'sqlite-adapter must remain Node-only (sanity)',
  );

  const outfile = join(consumer, 'browser-bundle.js');
  let result;
  try {
    result = await esbuild.build({
      absWorkingDir: consumer,
      entryPoints: ['entry.jsx'],
      bundle: true,
      write: true,
      outfile,
      format: 'esm',
      platform: 'browser',
      jsx: 'automatic',
      metafile: true,
      logLevel: 'silent',
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    });
  } catch (error) {
    const msg = String(error?.message || error);
    if (/node:sqlite|Could not resolve "node:|Browser.*node:/i.test(msg)) {
      throw new Error(`browser bundle pulled Node-only module: ${msg}`);
    }
    throw error;
  }

  const inputs = Object.keys(result.metafile?.inputs || {});
  const hits = inputs.filter((input) => {
    const normalized = input.replace(/\\/g, '/');
    if (normalized.includes('/sqlite-adapter')) return true;
    for (const builtin of NODE_ONLY_BUILTINS) {
      if (normalized === builtin || normalized.endsWith(`/${builtin}`)) return true;
    }
    return false;
  });
  assert.equal(
    hits.length,
    0,
    `browser dependency graph reached Node-only paths: ${hits.join(', ')}`,
  );

  const bundleText = readFileSync(outfile, 'utf8');
  assert.equal(bundleText.includes('node:sqlite'), false, 'browser bundle contains node:sqlite');
  assert.equal(bundleText.includes('DatabaseSync'), false, 'browser bundle contains DatabaseSync');

  assert.ok(
    existsSync(join(installedRoot, 'dist/index.js')),
    'installed package missing dist/index.js',
  );

  console.log(
    `verify-cms-browser-smoke OK · root import bundles for platform=browser · no node:sqlite in graph`,
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
