import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { CREATIVE_WIDGET_COVERS, creativeWidgetCover } from '../dist/widgets/creative-covers.js';

const requiredCovers = ['docs', 'slides', 'sheets', 'design', 'data', 'whiteboard', 'design-system', 'brand-guidelines', 'design-in-code'];

 test('cover imports explicitly request raw SVG markup for Vite source aliases', () => {
  const source = readFileSync(new URL('../src/widgets/creative-covers.ts', import.meta.url), 'utf8');
  for (const key of requiredCovers) {
    const file = key === 'design-system' ? 'design-system' : key === 'brand-guidelines' ? 'brand-guidelines' : key === 'design-in-code' ? 'design-in-code' : key;
    assert.ok(source.includes(`./covers/${file}.svg?raw`), `${key} must import raw SVG markup, not a Vite asset URL`);
  }
});

test('every first-party cover is a native SVG and is shipped with the package', () => {
  for (const key of requiredCovers) {
    const dataUri = CREATIVE_WIDGET_COVERS[key];
    assert.ok(dataUri?.startsWith('data:image/svg+xml;charset=utf-8,'), `missing SVG data URI: ${key}`);
    const decoded = decodeURIComponent(dataUri.split(',', 2)[1]);
    assert.match(decoded, /^<svg\b/, `${key} must contain SVG source, not a bitmap wrapper`);
    const sourceUrl = new URL(`../dist/widgets/covers/${key}.svg`, import.meta.url);
    const path = fileURLToPath(sourceUrl);
    assert.ok(existsSync(path), `missing packaged source SVG: ${path}`);
    assert.equal(readFileSync(path, 'utf8').trim(), decoded.trim(), `${key} runtime art must match its source SVG`);
  }
});

test('gallery and widget consumers share the same SVG registry', () => {
  for (const key of ['docs', 'slides', 'sheets', 'design', 'data', 'whiteboard']) {
    assert.equal(creativeWidgetCover(key), CREATIVE_WIDGET_COVERS[key]);
  }
  assert.equal(creativeWidgetCover('brand-guidelines-entry'), CREATIVE_WIDGET_COVERS['brand-guidelines']);
});
