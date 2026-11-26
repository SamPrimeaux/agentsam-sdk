import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  BUILTIN_WIDGET_DEFINITIONS,
  WIDGET_GALLERY_DEFINITIONS,
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

test('gallery separates packaged renderers from concepts and provider-backed widgets declare their host requirement', () => {
  assert.equal(WIDGET_GALLERY_DEFINITIONS.length, 24);
  assert.equal(new Set(WIDGET_GALLERY_DEFINITIONS.map((widget) => widget.id)).size, 24);
  assert.equal(BUILTIN_WIDGET_DEFINITIONS.length, 7);
  assert.ok(BUILTIN_WIDGET_DEFINITIONS.every(widget => widget.availability === 'ready'));

  const readyIds = WIDGET_GALLERY_DEFINITIONS
    .filter((widget) => widget.availability === 'ready')
    .map((widget) => widget.id)
    .sort();
  assert.deepEqual(readyIds, ['calculator', 'clock', 'cloudflare-resources', 'countdown', 'github-activity', 'google-drive-recent', 'queues']);
  assert.equal(WIDGET_GALLERY_DEFINITIONS.find(widget => widget.id === 'queues').requiredProvider, 'cloudflare');
  assert.equal(WIDGET_GALLERY_DEFINITIONS.find(widget => widget.id === 'cloudflare-resources').requiredProvider, 'cloudflare');
  assert.equal(WIDGET_GALLERY_DEFINITIONS.find(widget => widget.id === 'github-activity').requiredProvider, 'github');
  assert.equal(WIDGET_GALLERY_DEFINITIONS.find(widget => widget.id === 'google-drive-recent').requiredProvider, 'google_drive');
  assert.equal(WIDGET_GALLERY_DEFINITIONS.find(widget => widget.id === 'cloudflare-observability').availability, 'demo');

  for (const widget of WIDGET_GALLERY_DEFINITIONS) {
    assert.ok(widget.title && widget.description && widget.category && widget.ownerPackage);
    assert.ok(widget.icon && widget.tags.length && widget.sizes.length);
    if (widget.availability === 'demo') {
      assert.equal(widget.deeplink, undefined, widget.id + ' must not navigate to an unimplemented renderer');
    }
  }
});
