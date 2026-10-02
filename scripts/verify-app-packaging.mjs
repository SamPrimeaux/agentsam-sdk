#!/usr/bin/env node
/**
 * Portable APP packaging audit. This checks the app boundary without building or
 * deploying an app. It is intentionally safe to run in CI and on non-Apple hosts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listAppManifests } from '../src/commands/app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const selected = args.find((arg) => !arg.startsWith('-')) || null;
const pack = args.includes('--pack');
const apps = listAppManifests(root).filter((app) => !selected || app.id === selected);
if (selected && !apps.length) throw new Error(`unknown app: ${selected}`);

const errors = [];
const warnings = [];
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const exists = (file) => fs.existsSync(file);

function checkApp(app) {
  const pkgFile = path.join(app.dir, 'package.json');
  if (!exists(pkgFile)) { errors.push(`${app.id}: missing package.json`); return; }
  const pkg = readJson(pkgFile);
  if (pkg.name !== app.manifest.package) errors.push(`${app.id}: package.json name must match agentsam.app.json package (${app.manifest.package || '(missing)'})`);
  if (pkg.private === true) warnings.push(`${app.id}: package.json is private; this app is source/preview-only until publish intent is explicit`);
  if (!Array.isArray(pkg.files) || !pkg.files.length) errors.push(`${app.id}: root package.json must declare a files allowlist`);
  const isAppWorkspace = app.dir.startsWith(path.join(root, 'apps') + path.sep);
  if (isAppWorkspace && !exists(path.join(app.dir, 'package-lock.json'))) errors.push(`${app.id}: app-owned package-lock.json is required`);
  for (const surface of ['frontend', 'backend']) {
    const dir = path.join(app.dir, surface);
    const surfacePkg = path.join(dir, 'package.json');
    if (!exists(dir)) { warnings.push(`${app.id}: ${surface}/ is not declared`); continue; }
    if (!exists(surfacePkg)) {
      if (isAppWorkspace) errors.push(`${app.id}: ${surface}/package.json is required`);
      else warnings.push(`${app.id}: ${surface}/package.json is not present; package-owned apps may expose compiled ${surface} entrypoints instead`);
    }
    else {
      const child = readJson(surfacePkg);
      if (!child.scripts || (!child.scripts.build && !child.scripts.typecheck)) warnings.push(`${app.id}: ${surface} has no build/typecheck script`);
      if (child.private === false) warnings.push(`${app.id}: ${surface} is independently publishable; confirm this is intentional`);
    }
  }
  if (exists(path.join(app.dir, 'backend'))) {
    if (!exists(path.join(app.dir, 'backend/wrangler.jsonc')) && !exists(path.join(app.dir, 'backend/wrangler.toml'))) warnings.push(`${app.id}: backend has no Wrangler config; mark non-Cloudflare explicitly if intentional`);
  }
  if (pkg.bin) for (const target of Object.values(typeof pkg.bin === 'string' ? { default: pkg.bin } : pkg.bin)) if (!exists(path.join(app.dir, target))) errors.push(`${app.id}: bin target missing: ${target}`);
  const files = pkg.files || [];
  for (const forbidden of ['reference', 'attachments', 'node_modules']) if (files.some((entry) => entry === forbidden || entry.startsWith(`${forbidden}/`))) errors.push(`${app.id}: package files allowlist must not include ${forbidden}`);
  if (pack) {
    const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: app.dir, encoding: 'utf8' });
    if (result.status !== 0) { errors.push(`${app.id}: npm pack dry-run failed: ${String(result.stderr || result.stdout).trim()}`); return; }
    let payload; try { payload = JSON.parse(result.stdout)[0]; } catch { errors.push(`${app.id}: npm pack returned invalid JSON`); return; }
    if (payload.name !== pkg.name) errors.push(`${app.id}: npm pack name mismatch`);
    for (const file of payload.files || []) {
      if (/^(reference|attachments|node_modules)(\/|$)/.test(file.path)) errors.push(`${app.id}: forbidden packed path: ${file.path}`);
    }
    if (!payload.files?.some((file) => file.path === 'package.json')) errors.push(`${app.id}: package.json missing from npm pack`);
  }
}
for (const app of apps) checkApp(app);
const report = { ok: errors.length === 0, apps: apps.map((app) => app.id), errors, warnings, pack };
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
