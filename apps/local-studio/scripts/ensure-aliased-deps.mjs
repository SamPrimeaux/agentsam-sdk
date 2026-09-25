#!/usr/bin/env node
/**
 * Local Studio vite.config aliases some monorepo packages to their /src trees.
 * Rolldown then resolves imports from packages/<name>/src → packages/<name>/node_modules.
 *
 * Cloudflare Builds only `npm ci`s apps/local-studio, so linked package deps land in
 * apps/local-studio/node_modules and are invisible to those source imports.
 *
 * Install each aliased package's runtime deps into its own node_modules before vite build.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(studioRoot, '../..');
const packagesRoot = path.join(root, 'packages');

/** Packages whose /src is aliased from apps/local-studio/vite.config.ts */
const ALIASED = ['agentsam-nav', 'agentsam-workbench'];

function needsInstall(pkgDir, deps) {
  for (const name of Object.keys(deps || {})) {
    // scoped packages: @radix-ui/react-dialog → node_modules/@radix-ui/react-dialog
    const parts = name.startsWith('@') ? name.split('/') : [name];
    const target = path.join(pkgDir, 'node_modules', ...parts, 'package.json');
    if (!existsSync(target)) return true;
  }
  return false;
}

for (const name of ALIASED) {
  const pkgDir = path.join(packagesRoot, name);
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    console.warn(`[ensure-aliased-deps] skip missing ${name}`);
    continue;
  }
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const deps = { ...(pkg.dependencies || {}) };
  if (!Object.keys(deps).length) {
    console.log(`[ensure-aliased-deps] ${name}: no runtime deps`);
    continue;
  }
  if (!needsInstall(pkgDir, deps)) {
    console.log(`[ensure-aliased-deps] ${name}: node_modules ok`);
    continue;
  }
  console.log(`[ensure-aliased-deps] Installing runtime deps for packages/${name}…`);
  execFileSync(
    'npm',
    [
      'install',
      '--omit=dev',
      '--no-package-lock',
      '--no-audit',
      '--no-fund',
      '--ignore-scripts',
      // Keep deps under packages/<name>/node_modules so Vite source aliases resolve on CF Builds
      '--install-strategy=nested',
    ],
    { cwd: pkgDir, stdio: 'inherit', env: process.env }
  );
}

console.log('[ensure-aliased-deps] done');
