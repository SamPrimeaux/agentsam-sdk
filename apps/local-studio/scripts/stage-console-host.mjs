#!/usr/bin/env node
/**
 * Stage the unmodified Ecommerce Console artifacts for the Local Studio host.
 * This assembles source assets; no CSS/markup/renderer transformation.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  console.log('[console-host] root /admin assets staged to ' + destination);
  process.exit(0);
}
execFileSync('npm', ['run', 'build:frontend'], { cwd: app, stdio: 'inherit' });
execFileSync(process.execPath, [path.join(app, 'bin/build-assets.mjs')], { cwd: app, stdio: 'inherit' });
for (const name of ['admin/home.html', 'admin/store.html', 'admin/js/shell.js', 'admin/css/console.css', 'admin/theme-editor.html']) {
  if (!existsSync(path.join(source, name))) throw new Error('Missing packaged console asset: ' + name);
}
if (!existsSync(hostConfig)) throw new Error('Missing Local Studio host-only configuration');
mkdirSync(productStage, { recursive: true });
mkdirSync(hostAdmin, { recursive: true });
cpSync(source, productStage, { recursive: true, force: true });
cpSync(path.join(source, 'admin'), hostAdmin, { recursive: true, force: true });
const index = readFileSync(path.join(source, 'admin/_spa/index.html'), 'utf8')
  .replace(/(\b(?:href|src)=["'])\/(?!\/)/g, '$1/ecommerce-cms-agentsam/');
writeFileSync(path.join(productStage, 'index.html'), index);

console.log('[console-host] staged ORIGINAL Ecommerce Admin into Local Studio web and desktop asset roots');
