import assert from 'node:assert/strict';
import test from 'node:test';
import { QUALITY_VIEWPORTS } from './viewports.mjs';

test('five named form-factor viewports include an approximately 2000px widescreen', () => {
  assert.deepEqual(QUALITY_VIEWPORTS.map((item) => item.name), [
    'phone', 'tablet', 'desktop', 'large-desktop', 'widescreen-2000',
  ]);
  assert.equal(QUALITY_VIEWPORTS.at(-1).width, 2000);
  assert.equal(QUALITY_VIEWPORTS[0].mode, 'single-primary-surface');
});
