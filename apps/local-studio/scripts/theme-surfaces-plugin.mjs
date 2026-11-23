import { existsSync, readFileSync } from 'node:fs';
import { resolve, join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const studioRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(studioRoot, '../..');

/**
 * Emit only the CMS editor integration assets that Local Studio hosts.
 * Storefront theme packages and preview pages are owned and published by
 * inneranimalmedia-theme-store; they are never discovered or bundled here.
 */
export function themeSurfacesPlugin() {
  let assets = new Map();
  const load = () => {
    assets = new Map();
    const editor = resolve(repoRoot, 'apps/ecommerce-cms-agentsam/frontend/static');
    for (const [name, source] of [['runtime.js', 'js/theme-editor.js'], ['shared.js', 'js/pages-shared.js'], ['editor.css', 'css/theme-editor.css']]) {
      assets.set('theme-editor/' + name, join(editor, source));
    }
    const themeEditorSource = resolve(repoRoot, 'apps/ecommerce-cms-agentsam/frontend/theme-editor');
    for (const name of ['project.mjs', 'bridge.mjs', 'mount.mjs', 'starter-project.mjs', 'starter-products.mjs', 'starter-chrome.mjs', 'theme-start.mjs', 'system-template-registry.mjs', 'stock-templates.mjs']) {
      assets.set('theme-editor/' + name, join(themeEditorSource, name));
    }
    // Reuse the merchant-facing Online Store shell and its live Theme Store browser.
    for (const [name, source] of [
      ['runtime.js', 'js/store.js'],
      ['admin.css', 'css/admin.css'],
      ['console.css', 'css/console.css'],
      ['online-store.css', '../store/online-store.css'],
      ['marketplace.css', 'css/theme-product-browser.css'],
      ['website-themes.js', 'js/website-theme-browser.js'],
    ]) assets.set('commerce-store/' + name, join(editor, source));
    return assets;
  };
  return {
    name: 'agentsam-cms-editor-assets',
    // Empty compatibility module for older Settings imports. It is not a
    // registry of storefront theme packages.
    resolveId(id) { if (id === 'virtual:agentsam-theme-inventory') return '\0' + id; },
    load(id) { if (id === '\0virtual:agentsam-theme-inventory') return 'export default [];'; },
    buildStart() { load(); },
    generateBundle() {
      for (const [fileName, file] of (assets || load())) {
        if (!existsSync(file)) throw new Error('CMS editor asset missing: ' + file);
        this.emitFile({ type: 'asset', fileName, source: readFileSync(file) });
      }
    },
    configureServer(server) {
      load();
      server.middlewares.use((req, res, next) => {
        const key = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\//, '');
        const file = assets.get(key);
        if (!file) return next();
        if (!existsSync(file)) return next();
        const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
        res.setHeader('content-type', mime[extname(file)] || 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
  };
}
