import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashFile = async (file) => sha256(await fs.readFile(file));
const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hexRgb(hex) {
  const raw = String(hex).replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) throw new Error(`Invalid color token: ${hex}`);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, alpha: 1 };
}

function colorwayBackgroundSvg(size, colorway) {
  const radius = Math.round(size * 0.22);
  const top = colorway.base_top || colorway.tile_top || '#343941';
  const bottom = colorway.base_bottom || colorway.tile_bottom || '#15171c';
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
 <defs>
  <linearGradient id="surface" x1="0" y1="0" x2="0.16" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="0.2" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.52"/><stop offset="0.48" stop-color="#ffffff" stop-opacity="0.08"/><stop offset="1" stop-color="#000000" stop-opacity="0.18"/></linearGradient>
  <filter id="shadow" x="-15%" y="-15%" width="130%" height="140%"><feGaussianBlur stdDeviation="${size * 0.012}"/></filter>
 </defs>
 <rect x="${size * 0.035}" y="${size * 0.045}" width="${size * 0.93}" height="${size * 0.93}" rx="${radius}" fill="#000000" opacity="0.2" filter="url(#shadow)"/>
 <rect x="${size * 0.025}" y="${size * 0.025}" width="${size * 0.95}" height="${size * 0.95}" rx="${radius}" fill="url(#surface)" stroke="url(#rim)" stroke-width="${Math.max(1, size * 0.006)}"/>
 <path d="M ${size * 0.13} ${size * 0.07} Q ${size * 0.5} ${size * 0.025} ${size * 0.87} ${size * 0.07}" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="${Math.max(1, size * 0.008)}" stroke-linecap="round"/>
</svg>`);
}

async function buildMarkMask(sharp, sourcePath, outputPath, resolution, maskSpec = {}) {
  const low = Number(maskSpec.threshold_low ?? 0.58);
  const high = Number(maskSpec.threshold_high ?? 0.84);
  const inset = Number(maskSpec.safe_inset ?? 0.08);
  if (!(low >= 0 && high <= 1 && high > low && inset >= 0 && inset < 0.25)) {
    throw new Error(`Invalid mask contract for ${path.basename(sourcePath)}`);
  }
  const { data } = await sharp(sourcePath, { failOn: 'warning' })
    .rotate().resize(resolution, resolution, { fit: 'fill' }).greyscale().raw()
    .toBuffer({ resolveWithObject: true });
  const mask = Buffer.alloc(resolution * resolution);
  let coveredPixels = 0;
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const u = x / (resolution - 1);
      const v = y / (resolution - 1);
      if (u < inset || u > 1 - inset || v < inset || v > 1 - inset) continue;
      const value = Math.round(255 * smoothstep(low, high, data[y * resolution + x] / 255));
      mask[y * resolution + x] = value;
      if (value >= 128) coveredPixels += 1;
    }
  }
  // Keep meaningful disconnected pieces, but reject tiny reflections/highlights
  // that are not part of the source mark (notably the Local Studio app icon).
  const seen = new Uint8Array(mask.length);
  const stack = [];
  const components = [];
  const neighbors = [-1, 0, 1];
  for (let start = 0; start < mask.length; start += 1) {
    if (seen[start] || mask[start] < 32) continue;
    const pixels = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop();
      pixels.push(index);
      const x = index % resolution;
      const y = Math.floor(index / resolution);
      for (const dy of neighbors) for (const dx of neighbors) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || nx >= resolution || ny < 0 || ny >= resolution) continue;
        const next = ny * resolution + nx;
        if (seen[next] || mask[next] < 32) continue;
        seen[next] = 1; stack.push(next);
      }
    }
    components.push(pixels);
  }
  const largestComponent = components.reduce((largest, component) => Math.max(largest, component.length), 0);
  const minimumComponentPixels = Math.max(32, Math.floor(largestComponent * 0.002));
  const removedComponents = components.filter((component) => component.length < minimumComponentPixels).length;
  for (const component of components) {
    if (component.length >= minimumComponentPixels) continue;
    for (const index of component) mask[index] = 0;
  }
  coveredPixels = 0;
  for (const value of mask) if (value >= 128) coveredPixels += 1;
  const coverage = coveredPixels / (resolution * resolution);
  if (coverage < 0.02 || coverage > 0.72) throw new Error(`Derived icon mask coverage is implausible for ${path.basename(sourcePath)}: ${coverage.toFixed(4)}`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(mask, { raw: { width: resolution, height: resolution, channels: 1 } }).png().toFile(outputPath);
  return { path: outputPath, width: resolution, height: resolution, threshold_low: low, threshold_high: high, safe_inset: inset, coverage, connected_components: components.length, removed_components: removedComponents, minimum_component_pixels: minimumComponentPixels, sha256: await hashFile(outputPath) };
}

async function composeColorway(sharp, maskPath, size, colorway) {
  const { data } = await sharp(maskPath).resize(size, size, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const color = hexRgb(colorway.mark);
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0, j = 0; i < data.length; i += 1, j += 4) {
    rgba[j] = color.r;
    rgba[j + 1] = color.g;
    rgba[j + 2] = color.b;
    rgba[j + 3] = data[i];
  }
  const glyph = await sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
  return sharp(colorwayBackgroundSvg(size, colorway)).composite([{ input: glyph, left: 0, top: 0 }]).png().toBuffer();
}

async function removeAppleDoubleFiles(root) {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) await removeAppleDoubleFiles(full);
    else if (entry.name.startsWith('._') || entry.name === '.DS_Store') await fs.rm(full, { force: true });
  }
}

function normalizedSvgFallback(source, options = {}) {
  const text = String(source).trim();
  const openingMatch = text.match(/<svg\b[^>]*>/i);
  if (!openingMatch || !/<\/svg>\s*$/i.test(text)) throw new Error('SVG source is not a complete document');
  if (/<\s*(?:script|foreignObject|iframe|object|embed|text)\b/i.test(text) || /\bon[a-z]+\s*=/i.test(text)) throw new Error('SVG has active content or live text');
  const viewBox = openingMatch[0].match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!viewBox) throw new Error('SVG source requires a viewBox');
  const inner = text.slice(openingMatch.index + openingMatch[0].length).replace(/<\/svg>\s*$/i, '').trim();
  if (!/<(?:path|line|polyline|polygon|circle|rect|ellipse)\b/i.test(inner)) throw new Error('SVG source has no supported geometry');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" id="icon-${options.iconId}" data-semantic="${options.semanticId}" width="24" height="24" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>\n`;
  return { svg, pathCount: (inner.match(/<(?:path|line|polyline|polygon|circle|rect|ellipse)\b/gi) || []).length, viewBox, strokeWidth: 2, hasLiveText: false };
}

