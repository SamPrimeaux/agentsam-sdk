import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storeJs = readFileSync(
  new URL('../frontend/static/js/store.js', import.meta.url),
  'utf8',
);
const authority = readFileSync(
  new URL('../backend/cms/theme-authority.mjs', import.meta.url),
  'utf8',
);

test('draft producer emits store-row compatibility fields', () => {
  for (const field of [
    'installed',
    'snapshot_url',
    'created_at',
    'updated_at',
    'site_id',
  ]) {
    assert.ok(
      authority.includes(field),
      `theme-authority.mjs should emit ${field}`,
    );
  }
});

test('draft row renders preview fallback, last-saved, version and publish', () => {
  assert.match(storeJs, /preview_url/);
  assert.match(storeJs, /Last saved/);
  assert.match(storeJs, /draft-publish/);
  assert.match(storeJs, /active-version-text/);
});

test('draft dates carry the year when outside the current year', () => {
  assert.match(storeJs, /year:\s*["']numeric["']/);
});

test('import action does not fake a coming-soon flow', () => {
  assert.ok(
    !storeJs.includes('Theme import is coming soon'),
    'import button must not promise a fake flow',
  );
});
