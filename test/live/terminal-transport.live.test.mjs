import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';

const liveUrl = String(process.env.AGENTSAM_LIVE_TERMINAL_WS_URL || '').trim();

test('live terminal transport accepts a websocket connection', { skip: !liveUrl }, async (t) => {
  const ws = new WebSocket(liveUrl, {
    headers: process.env.AGENTSAM_LIVE_TERMINAL_AUTH
      ? { authorization: process.env.AGENTSAM_LIVE_TERMINAL_AUTH }
      : undefined,
  });
  t.after(() => { try { ws.close(); } catch {} });

  await Promise.race([
    new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('live terminal websocket open timed out')), 8000)),
  ]);

  assert.equal(ws.readyState, WebSocket.OPEN);
});
