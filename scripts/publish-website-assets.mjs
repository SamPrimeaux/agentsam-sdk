#!/usr/bin/env node
/**
 * Publish local site tree → WEBSITE_ASSETS R2 (CMS code-section SSOT).
 *
 *   npm run site:publish          (repo root)
 *   npm run site:publish -w …     (or from apps/local-studio)
 *
 * Uploads apps/frontend/public/site/** →
 *   sites/agentsam-sdk/public/**
 * and ASBD shell partials →
 *   sites/agentsam-sdk/partials/{header,footer}.html
 *
 * Requires Cloudflare auth (wrangler) and the agentsam-sdk Worker config.
 * Does not touch Worker static ASSETS — those remain the SPA build output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.join(root, 'apps/frontend/public/site');
const studioRoot = path.join(root, 'apps/local-studio');
const wranglerConfig = path.join(studioRoot, 'backend/wrangler.jsonc');
const bucket = process.env.AGENTSAM_WEBSITE_BUCKET || 'agentsam-os-blueprint-content';
const siteSlug = process.env.AGENTSAM_SITE_SLUG || 'agentsam-sdk';
const dryRun = process.argv.includes('--dry-run');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function putObject(key, filePath) {
  const args = [
    'r2',
    'object',
    'put',
    `${bucket}/${key}`,
    '--file',
    filePath,
    '--content-type',
    contentType(filePath),
    '-c',
    wranglerConfig,
  ];
  if (dryRun) {
    console.log(JSON.stringify({ dry_run: true, key, file: path.relative(root, filePath) }));
    return { ok: true };
  }
  const r = spawnSync('npx', ['wrangler', ...args], {
    cwd: studioRoot,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || `wrangler put failed for ${key}`);
    return { ok: false, key };
  }
  return { ok: true, key };
}

if (!fs.existsSync(siteRoot)) {
  console.error(JSON.stringify({ ok: false, error: 'site_root_missing', siteRoot }));
  process.exit(1);
}

const files = walk(siteRoot);
const results = [];

for (const filePath of files) {
  // Skip donor snapshots from public R2 publish
  if (filePath.includes('source.architecture_field_manual')) continue;
  const rel = path.relative(siteRoot, filePath).split(path.sep).join('/');
  const key = `sites/${siteSlug}/public/${rel}`;
  results.push(putObject(key, filePath));
}

// Promote ASBD shell into partials (CMS shared chrome)
const header = path.join(siteRoot, 'global/asbd-header.html');
const footer = path.join(siteRoot, 'global/asbd-footer.html');
if (fs.existsSync(header)) {
  results.push(putObject(`sites/${siteSlug}/partials/header.html`, header));
}
if (fs.existsSync(footer)) {
  results.push(putObject(`sites/${siteSlug}/partials/footer.html`, footer));
}

const failed = results.filter((r) => !r.ok);
console.log(
  JSON.stringify(
    {
      ok: failed.length === 0,
      bucket,
      siteSlug,
      uploaded: results.filter((r) => r.ok).length,
      failed: failed.map((f) => f.key),
      dryRun,
    },
    null,
    2
  )
);
process.exit(failed.length ? 1 : 0);
