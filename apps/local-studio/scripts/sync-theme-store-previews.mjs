#!/usr/bin/env node
/**
 * Sync only installer-ready, immutable previews from the Theme Store.
 * Theme availability and release versions are discovered from its live index;
 * this repository keeps no theme slug/version allowlist.
 */
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(root, 'frontend/public/themes');
const base = new URL(process.env.AGENTSAM_THEME_STORE_URL || 'https://themes.inneranimalmedia.com').origin;
const digest = value => createHash('sha256').update(value).digest('hex');
const SAFE_SLUG = /^[a-z][a-z0-9-]{0,62}$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+$/;
const HASH = /^[0-9a-f]{64}$/;
const safePath = value => typeof value === 'string' && value.length > 0 &&
  !value.startsWith('/') && !value.includes('\\\\') &&
  !value.split('/').some(part => !part || part === '.' || part === '..');

const [indexResponse, catalogResponse] = await Promise.all([
  fetch(new URL('/api/install-index', base), { headers: { accept: 'application/json' } }),
  fetch(new URL('/api/catalog', base), { headers: { accept: 'application/json' } }),
]);
if (!indexResponse.ok) throw Error('Theme Store install index unavailable: ' + indexResponse.status);
if (!catalogResponse.ok) throw Error('Theme Store catalog unavailable: ' + catalogResponse.status);

const index = await indexResponse.json();
const catalog = await catalogResponse.json();
if (index.schema !== 'agentsam.website-theme-install-index.v1' || !Array.isArray(index.packages)) {
  throw Error('Theme Store install index schema invalid');
}
if (catalog?.ok !== true || catalog.schema !== 'iam.theme-catalog.v1' || !Array.isArray(catalog.products)) {
  throw Error('Theme Store catalog schema invalid');
}

const products = new Map(catalog.products.map(product => [product.slug + '@' + product.version, product]));
if (!index.packages.length) throw Error('Theme Store has no installer-ready theme releases');

for (const release of index.packages) {
  const { slug, version, sha256, project_sha256, project_key, project_url } = release;
  if (!SAFE_SLUG.test(slug || '') || !SAFE_VERSION.test(version || '') ||
      !HASH.test(sha256 || '') || !HASH.test(project_sha256 || '') ||
      project_key !== 'install-projects/' + slug + '/' + version + '/' + project_sha256 + '.json' ||
      project_url !== '/api/themes/' + slug + '/' + version + '/project') {
    throw Error('Invalid Theme Store install-index entry: ' + String(slug));
  }

  const product = products.get(slug + '@' + version);
  if (!product || product.release?.status !== 'published' ||
      product.release.sha256 !== sha256 ||
      product.release.storageKey !== 'releases/' + slug + '/' + version + '/' + sha256 + '.zip') {
    throw Error('Theme Store catalog/index release mismatch: ' + slug + '@' + version);
  }

  const prefix = base + '/theme-packages/' + slug + '/' + version + '/preview/';
  const manifestResponse = await fetch(prefix + 'preview-files.json');
  if (!manifestResponse.ok) {
    throw Error('Theme Store preview manifest unavailable: ' + slug + '@' + version + ' (' + manifestResponse.status + ')');
  }
  const manifest = await manifestResponse.json();
  if (manifest.schema !== 'iam.theme-preview-files.v1' || manifest.slug !== slug ||
      manifest.version !== version || !Array.isArray(manifest.files)) {
    throw Error('Theme Store preview manifest identity mismatch: ' + slug + '@' + version);
  }
  if (!manifest.files.some(item => item.path === 'index.html')) {
    throw Error('Preview index missing from manifest: ' + slug);
  }

  const target = path.join(outputRoot, slug, 'demo');
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const entry of manifest.files) {
    if (!safePath(entry.path) || !HASH.test(entry.sha256 || '')) {
      throw Error('Invalid preview manifest entry: ' + slug);
    }
    const response = await fetch(prefix + entry.path.split('/').map(encodeURIComponent).join('/'));
    if (!response.ok) {
      throw Error('Theme Store preview file unavailable: ' + slug + '/' + entry.path + ' (' + response.status + ')');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== entry.sha256) {
      throw Error('Theme Store preview SHA-256 mismatch: ' + slug + '/' + entry.path);
    }
    const destination = path.join(target, ...entry.path.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  console.log('Verified Theme Store preview ' + slug + '@' + version + ' (' + manifest.files.length + ' files)');
}
console.log('Synced ' + index.packages.length + ' installer-ready Theme Store previews.');
