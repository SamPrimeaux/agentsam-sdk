import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  formatCountdown,
  normalizeCountdownDuration,
  remainingFromDeadline,
} from '../dist/widgets/index.js';

test('widgets are a first-class workbench package surface', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(pkg.exports['./widgets'], {
    types: './dist/widgets/index.d.ts',
    import: './dist/widgets/index.js',
  });
  assert.equal(pkg.exports['./widgets/widgets.css'], './dist/widgets/widgets.css');
});

test('countdown time authority derives remaining time from an absolute deadline', () => {
  assert.equal(remainingFromDeadline(10_000, 2_500), 7_500);
  assert.equal(remainingFromDeadline(2_500, 10_000), 0);
  assert.equal(normalizeCountdownDuration(-1), 0);
  assert.equal(normalizeCountdownDuration(1500.4), 1500);
});

test('countdown formatter supports minute and hour ranges', () => {
  assert.equal(formatCountdown(5 * 60_000), '05:00');
  assert.equal(formatCountdown(61_000), '01:01');
  assert.equal(formatCountdown((2 * 3600 + 3 * 60 + 4) * 1000), '2:03:04');
  assert.equal(formatCountdown(0), '00:00');
});
