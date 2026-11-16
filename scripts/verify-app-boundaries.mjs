#!/usr/bin/env node
// App boundary fence (stdlib only).
//   1. apps/<a> source must not import from apps/<b>.
//   2. apps/<a> package.json file:/link: deps must not point into apps/<b>.
//   3. Nothing in packages/ or src/ may import from apps/.
// An app may only reach another capability through packages/* (published-package semantics).
//
// Ratchet: violations that already existed are recorded in scripts/app-boundaries.baseline.json and
// tolerated; any NEW violation fails. The baseline may only shrink. Regenerate with --write-baseline
// after removing violations (never to add one).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = path.join(ROOT, 'apps');
const SKIP = new Set(['node_modules', 'dist', 'build', '.output', '.wrangler', '_imports', '.git', 'target', 'coverage']);
const SRC = /\.[cm]?[jt]sx?$/;
const SPEC = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"]([^'"]+)['"]/g;

function* walk(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
}

function appOf(abs) {
  const rel = path.relative(APPS, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const first = rel.split(path.sep)[0];
  return first && !first.startsWith('_') ? first : null;
}

const rel = (p) => path.relative(ROOT, p);
const violations = [];
let scanned = 0;

function checkSource(file, owner) {
  scanned += 1;
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(SPEC)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const target = appOf(path.resolve(path.dirname(file), spec));
    if (target && target !== owner) {
      violations.push(`${rel(file)} imports apps/${target} (${spec})`);
    }
  }
}

function checkPackageJson(file, owner) {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, spec] of Object.entries(pkg[field] || {})) {
      const m = /^(?:file|link):(.+)$/.exec(String(spec));
      if (!m) continue;
      const target = appOf(path.resolve(path.dirname(file), m[1]));
      if (target && target !== owner) {
        violations.push(`${rel(file)} ${field}.${name} points into apps/${target}`);
      }
    }
  }
}

const apps = fs.readdirSync(APPS, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !SKIP.has(e.name))
  .map((e) => e.name);

for (const app of apps) {
  for (const file of walk(path.join(APPS, app))) {
    if (path.basename(file) === 'package.json') checkPackageJson(file, app);
    else if (SRC.test(file)) checkSource(file, app);
  }
}

for (const outside of ['packages', 'src']) {
  for (const file of walk(path.join(ROOT, outside))) {
    if (!SRC.test(file)) continue;
    scanned += 1;
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(SPEC)) {
      if (!m[1].startsWith('.')) continue;
      const target = appOf(path.resolve(path.dirname(file), m[1]));
      if (target) violations.push(`${rel(file)} imports apps/${target} (${m[1]})`);
    }
  }
}

const BASELINE = path.join(ROOT, 'scripts', 'app-boundaries.baseline.json');
const unique = [...new Set(violations)].sort();

if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(BASELINE, JSON.stringify(unique, null, 2) + '\n');
  console.log(`baseline written: ${unique.length} existing violation(s)`);
  process.exit(0);
}

let baseline = [];
try { baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch { /* no baseline = strict */ }
const known = new Set(baseline);
const fresh = unique.filter((v) => !known.has(v));
const cleared = baseline.filter((v) => !unique.includes(v));

if (fresh.length) {
  console.error(`New app boundary violations (${fresh.length}):`);
  for (const v of fresh) console.error(`  - ${v}`);
  process.exit(1);
}
if (cleared.length) {
  console.log(`note: ${cleared.length} baselined violation(s) are gone; run with --write-baseline to ratchet down`);
}
console.log(`✓ app boundaries: ${apps.length} app(s), ${scanned} source file(s) scanned, ${unique.length} baselined legacy violation(s), 0 new`);
