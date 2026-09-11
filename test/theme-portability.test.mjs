import assert from 'node:assert/strict';
import test from 'node:test';

import { CLOUD, LOCAL, SANDBOX, getLaneThemeByName } from '../src/ui/theme.js';

test('SDK terminal lane metadata is provider and operator neutral', () => {
  const serialized = JSON.stringify([LOCAL.meta, CLOUD.meta, SANDBOX.meta]);
  assert.doesNotMatch(serialized, /sam(smac)?|inneranimalmedia|gcp|cloudflare|MY_CONTAINER/i);
  assert.equal(LOCAL.meta.tunnelHint, 'current machine · real shell');
  assert.equal(CLOUD.meta.label, 'Remote');
  assert.equal(SANDBOX.meta.tunnelHint, 'isolated disposable runtime');
  assert.equal(getLaneThemeByName('remote'), CLOUD);
  assert.equal(getLaneThemeByName('cloud'), CLOUD);
});
