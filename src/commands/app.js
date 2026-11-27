import { AgentSamDiagnosticError } from '../errors/diagnostic.js';
import { buildAppInventory, formatAppInventory } from './app-inventory.js';
import { evidenceStorageProblems } from '../sam/packs/evidence/endpoint.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function appFailure(code, message) {
  return new AgentSamDiagnosticError({ source: 'agentsam-sdk', kind: 'runtime_error', code, message });
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/**
 * Where APP manifests are read from. The installed CLI ships APP manifest definitions, so discovery
 * must not depend on where the CLI lives: explicit root, else the agentsam-sdk checkout the user
 * is standing in (walking up from cwd), else the package's own directory.
 */
export function findCheckoutRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name === '@inneranimalmedia/agentsam-sdk' && fs.existsSync(path.join(dir, 'apps'))) return dir;
    } catch { /* not a package root */ }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function resolveSourceRoot(options = {}) {
  return options.root || findCheckoutRoot() || REPO_ROOT;
}

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const FORBIDDEN_STRING_APP = /\bconst\s+APP\s*=\s*["'`][^"'`]+["'`]/;
const HOST_PRODUCT_FIELDS = new Set([
  'id',
  'name',
  'package',
  'bin',
  'commands',
  'routes',
  'surfaces',
  'capabilities',
  'entrypoints',
  'version',
  'kind',
  'product_id',
]);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

import {listAppManifests,isHostComponentOnlyApp} from '../../packages/agentsam-desktop-shell/scripts/app-discovery.mjs';
export {listAppManifests};

function resolveApp(id, root = REPO_ROOT) {
  const apps = listAppManifests(root);
  const hit = apps.find((row) => row.id === id || path.basename(row.dir) === id);
  if (!hit) {
    const available = apps.map((a) => a.id).join(', ') || '(none)';
    throw appFailure('app_unknown', `unknown AgentSam app: ${id}. Available: ${available}`);
  }
  return hit;
}

// npm is the existing machine package manager (also used by scripts/install.sh).
// Account entitlements and native desktop installation are separate lifecycles.
const APP_PACKAGE = /^@inneranimalmedia\/[a-z0-9][a-z0-9-]*$/;
const APP_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function npmGlobalRoot(env = process.env) {
  const result = spawnSync('npm', ['root', '--global'], { encoding: 'utf8', env });
  if (result.error || result.status !== 0 || !path.isAbsolute(String(result.stdout || '').trim())) {
    throw appFailure('npm_global_root_unavailable', 'Unable to resolve the npm global installation directory');
  }
  return String(result.stdout).trim();
}

function installedApp(app, globalRoot, expectedVersion) {
  const name = app.manifest.package;
  if (!APP_PACKAGE.test(name || '')) return null;
  const dir = path.join(globalRoot, name);
  if (!fs.existsSync(dir)) return null;
  const pkg = readJson(path.join(dir, 'package.json'));
  const manifestPath = path.join(dir, 'agentsam.app.json');
  const manifest = readJson(manifestPath);
  if (pkg.name !== name || manifest.schema !== 'agentsam.app.v1' || manifest.kind !== 'app' ||
      manifest.id !== app.id || manifest.package !== name || manifest.version !== pkg.version ||
      (expectedVersion && pkg.version !== expectedVersion)) {
    throw appFailure('app_identity_mismatch', `Installed package identity/version mismatch: ${name}`);
  }
  const bin = manifest.bin || manifest.entrypoints?.cli || null;
  if (bin) {
    const target = path.resolve(dir, bin);
    const relative = path.relative(dir, target);
    const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin || {});
    if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative) ||
        !bins.some(value => path.resolve(dir, value) === target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      throw appFailure('app_executable_invalid', `Installed app has an invalid or missing executable: ${name}`);
    }
    const actual = path.relative(fs.realpathSync(dir), fs.realpathSync(target));
    if (actual === '..' || actual.startsWith('..' + path.sep) || path.isAbsolute(actual)) throw appFailure('app_executable_escape', 'Installed app executable escapes package');
  }
  return { ...app, dir, manifestPath, manifest, bin, commands: manifest.commands || {} };
}

export function installAppPackage(app, args = [], options = {}) {
  const env = options.env || process.env;
  const write = options.write || (text => process.stdout.write(text));
  let version;
  let previewPackage = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version') { version = args[++i]; if (!version) throw appFailure('app_version_required', '--version requires an exact version'); }
    else if (args[i] === '--preview-package') previewPackage = true;
    else throw appFailure('app_install_option_unknown', `Unknown app install option: ${args[i]}`);
  }
  const name = app.manifest.package;
  if (!APP_PACKAGE.test(name || '') || (version !== undefined && !APP_VERSION.test(version))) throw appFailure('app_package_identity_invalid', `App ${app.id} has no valid npm package identity or exact requested version`);
  const distribution = app.manifest.distribution || {};
  const sourcePackage = path.join(app.dir, 'package.json');
  if (['source-private', 'bundled-source'].includes(distribution.release_status) ||
      (fs.existsSync(sourcePackage) && readJson(sourcePackage).private === true)) {
    throw appFailure('app_release_unavailable', `App ${app.id} has no independently released npm distribution`);
  }
  if (distribution.native_release_required && !previewPackage) {
    throw appFailure('app_native_installer_required', `App ${app.id} requires a native installer; npm is only its preview distribution. Use --preview-package explicitly for that distribution.`);
  }
  if (previewPackage && !distribution.native_release_required) throw appFailure('app_preview_option_invalid', '--preview-package is only for a desktop host preview distribution');
  // The manifest identifies the product; npm's latest dist-tag identifies its
  // released version. A source version may be ahead of the public registry.
  if (version === undefined) {
    const result = spawnSync('npm', ['view', `${name}@latest`, 'version', '--json', '--prefer-online', '--fetch-retries=0', '--fetch-timeout=15000'], { env, encoding: 'utf8' });
    if (result.error || result.status !== 0) throw appFailure('npm_release_resolution_failed', `Cannot resolve published latest release for ${name}: ${String(result.stderr || result.error?.message || '').trim()}`);
    try { version = JSON.parse(result.stdout); } catch { throw appFailure('npm_release_response_invalid', `Invalid npm release response for ${name}`); }
    if (typeof version !== 'string' || !APP_VERSION.test(version)) throw appFailure('npm_release_version_invalid', `Invalid npm release version for ${name}`);
    write(`Published latest: ${name}@${version}\n`);
  }
  const globalRoot = npmGlobalRoot(env);
  const spec = `${name}@${version}`;
  const current = installedApp(app, globalRoot);
  if (!current || current.manifest.version !== version) {
    write(`Installing ${spec} via npm...\n`);
    const result = spawnSync('npm', ['install', '--global', '--no-audit', '--no-fund', spec], { env, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw appFailure('app_install_failed', `npm installation failed for ${spec}; no verified installation recorded`);
  }
  const installed = installedApp(app, globalRoot, version);
  if (!installed) throw appFailure('app_install_missing', `npm did not produce an installed app: ${spec}`);
  const standalone = Boolean(installed.bin);
  write(`Installed package verified: ${spec}\n`);
  if (standalone) write(`Run: agentsam app doctor ${app.id} / agentsam app preview ${app.id}\n`);
  else write('Package installed; no standalone executable is declared. Host integration is not activated.\n');
  if (distribution.native_release_required) write('Preview package only; native desktop application not installed.\n');
  return { id: app.id, package: name, version, directory: installed.dir, installed: true, standalone_entrypoint: standalone, native_installed: false, account_installation_changed: false };
}

function runAppBin(app, args, options = {}) {
  if (!app.bin) throw appFailure('app_bin_undefined', `app ${app.id} has no bin entry`);
  const binPath = path.resolve(app.dir, app.bin);
  if (!fs.existsSync(binPath)) throw appFailure('app_bin_missing', `app bin missing: ${binPath}`);
  const result = spawnSync(process.execPath, [binPath, ...args], {
    cwd: options.cwd || process.cwd(),
    stdio: 'inherit',
    env: options.env || process.env,
  });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.output' || entry.name === 'target') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (/\.(js|mjs|cjs|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function walkPackageJsonFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.output', 'target', '.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPackageJsonFiles(full, out);
    else if (entry.name === 'package.json') out.push(full);
  }
  return out;
}

function npmDistributionWarnings(app) {
  const warnings = [];
  const installCommand = clean(app.manifest?.install?.command);
  const declaresNpmInstall = /^npm\s+(?:i|install)\b/.test(installCommand);
  if (!declaresNpmInstall) return warnings;

  const rootPackagePath = path.join(app.dir, 'package.json');
  if (!fs.existsSync(rootPackagePath)) {
    return [`${app.id}: distribution: install.command advertises npm but package.json is missing`];
  }

  let rootPackage;
  try {
    rootPackage = readJson(rootPackagePath);
  } catch (error) {
    return [`${app.id}: distribution: package.json is invalid JSON: ${error.message}`];
  }

  if (app.manifest.package && rootPackage.name !== app.manifest.package) {
    warnings.push(`${app.id}: distribution: manifest package ${app.manifest.package} does not match package.json name ${rootPackage.name || '(missing)'}`);
  }
  if (rootPackage.private === true) {
    warnings.push(`${app.id}: distribution: package.json private=true but install.command advertises npm installation`);
  }

  const expectedBin = clean(app.manifest.bin || app.manifest?.entrypoints?.cli);
  const packageBins = typeof rootPackage.bin === 'string'
    ? [rootPackage.bin]
    : Object.values(rootPackage.bin || {}).map(clean).filter(Boolean);
  if (expectedBin && !packageBins.includes(expectedBin)) {
    warnings.push(`${app.id}: distribution: package.json does not expose manifest CLI bin ${expectedBin}`);
  }
  if (!Array.isArray(rootPackage.files) || rootPackage.files.length === 0) {
    warnings.push(`${app.id}: distribution: package.json has no explicit files allowlist`);
  }

  const escaping = [];
  for (const packageFile of walkPackageJsonFiles(app.dir)) {
    let nested;
    try { nested = readJson(packageFile); } catch { continue; }
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, spec] of Object.entries(nested[group] || {})) {
        if (typeof spec !== 'string' || !spec.startsWith('file:')) continue;
        const target = path.resolve(path.dirname(packageFile), spec.slice(5));
        const insideApp = target === app.dir || target.startsWith(`${app.dir}${path.sep}`);
        if (!insideApp) {
          escaping.push(`${path.relative(app.dir, packageFile)}:${group}:${name}=${spec}`);
        }
      }
    }
  }
  if (escaping.length) {
    warnings.push(`${app.id}: distribution: ${escaping.length} repo-local file: dependencies escape the app package (${escaping.join(', ')})`);
  }

  return warnings;
}

/**
 * `embed` tells a host (Local Studio) how to build/stage this app when it is listed in the host's
 * included_apps. Hosts read this; they must not hardcode per-app build logic.
 */
export function validateEmbed(manifest, label) {
  const errors = [];
  const embed = manifest?.embed;
  if (embed === undefined) return errors;
  if (!embed || typeof embed !== 'object' || Array.isArray(embed)) return [`${label}: embed must be an object`];
  const argv = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x.length > 0);
  const relative = (v) => typeof v === 'string' && v.length > 0 && !v.startsWith('/') && !v.split('/').includes('..');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(embed.stage ?? '')) {
    errors.push(`${label}: embed.stage must be a lowercase kebab-case path segment`);
  }
  const build = embed.build;
  if (build !== undefined) {
    if (!build || typeof build !== 'object' || Array.isArray(build)) {
      errors.push(`${label}: embed.build must be an object`);
    } else {
      if (!argv(build.command)) errors.push(`${label}: embed.build.command must be a non-empty string array`);
      if (!relative(build.output)) errors.push(`${label}: embed.build.output must be a relative path without ".."`);
      if (build.cwd !== undefined && !relative(build.cwd) && build.cwd !== '.') {
        errors.push(`${label}: embed.build.cwd must be a relative path without ".."`);
      }
      if (build.install !== undefined && !argv(build.install?.command)) {
        errors.push(`${label}: embed.build.install.command must be a non-empty string array`);
      }
    }
  }
  return errors;
}

function validateOneApp(app, knownIds, root) {
  const errors = [];
  errors.push(...validateEmbed(app.manifest, app.id));
  if (app.manifest?.storage && Object.hasOwn(app.manifest.storage, 'evidenceEndpoint')) {
    errors.push(...evidenceStorageProblems(app.manifest.storage).map((problem) => `${app.id}: storage: ${problem}`));
  }
  const warnings = [];
  const m = app.manifest;

  if (m.schema !== 'agentsam.app.v1') {
    errors.push(`${app.id}: schema must be "agentsam.app.v1"`);
  }
  if (!KEBAB.test(app.id)) {
    errors.push(`${app.id}: id must be kebab-case (^[a-z][a-z0-9]*(-[a-z0-9]+)*$)`);
  }
  const dirId = path.basename(app.dir);
  if (dirId !== app.id && !m.directory_id_exception) {
    errors.push(`${app.id}: directory basename "${dirId}" must equal id (set directory_id_exception if intentional)`);
  }
  if (m.kind !== 'app') {
    errors.push(`${app.id}: kind must be "app"`);
  }
  if (m.product_id != null && !KEBAB.test(m.product_id)) {
    errors.push(`${app.id}: product_id must be kebab-case`);
  }
  if (m.package && m.package === app.id) {
    errors.push(`${app.id}: package must not equal APP.id (PACKAGE namespace is separate)`);
  }
  if (typeof m.package === 'string' && m.package.startsWith('@') === false && m.package.includes('/')) {
    warnings.push(`${app.id}: package looks unusual: ${m.package}`);
  }

  const caps = m.capabilities;
  if (caps == null) {
    warnings.push(`${app.id}: capabilities not declared`);
  } else if (!Array.isArray(caps) && (typeof caps !== 'object' || caps === null)) {
    errors.push(`${app.id}: capabilities must be an array or boolean map`);
  }

  if (!m.entrypoints && !m.bin) {
    warnings.push(`${app.id}: neither entrypoints nor bin declared`);
  }

  // A manifest version is not independently authoritative from its source package.
  // Fail validation rather than shipping a stale product version in the desktop.
  const packageJsonPath = path.join(app.dir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = readJson(packageJsonPath);
    if (pkg.name && m.package && pkg.name !== m.package) {
      errors.push(`${app.id}: manifest package differs from package.json`);
    }
    if (pkg.version && m.version !== pkg.version) {
      errors.push(`${app.id}: manifest version ${m.version ?? '(missing)'} differs from package.json ${pkg.version}`);
    }
  }
  warnings.push(...npmDistributionWarnings(app));

  const hostPath = path.join(app.dir, '.agentsam', 'app.json');
  if (fs.existsSync(hostPath)) {
    let host;
    try {
      host = readJson(hostPath);
    } catch (err) {
      errors.push(`${app.id}: .agentsam/app.json invalid JSON: ${err.message}`);
      host = null;
    }
    if (host) {
      if (host.schema === 'agentsam.app.v1' || host.id) {
        errors.push(
          `${app.id}: .agentsam/app.json must be host/install state (agentsam.host-install.v1 with app_id), not a second product definition`,
        );
      }
      if (host.schema !== 'agentsam.host-install.v1') {
        errors.push(`${app.id}: .agentsam/app.json schema must be "agentsam.host-install.v1"`);
      }
      if (!host.app_id) {
        errors.push(`${app.id}: .agentsam/app.json missing app_id`);
      } else if (!knownIds.has(host.app_id)) {
        errors.push(`${app.id}: .agentsam/app.json app_id "${host.app_id}" does not resolve to a known APP`);
      } else if (host.app_id !== app.id) {
        errors.push(`${app.id}: .agentsam/app.json app_id "${host.app_id}" must match this APP.id`);
      }
      for (const field of HOST_PRODUCT_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(host, field)) {
          errors.push(`${app.id}: .agentsam/app.json must not redefine product field "${field}"`);
        }
      }
    }
  }

  for (const file of walkFiles(path.join(app.dir, 'backend'))) {
    const text = fs.readFileSync(file, 'utf8');
    if (FORBIDDEN_STRING_APP.test(text)) {
      const rel = path.relative(root, file);
      errors.push(`${app.id}: forbidden string APP identity in ${rel} — import agentsam.app.json instead`);
    }
  }

  return { id: app.id, errors, warnings };
}

function validateDesktopManifests(root, knownIds, apps = []) {
  const errors = [];
  const warnings = [];
  const dir = path.join(root, 'packages/agentsam-desktop-shell/manifests');
  if (!fs.existsSync(dir)) return { errors, warnings };
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json') || name === 'schema.json' || name === 'example.json') continue;
    const file = path.join(dir, name);
    let manifest;
    try {
      manifest = readJson(file);
    } catch (err) {
      errors.push(`desktop ${name}: invalid JSON: ${err.message}`);
      continue;
    }
    const appId = manifest.app_id;
    if (!appId) {
      errors.push(`desktop ${name}: missing app_id`);
      continue;
    }
    if (!KEBAB.test(appId)) {
      errors.push(`desktop ${name}: app_id must be kebab-case`);
    }
    // Brand shells (meauxbility, etc.) may not be APP products — only fail when
    // the filename suggests a product APP or when app_id is a known near-miss.
    const productish = ['cad-creator', 'ecommerce-cms-agentsam', 'local-studio', 'cms-editor'].includes(appId)
      || ['cad-creator', 'ecommerce-cms-agentsam', 'cms-editor', 'local-studio'].some((n) => name.startsWith(n));
    if (productish && !knownIds.has(appId)) {
      errors.push(`desktop ${name}: app_id "${appId}" does not resolve to a known APP manifest`);
    }
    const included = Array.isArray(manifest.included_apps) ? manifest.included_apps : [];
    for (const bundledId of included) {
      if (!KEBAB.test(bundledId)) {
        errors.push(`desktop ${name}: included_apps entry "${bundledId}" must be kebab-case`);
        continue;
      }
      if (!knownIds.has(bundledId)) {
        errors.push(
          `desktop ${name}: included_apps entry "${bundledId}" does not resolve to a known APP manifest`,
        );
      }
      const target = apps.find((a) => a.id === bundledId);
      if (target && !target.manifest.embed?.build && !isHostComponentOnlyApp(target.manifest)) {
        errors.push(
          `desktop ${name}: included app "${bundledId}" declares no embed.build or host-component screen in its agentsam.app.json`,
        );
      }
    }
  }
  return { errors, warnings };
}

export function validateApps(options = {}) {
  const root = resolveSourceRoot(options);
  const filterId = options.appId || null;
  const apps = listAppManifests(root);
  const knownIds = new Set(apps.map((a) => a.id));
  const selected = filterId ? apps.filter((a) => a.id === filterId || path.basename(a.dir) === filterId) : apps;

  if (filterId && selected.length === 0) {
    throw appFailure('app_filter_unknown', `unknown AgentSam app: ${filterId}`);
  }

  const idCounts = new Map();
  for (const app of apps) {
    idCounts.set(app.id, (idCounts.get(app.id) || 0) + 1);
  }

  const results = [];
  const allErrors = [];
  const allWarnings = [];

  for (const [id, count] of idCounts) {
    if (count > 1) allErrors.push(`duplicate APP.id across manifests: ${id}`);
  }

  for (const app of selected) {
    const result = validateOneApp(app, knownIds, root);
    results.push(result);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  if (!filterId) {
    const desktop = validateDesktopManifests(root, knownIds, apps);
    allErrors.push(...desktop.errors);
    allWarnings.push(...desktop.warnings);
  }

  return {
    ok: allErrors.length === 0,
    apps: results,
    errors: allErrors,
    warnings: allWarnings,
  };
}

export async function runApp(argv = [], options = {}) {
  const write = options.write || ((text) => process.stdout.write(text));
  const [command = 'list', appId, ...rest] = argv;
  if (command === '--help' || command === '-h' || command === 'help') {
    write([
      'agentsam app list',
      'agentsam app inventory [--json] [--packages]',
      'agentsam app info <id>',
      'agentsam app inspect <id>',
      'agentsam app validate [--all|<id>]',
      'agentsam app install <id> [--version <exact>] [--preview-package]',
      'agentsam app doctor <id>',
      'agentsam app preview <id>',
      'agentsam app scaffold <id> <dir>',
      'agentsam app package <id> [--dry-run]',
      '',
    ].join('\n'));
    return;
  }

  if (command === 'inventory') {
    const inventory = buildAppInventory(resolveSourceRoot(options));
    const args = [appId, ...rest].filter(Boolean);
    if (args.includes('--json')) {
      write(JSON.stringify(inventory, null, 2) + '\n');
    } else {
      write(formatAppInventory(inventory, { allPackages: args.includes('--packages') }));
    }
    return inventory;
  }

  if (command === 'list') {
    const sourceRoot = resolveSourceRoot(options);
    const apps = listAppManifests(sourceRoot);
    write('\n  AgentSam apps (manifest-registered identities)\n\n');
    for (const app of apps) {
      write(`  • ${app.id.padEnd(24)} ${app.name}\n`);
    }
    if (apps.length === 0) {
      write(`  No app manifests found under ${sourceRoot}.\n`);
      write('  Run this inside an agentsam-sdk checkout (apps/*/agentsam.app.json).\n');
    }
    write('\n  Manifest discovery only; this is not an installability or release check.\n\n');
    return apps;
  }

  if (command === 'validate') {
    const target = appId === '--all' || appId == null ? null : appId;
    const report = validateApps({ root: resolveSourceRoot(options), appId: target });
    if (report.warnings.length) {
      write('\n  Warnings\n');
      for (const w of report.warnings) write(`  • ${w}\n`);
    }
    if (report.errors.length) {
      write('\n  Errors\n');
      for (const e of report.errors) write(`  ✗ ${e}\n`);
      write('\n');
      if (!options.noExit) process.exitCode = 1;
      return report;
    }
    write(`\n  ✓ agentsam app validate${target ? ` ${target}` : ' --all'} (${report.apps.length} app(s))\n\n`);
    return report;
  }

  if (!appId) throw appFailure('app_id_required', 'agentsam app requires an app id');
  const app = resolveApp(appId, resolveSourceRoot(options));

  if (command === 'info' || command === 'inspect') {
    if (command === 'inspect') {
      const report = validateApps({ root: resolveSourceRoot(options), appId: app.id });
      write(`${JSON.stringify({ manifest: app.manifest, validation: report }, null, 2)}\n`);
      if (!report.ok && !options.noExit) process.exitCode = 1;
      return { manifest: app.manifest, validation: report };
    }
    write(`${JSON.stringify(app.manifest, null, 2)}\n`);
    return app.manifest;
  }
  if (command === 'install') return installAppPackage(app, rest, options);
  if (command === 'package') {
    const dryRun = rest.includes('--dry-run') || !rest.includes('--write');
    const packArgs = ['pack', ...(dryRun ? ['--dry-run', '--ignore-scripts'] : []), '--json'];
    const result = spawnSync('npm', packArgs, { cwd: app.dir, encoding: 'utf8', env: process.env });
    if (result.status !== 0) throw appFailure('app_pack_failed', String(result.stderr || result.stdout || `npm pack failed for ${app.id}`).trim());
    const metadata = JSON.parse(result.stdout)[0];
    write(`${JSON.stringify({ app_id: app.id, package: metadata.name, version: metadata.version, filename: metadata.filename, size: metadata.size, dry_run: dryRun }, null, 2)}\n`);
    return metadata;
  }
  if (command === 'doctor' || command === 'preview') {
    const installed = installedApp(app, npmGlobalRoot(options.env || process.env));
    runAppBin(installed || app, [command, ...rest], options);
    return;
  }
  if (command === 'scaffold') {
    runAppBin(app, ['scaffold', ...rest], options);
    return;
  }
  throw appFailure('app_command_unknown', `unknown agentsam app command: ${command}`);
}

export function appCommandHelp() {
  return 'agentsam app list|inventory|info|inspect|validate|install|doctor|preview|scaffold';
}

export { clean };
