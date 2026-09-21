import fs from 'node:fs';
import path from 'node:path';
import { AGENTSAM_MCP_PLUGIN_MANIFEST, normalizePluginKey } from '../plugins/index.js';
import { authenticateViaBrowser } from '../lib/auth.js';
import { promptToOpenUrl } from '../lib/open-url.js';
import { readAccountSession, resolveAccountApiKey, saveAccountSession } from '../lib/account-session.js';

const CATALOG = Object.freeze({ 'agentsam-mcp': AGENTSAM_MCP_PLUGIN_MANIFEST });
const PLUGIN_MIGRATION = '0001_agentsam_plugin_runtime.sql';

function statePath(cwd) { return path.join(path.resolve(cwd), '.agentsam', 'plugins.json'); }
function readState(cwd) {
  const filename = statePath(cwd);
  if (!fs.existsSync(filename)) return { schema_version: 1, plugins: {} };
  const parsed = JSON.parse(fs.readFileSync(filename, 'utf8'));
  return { schema_version: 1, plugins: parsed?.plugins || {} };
}

function installMigration(cwd) {
  const source = new URL(`../../migrations/d1/${PLUGIN_MIGRATION}`, import.meta.url);
  const migrationsDir = path.join(path.resolve(cwd), 'migrations', 'd1');
  const destination = path.join(migrationsDir, PLUGIN_MIGRATION);
  fs.mkdirSync(migrationsDir, { recursive: true });
  if (!fs.existsSync(destination)) fs.copyFileSync(source, destination);
  return path.relative(path.resolve(cwd), destination);
}
function parse(argv) {
  const out = {
    action: argv[0] || 'list', key: '', cwd: process.cwd(), json: false,
    origin: process.env.AGENTSAM_ORIGIN || process.env.AGENTSAM_API_ORIGIN || 'https://agentsam.inneranimalmedia.com',
    timeoutMs: 180_000, noOpen: false,
  };
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--cwd') out.cwd = argv[++i] || out.cwd;
    else if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--origin') out.origin = argv[++i] || out.origin;
    else if (argv[i] === '--timeout') out.timeoutMs = Math.max(1_000, Number(argv[++i]) || out.timeoutMs);
    else if (argv[i] === '--no-open') out.noOpen = true;
    else if (!out.key) out.key = argv[i];
    else throw new Error(`unknown plugins option:${argv[i]}`);
  }
  return out;
}

