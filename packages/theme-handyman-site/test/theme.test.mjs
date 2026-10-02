import assert from 'node:assert/strict';
import test from 'node:test';
import { createTheme, createProductRow } from '../src/index.js';

test('handyman-site theme package exports harvested (not installable) contract', () => {
  const theme = createTheme();
  assert.equal(theme.slug, "handyman-site");
  assert.equal(theme.installable, false);
  assert.equal(theme.lineage, "phs");
  assert.equal(theme.family, "trade-services");
  assert.equal(theme.package, "@inneranimalmedia/theme-forge");
  assert.ok(Array.isArray(theme.pages));
});

test('handyman-site createProductRow is D1-ready', () => {
  const row = createProductRow({ accountId: 'acct_demo' });
  assert.equal(row.kind, 'app');
  assert.equal(row.slug, "handyman-site");
  assert.equal(row.metadata.origin, 'gallery_mount');
  assert.ok(Array.isArray(row.relationships));
});
