import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  BrandPluginWorkspace,
  SettingsProductPage,
  SettingsShell,
  createFixtureSettingsHost,
  firstRunSettingsFixture,
  populatedSettingsFixture,
  degradedSettingsFixture,
} from '../dist/index.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('public package exports the settings renderer and independently reusable brand workspace', () => {
  assert.equal(typeof SettingsShell, 'function');
  assert.equal(typeof SettingsProductPage, 'function');
  assert.equal(typeof BrandPluginWorkspace, 'function');
});

test('standalone package ships compiled utility CSS and a documented stylesheet export', async () => {
  const css = await readFile(path.join(packageRoot, 'dist/frontend/index.css'), 'utf8');
  const rootCss = await readFile(path.join(packageRoot, 'dist/index.css'), 'utf8');
  const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  assert.ok(css.length > 20_000, `expected compiled CSS, got ${css.length} bytes`);
  assert.match(css, /\.bg-background/);
  assert.match(css, /\.text-foreground/);
  assert.match(css, /--color-background/);
  assert.match(rootCss, /\.bg-background/);
  assert.equal(rootCss, css);
  assert.equal(pkg.exports['./frontend/styles.css'], './dist/frontend/index.css');
  assert.ok(pkg.files.includes('examples/standalone'));
});

test('fixture host demonstrates first-run, populated and degraded provider states without credentials', async () => {
  const firstRun = createFixtureSettingsHost(firstRunSettingsFixture);
  const populated = createFixtureSettingsHost(populatedSettingsFixture);
  const degraded = createFixtureSettingsHost(degradedSettingsFixture);

  const firstRunData = await firstRun.readWidgetData('github-activity');
  const populatedData = await populated.readWidgetData('cloudflare-resources');
  const queueData = await populated.readWidgetData('queues');
  const queueHistory = await populated.readWidgetData('queues', { history: '24h', queueId: 'demo-orders-queue' });
  const degradedData = await degraded.readWidgetData('google-drive-recent');

  assert.equal(firstRunData.status, 'not_connected');
  assert.equal(populatedData.status, 'ready');
  assert.equal(populatedData.source, 'fixture');
  assert.equal(queueData.data.queues[0].queue_name, 'orders');
  assert.equal(queueHistory.data.history.state, 'ready');
  assert.equal(degradedData.status, 'error');
  assert.equal(JSON.stringify(populatedData).includes('access_token'), false);

  const firstRunSnapshot = await firstRun.snapshot();
  const populatedSnapshot = await populated.snapshot();
  assert.ok(firstRunSnapshot.widgets.filter(widget => widget.availability === 'ready').every(widget => widget.installed === false));
  assert.ok(populatedSnapshot.widgets.filter(widget => widget.availability === 'ready').every(widget => widget.installed === true));
});
