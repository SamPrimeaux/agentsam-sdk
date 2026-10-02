import assert from 'node:assert/strict';
import test from 'node:test';
import { createTheme, createProductRow } from '../src/index.js';

test('insurance-site theme package exports harvested (not installable) contract', () => {
  const theme = createTheme();
  assert.equal(theme.slug, "insurance-site");
  assert.equal(theme.installable, false);
  assert.equal(theme.lineage, "cci");
  assert.equal(theme.family, "professional-leadgen");
  assert.equal(theme.package, "@inneranimalmedia/theme-harbor");
  assert.ok(Array.isArray(theme.pages));
});

test('insurance-site createProductRow is D1-ready', () => {
  const row = createProductRow({ accountId: 'acct_demo' });
  assert.equal(row.kind, 'app');
  assert.equal(row.slug, "insurance-site");
  assert.equal(row.metadata.origin, 'gallery_mount');
  assert.ok(Array.isArray(row.relationships));
});
