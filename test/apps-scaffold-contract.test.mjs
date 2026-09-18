import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productApps = ['local-studio', 'cad-creator', 'client-cms-editor'];
const at = (...parts) => path.join(root, ...parts);
const exists = (...parts) => fs.existsSync(at(...parts));

function packageJson(...parts) {
  return JSON.parse(fs.readFileSync(at(...parts, 'package.json'), 'utf8'));
}

function read(...parts) {
  return fs.readFileSync(at(...parts), 'utf8');
}

test('product apps are self-contained npm workspace roots with one lockfile', () => {
  for (const app of productApps) {
    const base = ['apps', app];
    assert.ok(exists(...base, 'package.json'), `${app}: root package.json`);
    assert.ok(exists(...base, 'package-lock.json'), `${app}: root package-lock.json`);
    assert.ok(exists(...base, 'frontend', 'package.json'), `${app}: frontend package`);
    assert.ok(exists(...base, 'backend', 'package.json'), `${app}: backend package`);
    assert.equal(exists(...base, 'frontend', 'package-lock.json'), false, `${app}: no frontend lockfile`);
    assert.equal(exists(...base, 'backend', 'package-lock.json'), false, `${app}: no backend lockfile`);

    const pkg = packageJson(...base);
    assert.deepEqual(pkg.workspaces, ['frontend', 'backend', 'shared/*'], `${app}: canonical workspace list`);
  }
});

test('every product app owns its Cloudflare boundary under backend/', () => {
  for (const app of productApps) {
    const base = ['apps', app, 'backend'];
    assert.ok(exists(...base, 'worker', 'index.js'), `${app}: backend/worker/index.js`);
    assert.ok(exists(...base, 'wrangler.jsonc'), `${app}: backend/wrangler.jsonc`);
    const wrangler = fs.readFileSync(at(...base, 'wrangler.jsonc'), 'utf8');
    assert.match(wrangler, /"main"\s*:\s*"worker\/index\.js"/, `${app}: wrangler main`);
  }
});

test('SDK root is package tooling only and does not own an app Worker', () => {
  assert.equal(exists('wrangler.jsonc'), false);
  assert.equal(exists('worker', 'index.js'), false);
  assert.equal(exists('scripts', 'with-cloudflare-env.sh'), false);

  const rootPkg = packageJson();
  for (const workspace of rootPkg.workspaces || []) {
    assert.equal(workspace.startsWith('apps/'), false, `root workspace must not absorb app workspace: ${workspace}`);
  }
});

test('Local Studio retired donor-era duplicate deployment configs', () => {
  for (const file of ['wrangler.ui.toml', 'wrangler.workmode.toml', 'wrangler.toml.example']) {
    assert.equal(exists('apps', 'local-studio', 'backend', file), false, `retire ${file}`);
  }
});

test('CAD creator app package is curated for third-party installation', () => {
  const pkg = packageJson('apps', 'cad-creator');
  const manifest = JSON.parse(read('apps', 'cad-creator', 'agentsam.app.json'));

  assert.equal(pkg.name, '@inneranimalmedia/agentsam-sdk-cad-creator');
  assert.notEqual(pkg.private, true);
  assert.equal(pkg.bin['agentsam-cad-creator'], 'bin/agentsam-cad-creator.mjs');
  assert.equal(pkg.publishConfig.access, 'public');
  assert.ok(pkg.files.includes('frontend/dist/'));
  assert.ok(pkg.files.includes('backend/dist/'));
  assert.ok(pkg.files.includes('backend/worker/'));
  assert.equal(pkg.files.some((entry) => entry.startsWith('reference')), false);
  assert.equal(pkg.files.some((entry) => entry.includes('.wrangler/state')), false);

  assert.equal(manifest.schema, 'agentsam.app.v1');
  assert.equal(manifest.id, 'cad-creator');
  assert.equal(manifest.package, pkg.name);
  assert.equal(manifest.runtime.local_preview, 'ready');
  assert.equal(manifest.runtime.source_scaffold, 'ready');
  assert.equal(manifest.runtime.cloudflare, 'scaffold');
});

test('CAD creator keeps the robotics runtime lazy and the perception key server-side', () => {
  const app = read('apps', 'cad-creator', 'frontend', 'src', 'App.tsx');
  const lazy = read('apps', 'cad-creator', 'frontend', 'src', 'workspaces', 'robotics', 'lazy.tsx');
  const httpProvider = read('apps', 'cad-creator', 'frontend', 'src', 'lib', 'robotics', 'perception', 'http-provider.ts');
  const perception = read('apps', 'cad-creator', 'backend', 'src', 'robotics', 'perception.ts');
  const worker = read('apps', 'cad-creator', 'backend', 'worker', 'index.js');

  assert.doesNotMatch(app, /from ['\"]\.\/workspaces\/robotics\/RoboticsWorkspace['\"]/);
  assert.doesNotMatch(app, /MujocoSimulationProvider/);
  assert.match(app, /LazyRoboticsWorkspace/);
  assert.match(lazy, /import\(['\"]\.\/RoboticsWorkspace['\"]\)/);
  assert.match(httpProvider, /\/api\/robotics\/perception\/detect/);
  assert.doesNotMatch(httpProvider, /GEMINI_API_KEY|GOOGLE_API_KEY/);
  assert.match(perception, /env\.GEMINI_API_KEY/);
  assert.match(worker, /\/api\/robotics\/perception\/detect/);
});
