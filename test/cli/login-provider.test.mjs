import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { promptLoginProvider, resolveLoginProvider, LOGIN_PROVIDERS } from '../../src/commands/account-auth.js';

test('provider aliases resolve; inneranimalmedia is last and not the default', () => {
  assert.equal(resolveLoginProvider('gh'), 'github');
  assert.equal(resolveLoginProvider('cf'), 'cloudflare');
  assert.equal(resolveLoginProvider('iam'), 'inneranimalmedia');
  assert.equal(LOGIN_PROVIDERS.at(-1).id, 'inneranimalmedia');
});

test('picker text exposes no env var names and honors the choice', async () => {
  for (const [typed, expected] of [['2\n', 'github'], ['3\n', 'cloudflare'], ['4\n', 'inneranimalmedia'], ['\n', 'google']]) {
    const input = new PassThrough(); input.isTTY = true;
    const output = new PassThrough(); output.isTTY = true;
    let text = '';
    output.on('data', (d) => { text += d; });
    const pending = promptLoginProvider({ input, output });
    setImmediate(() => input.write(typed));
    assert.equal(await pending, expected);
    assert.doesNotMatch(text, /CLIENT_ID|OAUTH_ISSUER|_ID\b/);
  }
});

test('non-interactive default stays on the CLI client', async () => {
  assert.equal(await promptLoginProvider({ input: { isTTY: false }, output: { isTTY: false } }), 'inneranimalmedia');
});
