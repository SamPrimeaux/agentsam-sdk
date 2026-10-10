#!/usr/bin/env node
/**
 * Local Studio vite.config aliases some monorepo packages to their /src trees.
 * Rolldown then resolves imports from packages/<name>/src → packages/<name>/node_modules.
 *
 * Cloudflare Builds only `npm ci`s apps/local-studio, so linked package deps land in
 * apps/local-studio/node_modules and are invisible to those source imports.
 *
 * Prefer linking already-installed studio deps into packages/<name>/node_modules;
 * fall back to a nested npm install. Fail loud if anything is still missing.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(studioRoot, '../..');
const packagesRoot = path.join(root, 'packages');
const studioNodeModules = path.join(studioRoot, 'node_modules');

/** Packages whose /src is aliased from apps/local-studio/vite.config.ts */
const ALIASED = ['agentsam-ide', 'agentsam-nav', 'agentsam-workbench', 'agentsam-settings', 'agentsam-analytics'];

const workspacePackages = new Map();
for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = path.join(packagesRoot, entry.name);
  const manifest = path.join(dir, 'package.json');
  if (!existsSync(manifest)) continue;
  try {
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    if (pkg?.name) workspacePackages.set(pkg.name, dir);
  } catch {
    // Invalid package manifests are surfaced by the normal package verification lane.
  }
}

function depTarget(pkgDir, name) {
  const parts = name.startsWith('@') ? name.split('/') : [name];
  return path.join(pkgDir, 'node_modules', ...parts);
}

function studioDepTarget(name) {
  const parts = name.startsWith('@') ? name.split('/') : [name];
  return path.join(studioNodeModules, ...parts);
}

function packageEntryTarget(pkg) {
  const rootExport = pkg?.exports?.['.'];
  if (typeof rootExport === 'string') return rootExport;
  if (rootExport && typeof rootExport === 'object') {
    if (typeof rootExport.import === 'string') return rootExport.import;
    if (typeof rootExport.default === 'string') return rootExport.default;
    if (typeof rootExport.require === 'string') return rootExport.require;
  }
  if (typeof pkg?.module === 'string') return pkg.module;
  if (typeof pkg?.main === 'string') return pkg.main;
  return null;
}

function packageReady(pkgDir) {
  const manifest = path.join(pkgDir, 'package.json');
  if (!existsSync(manifest)) return false;
  try {
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    const entry = packageEntryTarget(pkg);
    if (!entry || !entry.startsWith('./')) return true;
    return existsSync(path.join(pkgDir, entry));
  } catch {
    return false;
  }
}

function missingDeps(pkgDir, deps) {
  return Object.keys(deps || {}).filter((name) => !packageReady(depTarget(pkgDir, name)));
}

function linkPackageDir(pkgDir, name, source) {
  if (!source || !packageReady(source)) return false;
  const target = depTarget(pkgDir, name);
  mkdirSync(path.dirname(target), { recursive: true });
  rmSync(target, { recursive: true, force: true });
  try {
    symlinkSync(source, target, 'dir');
  } catch {
    cpSync(source, target, { recursive: true, dereference: true });
  }
  return existsSync(path.join(target, 'package.json'));
}

function linkFromStudio(pkgDir, name) {
  return linkPackageDir(pkgDir, name, studioDepTarget(name));
}

// Monorepo installs commonly hoist shared runtime deps to the repository root.
// Reuse those before attempting a nested network install; Vite's aliased /src
// modules still need each dependency resolvable at the package's own path.
function linkFromRepoRoot(pkgDir, name) {
  const parts = name.startsWith('@') ? name.split('/') : [name];
  return linkPackageDir(pkgDir, name, path.join(root, 'node_modules', ...parts));
}

// Sibling SDK packages are source links, not installed development workspaces.
// Cloudflare's app-scoped npm ci has the toolchain in Local Studio/node_modules,
// but Node and tsc resolving from packages/* cannot see it. Link available build
// tooling before compiling each workspace; never install it into the git tree.
function linkBuildTooling(pkgDir, pkg) {
  const linked = [];
  for (const name of Object.keys(pkg?.devDependencies || {})) {
    if (packageReady(depTarget(pkgDir, name))) continue;
    if (linkFromStudio(pkgDir, name) || linkFromRepoRoot(pkgDir, name)) {
      linked.push(name);
    }
  }
  if (linked.length) {
    console.log('[ensure-aliased-deps] ' + pkg.name + ': linked build tooling · ' + linked.join(', '));
  }
}

