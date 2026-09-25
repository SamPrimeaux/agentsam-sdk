import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { repositoryRoot, gitEvidence } from '../knowledge/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_REQUIRE = createRequire(import.meta.url);
export const SDK_ROOT = path.resolve(HERE, '../..');
export const DEFAULT_PRODUCT = 'agentsam-go-worker';
export const DEFAULT_PRODUCT_REL = path.join('apps', DEFAULT_PRODUCT);
export const GO_WORKER_PACKAGE = '@inneranimalmedia/agentsam-go-worker';

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function normalizeExplicitProductRoot(value) {
  if (!value) return null;
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved)) return null;
  if (path.basename(resolved) === 'runtime' && fs.existsSync(path.join(resolved, 'go.mod'))) {
    return path.dirname(resolved);
  }
  return resolved;
}

function packageRootFrom(requireFn) {
  try {
    return path.dirname(requireFn.resolve(GO_WORKER_PACKAGE + '/package.json'));
  } catch {
    return null;
  }
}

function cwdRequire(cwd) {
  try {
    return createRequire(path.join(path.resolve(cwd), 'package.json'));
  } catch {
    return null;
  }
}

function runtimeCandidate(productRoot, origin) {
  if (!productRoot) return null;
  const runtimeRoot = path.join(productRoot, 'runtime');
  const modPath = path.join(runtimeRoot, 'go.mod');
  if (!fs.existsSync(modPath)) return null;
  const mod = fs.readFileSync(modPath, 'utf8');
  const moduleMatch = mod.match(/^module\s+(\S+)/m);
  const serverMain = path.join(runtimeRoot, 'cmd', 'server', 'main.go');
  const packageJson = path.join(productRoot, 'package.json');
  return {
    origin,
    runtimeRoot,
    module: moduleMatch?.[1] || null,
    goMod: modPath,
    entry: fs.existsSync(serverMain) ? serverMain : findFirstGoMain(runtimeRoot),
    productRoot,
    packageManifest: path.join(productRoot, 'agentsam.package.json'),
    packageJson,
    package: readJSON(packageJson),
  };
}

function legacyRuntimeCandidate(runtimeRoot, origin) {
  const modPath = path.join(runtimeRoot, 'go.mod');
  if (!fs.existsSync(modPath)) return null;
  const mod = fs.readFileSync(modPath, 'utf8');
  const moduleMatch = mod.match(/^module\s+(\S+)/m);
  const productRoot = path.basename(runtimeRoot) === 'runtime' ? path.dirname(runtimeRoot) : runtimeRoot;
  return {
    origin,
    runtimeRoot,
    module: moduleMatch?.[1] || null,
    goMod: modPath,
    entry: findFirstGoMain(runtimeRoot),
    productRoot,
    packageManifest: path.join(productRoot, 'agentsam.package.json'),
    packageJson: path.join(productRoot, 'package.json'),
    package: readJSON(path.join(productRoot, 'package.json')),
  };
}

/**
 * Locate the one AgentSam Go service implementation without assuming the SDK
 * development checkout ships inside the root npm package.
 *
 * Resolution order:
 *   1. explicit AGENTSAM_GO_WORKER_ROOT
 *   2. current repository apps/agentsam-go-worker (maintainer/contributor mode)
 *   3. installed @inneranimalmedia/agentsam-go-worker package (distribution mode)
 *   4. SDK development tree when present
 *   5. narrow legacy runtime candidates
 */
export function discoverGoRuntime(cwd = process.cwd()) {
  const root = repositoryRoot(cwd);
  const req = cwdRequire(cwd);
  const productCandidates = [
    [normalizeExplicitProductRoot(process.env.AGENTSAM_GO_WORKER_ROOT), 'explicit'],
    [path.join(root, DEFAULT_PRODUCT_REL), 'repository'],
    [req ? packageRootFrom(req) : null, 'installed_package'],
    [packageRootFrom(MODULE_REQUIRE), 'installed_package'],
    [path.join(SDK_ROOT, DEFAULT_PRODUCT_REL), 'sdk_development_tree'],
  ];

  const found = [];
  const seen = new Set();
  for (const [productRoot, origin] of productCandidates) {
    if (!productRoot) continue;
    let real;
    try { real = fs.realpathSync(productRoot); } catch { continue; }
    if (seen.has(real)) continue;
    seen.add(real);
    const candidate = runtimeCandidate(real, origin);
    if (candidate) found.push(candidate);
  }

  for (const [runtimeRoot, origin] of [
    [path.join(root, 'runtime'), 'legacy_repository_runtime'],
    [path.join(root, 'cmd', 'agentsam'), 'legacy_repository_cmd'],
  ]) {
    let real;
    try { real = fs.realpathSync(runtimeRoot); } catch { continue; }
    if (seen.has(real)) continue;
    seen.add(real);
    const candidate = legacyRuntimeCandidate(real, origin);
    if (candidate) found.push(candidate);
  }

  const preferred = found.find((row) => row.module?.includes('agentsam-go-worker')) || found[0] || null;
  const goTool = probeGoToolchain();
  const git = gitEvidence(root);

  return {
    schema: 'agentsam.go-discovery.v2',
    repository_root: root,
    sdk_root: SDK_ROOT,
    go: goTool,
    git,
    runtime: preferred,
    candidates: found,
    product_exists: Boolean(preferred && fs.existsSync(preferred.packageManifest)),
    distribution: preferred
      ? {
          origin: preferred.origin,
          package_name: preferred.package?.name || null,
          package_version: preferred.package?.version || null,
          product_root: preferred.productRoot,
        }
      : null,
  };
}

function findFirstGoMain(dir) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let ents;
    try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const ent of ents) {
      if (ent.name === 'vendor' || ent.name === '.git' || ent.name === 'node_modules') continue;
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.name === 'main.go') return full;
    }
  }
  return null;
}

export function probeGoToolchain() {
  try {
    const version = execFileSync('go', ['version'], { encoding: 'utf8' }).trim();
    const env = execFileSync('go', ['env', 'GOROOT', 'GOVERSION'], { encoding: 'utf8' }).trim().split(/\r?\n/);
    return { ok: true, version, goroot: env[0] || null, goversion: env[1] || null };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function resolveGoStateRoot(discovery, cwd = process.cwd()) {
  const origin = discovery?.runtime?.origin || null;
  if (origin === 'repository' || origin === 'sdk_development_tree') {
    return discovery.runtime.productRoot;
  }
  return repositoryRoot(cwd);
}

export function resolveProductRoot(discovery, productName = DEFAULT_PRODUCT) {
  const runtime = discovery?.runtime;
  if (
    runtime?.productRoot
    && (
      path.basename(runtime.productRoot) === productName
      || runtime.package?.name === GO_WORKER_PACKAGE
    )
  ) {
    return runtime.productRoot;
  }

  const fromCandidates = discovery?.candidates?.find((row) => (
    path.basename(row.productRoot || '') === productName
    || row.package?.name === GO_WORKER_PACKAGE
  ));
  if (fromCandidates?.productRoot) return fromCandidates.productRoot;

  const err = new Error('go_product_not_discovered:' + productName);
  err.code = 'go_product_not_discovered';
  err.hint = 'Install ' + GO_WORKER_PACKAGE + ' for self-host deployment or run from the AgentSam SDK maintainer checkout.';
  throw err;
}
