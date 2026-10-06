import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const studioRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(studioRoot, '../..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const within = (root, p) => p === root || p.startsWith(root + '/');
const walk = (root) => readdirSync(root, { withFileTypes: true }).flatMap((e) =>
  e.isSymbolicLink() ? [] : e.isDirectory() ? walk(join(root, e.name)) : [join(root, e.name)]);

/** Build-time filesystem discovery; no catalog maintained by the settings UI. */
export function discoverThemeSurfaces(root = repoRoot) {
  const candidates = new Set();
  for (const base of [join(root, 'packages'), join(root, 'node_modules/@inneranimalmedia')]) {
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const p = join(base, name);
      if (existsSync(join(p, 'package.json'))) candidates.add(p);
    }
  }
  const themes = new Map();
  const assets = new Map();
  for (const p of candidates) {
    const pkg = readJson(join(p, 'package.json'));
    const meta = pkg.agentsam || {};
    if (meta.kind !== 'theme' && !/\/(?:theme-[\w-]+|heuristic-theme|revise-theme)$/.test(pkg.name || '')) continue;
    const id = (pkg.name || '').split('/').pop().replace(/^theme-/, '');
    if (themes.has(pkg.name)) continue;
    const roots = [
      meta.prebuildRoot && resolve(p, meta.prebuildRoot),
      meta.galleryPath && resolve(root, meta.galleryPath),
      join(p, 'site'),
      join(p, 'assets'),
      join(p, 'public'),
    ].filter(Boolean);
    const source = roots.find((dir) => existsSync(dir) && statSync(dir).isDirectory() && (within(root, dir) || within(p, dir)));
    const pages = [];
    if (source) {
      for (const file of walk(source)) {
        const rel = relative(source, file).replaceAll('\\', '/');
        if (/(?:^|\/)(node_modules|\.git)\//.test(rel)) continue;
        const url = `themes/${id}/${rel}`;
        assets.set(url, file);
        if (extname(file) === '.html' && !rel.startsWith('help/')) {
          pages.push({ slug: rel.replace(/^site\//, '').replace(/\.html$/, '').replace(/(?:^|\/)index$/, '') || 'home', title: rel.split('/').pop().replace(/\.html$/, ''), url: '/' + url });
        }
      }
    }
    pages.sort((a, b) => (a.slug === 'home' ? -1 : b.slug === 'home' ? 1 : a.slug.localeCompare(b.slug)));
    const home = pages.find((page) => page.slug === 'home') || pages.find((page) => /(?:^|\/)index\.html$/.test(page.url)) || pages[0];
    themes.set(pkg.name, {
      id, name: meta.displayName || id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      packageName: pkg.name, version: pkg.version, category: meta.category || meta.family || 'Theme',
      source: p.includes('/node_modules/') ? 'installed' : 'bundled',
      status: meta.installable === false ? 'Source available' : 'Available',
      swatches: meta.swatches || [], pages,
      previewUrl: home?.url, capabilities: { preview: Boolean(home), editable: Boolean(home), duplicable: Boolean(home), publishable: false },
    });
  }
  return { themes: [...themes.values()].sort((a, b) => a.name.localeCompare(b.name)), assets };
}

/** Identical inventory, editor runtime and preview payload for hosted and Tauri. */
export function themeSurfacesPlugin() {
  let inventory;
  const load = () => {
    inventory = discoverThemeSurfaces();
    const editor = resolve(repoRoot, 'apps/ecommerce-cms-agentsam/frontend/static');
    for (const [name, source] of [['runtime.js', 'js/theme-editor.js'], ['shared.js', 'js/pages-shared.js'], ['editor.css', 'css/theme-editor.css']]) {
      inventory.assets.set('theme-editor/' + name, join(editor, source));
    }
    // The original merchant-facing Online Store is packaged alongside Theme Studio.
    // Reuse its own DOM, script and responsive CSS in both hosted and desktop Studio.
    for (const [name, source] of [
      ['runtime.js', 'js/store.js'],
      ['admin.css', 'css/admin.css'],
      ['console.css', 'css/console.css'],
      ['online-store.css', '../store/online-store.css'],
    ]) inventory.assets.set('commerce-store/' + name, join(editor, source));
    return inventory;
  };
  return {
    name: 'agentsam-theme-surfaces',
    resolveId(id) { if (id === 'virtual:agentsam-theme-inventory') return '\0' + id; },
    load(id) { if (id === '\0virtual:agentsam-theme-inventory') return `export default ${JSON.stringify((inventory || load()).themes)};`; },
    buildStart() { load(); },
    generateBundle() {
      for (const [fileName, file] of (inventory || load()).assets) this.emitFile({ type: 'asset', fileName, source: readFileSync(file) });
    },
    configureServer(server) {
      load();
      server.middlewares.use((req, res, next) => {
        const key = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\//, '');
        const file = inventory.assets.get(key);
        if (!file) return next();
        const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
        res.setHeader('content-type', mime[extname(file)] || 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
  };
}
