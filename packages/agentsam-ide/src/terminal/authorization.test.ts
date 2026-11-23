import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { canAttachAuthorizedTerminal } from './index.ts';

test('authenticated hosted websocket permits PTY without any project', () => {
  assert.equal(canAttachAuthorizedTerminal({ hostedWebsocketUrl: 'wss://runtime.example/attach' }), true);
});

test('paired native runtime permits PTY without any project', () => {
  assert.equal(canAttachAuthorizedTerminal({ runtimeBaseUrl: 'http://127.0.0.1:18765', runtimeCapability: 'local' }), true);
});

test('workspace selection, unpaired local runtime, and empty URL do not authorize execution', () => {
  assert.equal(canAttachAuthorizedTerminal({}), false);
  assert.equal(canAttachAuthorizedTerminal({ runtimeBaseUrl: 'http://127.0.0.1:18765' }), false);
  assert.equal(canAttachAuthorizedTerminal({ runtimeCapability: 'local' }), false);
  assert.equal(canAttachAuthorizedTerminal({ hostedWebsocketUrl: '   ' }), false);
});
