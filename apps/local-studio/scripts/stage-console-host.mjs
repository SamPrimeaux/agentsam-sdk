#!/usr/bin/env node
/**
 * Stage the unmodified Ecommerce Console artifacts for the Local Studio host.
 * This assembles source assets; no CSS/markup/renderer transformation.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const localStudio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.resolve(localStudio, '../ecommerce-cms-agentsam');
const source = path.join(app, 'dist/assets');
const productStage = path.join(localStudio, 'frontend/public/ecommerce-cms-agentsam');
const hostAdmin = path.join(localStudio, 'frontend/public/admin');
const hostConfig = path.join(hostAdmin, 'host-config.js');
function removeLegacyReviseAssets(root, adminRoot = false) {
  const paths = adminRoot ? [
    'theme-previews/revise',
    'js/revise-atlas.js',
    'css/revise-atlas.css',
    'revise-atlas.html',
    'js/revise-atlas-view.js',
  ] : [
    'admin/theme-previews/revise',
    'theme-assets/revise',
    'admin/js/revise-atlas.js',
    'admin/css/revise-atlas.css',
    'admin/revise-atlas.html',
    'admin/js/revise-atlas-view.js',
    'js/revise-atlas.js',
    'css/revise-atlas.css',
  ];
  for (const relative of paths) rmSync(path.join(root, relative), { recursive: true, force: true });
}
removeLegacyReviseAssets(productStage);
removeLegacyReviseAssets(hostAdmin, true);
const themePreviewMirror = path.join(localStudio, 'frontend/public/themes');
const legacySiteThemeGallery = path.join(localStudio, 'frontend/public/site/themes');
// Remove only former website preview subdirectories. The /themes root also
// contains first-party Studio appearance assets and must never be deleted.
function removeThemeStorePreviewMirrors(root) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const themeRoot = path.join(root, entry.name);
    // Older SDK builds emitted complete storefront packages at /themes/<slug>/.
    // Remove those pages; preserve unrelated Studio appearance assets.
    if (existsSync(path.join(themeRoot, 'index.html'))) {
      rmSync(themeRoot, { recursive: true, force: true });
      continue;
    }
    const demo = path.join(themeRoot, 'demo');
    if (existsSync(path.join(demo, 'index.html'))) rmSync(demo, { recursive: true, force: true });
  }
}
removeThemeStorePreviewMirrors(themePreviewMirror);
rmSync(legacySiteThemeGallery, { recursive: true, force: true });
const {writeStudioNavigation} = await import('./studio-navigation.mjs');
writeStudioNavigation();

if (process.argv.includes('--stage') || process.argv.includes('--desktop')) {
  const destination = path.join(localStudio, process.argv.includes('--desktop') ? 'desktop-dist/admin' : '.output/public/admin');
  if (!existsSync(path.join(hostAdmin, 'js/shell.js')) || !existsSync(hostConfig)) {
    throw new Error('Console files must be assembled before staging');
  }
  mkdirSync(destination, { recursive: true });
  cpSync(hostAdmin, destination, { recursive: true, force: true });
  removeLegacyReviseAssets(destination, true);
  const compiledProduct = path.join(localStudio, process.argv.includes('--desktop') ? 'desktop-dist/ecommerce-cms-agentsam' : '.output/public/ecommerce-cms-agentsam');
  removeLegacyReviseAssets(compiledProduct);
  // Website theme previews are served by their owning Theme Store origin.
  // Keep stale SDK mirrors out of hosted and desktop release assets.
  const compiledRoot = path.join(localStudio, process.argv.includes('--desktop') ? 'desktop-dist' : '.output/public');
  removeThemeStorePreviewMirrors(path.join(compiledRoot, 'themes'));
  rmSync(path.join(compiledRoot, 'site/themes'), { recursive: true, force: true });
  console.log('[console-host] root /admin staged; Theme Store previews remain externally served');
  process.exit(0);
}
// The ecommerce dashboard is a separately installable frontend with its own
// lockfile. Root SDK npm ci does not provision this nested dependency tree.
// Only install when missing; never silently change or regenerate the lockfile.
const commerceFrontend = path.join(app, 'frontend');
const frontendModules = path.join(commerceFrontend, 'node_modules');
if (!existsSync(path.join(frontendModules, 'react-router-dom/package.json')) ||
    !existsSync(path.join(frontendModules, '@inneranimalmedia/commerce-analytics/package.json'))) {
  if (!existsSync(path.join(commerceFrontend, 'package-lock.json'))) {
    throw new Error('Ecommerce dashboard package-lock.json is required for portable console staging');
  }
  execFileSync('npm', ['ci', '--prefix', 'frontend', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: app, stdio: 'inherit',
  });
}

execFileSync('npm', ['run', 'sync:identity-portals'], { cwd: app, stdio: 'inherit' });
execFileSync('npm', ['run', 'build:frontend'], { cwd: app, stdio: 'inherit' });
execFileSync(process.execPath, [path.join(app, 'bin/build-assets.mjs')], { cwd: app, stdio: 'inherit' });
for (const name of ['admin/home.html', 'admin/store.html', 'admin/js/shell.js', 'admin/css/console.css', 'admin/theme-editor.html']) {
  if (!existsSync(path.join(source, name))) throw new Error('Missing packaged console asset: ' + name);
}
if (!existsSync(hostConfig)) throw new Error('Missing Local Studio host-only configuration');
mkdirSync(productStage, { recursive: true });
mkdirSync(hostAdmin, { recursive: true });
cpSync(source, productStage, { recursive: true, force: true });
removeLegacyReviseAssets(productStage);
removeLegacyReviseAssets(hostAdmin, true);
// Retire the former split-editor entry scripts from persistent staging roots.
for (const name of ['theme-editor-entry.js', 'theme-project-editor-bootstrap.mjs']) {
  rmSync(path.join(productStage, 'admin/js', name), { force: true });
  rmSync(path.join(hostAdmin, 'js', name), { force: true });
}
// Theme Studio's shell imports these shared runtime modules from the stable
// origin-root /theme-editor path on both hosted and packaged desktop surfaces.
const hostThemeEditor = path.join(localStudio, 'frontend/public/theme-editor');
mkdirSync(hostThemeEditor, { recursive: true });
cpSync(path.join(source, 'theme-editor'), hostThemeEditor, { recursive: true, force: true });
cpSync(path.join(source, 'admin'), hostAdmin, { recursive: true, force: true });
// Stage the canonical browser adapter, rather than another host navigation renderer.
const navPackage = path.resolve(localStudio, '../../packages/agentsam-nav');
execFileSync('npm', ['run', 'build'], {cwd: navPackage, stdio:'inherit'});
cpSync(path.join(navPackage, 'dist/browser.global.js'), path.join(hostAdmin, 'js/agentsam-nav.js'));
cpSync(path.join(navPackage, 'dist/theme.css'), path.join(hostAdmin, 'css/agentsam-nav.css'));
// Public browser assets cannot resolve the Node-only compatibility re-export.
// Serve the authoritative, dependency-free workbench module directly.
cpSync(path.resolve(localStudio, '../../packages/agentsam-workbench/src/shell/appearance.mjs'), path.join(hostAdmin, 'js/shell-appearance.mjs'));
cpSync(path.join(localStudio, 'frontend/agentsam/shared-nav-host.css'), path.join(hostAdmin, 'css/shared-nav-host.css'));

// The product assets stay intact; inject the installation adapter only into
// this host's staged copies. Desktop HTML does not pass through the Worker.
function bindHost(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) bindHost(file);
    else if (entry.name.endsWith('.html')) {
      const html = readFileSync(file, 'utf8');
      if (!html.includes('/admin/js/shell.js') || html.includes('/admin/host-config.js')) continue;
      writeFileSync(file, html.replace('<script src="/admin/js/shell.js"></script>',
        '<script src="/admin/js/shell.js"></script><script src="/admin/host-config.js"></script>'));
    }
  }
}
bindHost(productStage);
bindHost(hostAdmin);
const index = readFileSync(path.join(source, 'admin/_spa/index.html'), 'utf8')
  .replace(/(\b(?:href|src)=["'])\/(?!\/)/g, '$1/ecommerce-cms-agentsam/');
writeFileSync(path.join(productStage, 'index.html'), index);
// Retire the former SDK-owned Theme Store catalog snapshot. The authenticated
// /api/admin/website-themes route reads the live, validated Theme Store catalog.
rmSync(path.join(productStage, 'admin/data/theme-products.json'), { force: true });

console.log('[console-host] staged ORIGINAL Ecommerce Admin into Local Studio web and desktop asset roots');
