import assert from 'node:assert/strict';
import test from 'node:test';
import { decideChatIdentity } from './studio-chat-gate.js';

test('a valid session always wins over a client-asserted X-User-Id', () => {
  assert.deepEqual(decideChatIdentity({ sessionUserId: 'au_me', bridgeOk: false, headerUserId: 'au_victim' }), { action: 'bind', userId: 'au_me' });
  assert.deepEqual(decideChatIdentity({ sessionUserId: 'au_me', bridgeOk: false, headerUserId: 'au_me' }), { action: 'pass', userId: 'au_me' });
  assert.deepEqual(decideChatIdentity({ sessionUserId: 'au_me', bridgeOk: false, headerUserId: null }), { action: 'bind', userId: 'au_me' });
});

test('no session and no bridge key is denied, whatever X-User-Id says', () => {
  for (const headerUserId of [null, '', 'au_victim']) {
    assert.deepEqual(decideChatIdentity({ sessionUserId: null, bridgeOk: false, headerUserId }), { action: 'deny', status: 401, error: 'authentication_required' });
  }
});

test('only the trusted bridge lane may assert an account, and it must name one', () => {
  assert.deepEqual(decideChatIdentity({ sessionUserId: null, bridgeOk: true, headerUserId: 'au_target' }), { action: 'pass', userId: 'au_target' });
  assert.equal(decideChatIdentity({ sessionUserId: null, bridgeOk: true, headerUserId: '' }).status, 400);
});
