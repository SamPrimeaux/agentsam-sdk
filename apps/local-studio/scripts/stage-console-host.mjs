#!/usr/bin/env node
/**
 * Stage the unmodified Ecommerce Console artifacts for the Local Studio host.
 * This assembles source assets; no CSS/markup/renderer transformation.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {listLocalThemeProducts} from '../../../packages/catalog/src/theme-products.mjs';
import {materializePrebuild as materializeViolet} from '../../../packages/theme-violet/src/node.js';
import {materializePrebuild as materializeJournal} from '../../../packages/theme-plain-jane/src/node.js';

const localStudio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.resolve(localStudio, '../ecommerce-cms-agentsam');
const source = path.join(app, 'dist/assets');
const productStage = path.join(localStudio, 'frontend/public/ecommerce-cms-agentsam');
const hostAdmin = path.join(localStudio, 'frontend/public/admin');
const hostConfig = path.join(hostAdmin, 'host-config.js');

if (process.argv.includes('--stage') || process.argv.includes('--desktop')) {
  const destination = path.join(localStudio, process.argv.includes('--desktop') ? 'desktop-dist/admin' : '.output/public/admin');
  if (!existsSync(path.join(hostAdmin, 'js/shell.js')) || !existsSync(hostConfig)) {
    throw new Error('Console files must be assembled before staging');
  }
  mkdirSync(destination, { recursive: true });
  cpSync(hostAdmin, destination, { recursive: true, force: true });
  // Copy the packaged, generated demo pages *after* Vite has emitted its
  // /themes/<sku> entrypoints. Keep both the editor's original theme routes
  // and the complete demo/ subroutes consumed by the source-backed gallery.
  const compiledRoot = path.join(localStudio, process.argv.includes('--desktop') ? 'desktop-dist' : '.output/public');
  const previewSource = path.join(localStudio, 'frontend/public/themes');
  for (const slug of ['resolve', 'violet', 'plain-jane']) {
    if (!existsSync(path.join(previewSource, slug, 'demo/index.html'))) {
      throw new Error('Missing generated theme demo for '+slug);
    }
  }
  cpSync(previewSource, path.join(compiledRoot, 'themes'), {recursive:true, force:true});
  console.log('[console-host] root /admin + source-backed theme demos staged to ' + compiledRoot);
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
execFileSync('npm', ['run', 'build:frontend'], { cwd: app, stdio: 'inherit' });
// The installable Ecommerce application also has its own lockfile. Its CMS
// theme/section packages are not root-SDK dependencies and must be installed
// for an isolated Studio build before assembling the original product assets.
const appModules = path.join(app, 'node_modules');
if (!existsSync(path.join(appModules, '@inneranimalmedia/section-library/package.json')) ||
    !existsSync(path.join(appModules, '@inneranimalmedia/revise-theme/package.json'))) {
  if (!existsSync(path.join(app, 'package-lock.json'))) {
    throw new Error('Ecommerce application package-lock.json is required for portable asset staging');
  }
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: app, stdio: 'inherit',
  });
}
execFileSync(process.execPath, [path.join(app, 'bin/build-assets.mjs')], { cwd: app, stdio: 'inherit' });
for (const name of ['admin/home.html', 'admin/store.html', 'admin/js/shell.js', 'admin/css/console.css', 'admin/theme-editor.html']) {
  if (!existsSync(path.join(source, name))) throw new Error('Missing packaged console asset: ' + name);
}
if (!existsSync(hostConfig)) throw new Error('Missing Local Studio host-only configuration');
mkdirSync(productStage, { recursive: true });
mkdirSync(hostAdmin, { recursive: true });
cpSync(source, productStage, { recursive: true, force: true });
cpSync(path.join(source, 'admin'), hostAdmin, { recursive: true, force: true });
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


// Stage source-derived, read-only theme demonstrations for the hosted Sites
// catalog. This is not a theme installation, purchase, or CMS import.
const previewRoot = path.join(localStudio, 'frontend/public/themes');
const demoRoot = path.join(previewRoot, 'violet/demo');
materializeViolet(demoRoot, {basePath:'/themes/violet/demo/'});
const journalDemo = path.join(previewRoot, 'plain-jane/demo');
// Only the generated, bounded preview staging directory is replaceable.
// The package's customer-facing materializer still refuses to overwrite.
rmSync(journalDemo,{recursive:true,force:true});
materializeJournal(journalDemo,{basePath:'/themes/plain-jane/demo/'});
const resolveSrc = path.resolve(localStudio,'../theme-gallery-preview/themes/resolve/site');
const resolveDest = path.join(previewRoot,'resolve/demo');
if (!existsSync(path.join(resolveSrc,'index.html'))) throw new Error('Resolve canonical compiled preview unavailable');
rmSync(resolveDest,{recursive:true,force:true});
cpSync(resolveSrc,resolveDest,{recursive:true});
const previewCatalog=await listLocalThemeProducts();
if(previewCatalog.length!==3 || previewCatalog.some(entry=>!entry.preview_ready))
 throw new Error('Theme preview catalog incomplete; refuse to stage stale product listing');
const products=previewCatalog.map(item=>({
  ...item,
  // No unreviewed packaged downloads are advertised by the hosted gallery.
  download_url:null,download_kind:null,installed:false,purchasable:false,
  install_status:'not_connected',state:'preview_only',
  editor_url:'/admin/theme-editor?showcase='+encodeURIComponent(item.slug)+'&slug='+
    (item.slug==='plain-jane'?'journal-home':'home'),
  preview_url:'/themes/'+item.slug+'/demo/'
}));
const catalogPath=path.join(productStage,'admin/data/theme-products.json');
mkdirSync(path.dirname(catalogPath),{recursive:true});
writeFileSync(catalogPath,JSON.stringify({ok:true,status:'preview_only',products},null,2)+'\n');

console.log('[console-host] staged ORIGINAL Ecommerce Admin into Local Studio web and desktop asset roots');
