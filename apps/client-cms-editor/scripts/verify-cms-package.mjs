#!/usr/bin/env node
/**
 * CMS package integrity / portability gate.
 * Fails closed until @inneranimalmedia/client-cms-editor is a real standalone artifact.
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

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

assert.equal(rootPkg.name, '@inneranimalmedia/client-cms-editor');
assert.equal(parity.schema, 'agentsam.cms.parity.v1');
assert.ok(existsSync(join(packageRoot, 'acceptance/cms-parity.v1.json')));
assert.ok(existsSync(join(packageRoot, 'reference/harvest/HARVEST_RECEIPT.json')));
assert.ok(existsSync(join(packageRoot, 'reference/harvest/plans/CMS-EDITOR-HARVEST.md')));
assert.ok(existsSync(join(packageRoot, 'shared/cms/src/adapter.ts')));

if (!String(rootPkg.version || '').includes('alpha') && rootPkg.private !== false) {
  warn('version is not an alpha prerelease yet');
}

if (rootPkg.private === true) {
  fail('package is still private:true — remove only when verify:cms-package + pack:check pass and alpha is ready');
}

if (!rootPkg.files || !Array.isArray(rootPkg.files) || rootPkg.files.length === 0) {
  fail('root package.json missing explicit "files" for publish');
}

if (!rootPkg.exports || typeof rootPkg.exports !== 'object') {
  fail('root package.json missing "exports" map for consumers');
}

for (const [section, pkg, label] of [
  ['dependencies', frontendPkg, 'frontend'],
  ['devDependencies', frontendPkg, 'frontend'],
  ['dependencies', sharedPkg, 'shared'],
  ['dependencies', backendPkg, 'backend'],
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

// Docs may describe anti-goals in prose; product/runtime code must not embed authorities.
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

const sourceFiles = walk(packageRoot);
for (const file of sourceFiles) {
  const rel = relative(packageRoot, file);
  if (rel.startsWith('scripts/verify-')) continue;
  if (DOC_ALLOWLIST.has(rel)) continue;
  const text = readFileSync(file, 'utf8');
  for (const rule of FORBIDDEN) {
    if (rule.re.test(text)) {
      fail(`${rel}: contains forbidden ${rule.label}`);
    }
  }
  if (/\bfrom\s+['"]\.\.\/\.\.\/.*packages\//.test(text) || /from ['"]\.\.\/\.\.\/\.\.\/packages\//.test(text)) {
    fail(`${rel}: monorepo relative import into packages/`);
  }
}

// Nested node_modules must never ship
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
if (nested.length) {
  fail(`nested node_modules present: ${nested.slice(0, 10).join(', ')}`);
}

// Scaffold must not offer localStorage as authority
const bin = readFileSync(join(packageRoot, 'bin/agentsam-cms.mjs'), 'utf8');
if (/PERSISTENCE\s*=\s*new Set\(\[[^\]]*localStorage/.test(bin)) {
  fail('bin/agentsam-cms.mjs still offers localStorage as a persistence authority choice');
}

if (warnings.length) {
  for (const w of warnings) console.warn(`warn: ${w}`);
}

if (errors.length) {
  console.error(`verify-cms-package FAILED (${errors.length})`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log(
  `verify-cms-package OK ${rootPkg.name}@${rootPkg.version} · parity=${parity.schema} · harvest reference present`,
);
