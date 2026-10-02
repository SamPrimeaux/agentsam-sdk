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
