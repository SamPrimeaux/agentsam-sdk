import assert from 'node:assert/strict';
import test from 'node:test';
import { createTheme, createProductRow } from '../src/index.js';

test('floors-site theme package exports harvested (not installable) contract', () => {
  const theme = createTheme();
  assert.equal(theme.slug, "floors-site");
  assert.equal(theme.installable, false);
  assert.equal(theme.lineage, "afm");
  assert.equal(theme.family, "service-gallery");
  assert.equal(theme.package, "@inneranimalmedia/theme-grove");
  assert.ok(Array.isArray(theme.pages));
});

test('floors-site createProductRow is D1-ready', () => {
  const row = createProductRow({ accountId: 'acct_demo' });
  assert.equal(row.kind, 'app');
  assert.equal(row.slug, "floors-site");
  assert.equal(row.metadata.origin, 'gallery_mount');
  assert.ok(Array.isArray(row.relationships));
});
