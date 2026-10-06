import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const from = (path) => JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
test('real Heuristic Commerce theme ships with manifest, editable page and matching preset tokens', () => {
  const manifest=from('theme.json');
  const preset=from(manifest.entry);
  const tokens=from('presets/fuel-free-time/tokens.json');
  assert.equal(manifest.id,'heuristic-commerce');
  assert.equal(preset.id,'fuel-free-time');
  assert.equal(tokens.color.canvas,'#090909');
  assert.equal(typeof tokens.color.accent,'string');
  assert.ok(existsSync(new URL('../storefront/css/heuristic-theme.css',import.meta.url)));
  assert.ok(existsSync(new URL('../storefront/shop.html',import.meta.url)));
  assert.ok(preset.pages.shop);
});
