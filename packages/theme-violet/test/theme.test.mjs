import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createTheme, createProductRow } from '../src/index.js';
import { materializePrebuild, resolvePrebuildRoot } from '../src/node.js';

test('violet exports an installable portable prebuild contract', () => {
  const theme = createTheme();
  assert.equal(theme.slug, "violet");
  assert.equal(theme.installable, true);
  assert.equal(theme.portable, true);
  assert.equal(theme.prebuildRoot, 'site');
  assert.equal(theme.package, "@inneranimalmedia/theme-violet");
});

test('violet package contains the complete built site', () => {
  const root = resolvePrebuildRoot();
  assert.ok(fs.existsSync(path.join(root, 'index.html')));
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal(index.includes('/themes/violet/demo/'), false);
  assert.equal(index.includes('apps/theme-gallery-preview'), false);
});

test('violet can materialize without the monorepo or gallery sync', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-violet-'));
  const target = path.join(parent, 'public');
  try {
    const receipt = materializePrebuild(target, { basePath: '/customer123/', canonicalOrigin: 'https://customer123.example/' });
    assert.equal(receipt.basePath, '/customer123/');
    assert.equal(receipt.canonicalOrigin, 'https://customer123.example/');
    assert.ok(fs.existsSync(path.join(target, 'index.html')));
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('violet product row is package-first', () => {
  const row = createProductRow({ accountId: 'acct_demo' });
  assert.equal(row.kind, 'app');
  assert.equal(row.slug, "violet");
  assert.equal(row.metadata.origin, 'package_prebuild');
  assert.equal(row.metadata.normalization_state, 'package_ready');
  assert.equal(row.metadata.prebuild_root, 'site');
  assert.equal(row.metadata.portable, true);
});

test('violet packaged storefront loads its base shell before section styles', () => {
  const root = resolvePrebuildRoot();
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(html, /href="\.\/global\/cpas-shell\.css"/);
  assert.match(html, /href="\.\/global\/cpas-public-surface\.css"/);
  assert.ok(html.indexOf('cpas-shell.css') < html.indexOf('cpas-public-surface.css'));
  const nested=fs.readFileSync(path.join(root,'pages/index.html'),'utf8');
  assert.match(nested,/href="\.\.\/global\/cpas-shell\.css"/);
  assert.ok(nested.indexOf('cpas-shell.css') < nested.indexOf('cpas-public-surface.css'));
  const css = fs.readFileSync(path.join(root,'global/cpas-shell.css'),'utf8');
  assert.match(css, /\.logo-link img,/);
  assert.match(css, /\.site-header\s*\{/);
});
