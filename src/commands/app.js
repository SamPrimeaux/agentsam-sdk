import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function readManifest(manifestPath, fallbackId) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
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

export async function runApp(argv = [], options = {}) {
  const write = options.write || ((text) => process.stdout.write(text));
  const [command = 'list', appId, ...rest] = argv;
  if (command === '--help' || command === '-h' || command === 'help') {
    write([
      'agentsam app list',
      'agentsam app info <id>',
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

  if (!appId) throw new Error('agentsam app requires an app id');
  const app = resolveApp(appId, options.root || REPO_ROOT);

  if (command === 'info') {
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
  return 'agentsam app list|info|install|doctor|preview|scaffold';
}

export { clean };
