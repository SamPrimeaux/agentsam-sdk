/**
 * Localhost brand pack gallery preview.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { BrandAssetError } from './errors.js';
import { buildGalleryHtml } from './pack.js';

function openBrowser(url) {
  const plat = process.platform;
  if (plat === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  else if (plat === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

function findFile(root, name) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.name === name) return full;
    }
  }
  return null;
}

function ensureGallery(root) {
  const gallery = path.join(root, 'gallery.html');
  if (fs.existsSync(gallery)) return gallery;
  const manifestPath = path.join(root, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const items = [];
  const walk = (dir, base = '') => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.join(base, name).replace(/\\/g, '/');
      if (fs.statSync(full).isDirectory()) walk(full, rel);
      else if (/\.(png|jpe?g|webp|avif|gif|svg)$/i.test(name)) items.push({ rel, label: rel });
    }
  };
  walk(root);
  fs.writeFileSync(
    gallery,
    buildGalleryHtml({
      brand: m.brand || 'brand',
      asset: m.asset || 'asset',
      version: m.version || 'v1',
      items,
    }),
  );
  return gallery;
}

/**
 * Resolve a pack root from a directory or zip.
 */
export function resolvePackRoot(fromPath, { cwd = process.cwd() } = {}) {
  const abs = path.resolve(cwd, fromPath);
  if (!fs.existsSync(abs)) {
    throw new BrandAssetError('preview_missing', `Not found: ${fromPath}`);
  }
  if (fs.statSync(abs).isDirectory()) {
    ensureGallery(abs);
    return abs;
  }
  if (/\.zip$/i.test(abs)) {
    const tmp = path.join(cwd, '.agentsam', 'brand', 'preview', `zip-${Date.now()}`);
    fs.mkdirSync(tmp, { recursive: true });
    const r = spawnSync('unzip', ['-q', abs, '-d', tmp], { encoding: 'utf8' });
    if (r.status !== 0) {
      throw new BrandAssetError('unzip_failed', r.stderr || 'unzip failed — install unzip or pass a pack directory');
    }
    const found = findFile(tmp, 'gallery.html') || findFile(tmp, 'manifest.json');
    if (!found) throw new BrandAssetError('pack_invalid', 'Zip has no gallery.html / manifest.json');
    const root = path.dirname(found);
    ensureGallery(root);
    return root;
  }
  throw new BrandAssetError('preview_unsupported', 'Pass a pack directory or .zip');
}

/**
 * Serve pack root on 127.0.0.1 and optionally open the browser.
 */
export async function previewBrandPack({
  from,
  cwd = process.cwd(),
  open = true,
  waitForEnter = true,
  write = (s) => process.stdout.write(s),
} = {}) {
  const root = resolvePackRoot(from, { cwd });
  if (!fs.existsSync(path.join(root, 'gallery.html'))) {
    throw new BrandAssetError('gallery_missing', 'Pack has no gallery.html — run brand pack/build first');
  }

  const indexFile = fs.existsSync(path.join(root, 'studio.html')) ? 'studio.html' : 'gallery.html';

  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = path.join(root, urlPath === '/' ? indexFile : urlPath);
      filePath = path.normalize(filePath);
      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.avif': 'image/avif',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
  });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
  });
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/${indexFile}`;
  write(`Brand pack preview\n  ${url}\n`);
  if (open) {
    try { openBrowser(url); } catch { /* ignore */ }
  }

  if (waitForEnter && process.stdin.isTTY) {
    write('Press Enter to stop preview…\n');
    await new Promise((resolve) => {
      process.stdin.resume();
      process.stdin.once('data', () => resolve());
    });
  }

  await new Promise((resolve) => server.close(() => resolve()));
  return { ok: true, capability: 'brand.preview', url, root, port };
}
