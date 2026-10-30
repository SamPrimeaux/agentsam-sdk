import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_MANIFEST, LOCAL_STUDIO, REPO_ROOT, planIncludedApps } from './build-included-apps.mjs';

function fakeRepo(apps, included) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'included-apps-'));
  for (const [dir, manifest] of Object.entries(apps)) {
    fs.mkdirSync(path.join(root, 'apps', dir), { recursive: true });
    fs.writeFileSync(path.join(root, 'apps', dir, 'agentsam.app.json'), JSON.stringify(manifest));
  }
  const manifestPath = path.join(root, 'desktop.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ included_apps: included }));
  return { root, manifestPath };
}
const embed = (stage, extra = {}) => ({ stage, build: { command: ['npm', 'run', 'build', '--', '--base={base}'], output: 'dist', ...extra } });
const plan = (apps, included) => {
  const { root, manifestPath } = fakeRepo(apps, included);
  return planIncludedApps({ repoRoot: root, manifestPath });
};

test('real repo: included apps resolve from their own manifests', () => {
  const { plans } = planIncludedApps();
  const manifest = JSON.parse(fs.readFileSync(DEFAULT_MANIFEST, 'utf8'));
  assert.deepEqual(plans.map((p) => p.id), manifest.included_apps);
  const cad = plans.find((p) => p.id === 'cad-creator');
  assert.ok(cad, 'cad-creator must stay included');
  assert.equal(cad.base, '/cad-creator/');
  assert.ok(cad.command.includes('--base=/cad-creator/'));
  assert.ok(cad.cwd.endsWith(path.join('apps', 'cad-creator')));
  assert.ok(cad.output.endsWith(path.join('frontend', 'dist')));
  assert.ok(cad.publicDir.endsWith(path.join('frontend', 'public', 'cad-creator')));
  const movie = plans.find((p) => p.id === 'agentsam-copro-studio');
  assert.ok(movie, 'MovieMode must be an included application');
  assert.equal(movie.base, '/moviemode/');
  assert.deepEqual(movie.command.slice(-1), ['--base=/moviemode/']);
  assert.ok(movie.output.endsWith(path.join('agentsam-copro-studio', 'dist')));
});

test('a new app needs only an embed block — no host code change', () => {
  const { plans } = plan({ foo: { schema: 'agentsam.app.v1', id: 'foo', name: 'Foo', kind: 'app', embed: embed('foo-ui') } }, ['foo']);
  assert.equal(plans[0].base, '/foo-ui/');
  assert.deepEqual(plans[0].command.slice(-1), ['--base=/foo-ui/']);
});

test('unknown id fails and names the known ids', () => {
  assert.throws(
    () => plan({ foo: { schema: 'agentsam.app.v1', id: 'foo', name: 'Foo', kind: 'app', embed: embed('foo') } }, ['nope']),
    /matches no agentsam\.app\.json \(known: foo\)/,
  );
});

test('an included app without embed.build is rejected', () => {
  assert.throws(
    () => plan({ foo: { schema: 'agentsam.app.v1', id: 'foo', name: 'Foo', kind: 'app' } }, ['foo']),
    /declares no embed\.build/,
  );
});

test('embed paths cannot escape the app directory', () => {
  assert.throws(
    () => plan({ foo: { schema: 'agentsam.app.v1', id: 'foo', name: 'Foo', kind: 'app', embed: embed('foo', { output: '../../etc' }) } }, ['foo']),
    /escapes its directory/,
  );
});

test('two apps cannot claim the same stage', () => {
  assert.throws(
    () => plan({
      a: { schema: 'agentsam.app.v1', id: 'aa', name: 'A', kind: 'app', embed: embed('same') },
      b: { schema: 'agentsam.app.v1', id: 'bb', name: 'B', kind: 'app', embed: embed('same') },
    }, ['aa', 'bb']),
    /both declare embed\.stage "same"/,
  );
});

