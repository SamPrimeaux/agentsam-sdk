import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultLanguageCapabilities, buildLspHandshake } from './index.ts';

test('language support availability cannot masquerade as a verified external LSP session', () => {
  const declared=defaultLanguageCapabilities();
  assert.equal(declared['language.typescript'], 'available');
  assert.equal(declared['language.rust'], 'missing');
  assert.ok(Object.values(declared).every(status=>status!=='ready'));
  const explicit=buildLspHandshake('running-host',defaultLanguageCapabilities({'language.rust':'ready'}));
  assert.equal(explicit.capabilities['language.rust'],'ready');
});
