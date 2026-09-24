import assert from 'node:assert/strict';
import test from 'node:test';
import { createTheme, createProductRow } from '../src/index.js';

test('fuelnfree-site theme package exports installable contract', () => {
  const theme = createTheme();
  assert.equal(theme.slug, "fuelnfree-site");
  assert.equal(theme.installable, true);
  assert.equal(theme.package, "@inneranimalmedia/theme-fuelnfree-site");
  assert.ok(Array.isArray(theme.pages));
});

test('fuelnfree-site createProductRow is D1-ready', () => {
  const row = createProductRow({ accountId: 'acct_demo' });
  assert.equal(row.kind, 'app');
  assert.equal(row.slug, "fuelnfree-site");
  assert.equal(row.metadata.origin, 'gallery_mount');
  assert.ok(Array.isArray(row.relationships));
});
