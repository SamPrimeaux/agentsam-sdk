import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain' };
const contained = (root, file) => file === root || file.startsWith(root + path.sep);

export async function startMiniPreview({ root, port = 0, timeoutSeconds = 1200 }) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535.');
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 86400) {
    throw new Error('Timeout must be an integer from 1 to 86400 seconds.');
  }
  const project = await fs.realpath(root);
  const manifest = JSON.parse(await fs.readFile(path.join(project, 'mini.json'), 'utf8'));
  if (manifest.kind !== 'agentsam-mini' || manifest.version !== 1) throw new Error('This directory is not an AgentSam mini.');
  const publicRoot = await fs.realpath(path.join(project, 'public'));
  if (!contained(project, publicRoot) || publicRoot === project) throw new Error('public/ must be inside the mini project.');
  let origins;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!origins.has(`http://${req.headers.host}`) || (req.headers.origin && !origins.has(req.headers.origin))) {
      res.writeHead(403).end('Local preview only');
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some((part) => part.startsWith('.'))) {
      res.writeHead(404).end();
      return;
    }
    try {
      const requested = path.resolve(publicRoot, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
      const file = await fs.realpath(requested);
      const hidden = path.relative(publicRoot, file).split(path.sep).some((part) => part.startsWith('.'));
      if (!contained(publicRoot, file) || hidden || !TYPES[path.extname(file).toLowerCase()] || !(await fs.stat(file)).isFile()) {
        res.writeHead(404).end();
        return;
      }
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()], 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404).end(); }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  origins = new Set([url, `http://localhost:${address.port}`]);
  let finish;
  const closed = new Promise((resolve) => { finish = resolve; });
  let stopping = false;
  let timer;
  const stop = (reason = 'stopped') => {
    if (!stopping) {
      stopping = true;
      clearTimeout(timer);
      server.close(() => finish(reason));
      server.closeAllConnections();
    }
    return closed;
  };
  timer = setTimeout(() => { void stop('timeout'); }, timeoutSeconds * 1000);
  return { url, root: project, stop, closed };
}
