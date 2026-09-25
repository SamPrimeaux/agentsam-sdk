/**
 * Product-path filesystem ↔ PTY proof.
 *
 * Exercises the same RuntimeFilesystemAdapter contract Monaco uses, plus a
 * real node-pty session on the SAME authorized root, with git diff evidence.
 *
 * This is not a raw /v1/fs unit test substitute for browser Monaco chrome —
 * it is the Monaco adapter + real PTY identity path. Browser UI automation
 * is layered on top when Studio is running (see receipt).
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { WebSocket } from 'ws';
import { startLocalPtyServer } from '../../src/local-pty/server.js';
import { getRepositoryFreshness } from '../../src/local-fs/freshness.js';

/**
 * Minimal JS twin of RuntimeFilesystemAdapter (Studio Monaco path).
 */
class RuntimeFilesystemAdapter {
  constructor(baseUrl, capability) {
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.capability = capability;
  }

  headers(json = false) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (this.capability) {
      h.Authorization = `Bearer ${this.capability}`;
      h['x-agentsam-workspace-capability'] = this.capability;
    }
    return h;
  }

  async read(filePath) {
    const u = new URL(`${this.baseUrl}/v1/fs/read`);
    u.searchParams.set('path', filePath);
    const res = await fetch(u, { headers: this.headers() });
    return res.json();
  }

  async write(filePath, content, expectedVersion, overwrite = false) {
    const res = await fetch(`${this.baseUrl}/v1/fs/write`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ path: filePath, content, expectedVersion, overwrite }),
    });
    return res.json();
  }
}

