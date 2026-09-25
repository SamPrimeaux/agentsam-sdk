import { spawnSync } from 'node:child_process';
import { probeGoDeploymentWithRetry } from './cloudflare.js';

function runDocker(args, { productRoot, spawn = spawnSync } = {}) {
  const res = spawn('docker', args, {
    cwd: productRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    output: ((res.stdout || '') + '\n' + (res.stderr || '')).trim(),
  };
}

export async function verifyGoContainer({
  productRoot,
  product = 'agentsam-go-worker',
  expectedSourceCommit,
  spawn = spawnSync,
  fetchImpl = globalThis.fetch,
} = {}) {
  const tag = product + ':agentsam-verify';
  const build = runDocker(['build', '--platform', 'linux/amd64', '-t', tag, '.'], { productRoot, spawn });
  if (build.status !== 0) {
    const err = new Error('go_container_build_failed');
    err.detail = build.output.slice(-4000);
    throw err;
  }

  const inspected = runDocker(['image', 'inspect', tag], { productRoot, spawn });
  if (inspected.status !== 0) throw new Error('go_container_inspect_failed');
  let image = null;
  try { image = JSON.parse(inspected.stdout)?.[0] || null; } catch {}
  if (!image) throw new Error('go_container_inspect_invalid');
  if (image.Architecture !== 'amd64') throw new Error('go_container_architecture_invalid');
  const imageUser = String(image.Config?.User || '');
  if (!imageUser || imageUser === '0' || imageUser === 'root' || imageUser.startsWith('0:')) {
    throw new Error('go_container_root_user_forbidden');
  }

  const name = product + '-verify-' + process.pid + '-' + Date.now();
  const start = runDocker([
    'run', '-d', '--name', name,
    '-p', '127.0.0.1::8080',
    '-e', 'AGENTSAM_TARGET=container',
    tag,
  ], { productRoot, spawn });
  if (start.status !== 0) {
    const err = new Error('go_container_start_failed');
    err.detail = start.output.slice(-3000);
    throw err;
  }

  const containerId = start.stdout.trim();
  let stopped = false;
  let cleaned = false;
  try {
    let port = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const mapped = runDocker(['port', containerId, '8080/tcp'], { productRoot, spawn });
      const match = mapped.stdout.match(/:(\d+)\s*$/m);
      if (mapped.status === 0 && match) {
        port = Number(match[1]);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!port) throw new Error('go_container_port_missing');

    const origin = 'http://127.0.0.1:' + port;
    const probe = await probeGoDeploymentWithRetry(origin, {
      fetchImpl,
      expectedSourceCommit,
      expectedTarget: 'container',
      edge: false,
      attempts: 20,
      delayMs: 250,
    });
    if (!probe.ok) {
      const err = new Error('go_container_probe_failed');
      err.detail = probe;
      throw err;
    }

    const stop = runDocker(['stop', '-t', '5', containerId], { productRoot, spawn });
    stopped = stop.status === 0;
    if (!stopped) throw new Error('go_container_stop_failed');
    const cleanup = runDocker(['container', 'rm', containerId], { productRoot, spawn });
    cleaned = cleanup.status === 0;
    if (!cleaned) throw new Error('go_container_cleanup_failed');

    return {
      ok: true,
      tag,
      name,
      image_digest: image.Id || null,
      architecture: image.Architecture,
      os: image.Os || null,
      user: imageUser,
      container_id: containerId,
      clean_shutdown: true,
      probe,
      retained_stopped_container: true,
      build_output: build.output.slice(-2000),
    };
  } finally {
    if (!stopped) runDocker(['stop', '-t', '1', containerId], { productRoot, spawn });
  }
}