async function renderClaySystemTile(sharp, svgPath, outputPath, theme, size = 256) {
  const glyphSize = Math.round(size * 0.47);
  const themedSvg = (await fs.readFile(svgPath, 'utf8')).replace(/stroke="currentColor"/g, `stroke="${theme.stroke}"`);
  const glyph = await sharp(Buffer.from(themedSvg), { density: 256 }).resize(glyphSize, glyphSize, { fit: 'contain' }).png().toBuffer();
  const shadow = await sharp(glyph).tint(theme.shadow).blur(Math.max(2, size * 0.018)).png().toBuffer();
  const highlight = await sharp(glyph).tint(theme.highlight).blur(Math.max(0.5, size * 0.004)).png().toBuffer();
  const tileSvg = colorwayBackgroundSvg(size, { tile_top: theme.tile_top, tile_bottom: theme.tile_bottom });
  const x = Math.round((size - glyphSize) / 2);
  const y = Math.round((size - glyphSize) / 2);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(tileSvg).composite([
    { input: shadow, left: x + 4, top: y + 6 },
    { input: highlight, left: x - 2, top: y - 2 },
    { input: glyph, left: x, top: y },
  ]).png().toFile(outputPath);
}

async function walkFiles(root, relative = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await walkFiles(root, child));
    else result.push(child.split(path.sep).join('/'));
  }
  return result;
}

async function glbInfo(filePath) {
  const bytes = await fs.readFile(filePath);
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error(`Invalid GLB header or length: ${filePath}`);
  }
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a || jsonLength < 2 || 20 + jsonLength > bytes.length) throw new Error(`Invalid GLB JSON chunk: ${filePath}`);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength).trim());
  return {
    byte_length: bytes.length,
    node_names: (gltf.nodes || []).map((node) => node.name).filter(Boolean),
    mesh_count: (gltf.meshes || []).length,
    material_names: (gltf.materials || []).map((material) => material.name).filter(Boolean),
    has_pbr_materials: (gltf.materials || []).every((material) => Boolean(material.pbrMetallicRoughness)),
    sha256: sha256(bytes),
  };
}

