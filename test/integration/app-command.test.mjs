import assert from 'node:assert/strict';
import test from 'node:test';
import { listAppManifests } from '../../src/commands/app.js';

test('lists agentsam.app.json manifests for product apps', () => {
  const apps = listAppManifests();
  const ids = apps.map((row) => row.id).sort();
  assert.ok(ids.includes('cad-creator'));
  assert.ok(ids.includes('local-studio'));
  assert.ok(ids.includes('client-cms-editor'));
});
