#!/usr/bin/env node
/**
 * CMS release verification — requires private:false and a fresh outside-monorepo consumer proof.
 * Derives export checks from package.json. Includes adapter semantic smoke.
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

/** Fresh-consumer npm must not inherit this package's allow-scripts .npmrc via npm_config_*. */
function consumerNpmEnv() {
  const env = { ...process.env, npm_config_ignore_scripts: 'true' };
  delete env.npm_config_allow_scripts;
  delete env.npm_config_allowScripts;
  return env;
}

function resolveExportTarget(pkgDir, exportValue) {
  if (typeof exportValue === 'string') return join(pkgDir, exportValue);
  const pathLike = exportValue?.import || exportValue?.default || exportValue?.types;
  if (typeof pathLike !== 'string') return null;
  return join(pkgDir, pathLike);
}

const rootPkg = readJson(join(packageRoot, 'package.json'));
assert.equal(rootPkg.name, '@inneranimalmedia/client-cms-editor');

if (rootPkg.private === true) {
  console.error('verify:cms-release FAILED: private must be false before release proof');
  process.exit(1);
}

// Build + normal package gate + memory + durable SQLite + browser isolation before pack proof
run(npm, ['run', 'build'], { cwd: packageRoot, stdio: 'inherit' });
run(npm, ['run', 'verify:cms-package'], { cwd: packageRoot, stdio: 'inherit' });
run(npm, ['run', 'verify:cms-adapter-smoke'], { cwd: packageRoot, stdio: 'inherit' });
run(npm, ['run', 'verify:cms-sqlite-smoke'], { cwd: packageRoot, stdio: 'inherit' });
run(npm, ['run', 'verify:cms-browser-smoke'], { cwd: packageRoot, stdio: 'inherit' });
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
  writeFileSync(join(consumer, '.npmrc'), 'ignore-scripts=true\n');

  run(npm, ['install'], {
    cwd: consumer,
    stdio: 'inherit',
    env: consumerNpmEnv(),
  });
  run(npm, ['install', `file:${consumerTarball}`], {
    cwd: consumer,
    stdio: 'inherit',
    env: consumerNpmEnv(),
  });

  const installedRoot = join(consumer, 'node_modules/@inneranimalmedia/client-cms-editor');
  const installed = readJson(join(installedRoot, 'package.json'));
  assert.equal(installed.name, rootPkg.name);
  assert.equal(installed.version, rootPkg.version);
  assert.notEqual(installed.private, true);

  const lock = readJson(join(consumer, 'package-lock.json'));
  const lockText = JSON.stringify(lock);
  if (lockText.includes('"file:../') || lockText.includes('agentsam-sdk/packages')) {
    throw new Error('fresh consumer lock still references monorepo paths');
  }

  assert.ok(
    existsSync(join(installedRoot, 'dist/index.js')),
    'installed package missing dist/index.js',
  );

  // Derive EVERY declared public export from the installed package.json
  const exportsMap = installed.exports || {};
  assert.ok(Object.keys(exportsMap).length > 0, 'installed package missing exports');
  for (const [key, target] of Object.entries(exportsMap)) {
    const abs = resolveExportTarget(installedRoot, target);
    assert.ok(abs && existsSync(abs), `missing installed export target for ${key}: ${abs}`);
    if (abs.endsWith('.js')) {
      await import(pathToFileURL(abs).href);
    } else if (abs.endsWith('.css') || abs.endsWith('.json')) {
      // existence is enough for non-JS exports
      readFileSync(abs);
    }
  }

  // Installed-package runtime smoke: CmsEditor + temporary adapter, no workbench dep
  const mod = await import(pathToFileURL(join(installedRoot, 'dist/index.js')).href);
  assert.ok(mod.CmsEditor || mod.default, 'installed CmsEditor missing');
  assert.ok(mod.MemoryCmsAdapter, 'installed MemoryCmsAdapter missing');
  assert.ok(mod.installStarterPack && mod.heuristicStarterPack, 'starter pack API missing');
  const adapter = mod.MemoryCmsAdapter.empty('consumer-site', 'Consumer');
  const installedPack = await mod.installStarterPack(adapter, mod.heuristicStarterPack, {
    siteId: 'consumer-site',
  });
  const pageId = installedPack.pageIds[0];
  await adapter.saveDraft(pageId, { sections: (await adapter.getPage(pageId)).sections });
  const pub = await adapter.publish(pageId);
  assert.ok(pub.publicationId, 'installed adapter publish must return publicationId');
  assert.equal('agentsam-workbench' in (installed.dependencies || {}), false);

  // Prove harvest archaeological folder was not shipped
  assert.equal(
    existsSync(join(installedRoot, 'reference/harvest')),
    false,
    'reference/harvest must not ship in npm tarball',
  );

  // Anti-fake in installed dist
  const indexJs = readFileSync(join(installedRoot, 'dist/index.js'), 'utf8');
  for (const needle of ['useDemoBootstrap', 'demoOk', 'buildDemoCmsBootstrap', '_demo: true', 'demo.localhost']) {
    assert.equal(indexJs.includes(needle), false, `installed dist contains fake machinery: ${needle}`);
  }

  console.log(
    `verify-cms-release OK ${installed.name}@${installed.version} · exports=${Object.keys(exportsMap).length} · fresh consumer ${consumer}`,
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
