import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createTheme, createProductRow } from '../src/index.js';
import { materializePrebuild, resolvePrebuildRoot } from '../src/node.js';

test('cypress exports an installable portable prebuild contract', () => {
  const theme = createTheme();
  assert.equal(theme.slug, "cypress");
  assert.equal(theme.installable, true);
  assert.equal(theme.portable, true);
  assert.equal(theme.prebuildRoot, 'site');
  assert.equal(theme.package, "@inneranimalmedia/theme-cypress");
});

test('cypress package contains the complete built site', () => {
  const root = resolvePrebuildRoot();
  assert.ok(fs.existsSync(path.join(root, 'index.html')));
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal(index.includes('/themes/cypress/demo/'), false);
  assert.equal(index.includes('apps/theme-gallery-preview'), false);
});

test('cypress can materialize without the monorepo or gallery sync', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-cypress-'));
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

test('cypress product row is package-first', () => {
  const row = createProductRow({ accountId: 'acct_demo' });
  assert.equal(row.kind, 'app');
  assert.equal(row.slug, "cypress");
  assert.equal(row.metadata.origin, 'package_prebuild');
  assert.equal(row.metadata.normalization_state, 'package_ready');
  assert.equal(row.metadata.prebuild_root, 'site');
  assert.equal(row.metadata.portable, true);
});