function writeJson(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

async function resolveCliBearer(opts) {
  const apiKey = resolveAccountApiKey();
  if (apiKey.value) return { token: apiKey.value, source: apiKey.source };
  let session = readAccountSession();
  if (!session?.access_token) {
    if (opts.json) writeJson({ ok: false, step: 'account_login_required' });
    else console.log('\n  No AgentSam account session found. Opening account sign-in first.\n');
    session = await authenticateViaBrowser();
    if (!readAccountSession()) saveAccountSession(session);
  }
  if (!session?.access_token) throw new Error('account_login_did_not_return_access_token');
  return { token: session.access_token, source: 'agentsam_browser_oauth' };
}

async function fetchConnector(opts, token, pathname, init = {}) {
  const origin = String(opts.origin).replace(/\/$/, '');
  const headers = new Headers(init.headers || {});
  headers.set('accept', 'application/json');
  headers.set('authorization', `Bearer ${token}`);
  return fetch(`${origin}${pathname}`, { ...init, headers });
}

async function connectPlugin(opts, key) {
  if (key !== 'agentsam-mcp') throw new Error(`plugin_connect_not_supported:${key}`);
  const state = readState(opts.cwd);
  if (!state.plugins[key]) {
    state.plugins[key] = { plugin_key: key, installed_at: new Date().toISOString(), manifest: CATALOG[key] };
    fs.mkdirSync(path.dirname(statePath(opts.cwd)), { recursive: true, mode: 0o700 });
    fs.writeFileSync(statePath(opts.cwd), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    installMigration(opts.cwd);
    if (!opts.json) console.log(`\n  Installed @${key}.`);
  }

  const { token } = await resolveCliBearer(opts);
  const start = await fetchConnector(opts, token, '/api/connections/cloudflare/start');
  const startBody = await start.json().catch(() => ({}));
  if (!start.ok || !startBody.authorize_url) {
    throw new Error(`plugin_connect_start_failed:${startBody.error || start.status}`);
  }

  if (!opts.json) {
    console.log('\n  Connect @agentsam-mcp to Cloudflare');
    console.log('  Your browser will ask you to approve the requested Cloudflare access.');
  }
  if (opts.noOpen) {
    process.stdout.write(`${startBody.authorize_url}\n`);
  } else {
    await promptToOpenUrl(startBody.authorize_url, {
      heading: 'Open Cloudflare authorization:',
      prompt: 'Press ENTER to open Cloudflare in your browser, or copy the URL above.',
    });
  }

  const started = Date.now();
  let statusBody = {};
  while (Date.now() - started < opts.timeoutMs) {
    const status = await fetchConnector(opts, token, '/api/connections/cloudflare');
    statusBody = await status.json().catch(() => ({}));
    if (statusBody?.status === 'connected' || statusBody?.connection?.status === 'connected') break;
    if (!opts.json) process.stdout.write('.');
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  const connected = statusBody?.status === 'connected' || statusBody?.connection?.status === 'connected';
  const result = {
    ok: connected,
    action: 'connect',
    plugin_key: key,
    provider: 'cloudflare',
    status: connected ? 'connected' : (statusBody?.status || 'pending'),
    cloudflare_account_id: statusBody?.cloudflareAccountId
      || statusBody?.connection?.cloudflareAccountId
      || statusBody?.connection?.cloudflare_account_id
      || null,
    scopes: statusBody?.scopes || statusBody?.connection?.scopes || [],
  };
  if (opts.json) writeJson(result);
  else console.log(connected ? `\n\n  ✓ Connected @${key}\n` : `\n\n  Authorization is still pending. Run \'agentsam plugins status @${key}\' to check again.\n`);
  return result;
}

async function statusPlugin(opts, key) {
  if (key !== 'agentsam-mcp') throw new Error(`unknown_plugin:${key}`);
  const { token } = await resolveCliBearer(opts);
  const response = await fetchConnector(opts, token, '/api/connections/cloudflare');
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`plugin_status_failed:${body.error || response.status}`);
  const result = { ok: true, plugin_key: key, provider: 'cloudflare', ...body };
  if (opts.json) writeJson(result);
  else console.log(`\n  ${result.status === 'connected' ? '✓' : '○'} @${key}  ${result.status || 'not_configured'}\n`);
  return result;
}

export async function runPlugins(argv = []) {
  const opts = parse(argv);
  if (opts.action === 'list') {
    const state = readState(opts.cwd);
    const rows = Object.values(CATALOG).map((manifest) => ({
      plugin_key: manifest.plugin_key,
      display_name: manifest.display_name,
      description: manifest.description,
      installed: Boolean(state.plugins[manifest.plugin_key]),
      tools: manifest.tools.map((tool) => tool.tool_key),
    }));
    if (opts.json) process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    else for (const row of rows) console.log(`  ${row.installed ? '✓' : '○'} @${row.plugin_key.padEnd(16)} ${row.description}`);
    return rows;
  }
  const key = normalizePluginKey(opts.key || 'agentsam-mcp');
  const manifest = CATALOG[key];
  if (!manifest) throw new Error(`unknown_plugin:${key}`);
  if (opts.action === 'connect') return connectPlugin(opts, key);
  if (opts.action === 'status') return statusPlugin(opts, key);
  if (opts.action !== 'install' && opts.action !== 'remove') throw new Error(`unknown plugins action:${opts.action}`);
  const state = readState(opts.cwd);
  let migration = null;
  if (opts.action === 'install') {
    state.plugins[key] = { plugin_key: key, installed_at: new Date().toISOString(), manifest };
    migration = installMigration(opts.cwd);
  } else {
    delete state.plugins[key];
  }
  const filename = statePath(opts.cwd);
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filename, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  const result = { ok: true, action: opts.action, plugin_key: key, state_file: '.agentsam/plugins.json', migration };
  if (opts.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else console.log(`\n${opts.action === 'install' ? 'Installed' : 'Removed'} @${key}\n  state: ${result.state_file}${migration ? `\n  migration: ${migration}` : ''}\n`);
  return result;
}
