import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mintPath = new URL('../../apps/local-studio/backend/worker/agentsam-credentials-mint.js', import.meta.url);
const source = readFileSync(mintPath, 'utf8');

test('credential minting has no static scope list', () => {
  assert.ok(!source.includes('DEFAULT_SCOPES'), 'DEFAULT_SCOPES must not return');
  const literal = source.match(/["'][a-z]+:[a-z:*]+["']/);
  assert.equal(literal, null, 'colon-style scope literal found: ' + (literal && literal[0]));
});
