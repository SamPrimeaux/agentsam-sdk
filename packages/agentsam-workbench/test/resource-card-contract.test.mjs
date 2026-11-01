import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('resource-card family grammar is exported once for Creative Department apps', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(pkg.exports['./resources'], 'package exports ./resources');
  assert.ok(pkg.exports['./resources/resource-card.css'], 'package exports resource-card.css');

  const source = await readFile(new URL('../src/resources/ResourceCard.tsx', import.meta.url), 'utf8');
  assert.match(source, /data-personality=\{personality\}/);
  assert.match(source, /previewKind/);
  assert.doesNotMatch(source, /createRoot|WebGLRenderer|Timeline/, 'gallery cards must stay lightweight');

  const css = await readFile(new URL('../src/resources/resource-card.css', import.meta.url), 'utf8');
  for (const personality of ['cad', 'sketch', 'sculpt', 'movie']) {
    assert.match(css, new RegExp(`data-personality='${personality}'`));
  }
});
