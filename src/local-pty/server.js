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

async function loadPty() {
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
 * @param {{ cwd?: string, port?: number, host?: string }} [opts]
 */
export async function startLocalPtyServer(opts = {}) {
  const pty = await loadPty();
  const cwd = opts.cwd || process.cwd();
  const port = parsePort(opts.port ?? process.env.PTY_PORT, DEFAULT_PORT);
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
          port,
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

    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: sessionCwd,
      env: { ...process.env, TERM: 'xterm-256color', AGENTSAM_LOCAL_PTY: '1' },
    });

    const sessionId = `local_${Date.now().toString(36)}`;
    ws.send(JSON.stringify({ type: 'session_id', session_id: sessionId }));

    term.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
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

    const cleanup = () => {
      try {
        term.kill();
      } catch {
        /* ignore */
      }
    };
    term.onExit(() => {
      if (ws.readyState === ws.OPEN) ws.close();
    });
    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  await new Promise((resolve) => {
    httpServer.listen(port, host, resolve);
  });

  return {
    port,
    host,
    cwd,
    shell,
    url: `ws://${host}:${port}`,
    healthUrl: `http://${host}:${port}/health`,
    close: () =>
      new Promise((resolve, reject) => {
        wss.close(() => {
          httpServer.close((err) => (err ? reject(err) : resolve()));
        });
      }),
  };
}
