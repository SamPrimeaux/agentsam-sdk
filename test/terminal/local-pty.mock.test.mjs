import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import {
  attachLocalPtySession,
  startLocalPtyServer,
} from '../../src/local-pty/server.js';

function fakeTransports() {
  const writes = [];
  const resizes = [];
  let killed = 0;
  let dataHandler = null;
  let exitHandler = null;

  const pty = {
    spawn(shell, args, options) {
      assert.equal(Array.isArray(args), true);
      assert.equal(options.env.AGENTSAM_LOCAL_PTY, '1');
      return {
        write(value) { writes.push(value); },
        resize(cols, rows) { resizes.push([cols, rows]); },
        kill() { killed += 1; },
        onData(fn) { dataHandler = fn; },
        onExit(fn) { exitHandler = fn; },
      };
    },
  };

  class FakeWs extends EventEmitter {
    OPEN = 1;
    readyState = 1;
    sent = [];
    send(value) { this.sent.push(String(value)); }
    close() {
      if (this.readyState !== this.OPEN) return;
      this.readyState = 3;
      this.emit('close');
    }
  }

  const ws = new FakeWs();
  return {
    pty,
    ws,
    writes,
    resizes,
    killed: () => killed,
    emitData(value) { dataHandler?.(value); },
    emitExit() { exitHandler?.(); },
  };
}

test('local PTY wire protocol is release-testable entirely in memory', () => {
  const transport = fakeTransports();
  const session = attachLocalPtySession({
    ws: transport.ws,
    pty: transport.pty,
    shell: '/bin/test-shell',
    cwd: '/tmp/test-project',
    cols: 80,
    rows: 24,
    env: {},
    sessionId: 'local_test',
  });

  assert.equal(session.session_id, 'local_test');
  assert.deepEqual(JSON.parse(transport.ws.sent[0]), {
    type: 'session_id',
    session_id: 'local_test',
  });

  transport.ws.emit('message', Buffer.from(JSON.stringify({ type: 'resize', cols: 120, rows: 40 })));
  transport.ws.emit('message', Buffer.from(JSON.stringify({ type: 'slash', line: '/pwd' })));
  transport.ws.emit('message', Buffer.from('raw input'));

  assert.deepEqual(transport.resizes, [[120, 40]]);
  assert.deepEqual(transport.writes, ['/pwd\r', 'raw input']);

  transport.emitData('terminal output');
  assert.equal(transport.ws.sent.at(-1), 'terminal output');

  transport.ws.close();
  assert.equal(transport.killed(), 1);

  // Cleanup is idempotent even when transport error/close paths race.
  transport.ws.emit('error', new Error('synthetic transport close'));
  session.cleanup();
  assert.equal(transport.killed(), 1);
});

test('local PTY server health check uses an ephemeral local port and no ExecOS tunnel', async () => {
  const transport = fakeTransports();
  const server = await startLocalPtyServer({
    cwd: process.cwd(),
    host: '127.0.0.1',
    port: 0,
    pty: transport.pty,
  });

  try {
    const health = await fetch(server.healthUrl);
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, 'agentsam-local-pty');
    assert.equal(body.port, server.port);
    assert.equal(server.port > 0, true);
  } finally {
    await server.close();
  }

  // No WebSocket session was opened, so the PTY process was never spawned.
  assert.equal(transport.killed(), 0);
});
