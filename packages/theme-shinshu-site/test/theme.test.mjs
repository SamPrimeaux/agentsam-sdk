import assert from 'node:assert/strict';
import test from 'node:test';
import { createTheme, createProductRow } from '../src/index.js';

test('shinshu-site theme package exports installable contract', () => {
  const theme = createTheme();
  assert.equal(theme.slug, "shinshu-site");
  assert.equal(theme.installable, true);
  assert.equal(theme.package, "@inneranimalmedia/theme-shinshu-site");
  assert.ok(Array.isArray(theme.pages));
});

test('shinshu-site createProductRow is D1-ready', () => {
  const row = createProductRow({ accountId: 'acct_demo' });
  assert.equal(row.kind, 'app');
  assert.equal(row.slug, "shinshu-site");
  assert.equal(row.metadata.origin, 'gallery_mount');
  assert.ok(Array.isArray(row.relationships));
});
