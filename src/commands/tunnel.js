/**
 * agentsam tunnel — guided access to Cloudflare's real Wrangler tunnel lifecycle.
 *
 * AgentSam does not provision a parallel tunnel system. Wrangler owns tunnel
 * discovery, creation, inspection, and connector execution.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { confirm, isCancel, select, text } from '@clack/prompts';
import { runWranglerNative } from '../cloudflare/index.js';

const DEFAULT_QUICK_URL = 'http://127.0.0.1:3099';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function stripAnsi(value = '') {
  return String(value).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
}

export function parseWranglerTunnelList(value = '') {
  const rows = [];
  for (const rawLine of stripAnsi(value).split(/\r?\n/)) {
    const match = rawLine.match(UUID_RE);
    if (!match) continue;
    const id = match[0];
    const suffix = rawLine
      .slice((match.index || 0) + id.length)
      .replace(/[│|]/g, ' ')
      .trim();
    const columns = suffix.split(/\s{2,}/).map((item) => item.trim()).filter(Boolean);
    rows.push({
      id,
      name: columns[0] || id,
      status: columns[1] || 'unknown',
      created_at: columns[2] || null,
      tunnel_type: columns[3] || null,
    });
  }
  return rows;
}

function npxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function runInteractiveWrangler(args, options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  return new Promise((resolve, reject) => {
    const child = spawn(npxCommand(), ['--yes', 'wrangler', 'tunnel', ...args], {
      cwd,
      stdio: 'inherit',
      env: options.env || process.env,
      shell: process.platform === 'win32',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`wrangler tunnel stopped by ${signal}`));
      else if (code === 0) resolve(0);
      else reject(new Error(`wrangler tunnel ${args[0] || ''} exited ${code ?? 1}`));
    });
  });
}

async function readTunnelList(options = {}) {
  const result = await (options.runWrangler || runWranglerNative)(
    'tunnel.list',
    { cwd: options.cwd || process.cwd() },
    options,
  );
  const raw = String(result?.stdout || '');
  return { raw, rows: parseWranglerTunnelList(raw) };
}

async function printTunnelInfo(tunnel, options = {}) {
  const write = options.write || ((value) => process.stdout.write(value));
  const result = await (options.runWrangler || runWranglerNative)(
    'tunnel.info',
    { cwd: options.cwd || process.cwd(), tunnel },
    options,
  );
  write(String(result?.stdout || '').trimEnd() + '\n');
  return result;
}

async function chooseExistingTunnel(options = {}) {
  const { raw, rows } = await readTunnelList(options);
  const write = options.write || ((value) => process.stdout.write(value));

  if (!rows.length) {
    if (raw.trim()) write(raw.endsWith('\n') ? raw : raw + '\n');
    return null;
  }

  const choice = await select({
    message: 'Cloudflare Tunnel',
    options: [
      ...rows.map((row) => ({
        value: row.id,
        label: row.name,
        hint: `${row.status} · ${row.id.slice(0, 8)}`,
      })),
      { value: '__raw__', label: 'Show Wrangler tunnel list', hint: 'print Cloudflare CLI output' },
      { value: '__create__', label: 'Create a new tunnel', hint: 'Wrangler-managed remote tunnel' },
      { value: '__quick__', label: 'Quick tunnel', hint: 'temporary trycloudflare.com URL' },
      { value: '__back__', label: 'Back' },
    ],
  });

  if (isCancel(choice) || choice === '__back__') return null;
  if (choice === '__raw__') {
    write(raw.endsWith('\n') ? raw : raw + '\n');
    return null;
  }
  if (choice === '__create__' || choice === '__quick__') return { action: choice.slice(2, -2) };
  return rows.find((row) => row.id === choice) || null;
}

async function guidedTunnel(options = {}) {
  const interactive = options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const write = options.write || ((value) => process.stdout.write(value));

  if (!interactive) {
    const { raw } = await readTunnelList(options);
    write(raw.endsWith('\n') ? raw : raw + '\n');
    return;
  }

  const selected = await chooseExistingTunnel(options);
  if (!selected) return;

  if (selected.action === 'create') {
    const name = await text({
      message: 'New Cloudflare Tunnel name',
      placeholder: 'my-machine',
      validate(value) {
        if (!String(value || '').trim()) return 'Tunnel name is required';
      },
    });
    if (isCancel(name)) return;
    const approved = await confirm({
      message: `Create Cloudflare Tunnel "${String(name).trim()}" in your account?`,
      initialValue: false,
    });
    if (isCancel(approved) || approved !== true) return;
    await runInteractiveWrangler(['create', String(name).trim()], options);
    return;
  }

  if (selected.action === 'quick') {
    const url = await text({
      message: 'Local URL to expose temporarily',
      defaultValue: DEFAULT_QUICK_URL,
      placeholder: DEFAULT_QUICK_URL,
    });
    if (isCancel(url)) return;
    await runInteractiveWrangler(['quick-start', String(url || DEFAULT_QUICK_URL).trim()], options);
    return;
  }

  const action = await select({
    message: `${selected.name} · ${selected.status}`,
    options: [
      { value: 'info', label: 'Inspect tunnel', hint: 'wrangler tunnel info' },
      {
        value: 'run',
        label: 'Run connector on this machine',
        hint: 'wrangler tunnel run · persistent until Ctrl+C',
      },
      { value: 'back', label: 'Back' },
    ],
  });
  if (isCancel(action) || action === 'back') return;
  if (action === 'info') {
    await printTunnelInfo(selected.id, options);
    return;
  }

  const approved = await confirm({
    message: `Run ${selected.name} on this machine? This starts/adds a live connector until Ctrl+C.`,
    initialValue: false,
  });
  if (isCancel(approved) || approved !== true) return;
  await runInteractiveWrangler(['run', selected.id], options);
}

const HELP = `Agent Sam · Cloudflare Tunnel

  agentsam tunnel
      Guided picker over your real Cloudflare tunnels.

  agentsam tunnel list
      Run Wrangler's tunnel list.

  agentsam tunnel info <name-or-id>
      Inspect one tunnel through Wrangler.

  agentsam tunnel run <name-or-id>
      Start that tunnel's connector on this machine. Ctrl+C stops it.

  agentsam tunnel create <name>
      Create a remotely managed Cloudflare Tunnel through Wrangler.

  agentsam tunnel quick-start [url]
      Start a temporary Quick Tunnel. Default: ${DEFAULT_QUICK_URL}

AgentSam delegates tunnel lifecycle to Wrangler; it does not mint a parallel
named-tunnel system or copy tunnel credentials into project configuration.
`;

export async function runTunnel(argv = [], options = {}) {
  const args = [...argv];
  const write = options.write || ((value) => process.stdout.write(value));
  const subcommand = args[0] || '';

  if (subcommand === '--help' || subcommand === '-h' || subcommand === 'help') {
    write(HELP);
    return;
  }

  // Compatibility: old quick mode now delegates to Wrangler Quick Tunnel.
  if (subcommand === '--quick') {
    await runInteractiveWrangler(['quick-start', DEFAULT_QUICK_URL], options);
    return;
  }
  if (subcommand === '--named') {
    throw new Error('legacy --named provisioning was removed; run `agentsam tunnel` and select an existing Cloudflare Tunnel, or use `agentsam tunnel run <name-or-id>`');
  }

  if (!subcommand) {
    await guidedTunnel(options);
    return;
  }

  if (subcommand === 'list') {
    const { raw } = await readTunnelList(options);
    write(raw.endsWith('\n') ? raw : raw + '\n');
    return;
  }

  if (subcommand === 'info') {
    const tunnel = String(args[1] || '').trim();
    if (!tunnel) throw new Error('Usage: agentsam tunnel info <name-or-id>');
    await printTunnelInfo(tunnel, options);
    return;
  }

  if (subcommand === 'run') {
    const tunnel = String(args[1] || '').trim();
    if (!tunnel) throw new Error('Usage: agentsam tunnel run <name-or-id>');
    await runInteractiveWrangler(['run', tunnel], options);
    return;
  }

  if (subcommand === 'create') {
    const name = String(args[1] || '').trim();
    if (!name) throw new Error('Usage: agentsam tunnel create <name>');
    await runInteractiveWrangler(['create', name], options);
    return;
  }

  if (subcommand === 'quick-start') {
    await runInteractiveWrangler(['quick-start', String(args[1] || DEFAULT_QUICK_URL)], options);
    return;
  }

  throw new Error(`unknown tunnel option: ${subcommand}\n\n${HELP}`);
}
