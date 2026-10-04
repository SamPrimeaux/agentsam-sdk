import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixtureSettingsHost, getSettingsFixture } from '../src/fixtures/index.ts';

test('fixture host exposes the same snapshot through the portable SettingsHost contract', async () => {
  const fixture = getSettingsFixture('degraded');
  const host = createFixtureSettingsHost(fixture);
  assert.equal((await host.snapshot()).fixtureName, 'degraded');
  assert.equal((await host.capabilities()).host, 'fixture');
});

test('first-run fixture does not fake credentials, agents, or models', () => {
  const fixture = getSettingsFixture('first-run');
  assert.deepEqual(fixture.credentials, []);
  assert.deepEqual(fixture.agents, []);
  assert.deepEqual(fixture.models, []);
});


test('fixture plugin and widget mutations persist through the same host contract', async () => {
  const host = createFixtureSettingsHost(getSettingsFixture('populated'));
  const plugin = (await host.snapshot()).plugins[0];
  const widget = (await host.snapshot()).widgets[0];

  await host.setPluginEnabled(plugin.id, false);
  assert.equal((await host.snapshot()).plugins.find((row) => row.id === plugin.id).enabled, false);

  await host.setWidgetVisible(widget.id, false);
  assert.equal((await host.snapshot()).widgets.find((row) => row.id === widget.id).visible, false);
});
