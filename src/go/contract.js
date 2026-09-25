import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_PRODUCT } from './discover.js';

const PACKAGE_TEMPLATE = {
  schema: 'agentsam.package.v1',
  name: DEFAULT_PRODUCT,
  type: 'service',
  runtime: 'go',
  version: '0.1.0',
  targets: ['cloudflare-worker', 'cloudflare-container', 'local'],
  entrypoints: {
    server: './runtime/cmd/server',
    worker: './worker/src/index.js',
  },
  capabilities: ['hash', 'inspect', 'runtime', 'capabilities'],
  distribution: {
    package: '@inneranimalmedia/agentsam-go-worker',
    normal_user: 'official-hosted-service',
    self_host: 'advanced-opt-in',
  },
  deployment: {
    adapter: 'cloudflare',
    mode: 'worker-container',
    wrangler_config: './wrangler.jsonc',
    authority: 'explicit-cloudflare-account',
  },
  product: {
    slug: DEFAULT_PRODUCT,
    kind: 'service',
    registry: 'local-by-default',
    official_registry: 'agentsam_products',
    official_registry_only: true,
  },
};

/**
 * Ensure product adapter files exist. Never scaffolds a second product directory.
 * Returns { created: string[], updated: string[], existing: true }.
 */
export function ensureProductContract(productRoot, { overwrite = false } = {}) {
  const created = [];
  const updated = [];
  const manifestPath = path.join(productRoot, 'agentsam.package.json');

  if (!fs.existsSync(productRoot)) {
    throw new Error(`product_root_missing: ${productRoot} — seed apps/${DEFAULT_PRODUCT} first; do not invent a sibling product`);
  }

  if (!fs.existsSync(manifestPath)) {
    fs.writeFileSync(manifestPath, `${JSON.stringify(PACKAGE_TEMPLATE, null, 2)}\n`);
    created.push(rel(productRoot, manifestPath));
  } else if (overwrite) {
    const current = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const merged = { ...PACKAGE_TEMPLATE, ...current, name: DEFAULT_PRODUCT };
    fs.writeFileSync(manifestPath, `${JSON.stringify(merged, null, 2)}\n`);
    updated.push(rel(productRoot, manifestPath));
  }

  const required = [
    'runtime/go.mod',
    'runtime/cmd/server/main.go',
    'worker/src/index.js',
    'wrangler.jsonc',
    'Dockerfile',
  ];
  const missing = required.filter((relPath) => !fs.existsSync(path.join(productRoot, relPath)));
  if (missing.length) {
    throw new Error(`product_incomplete: missing ${missing.join(', ')}`);
  }

  return {
    product: DEFAULT_PRODUCT,
    productRoot,
    existing: created.length === 0,
    created,
    updated,
    manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
  };
}

export function readProductManifest(productRoot) {
  const manifestPath = path.join(productRoot, 'agentsam.package.json');
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function rel(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

export function preflightToolchain({ requireDocker = false, productRoot = null } = {}) {
  const checks = [];
  const push = (id, ok, detail = '') => checks.push({ id, ok, detail });

  try {
    const v = spawnSync('go', ['version'], { encoding: 'utf8' });
    push('go', v.status === 0, (v.stdout || v.stderr || '').trim());
  } catch (e) {
    push('go', false, e.message);
  }

  const wranglerBin = resolveWranglerBin(productRoot);
  try {
    const v = spawnSync(wranglerBin.command, wranglerBin.args.concat(['--version']), {
      encoding: 'utf8',
      cwd: productRoot || process.cwd(),
    });
    push('wrangler', v.status === 0, (v.stdout || v.stderr || '').trim().slice(0, 120));
  } catch (e) {
    push('wrangler', false, e.message);
  }

  try {
    const v = spawnSync('docker', ['info'], { encoding: 'utf8' });
    push('docker', v.status === 0, v.status === 0 ? 'available' : (v.stderr || 'unavailable').trim().slice(0, 200));
  } catch (e) {
    push('docker', false, e.message);
  }

  const failed = checks.filter((c) => {
    if (c.ok) return false;
    if (c.id === 'docker' && !requireDocker) return false;
    return true;
  });
  return { ok: failed.length === 0, checks, failed, wrangler: wranglerBin };
}

function resolveWranglerBin(productRoot) {
  const candidates = [];
  if (productRoot) {
    candidates.push(path.join(productRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js'));
    candidates.push(path.join(productRoot, 'node_modules', '.bin', 'wrangler'));
  }
  candidates.push(path.join(process.cwd(), 'node_modules', '.bin', 'wrangler'));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      if (candidate.endsWith('.js')) return { command: process.execPath, args: [candidate] };
      return { command: candidate, args: [] };
    }
  }
  return { command: 'npx', args: ['--yes', 'wrangler'] };
}
