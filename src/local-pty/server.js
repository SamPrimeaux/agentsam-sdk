/**
 * Agent Sam local PTY + filesystem — localhost WebSocket shell + /v1/fs HTTP.
 * No tunnel, no IAM. Compatible with iam-pty wire format (raw bytes + JSON resize/slash).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createLocalFilesystem } from '../local-fs/index.js';
import { resolveContainedPath } from '../local-fs/paths.js';

const DEFAULT_PORT = 3099;

function parsePort(value, fallback) {
  const n = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function shellForPlatform() {
  if (process.platform === 'win32') return process.env.COMSPEC || 'powershell.exe';
  return process.env.SHELL || '/bin/zsh';
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

export function ensureNodePtySpawnHelperExecutable(options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  if (platform !== 'darwin') return Object.freeze({ checked: false, changed: false, path: null });

  const resolveModule = options.resolveModule || ((specifier) => import.meta.resolve(specifier));
  const fsImpl = options.fs || fs;
  const entryUrl = resolveModule('node-pty');
  const packageRoot = path.resolve(path.dirname(fileURLToPath(entryUrl)), '..');
  const helperPath = path.join(packageRoot, 'prebuilds', `darwin-${arch}`, 'spawn-helper');

  if (!fsImpl.existsSync(helperPath)) {
    return Object.freeze({ checked: true, changed: false, path: helperPath, missing: true });
  }

  const stat = fsImpl.statSync(helperPath);
  if ((stat.mode & 0o111) !== 0) {
    return Object.freeze({ checked: true, changed: false, path: helperPath });
  }

  try {
    fsImpl.chmodSync(helperPath, stat.mode | 0o111);
  } catch (error) {
    const wrapped = new Error(
      `node-pty spawn-helper is not executable and Agent Sam could not repair it at ${helperPath}. ` +
      `Reinstall node-pty with install scripts enabled or make that helper executable. ${error?.message || error}`,
    );
    wrapped.code = 'node_pty_spawn_helper_not_executable';
    wrapped.cause = error;
    throw wrapped;
  }

  return Object.freeze({ checked: true, changed: true, path: helperPath });
}

async function loadPty(override) {
  if (override?.spawn) return override;
  try {
    ensureNodePtySpawnHelperExecutable();
    const mod = await import('node-pty');
    return mod.default || mod;
  } catch (e) {
    throw new Error(
      `node-pty is required for start-local. Run: npm install node-pty\n${e?.message || e}`,
    );
  }
}

/**
 * Attach the portable PTY wire protocol to an already-created WebSocket-like transport.
 * Exported so the release gate can test terminal semantics against an in-memory mock transport.
 */
export function attachLocalPtySession({ ws, pty, shell, cwd, cols = 80, rows = 24, env = process.env, sessionId } = {}) {
  if (!ws?.on || !ws?.send) throw new TypeError('ws transport with on/send is required');
  if (!pty?.spawn) throw new TypeError('pty transport with spawn is required');
  const term = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: { ...env, TERM: 'xterm-256color', AGENTSAM_LOCAL_PTY: '1' },
  });
  const id = sessionId || `local_${Date.now().toString(36)}`;
  const openState = ws.OPEN ?? 1;
  const isOpen = () => ws.readyState == null || ws.readyState === openState;

  ws.send(JSON.stringify({ type: 'session_id', session_id: id }));

  term.onData((data) => {
    if (isOpen()) ws.send(data);
  });

  ws.on('message', (raw) => {
    const text = raw.toString();
    try {
      const msg = JSON.parse(text);
      if (msg.type === 'resize' && msg.cols && msg.rows) {
        term.resize(msg.cols, msg.rows);
        return;
      }
      if (msg.type === 'slash' && msg.line) {
        term.write(`${msg.line}\r`);
        return;
      }
    } catch {
      /* raw PTY input */
    }
    term.write(text);
  });

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try { term.kill(); } catch { /* ignore */ }
  };
  term.onExit(() => {
    if (isOpen() && ws.close) ws.close();
  });
  ws.on('close', cleanup);
  ws.on('error', cleanup);

  return Object.freeze({ session_id: id, term, cleanup });
}

/**
 * @param {{ cwd?: string, port?: number, host?: string, pty?: { spawn: Function } }} [opts]
 */
