#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'bin/agentsam');
const args = process.argv.slice(2);

function value(flag, fallback = '') {
  const i = args.indexOf(flag);
  return i >= 0 ? (args[i + 1] || fallback) : fallback;
}
function has(flag) { return args.includes(flag); }
if (has('--help') || has('-h')) {
  console.log(`AgentSam product proof\n\n  node scripts/prove-agentsam-product.mjs [options]\n\n  --world <path>       Repository/directory for WORLD proof (default: current repo)\n  --app <id>           APP proof target (default: client-cms-editor)\n  --out <file>         Receipt path (default: .agentsam/proofs/product-proof.json)\n  --strict-package     Treat npm distribution blockers as a failing proof\n\nRuns locally only. No deploy, publish, login, model, embeddings, or network is required.`);
  process.exit(0);
}

const worldRoot = path.resolve(value('--world', ROOT));
const appId = value('--app', 'client-cms-editor');
const outFile = path.resolve(value('--out', path.join(ROOT, '.agentsam/proofs/product-proof.json')));
const strictPackage = has('--strict-package');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-product-proof-'));

function run(commandArgs, { cwd = ROOT, allowFailure = false } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...commandArgs], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`agentsam ${commandArgs.join(' ')} failed (${result.status})\n${result.stderr || result.stdout}`);
  }
  return result;
}

function runNode(file, commandArgs = [], { cwd = ROOT, allowFailure = false } = {}) {
  const result = spawnSync(process.execPath, [file, ...commandArgs], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!allowFailure && result.status !== 0) throw new Error(`${file} failed (${result.status})\n${result.stderr || result.stdout}`);
  return result;
}

function jsonFrom(text) {
  const start = text.indexOf('{');
  if (start < 0) throw new Error(`expected JSON output; got: ${text.slice(0, 1000)}`);
  return JSON.parse(text.slice(start));
}

function existsAll(root, rels) { return rels.every((rel) => fs.existsSync(path.join(root, rel))); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

const steps = [];
function step(lane, key, fn) {
  const startedAt = new Date().toISOString();
  try {
    const detail = fn() || {};
    const row = { lane, key, ok: detail.ok !== false, started_at: startedAt, finished_at: new Date().toISOString(), ...detail };
    steps.push(row);
    return row;
  } catch (error) {
    const row = { lane, key, ok: false, started_at: startedAt, finished_at: new Date().toISOString(), error: String(error?.message || error) };
    steps.push(row);
    return row;
  }
}

// MINI — prove the zero-cloud disposable artifact lane by actually creating one.
const miniRoot = path.join(scratch, 'proof-mini');
step('mini', 'create-write-only', () => {
  const result = run(['mini', 'proof-mini', '--template', 'page', '--write-only'], { cwd: scratch });
  const files = [];
  for (const rel of ['index.html', 'public/index.html', 'agentsam.mini.json', 'package.json']) {
    if (fs.existsSync(path.join(miniRoot, rel))) files.push(rel);
  }
  const all = fs.readdirSync(miniRoot, { recursive: true }).map(String);
  return {
    ok: fs.existsSync(miniRoot) && all.length > 0,
    root: miniRoot,
    file_count: all.length,
    detected_key_files: files,
    stdout: result.stdout.trim(),
    network: 'none',
    provider_spend: 'none',
  };
});
step('mini', 'templates', () => {
  const result = run(['mini', 'templates']);
  return { ok: /gadget|page|data/.test(result.stdout), stdout: result.stdout.trim() };
});

// APP — prove registry, validation, app-owned doctor/scaffold, and distribution truth.
let appManifest = null;
let appRoot = null;
step('app', 'registry-inspect', () => {
  const result = run(['app', 'inspect', appId]);
  const payload = jsonFrom(result.stdout);
  appManifest = payload.manifest;
  appRoot = path.join(ROOT, 'apps', appId);
  return {
    ok: payload.validation?.ok === true,
    app_id: appManifest?.id,
    package: appManifest?.package,
    capabilities: appManifest?.capabilities || [],
    provides: appManifest?.provides || [],
    validation: payload.validation,
  };
});
step('app', 'doctor', () => {
  if (!appManifest) throw new Error('app manifest unavailable');
  const bin = path.resolve(appRoot, appManifest.bin || appManifest.entrypoints?.cli || '');
  if (!fs.existsSync(bin)) throw new Error(`app CLI missing: ${bin}`);
  const result = runNode(bin, ['doctor'], { cwd: appRoot });
  return { ok: result.status === 0, bin: path.relative(ROOT, bin), stdout: result.stdout.trim() };
});
step('app', 'scaffold', () => {
  const target = path.join(scratch, `${appId}-scaffold`);
  const result = run(['app', 'scaffold', appId, target]);
  const required = ['package.json', 'agentsam.app.json', 'frontend', 'backend', 'shared'];
  return { ok: existsAll(target, required), target, required, stdout: result.stdout.trim() };
});
step('app', 'npm-distribution', () => {
  if (!appRoot || !appManifest) throw new Error('app manifest unavailable');
  const pkgFile = path.join(appRoot, 'package.json');
  const pkg = readJson(pkgFile);
  const result = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd: appRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const pack = result.status === 0 ? JSON.parse(result.stdout)[0] : null;
  const expectedBin = appManifest.bin || appManifest.entrypoints?.cli || null;
  const binValues = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin || {});
  const blockers = [];
  if (pkg.private === true) blockers.push('package.json private=true');
  if (!pkg.bin || (expectedBin && !binValues.includes(expectedBin))) blockers.push('published package does not expose the app CLI bin');
  if (!Array.isArray(pkg.files)) blockers.push('no explicit package files allowlist');
  const localFileDependencies = [];
  for (const packageFile of fs.readdirSync(appRoot, { recursive: true })
    .map(String)
    .filter((rel) => rel.endsWith('package.json') && !rel.split(path.sep).includes('node_modules'))) {
    const full = path.join(appRoot, packageFile);
    let nested;
    try { nested = readJson(full); } catch { continue; }
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, spec] of Object.entries(nested[group] || {})) {
        if (typeof spec === 'string' && spec.startsWith('file:')) {
          const target = path.resolve(path.dirname(full), spec.slice(5));
          const escapesApp = target !== appRoot && !target.startsWith(`${appRoot}${path.sep}`);
          if (escapesApp) localFileDependencies.push({ package_file: packageFile, group, name, spec });
        }
      }
    }
  }
  if (localFileDependencies.length) blockers.push(`${localFileDependencies.length} repo-local file: dependencies escape the app package`);
  if (!pack?.entryCount) blockers.push('npm pack dry-run did not produce a payload');
  return {
    ok: strictPackage ? blockers.length === 0 : result.status === 0,
    publish_ready: blockers.length === 0,
    blockers,
    package: pkg.name,
    private: pkg.private === true,
    bin: pkg.bin || null,
    files_allowlist: pkg.files || null,
    local_file_dependencies: localFileDependencies,
    pack_entry_count: pack?.entryCount || 0,
    pack_size: pack?.size || null,
    unpacked_size: pack?.unpackedSize || null,
    npm_exit_code: result.status,
  };
});

