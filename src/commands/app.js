import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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

function readManifest(manifestPath, fallbackId) {
  try {
    const manifest = readJson(manifestPath);
    return {
      id: manifest.id || fallbackId,
      name: manifest.name || fallbackId,
      dir: path.dirname(manifestPath),
      manifestPath,
      bin: manifest.bin || null,
      commands: manifest.commands || {},
      manifest,
    };
  } catch {
    return null;
  }
}

export function listAppManifests(root = REPO_ROOT) {
  const out = [];
  const seen = new Set();

  function addFromDir(parent, entryName) {
    const dir = path.join(parent, entryName);
    const manifestPath = path.join(dir, 'agentsam.app.json');
    if (!fs.existsSync(manifestPath)) return;
    const row = readManifest(manifestPath, entryName);
    if (!row || seen.has(row.id)) return;
    seen.add(row.id);
    out.push(row);
  }

  for (const parentName of ['apps', 'packages']) {
    const parent = path.join(root, parentName);
    if (!fs.existsSync(parent)) continue;
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      addFromDir(parent, entry.name);
    }
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function resolveApp(id, root = REPO_ROOT) {
  const apps = listAppManifests(root);
  const hit = apps.find((row) => row.id === id || path.basename(row.dir) === id);
  if (!hit) {
    const available = apps.map((a) => a.id).join(', ') || '(none)';
    throw new Error(`unknown AgentSam app: ${id}. Available: ${available}`);
  }
  return hit;
}

function runAppBin(app, args, options = {}) {
  if (!app.bin) throw new Error(`app ${app.id} has no bin entry`);
  const binPath = path.resolve(app.dir, app.bin);
  if (!fs.existsSync(binPath)) throw new Error(`app bin missing: ${binPath}`);
  const result = spawnSync(process.execPath, [binPath, ...args], {
    cwd: options.cwd || process.cwd(),
    stdio: 'inherit',
    env: process.env,
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

function validateOneApp(app, knownIds, root) {
  const errors = [];
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

function validateDesktopManifests(root, knownIds) {
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
    const productish = ['cad-creator', 'client-cms-editor', 'local-studio', 'cms-editor'].includes(appId)
      || ['cad-creator', 'client-cms-editor', 'cms-editor', 'local-studio'].some((n) => name.startsWith(n));
    if (productish && !knownIds.has(appId)) {
      errors.push(`desktop ${name}: app_id "${appId}" does not resolve to a known APP manifest`);
    }
  }
  return { errors, warnings };
}

export function validateApps(options = {}) {
  const root = options.root || REPO_ROOT;
  const filterId = options.appId || null;
  const apps = listAppManifests(root);
  const knownIds = new Set(apps.map((a) => a.id));
  const selected = filterId ? apps.filter((a) => a.id === filterId || path.basename(a.dir) === filterId) : apps;

  if (filterId && selected.length === 0) {
    throw new Error(`unknown AgentSam app: ${filterId}`);
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
    const desktop = validateDesktopManifests(root, knownIds);
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
      'agentsam app info <id>',
      'agentsam app inspect <id>',
      'agentsam app validate [--all|<id>]',
      'agentsam app install <id>',
      'agentsam app doctor <id>',
      'agentsam app preview <id>',
      'agentsam app scaffold <id> <dir>',
      '',
    ].join('\n'));
    return;
  }

  if (command === 'list') {
    const apps = listAppManifests(options.root || REPO_ROOT);
    write('\n  AgentSam apps\n\n');
    for (const app of apps) {
      write(`  • ${app.id.padEnd(24)} ${app.name}\n`);
    }
    write('\n');
    return apps;
  }

  if (command === 'validate') {
    const target = appId === '--all' || appId == null ? null : appId;
    const report = validateApps({ root: options.root || REPO_ROOT, appId: target });
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

  if (!appId) throw new Error('agentsam app requires an app id');
  const app = resolveApp(appId, options.root || REPO_ROOT);

  if (command === 'info' || command === 'inspect') {
    if (command === 'inspect') {
      const report = validateApps({ root: options.root || REPO_ROOT, appId: app.id });
      write(`${JSON.stringify({ manifest: app.manifest, validation: report }, null, 2)}\n`);
      if (!report.ok && !options.noExit) process.exitCode = 1;
      return { manifest: app.manifest, validation: report };
    }
    write(`${JSON.stringify(app.manifest, null, 2)}\n`);
    return app.manifest;
  }
  if (command === 'install') {
    const curl =
      app.manifest?.install?.curl ||
      `curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --app-id ${app.id}`;
    const npmCmd =
      app.manifest?.install?.command ||
      (app.manifest?.package ? `npm install ${app.manifest.package}` : null);
    write(`\n  Install ${app.id}\n\n`);
    if (npmCmd) write(`  ${npmCmd}\n`);
    write(`  ${curl}\n\n`);
    write('  app_id is stable product identity. Pass --app-id explicitly; no AGENTSAM_DEFAULT_APP.\n\n');
    return { id: app.id, curl, command: npmCmd };
  }
  if (command === 'doctor' || command === 'preview') {
    runAppBin(app, [command, ...rest], options);
    return;
  }
  if (command === 'scaffold') {
    runAppBin(app, ['scaffold', ...rest], options);
    return;
  }
  throw new Error(`unknown agentsam app command: ${command}`);
}

export function appCommandHelp() {
  return 'agentsam app list|info|inspect|validate|install|doctor|preview|scaffold';
}

export { clean };
