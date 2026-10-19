import http from 'node:http';
import { pipeline } from 'node:stream';
import { EXT_TYPES, evidenceError } from './contract.js';
import { assertSafeKey } from './naming.js';

const BIND_HOST = '127.0.0.1';
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/i;
const LOOPBACK_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/i;

function requestHandler(store, prefix) {
  return async (req, res) => {
    const deny = (status) => { res.writeHead(status, { 'Cache-Control': 'no-store' }); res.end(); };
    // Host and Origin must both be loopback: a page on another site cannot read a run, and DNS rebinding is refused.
    if (!LOOPBACK_HOST.test(req.headers.host ?? '')) return deny(403);
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (!LOOPBACK_ORIGIN.test(origin)) return deny(403);
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Range');
      res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.method !== 'GET' && req.method !== 'HEAD') return deny(405);

    let relative;
    try { relative = decodeURIComponent(new URL(req.url, 'http://placeholder.invalid').pathname.slice(1)); } catch { return deny(400); }
    if (relative === '') relative = 'evidence.manifest.json';
    let key;
    try { key = assertSafeKey(`${prefix}/${relative}`); } catch { return deny(404); }
    const file = await store.open(key).catch(() => null);
    if (!file) return deny(404);

    const headers = {
      'Content-Type': EXT_TYPES[key.split('.').pop().toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    };
    let start = 0;
    let end = file.size - 1;
    let status = 200;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      if (range[1] === '') start = Math.max(file.size - Number(range[2]), 0);
      else { start = Number(range[1]); if (range[2] !== '') end = Math.min(Number(range[2]), file.size - 1); }
      if (start > end || start >= file.size) { res.writeHead(416, { 'Content-Range': `bytes */${file.size}` }); return res.end(); }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${file.size}`;
    }
    headers['Content-Length'] = file.size === 0 ? 0 : end - start + 1;
    res.writeHead(status, headers);
    if (req.method === 'HEAD' || file.size === 0) return res.end();
    pipeline(file.stream({ start, end }), res, () => {});
  };
}

/**
 * Serve one sealed run read-only. Binds port 0 unless a port is requested, and builds the URL from the
 * bound address at runtime. The server closes itself after ttlMs.
 */
export async function startEvidenceServer({ store, prefix, port = 0, ttlMs = 900000 }) {
  if (typeof store?.open !== 'function') throw evidenceError('evidence_store_cannot_serve');
  const server = http.createServer(requestHandler(store, prefix));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, BIND_HOST, () => { server.off('error', reject); resolve(); });
  });
  const bound = server.address().port;
  const origin = `http://${BIND_HOST}:${bound}`;
  const close = () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
  const timer = setTimeout(close, ttlMs);
  timer.unref?.();
  server.once('close', () => clearTimeout(timer));
  return { origin, url: `${origin}/`, port: bound, expiresAt: new Date(Date.now() + ttlMs).toISOString(), close, onClose: (fn) => server.once('close', fn) };
}
