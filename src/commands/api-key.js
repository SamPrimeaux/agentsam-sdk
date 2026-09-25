import os from 'node:os';
import { getJson, postJson } from '../lib/core-client.js';
import { resolveAccountAuthority } from '../lib/auth.js';
import { setProviderCredential, ensureAgentEnvLoader } from '../lib/provider-credentials.js';

function writeLine(write, value = '') {
  write(`${value}\n`);
}

function parseArgs(argv = []) {
  const out = {
    command: 'help',
    name: '',
    id: '',
    store: 'keychain',
    activate: false,
    active: false,
    json: false,
    positionals: [],
  };
  const [command = 'help', ...rest] = argv;
  out.command = command;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--name') out.name = String(rest[++i] || '').trim();
    else if (arg === '--id') out.id = String(rest[++i] || '').trim();
    else if (arg === '--store') out.store = String(rest[++i] || 'keychain').trim().toLowerCase();
    else if (arg === '--activate') out.activate = true;
    else if (arg === '--active') out.active = true;
    else if (arg === '--json') out.json = true;
    else if (String(arg).startsWith('-')) throw new Error(`unexpected api-key argument: ${arg}`);
    else out.positionals.push(arg);
  }
  if (!out.id && out.positionals[0]) out.id = out.positionals[0];
  if (!out.name) {
    try {
      out.name = os.hostname() || 'local';
    } catch {
      out.name = 'local';
    }
  }
  return out;
}

async function requireAuthority(options = {}) {
  const authority = await (options.authorityLoader || resolveAccountAuthority)({
    env: options.env || process.env,
    home: options.home,
    explicit: options.token || '',
    fetchImpl: options.fetchImpl,
    refreshImpl: options.refreshImpl,
    nowMs: options.nowMs,
    skewMs: options.skewMs,
    signal: options.signal,
  });
  if (!authority?.value) {
    throw new Error(authority?.error || 'Run agentsam login first (OAuth session required to mint API keys).');
  }
  return authority;
}

function storeSecretLocally(secret, options = {}) {
  const store = String(options.store || 'keychain').toLowerCase();
  if (store === 'none' || store === 'print') {
    return { storage: 'none', source_command: null };
  }
  // keychain | vault — setSecureProviderKey tries OS keychain then encrypted vault
  const result = setProviderCredential('inneranimalmedia', secret, {
    ...options,
    exportProfile: false,
    writeEnvProfile: false,
  });
  ensureAgentEnvLoader(options);
  return {
    storage: store === 'vault' ? 'local_vault' : 'os_keychain',
    provider: result.provider,
    source_command: 'source ~/.agentsam/load-agent-env.sh',
  };
}

