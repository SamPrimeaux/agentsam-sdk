import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
import {
  buildIconFamily,
  buildTypefacePackage,
  buildSpriteAtlas,
  compareVisuals,
  buildDesignSystemPackage,
  packageCreativeAssets,
  buildEpubPackage,
} from '../src/creative/index.js';

async function fixtureRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'primetech-creative-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

const colorways = [
  ['technical-slate', '#e9eeeb', '#20282b'], ['lagoon', '#e8f4f0', '#0d4644'],
  ['industrial-ember', '#fff0e6', '#49281e'], ['alloy-blue', '#edf5ff', '#243f60'],
  ['prime-electric', '#eff8ff', '#0d2c45'], ['prime-spectrum', '#f4efff', '#34245b'],
  ['reverse', '#151a17', '#f2f4f2'], ['core-mono', '#ffffff', '#000000'],
].map(([id, foreground, background]) => ({ id, foreground, background }));

test('PrimeTech icon-family builder creates 24 transparent shape variants and verified PNG sizes', async t => {
  const root = await fixtureRoot(t);
  await fs.writeFile(path.join(root, 'mark.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="currentColor" d="M20 15h45v12H32v18h28v12H32v28H20z"/></svg>');
  const result = await buildIconFamily({ projectRoot: root, sourceSvgPath: 'mark.svg', colorways, sizes: [128, 64] });
  assert.equal(result.ok, true);
  assert.equal(result.variantCount, 24);
  assert.equal(result.outputCount, 72);
  const manifest = JSON.parse(await fs.readFile(path.join(root, result.manifestPath), 'utf8'));
  assert.equal(manifest.colorways.length, 8);
  assert.equal(manifest.shapes.length, 3);
  assert.equal(manifest.outputs.length, 72);
  assert.equal(manifest.source.originalPreserved, true);
  assert.equal(await fs.readFile(path.join(root, 'mark.svg'), 'utf8').then(Boolean), true);
});

test('Typeface Studio document exports a parseable static TTF and source package', async t => {
  const root = await fixtureRoot(t);
  const document = {
    schemaVersion: 1,
    familyName: 'PrimeTech Test',
    styleName: 'Regular',
    version: '1.0.0',
    unitsPerEm: 1000,
    metrics: { capHeight: 700, xHeight: 500, ascender: 800, descender: -200, baseline: 0, stemWidth: 100 },
    glyphs: {
      A: { character: 'A', name: 'A', unicode: 65, advanceWidth: 720, leftSideBearing: 0, contours: [{ points: [[80, 0], [350, 700], [620, 0]] }] },
      B: { character: 'B', name: 'B', unicode: 66, advanceWidth: 720, leftSideBearing: 0, contours: [{ points: [[80, 0], [80, 700], [620, 700], [620, 0]] }] },
    },
  };
  await fs.writeFile(path.join(root, 'typeface.json'), JSON.stringify(document));
  const result = await buildTypefacePackage({ projectRoot: root, sourcePath: 'typeface.json' });
  assert.equal(result.ok, true);
  assert.equal(result.glyphCount, 2);
  assert.equal(result.format, 'ttf');
  assert.equal(result.variableFont, false);
  const archive = unzipSync(await fs.readFile(path.join(root, result.packagePath)));
  assert.ok(archive['fonts/primetech-test-regular.ttf']);
  assert.ok(archive['source/typeface.source.json']);
  assert.ok(archive['manifest.json']);
});

test('sprite-atlas builder packs all frames, preserves transparency, and writes an editable preview', async t => {
  const root = await fixtureRoot(t);
  const frame = async (name, color) => fs.writeFile(path.join(root, name), await sharp({ create: { width: 12, height: 12, channels: 4, background: color } }).png().toBuffer());
  await frame('frame-01.png', { r: 255, g: 0, b: 0, alpha: 1 });
  await frame('frame-02.png', { r: 0, g: 255, b: 0, alpha: 1 });
  await frame('frame-03.png', { r: 0, g: 0, b: 255, alpha: 1 });
  const result = await buildSpriteAtlas({ projectRoot: root, framePaths: ['frame-01.png', 'frame-02.png', 'frame-03.png'], columns: 2, cellWidth: 16, cellHeight: 16, padding: 2, fps: 12 });
  assert.equal(result.ok, true);
  assert.equal(result.frameCount, 3);
  assert.equal(result.width, 38);
  assert.equal(result.height, 38);
  assert.match(await fs.readFile(path.join(root, result.previewPath), 'utf8'), /requestAnimationFrame/);
  const manifest = JSON.parse(await fs.readFile(path.join(root, result.manifestPath), 'utf8'));
  assert.equal(manifest.frames.length, 3);
  assert.equal(manifest.quality.frameOverflow, false);
});

test('visual QA emits measurable diff evidence and does not overclaim semantic quality', async t => {
  const root = await fixtureRoot(t);
  const base = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } } }).png().toBuffer();
  const changed = await sharp(base).composite([{ input: await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
  await fs.writeFile(path.join(root, 'reference.png'), base);
  await fs.writeFile(path.join(root, 'rendered.png'), changed);
  const result = await compareVisuals({ projectRoot: root, referencePath: 'reference.png', renderedPath: 'rendered.png', maxMeanAbsoluteError: 0.001, maxChangedPixelRatio: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'review');
  assert.ok(result.metrics.changedPixels >= 1);
  assert.match(result.report.interpretation, /does not judge semantic quality/);
  await fs.access(path.join(root, result.diffPath));
  await fs.access(path.join(root, result.overlayPath));
});

test('design-system package validates tokens and reports contrast results', async t => {
  const root = await fixtureRoot(t);
  const tokens = {
    schema: 'agentsam.design-tokens.v1',
    colors: { brand: { primary: '#112233' }, surface: { base: '#ffffff' } },
    typography: { fontFamily: { sans: ['Inter', 'sans-serif'] }, fontSize: { body: '16px' } },
    spacing: { 1: '4px', 2: '8px' },
    contrastPairs: [{ foreground: '#ffffff', background: '#000000', minimum: 4.5 }],
  };
  await fs.writeFile(path.join(root, 'tokens.json'), JSON.stringify(tokens));
  const result = await buildDesignSystemPackage({ projectRoot: root, tokensPath: 'tokens.json' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'pass');
  assert.ok((await fs.readFile(path.join(root, result.cssPath), 'utf8')).includes('--color-brand-primary'));
});

test('creative asset package includes immutable source checksums', async t => {
  const root = await fixtureRoot(t);
  await fs.writeFile(path.join(root, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
  await fs.writeFile(path.join(root, 'readme.txt'), 'Source artwork.');
  const result = await packageCreativeAssets({ projectRoot: root, name: 'prime-tech-brand-kit', files: [{ path: 'logo.svg', role: 'source-vector' }, { path: 'readme.txt', role: 'notes' }] });
  assert.equal(result.ok, true);
  assert.equal(result.fileCount, 2);
  const archive = unzipSync(await fs.readFile(path.join(root, result.packagePath)));
  const manifest = JSON.parse(new TextDecoder().decode(archive['manifest.json']));
  assert.equal(manifest.files.length, 2);
  assert.match(manifest.files[0].sha256, /^[a-f0-9]{64}$/);
});

test('EPUB 3 package contains required mimetype, container, navigation and chapter files', async t => {
  const root = await fixtureRoot(t);
  const book = { title: 'PrimeTech Field Guide', author: 'InnerAnimalMedia', language: 'en', chapters: [{ title: 'Identity', contentMarkdown: '# Identity\n\nA coherent system of symbols and expression.' }, { title: 'Production', contentMarkdown: '## Production\n\nA repeatable creative pipeline.' }] };
  await fs.writeFile(path.join(root, 'book.json'), JSON.stringify(book));
  const result = await buildEpubPackage({ projectRoot: root, sourcePath: 'book.json' });
  assert.equal(result.ok, true);
  assert.equal(result.chapterCount, 2);
  const archive = unzipSync(await fs.readFile(path.join(root, result.epubPath)));
  assert.equal(new TextDecoder().decode(archive.mimetype), 'application/epub+zip');
  assert.ok(archive['META-INF/container.xml']);
  assert.ok(archive['EPUB/package.opf']);
  assert.ok(archive['EPUB/nav.xhtml']);
  assert.ok(archive['EPUB/chapter-001.xhtml']);
});
