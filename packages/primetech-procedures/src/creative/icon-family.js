import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ensureProjectDirectory, readProjectFile, sha256, writeJsonAtomic } from './paths.js';

export const PRIMETECH_ICON_COLORWAY_IDS = Object.freeze([
  'technical-slate', 'lagoon', 'industrial-ember', 'alloy-blue',
  'prime-electric', 'prime-spectrum', 'reverse', 'core-mono',
]);
export const PRIMETECH_ICON_SHAPES = Object.freeze(['bare', 'circle', 'squircle']);
export const PRIMETECH_ICON_SIZES = Object.freeze([1024, 512, 256, 128, 64, 32, 16]);

function parseSvg(source) {
  if (typeof source !== 'string' || source.length < 30 || source.length > 8 * 1024 * 1024) throw new Error('icon_source_svg_invalid');
  if (/<\s*(script|foreignObject|iframe|object|embed|image)\b/i.test(source) || /\bon[a-z]+\s*=/i.test(source) || /javascript\s*:/i.test(source) || /url\(\s*['"]?https?:/i.test(source)) {
    throw new Error('icon_source_svg_unsafe_content');
  }
  const match = source.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg\s*>/i);
  if (!match) throw new Error('icon_source_svg_root_missing');
  const attributes = match[1];
  const inner = match[2];
  const viewBoxMatch = attributes.match(/\bviewBox\s*=\s*['"]([^'"]+)['"]/i);
  if (!viewBoxMatch) throw new Error('icon_source_svg_viewbox_required');
  const viewBox = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || viewBox.some(value => !Number.isFinite(value)) || viewBox[2] <= 0 || viewBox[3] <= 0) {
    throw new Error('icon_source_svg_viewbox_invalid');
  }
  if (!inner.trim()) throw new Error('icon_source_svg_empty');
  return { inner, viewBox: viewBox.join(' '), sourceViewBox: viewBox };
}

function replaceColors(svg, colorway) {
  let output = svg;
  const mapping = { 'currentColor': colorway.foreground, 'var(--mark)': colorway.foreground, ...(colorway.sourceColorMap || {}) };
  for (const [source, target] of Object.entries(mapping)) {
    if (typeof target !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(target)) throw new Error('icon_color_mapping_invalid');
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    output = output.replace(new RegExp(escaped, 'gi'), target);
  }
  return output;
}

function buildVariant(parsed, colorway, shape, size = 1024) {
  const inner = replaceColors(parsed.inner, colorway);
  if (shape === 'bare') {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${parsed.viewBox}" role="img" aria-label="PrimeTech ${colorway.id} bare mark">${inner}</svg>`;
  }
  const background = colorway.background;
  if (typeof background !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(background)) throw new Error(`icon_colorway_background_required:${colorway.id}`);
  const markInset = Number(colorway.markInset ?? 0.18);
  if (!(markInset >= 0.05 && markInset <= 0.35)) throw new Error(`icon_mark_inset_invalid:${colorway.id}`);
  const markSize = Math.round(size * (1 - markInset * 2));
  const offset = Math.round((size - markSize) / 2);
  const backgroundShape = shape === 'circle'
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${Math.round(size * 0.465)}" fill="${background}"/>`
    : `<rect x="${Math.round(size * 0.035)}" y="${Math.round(size * 0.035)}" width="${Math.round(size * 0.93)}" height="${Math.round(size * 0.93)}" rx="${Math.round(size * 0.205)}" fill="${background}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="PrimeTech ${colorway.id} ${shape} icon">${backgroundShape}<svg x="${offset}" y="${offset}" width="${markSize}" height="${markSize}" viewBox="${parsed.viewBox}" preserveAspectRatio="xMidYMid meet">${inner}</svg></svg>`;
}

async function renderPng(svg, size, target) {
  const bytes = await sharp(Buffer.from(svg), { density: 384, failOn: 'warning' })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await fs.writeFile(target, bytes, { mode: 0o600 });
  return bytes;
}

