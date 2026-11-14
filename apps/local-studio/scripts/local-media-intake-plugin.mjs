/** Opt-in localhost-only media intake. Never registered in a built/deployed app. */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const manifestPath = fileURLToPath(new URL('../.local-media-intake/assets.json', import.meta.url));
const productIndexPath = fileURLToPath(new URL('../.local-media-intake/products.json', import.meta.url));
const PUBLIC_KEYS = ['id', 'filename', 'content_type', 'mime_type', 'size_bytes', 'source', 'folder', 'created_at', 'origin', 'relative_path', 'collection', 'media_kind', 'url', 'thumbnail_url'];

function respond(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(value));
}

function isLocalRequest(req) {
  const address = req.socket.remoteAddress || '';
  const host = String(req.headers.host || '').split(':')[0].replace(/^\[|\]$/g, '');
  const origin = req.headers.origin;
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
    && ['localhost', '127.0.0.1', '::1'].includes(host)
    && (!origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin))
    && req.headers['sec-fetch-site'] !== 'cross-site';
}

function load() {
  if (!existsSync(manifestPath)) return null;
  const data = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return data.version === 1 && Array.isArray(data.assets) ? data : null;
}

export function localMediaIntakePlugin() {
  return {
    name: 'agentsam:localhost-media-intake',
    apply: 'serve',
    configureServer(server) {
      if (process.env.AGENTSAM_MEDIA_INTAKE !== '1') return;
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost:8080');
        if (url.pathname === '/api/dev/product-intake') {
          if (!isLocalRequest(req)) return respond(res, 403, { ok: false, error: 'localhost_only' });
          if (req.method !== 'GET') return respond(res, 405, { ok: false, error: 'read_only' });
          try {
            const data = JSON.parse(readFileSync(productIndexPath, 'utf8'));
            return respond(res, 200, { ok: true, local_only: true, ...data });
          } catch { return respond(res, 404, { ok: false, error: 'run_product_intake_indexer' }); }
        }
        if (!url.pathname.startsWith('/api/dev/media-intake')) return next();
        if (!isLocalRequest(req)) return respond(res, 403, { ok: false, error: 'localhost_only' });
        if (req.method !== 'GET' && req.method !== 'HEAD') return respond(res, 405, { ok: false, error: 'read_only' });
        let index;
        try { index = load(); } catch { return respond(res, 500, { ok: false, error: 'invalid_local_manifest' }); }
        if (!index) return respond(res, 404, { ok: false, error: 'run_media_intake_indexer' });
        const assetMatch = /^\/api\/dev\/media-intake\/asset\/([0-9a-f]{24})$/.exec(url.pathname);
        if (assetMatch) {
          const record = index.assets.find(row => row.id === `intake:${assetMatch[1]}`);
          if (!record) return respond(res, 404, { ok: false, error: 'unknown_asset' });
          const source = resolve(record._absolute_path || '');
          // The only file opened comes from the locally generated, private manifest.
          if (!source || !existsSync(source)) return respond(res, 404, { ok: false, error: 'missing_local_file' });
          const st = statSync(source);
          if (!st.isFile()) return respond(res, 404, { ok: false, error: 'invalid_asset' });
          res.setHeader('Content-Type', record.mime_type || 'application/octet-stream');
          res.setHeader('Cache-Control', 'private, no-store');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
          res.setHeader('Accept-Ranges', 'bytes');
          let start = 0, end = st.size - 1;
          const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
          if (range && (range[1] || range[2])) {
            if (range[1]) start = Number(range[1]);
            if (range[2]) end = Number(range[2]);
            else if (!range[1]) start = Math.max(0, st.size - Number(range[2]));
            if (start > end || start >= st.size) {
              res.statusCode = 416;
              res.setHeader('Content-Range', `bytes */${st.size}`);
              return res.end();
            }
            end = Math.min(end, st.size - 1);
            res.statusCode = 206;
            res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`);
          }
          res.setHeader('Content-Length', Math.max(0, end - start + 1));
          if (req.method === 'HEAD') return res.end();
          const stream = createReadStream(source, { start, end });
          stream.on('error', () => res.destroy());
          stream.pipe(res);
          return;
        }
        if (url.pathname !== '/api/dev/media-intake') return respond(res, 404, { ok: false, error: 'unknown_media_intake_route' });
        const kind = url.searchParams.get('kind') || 'all';
        const collection = url.searchParams.get('collection') || 'all';
        const q = (url.searchParams.get('q') || '').toLowerCase().trim();
        const pageSize = Math.max(1, Math.min(100, Number(url.searchParams.get('page_size')) || 48));
        const page = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1));
        const filtered = index.assets.filter(row => (kind === 'all' || row.media_kind === kind) && (collection === 'all' || row.collection === collection) &&
          (!q || `${row.filename} ${row.relative_path} ${row.origin}`.toLowerCase().includes(q)));
        return respond(res, 200, {
          ok: true, source: 'intake', local_only: true, uploaded: false,
          counts: index.counts, collections: index.collections, generated_at: index.generated_at,
          total: filtered.length,
          assets: filtered.slice((page - 1) * pageSize, page * pageSize).map(row =>
            Object.fromEntries(PUBLIC_KEYS.filter(key => key in row).map(key => [key, row[key]]))),
          pagination: { page, page_size: pageSize, has_next: page * pageSize < filtered.length },
        });
      });
    },
  };
}
