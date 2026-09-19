import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function listAppManifests(root = REPO_ROOT) {
  const appsRoot = path.join(root, 'apps');
  if (!fs.existsSync(appsRoot)) return [];
  return fs.readdirSync(appsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(appsRoot, entry.name);
      const manifestPath = path.join(dir, 'agentsam.app.json');
      if (!fs.existsSync(manifestPath)) return null;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        return {
          id: manifest.id || entry.name,
          name: manifest.name || entry.name,
          dir,
          manifestPath,
          bin: manifest.bin || null,
          commands: manifest.commands || {},
          manifest,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function resolveApp(id, root = REPO_ROOT) {
  const apps = listAppManifests(root);
  const hit = apps.find((row) => row.id === id || path.basename(row.dir) === id);
  if (!hit) throw new Error(`unknown AgentSam app: ${id}`);
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
      write(`  • ${app.id.padEnd(20)} ${app.name}\n`);
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
  return 'agentsam app list|info|doctor|preview|scaffold';
}

export { clean };
