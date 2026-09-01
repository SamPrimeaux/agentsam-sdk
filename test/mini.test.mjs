import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createMini, MINI_TEMPLATES, startMiniPreview } from '../src/lib/mini/index.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-mini-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function request(url, pathname, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url + pathname, { method, headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('all mini starters are portable files; existing projects are never overwritten', (t) => {
  const cwd = fixture(t);
  for (const template of Object.keys(MINI_TEMPLATES)) {
    const { root } = createMini({ name: template, template, cwd });
    const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    assert.ok(html.includes('<title>' + template));
    assert.ok(!html.includes('{{NAME}}'));
    execFileSync(process.execPath, ['--check', path.join(root, 'public/app.js')]);
    assert.ok(fs.existsSync(path.join(root, 'public/style.css')));
    assert.ok(!fs.existsSync(path.join(root, 'node_modules')));
    assert.ok(!fs.existsSync(path.join(root, 'package.json')));
    assert.throws(() => createMini({ name: template, template, cwd }), /EEXIST/);
    assert.equal(fs.readFileSync(path.join(root, 'public/index.html'), 'utf8'), html);
  }
  assert.throws(() => createMini({ name: '../escape', cwd }), /name/);
  assert.throws(() => createMini({ name: 'bad', template: 'constructor', cwd }), /Unknown template/);
  assert.ok(!fs.existsSync(path.join(cwd, 'bad')));
});

test('preview reflects edits and protects files outside public/', async (t) => {
  const cwd = fixture(t);
  const { root } = createMini({ name: 'preview-test', cwd });
  fs.writeFileSync(path.join(root, 'secret.txt'), 'private-project-file');
  fs.writeFileSync(path.join(root, 'public/.env'), 'private-dotfile');
  fs.writeFileSync(path.join(root, 'public/.secret.txt'), 'private-dotfile');
  fs.symlinkSync(path.join(root, 'public/.secret.txt'), path.join(root, 'public/alias.txt'));
  fs.symlinkSync(path.join(root, 'secret.txt'), path.join(root, 'public/linked.txt'));
  const preview = await startMiniPreview({ root, timeoutSeconds: 30 });
  t.after(() => preview.stop());
  const home = await request(preview.url, '/');
  assert.equal(home.status, 200);
  assert.match(home.body, /focus timer/i);
  assert.equal(home.headers['cache-control'], 'no-store');
  assert.equal((await request(preview.url, '/app.js')).status, 200);
  assert.equal((await request(preview.url, '/', { method: 'HEAD' })).body, '');
  assert.equal((await request(preview.url, '/', { method: 'POST' })).status, 405);
  for (const target of ['/mini.json', '/secret.txt', '/.env', '/%2eenv', '/linked.txt', '/alias.txt', '/%2e%2e/secret.txt', '/missing', '/%5csecret.txt']) {
    assert.equal((await request(preview.url, target)).status, 404, target);
  }
  assert.equal((await request(preview.url, '/%ZZ')).status, 400);
  assert.equal((await request(preview.url, '/', { headers: { Host: 'example.com' } })).status, 403);
  assert.equal((await request(preview.url, '/', { headers: { Origin: 'https://example.com' } })).status, 403);
  fs.writeFileSync(path.join(root, 'public/index.html'), '<h1>Edited locally</h1>');
  assert.equal((await request(preview.url, '/')).body, '<h1>Edited locally</h1>');
  await preview.stop();
  await assert.rejects(request(preview.url, '/'));
  assert.ok(fs.existsSync(root));
});

test('preview refuses a public directory that points outside the project', async (t) => {
  const cwd = fixture(t);
  const { root } = createMini({ name: 'symlink-test', cwd });
  fs.rmSync(path.join(root, 'public'), { recursive: true });
  fs.symlinkSync(cwd, path.join(root, 'public'), 'dir');
  await assert.rejects(startMiniPreview({ root }), /public\/ must be inside/);
});

test('timeout shuts the listener and open connections, retaining files', async (t) => {
  const cwd = fixture(t);
  const { root } = createMini({ name: 'timeout-test', cwd });
  const preview = await startMiniPreview({ root, timeoutSeconds: 1 });
  t.after(() => preview.stop());
  const socket = net.connect(Number(new URL(preview.url).port), '127.0.0.1');
  t.after(() => socket.destroy());
  const socketClosed = once(socket, 'close');
  await once(socket, 'connect');
  assert.equal(await preview.closed, 'timeout');
  await socketClosed;
  await preview.stop();
  await assert.rejects(request(preview.url, '/'));
  assert.ok(fs.existsSync(path.join(root, 'mini.json')));
});

test('CLI write-only exits, and invalid inputs create no project', (t) => {
  const cwd = fixture(t);
  const output = execFileSync(process.execPath, [cli, 'mini', 'files-only', '--write-only'], { cwd, encoding: 'utf8', timeout: 5000 });
  assert.match(output, /Files only/);
  assert.doesNotMatch(output, /Auto-stop in/);
  assert.ok(fs.existsSync(path.join(cwd, 'files-only/mini.json')));
  for (const args of [['bad', '--timeout', '0'], ['bad', '--port', '65536'], ['bad', '--typo'], ['bad', '--template'], ['bad', '--open', '--write-only']]) {
    assert.throws(() => execFileSync(process.execPath, [cli, 'mini', ...args], { cwd, stdio: 'pipe', timeout: 5000 }));
    assert.ok(!fs.existsSync(path.join(cwd, 'bad')));
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`CLI ${signal} closes preview without deleting the mini`, { timeout: 10000 }, async (t) => {
    const cwd = fixture(t);
    const { root } = createMini({ name: 'signal-test', cwd });
    const child = spawn(process.execPath, [cli, 'mini', 'preview', root, '--timeout', '30'], { stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
    const exited = once(child, 'exit');
    const url = await new Promise((resolve, reject) => {
      let output = '';
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Preview exited before printing its URL')));
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/Preview: (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) resolve(match[1]);
      });
    });
    assert.equal((await request(url, '/')).status, 200);
    child.kill(signal);
    const [code] = await exited;
    assert.equal(code, 0);
    await assert.rejects(request(url, '/'));
    assert.ok(fs.existsSync(path.join(root, 'public/index.html')));
  });
}
