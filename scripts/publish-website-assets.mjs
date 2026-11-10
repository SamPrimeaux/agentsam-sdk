#!/usr/bin/env node
/**
 * Publish local site tree → WEBSITE_ASSETS R2 (CMS code-section SSOT).
 *
 *   npm run site:publish          (repo root)
 *   npm run site:publish -w …     (or from apps/local-studio)
 *
 * Uploads non-HTML assets from apps/frontend/public/site/** →
 *   sites/agentsam-sdk/public/**
 * HTML pages and shared header/footer partials are CMS-owned and excluded.
 * They require explicit authenticated editor promotion and version receipt.
 *
 * Requires Cloudflare auth (wrangler) and the agentsam-sdk Worker config.
 * Does not touch Worker static ASSETS — those remain the SPA build output.
 * --only=relative-path-prefix restricts uploads; --dry-run previews them.
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
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length) || null;
if (only && (only.startsWith('/') || only.includes('..') || only.includes('\\')))
  throw new Error('site_publish_only_invalid');
const eligible = relative => !/\.html?$/i.test(relative) &&
  !relative.includes('/_sections/') &&
  !relative.startsWith('_sections/') && !relative.includes('source.architecture_field_manual') &&
  !relative.split('/').some(part => part.startsWith('.')) &&
  (!only || relative === only || relative.startsWith(only));

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
    '--remote',
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
  const rel = path.relative(siteRoot, filePath).split(path.sep).join('/');
  if (!eligible(rel)) continue;
  const key = 'sites/' + siteSlug + '/public/' + rel;
  results.push(putObject(key, filePath));
}

// Header/footer HTML and all pages are deliberately excluded from bulk puts.

const failed = results.filter((r) => !r.ok);
console.log(
  JSON.stringify(
    {
      ok: failed.length === 0,
      bucket,
      siteSlug,
      uploaded: results.filter((r) => r.ok).length,
      html_managed_by: 'cms-source-publish',
      skipped: files.length - results.length,
      ...(only ? { only } : {}),
      failed: failed.map((f) => f.key),
      dryRun,
    },
    null,
    2
  )
);
process.exit(failed.length ? 1 : 0);
