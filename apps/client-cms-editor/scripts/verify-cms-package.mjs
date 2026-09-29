#!/usr/bin/env node
/**
 * Normal CMS package verification.
 * May run while private:true. Validates everything except publishability.
 * Use verify:cms-release when flipping private:false and proving a fresh consumer.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// Consumer-safe exports must not point at raw .ts sources for public contract
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

for (const [section, pkg, label] of [
  ['dependencies', frontendPkg, 'frontend'],
  ['devDependencies', frontendPkg, 'frontend'],
  ['dependencies', sharedPkg, 'shared'],
  ['devDependencies', sharedPkg, 'shared'],
  ['dependencies', backendPkg, 'backend'],
  ['dependencies', rootPkg, 'root'],
  ['devDependencies', rootPkg, 'root'],
]) {
  const deps = pkg[section] || {};
  for (const [name, version] of Object.entries(deps)) {
    if (typeof version === 'string' && version.startsWith('file:')) {
      fail(`${label} ${section} has monorepo file: dependency ${name}=${version}`);
    }
    if (typeof version === 'string' && version.startsWith('workspace:')) {
      fail(`${label} ${section} has unpublished workspace: dependency ${name}=${version}`);
    }
  }
}

// Nested packages must not be separately publishable products
for (const [label, pkg] of [
  ['frontend', frontendPkg],
  ['backend', backendPkg],
  ['shared', sharedPkg],
]) {
  if (pkg.private !== true) {
    fail(`${label} nested package must remain private:true (bundled into root product only)`);
  }
}

const FORBIDDEN = [
  { re: /\/Users\/samprimeaux\b/, label: 'absolute developer path /Users/samprimeaux' },
  { re: /\binneranimalmedia\.com\b/i, label: 'inneranimalmedia.com deployment authority' },
  { re: /\binneranimalmedia-business\b/i, label: 'inneranimalmedia-business D1 name' },
  { re: /\bmeauxbility\b/i, label: 'meauxbility deployment string' },
  { re: /binding-d1:primary/, label: 'invented binding-d1:primary resource' },
  { re: /AgentSam platform D1 \(env\.DB\)/, label: 'invented env.DB product source label' },
  { re: /CLOUDFLARE_ACCOUNT_ID\s*=\s*['"][a-f0-9]{32}/i, label: 'hardcoded Cloudflare account id' },
];

const SKIP_SCAN = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  'reference',
  'acceptance',
]);
const DOC_ALLOWLIST = new Set(['AGENTS.md', 'ALPHA.md', 'README.md']);

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

for (const file of walk(packageRoot)) {
  const rel = relative(packageRoot, file);
  if (rel.startsWith('scripts/verify-')) continue;
  if (DOC_ALLOWLIST.has(rel)) continue;
  const text = readFileSync(file, 'utf8');
  for (const rule of FORBIDDEN) {
    if (rule.re.test(text)) fail(`${rel}: contains forbidden ${rule.label}`);
  }
  if (/\bfrom\s+['"]@inneranimalmedia\/agentsam-contracts['"]/.test(text)) {
    fail(`${rel}: imports agentsam-contracts — use CMS host bridges instead`);
  }
  if (/\bfrom\s+['"]@inneranimalmedia\/agentsam-workbench/.test(text)) {
    fail(`${rel}: imports agentsam-workbench — AgentSam must be an optional host slot`);
  }
  if (/\bfrom\s+['"]\.\.\/\.\.\/.*packages\//.test(text) || /from ['"]\.\.\/\.\.\/\.\.\/packages\//.test(text)) {
    fail(`${rel}: monorepo relative import into packages/`);
  }
  // Architecture law: frontend must not import backend implementation sources.
  // Donor prototype under editor/legacy/ is exempt until deleted after contracts land.
  if (
    rel.startsWith('frontend/') &&
    !rel.includes('/editor/legacy/') &&
    /from\s+['"][^'"]*\/backend\/src\//.test(text)
  ) {
    fail(`${rel}: frontend must not import ../../backend/src — use CmsEditorAdapter / host`);
  }
  if (rel === 'backend/src/api/client.ts') {
    if (/useDemoBootstrap|buildDemoCmsBootstrap|buildHeuristicTheme/.test(text)) {
      fail('backend/src/api/client.ts must not wire demo/heuristic bootstrap into API flow');
    }
    if (/Promise\.resolve\(\{\}\)/.test(text)) {
      fail('backend/src/api/client.ts must not fabricate empty write success');
    }
  }
  if (rel === 'backend/src/demo-bootstrap.ts' && !/throw new Error/.test(text)) {
    fail('demo-bootstrap.ts must throw — not manufacture bootstrap payloads');
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

// Dist must exist after build for package verification of export targets
const distRequired = ['dist/index.js', 'dist/index.d.ts', 'dist/adapter.js', 'dist/styles/studio.css'];
for (const rel of distRequired) {
  if (!existsSync(join(packageRoot, rel))) {
    fail(`missing built artifact ${rel} — run npm run build before verify:cms-package`);
  }
}

if (warnings.length) for (const w of warnings) console.warn(`warn: ${w}`);
if (errors.length) {
  console.error(`verify-cms-package FAILED (${errors.length})`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log(
  `verify-cms-package OK ${rootPkg.name}@${rootPkg.version} · private=${Boolean(rootPkg.private)} · dist ready · no file: deps`,
);
