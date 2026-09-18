import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { startLocalPtyServer } from '../../src/local-pty/server.js';

function nextMessage(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for websocket message')), 2000);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(data.toString());
    });
    ws.once('error', reject);
  });
}

test('local PTY transport is release-testable with a mock process and no ExecOS/tunnel', async (t) => {
  const writes = [];
  const resizes = [];
  let killed = false;
  let onData = null;
  let onExit = null;

  const fakePty = {
    spawn(shell, args, options) {
      assert.equal(Array.isArray(args), true);
      assert.equal(options.env.AGENTSAM_LOCAL_PTY, '1');
      return {
        write(value) {
          writes.push(value);
          onData?.(`echo:${value}`);
        },
        resize(cols, rows) { resizes.push([cols, rows]); },
        kill() { killed = true; },
        onData(fn) { onData = fn; },
        onExit(fn) { onExit = fn; },
      };
    },
  };

  const server = await startLocalPtyServer({
    cwd: process.cwd(),
    host: '127.0.0.1',
    port: 0,
    pty: fakePty,
  });
  t.after(async () => { await server.close().catch(() => {}); });

  const health = await fetch(server.healthUrl);
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.service, 'agentsam-local-pty');
  assert.equal(healthBody.port, server.port);

  const ws = new WebSocket(server.url);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  t.after(() => { try { ws.close(); } catch {} });

  const sessionFrame = JSON.parse(await nextMessage(ws));
  assert.equal(sessionFrame.type, 'session_id');
  assert.match(sessionFrame.session_id, /^local_/);

  ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
  ws.send(JSON.stringify({ type: 'slash', line: '/pwd' }));
  const echoed = await nextMessage(ws);

  assert.deepEqual(resizes, [[120, 40]]);
  assert.equal(writes.includes('/pwd\r'), true);
  assert.equal(echoed, 'echo:/pwd\r');

  ws.close();
  await new Promise((resolve) => ws.once('close', resolve));
  assert.equal(killed, true);
  onExit?.();
});
