/**
 * Local runtime workspace capability — short-lived FS/PTY authority for one root.
 *
 * Compatible with later:
 *   account → terminal connection → enrolled instance → approved workspace root
 *
 * Local today:
 *   start-local binds one root + mints one capability.
 *   Browser cannot invent an absolute root to gain authority.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const WORKSPACE_CAPABILITY_HEADER = 'x-agentsam-workspace-capability';
export const LOCAL_RUNTIME_FILE = 'local-runtime.json';

/**
 * @param {{ root: string, port: number, host?: string }} opts
 */
export function mintWorkspaceCapability(opts) {
  const root = path.resolve(opts.root);
  const workspace_id = `ws_${crypto.randomBytes(10).toString('hex')}`;
  const capability = `awc_${crypto.randomBytes(24).toString('hex')}`;
  const expires_at = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  return Object.freeze({
    schema: 'agentsam.local-workspace-capability.v1',
    workspace_id,
    capability,
    root,
    host: opts.host || '127.0.0.1',
    port: opts.port,
    runtimeBaseUrl: `http://${opts.host || '127.0.0.1'}:${opts.port}`,
    fsBaseUrl: `http://${opts.host || '127.0.0.1'}:${opts.port}/v1/fs`,
    expires_at,
    purpose: 'local.filesystem+pty',
  });
}

/**
 * Persist capability beside the authorized root (machine-local; not file content authority).
 * @param {object} record
 */
export function writeLocalRuntimeRecord(record) {
  const dir = path.join(record.root, '.agentsam');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, LOCAL_RUNTIME_FILE);
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  return file;
}

/**
 * @param {string} root
 */
export function readLocalRuntimeRecord(root) {
  const file = path.join(path.resolve(root), '.agentsam', LOCAL_RUNTIME_FILE);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {string} expected
 */
export function extractCapability(req, expected) {
  const header = req.headers[WORKSPACE_CAPABILITY_HEADER]
    || req.headers.authorization
    || '';
  let token = '';
  if (typeof header === 'string') {
    if (header.toLowerCase().startsWith('bearer ')) token = header.slice(7).trim();
    else token = header.trim();
  }
  if (!token && req.url) {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      token = u.searchParams.get('capability') || '';
    } catch {
      /* ignore */
    }
  }
  return {
    ok: Boolean(expected && token && token === expected),
    token,
  };
}

/**
 * Loopback + Studio origin allowlist. Never `*`.
 * @param {string|undefined} origin
 * @param {string[]} [extra]
 */
export function isAllowedStudioOrigin(origin, extra = []) {
  if (!origin || origin === 'null') return true; // non-browser / same-origin tooling
  const allow = [
    'http://127.0.0.1:8080',
    'http://localhost:8080',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    ...extra,
  ];
  return allow.includes(origin);
}

/**
 * @param {import('http').IncomingMessage} req
 */
export function isLoopbackRemote(req) {
  const raw = req.socket?.remoteAddress || '';
  return raw === '127.0.0.1'
    || raw === '::1'
    || raw === '::ffff:127.0.0.1'
    || raw.endsWith('127.0.0.1');
}
