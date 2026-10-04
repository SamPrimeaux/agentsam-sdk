#!/usr/bin/env node
/**
 * Normal CMS package verification.
 * May run while private:true. Validates everything except publishability.
 * Use verify:cms-release when flipping private:false and proving a fresh consumer.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(readFileSync(join(packageRoot, rel), 'utf8'));

const rootPkg = readJson('package.json');
const frontendPkg = readJson('frontend/package.json');
const backendPkg = readJson('backend/package.json');
const sharedPkg = readJson('shared/cms/package.json');
const parity = readJson('acceptance/cms-parity.v1.json');
const adapterSrc = readFileSync(join(packageRoot, 'shared/cms/src/adapter.ts'), 'utf8');

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

assert.equal(rootPkg.name, '@inneranimalmedia/client-cms-editor');
assert.equal(parity.schema, 'agentsam.cms.parity.v1');
assert.ok(existsSync(join(packageRoot, 'acceptance/cms-parity.v1.json')));
assert.ok(existsSync(join(packageRoot, 'reference/harvest/HARVEST_RECEIPT.json')));
assert.ok(existsSync(join(packageRoot, 'shared/cms/src/adapter.ts')));
assert.ok(existsSync(join(packageRoot, 'shared/cms/src/host.ts')));

if (!String(rootPkg.version || '').includes('alpha')) {
  warn('version is not an alpha prerelease yet');
}

if (rootPkg.private === true) {
  warn('package is private:true (expected until verify:cms-release is green)');
}

if (!rootPkg.files || !Array.isArray(rootPkg.files) || rootPkg.files.length === 0) {
  fail('root package.json missing explicit "files" for publish');
}

if ((rootPkg.files || []).some((f) => String(f).includes('reference/harvest') || f === 'reference')) {
  fail('reference/harvest must not be in package.json files[] (repo evidence only)');
}

if (!rootPkg.exports || typeof rootPkg.exports !== 'object') {
  fail('root package.json missing "exports" map');
}

for (const [key, target] of Object.entries(rootPkg.exports)) {
  if (key === './package.json' || key === './acceptance') continue;
  const importPath =
    typeof target === 'string'
      ? target
      : target?.import || target?.default || target?.types || '';
  if (typeof importPath === 'string' && importPath.endsWith('.ts')) {
    fail(`export ${key} points at TypeScript source (${importPath}); publishable exports must be built dist JS`);
  }
  if (typeof importPath === 'string' && importPath.includes('/src/')) {
    fail(`export ${key} points at src/ (${importPath}); use dist/`);
  }
}

const REQUIRED_ADAPTER = [
  'listSites',
  'getSite',
  'createSite',
  'updateSite',
  'deleteSite',
  'loadSite',
  'deletePage',
  'deleteSection',
  'deleteBlock',
  'getPage',
  'listSections',
  'getSection',
  'listBlocks',
  'getBlock',
  'createBlock',
  'updateBlock',
  'getRevision',
  'restoreRevision',
  'previewDraft',
  'getPublishedRevision',
  'listAssets',
  'getAsset',
  'uploadAsset',
  'updateAsset',
  'deleteAsset',
];
for (const name of REQUIRED_ADAPTER) {
  if (!adapterSrc.includes(name)) {
    fail(`CmsEditorAdapter missing required capability ${name}`);
  }
}
if (/createBlock\?\(/.test(adapterSrc) || /updateBlock\?\(/.test(adapterSrc) || /listAssets\?\(/.test(adapterSrc)) {
  fail('CmsEditorAdapter must not mark createBlock/updateBlock/listAssets as optional');
}

const versions = [rootPkg.version, frontendPkg.version, backendPkg.version, sharedPkg.version];
if (new Set(versions).size !== 1) {
  fail(
    `workspace versions must match root (${rootPkg.version}); got frontend=${frontendPkg.version} backend=${backendPkg.version} shared=${sharedPkg.version}`,
  );
}

function scanDeps(pkg, label) {
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg[section] || {};
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version !== 'string') continue;
      if (version.startsWith('file:') || version.startsWith('link:')) {
        fail(`${label} ${section} has non-portable dependency ${name}=${version}`);
      }
      if (version.startsWith('workspace:')) {
        fail(`${label} ${section} has unpublished workspace: dependency ${name}=${version}`);
      }
      if (isAbsolute(version) || /^[a-z]:\\/i.test(version)) {
        fail(`${label} ${section} has absolute filesystem dependency ${name}=${version}`);
      }
      if (/^\.\.(\/|\\)/.test(version)) {
        fail(`${label} ${section} has parent-relative filesystem dependency ${name}=${version}`);
      }
    }
  }
}

for (const [label, pkg] of [
  ['frontend', frontendPkg],
  ['backend', backendPkg],
  ['shared', sharedPkg],
  ['root', rootPkg],
]) {
  scanDeps(pkg, label);
}

for (const [label, pkg] of [
  ['frontend', frontendPkg],
  ['backend', backendPkg],
  ['shared', sharedPkg],
]) {
  if (pkg.private !== true) {
    fail(`${label} nested package must remain private:true (bundled into root product only)`);
  }
}

const SKIP_SCAN = new Set(['node_modules', 'dist', 'coverage', '.git', 'reference', 'acceptance']);
const RUNTIME_SCAN_EXT = /\.(ts|tsx|js|mjs|cjs)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_SCAN.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs|json|md|html|css)$/.test(name)) out.push(full);
  }
  return out;
}

const IMPORT_RE = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveImport(fromFile, spec) {
  if (!spec || spec.startsWith('node:')) return { ok: true, resolved: spec };
  if (!spec.startsWith('.') && !spec.startsWith('/')) {
    return { ok: true, bare: spec };
  }
  const base = spec.startsWith('/') ? spec : resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    join(base, 'index.ts'),
    join(base, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return { ok: true, resolved: candidate };
  }
  return { ok: false, resolved: base };
}

function isInsidePackage(absPath) {
  const rel = relative(packageRoot, absPath);
  return rel && !rel.startsWith('..') && !isAbsolute(rel);
}

const DEPLOYMENT_AUTHORITY = [
  { re: /\/Users\/[^/'"\s]+/i, label: 'absolute machine path' },
  { re: /\bCLOUDFLARE_ACCOUNT_ID\s*=\s*['"][a-f0-9]{32}/i, label: 'hardcoded Cloudflare account id' },
  { re: /binding-d1:primary/, label: 'invented binding-d1:primary resource' },
  { re: /AgentSam platform D1 \(env\.DB\)/, label: 'invented env.DB product source label' },
];

for (const file of walk(packageRoot)) {
  const rel = relative(packageRoot, file);
  if (rel.startsWith('scripts/verify-')) continue;
  if (rel === 'tsup.config.ts') continue;
  if (rel.includes('/editor/legacy/')) continue;
  if (!RUNTIME_SCAN_EXT.test(rel)) continue;
  const text = readFileSync(file, 'utf8');

  let match;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(text))) {
    const spec = match[1] || match[2];
    if (!spec) continue;
    const result = resolveImport(file, spec);
    if (result.bare) {
      if (spec.startsWith('@/') || spec.includes('/packages/')) {
        fail(`${rel}: suspicious bare import ${spec}`);
      }
      continue;
    }
    if (!result.ok) {
      fail(`${rel}: unresolved relative import ${spec}`);
      continue;
    }
    if (!isInsidePackage(result.resolved)) {
      fail(`${rel}: import escapes package root (${spec} -> ${result.resolved})`);
    }
    if (rel.startsWith('frontend/') && !rel.includes('/editor/legacy/')) {
      const targetRel = relative(packageRoot, result.resolved);
      if (targetRel.startsWith('backend/src/')) {
        fail(`${rel}: frontend must not import backend implementation (${spec})`);
      }
    }
  }

  if (rel === 'backend/src/api/client.ts') {
    if (/Promise\.resolve\(\{\}\)/.test(text)) {
      fail('backend/src/api/client.ts must not fabricate empty write success');
    }
  }
  if (rel === 'backend/src/demo-bootstrap.ts') {
    fail('backend/src/demo-bootstrap.ts must be deleted — use starter-packs/heuristic');
  }

  if (
    (rel.startsWith('shared/') || rel.startsWith('frontend/') || rel.startsWith('backend/')) &&
    !rel.includes('/editor/legacy/')
  ) {
    for (const rule of DEPLOYMENT_AUTHORITY) {
      if (rule.re.test(text)) fail(`${rel}: contains deployment authority (${rule.label})`);
    }
  }
}

function findNestedNodeModules(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' && dir !== packageRoot) {
      acc.push(relative(packageRoot, join(dir, name)));
      continue;
    }
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
    const full = join(dir, name);
    try {
      if (statSync(full).isDirectory()) findNestedNodeModules(full, acc);
    } catch {
      // ignore
    }
  }
  return acc;
}
const nested = findNestedNodeModules(packageRoot);
if (nested.length) fail(`nested node_modules present: ${nested.slice(0, 10).join(', ')}`);

const bin = readFileSync(join(packageRoot, 'bin/agentsam-cms.mjs'), 'utf8');
if (/PERSISTENCE\s*=\s*new Set\(\[[^\]]*localStorage/.test(bin)) {
  fail('bin/agentsam-cms.mjs still offers localStorage as a persistence authority choice');
}

const distRequired = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/adapter.js',
  'dist/adapter.d.ts',
  'dist/sqlite-adapter.js',
  'dist/sqlite-adapter.d.ts',
  'dist/import/index.js',
  'dist/local/index.js',
  'dist/shared/index.js',
  'dist/shared/index.d.ts',
  'dist/styles/studio.css',
  'bin/agentsam-cms.js',
];
for (const rel of distRequired) {
  if (!existsSync(join(packageRoot, rel))) {
    fail(`missing built artifact ${rel} — run npm run build before verify:cms-package`);
  }
}

if (!existsSync(join(packageRoot, 'starter-packs/blank/index.ts'))) {
  fail('missing starter-packs/blank — Blank first-run starter required');
}
if (!existsSync(join(packageRoot, 'fixtures/donor-themes/cypress/site/index.html'))) {
  fail('missing fixtures/donor-themes/cypress — real import donor fixture required for alpha');
}

if (rootPkg.bin?.['agentsam-cms'] !== 'bin/agentsam-cms.js') {
  fail('package.json bin.agentsam-cms must be "bin/agentsam-cms.js" (npm-publish safe)');
}

const distForbidden = [
  'dist/adapters/sqlite.d.ts',
  'dist/frontend',
  'dist/shared/cms',
  'dist/backend/src',
  'dist/fixtures',
  '.dts-tmp',
];
for (const rel of distForbidden) {
  if (existsSync(join(packageRoot, rel))) {
    fail(`internal/compiler-dump path must not remain in publish surface: ${rel}`);
  }
}

// Root/browser product must not pull node:sqlite; only the Node subpath may.
for (const rel of ['dist/index.js', 'dist/adapter.js', 'dist/shared/index.js']) {
  const text = readFileSync(join(packageRoot, rel), 'utf8');
  if (text.includes('node:sqlite') || text.includes('DatabaseSync')) {
    fail(`${rel} must not reference node:sqlite / DatabaseSync (use ./sqlite-adapter)`);
  }
}
const sqliteJs = readFileSync(join(packageRoot, 'dist/sqlite-adapter.js'), 'utf8');
if (!sqliteJs.includes('node:sqlite')) {
  fail('dist/sqlite-adapter.js must import node:sqlite (Node-only subpath)');
}

const allowedBare = new Set([
  ...Object.keys(rootPkg.dependencies || {}),
  ...Object.keys(rootPkg.peerDependencies || {}),
  ...Object.keys(rootPkg.optionalDependencies || {}),
  'react',
  'react-dom',
  'react/jsx-runtime',
  'node:sqlite',
  'node:fs',
  'node:path',
  'node:url',
  'node:os',
  'node:module',
  'node:child_process',
  'node:crypto',
  'node:http',
  'fs',
  'path',
  'os',
  'url',
  'module',
  'child_process',
  'crypto',
  'http',
]);

function walkDistJs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkDistJs(full, out);
    else if (name.endsWith('.js') && !name.endsWith('.map.js')) out.push(full);
  }
  return out;
}

for (const file of walkDistJs(join(packageRoot, 'dist'))) {
  const rel = relative(packageRoot, file);
  const text = readFileSync(file, 'utf8');
  let match;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(text))) {
    const spec = match[1] || match[2];
    if (!spec) continue;
    if (spec.startsWith('node:')) continue;
    if (spec.startsWith('.')) {
      const resolved = resolve(dirname(file), spec);
      const withJs = existsSync(resolved)
        ? resolved
        : existsSync(`${resolved}.js`)
          ? `${resolved}.js`
          : resolved;
      if (!isInsidePackage(withJs)) {
        fail(`${rel}: dist relative import escapes package (${spec})`);
      }
      continue;
    }
    if (isAbsolute(spec)) {
      fail(`${rel}: dist import uses absolute filesystem path (${spec})`);
    }
    const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    if (!allowedBare.has(spec) && !allowedBare.has(pkgName)) {
      fail(`${rel}: dist bare import ${spec} missing from root dependencies/peerDependencies`);
    }
  }
}

if (existsSync(join(packageRoot, 'backend/src/demo-bootstrap.ts'))) {
  fail('backend/src/demo-bootstrap.ts still present — delete; use starter-packs/heuristic');
}
if (!existsSync(join(packageRoot, 'starter-packs/heuristic/index.ts'))) {
  fail('missing starter-packs/heuristic — stock starter pack required');
}

if (warnings.length) for (const w of warnings) console.warn(`warn: ${w}`);
if (errors.length) {
  console.error(`verify-cms-package FAILED (${errors.length})`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log(
  `verify-cms-package OK ${rootPkg.name}@${rootPkg.version} · private=${Boolean(rootPkg.private)} · dist ready · structural portability · no file: deps`,
);