async function assertTransparentCorners(pngBytes, label) {
  const { data, info } = await sharp(pngBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
  const corners = [alphaAt(0, 0), alphaAt(info.width - 1, 0), alphaAt(0, info.height - 1), alphaAt(info.width - 1, info.height - 1)];
  if (corners.some(alpha => alpha !== 0)) throw new Error(`icon_transparency_gate_failed:${label}`);
  let visible = 0;
  for (let offset = 3; offset < data.length; offset += info.channels) if (data[offset] > 0) visible += 1;
  if (visible < Math.max(4, Math.floor(info.width * info.height * 0.002))) throw new Error(`icon_mark_missing:${label}`);
  return { transparentCorners: true, visiblePixelCount: visible };
}

export async function buildIconFamily({ projectRoot, sourceSvgPath, outputDir = '.agentsam/primetech/brand/primetech-icon-family', colorways, sizes = PRIMETECH_ICON_SIZES } = {}) {
  if (!Array.isArray(colorways) || colorways.length !== 8) throw new Error('primetech_icon_family_requires_eight_colorways');
  const ids = colorways.map(item => item?.id);
  if (PRIMETECH_ICON_COLORWAY_IDS.some(id => !ids.includes(id)) || new Set(ids).size !== 8) throw new Error('primetech_icon_family_colorway_set_invalid');
  if (!Array.isArray(sizes) || !sizes.length || sizes.some(size => !Number.isInteger(size) || size < 16 || size > 4096) || new Set(sizes).size !== sizes.length) throw new Error('primetech_icon_family_sizes_invalid');
  const source = await readProjectFile(projectRoot, sourceSvgPath, 8 * 1024 * 1024);
  const parsed = parseSvg(source.bytes.toString('utf8'));
  const root = await ensureProjectDirectory(projectRoot, outputDir);
  const outputs = [];
  for (const colorway of colorways) {
    if (!/^#[0-9a-f]{3,8}$/i.test(colorway.foreground || '')) throw new Error(`icon_colorway_foreground_required:${colorway.id}`);
    const colorwayRoot = path.join(root, colorway.id);
    await fs.mkdir(colorwayRoot, { recursive: true, mode: 0o700 });
    for (const shape of PRIMETECH_ICON_SHAPES) {
      const svg = buildVariant(parsed, colorway, shape, 1024);
      const svgPath = path.join(colorwayRoot, `${shape}.svg`);
      await fs.writeFile(svgPath, svg, { mode: 0o600 });
      const svgBytes = Buffer.from(svg);
      const svgRecord = { path: path.relative(root, svgPath), contentType: 'image/svg+xml', bytes: svgBytes.length, sha256: sha256(svgBytes), colorway: colorway.id, shape };
      outputs.push(svgRecord);
      const rasterDir = path.join(colorwayRoot, 'png');
      await fs.mkdir(rasterDir, { recursive: true, mode: 0o700 });
      for (const size of sizes) {
        const pngPath = path.join(rasterDir, `${size}.png`);
        const pngBytes = await renderPng(buildVariant(parsed, colorway, shape, size), size, pngPath);
        const transparency = await assertTransparentCorners(pngBytes, `${colorway.id}/${shape}/${size}`);
        outputs.push({ path: path.relative(root, pngPath), contentType: 'image/png', bytes: pngBytes.length, sha256: sha256(pngBytes), colorway: colorway.id, shape, size, quality: transparency });
      }
    }
  }
  const manifest = {
    schema: 'primetech.icon-family.v1',
    family: 'PrimeTech',
    source: { path: sourceSvgPath, bytes: source.bytes.length, sha256: sha256(source.bytes), originalPreserved: true },
    colorways: PRIMETECH_ICON_COLORWAY_IDS,
    shapes: PRIMETECH_ICON_SHAPES,
    variantCount: 24,
    rasterSizes: sizes,
    outputCount: outputs.length,
    outputs,
    quality: { transparentBareMarks: true, transparentBadgeCorners: true, sourcePreserved: true },
  };
  const manifestPath = path.join(root, 'manifest.json');
  await writeJsonAtomic(manifestPath, manifest);
  return { ok: true, schema: manifest.schema, outputDir: path.relative(projectRoot, root), variantCount: 24, outputCount: outputs.length, sourceSha256: manifest.source.sha256, manifestPath: path.relative(projectRoot, manifestPath), manifestSha256: sha256(Buffer.from(JSON.stringify(manifest, null, 2) + '\n')), outputs };
}
