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
import { getRepositoryFreshness } from '../local-fs/freshness.js';
import {
  mintWorkspaceCapability,
  writeLocalRuntimeRecord,
  extractCapability,
  isAllowedStudioOrigin,
  isLoopbackRemote,
  WORKSPACE_CAPABILITY_HEADER,
} from '../local-fs/capability.js';

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

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {object} body
 * @param {{ allowOrigin?: string|null }} [opts]
 */
function sendJson(req, res, status, body, opts = {}) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const allowOrigin = opts.allowOrigin !== undefined
    ? opts.allowOrigin
    : (isAllowedStudioOrigin(origin) ? (origin || null) : null);
  /** @type {Record<string, string>} */
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type, Authorization, ${WORKSPACE_CAPABILITY_HEADER}`,
  };
  if (allowOrigin) {
    headers['Access-Control-Allow-Origin'] = allowOrigin;
    headers.Vary = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
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
  const cwd = path.resolve(opts.cwd || process.cwd());
  const requestedPort = opts.port === 0 ? 0 : parsePort(opts.port ?? process.env.PTY_PORT, DEFAULT_PORT);
  const host = opts.host || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error('local PTY/FS must bind loopback only (127.0.0.1)');
  }
  const shell = opts.shell || shellForPlatform();
  const filesystem = createLocalFilesystem(cwd);
  // Capability minted after bind so port is known; provisional id first.
  /** @type {ReturnType<typeof mintWorkspaceCapability>|null} */
  let capability = null;

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${host}`);
    const pathname = url.pathname;
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';

    if (req.method === 'OPTIONS') {
      if (!isAllowedStudioOrigin(origin)) {
        res.writeHead(403);
        res.end();
        return;
      }
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin || 'http://127.0.0.1:8080',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': `Content-Type, Authorization, ${WORKSPACE_CAPABILITY_HEADER}`,
        Vary: 'Origin',
      });
      res.end();
      return;
    }

    if (pathname === '/health') {
      sendJson(req, res, 200, {
        ok: true,
        service: 'agentsam-local-pty',
        cwd,
        root: cwd,
        port: Number(httpServer.address()?.port || requestedPort),
        shell,
        filesystem: true,
        filesystem_engine: filesystem.engine,
        workspace_id: capability?.workspace_id || null,
        capability_required: true,
        binding: host,
      });
      return;
    }

    // Bootstrap: loopback-only claim of the authorized workspace capability.
    // Does NOT accept an arbitrary root — root is always the process-bound cwd.
    if (pathname === '/v1/workspace/bootstrap' && req.method === 'GET') {
      if (!isLoopbackRemote(req)) {
        return sendJson(req, res, 403, {
          ok: false,
          error: 'loopback_required',
          code: 'WORKSPACE_BOOTSTRAP_DENIED',
        });
      }
      if (origin && !isAllowedStudioOrigin(origin)) {
        return sendJson(req, res, 403, {
          ok: false,
          error: 'origin_not_allowed',
          code: 'WORKSPACE_BOOTSTRAP_DENIED',
        }, { allowOrigin: null });
      }
      const requestedRoot = url.searchParams.get('root');
      if (requestedRoot) {
        const resolved = path.resolve(requestedRoot);
        if (resolved !== cwd) {
          return sendJson(req, res, 403, {
            ok: false,
            error: 'root_not_authorized',
            code: 'WORKSPACE_ROOT_MISMATCH',
            message: 'Cannot claim an arbitrary path. Start the runtime from the desired workspace root.',
            authorized_root: cwd,
            requested_root: resolved,
          });
        }
      }
      return sendJson(req, res, 200, {
        ok: true,
        ...capability,
        freshness: getRepositoryFreshness(cwd),
      });
    }

    if (pathname === '/v1/freshness' && req.method === 'GET') {
      const gate = requireCapability(req, res, capability);
      if (!gate) return;
      return sendJson(req, res, 200, getRepositoryFreshness(cwd));
    }

    if (pathname === '/v1/fs' || pathname === '/v1/fs/') {
      const gate = requireCapability(req, res, capability);
      if (!gate) return;
      return sendJson(req, res, 200, {
        ok: true,
        root: filesystem.root,
        workspace_id: capability.workspace_id,
        engine: filesystem.engine,
        endpoints: ['list', 'stat', 'read', 'write', 'create', 'rename', 'remove', 'mkdir'],
      });
    }

    if (pathname.startsWith('/v1/fs/')) {
      const gate = requireCapability(req, res, capability);
      if (!gate) return;
      try {
        const action = pathname.slice('/v1/fs/'.length).replace(/\/$/, '');
        const qPath = url.searchParams.get('path') || '.';
        if (req.method === 'GET' && action === 'list') {
          const recursive = url.searchParams.get('recursive') === '1' || url.searchParams.get('recursive') === 'true';
          return sendJson(req, res, 200, filesystem.list(qPath, { recursive, maxDepth: 5 }));
        }
        if (req.method === 'GET' && action === 'stat') {
          return sendJson(req, res, 200, filesystem.stat(qPath));
        }
        if (req.method === 'GET' && action === 'read') {
          return sendJson(req, res, 200, filesystem.read(qPath));
        }
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
          const body = await readJsonBody(req);
          if (action === 'write') {
            return sendJson(req, res, 200, filesystem.write(body.path || qPath, body.content ?? '', {
              expectedVersion: body.expectedVersion ?? body.expected_version,
              overwrite: Boolean(body.overwrite),
            }));
          }
          if (action === 'create') {
            return sendJson(req, res, 200, filesystem.create(body.path || qPath, body.content ?? ''));
          }
          if (action === 'rename') {
            return sendJson(req, res, 200, filesystem.rename(body.from || qPath, body.to, {
              expectedVersion: body.expectedVersion ?? body.expected_version,
            }));
          }
          if (action === 'remove' || action === 'delete') {
            return sendJson(req, res, 200, filesystem.remove(body.path || qPath, {
              expectedVersion: body.expectedVersion ?? body.expected_version,
              recursive: Boolean(body.recursive),
            }));
          }
          if (action === 'mkdir') {
            return sendJson(req, res, 200, filesystem.mkdir(body.path || qPath));
          }
        }
        sendJson(req, res, 404, { ok: false, error: 'unknown_fs_action', action });
      } catch (err) {
        sendJson(req, res, 400, {
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
    const cap = extractCapability(req, capability?.capability);
    const qCap = url.searchParams.get('capability') || '';
    const okCap = (capability && qCap && qCap === capability.capability) || cap.ok;
    if (!okCap) {
      ws.send(JSON.stringify({
        type: 'error',
        code: 'WORKSPACE_CAPABILITY_REQUIRED',
        message: 'PTY attach requires workspace capability from /v1/workspace/bootstrap',
      }));
      ws.close();
      return;
    }

    // Session cwd must stay inside the authorized filesystem root — never escape.
    let sessionCwd = cwd;
    const requestedCwd = url.searchParams.get('cwd')?.trim();
    if (requestedCwd) {
      const abs = path.isAbsolute(requestedCwd) ? path.resolve(requestedCwd) : path.resolve(cwd, requestedCwd);
      if (abs !== cwd) {
        const rel = path.relative(cwd, abs);
        const contained = resolveContainedPath(cwd, rel || '.');
        if (!contained.ok) {
          ws.send(JSON.stringify({
            type: 'error',
            code: 'WORKSPACE_ROOT_MISMATCH',
            message: 'PTY cwd must equal the authorized workspace root (or a contained path).',
            authorized_root: cwd,
            requested: abs,
          }));
          ws.close();
          return;
        }
        sessionCwd = contained.abs;
      } else {
        sessionCwd = cwd;
      }
    }

    const cols = parsePort(url.searchParams.get('cols'), 80);
    const rows = parsePort(url.searchParams.get('rows'), 24);
    const sessionId = `pty_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    attachLocalPtySession({
      ws,
      pty,
      shell,
      cwd: sessionCwd,
      cols,
      rows,
      env: process.env,
      sessionId,
    });

    ws.send(JSON.stringify({
      type: 'workspace_identity',
      workspace_id: capability.workspace_id,
      root: cwd,
      session_cwd: sessionCwd,
      session_id: sessionId,
      runtimeBaseUrl: capability.runtimeBaseUrl,
    }));
  });

  await new Promise((resolve) => {
    httpServer.listen(requestedPort, host, resolve);
  });
  const boundPort = Number(httpServer.address()?.port || requestedPort);

  capability = mintWorkspaceCapability({ root: cwd, port: boundPort, host });
  const runtimeFile = writeLocalRuntimeRecord(capability);

  return {
    port: boundPort,
    host,
    cwd,
    shell,
    filesystem,
    capability,
    runtimeFile,
    workspace_id: capability.workspace_id,
    url: `ws://${host}:${boundPort}`,
    healthUrl: `http://${host}:${boundPort}/health`,
    fsBaseUrl: `http://${host}:${boundPort}/v1/fs`,
    bootstrapUrl: `http://${host}:${boundPort}/v1/workspace/bootstrap`,
    close: () =>
      new Promise((resolve, reject) => {
        wss.close(() => {
          httpServer.close((err) => (err ? reject(err) : resolve()));
        });
      }),
  };
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {ReturnType<typeof mintWorkspaceCapability>|null} capability
 */
function requireCapability(req, res, capability) {
  if (!capability) {
    sendJson(req, res, 503, { ok: false, error: 'capability_not_ready', code: 'WORKSPACE_CAPABILITY_REQUIRED' });
    return false;
  }
  const gate = extractCapability(req, capability.capability);
  if (!gate.ok) {
    sendJson(req, res, 401, {
      ok: false,
      error: 'workspace_capability_required',
      code: 'WORKSPACE_CAPABILITY_REQUIRED',
      authorization: {
        required: ['workspace.capability'],
        bootstrap: '/v1/workspace/bootstrap',
      },
    });
    return false;
  }
  return true;
}
