import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { repositoryRoot, gitEvidence } from '../knowledge/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SDK_ROOT = path.resolve(HERE, '../..');
export const DEFAULT_PRODUCT = 'agentsam-go-worker';
export const DEFAULT_PRODUCT_REL = path.join('apps', DEFAULT_PRODUCT);

/**
 * Locate AgentSam Go runtime source without inventing a second implementation.
 * Prefers apps/agentsam-go-worker/runtime; otherwise any go.mod that declares agentsam-go-worker.
 */
export function discoverGoRuntime(cwd = process.cwd()) {
  const root = repositoryRoot(cwd);
  const candidates = [
    path.join(root, DEFAULT_PRODUCT_REL, 'runtime'),
    path.join(SDK_ROOT, DEFAULT_PRODUCT_REL, 'runtime'),
    path.join(root, 'runtime'),
    path.join(root, 'cmd', 'agentsam'),
  ];

  const found = [];
  for (const runtimeRoot of candidates) {
    const modPath = path.join(runtimeRoot, 'go.mod');
    if (!fs.existsSync(modPath)) continue;
    const mod = fs.readFileSync(modPath, 'utf8');
    const moduleMatch = mod.match(/^module\s+(\S+)/m);
    const serverMain = path.join(runtimeRoot, 'cmd', 'server', 'main.go');
    const entry = fs.existsSync(serverMain)
      ? serverMain
      : findFirstGoMain(runtimeRoot);
    found.push({
      runtimeRoot,
      module: moduleMatch?.[1] || null,
      goMod: modPath,
      entry,
      productRoot: path.dirname(runtimeRoot),
      packageManifest: path.join(path.dirname(runtimeRoot), 'agentsam.package.json'),
    });
  }

  const preferred = found.find((row) => row.module?.includes('agentsam-go-worker')) || found[0] || null;
  const goTool = probeGoToolchain();
  const git = gitEvidence(root);

  return {
    schema: 'agentsam.go-discovery.v1',
    repository_root: root,
    sdk_root: SDK_ROOT,
    go: goTool,
    git,
    runtime: preferred,
    candidates: found,
    product_exists: Boolean(preferred && fs.existsSync(preferred.packageManifest)),
  };
}

function findFirstGoMain(dir) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let ents;
    try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const ent of ents) {
      if (ent.name === 'vendor' || ent.name === '.git') continue;
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

export function resolveProductRoot(discovery, productName = DEFAULT_PRODUCT) {
  if (discovery?.runtime?.productRoot && path.basename(discovery.runtime.productRoot) === productName) {
    return discovery.runtime.productRoot;
  }
  const fromSdk = path.join(SDK_ROOT, 'apps', productName);
  if (fs.existsSync(fromSdk)) return fromSdk;
  const fromRepo = path.join(discovery.repository_root, 'apps', productName);
  if (fs.existsSync(fromRepo)) return fromRepo;
  return fromSdk;
}
