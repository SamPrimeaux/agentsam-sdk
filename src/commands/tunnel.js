/**
 * agentsam tunnel — expose local PTY (:3099) to the IAM platform.
 *
 * Default (--quick): cloudflared quick tunnel → register ws_url via SDK API.
 * Named (--named): platform provisions CF named tunnel + DNS; run with --token.
 */
import { spawn, spawnSync } from 'node:child_process';
import { authenticateViaBrowser } from '../lib/auth.js';
import { postJson } from '../lib/core-client.js';

const DEFAULT_PORT = 3099;

function parseArgs(argv) {
  const opts = {
    mode: 'quick',
    port: DEFAULT_PORT,
    tunnelName: '',
    hostname: '',
    zoneId: '',
    platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
    shell: process.platform === 'win32' ? 'powershell' : process.env.SHELL || '/bin/zsh',
    skipAuth: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--quick') opts.mode = 'quick';
    else if (a === '--named') opts.mode = 'named';
    else if (a === '--port') opts.port = Number(argv[++i]) || DEFAULT_PORT;
    else if (a === '--tunnel-name') opts.tunnelName = argv[++i] || '';
    else if (a === '--hostname') opts.hostname = argv[++i] || '';
    else if (a === '--zone-id') opts.zoneId = argv[++i] || '';
    else if (a === '--platform') opts.platform = argv[++i] || opts.platform;
    else if (a === '--shell') opts.shell = argv[++i] || opts.shell;
    else if (a === '--token' && argv[i + 1]) {
      process.env.AGENTSAM_SDK_TOKEN = argv[++i];
    }
  }
  return opts;
}

function ensureCloudflared() {
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], {
    encoding: 'utf8',
  });
  if (which.status !== 0) {
    throw new Error(
      'cloudflared not found. Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
    );
  }
}

async function resolveToken() {
  const existing = String(process.env.AGENTSAM_SDK_TOKEN || '').trim();
  if (existing.startsWith('sdk_')) return existing;
  const session = await authenticateViaBrowser();
  const tok = String(session?.access_token || '').trim();
  if (!tok.startsWith('sdk_')) throw new Error('IAM auth did not return an sdk_ bearer token');
  process.env.AGENTSAM_SDK_TOKEN = tok;
  return tok;
}

async function assertLocalPty(port) {
  const url = `http://127.0.0.1:${port}/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(`health ${res.status}`);
    return true;
  } catch {
    throw new Error(
      `Local PTY not reachable at ${url}. In another terminal run: npx agentsam start-local`,
    );
  }
}

function httpsToWss(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('wss://') || u.startsWith('ws://')) return u.replace(/\/$/, '');
  if (u.startsWith('https://')) return `wss://${u.slice(8)}`.replace(/\/$/, '');
  if (u.startsWith('http://')) return `ws://${u.slice(7)}`.replace(/\/$/, '');
  return `wss://${u.replace(/^\/+/, '')}`.replace(/\/$/, '');
}

/**
 * Parse trycloudflare.com URL from cloudflared stderr/stdout.
 * @param {import('node:child_process').ChildProcessWithoutNullStreams} child
 * @returns {Promise<string>}
 */
function waitForQuickTunnelUrl(child) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for cloudflared quick tunnel URL (60s)'));
    }, 60_000);

    const onData = (chunk) => {
      const text = chunk.toString();
      buf += text;
      process.stderr.write(text);
      const m =
        buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i) ||
        buf.match(/https:\/\/[a-z0-9.-]+\.cfargotunnel\.com/i);
      if (m) {
        clearTimeout(timer);
        child.stdout?.off('data', onData);
        child.stderr?.off('data', onData);
        resolve(m[0]);
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`cloudflared exited early (code ${code})`));
    });
  });
}

async function runQuick(opts, token) {
  await assertLocalPty(opts.port);
  ensureCloudflared();

  console.log(`
  Agent Sam — tunnel (quick)
  Local PTY  http://127.0.0.1:${opts.port}
  Mode       cloudflared quick tunnel → IAM register-local
  `);

  const child = spawn(
    'cloudflared',
    ['tunnel', '--url', `http://127.0.0.1:${opts.port}`, '--no-autoupdate'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const publicUrl = await waitForQuickTunnelUrl(child);
  const wsUrl = httpsToWss(publicUrl);
  console.log(`\n  ✓ Public URL  ${publicUrl}`);
  console.log(`  ✓ Registering  ${wsUrl}\n`);

  const registered = await postJson(
    '/api/sdk/terminal/register-local',
    {
      ws_url: wsUrl,
      platform: opts.platform,
      shell: opts.shell,
    },
    token,
  );

  console.log(`  ✓ IAM local lane active`);
  if (registered?.connection?.id) {
    console.log(`  ✓ connection   ${registered.connection.id}`);
  }
  console.log(`
  Keep this process running. In the dashboard: Terminal → Local.

  Ctrl+C stops the tunnel.
  `);

  await new Promise((resolve) => {
    child.on('exit', resolve);
    process.on('SIGINT', () => {
      child.kill('SIGINT');
    });
    process.on('SIGTERM', () => {
      child.kill('SIGTERM');
    });
  });
}

async function runNamed(opts, token) {
  if (!opts.tunnelName || !opts.hostname || !opts.zoneId) {
    throw new Error(
      'Named mode requires --tunnel-name, --hostname, and --zone-id (from your CF zone).',
    );
  }
  await assertLocalPty(opts.port);
  ensureCloudflared();

  console.log(`
  Agent Sam — tunnel (named)
  Provisioning Cloudflare tunnel ${opts.tunnelName} → ${opts.hostname}
  `);

  const provisioned = await postJson(
    '/api/sdk/terminal/tunnel/provision',
    {
      tunnel_name: opts.tunnelName,
      hostname: opts.hostname,
      zone_id: opts.zoneId,
      port: opts.port,
      platform: opts.platform,
      shell: opts.shell,
    },
    token,
  );

  const runToken = String(provisioned?.run_token || '').trim();
  if (!runToken) throw new Error('Platform did not return a cloudflared run_token');

  console.log(`  ✓ ws_url       ${provisioned.ws_url || `wss://${opts.hostname}`}`);
  console.log(`  ✓ Starting     cloudflared tunnel run --token …\n`);

  const child = spawn('cloudflared', ['tunnel', 'run', '--token', runToken, '--no-autoupdate'], {
    stdio: 'inherit',
  });

  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', resolve);
    process.on('SIGINT', () => child.kill('SIGINT'));
  });
}

/**
 * @param {string[]} [argv]
 */
export async function runTunnel(argv = []) {
  const opts = parseArgs(argv);
  const token = await resolveToken();

  if (opts.mode === 'named') {
    await runNamed(opts, token);
  } else {
    await runQuick(opts, token);
  }
}
