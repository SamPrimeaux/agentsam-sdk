/**
 * Agent Sam local PTY — localhost WebSocket shell, no tunnel, no IAM.
 * Compatible with iam-pty wire format (raw bytes + JSON resize/slash).
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';

const DEFAULT_PORT = 3099;

function parsePort(value, fallback) {
  const n = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function shellForPlatform() {
  if (process.platform === 'win32') return process.env.COMSPEC || 'powershell.exe';
  return process.env.SHELL || '/bin/zsh';
}

async function loadPty(override) {
  if (override?.spawn) return override;
  try {
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

  const httpServer = http.createServer((req, res) => {
    const path = (req.url || '/').split('?')[0];
    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          service: 'agentsam-local-pty',
          cwd,
          port: Number(httpServer.address()?.port || requestedPort),
          shell,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', `http://${host}`);
    const sessionCwd = url.searchParams.get('cwd')?.trim() || cwd;
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
    url: `ws://${host}:${boundPort}`,
    healthUrl: `http://${host}:${boundPort}/health`,
    close: () =>
      new Promise((resolve, reject) => {
        wss.close(() => {
          httpServer.close((err) => (err ? reject(err) : resolve()));
        });
      }),
  };
}
