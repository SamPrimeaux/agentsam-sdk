import { spawn } from 'node:child_process';
import net from 'node:net';

const binary = process.argv[2];
const expectedCommit = process.argv[3] || '';
const expectedHash = '2e60bba13dc2bc37d75dd2ce5deb25466f19cb2994e20889388948879875eae9';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.unref();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const value = server.address().port;
    server.close(() => resolve(value));
  });
});

const child = spawn(binary, [], {
  env: { ...process.env, PORT: String(port), AGENTSAM_TARGET: 'local' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (chunk) => { stderr += String(chunk); });
const base = 'http://127.0.0.1:' + port;
const results = {};

async function request(name, pathname, init = {}) {
  const res = await fetch(base + pathname, init);
  let body = null;
  try { body = await res.json(); } catch {}
  results[name] = { status: res.status, ok: res.ok, body };
  return results[name];
}

let ready = false;
for (let attempt = 0; attempt < 100 && child.exitCode == null; attempt += 1) {
  try {
    const health = await request('health', '/health', { headers: { Accept: 'application/json' } });
    if (health.ok) { ready = true; break; }
  } catch {}
  await sleep(50);
}

let error = null;
if (!ready) {
  error = 'runtime_not_ready';
} else {
  try {
    await request('runtime', '/v1/runtime');
    await request('capabilities', '/v1/capabilities');
    await request('hash', '/v1/hash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'agentsam', algorithm: 'sha256' }),
    });
    await request('inspect', '/v1/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [{ path: 'demo.css', content: '.button { color: #2563eb; }' }] }),
    });
    await request('malformed', '/v1/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ not_files: true }),
    });
  } catch (cause) {
    error = cause.message;
  }
}

const health = results.health?.body;
const runtime = results.runtime?.body;
const capabilities = results.capabilities?.body;
const malformed = results.malformed?.body;
const checks = {
  health: results.health?.status === 200 && health?.ok === true && health?.target === 'local',
  source_commit: Boolean(expectedCommit) && health?.build?.commit === expectedCommit,
  runtime: results.runtime?.status === 200 && runtime?.schema === 'agentsam.go-runtime.v1',
  capabilities: results.capabilities?.status === 200
    && capabilities?.schema === 'agentsam.go-capabilities.v1'
    && ['hash', 'inspect', 'runtime', 'capabilities'].every((name) => capabilities?.capabilities?.includes(name)),
  hash: results.hash?.status === 200 && results.hash?.body?.hash === expectedHash,
  inspect: results.inspect?.status === 200
    && results.inspect?.body?.findings?.some((finding) => finding.kind === 'hardcoded_color' && finding.value === '#2563eb'),
  error_envelope: results.malformed?.status === 400
    && malformed?.ok === false
    && malformed?.schema_version === 1
    && malformed?.reason === 'input_invalid'
    && malformed?.code === 'INVALID_ARGUMENT',
};

child.kill('SIGTERM');
const exit = await new Promise((resolve) => {
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    resolve({ code: child.exitCode, signal: 'SIGKILL', timeout: true });
  }, 5000);
  child.once('exit', (code, signal) => {
    clearTimeout(timer);
    resolve({ code, signal, timeout: false });
  });
});
checks.clean_shutdown = exit.code === 0 && !exit.timeout;

const ok = !error && Object.values(checks).every(Boolean);
process.stdout.write(JSON.stringify({
  ok,
  origin: base,
  checks,
  results,
  exit,
  stderr: stderr.slice(-2000),
  error,
}));
process.exit(ok ? 0 : 1);
