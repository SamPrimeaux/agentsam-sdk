#!/usr/bin/env node
/** Index local, user-owned creative media for localhost preview only. No upload or copy. */
import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(appRoot, '../..');
const output = join(appRoot, '.local-media-intake', 'assets.json');
const roots = [
  { label: 'Mac Downloads', path: join(homedir(), 'Downloads') },
  { label: 'Companion & brand source', path: join(repoRoot, 'assets', 'brand') },
  { label: 'Studio public brand', path: join(appRoot, 'frontend', 'public', 'brand') },
  { label: 'CMS brand media', path: join(repoRoot, 'apps', 'ecommerce-cms-agentsam', 'frontend', 'static', 'brand') },
  { label: 'Archived brand kit previews', path: join(appRoot, '.local-media-intake', 'archive-previews') },
  ...process.argv.slice(2).map((path, i) => ({ label: `Additional local collection ${i + 1}`, path: resolve(path) })),
].filter(({ path }) => existsSync(path));
const extensions = {
  '.png': ['image', 'image/png'], '.apng': ['image', 'image/apng'], '.jpg': ['image', 'image/jpeg'], '.jpeg': ['image', 'image/jpeg'],
  '.gif': ['image', 'image/gif'], '.svg': ['image', 'image/svg+xml'], '.webp': ['image', 'image/webp'], '.avif': ['image', 'image/avif'],
  '.ico': ['image', 'image/x-icon'], '.icns': ['image', 'image/icns'],
  '.mp4': ['video', 'video/mp4'], '.m4v': ['video', 'video/x-m4v'], '.mov': ['video', 'video/quicktime'],
  '.webm': ['video', 'video/webm'], '.mkv': ['video', 'video/x-matroska'],
  '.glb': ['model', 'model/gltf-binary'], '.gltf': ['model', 'model/gltf+json'], '.obj': ['model', 'model/obj'],
  '.fbx': ['model', 'application/octet-stream'], '.stl': ['model', 'model/stl'], '.3mf': ['model', 'model/3mf'],
  '.usd': ['model', 'model/vnd.usd'], '.usdz': ['model', 'model/vnd.usdz+zip'], '.usda': ['model', 'model/vnd.usd'],
  '.usdc': ['model', 'application/octet-stream'], '.blend': ['model', 'application/octet-stream'],
  '.dae': ['model', 'model/vnd.collada+xml'], '.ply': ['model', 'application/octet-stream'],
  '.step': ['model', 'application/step'], '.stp': ['model', 'application/step'],
  '.iges': ['model', 'application/iges'], '.igs': ['model', 'application/iges'],
  '.zip': ['file', 'application/zip'], '.pdf': ['file', 'application/pdf'],
  '.woff': ['file', 'font/woff'], '.woff2': ['file', 'font/woff2'], '.ttf': ['file', 'font/ttf'], '.otf': ['file', 'font/otf'],
};
const ignoreDirectories = new Set(['node_modules', '.git', '.cache', '.output', '.next', '.DS_Store', 'dist', 'build', 'coverage']);
// Collections describe assets rather than creating product/database records.
const collectionOf = (origin, filePath, kind) => {
  if (kind === 'model') return 'models';
  const text = `${origin}/${filePath}`.toLowerCase();
  if (/inneranimal-companions|agent[s-]*am_gorilla_character_kit|\bia-companion-|companion[-_/]|pet[\/\-_]|sprite[-_/]|-atlas|field-operations/.test(text)) return 'companions';
  if (/logo|favicon|brandmark|brand-mark|brand[-_/]identity|signature|app[-_/]icon|[/\-_]icon[-_/]|[/\-_]mark[-_/]|badge/.test(text)) return 'brand';
  if (/hero|creative|scene|background|rainforest|illustration|explore|gallery|mockup|template|theme/.test(text)) return 'scenes';
  return 'other';
};
const assets = [];
for (const root of roots) {
  const stack = [root.path];
  while (stack.length) {
    const folder = stack.pop();
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const full = join(folder, entry.name);
      if (entry.isDirectory()) {
        if (!ignoreDirectories.has(entry.name)) stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      let ext = extname(entry.name).toLowerCase();
      let media = extensions[ext];
      // Finder's extensionless PNGs are valid media; identify them by their signature.
      if (!media && !ext) {
        try { const fd = openSync(full, 'r'); try { const signature = Buffer.alloc(8); if (readSync(fd, signature, 0, 8, 0) === 8 && signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) { ext = '.png'; media = extensions['.png']; } } finally { closeSync(fd); } }
        catch { /* Not previewable; don't expose unknown files */ }
      }
      if (!media) continue;
      let stat;
      try { stat = lstatSync(full); } catch { continue; }
      if (!stat.isFile()) continue;
      const pathWithin = relative(root.path, full).replaceAll('\\', '/');
      const id = createHash('sha256').update(`${root.label}\0${pathWithin}\0${stat.size}`).digest('hex').slice(0, 24);
      const kind = media[0];
      const collection = collectionOf(root.label, pathWithin, kind);
      assets.push({ id: `intake:${id}`, filename: basename(full), content_type: media[1], mime_type: media[1],
        size_bytes: stat.size, source: 'intake', folder: kind === 'file' ? 'files' : `${kind}s`,
        created_at: stat.mtime.toISOString(), origin: root.label, relative_path: pathWithin,
        collection, media_kind: kind, url: `/api/dev/media-intake/asset/${id}`,
        thumbnail_url: kind === 'image' && ext !== '.icns' ? `/api/dev/media-intake/asset/${id}` : undefined,
        // Absolute paths are private and are never returned by the preview API.
        _absolute_path: full,
      });
    }
  }
}
assets.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.filename.localeCompare(b.filename));
const counts = Object.fromEntries(['image', 'video', 'model', 'file'].map(kind => [kind, assets.filter(a => a.media_kind === kind).length]));
const collections = Object.fromEntries(['companions', 'brand', 'scenes', 'models', 'other'].map(c => [c, assets.filter(a => a.collection === c).length]));
mkdirSync(join(appRoot, '.local-media-intake'), { recursive: true });
writeFileSync(output, JSON.stringify({ version: 1, generated_at: new Date().toISOString(), counts, collections, roots: roots.map(({label})=>label), assets }, null, 2));
console.log(`[media-intake] indexed ${assets.length} local files across ${roots.length} collections: ${JSON.stringify(counts)}, collections: ${JSON.stringify(collections)}`);
console.log(`[media-intake] local-only manifest: ${output} (never publish)`);
