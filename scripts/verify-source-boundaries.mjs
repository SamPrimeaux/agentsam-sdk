import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts/source-boundaries.json'), 'utf8'));
const failures = [];

function names(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter(predicate).map((entry) => entry.name).sort();
}

function unexpected(actual, allowed) {
  const set = new Set(allowed);
  return actual.filter((name) => !set.has(name));
}

const libRoot = path.join(root, 'src/lib');
const libFiles = names(libRoot, (entry) => entry.isFile() && entry.name.endsWith('.js'));
const libDirs = names(libRoot, (entry) => entry.isDirectory());
const extraLibFiles = unexpected(libFiles, baseline.legacy_src_lib_files);
const extraLibDirs = unexpected(libDirs, baseline.legacy_src_lib_directories);
if (extraLibFiles.length) failures.push(`new top-level src/lib files are not allowed: ${extraLibFiles.join(', ')}`);
if (extraLibDirs.length) failures.push(`new src/lib domains are not allowed: ${extraLibDirs.join(', ')}`);

const flatTests = names(path.join(root, 'test'), (entry) => entry.isFile() && entry.name.endsWith('.test.mjs'));
const extraFlatTests = unexpected(flatTests, baseline.legacy_flat_root_tests);
if (extraFlatTests.length) {
  failures.push(`new flat test/*.test.mjs files are not allowed: ${extraFlatTests.join(', ')}; use package-local tests or test/integration|cli|release`);
}

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const IMPORT_RE = /(?:from\s+|import\s*\(|require\s*\()['"]([^'"]+)['"]/g;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.output') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function resolveRelativeImport(sourceFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const raw = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = [raw, ...['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'].map((ext) => raw + ext)];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return raw;
}

const rootSrc = path.join(root, 'src') + path.sep;
for (const packageSrc of walk(path.join(root, 'packages')).filter((file) => file.includes(`${path.sep}src${path.sep}`))) {
  const text = fs.readFileSync(packageSrc, 'utf8');
  for (const match of text.matchAll(IMPORT_RE)) {
    const specifier = match[1];
    if (specifier.startsWith('@inneranimalmedia/agentsam-sdk/src/')) {
      failures.push(`${path.relative(root, packageSrc)} deep-imports root SDK internals via ${specifier}`);
      continue;
    }
    const resolved = resolveRelativeImport(packageSrc, specifier);
    if (resolved && resolved.startsWith(rootSrc)) {
      failures.push(`${path.relative(root, packageSrc)} reaches into root src via ${specifier}`);
    }
  }
}

for (const appFile of walk(path.join(root, 'apps'))) {
  const text = fs.readFileSync(appFile, 'utf8');
  if (text.includes('@inneranimalmedia/agentsam-sdk/src/')) {
    failures.push(`${path.relative(root, appFile)} deep-imports @inneranimalmedia/agentsam-sdk/src`);
  }
  for (const match of text.matchAll(IMPORT_RE)) {
    const resolved = resolveRelativeImport(appFile, match[1]);
    if (resolved && resolved.startsWith(rootSrc)) failures.push(`${path.relative(root, appFile)} reaches into root src via ${match[1]}`);
  }
}

if (failures.length) {
  console.error('AgentSam source boundary verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Source boundaries OK: src/lib legacy surface frozen (${libFiles.length} files, ${libDirs.length} dirs); flat root tests frozen (${flatTests.length}); package/app deep imports clean.`);
