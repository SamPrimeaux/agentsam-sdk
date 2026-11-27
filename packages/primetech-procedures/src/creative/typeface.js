import fs from 'node:fs/promises';
import path from 'node:path';
import opentype from 'opentype.js';
import { zipSync } from 'fflate';
import { ensureProjectDirectory, readProjectFile, sha256, writeJsonAtomic } from './paths.js';

function signedArea(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function validateTypefaceDocument(doc) {
  if (!doc || typeof doc !== 'object' || doc.schemaVersion !== 1) throw new Error('typeface_document_schema_invalid');
  if (typeof doc.familyName !== 'string' || !doc.familyName.trim() || doc.familyName.length > 80) throw new Error('typeface_family_name_invalid');
  if (typeof doc.styleName !== 'string' || !doc.styleName.trim() || doc.styleName.length > 40) throw new Error('typeface_style_name_invalid');
  if (!Number.isInteger(doc.unitsPerEm) || doc.unitsPerEm < 256 || doc.unitsPerEm > 4096) throw new Error('typeface_units_per_em_invalid');
  if (!doc.metrics || !Number.isFinite(doc.metrics.ascender) || !Number.isFinite(doc.metrics.descender) || doc.metrics.ascender <= 0 || doc.metrics.descender >= 0) throw new Error('typeface_metrics_invalid');
  if (!doc.glyphs || typeof doc.glyphs !== 'object' || Array.isArray(doc.glyphs)) throw new Error('typeface_glyphs_required');
  const glyphs = Object.values(doc.glyphs);
  if (!glyphs.length || glyphs.length > 2048) throw new Error('typeface_glyph_count_invalid');
  const unicodes = new Set();
  for (const glyph of glyphs) {
    if (!glyph || typeof glyph.name !== 'string' || !/^[A-Za-z0-9_.-]{1,40}$/.test(glyph.name)) throw new Error('typeface_glyph_name_invalid');
    if (!Number.isInteger(glyph.unicode) || glyph.unicode < 1 || glyph.unicode > 0x10ffff || unicodes.has(glyph.unicode)) throw new Error('typeface_glyph_unicode_invalid');
    unicodes.add(glyph.unicode);
    if (!Number.isFinite(glyph.advanceWidth) || glyph.advanceWidth < 1 || glyph.advanceWidth > doc.unitsPerEm * 8) throw new Error(`typeface_glyph_advance_invalid:${glyph.name}`);
    if (!Array.isArray(glyph.contours)) throw new Error(`typeface_glyph_contours_invalid:${glyph.name}`);
    for (const contour of glyph.contours) {
      if (!Array.isArray(contour.points) || contour.points.length < 3 || contour.points.length > 4096) throw new Error(`typeface_contour_invalid:${glyph.name}`);
      for (const point of contour.points) {
        if (!Array.isArray(point) || point.length !== 2 || point.some(value => !Number.isFinite(value) || Math.abs(value) > doc.unitsPerEm * 8)) throw new Error(`typeface_point_invalid:${glyph.name}`);
      }
    }
  }
  return { glyphCount: glyphs.length, unicodes: [...unicodes].sort((a, b) => a - b) };
}

function makeGlyphPath(contours) {
  const path = new opentype.Path();
  for (const contour of contours || []) {
    if (contour.points.length < 3) continue;
    const positive = Boolean(contour.hole);
    const points = (signedArea(contour.points) > 0) === positive ? contour.points : [...contour.points].reverse();
    path.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) path.lineTo(x, y);
    path.close();
  }
  return path;
}

