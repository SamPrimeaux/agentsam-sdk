import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { absolutizeThemePreviewPaths } from '../frontend/theme-editor/project.mjs';

const base = 'https://themes.inneranimalmedia.com/theme-packages/plain-jane/0.1.0/preview/';

test('installed theme preview loads original release CSS and media from Theme Store', () => {
  const html = [
    '<base href="' + base + '">',
    '<link rel="stylesheet" href="/theme-packages/plain-jane/0.1.0/preview/assets/index.css">',
    '<img src="/theme-packages/plain-jane/0.1.0/preview/images/cover.svg">',
    '<a href="/theme-packages/plain-jane/0.1.0/preview/about">About</a>',
    '<a href="/admin/pages">CMS</a>',
  ].join('');
  const next = absolutizeThemePreviewPaths(html, base);
  assert.match(next, /href="https:\/\/themes\.inneranimalmedia\.com\/theme-packages\/plain-jane\/0\.1\.0\/preview\/assets\/index\.css"/);
  assert.match(next, /src="https:\/\/themes\.inneranimalmedia\.com\/theme-packages\/plain-jane\/0\.1\.0\/preview\/images\/cover\.svg"/);
  assert.match(next, /href="https:\/\/themes\.inneranimalmedia\.com\/theme-packages\/plain-jane\/0\.1\.0\/preview\/about"/);
  assert.match(next, /href="\/admin\/pages"/);
});

test('other releases and unrelated URLs are not rewritten', () => {
  const html = '<img src="/theme-packages/resolve/0.1.0/preview/logo.svg"><img src="/theme-packages/plain-jane/0.2.0/preview/logo.svg"><script src="/scripts/index.js"></script>';
  assert.equal(absolutizeThemePreviewPaths(html, base), html);
  assert.equal(absolutizeThemePreviewPaths(html, 'javascript:alert(1)'), html);
});

test('real Plain Jane installer artifact contains release paths that are corrected', async () => {
  const project = JSON.parse(await readFile(new URL('../frontend/static/data/site-theme-projects/plain-jane-0.1.0.json', import.meta.url), 'utf8'));
  const page = project.pages.find(p => p.slug === 'home');
  assert.ok(page);
  assert.ok(page.template.includes('href="/theme-packages/plain-jane/0.1.0/preview/assets/'));
  const corrected = absolutizeThemePreviewPaths(page.template, page.assetBase);
  assert.match(corrected, /href="https:\/\/themes\.inneranimalmedia\.com\/theme-packages\/plain-jane\/0\.1\.0\/preview\/assets\//);
  assert.ok(!corrected.includes('href="/theme-packages/plain-jane/0.1.0/preview/assets/'));
});
