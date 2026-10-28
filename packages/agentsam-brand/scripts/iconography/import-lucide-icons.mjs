#!/usr/bin/env node
/**
 * Refresh the v1 semantic icon source set from the Lucide components already
 * used by Local Studio. Generated SVGs become stable, reviewable brand masters;
 * the production build never imports Lucide at runtime.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as lucide from 'lucide-react';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '../..');
const repoRoot = path.resolve(packageRoot, '../..');
const sourceDir = path.join(packageRoot, 'assets/iconography/v1/sources/system');
const catalogPath = path.join(packageRoot, 'assets/iconography/v1/sources/system-icons.json');
const require = createRequire(import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const ICONS = [
  ['add','Plus','actions','Add'], ['remove','Minus','actions','Remove'], ['close','X','actions','Close'], ['confirm','Check','actions','Confirm'],
  ['target','Crosshair','navigation','Target'], ['back','ArrowLeft','navigation','Back'], ['time','Clock3','status','Time'], ['next','ChevronRight','navigation','Next'],
  ['search','Search','navigation','Search'], ['user','UserRound','people','User'], ['favorite','Star','actions','Favorite'], ['like','Heart','actions','Like'],
  ['navigate','Navigation','navigation','Navigate'], ['filter','Filter','actions','Filter'], ['email','Mail','communication','Email'], ['settings','Settings','system','Settings'],
  ['share','Share2','actions','Share'], ['adjust','SlidersHorizontal','controls','Adjust'], ['download','Download','files','Download'], ['map','Map','navigation','Map'],
  ['compass','Compass','navigation','Compass'], ['globe','Globe2','navigation','Globe'], ['message','MessageCircle','communication','Message'], ['refresh','RotateCw','actions','Refresh'],
  ['location','MapPin','navigation','Location'], ['home','House','navigation','Home'], ['code','Code','development','Code'], ['forward','ArrowRight','navigation','Forward'],
  ['menu','Menu','navigation','Menu'], ['cloud','Cloud','storage','Cloud'], ['delete','Trash2','actions','Delete'], ['attachment','Paperclip','files','Attachment'],
  ['aperture','Aperture','media','Aperture'], ['mouse','Mouse','input','Mouse'], ['media','Image','media','Media'], ['guide','BookOpen','content','Guide'],
  ['select','Square','selection','Select'], ['duplicate','Copy','actions','Duplicate'], ['list','List','content','List'], ['panels','PanelsTopLeft','layout','Panels'],
  ['bookmark','Bookmark','content','Bookmark'], ['film','Film','media','Film'], ['info','Info','status','Information'], ['nature','TreePine','environment','Nature'],
  ['document','FileText','files','Document'], ['display','Monitor','devices','Display'], ['radar','Radar','data','Radar'], ['price','CircleDollarSign','commerce','Price'],
  ['flag','Flag','status','Flag'], ['shield','Shield','security','Shield'], ['wifi','Wifi','connectivity','Wi-Fi'], ['night','MoonStar','appearance','Night'],
  ['analytics','ChartNoAxesColumn','analytics','Analytics'], ['workflow','Workflow','automation','Workflow'], ['cut','Scissors','actions','Cut'], ['light','Sun','appearance','Light'],
  ['mobile','Smartphone','devices','Mobile'], ['lock','Lock','security','Lock'], ['unlock','Unlock','security','Unlock'], ['lamp','Lamp','devices','Lamp'],
  ['camera','Camera','media','Camera'], ['layers','Layers','design','Layers'], ['audio','Headphones','media','Audio'], ['agent','Bot','agents','Agent'],
];

async function findPackageRoot(entryPath, name) {
  let dir = path.dirname(entryPath);
  while (dir !== path.dirname(dir)) {
    try {
      const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name === name) return { dir, pkg };
    } catch {}
    dir = path.dirname(dir);
  }
  throw new Error(`Could not locate package metadata for ${name}`);
}

await mkdir(sourceDir, { recursive: true });
const lucideEntry = require.resolve('lucide-react');
const { dir: lucideRoot, pkg: lucidePackage } = await findPackageRoot(lucideEntry, 'lucide-react');
const noticeSource = path.join(lucideRoot, 'LICENSE');
if (await (async () => { try { await readFile(noticeSource); return true; } catch { return false; } })()) {
  await copyFile(noticeSource, path.join(sourceDir, 'LICENSE-lucide-react.txt'));
}

const icons = [];
for (const [id, componentName, category, label] of ICONS) {
  const Component = lucide[componentName];
  if (typeof Component !== 'function' && typeof Component !== 'object') {
    throw new Error(`Lucide component missing: ${componentName} (${id})`);
  }
  const rendered = renderToStaticMarkup(React.createElement(Component, {
    width: 24, height: 24, strokeWidth: 2, absoluteStrokeWidth: false,
  }));
  const opening = rendered.match(/^<svg\b[^>]*>/i)?.[0];
  if (!opening) throw new Error(`Lucide did not render an SVG for ${componentName}`);
  const inner = rendered.slice(opening.length).replace(/<\/svg>\s*$/i, '');
  const semantic = `${category}.${id}`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" id="icon-${id}" data-icon-id="${id}" data-semantic="${semantic}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>\n`;
  const filename = `${id}.svg`;
  await writeFile(path.join(sourceDir, filename), svg);
  icons.push({
    id, label, semantic, category, component: componentName,
    source: `sources/system/${filename}`,
    source_sha256: sha256(svg),
    source_library: 'lucide-react', source_library_version: lucidePackage.version,
    source_license: lucidePackage.license || 'ISC',
    view_box: '0 0 24 24', width: 24, height: 24, stroke_width: 2,
    stroke_linecap: 'round', stroke_linejoin: 'round',
    visible_label_baked_in: false,
    path_element_count: (inner.match(/<(?:path|line|polyline|polygon|circle|rect|ellipse)\b/g) || []).length,
  });
}

const catalog = {
  schema: 'agentsam.brand-system-icons.v1',
  family: 'inneranimalmedia-agentsam-system-icons',
  revision: 'r01',
  source_policy: 'Lucide component source → normalized SVG masters; no raster tracing',
  source_library: { name: 'lucide-react', version: lucidePackage.version, license: lucidePackage.license || 'ISC' },
  icon_count: icons.length,
  normalization: { view_box: '0 0 24 24', width: 24, height: 24, stroke_width: 2, stroke_linecap: 'round', stroke_linejoin: 'round', fill: 'none' },
  icons,
};
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, catalog: path.relative(repoRoot, catalogPath), count: icons.length, source_library: catalog.source_library, duplicate_hashes: new Set(icons.map((i) => i.source_sha256)).size !== icons.length }, null, 2));