function buildFont(doc) {
  const notdef = new opentype.Path();
  const em = doc.unitsPerEm;
  notdef.moveTo(em * 0.08, 0); notdef.lineTo(em * 0.08, em * 0.72);
  notdef.lineTo(em * 0.62, em * 0.72); notdef.lineTo(em * 0.62, 0); notdef.close();
  notdef.moveTo(em * 0.17, em * 0.09); notdef.lineTo(em * 0.53, em * 0.09);
  notdef.lineTo(em * 0.53, em * 0.63); notdef.lineTo(em * 0.17, em * 0.63); notdef.close();
  const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: Math.round(em * 0.72), path: notdef })];
  for (const glyph of Object.values(doc.glyphs).sort((a, b) => a.unicode - b.unicode)) {
    glyphs.push(new opentype.Glyph({
      name: glyph.name,
      unicode: glyph.unicode,
      advanceWidth: Math.max(1, Math.round(glyph.advanceWidth)),
      path: makeGlyphPath(glyph.contours),
    }));
  }
  return new opentype.Font({
    familyName: doc.familyName,
    styleName: doc.styleName,
    unitsPerEm: doc.unitsPerEm,
    ascender: Math.round(doc.metrics.ascender),
    descender: Math.round(doc.metrics.descender),
    glyphs,
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export async function buildTypefacePackage({ projectRoot, sourcePath, outputDir = '.agentsam/primetech/typefaces', licenseText = null, specimenText = null } = {}) {
  const source = await readProjectFile(projectRoot, sourcePath, 32 * 1024 * 1024);
  let doc;
  try { doc = JSON.parse(source.bytes.toString('utf8')); } catch { throw new Error('typeface_source_json_invalid'); }
  const validation = validateTypefaceDocument(doc);
  const font = buildFont(doc);
  const fontBytes = Buffer.from(font.toArrayBuffer());
  const parsed = opentype.parse(fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength));
  if (parsed.glyphs.length !== validation.glyphCount + 1) throw new Error('typeface_ttf_glyph_count_mismatch');
  for (const unicode of validation.unicodes) {
    const glyph = parsed.charToGlyph(String.fromCodePoint(unicode));
    if (!glyph || glyph.index < 1) throw new Error(`typeface_ttf_cmap_missing:${unicode}`);
  }
  const root = await ensureProjectDirectory(projectRoot, outputDir);
  const slug = doc.familyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-typeface';
  const fontName = `${slug}-${doc.styleName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ttf`;
  const fontRel = `fonts/${fontName}`;
  const sourceRel = 'source/typeface.source.json';
  const specimenRel = 'specimen.html';
  const fontDir = path.join(root, 'fonts');
  const sourceDir = path.join(root, 'source');
  await fs.mkdir(fontDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(sourceDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(root, fontRel), fontBytes, { mode: 0o600 });
  await fs.writeFile(path.join(root, sourceRel), source.bytes, { mode: 0o600 });
  const characters = validation.unicodes.map(code => String.fromCodePoint(code)).join('');
  const sample = specimenText || `${doc.familyName} ${doc.styleName}\n${characters}`;
  const specimen = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(doc.familyName)} specimen</title><style>@font-face{font-family:PrimeTechSpecimen;src:url('${fontRel}') format('truetype')}body{margin:48px;background:#f4f4f1;color:#171a18;font-family:PrimeTechSpecimen,serif}h1{font-size:48px;font-weight:400}pre{white-space:pre-wrap;font:inherit;font-size:28px;line-height:1.5}</style></head><body><h1>${escapeHtml(doc.familyName)} · ${escapeHtml(doc.styleName)}</h1><pre>${escapeHtml(sample)}</pre></body></html>`;
  await fs.writeFile(path.join(root, specimenRel), specimen, { mode: 0o600 });
  const files = {
    [fontRel]: new Uint8Array(fontBytes),
    [sourceRel]: new Uint8Array(source.bytes),
    [specimenRel]: new TextEncoder().encode(specimen),
  };
  if (typeof licenseText === 'string' && licenseText.trim()) files['LICENSE.txt'] = new TextEncoder().encode(licenseText);
  const manifest = {
    schema: 'agentsam.typeface-package.v1',
    family: doc.familyName,
    style: doc.styleName,
    version: doc.version || '1.0.0',
    format: 'static-truetype',
    variableFont: false,
    glyphCount: validation.glyphCount,
    unicodeCoverage: validation.unicodes,
    unitsPerEm: doc.unitsPerEm,
    metrics: doc.metrics,
    source: { path: sourcePath, sha256: sha256(source.bytes), preserved: true },
    font: { path: fontRel, bytes: fontBytes.length, sha256: sha256(fontBytes) },
    specimen: specimenRel,
    license: typeof licenseText === 'string' && licenseText.trim() ? 'included' : 'not-supplied',
  };
  files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n');
  const zipBytes = zipSync(files, { level: 8 });
  const packagePath = path.join(root, `${slug}-${doc.styleName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-typeface.zip`);
  await fs.writeFile(packagePath, zipBytes, { mode: 0o600 });
  await writeJsonAtomic(path.join(root, 'manifest.json'), manifest);
  return {
    ok: true,
    schema: manifest.schema,
    family: doc.familyName,
    style: doc.styleName,
    glyphCount: validation.glyphCount,
    format: 'ttf',
    variableFont: false,
    fontPath: path.relative(projectRoot, path.join(root, fontRel)),
    packagePath: path.relative(projectRoot, packagePath),
    packageBytes: zipBytes.length,
    packageSha256: sha256(zipBytes),
    manifestPath: path.relative(projectRoot, path.join(root, 'manifest.json')),
    license: manifest.license,
  };
}
