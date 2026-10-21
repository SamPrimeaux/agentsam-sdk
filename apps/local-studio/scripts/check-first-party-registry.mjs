#!/usr/bin/env node
/**
 * Gate a standalone Local Studio npm ci on the actual, complete published train.
 * SDK publication alone is not enough: Studio pins first-party packages independently.
 * Missing releases defer the downstream Cloudflare build; network failures fail closed.
 */
import { readFileSync, appendFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(appRoot, p), 'utf8'));

export function requiredPublishedPackages(manifests) {
  const local = new Set(manifests.filter(({ path }) => path !== 'package.json')
    .map(({ manifest }) => manifest.name).filter(Boolean));
  const required = new Map();
  for (const { manifest } of manifests) {
    for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [name, version] of Object.entries(manifest[section] || {})) {
        if (!name.startsWith('@inneranimalmedia/') || local.has(name)) continue;
        const old = required.get(name);
        if (old && old !== version) throw Error('conflicting_first_party_pins:' + name);
        required.set(name, version);
      }
    }
  }
  return [...required].map(([name, version]) => ({ name, version }));
}

export async function registryStatus(requirements, get = fetch) {
  const results = await Promise.all(requirements.map(async ({ name, version }) => {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('non_exact_first_party_pin:' + name);
    const response = await get('https://registry.npmjs.org/' + encodeURIComponent(name) + '/' + version, {
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 200) return { name, version, published: true };
    if (response.status === 404) return { name, version, published: false };
    throw Error('npm_registry_status:' + name + ':' + response.status);
  }));
  return { ready: results.every((r) => r.published), results };
}

export function appManifestSources() {
  const root = read('package.json');
  const paths = ['package.json'];
  for (const workspace of root.workspaces || []) {
    if (workspace.endsWith('/*')) {
      const directory = workspace.slice(0, -2);
      for (const item of readdirSync(resolve(appRoot, directory), { withFileTypes: true })) {
        if (item.isDirectory()) paths.push(directory + '/' + item.name + '/package.json');
      }
    } else {
      paths.push(workspace + '/package.json');
    }
  }
  return paths.map((path) => ({ path, manifest: read(path) }));
}

export function staleLockTarballs(lock, version) {
  return Object.entries(lock.packages || {}).filter(([key, p]) =>
    key.includes('node_modules/@inneranimalmedia/') && !p.link &&
    typeof p.version === 'string' && p.version !== version)
    .map(([key, p]) => key + '@' + p.version);
}

async function main() {
  const manifests = appManifestSources();
  const version = manifests[0].manifest.version;
  const registry = await registryStatus(requiredPublishedPackages(manifests));
  const stale = staleLockTarballs(read('package-lock.json'), version);
  const missing = registry.results.filter((r) => !r.published);
  const ready = registry.ready && stale.length === 0;
  console.log('Local Studio first-party registry: ' +
    (registry.results.length - missing.length) + '/' + registry.results.length + ' published @' + version);
  if (missing.length) console.log('Unpublished: ' + missing.map((r) => r.name + '@' + r.version).join(', '));
  if (stale.length) console.log('Stale app lock entries: ' + stale.join(', '));
  if (process.argv.includes('--github-output') && process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, 'ready=' + ready + '\n');
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, ready
      ? 'Local Studio exact first-party dependencies are published and lock-aligned.\n'
      : 'DEFERRED: standalone Local Studio install needs all exact first-party packages published AND a refreshed committed lockfile.\n');
  }
  if (!ready) console.log('DEFERRED: use the approved publish-stable release workflow, then regenerate and commit the product lock.');
  if (!ready && process.argv.includes('--require')) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