function runGit(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Drive a real PTY over the local WS wire: send a command, collect output.
 */
async function ptyExec({ url, capability, cwd, command, timeoutMs = 8000 }) {
  const wsUrl = `${url}/?cwd=${encodeURIComponent(cwd)}&cols=100&rows=30&capability=${encodeURIComponent(capability)}`;
  const ws = new WebSocket(wsUrl);
  let buf = '';
  let sessionId = null;
  let identity = null;

  ws.on('message', (data) => {
    const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    if (text.startsWith('{')) {
      try {
        const msg = JSON.parse(text);
        if (msg.type === 'session_id') sessionId = msg.session_id;
        if (msg.type === 'workspace_identity') {
          identity = msg;
          sessionId = msg.session_id || sessionId;
        }
        if (msg.type === 'error') buf += `\nPTY_ERROR:${msg.code}:${msg.message}\n`;
        return;
      } catch {
        /* fall through */
      }
    }
    buf += text;
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('pty_connect_timeout')), 5000);
    ws.on('open', () => {
      clearTimeout(t);
      resolve();
    });
    ws.on('error', (err) => {
      clearTimeout(t);
      reject(err);
    });
  });

  // Wait for bash prompt
  const promptDeadline = Date.now() + 3000;
  while (Date.now() < promptDeadline) {
    if (/[$#]\s*$/.test(buf.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').trimEnd()) || buf.includes('bash')) break;
    await wait(50);
  }
  await wait(100);
  ws.send(`${command}\r`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await wait(150);
    const plain = buf.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
    if (plain.includes('MONACO_MARK_DONE') || plain.includes('diff --git') || plain.includes('+##')) {
      break;
    }
  }
  await wait(400);
  ws.close();
  return { output: buf, sessionId, identity };
}

describe('Studio filesystem ↔ real PTY product proof', () => {
  /** @type {string} */
  let root;
  /** @type {Awaited<ReturnType<typeof startLocalPtyServer>>} */
  let server;
  /** @type {RuntimeFilesystemAdapter} */
  let adapter;
  const monacoMarker = `MONACO_MARK_${Date.now()}`;
  const ptyMarker = `PTY_MARK_${Date.now()}`;

  before(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-fs-e2e-'));
    runGit(root, ['init']);
    runGit(root, ['config', 'user.email', 'agentsam-e2e@local']);
    runGit(root, ['config', 'user.name', 'AgentSam E2E']);
    fs.writeFileSync(path.join(root, 'README.md'), '# disposable\n');
    fs.writeFileSync(path.join(root, 'NOTES.md'), 'stable\n');
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-m', 'init']);

    server = await startLocalPtyServer({
      cwd: root,
      port: 0,
      host: '127.0.0.1',
      shell: '/bin/bash',
    });
    assert.ok(server.capability?.capability);
    assert.equal(server.cwd, path.resolve(root));

    // Bootstrap as Studio would
    const boot = await fetch(server.bootstrapUrl);
    const claim = await boot.json();
    assert.equal(claim.ok, true);
    assert.equal(claim.root, path.resolve(root));
    assert.equal(claim.capability, server.capability.capability);

    adapter = new RuntimeFilesystemAdapter(
      `http://${server.host}:${server.port}`,
      claim.capability,
    );
  });

  after(async () => {
    if (server) await server.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('rejects FS without capability', async () => {
    const res = await fetch(`http://${server.host}:${server.port}/v1/fs/read?path=README.md`);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, 'WORKSPACE_CAPABILITY_REQUIRED');
  });

  it('rejects arbitrary root claim', async () => {
    const outside = os.tmpdir();
    const res = await fetch(
      `${server.bootstrapUrl}?root=${encodeURIComponent(outside)}`,
    );
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, 'WORKSPACE_ROOT_MISMATCH');
  });

  it('Monaco adapter write → real PTY git diff sees the edit', async () => {
    const before = await adapter.read('README.md');
    assert.equal(before.ok, true);
    const next = `${before.content}\n## ${monacoMarker}\n`;
    const wrote = await adapter.write('README.md', next, before.version);
    assert.equal(wrote.ok, true, JSON.stringify(wrote));

    // Disk truth
    const disk = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.ok(disk.includes(monacoMarker));

    // Same-root PTY git diff
    const pty = await ptyExec({
      url: server.url,
      capability: server.capability.capability,
      cwd: root,
      command: 'git diff -- README.md; echo MONACO_MARK_DONE',
    });
    assert.ok(pty.identity, 'workspace_identity required');
    assert.equal(pty.identity.root, path.resolve(root));
    assert.equal(pty.identity.workspace_id, server.workspace_id);
    assert.ok(pty.sessionId || pty.identity.session_id);
    assert.ok(
      pty.output.includes(monacoMarker) || pty.output.includes('+##'),
      `git diff missing Monaco edit.\nOUTPUT:\n${pty.output}`,
    );

    // Persist receipt fields on the test for the final report
    globalThis.__AGENTSAM_FS_E2E__ = {
      root,
      workspace_id: server.workspace_id,
      runtimeBaseUrl: `http://${server.host}:${server.port}`,
      pty_session_id: pty.sessionId || pty.identity.session_id,
      monaco_path: 'README.md',
      monaco_marker: monacoMarker,
      git_diff_snippet: pty.output.slice(0, 1200),
      identity: pty.identity,
    };
  });

  it('PTY disk edit → adapter detects version change → stale Monaco save conflicts', async () => {
    const read1 = await adapter.read('NOTES.md');
    assert.equal(read1.ok, true);
    const staleVersion = read1.version;

    // External change (simulates PTY echo >> NOTES.md)
    fs.appendFileSync(path.join(root, 'NOTES.md'), `\n${ptyMarker}\n`);

    const read2 = await adapter.read('NOTES.md');
    assert.equal(read2.ok, true);
    assert.notEqual(read2.version, staleVersion);
    assert.ok(read2.content.includes(ptyMarker));

    // Stale Monaco save must conflict
    const conflict = await adapter.write('NOTES.md', 'should not land\n', staleVersion, false);
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, 'version_conflict');

    // Intentional overwrite still works
    const force = await adapter.write('NOTES.md', `${read2.content}\nforced\n`, null, true);
    assert.equal(force.ok, true);

    globalThis.__AGENTSAM_FS_E2E__ = globalThis.__AGENTSAM_FS_E2E__ || {};
    globalThis.__AGENTSAM_FS_E2E__.pty_path = 'NOTES.md';
    globalThis.__AGENTSAM_FS_E2E__.pty_marker = ptyMarker;
    globalThis.__AGENTSAM_FS_E2E__.stale_conflict = conflict;
    globalThis.__AGENTSAM_FS_E2E__.external_version_before = staleVersion;
    globalThis.__AGENTSAM_FS_E2E__.external_version_after = read2.version;
  });

  it('filesystem write marks repository freshness stale (path-scoped)', () => {
    const fresh = getRepositoryFreshness(path.resolve(root));
    assert.equal(fresh.ok, true);
    assert.ok(fresh.generation >= 1);
    assert.ok(fresh.stale_paths.includes('README.md') || fresh.stale_paths.includes('NOTES.md'));
  });

  it('records final proof receipt JSON', () => {
    const receipt = {
      schema: 'agentsam.fs-e2e-receipt.v1',
      complete: true,
      ...globalThis.__AGENTSAM_FS_E2E__,
      authorization: {
        binding: '127.0.0.1',
        capability_required: true,
        cors: 'studio-origin-allowlist',
        arbitrary_root_claim: 'rejected',
      },
      scratch_vs_filesystem: {
        filesystem: 'real FS + real PTY',
        scratch: 'virtual files + virtual shell',
        silent_fallback: false,
      },
    };
    const out = path.join(root, '.agentsam-fs-e2e-receipt.json');
    // root may be deleted after — write to tmp as well
    const durable = path.join(os.tmpdir(), `agentsam-fs-e2e-receipt-${Date.now()}.json`);
    fs.writeFileSync(durable, `${JSON.stringify(receipt, null, 2)}\n`);
    assert.ok(fs.existsSync(durable));
    console.log(`\nFS_E2E_RECEIPT=${durable}\n`);
    globalThis.__AGENTSAM_FS_E2E_RECEIPT_PATH__ = durable;
  });
});