test('no per-app build logic is hardcoded in Local Studio build tooling', () => {
  const scripts = path.join(LOCAL_STUDIO, 'scripts');
  assert.equal(fs.existsSync(path.join(scripts, 'build-cad-frontend.mjs')), false, 'per-app builder must stay deleted');
  const builder = fs.readFileSync(path.join(scripts, 'build-included-apps.mjs'), 'utf8').replace(/\/\*\*[\s\S]*?\*\//, '');
  assert.doesNotMatch(builder, /BUILDERS|cad-creator|cad-frontend/);
  const verify = fs.readFileSync(path.join(scripts, 'verify-cloudflare-output.mjs'), 'utf8');
  assert.doesNotMatch(verify, /cad-creator/);
  const pkg = fs.readFileSync(path.join(LOCAL_STUDIO, 'package.json'), 'utf8');
  assert.doesNotMatch(pkg, /build-cad-frontend/);
});

test('every included stage is gitignored (generated output never gets committed)', () => {
  const ignore = fs.readFileSync(path.join(LOCAL_STUDIO, '.gitignore'), 'utf8');
  for (const p of planIncludedApps().plans) {
    assert.ok(ignore.includes(`frontend/public/${p.stage}/`), `.gitignore must list frontend/public/${p.stage}/`);
  }
  assert.ok(REPO_ROOT.length > 0);
});

test('generic --only flag stages one registered application without building other apps', () => {
  const command = path.join(LOCAL_STUDIO, 'scripts', 'build-included-apps.mjs');
  const output = execFileSync(process.execPath, [command, '--dry-run', '--only', 'agentsam-copro-studio'], { encoding: 'utf8' });
  const plans = JSON.parse(output);
  assert.deepEqual(plans.map((plan) => plan.id), ['agentsam-copro-studio']);
  assert.equal(plans[0].base, '/moviemode/');
});

test('an unscoped included app invocation refuses a broad rebuild', () => {
  const command = path.join(LOCAL_STUDIO, 'scripts', 'build-included-apps.mjs');
  assert.throws(() => execFileSync(process.execPath, [command], {encoding:'utf8', stdio:['ignore','pipe','pipe']}), /Refusing to rebuild every installed app/);
  const all = JSON.parse(execFileSync(process.execPath,[command,'--dry-run','--all'],{encoding:'utf8'}));
  assert.deepEqual(all.map(p=>p.id),planIncludedApps().plans.map(p=>p.id));
});
test('default desktop/host build scripts never rebuild included apps implicitly',()=>{
  const scripts=JSON.parse(fs.readFileSync(path.join(LOCAL_STUDIO,'package.json'),'utf8')).scripts;
  assert.doesNotMatch(scripts.build,/node scripts\/build-included-apps\.mjs(?! --stage)/);
  assert.doesNotMatch(scripts['build:desktop'],/node scripts\/build-included-apps\.mjs/);
  assert.match(scripts['build:included:all'],/--all/);
});

test('a normal host build does not sync websites or test theme catalogs automatically',()=>{
  const scripts=JSON.parse(fs.readFileSync(path.join(LOCAL_STUDIO,'package.json'),'utf8')).scripts;
  assert.doesNotMatch(scripts.build,/sync-public-site|build-included-apps\.mjs(?! --stage)/);
  assert.doesNotMatch(scripts['verify:desktop'],/smoke:themes|smoke:cms-site-fidelity|smoke:creator-suite/);
  assert.match(scripts['verify:desktop:all'],/smoke:themes/);
});

test('explicit Cloudflare release commands build every registered included app before verification',()=>{
  const scripts=JSON.parse(fs.readFileSync(path.join(LOCAL_STUDIO,'package.json'),'utf8')).scripts;
  assert.match(scripts['cf:build'],/npm run build:included:all/);
  assert.match(scripts['cf:build'],/npm run build && npm run cf:verify-output && npm run cf:smoke:worker/);
  assert.match(scripts['cf:dry-run'],/npm run cf:build/);
  assert.match(scripts['cf:deploy'],/npm run cf:build/);
  assert.doesNotMatch(scripts.build,/build:included:all/,'ordinary development builds remain scoped');
  assert.doesNotMatch(scripts['build:desktop'],/build:included:all/,'desktop builds remain scoped');
});