// WORLD — one deterministic scan becomes bounded content-addressed world state.
step('world', 'inspect', () => {
  const result = run(['inspect', worldRoot, '--full', '--json']);
  const snapshot = jsonFrom(result.stdout);
  const files = snapshot.tree?.files || [];
  const categoryCounts = {};
  const kindCounts = {};
  const roleCounts = {};
  const symbols = new Set();
  const imports = new Set();
  for (const file of files) {
    categoryCounts[file.category || 'unknown'] = (categoryCounts[file.category || 'unknown'] || 0) + 1;
    kindCounts[file.kind || 'unknown'] = (kindCounts[file.kind || 'unknown'] || 0) + 1;
    roleCounts[file.role || 'unknown'] = (roleCounts[file.role || 'unknown'] || 0) + 1;
    for (const symbol of file.symbols || []) symbols.add(symbol);
    for (const item of file.imports || []) imports.add(item);
  }
  const routes = files.filter((f) => f.category === 'page' || /(^|\/)routes?\//i.test(f.path || '') || /(^|\/)page\.[cm]?[jt]sx?$/i.test(f.path || ''));
  const assetFiles = files.filter((f) => ['asset', 'image', 'font', 'media'].includes(f.kind) || /\.(png|jpe?g|webp|avif|gif|svg|glb|gltf|woff2?|ttf|otf)$/i.test(f.path || ''));
  return {
    ok: Boolean(snapshot.snapshot_id && snapshot.tree?.merkle_root),
    root: worldRoot,
    snapshot_id: snapshot.snapshot_id,
    repository: snapshot.repository || null,
    merkle_root: snapshot.tree?.merkle_root || null,
    metadata_root: snapshot.tree?.metadata_root || null,
    classifier: snapshot.tree?.classifier || null,
    summary: snapshot.intelligence?.summary || null,
    languages: snapshot.intelligence?.languages || [],
    package_count: Array.isArray(snapshot.packages) ? snapshot.packages.length : 0,
    route_candidates: routes.length,
    asset_candidates: assetFiles.length,
    symbol_count: symbols.size,
    import_target_count: imports.size,
    categories: categoryCounts,
    kinds: kindCounts,
    roles: roleCounts,
    trust: snapshot.analysis?.trust_boundary || null,
    model: 'never',
    embeddings: 'never',
    network: 'none',
    provider_spend: 'none',
  };
});

const packageStep = steps.find((row) => row.lane === 'app' && row.key === 'npm-distribution');
const coreOk = steps.filter((row) => row.key !== 'npm-distribution').every((row) => row.ok);
const ok = coreOk && (!strictPackage || packageStep?.publish_ready === true);
const receipt = {
  schema: 'agentsam.product-proof.v1',
  created_at: new Date().toISOString(),
  ok,
  strict_package: strictPackage,
  product_scales: ['mini', 'app', 'world'],
  cli: { path: path.relative(ROOT, CLI), version: readJson(path.join(ROOT, 'package.json')).version || null },
  targets: { app_id: appId, world_root: worldRoot },
  steps,
  summary: {
    mini_ok: steps.filter((x) => x.lane === 'mini').every((x) => x.ok),
    app_ok: steps.filter((x) => x.lane === 'app' && x.key !== 'npm-distribution').every((x) => x.ok),
    package_publish_ready: packageStep?.publish_ready === true,
    world_ok: steps.filter((x) => x.lane === 'world').every((x) => x.ok),
  },
  guarantees: {
    deploy: false,
    publish: false,
    remote_mutation: false,
    model_required: false,
    embeddings_required: false,
    network_required: false,
  },
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`AgentSam product proof: ${ok ? 'PASS' : 'FAIL'}`);
for (const row of steps) console.log(`  ${row.ok ? 'PASS' : 'FAIL'}  ${row.lane.padEnd(5)} ${row.key}`);
if (packageStep && !packageStep.publish_ready) console.log(`  NOTE  app npm distribution blockers: ${packageStep.blockers.join('; ')}`);
console.log(`Receipt: ${outFile}`);
process.exitCode = ok ? 0 : 1;
