import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, it } from 'node:test';
import { createLoopbackCallbackListener } from '../src/lib/auth.js';

describe('loopback OAuth callback', () => {
  it('settles waitForCallback when browser hits success page', async () => {
    const state = 'test_state_abc';
    const listener = await createLoopbackCallbackListener({
      state,
      host: '127.0.0.1',
      timeoutMs: 5_000,
    });
    try {
      const wait = listener.waitForCallback();
      const port = new URL(listener.redirectUri).port;
      const res = await fetch(
        `http://127.0.0.1:${port}/callback?state=${state}&code=auth_code_xyz`,
      );
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /Authentication complete/);
      const callback = await wait;
      assert.equal(callback.code, 'auth_code_xyz');
      assert.equal(callback.state, state);
    } finally {
      await listener.close();
    }
  });

  it('does not settle on code-less probe so a later redirect can succeed', async () => {
    const state = 'test_state_probe';
    const listener = await createLoopbackCallbackListener({
      state,
      host: '127.0.0.1',
      timeoutMs: 5_000,
    });
    try {
      const wait = listener.waitForCallback();
      const port = new URL(listener.redirectUri).port;
      const probe = await fetch(`http://127.0.0.1:${port}/callback?state=${state}`);
      assert.equal(probe.status, 400);
      const res = await fetch(
        `http://127.0.0.1:${port}/callback?state=${state}&code=real_code`,
      );
      assert.equal(res.status, 200);
      const callback = await wait;
      assert.equal(callback.code, 'real_code');
    } finally {
      await listener.close();
    }
  });
});
