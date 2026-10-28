import fs from 'node:fs';
import path from 'node:path';
import { startLocalPtyServer } from '../local-pty/server.js';

function readConfig(cwd) {
  const configPath = path.join(cwd, '.agentsam', 'config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, '.agentsam', 'config.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

/**
 * Parse only the explicit local-root and port flags. The user starts each lane
 * themselves; a browser or agent cannot choose arbitrary host paths.
 * @param {string[]} args
 */
export function parseStartLocalArgs(args = []) {
  const opts = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (key !== '--cwd' && key !== '--port') throw new Error('start-local: unknown argument ' + key);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error('start-local: missing value for ' + key);
    if (key === '--cwd') {
      const root = path.resolve(value);
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('start-local: root must be an existing directory');
      opts.cwd = root;
    } else {
      if (!/^[0-9]+$/.test(value)) throw new Error('start-local: port must be an integer');
      const port = Number(value);
      if (port < 1024 || port > 65535) throw new Error('start-local: port must be between 1024 and 65535');
      opts.port = port;
    }
  }
  return opts;
}

/**
 * @param {{ cwd?: string, port?: number }} [opts]
 */
export async function runStartLocal(opts = {}) {
  // An explicitly selected worktree root must not be replaced by a parent repo.
  const root = opts.cwd ? path.resolve(opts.cwd) : findProjectRoot(process.cwd());
  const config = readConfig(root);
  const port = opts.port ?? config?.pty_port ?? 3099;

  console.log(`
  Agent Sam — local Studio plane (PTY + FS)
  Loopback only · no tunnel · not ExecOS enroll
  `);
  if (!config) {
    console.log(`  ⚠ No .agentsam/config.json found; using current repository/directory as the PTY root.`);
    console.log(`    Run \`agentsam init\` for a scaffolded project, or continue intentionally in ${root}.\n`);
  }

  const server = await startLocalPtyServer({ cwd: root, port });

  console.log(`  ✓ PTY listening  ${server.url}`);
  console.log(`  ✓ Health         ${server.healthUrl}`);
  console.log(`  ✓ Project root   ${server.cwd}`);
  console.log(`  ✓ Workspace      ${server.workspace_id}`);
  console.log(`  ✓ Capability     ${server.capability.capability.slice(0, 12)}… (loopback bootstrap)`);
  console.log(`  ✓ Runtime file   ${server.runtimeFile}`);
  console.log(`  ✓ Shell          ${server.shell}`);
  console.log(`
  Project services:
    npm run dev          → local Agent Sam API http://127.0.0.1:${config?.dev_port ?? 8787}
    npm run db:status    → inspect local SQLite
    npx agentsam          → enter Agent Sam

  Studio: open a filesystem workspace rooted at this same directory.
  Press Ctrl+C to stop.
  `);

  const shutdown = async () => {
    await server.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise(() => {});
}
