#!/usr/bin/env node
/**
 * Fetch verified, immutable previews from Theme Store for Local Studio demos.
 * Theme source and publication live in Theme Store; this repository only bundles
 * the selected release artifacts needed for a local/desktop preview.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pins = JSON.parse(await readFile(path.join(root, 'theme-store-previews.json'), 'utf8'));
const outputRoot = path.join(root, 'frontend/public/themes');
const base = 'https://inneranimalmedia-theme-store.meauxbility.workers.dev/theme-packages/';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const safePath = (value) => typeof value === 'string' && value.length > 0
  && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some((part) => !part || part === '.' || part === '..');

for (const [slug, version] of Object.entries(pins)) {
  if (!/^[a-z0-9-]+$/.test(slug) || !/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version)) {
    throw new Error('Invalid pinned Theme Store release: ' + slug + '@' + version);
  }
  const prefix = base + slug + '/' + version + '/preview/';
  const manifestResponse = await fetch(prefix + 'preview-files.json');
  if (!manifestResponse.ok) throw new Error('Theme Store manifest unavailable: ' + slug + '@' + version + ' (' + manifestResponse.status + ')');
  const manifest = await manifestResponse.json();
  if (manifest.schema !== 'iam.theme-preview-files.v1' || manifest.slug !== slug || manifest.version !== version || !Array.isArray(manifest.files)) {
    throw new Error('Theme Store manifest identity mismatch: ' + slug + '@' + version);
  }
  if (!manifest.files.some((item) => item.path === 'index.html')) throw new Error('Preview index missing from manifest: ' + slug);
  const target = path.join(outputRoot, slug, 'demo');
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const entry of manifest.files) {
    if (!safePath(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid preview manifest entry: ' + slug);
    const response = await fetch(prefix + entry.path.split('/').map(encodeURIComponent).join('/'));
    if (!response.ok) throw new Error('Theme Store preview file unavailable: ' + slug + '/' + entry.path + ' (' + response.status + ')');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== entry.sha256) throw new Error('Theme Store preview SHA-256 mismatch: ' + slug + '/' + entry.path);
    const destination = path.join(target, ...entry.path.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  console.log('Verified Theme Store preview ' + slug + '@' + version + ' (' + manifest.files.length + ' files)');
}