export async function startLocalPtyServer(opts = {}) {
  const pty = await loadPty(opts.pty);
  const cwd = opts.cwd || process.cwd();
  const requestedPort = opts.port === 0 ? 0 : parsePort(opts.port ?? process.env.PTY_PORT, DEFAULT_PORT);
  const host = opts.host || '127.0.0.1';
  const shell = shellForPlatform();
  const filesystem = createLocalFilesystem(cwd);

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${host}`);
    const pathname = url.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'agentsam-local-pty',
        cwd,
        port: Number(httpServer.address()?.port || requestedPort),
        shell,
        filesystem: true,
        filesystem_engine: filesystem.engine,
      });
      return;
    }

    if (pathname === '/v1/fs' || pathname === '/v1/fs/') {
      sendJson(res, 200, {
        ok: true,
        root: filesystem.root,
        engine: filesystem.engine,
        endpoints: ['list', 'stat', 'read', 'write', 'create', 'rename', 'remove', 'mkdir'],
      });
      return;
    }

    if (pathname.startsWith('/v1/fs/')) {
      try {
        const action = pathname.slice('/v1/fs/'.length).replace(/\/$/, '');
        const qPath = url.searchParams.get('path') || '.';
        if (req.method === 'GET' && action === 'list') {
          const recursive = url.searchParams.get('recursive') === '1' || url.searchParams.get('recursive') === 'true';
          return sendJson(res, 200, filesystem.list(qPath, { recursive, maxDepth: 5 }));
        }
        if (req.method === 'GET' && action === 'stat') {
          return sendJson(res, 200, filesystem.stat(qPath));
        }
        if (req.method === 'GET' && action === 'read') {
          return sendJson(res, 200, filesystem.read(qPath));
        }
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
          const body = await readJsonBody(req);
          if (action === 'write') {
            return sendJson(res, 200, filesystem.write(body.path || qPath, body.content ?? '', {
              expectedVersion: body.expectedVersion ?? body.expected_version,
              overwrite: Boolean(body.overwrite),
            }));
          }
          if (action === 'create') {
            return sendJson(res, 200, filesystem.create(body.path || qPath, body.content ?? ''));
          }
          if (action === 'rename') {
            return sendJson(res, 200, filesystem.rename(body.from || qPath, body.to, {
              expectedVersion: body.expectedVersion ?? body.expected_version,
            }));
          }
          if (action === 'remove' || action === 'delete') {
            return sendJson(res, 200, filesystem.remove(body.path || qPath, {
              expectedVersion: body.expectedVersion ?? body.expected_version,
              recursive: Boolean(body.recursive),
            }));
          }
          if (action === 'mkdir') {
            return sendJson(res, 200, filesystem.mkdir(body.path || qPath));
          }
        }
        sendJson(res, 404, { ok: false, error: 'unknown_fs_action', action });
      } catch (err) {
        sendJson(res, 400, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          code: 'fs_request_failed',
        });
      }
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', `http://${host}`);
    // Session cwd must stay inside the authorized filesystem root.
    let sessionCwd = cwd;
    const requestedCwd = url.searchParams.get('cwd')?.trim();
    if (requestedCwd) {
      const rel = path.isAbsolute(requestedCwd)
        ? path.relative(cwd, requestedCwd)
        : requestedCwd;
      const contained = resolveContainedPath(cwd, rel || '.');
      if (contained.ok) sessionCwd = contained.abs;
    }
    const cols = parsePort(url.searchParams.get('cols'), 80);
    const rows = parsePort(url.searchParams.get('rows'), 24);

    attachLocalPtySession({
      ws,
      pty,
      shell,
      cwd: sessionCwd,
      cols,
      rows,
      env: process.env,
    });
  });

  await new Promise((resolve) => {
    httpServer.listen(requestedPort, host, resolve);
  });
  const boundPort = Number(httpServer.address()?.port || requestedPort);

  return {
    port: boundPort,
    host,
    cwd,
    shell,
    filesystem,
    url: `ws://${host}:${boundPort}`,
    healthUrl: `http://${host}:${boundPort}/health`,
    fsBaseUrl: `http://${host}:${boundPort}/v1/fs`,
    close: () =>
      new Promise((resolve, reject) => {
        wss.close(() => {
          httpServer.close((err) => (err ? reject(err) : resolve()));
        });
      }),
  };
}