function renderCreate(result) {
  const lines = [
    '',
    '  ✓ AgentSam API credential created',
    '',
    `  Name        ${result.credential?.name || ''}`,
    `  Prefix      ${result.credential?.prefix || ''}`,
    `  Owner       current account`,
    `  Storage     ${result.storage_label || 'not stored'}`,
    `  Status      active`,
    '',
  ];
  if (result.activated) {
    lines.push('  ✓ AGENTSAM_API_KEY is available to AgentSam environments');
    lines.push('');
    lines.push('  source ~/.agentsam/load-agent-env.sh');
    lines.push('  agentsam whoami');
    lines.push('');
  } else if (result.secret_once) {
    lines.push('  Copy this key now. It cannot be displayed again.');
    lines.push(`  ${result.secret_once}`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function runApiKey(argv = [], options = {}) {
  const write = options.write || ((text) => process.stdout.write(text));
  const parsed = parseArgs(argv);
  const env = options.env || process.env;

  if (parsed.command === 'help' || parsed.command === '--help' || parsed.command === '-h') {
    writeLine(write, 'agentsam api-key create [--name <label>] [--store keychain|vault|none] [--activate]');
    writeLine(write, 'agentsam api-key list [--json]');
    writeLine(write, 'agentsam api-key rotate [--id <credential_id>|--active] [--store keychain] [--activate]');
    writeLine(write, 'agentsam api-key revoke --id <credential_id>');
    return;
  }

  if (parsed.command === 'create') {
    const authority = await requireAuthority(options);
    const post = options.postJsonImpl || postJson;
    const response = await post(
      '/api/sdk/api-keys',
      { action: 'create', name: parsed.name, client_type: 'cli' },
      { env, home: options.home, bearer: authority.value, fetchImpl: options.fetchImpl, refreshImpl: options.refreshImpl },
    );
    const secret = response?.secret_once;
    if (!secret) throw new Error('host_did_not_return_secret_once');

    let storage = { storage: 'none' };
    let activated = false;
    if (parsed.activate || parsed.store !== 'none') {
      storage = storeSecretLocally(secret, { ...options, store: parsed.store });
      activated = parsed.activate || parsed.store !== 'none';
    }

    const result = {
      ok: true,
      credential: response.credential,
      secret_once: activated ? undefined : secret,
      storage: storage.storage,
      storage_label:
        storage.storage === 'os_keychain'
          ? process.platform === 'darwin'
            ? 'macOS Keychain'
            : process.platform === 'win32'
              ? 'Windows Credential Manager'
              : 'OS credential store'
          : storage.storage === 'local_vault'
            ? 'local encrypted vault'
            : 'not stored',
      activated,
    };
    if (parsed.json) writeLine(write, JSON.stringify({ ...result, secret_once: secret }, null, 2));
    else write(renderCreate(result));
    return result;
  }

  if (parsed.command === 'list') {
    const authority = await requireAuthority(options);
    const get = options.getJsonImpl || getJson;
    const response = await get('/api/sdk/api-keys', {
      env,
      home: options.home,
      bearer: authority.value,
      fetchImpl: options.fetchImpl,
      refreshImpl: options.refreshImpl,
    });
    const rows = response?.credentials || [];
    if (parsed.json) {
      writeLine(write, JSON.stringify({ ok: true, credentials: rows }, null, 2));
    } else {
      writeLine(write, '');
      writeLine(write, '  AgentSam API keys');
      if (!rows.length) writeLine(write, '  (none)');
      for (const row of rows) {
        writeLine(
          write,
          `  ${(row.name || row.id || '').padEnd(28)} ${(row.prefix || '').padEnd(14)} ${row.status || 'unknown'}`,
        );
      }
      writeLine(write, '');
    }
    return { ok: true, credentials: rows };
  }

  if (parsed.command === 'rotate') {
    const authority = await requireAuthority(options);
    let id = parsed.id;
    if (!id || parsed.active) {
      const get = options.getJsonImpl || getJson;
      const listed = await get('/api/sdk/api-keys', {
        env,
        home: options.home,
        bearer: authority.value,
        fetchImpl: options.fetchImpl,
        refreshImpl: options.refreshImpl,
      });
      const active = (listed?.credentials || []).find((row) => row.status === 'active');
      if (!active?.id) throw new Error('no_active_credential_to_rotate');
      id = active.id;
    }
    const post = options.postJsonImpl || postJson;
    const response = await post(
      '/api/sdk/api-keys',
      { action: 'rotate', id, name: parsed.name || undefined },
      { env, home: options.home, bearer: authority.value, fetchImpl: options.fetchImpl, refreshImpl: options.refreshImpl },
    );
    const secret = response?.secret_once;
    if (!secret) throw new Error('host_did_not_return_secret_once');
    const storage = storeSecretLocally(secret, { ...options, store: parsed.store === 'none' ? 'keychain' : parsed.store });
    const result = {
      ok: true,
      credential: response.credential,
      storage: storage.storage,
      storage_label: 'OS keychain / vault',
      activated: true,
    };
    if (parsed.json) writeLine(write, JSON.stringify({ ...result, secret_once: secret }, null, 2));
    else write(renderCreate({ ...result, secret_once: undefined }));
    return result;
  }

  if (parsed.command === 'revoke') {
    if (!parsed.id) throw new Error('api-key revoke requires --id <credential_id>');
    const authority = await requireAuthority(options);
    const post = options.postJsonImpl || postJson;
    const response = await post(
      '/api/sdk/api-keys',
      { action: 'revoke', id: parsed.id },
      { env, home: options.home, bearer: authority.value, fetchImpl: options.fetchImpl, refreshImpl: options.refreshImpl },
    );
    if (parsed.json) writeLine(write, JSON.stringify(response, null, 2));
    else {
      writeLine(write, '');
      writeLine(write, response?.ok ? '  ✓ credential revoked' : '  revoke failed');
      writeLine(write, '');
    }
    return response;
  }

  throw new Error(`unknown api-key command: ${parsed.command}`);
}
