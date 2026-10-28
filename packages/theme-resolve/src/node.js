import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {RESOLVE_PORTAL_TEMPLATES} from './portal-templates.mjs';

const SOURCE = fileURLToPath(new URL('../site/', import.meta.url));
const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.json', '.svg', '.xml', '.webmanifest']);
const STATIC_ROOTS = ['assets', 'icons', 'images', 'media', 'shared', 'global'];

function normalizeBasePath(value = '/') {
  let base = String(value || '/').trim() || '/';
  if (!base.startsWith('/')) base = '/' + base;
  if (!base.endsWith('/')) base += '/';
  return base.replace(/\/{2,}/g, '/');
}

function normalizeCanonicalOrigin(value = 'https://example.com/') {
  const origin = String(value || 'https://example.com/').trim();
  return origin.endsWith('/') ? origin : origin + '/';
}

function rewriteCanonicalOrigin(root, canonicalOrigin) {
  if (canonicalOrigin === 'https://example.com/') return;
  const queue = [root];
  while (queue.length) {
    const dir = queue.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) { queue.push(target); continue; }
      if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      const text = fs.readFileSync(target, 'utf8').replaceAll('https://example.com/', canonicalOrigin);
      fs.writeFileSync(target, text);
    }
  }
}

function rewriteStaticBase(root, basePath) {
  if (basePath === '/') return;
  const queue = [root];
  while (queue.length) {
    const dir = queue.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) { queue.push(target); continue; }
      if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      let text = fs.readFileSync(target, 'utf8');
      for (const segment of STATIC_ROOTS) {
        text = text.replaceAll('/' + segment + '/', basePath + segment + '/');
      }
      fs.writeFileSync(target, text);
    }
  }
}

export function resolvePrebuildRoot() {
  return SOURCE;
}

export function materializePrebuild(target, options = {}) {
  if (!target) throw new TypeError('target is required');
  const destination = path.resolve(target);
  const basePath = normalizeBasePath(options.basePath || '/');
  const canonicalOrigin = normalizeCanonicalOrigin(options.canonicalOrigin || 'https://example.com/');
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(SOURCE, destination, { recursive: true });
  // One portable portal base owns all customer page routes and assets,
  // regardless of which prefixed host path installs the Resolve theme.
  const portalIndex = path.join(destination, 'portal', 'index.html');
  if (fs.existsSync(portalIndex)) {
    const html = fs.readFileSync(portalIndex, 'utf8');
    const resolvedHtml=html.replaceAll('__RESOLVE_PORTAL_BASE__', basePath + 'portal/');
    fs.writeFileSync(portalIndex, resolvedHtml);
    // Materialize each public route as a physical static page, preserving
    // deep-link refreshes on hosts with no catch-all SPA rewrite configured.
    for (const template of RESOLVE_PORTAL_TEMPLATES) {
      const routeDir=path.join(destination,'portal',template.path);
      fs.mkdirSync(routeDir,{recursive:true});
      fs.writeFileSync(path.join(routeDir,'index.html'),resolvedHtml);
    }
  }
  rewriteStaticBase(destination, basePath);
  rewriteCanonicalOrigin(destination, canonicalOrigin);
  return { destination, basePath, canonicalOrigin, theme: "resolve" };
}
