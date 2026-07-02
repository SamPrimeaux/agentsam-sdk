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
 * @param {{ cwd?: string, port?: number }} [opts]
 */
export async function runStartLocal(opts = {}) {
  const root = findProjectRoot(opts.cwd || process.cwd());
  const config = readConfig(root);
  const port = opts.port ?? config?.pty_port ?? 3099;

  console.log(`
  Agent Sam — local PTY
  No Cloudflare · no tunnel · no IAM login
  `);

  const server = await startLocalPtyServer({ cwd: root, port });

  console.log(`  ✓ PTY listening  ${server.url}`);
  console.log(`  ✓ Health         ${server.healthUrl}`);
  console.log(`  ✓ Project root   ${server.cwd}`);
  console.log(`  ✓ Shell          ${server.shell}`);
  console.log(`
  Next:
    npm run dev          → http://127.0.0.1:${config?.dev_port ?? 8787}
    npm run db:migrate   → local D1 schema (first run)

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
