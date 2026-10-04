#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = ['cypress','violet','grove','ember','forge','harbor','summit','resolve'];
const textExt = new Set(['.html','.css','.js','.json','.svg','.xml','.webmanifest']);
const staticExt = new Set(['.css','.js','.mjs','.png','.jpg','.jpeg','.webp','.gif','.avif','.svg','.ico','.woff','.woff2','.ttf','.otf','.json','.xml','.webmanifest','.pdf']);
const failures = [];

function walk(dir) {
  const out=[];
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const target=path.join(dir,entry.name);
    if (entry.isDirectory()) out.push(...walk(target)); else out.push(target);
  }
  return out;
}

for (const id of ids) {
  const pkgRoot=path.join(root,'packages','theme-'+id);
  const site=path.join(pkgRoot,'site');
  const pkg=JSON.parse(fs.readFileSync(path.join(pkgRoot,'package.json'),'utf8'));
  if (pkg.name !== '@inneranimalmedia/theme-'+id) failures.push(id+': wrong package name');
  if (!pkg.files?.includes('site')) failures.push(id+': npm files does not include site');
  if (pkg.agentsam?.installable !== true || pkg.agentsam?.portable !== true) failures.push(id+': package is not marked installable+portable');
  if (!fs.existsSync(path.join(site,'index.html'))) failures.push(id+': missing site/index.html');

  for (const file of walk(site)) {
    const ext=path.extname(file).toLowerCase();
    if (!textExt.has(ext)) continue;
    const text=fs.readFileSync(file,'utf8');
    if (text.includes('/themes/'+id+'/demo/')) failures.push(id+': hosted gallery path leaked into '+path.relative(site,file));
    if (text.includes('apps/theme-gallery-preview')) failures.push(id+': repo-local gallery path leaked into '+path.relative(site,file));
    if (/https?:\/\/(?:[^/]*unsplash|imagedelivery\.net|[^/]*r2\.dev|[^/]*shopify)/i.test(text)) failures.push(id+': external donor/stock media URL in '+path.relative(site,file));

    if (ext !== '.html') continue;
    const attrs=[...text.matchAll(/(?:src|href|poster|data-src)\s*=\s*["']([^"']+)["']/gi)].map((m)=>m[1]);
    for (const raw of attrs) {
      if (/^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(raw) || raw.startsWith('/api')) continue;
      const clean=raw.split(/[?#]/,1)[0];
      if (!clean) continue;
      const target=clean.startsWith('/') ? path.join(site,clean.slice(1)) : path.resolve(path.dirname(file),clean);
      const targetExt=path.extname(clean).toLowerCase();
      const looksStatic=staticExt.has(targetExt) || /^\/?(?:assets|shared|global|icons|images|media)\//.test(clean);
      if (looksStatic && !fs.existsSync(target)) failures.push(id+': missing local asset '+clean+' from '+path.relative(site,file));
    }
  }
}

if (failures.length) {
  console.error('Theme package verification FAILED ('+failures.length+')');
  for (const failure of failures.slice(0,200)) console.error('- '+failure);
  process.exit(1);
}
console.log('Theme package verification PASS · 8 self-contained installable prebuilds');