function linkFromWorkspace(pkgDir, name) {
  const source = workspacePackages.get(name);
  if (!source) return false;

  if (!packageReady(source)) {
    const manifest = path.join(source, 'package.json');
    try {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      if (pkg?.scripts?.build) {
        linkBuildTooling(source, pkg);
        console.log('[ensure-aliased-deps] ' + name + ': building workspace dependency');
        execFileSync(
          'npm',
          ['run', 'build', '--workspaces=false'],
          { cwd: source, stdio: 'inherit', env: childNpmEnv() },
        );
      }
    } catch (err) {
      console.warn('[ensure-aliased-deps] ' + name + ': workspace build failed · ' + (err?.message || err));
      return false;
    }
  }

  return linkPackageDir(pkgDir, name, source);
}

function childNpmEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      /^npm_config_allow[_-]?scripts$/i.test(key) ||
      /^npm_config_workspace(s)?$/i.test(key)
    ) {
      delete env[key];
    }
  }
  return env;
}

function installNested(pkgDir) {
  execFileSync(
    'npm',
    [
      'install',
      '--omit=dev',
      '--no-package-lock',
      '--no-audit',
      '--no-fund',
      '--ignore-scripts',
      '--install-strategy=nested',
      '--workspaces=false',
    ],
    { cwd: pkgDir, stdio: 'inherit', env: childNpmEnv() },
  );
}

let failed = false;

for (const name of ALIASED) {
  const pkgDir = path.join(packagesRoot, name);
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    console.warn(`[ensure-aliased-deps] skip missing ${name}`);
    continue;
  }
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.peerDependencies || {}) };
  if (!Object.keys(deps).length) {
    console.log(`[ensure-aliased-deps] ${name}: no runtime or peer deps; will still build missing exports`);
  }

  let missing = missingDeps(pkgDir, deps);
  if (!missing.length) {
    console.log('[ensure-aliased-deps] ' + name + ': node_modules ok');
  } else {
    console.log('[ensure-aliased-deps] ' + name + ': missing ' + missing.join(', '));
    const linkedFromStudio = [];
    const linkedFromWorkspace = [];
    for (const dep of missing) {
      if (linkFromStudio(pkgDir, dep)) linkedFromStudio.push(dep);
      else if (linkFromRepoRoot(pkgDir, dep)) linkedFromStudio.push(dep);
      else if (linkFromWorkspace(pkgDir, dep)) linkedFromWorkspace.push(dep);
    }
    if (linkedFromStudio.length) {
      console.log('[ensure-aliased-deps] ' + name + ': linked from studio · ' + linkedFromStudio.join(', '));
    }
    if (linkedFromWorkspace.length) {
      console.log('[ensure-aliased-deps] ' + name + ': linked from workspace · ' + linkedFromWorkspace.join(', '));
    }

    missing = missingDeps(pkgDir, deps);
    if (missing.length) {
      console.log('[ensure-aliased-deps] ' + name + ': npm install nested for ' + missing.join(', '));
      installNested(pkgDir);
      // A nested npm install can replace/remove prior source and peer links.
      // Restore canonical workspace sources and the app-installed runtime deps.
      for (const dep of Object.keys(deps)) {
        if (workspacePackages.has(dep)) linkFromWorkspace(pkgDir, dep);
        else if (!packageReady(depTarget(pkgDir, dep))) {
          linkFromStudio(pkgDir, dep) || linkFromRepoRoot(pkgDir, dep);
        }
      }
    }

    missing = missingDeps(pkgDir, deps);
    if (missing.length) {
      console.error('[ensure-aliased-deps] ' + name + ': still missing after install: ' + missing.join(', '));
      failed = true;
      continue;
    }
  }

  if (!packageReady(pkgDir) && pkg?.scripts?.build) {
    linkBuildTooling(pkgDir, pkg);
    console.log('[ensure-aliased-deps] ' + name + ': building aliased package exports');
    try {
      execFileSync(
        'npm',
        ['run', 'build', '--workspaces=false'],
        { cwd: pkgDir, stdio: 'inherit', env: childNpmEnv() },
      );
    } catch (err) {
      console.error('[ensure-aliased-deps] ' + name + ': package build failed · ' + (err?.message || err));
      failed = true;
      continue;
    }
  }

  if (!packageReady(pkgDir)) {
    console.error('[ensure-aliased-deps] ' + name + ': exported package entry is still missing after build');
    failed = true;
  } else {
    console.log('[ensure-aliased-deps] ' + name + ': ready');
  }
}

console.log(`[ensure-aliased-deps] ${failed ? 'failed' : 'done'}`);
if (failed) process.exit(1);
