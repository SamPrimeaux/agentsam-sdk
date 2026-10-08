import test from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, auditThemeContrast } from './contrast.mjs';

test('WCAG contrast math returns 21:1 for black and white', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#ffffff', '#000000'), 21);
});
test('theme contrast receipts distinguish unresolved from passing', () => {
  const pair = auditThemeContrast('--color-foreground: #ffffff; --color-background: #000000;');
  assert.equal(pair[0].actual, 21);
  assert.equal(pair[1].actual, null);
});