function htmlEscape(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildStudioHtml({ manifest, iconCatalog, outputModels, systemIcons }) {
  const apps = manifest.app_icons.map((app) => {
    const modelCards = manifest.colorways.map((colorway) => {
      const model = outputModels.find((row) => row.app_icon_id === app.id && row.colorway_id === colorway.id);
      const hero = model?.renders?.hero || `app-icons/${app.id}/colorways/${colorway.id}/${app.id}-512.png`;
      const glb = model?.glb;
      const video = model?.turntable;
      return `<article class="model-card"><img src="${htmlEscape(hero)}" alt=""/>${video ? `<video controls loop muted playsinline preload="metadata" src="${htmlEscape(video)}"></video>` : ''}<div class="model-meta"><strong>${htmlEscape(colorway.label)}</strong><span>${htmlEscape(glb || 'GLB unavailable')}</span></div><div class="actions">${glb ? `<a href="${htmlEscape(glb)}" download>GLB model</a>` : ''}${video ? `<a href="${htmlEscape(video)}" target="_blank" rel="noreferrer">Open turntable</a>` : ''}</div></article>`;
    }).join('');
    return `<section class="app-section"><div class="section-heading"><div><p class="eyebrow">APP IDENTITY</p><h2>${htmlEscape(app.name)}</h2><p class="muted">Source: ${htmlEscape(app.source_repository_path)}</p></div><img class="source-icon" src="${htmlEscape(app.source)}" alt=""/></div><div class="model-grid">${modelCards}</div></section>`;
  }).join('');
  const icons = iconCatalog.icons.map((icon) => `<figure class="system-icon"><img loading="lazy" src="system-icons/clay/ink/${htmlEscape(icon.id)}.png" alt=""/><figcaption>${htmlEscape(icon.label)}</figcaption><small>${htmlEscape(icon.semantic)}</small><div class="icon-links"><a href="system-icons/svg/master/${htmlEscape(icon.id)}.svg">SVG</a><a href="system-icons/svg/blue/${htmlEscape(icon.id)}.svg">Blue</a><a href="system-icons/png/ink/${htmlEscape(icon.id)}-64.png">64px</a></div></figure>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>InnerAnimalMedia / AgentSam — Iconography ${htmlEscape(manifest.revision.toUpperCase())}</title>
<style>
:root{color-scheme:light;--ink:#122b43;--muted:#60758a;--line:#d9e4ed;--paper:#f6f9fc;--blue:#1388d2}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 16% 0%,#fff 0,#f7fafc 45%,#edf3f8 100%);color:var(--ink);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}header{padding:30px clamp(20px,4vw,56px) 26px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:24px;align-items:end}h1{margin:0;font-size:clamp(22px,3vw,36px);font-weight:620;letter-spacing:-.045em}h2{font-size:24px;margin:0;font-weight:620;letter-spacing:-.035em}.eyebrow{text-transform:uppercase;letter-spacing:.17em;font-size:10px;color:#5984a8;margin:0 0 8px;font-weight:700}.muted{color:var(--muted);margin:4px 0 0;font-size:12px}.badge{border:1px solid #c6d9e9;border-radius:999px;padding:7px 11px;color:#356d97;font-size:11px;white-space:nowrap}main{padding:28px clamp(20px,4vw,56px) 64px;max-width:1600px;margin:auto}.intro{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(260px,.6fr);gap:26px;padding:0 0 28px}.intro p{max-width:820px;color:#4c657c;margin:8px 0}.note{padding:16px 18px;border:1px solid var(--line);border-radius:18px;background:#ffffffa8;color:#516a80;font-size:12px}.app-section{padding:28px 0;border-top:1px solid var(--line)}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:18px}.source-icon{width:84px;height:84px;object-fit:contain;border-radius:20px;box-shadow:0 12px 28px #24476620}.model-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.model-card{min-width:0;border:1px solid #dce6ee;background:linear-gradient(155deg,#fff,#f0f5f9);border-radius:22px;overflow:hidden;box-shadow:0 14px 35px #193b5910}.model-card img{width:100%;aspect-ratio:1.3;object-fit:contain;padding:12px;display:block;background:radial-gradient(circle at 50% 40%,#fff,#eef3f8)}.model-card video{width:100%;aspect-ratio:1.3;display:block;object-fit:contain;background:#eef3f8}.model-meta{display:flex;flex-direction:column;padding:12px 14px 4px;gap:4px}.model-meta span{font-size:10px;color:#6e8496;overflow-wrap:anywhere}.actions{display:flex;gap:14px;padding:9px 14px 14px}.actions a,.icon-links a{color:#1269a7;text-decoration:none;font-size:11px;font-weight:650}.actions a:hover,.icon-links a:hover{text-decoration:underline}.subhead{display:flex;justify-content:space-between;align-items:end;gap:20px;margin:38px 0 18px}.subhead p{margin:0;color:var(--muted);font-size:12px}.system-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:12px}.system-icon{margin:0;min-width:0;border:1px solid #dce6ee;border-radius:16px;background:#ffffffb8;padding:10px 6px 9px;text-align:center}.system-icon img{width:100%;max-width:128px;aspect-ratio:1;display:block;margin:0 auto 6px}.system-icon figcaption{font-size:12px;font-weight:620}.system-icon small{display:block;color:#7a8fa2;font-size:9px;overflow-wrap:anywhere}.icon-links{display:flex;justify-content:center;gap:8px;margin-top:7px}.footer{margin-top:36px;border-top:1px solid var(--line);padding-top:18px;color:#667f94;font-size:11px;display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap}@media(max-width:1050px){.system-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.model-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.intro{grid-template-columns:1fr}}@media(max-width:650px){header{align-items:start;flex-direction:column}.model-grid{grid-template-columns:1fr}.system-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.section-heading{align-items:start}.source-icon{width:64px;height:64px}.subhead{align-items:start;flex-direction:column}}
</style></head><body>
<header><div><p class="eyebrow">SOURCE-DRIVEN BRAND SYSTEM · ${htmlEscape(manifest.revision.toUpperCase())}</p><h1>InnerAnimalMedia / AgentSam</h1></div><span class="badge">64 vector icons · 6 relief models · source hashes recorded</span></header>
<main><div class="intro"><div><h2>One family. Two real app identities.</h2><p>The canonical InnerAnimalMedia PWA icon and AgentSam desktop master remain intact; the Local Studio public icon is retained only as provenance. Each clay model is generated from a pixel-derived relief mask, a rounded tile mesh, and PBR materials. System icons are normalized SVG masters with semantic IDs, standardized stroke geometry, color variants, and raster exports.</p><p>No labels are baked into icon artwork. These are review derivatives only; production app icons and manufacturing masters remain unchanged.</p></div><aside class="note"><strong>Review boundary</strong><br/>The 3D marks use threshold-derived relief from the supplied icon pixels. The threshold and safe inset are explicit parameters and need visual approval. System glyph paths originate from the existing Lucide UI library and are normalized—not yet bespoke-redrawn.</aside></div>
${apps}
<div class="subhead"><div><p class="eyebrow">SYSTEM ICONOGRAPHY</p><h2>64 semantic vector masters</h2></div><p>24 × 24 viewBox · 2-unit stroke · rounded joins · no visible labels inside artwork</p></div><div class="system-grid">${icons}</div>
<div class="footer"><span>Generated from the versioned manifest and source files.</span><span>Manifest: <a href="manifest.json">manifest.json</a> · Sources: <a href="sources/system-icons.json">system-icons.json</a></span><span>Clay GLBs are presentation assets, not manufacturing geometry.</span></div></main></body></html>`;
}

async function writePlatformIconExports(staging, app, sizes, sourceRoot) {
  const requested = new Set(app.platform_exports || []);
  const allowed = new Set(['png-sizes', 'ico', 'macos-icns']);
  for (const format of requested) {
    if (!allowed.has(format)) throw new Error(`Unsupported platform icon export for ${app.id}: ${format}`);
  }
  const colorway = app.platform_colorway || 'graphite';
  const colorwayDir = path.join(staging, 'app-icons', app.id, 'colorways', colorway);
  const platformDir = path.join(staging, 'app-icons', app.id, 'platform');
  await fs.mkdir(platformDir, { recursive: true });
  const results = [];
  if (requested.has('png-sizes')) {
    results.push({ format: 'png-sizes', status: 'generated', path: `app-icons/${app.id}/colorways/${colorway}`, sizes: [...sizes], source_colorway: colorway });
  }
  const sourcePng = path.join(colorwayDir, `${app.id}-${Math.min(512, app.source_width)}.png`);
  const sourceMaster = path.join(colorwayDir, `${app.id}-${app.source_width}.png`);
  const wantsNative = requested.has('ico') || requested.has('macos-icns');
  const tauriBinary = process.env.TAURI_CLI_BIN || path.resolve(sourceRoot, '../../../../..', 'node_modules/.bin/tauri');
  const tauriAvailable = await fs.stat(tauriBinary).then((stat) => stat.isFile() || stat.isSymbolicLink()).catch(() => false);
  if (wantsNative && tauriAvailable) {
    const tauriOutput = path.join(staging, '.tmp', `${app.id}-tauri-icons`);
    await fs.mkdir(path.dirname(tauriOutput), { recursive: true });
    await fs.mkdir(tauriOutput, { recursive: true });
    try {
      // Reuse the SDK's installed Tauri icon generator for real native formats;
      // don't hand-roll ICNS packaging or replace any app's active source icon.
      await execFileAsync(tauriBinary, ['icon', sourceMaster, '--output', tauriOutput], { timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
      for (const [format, requestedFormat, filename] of [['ico', 'ico', 'icon.ico'], ['macos-icns', 'macos-icns', 'icon.icns']]) {
        if (!requested.has(requestedFormat)) continue;
        const generated = path.join(tauriOutput, filename);
        const stat = await fs.stat(generated).catch(() => null);
        if (!stat || stat.size < 1024) throw new Error(`Tauri did not produce a valid ${filename} for ${app.id}`);
        const destination = path.join(platformDir, `${app.id}.${format === 'macos-icns' ? 'icns' : 'ico'}`);
        await fs.copyFile(generated, destination);
        results.push({ format, status: 'generated', path: path.relative(staging, destination).split(path.sep).join('/'), bytes: stat.size, sha256: await hashFile(destination), source_colorway: colorway, generator: 'tauri icon' });
      }
    } catch (error) {
      throw new Error(`Tauri native icon export failed for ${app.id}: ${error?.message || error}`);
    } finally {
      await fs.rm(tauriOutput, { recursive: true, force: true }).catch(() => {});
    }
  } else {
    if (requested.has('ico')) {
      const icoPath = path.join(platformDir, `${app.id}.ico`);
      let generated = false;
      let lastError;
      for (const command of ['magick', 'convert']) {
        try {
          await execFileAsync(command, [sourcePng, '-define', 'icon:auto-resize=256,128,64,48,32,16', icoPath], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
          const stat = await fs.stat(icoPath);
          if (stat.size < 512) throw new Error('ICO output is unexpectedly small');
          results.push({ format: 'ico', status: 'generated', path: path.relative(staging, icoPath).split(path.sep).join('/'), bytes: stat.size, sha256: await hashFile(icoPath), source_colorway: colorway, generator: command });
          generated = true;
          break;
        } catch (error) {
          lastError = error;
          await fs.rm(icoPath, { force: true }).catch(() => {});
        }
      }
      if (!generated) throw new Error(`Could not produce requested ICO for ${app.id}: ${lastError?.message || 'no supported converter found'}`);
    }
    if (requested.has('macos-icns')) {
      if (process.platform !== 'darwin') {
        results.push({ format: 'macos-icns', status: 'not-applicable', reason: 'No Tauri icon generator on this non-macOS host', source_colorway: colorway });
      } else {
        const icnsPath = path.join(platformDir, `${app.id}.icns`);
        try {
          await execFileAsync('sips', ['-s', 'format', 'icns', sourcePng, '--out', icnsPath], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
          const stat = await fs.stat(icnsPath);
          if (stat.size < 1024) throw new Error('ICNS output is unexpectedly small');
          results.push({ format: 'macos-icns', status: 'generated', path: path.relative(staging, icnsPath).split(path.sep).join('/'), bytes: stat.size, sha256: await hashFile(icnsPath), source_colorway: colorway, generator: 'sips' });
        } catch (error) {
          await fs.rm(icnsPath, { force: true }).catch(() => {});
          throw new Error(`Could not produce requested macOS ICNS for ${app.id}: ${error?.message || error}`);
        }
      }
    }
  }
  return results;
}

export async function buildIconographyPack({ manifestPath, outDir, normalizeSvg = normalizedSvgFallback, blenderBinary = process.env.BLENDER_BIN || 'blender' } = {}) {
  if (!manifestPath || !outDir) throw new Error('iconography build requires manifestPath and outDir');
  const absoluteManifest = path.resolve(manifestPath);
  const sourceRoot = path.dirname(absoluteManifest);
  const spec = JSON.parse(await fs.readFile(absoluteManifest, 'utf8'));
  if (spec.schema !== 'agentsam.brand-iconography.v1' || !Array.isArray(spec.app_icons) || !Array.isArray(spec.colorways)) throw new Error('Unsupported iconography manifest schema');
  const catalogPath = path.resolve(sourceRoot, spec.source_catalog);
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  if (catalog.schema !== 'agentsam.brand-system-icons.v1' || catalog.icon_count !== catalog.icons.length) throw new Error('System icon catalog is invalid');
  // Native rendering is a build-time capability. Importing the portable Brand
  // API for inspection/planning must not initialize a platform-specific binary.
  // Resolve it after input validation and before creating or replacing outputs.
  const sharpModule = await import('sharp');
  const sharp = sharpModule.default || sharpModule;
  const destination = path.resolve(outDir);
  const stagingRoot = path.resolve(process.env.AGENTSAM_ICONOGRAPHY_STAGING_ROOT || os.tmpdir());
  const staging = path.join(stagingRoot, `${path.basename(destination)}.staging-${process.pid}`);
  const destinationStaging = `${destination}.staging-${process.pid}`;
  const retiredDestination = `${destination}.retiring-${process.pid}`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.mkdir(stagingRoot, { recursive: true });
  await fs.rm(staging, { recursive: true, force: true });
  await fs.rm(destinationStaging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true });

  let destinationOwned = false;
  try {
    try {
      const marker = JSON.parse(await fs.readFile(path.join(destination, '.agentsam-generated.json'), 'utf8'));
      destinationOwned = marker.owner === 'agentsam-brand.iconography' && marker.kit_id === spec.kit_id;
      if (!destinationOwned) throw new Error(`Refusing to replace unowned output directory: ${destination}`);
    } catch (error) {
      if (error.code !== 'ENOENT' && !String(error.message).startsWith('Refusing to replace')) throw error;
      if (String(error.message).startsWith('Refusing to replace')) throw error;
      if (await fs.stat(destination).then(() => true).catch(() => false)) throw new Error(`Refusing to overwrite a directory without this kit's ownership marker: ${destination}`);
    }

    const sourceRecords = [];
    const sourcePaths = new Set();
    const addSource = async (relative, label, authority, repoPath = null) => {
      const full = path.resolve(sourceRoot, relative);
      if (!full.startsWith(`${sourceRoot}${path.sep}`)) throw new Error(`Source escapes manifest root: ${relative}`);
      const stat = await fs.stat(full);
      if (!stat.isFile()) throw new Error(`Source is not a file: ${relative}`);
      const digest = await hashFile(full);
      sourcePaths.add(relative);
      sourceRecords.push({ id: label, path: relative, bytes: stat.size, sha256: digest, authority, repository_path: repoPath, verified: true });
      const copy = path.join(staging, 'sources', relative.replace(/^sources\//, ''));
      await fs.mkdir(path.dirname(copy), { recursive: true });
      await fs.copyFile(full, copy);
      return { full, sha256: digest, bytes: stat.size };
    };

    await addSource(path.basename(absoluteManifest), 'iconography-source-manifest', 'Versioned iconography source-of-truth manifest');
    await addSource(spec.source_catalog, 'system-icon-source-catalog', 'Semantic system-icon source catalog');
    for (const support of spec.supporting_sources || []) {
      await addSource(support.path, support.id, support.authority, support.repository_path || null);
    }

    const appInputs = [];
    for (const app of spec.app_icons) {
      const source = await addSource(app.source, `${app.id}-app-icon`, app.source_authority, `${app.source_repository}:${app.source_repository_path}`);
      const metadata = await sharp(source.full, { failOn: 'warning' }).metadata();
      if (!metadata.width || !metadata.height || metadata.width !== metadata.height) throw new Error(`App icon must be square: ${app.source}`);
      const maskResolution = Math.min(1024, Math.max(512, metadata.width));
      const maskPath = path.join(staging, 'derived', 'masks', `${app.id}-mark-mask.png`);
      const mask = await buildMarkMask(sharp, source.full, maskPath, maskResolution, app.mask);
      const input = { ...app, source_full: source.full, source_sha256: source.sha256, source_width: metadata.width, source_height: metadata.height, mask_path: maskPath, mask_sha256: mask.sha256, mask_resolution: maskResolution, mask_coverage: mask.coverage, mask_parameters: { threshold_low: mask.threshold_low, threshold_high: mask.threshold_high, safe_inset: mask.safe_inset } };
      appInputs.push(input);
      const sizes = [...new Set([metadata.width, ...([512, 256, 192, 180, 128, 64, 32, 16].filter((size) => size <= metadata.width))])].sort((a, b) => b - a);
      for (const colorway of spec.colorways) {
        const full = await composeColorway(sharp, maskPath, metadata.width, colorway);
        const fullRaw = await sharp(full).raw().toBuffer({ resolveWithObject: true });
        const expectedMark = hexRgb(colorway.mark);
        let exactMarkPixels = 0;
        for (let i = 0; i < fullRaw.data.length; i += fullRaw.info.channels) {
          if (fullRaw.data[i] === expectedMark.r && fullRaw.data[i + 1] === expectedMark.g && fullRaw.data[i + 2] === expectedMark.b) exactMarkPixels += 1;
        }
        if (exactMarkPixels < metadata.width * metadata.width * 0.005) throw new Error(`Colorway mark was not rendered visibly: ${app.id}/${colorway.id}`);
        for (const size of sizes) {
          const outPath = path.join(staging, 'app-icons', app.id, 'colorways', colorway.id, `${app.id}-${size}.png`);
          await fs.mkdir(path.dirname(outPath), { recursive: true });
          await sharp(full).resize(size, size, { fit: 'fill' }).png().toFile(outPath);
          const check = await sharp(outPath).metadata();
          if (check.width !== size || check.height !== size) throw new Error(`Raster derivative dimensions mismatch: ${outPath}`);
        }
      }
      input.platform_export_results = await writePlatformIconExports(staging, input, sizes, sourceRoot);
    }

    const systemOutputs = [];
    const iconMetadata = [];
    for (const icon of catalog.icons) {
      const input = await addSource(icon.source, `system-${icon.id}`, `Lucide ${icon.component} source (${icon.source_library_version}; ${icon.source_license})`, icon.source);
      if (input.sha256 !== icon.source_sha256) throw new Error(`System icon source hash mismatch: ${icon.id}`);
      const normalized = await normalizeSvg(await fs.readFile(input.full, 'utf8'), { iconId: icon.id, semanticId: icon.semantic, width: 24, height: 24, viewBox: '0 0 24 24', strokeWidth: 2 });
      const svg = typeof normalized === 'string' ? normalized : normalized.svg;
      if (!svg || !/<svg\b/i.test(svg) || !/viewBox="0 0 24 24"/.test(svg) || /<text\b|<script\b/i.test(svg)) throw new Error(`Normalized SVG failed contract: ${icon.id}`);
      const geometryCount = (svg.match(/<(?:path|line|polyline|polygon|circle|rect|ellipse)\b/gi) || []).length;
      if (!geometryCount) throw new Error(`SVG has no visible geometry: ${icon.id}`);
      const masterPath = path.join(staging, 'system-icons', 'svg', 'master', `${icon.id}.svg`);
      await fs.mkdir(path.dirname(masterPath), { recursive: true });
      await fs.writeFile(masterPath, svg);
      for (const theme of spec.system_colorways) {
        const themed = svg.replace(/stroke="currentColor"/g, `stroke="${theme.stroke}"`);
        const themeSvgPath = path.join(staging, 'system-icons', 'svg', theme.id, `${icon.id}.svg`);
        await fs.mkdir(path.dirname(themeSvgPath), { recursive: true });
        await fs.writeFile(themeSvgPath, themed);
        for (const size of spec.system_icons.raster_sizes) {
          const pngPath = path.join(staging, 'system-icons', 'png', theme.id, `${icon.id}-${size}.png`);
          await fs.mkdir(path.dirname(pngPath), { recursive: true });
          await sharp(Buffer.from(themed), { density: 192 }).resize(size, size, { fit: 'contain' }).png().toFile(pngPath);
          const meta = await sharp(pngPath).metadata();
          if (meta.width !== size || meta.height !== size) throw new Error(`Icon raster size mismatch: ${icon.id} ${size}`);
        }
        await renderClaySystemTile(sharp, masterPath, path.join(staging, 'system-icons', 'clay', theme.id, `${icon.id}.png`), theme, spec.system_icons.clay_tile_size);
      }
      iconMetadata.push({ ...icon, normalized_master: `system-icons/svg/master/${icon.id}.svg`, normalized_sha256: sha256(Buffer.from(svg)), geometry_count: geometryCount, normalized: true, verified: true });
      systemOutputs.push({ id: icon.id, svg: `system-icons/svg/master/${icon.id}.svg`, path_count: geometryCount, stroke_width: 2, view_box: '0 0 24 24', source_sha256: input.sha256, normalized_sha256: sha256(Buffer.from(svg)) });
    }

    const outputCatalog = {
      ...catalog,
      icons: catalog.icons.map((icon) => ({ ...icon, source: `system/${path.basename(icon.source)}` })),
    };
    await fs.writeFile(path.join(staging, 'sources', 'system-icons.json'), `${JSON.stringify(outputCatalog, null, 2)}\n`);

    const packageRoot = path.resolve(sourceRoot, '../../..');
    const rendererScript = path.join(packageRoot, 'src', 'core', 'iconography', 'render_clay.py');
    const rendererJob = {
      schema: 'agentsam.brand-iconography.renderer-job.v1',
      output_root: staging,
      mask_resolution: 512,
      mesh_resolution: spec.clay_renderer.mesh_resolution,
      render_resolution: spec.clay_renderer.render_resolution,
      turntable_resolution: spec.clay_renderer.turntable_resolution,
      turntable_frames: spec.clay_renderer.turntable_frames,
      turntable_fps: spec.clay_renderer.turntable_fps,
      render_angles: spec.clay_renderer.render_angles,
      include_turntable_for: spec.clay_renderer.include_turntable_for,
      static_renders_required: spec.clay_renderer.static_renders_required !== false,
      preview_engine: spec.clay_renderer.preview_engine || null,
      render_skip_reason: spec.clay_renderer.render_skip_reason || null,
      icon_width: spec.clay_renderer.icon_width,
      tile_thickness: spec.clay_renderer.tile_thickness,
      relief_height: spec.clay_renderer.relief_height,
      app_icons: appInputs.map((app) => ({ id: app.id, name: app.name, source_path: app.source_full, source_sha256: app.source_sha256, mask_path: app.mask_path, mask_sha256: app.mask_sha256, mask_parameters: app.mask_parameters })),
      colorways: spec.colorways,
    };
    const jobDir = path.join(staging, '.tmp');
    await fs.mkdir(jobDir, { recursive: true });
    const jobPath = path.join(jobDir, 'renderer-job.json');
    await fs.writeFile(jobPath, `${JSON.stringify(rendererJob, null, 2)}\n`);
    const blenderVersionResult = await execFileAsync(blenderBinary, ['--version'], { timeout: 10000, maxBuffer: 1024 * 1024 });
    const blenderVersion = (blenderVersionResult.stdout || blenderVersionResult.stderr || '').split(/\r?\n/).find(Boolean)?.trim() || 'unknown';
    let blenderRun;
    try {
      blenderRun = await execFileAsync(blenderBinary, ['--background', '--quiet', '--python-exit-code', '1', '--python', rendererScript, '--', '--job', jobPath], { timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
    } catch (error) {
      const tail = (value) => String(value || '').slice(-7000);
      throw new Error(`Blender renderer failed (code=${error.code ?? 'unknown'}, signal=${error.signal ?? 'none'}, killed=${Boolean(error.killed)}).\nstdout:\n${tail(error.stdout)}\nstderr:\n${tail(error.stderr)}\n${tail(error.message)}`);
    }
    const rendererReportPath = path.join(staging, 'renderer-report.json');
    if (!(await fs.stat(rendererReportPath).then(() => true).catch(() => false))) {
      throw new Error(`Blender exited without renderer-report.json. stdout:\n${blenderRun.stdout || '(empty)'}\nstderr:\n${blenderRun.stderr || '(empty)'}`);
    }
    const rendererReport = JSON.parse(await fs.readFile(rendererReportPath, 'utf8'));
    if (rendererReport.models.length !== appInputs.length * spec.colorways.length) throw new Error(`Expected ${appInputs.length * spec.colorways.length} GLB models; renderer reported ${rendererReport.models.length}`);
    for (const model of rendererReport.models) {
      if (!model.turntable || !model.turntable_frames_dir) continue;
      const framesPattern = path.join(staging, model.turntable_frames_dir, 'frame_%04d.png');
      const videoPath = path.join(staging, model.turntable);
      await fs.mkdir(path.dirname(videoPath), { recursive: true });
      await execFileAsync(process.env.FFMPEG_BIN || 'ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(spec.clay_renderer.turntable_fps),
        '-i', framesPattern, '-frames:v', String(model.turntable_frame_count), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', videoPath,
      ], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
      const probe = await execFileAsync(process.env.FFPROBE_BIN || 'ffprobe', [
        '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-of', 'json', videoPath,
      ], { timeout: 10000, maxBuffer: 1024 * 1024 });
      const videoInfo = JSON.parse(probe.stdout).streams?.[0];
      if (!videoInfo || Number(videoInfo.width) !== spec.clay_renderer.turntable_resolution || Number(videoInfo.height) !== spec.clay_renderer.turntable_resolution || Number(videoInfo.nb_frames) !== model.turntable_frame_count) {
        throw new Error(`Turntable verification failed: ${model.turntable} expected ${model.turntable_frame_count} frames at ${spec.clay_renderer.turntable_resolution}px`);
      }
      model.turntable_verification = { width: Number(videoInfo.width), height: Number(videoInfo.height), frames: Number(videoInfo.nb_frames), frame_rate: videoInfo.r_frame_rate, passed: true };
      await fs.rm(path.join(staging, model.turntable_frames_dir), { recursive: true, force: true });
      model.turntable_frames_dir = null;
    }
    await fs.writeFile(rendererReportPath, `${JSON.stringify(rendererReport, null, 2)}\n`);
    const staticRendersRequired = spec.clay_renderer.static_renders_required !== false;
    let stillRenderCount = 0;
    for (const model of rendererReport.models) {
      if (Math.abs(Number(model.bbox_icon_units?.x) - spec.clay_renderer.icon_width) > 0.01 || Math.abs(Number(model.bbox_icon_units?.y) - spec.clay_renderer.icon_width) > 0.01) {
        throw new Error(`GLB bounding box differs from icon-unit contract: ${model.glb}`);
      }
      if (!(Number(model.bbox_icon_units?.z) > spec.clay_renderer.tile_thickness && Number(model.bbox_icon_units?.z) <= spec.clay_renderer.tile_thickness + spec.clay_renderer.relief_height + 0.02)) {
        throw new Error(`GLB relief depth outside manifest bounds: ${model.glb}`);
      }
      if (staticRendersRequired) {
        for (const angle of spec.clay_renderer.render_angles) {
          const relative = model.renders?.[angle];
          if (!relative) throw new Error(`Missing ${angle} render for ${model.glb}`);
          const renderMeta = await sharp(path.join(staging, relative)).metadata();
          if (renderMeta.width !== spec.clay_renderer.render_resolution || renderMeta.height !== spec.clay_renderer.render_resolution) throw new Error(`Render resolution mismatch: ${relative}`);
          stillRenderCount += 1;
        }
      }
    }
    if (staticRendersRequired && stillRenderCount !== rendererReport.models.length * spec.clay_renderer.render_angles.length) throw new Error(`Expected ${rendererReport.models.length * spec.clay_renderer.render_angles.length} still renders, got ${stillRenderCount}`);
    const outputModels = [];
    for (const model of rendererReport.models) {
      const info = await glbInfo(path.join(staging, model.glb));
      if (Number(model.non_manifold_edge_count) !== 0) throw new Error(`Relief mesh is not manifold: ${model.glb} (${model.non_manifold_edge_count} edges)`);
      const expectedNodes = [`${model.app_icon_id}_tile`, `${model.app_icon_id}_relief`];
      for (const node of expectedNodes) if (!info.node_names.includes(node)) throw new Error(`GLB missing expected node ${node}: ${model.glb}`);
      if (!info.has_pbr_materials || info.mesh_count < 2) throw new Error(`GLB PBR/node verification failed: ${model.glb}`);
      outputModels.push({ ...model, glb_sha256: info.sha256, glb_bytes: info.byte_length, glb_nodes: info.node_names, glb_mesh_count: info.mesh_count, material_names: info.material_names, verified: true });
    }
    await fs.rm(jobDir, { recursive: true, force: true });

    const studio = buildStudioHtml({ manifest: spec, iconCatalog: catalog, outputModels, systemIcons: systemOutputs });
    await fs.writeFile(path.join(staging, 'studio.html'), studio);
    await fs.writeFile(path.join(staging, 'gallery.html'), studio);

    await removeAppleDoubleFiles(staging);
    const allFiles = await walkFiles(staging);
    const fileRecords = [];
    for (const relative of allFiles.filter((name) => name !== 'manifest.json' && name !== '.agentsam-generated.json')) {
      const full = path.join(staging, relative);
      const stat = await fs.stat(full);
      fileRecords.push({ path: relative, bytes: stat.size, sha256: await hashFile(full), format: path.extname(relative).slice(1).toLowerCase() || 'json', verified: true });
    }
    const platformExportRecords = appInputs.flatMap((app) => app.platform_export_results || []);
    const platformExportSummary = {
      requested: platformExportRecords.length,
      generated: platformExportRecords.filter((item) => item.status === 'generated').length,
      not_applicable: platformExportRecords.filter((item) => item.status === 'not-applicable').length,
      passed: platformExportRecords.every((item) => item.status === 'generated' || item.status === 'not-applicable'),
    };
    const outputManifest = {
      schema: 'agentsam.brand-iconography.output.v1',
      kit_id: spec.kit_id,
      revision: spec.revision,
      title: spec.title,
      source_manifest_sha256: await hashFile(absoluteManifest),
      source_policy: spec.source_policy,
      sources: sourceRecords,
      source_system_library: { name: catalog.source_library.name, version: catalog.source_library.version, license: catalog.source_library.license, count: catalog.icon_count },
      system_icons: { count: systemOutputs.length, contract: { view_box: '0 0 24 24', stroke_width: 2, linecap: 'round', linejoin: 'round' }, entries: systemOutputs },
      app_icons: appInputs.map((app) => ({ id: app.id, name: app.name, source: app.source, source_sha256: app.source_sha256, source_dimensions: [app.source_width, app.source_height], mask: { path: path.relative(staging, app.mask_path).split(path.sep).join('/'), sha256: app.mask_sha256, resolution: app.mask_resolution, coverage: app.mask_coverage, parameters: app.mask_parameters }, platform_colorway: app.platform_colorway || 'graphite', platform_exports: app.platform_export_results || [], source_is_immutable: true })),
      renderer: { engine: 'Blender', version: blenderVersion, purpose: spec.clay_renderer.purpose, source: 'src/core/iconography/render_clay.py', report: 'renderer-report.json', units: spec.clay_renderer.units, mesh_resolution: spec.clay_renderer.mesh_resolution, preview_engine: spec.clay_renderer.preview_engine || null, static_rendering: staticRendersRequired ? 'verified' : 'deferred-to-interactive-preview' },
      models: outputModels,
      colorways: spec.colorways,
      verification: {
        source_hashes: { expected: sourceRecords.length, actual: sourceRecords.length, passed: true },
        system_icon_count: { expected: 64, actual: systemOutputs.length, passed: systemOutputs.length === 64 },
        system_svg_contract: { view_box: '0 0 24 24', stroke_width: 2, invalid: 0, passed: true },
        app_icon_rasters: { expected_dimensions_checked: true, passed: true },
        platform_exports: platformExportSummary,
        glb_models: { expected: appInputs.length * spec.colorways.length, actual: outputModels.length, valid_glb_header: true, expected_nodes_present: true, pbr_materials_present: true, passed: true },
        renders: { provider: spec.clay_renderer.preview_engine || 'interactive-preview', status: staticRendersRequired ? 'verified' : 'interactive-preview-only', stills_expected: staticRendersRequired ? rendererReport.models.length * spec.clay_renderer.render_angles.length : 0, stills_actual: stillRenderCount, turntables: rendererReport.turntables.length, turntable_frames_verified: staticRendersRequired ? true : null, passed: staticRendersRequired ? stillRenderCount === rendererReport.models.length * spec.clay_renderer.render_angles.length : true, reason: spec.clay_renderer.render_skip_reason || null },
      },
      assumptions: [
        'The source app-icon raster is the canonical shape input. Relief masks use the explicit luminance thresholds and safe inset from the manifest; review mask previews before treating the relief silhouette as approved.',
        'The system icon source paths are the existing Lucide component geometry normalized to a shared 24-unit viewport and 2-unit rounded stroke. They are not yet bespoke-redrawn glyphs.',
        'GLB coordinates are presentation icon-units, not millimeters or manufacturing geometry.',
      ],
      files: fileRecords,
      generated_at: new Date().toISOString(),
    };
    await fs.writeFile(path.join(staging, 'manifest.json'), `${JSON.stringify(outputManifest, null, 2)}\n`);
    await fs.writeFile(path.join(staging, '.agentsam-generated.json'), `${JSON.stringify({ owner: 'agentsam-brand.iconography', kit_id: spec.kit_id, revision: spec.revision }, null, 2)}\n`);
    // Build/stage on APFS. Expansion receives a temporary verified copy only
    // at promotion time; there are no persistent duplicate backups.
    await fs.rm(destinationStaging, { recursive: true, force: true });
    await fs.cp(staging, destinationStaging, { recursive: true, errorOnExist: true, force: false });
    for (const record of fileRecords) {
      const copiedHash = await hashFile(path.join(destinationStaging, record.path));
      if (copiedHash !== record.sha256) throw new Error(`Deliverable copy hash mismatch: ${record.path}`);
    }
    const copiedManifest = JSON.parse(await fs.readFile(path.join(destinationStaging, 'manifest.json'), 'utf8'));
    if (copiedManifest.source_manifest_sha256 !== outputManifest.source_manifest_sha256) throw new Error('Deliverable copy manifest verification failed');
    let retired = false;
    try {
      if (destinationOwned) {
        await fs.rm(retiredDestination, { recursive: true, force: true });
        await fs.rename(destination, retiredDestination);
        retired = true;
      }
      await fs.rename(destinationStaging, destination);
    } catch (promotionError) {
      if (retired && !(await fs.stat(destination).then(() => true).catch(() => false))) {
        await fs.rename(retiredDestination, destination).catch(() => {});
      }
      throw promotionError;
    }
    if (retired) await fs.rm(retiredDestination, { recursive: true, force: true }).catch(() => {});
    await fs.rm(staging, { recursive: true, force: true });
    return {
      ok: true,
      capability: 'brand.iconography.build',
      output: destination,
      manifest: path.join(destination, 'manifest.json'),
      preview: path.join(destination, 'studio.html'),
      app_icons: appInputs.length,
      system_icons: systemOutputs.length,
      glb_models: outputModels.length,
      files: fileRecords.length + 2,
      renderer: { engine: 'Blender', version: blenderVersion },
      source_hashes_verified: sourceRecords.length,
    };
  } catch (error) {
    await fs.rm(destinationStaging, { recursive: true, force: true }).catch(() => {});
    if (process.env.KEEP_FAILED_ICONOGRAPHY_STAGING === '1') {
      console.error(`[brand.iconography] Preserved failed APFS staging for diagnosis: ${staging}`);
    } else {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    }
    throw error;
  }
}
