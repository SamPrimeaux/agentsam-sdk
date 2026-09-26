import { getJson } from '../lib/core-client.js';
import { resolveAccountAuthority } from '../lib/auth.js';
import {
  describeAccountSession,
  resolveAccountApiKey,
  readAccountSession,
  saveAccountSession,
} from '../lib/account-session.js';
import { listProviderCredentialStatus } from '../lib/provider-credentials.js';
import { projectWhoamiCapabilities } from '../lib/whoami-capabilities.js';
import { collectLocalTerminalContext, mergeTerminalContexts } from '../lib/terminal-local.js';
import {
  LOCAL_STUDIO_APP_ID,
  resolveLocalStudioHostOrigin,
  resolvePlatformAccountIssuer,
} from '../lib/app-authority.js';

function writeLine(write, value = '') { write(`${value}\n`); }

function epochToIso(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function safeTerminalContext(value = {}) {
  return {
    available: value?.available === true,
    instances: (value?.instances || []).map((row) => {
      const lastSeen = row?.last_seen_at ?? null;
      const id = row?.id || row?.instance_id || null;
      const compute = row?.compute_provider || row?.provider || null;
      return {
        id,
        instance_id: id,
        name: row?.name || null,
        kind: row?.kind || null,
        provider: compute,
        compute_provider: compute,
        status: row?.status || null,
        hostname: row?.hostname || null,
        platform: row?.platform || null,
        arch: row?.arch || null,
        hw_model: row?.hw_model || null,
        active_connection_count: Number(row?.active_connection_count || 0),
        default_connection_id: row?.default_connection_id || null,
        last_seen_at: lastSeen,
        last_seen_at_iso: row?.last_seen_at_iso || epochToIso(lastSeen),
      };
    }),
    connections: (value?.connections || []).map((row) => {
      const lastSeen = row?.last_seen_at ?? null;
      const id = row?.id || row?.connection_id || null;
      const compute = row?.compute_provider || row?.provider || null;
      return {
        id,
        connection_id: id,
        instance_id: row?.instance_id || null,
        name: row?.name || null,
        kind: row?.kind || null,
        provider: compute,
        compute_provider: compute,
        transport: row?.transport || null,
        transport_provider: row?.transport_provider || null,
        endpoint_url: row?.endpoint_url || null,
        route_hostname: row?.route_hostname || null,
        public_url: row?.public_url || row?.endpoint_url || null,
        is_active: row?.is_active === true,
        is_default: row?.is_default === true,
        health_status: row?.health_status || 'unknown',
        last_seen_at: lastSeen,
        last_seen_at_iso: row?.last_seen_at_iso || epochToIso(lastSeen),
      };
    }),
  };
}

function attachOwnerAccountId(credentials = [], ownerAccountId) {
  const owner = ownerAccountId == null ? '' : String(ownerAccountId).trim();
  if (!owner) return credentials;
  return (credentials || []).map((row) => {
    const next = {
      ...row,
      owner_account_id: owner,
    };
    if (row.provider === 'cloudflare' && row.account_id && row.account_id !== owner) {
      next.cloudflare_account_id = row.account_id;
    }
    // Platform + all providers: account_id means AgentSam au_* for this user
    next.account_id = owner;
    return next;
  });
}

function normalizeAuthKind(kind) {
  const raw = String(kind || '').trim();
  if (raw === 'api_key') return 'agentsam_api_key';
  if (raw === 'browser_oauth' || raw === 'oauth_session') return 'agentsam_browser_oauth';
  return raw || null;
}

function authLabelFor(kind, authType) {
  const k = normalizeAuthKind(kind) || normalizeAuthKind(authType);
  if (k === 'agentsam_api_key') return 'AgentSam API Key';
  if (k === 'agentsam_browser_oauth') return 'AgentSam Browser OAuth';
  if (k === 'agentsam_cf_browser_oauth') return 'Cloudflare Browser OAuth';
  return k || String(authType || 'unknown');
}

function patchBrowserSessionEmail(email, options = {}) {
  const cleanEmail = email == null ? '' : String(email).trim();
  if (!cleanEmail) return;
  try {
    const session = readAccountSession(options);
    if (!session?.access_token) return;
    if (session.email === cleanEmail) return;
    saveAccountSession({ ...session, email: cleanEmail }, options);
  } catch {
    /* best effort — do not fail whoami */
  }
}

export async function collectWhoami(options = {}) {
  const env = options.env || process.env;
  const apiKey = resolveAccountApiKey({ env, explicit: options.token || '', home: options.home });
  let browserSession = describeAccountSession({ env, home: options.home });
  const authorityLoader = options.authorityLoader || resolveAccountAuthority;
  const active = await authorityLoader({
    env,
    explicit: options.token || '',
    home: options.home,
    nowMs: options.nowMs,
    skewMs: options.skewMs,
    refreshImpl: options.refreshImpl,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });
  const credentials = listProviderCredentialStatus({ env, home: options.home });
  const capabilities = options.capabilities
    || await projectWhoamiCapabilities({
      env,
      home: options.home,
      cwd: options.cwd,
      discoverRemote: options.discoverRemote !== false,
    });
  const localTerminal = options.localTerminal
    || await collectLocalTerminalContext({ env, home: options.home });
  const platformIssuer = resolvePlatformAccountIssuer(env);
  const localStudioHost = resolveLocalStudioHostOrigin({ root: options.root });

  const activeKind = normalizeAuthKind(active.kind);
  const base = {
    schema_version: 4,
    ok: false,
    command_id: 'whoami',
    risk: 'read',
    exit_code: 1,
    format: 'json',
    loggedIn: false,
    authenticated: false,
    authType: null,
    authLabel: null,
    authority: 'inneranimalmedia',
    namespaces: {
      platform_issuer: platformIssuer,
      app_id: LOCAL_STUDIO_APP_ID,
      host_origin: localStudioHost,
      note: 'PLATFORM issuer ≠ APP HOST — do not alias',
    },
    identity: null,
    account: null,
    credential: null,
    tokenPermissions: [],
    capabilities,
    active_auth: {
      configured: Boolean(active.value || active.error),
      kind: activeKind,
      source: active.source || null,
      valid: null,
      error: active.error || null,
    },
    api_key: {
      configured: Boolean(apiKey.value || apiKey.error),
      kind: 'agentsam_api_key',
      source: apiKey.source || null,
      valid: apiKey.error ? false : null,
      error: apiKey.error || null,
    },
    browser_session: {
      ...browserSession,
      kind: browserSession.kind || (browserSession.configured ? 'agentsam_browser_oauth' : null),
    },
    cf_browser_oauth: {
      kind: 'agentsam_cf_browser_oauth',
      configured: false,
      app_id: LOCAL_STUDIO_APP_ID,
      host_origin: localStudioHost,
      next: 'agentsam cloudflare login --pack agentsam',
    },
    provider_credentials: credentials,
    // Local ExecOS profiles stay visible even when remote context fails.
    terminal: safeTerminalContext(localTerminal),
  };

  if (!active.value) {
    if (/IAM_OAUTH_ISSUER/i.test(String(active.error || ''))) {
      base.active_auth.next =
        'source ~/.agentsam/load-agent-env.sh   # loads AGENTSAM_API_KEY + IAM_OAUTH_ISSUER';
    } else if (!apiKey.value) {
      base.active_auth.next =
        'agentsam api-key create --store keychain --activate && eval "$(agentsam env shell --profile default)"';
    }
    return base;
  }

  try {
    const loader = options.contextLoader || ((token) => getJson('/api/sdk/context', {
      env,
      home: options.home,
      bearer: token,
      fetchImpl: options.fetchImpl,
      refreshImpl: options.refreshImpl,
      nowMs: options.nowMs,
      skewMs: options.skewMs,
      signal: options.signal,
    }));
    const context = await loader(active.value);
    const authType = normalizeAuthKind(
      context?.auth_type || (activeKind === 'agentsam_api_key' ? 'agentsam_api_key' : 'agentsam_browser_oauth'),
    );
    const tokenPermissions = Array.isArray(context?.tokenPermissions)
      ? context.tokenPermissions
      : Array.isArray(context?.credential?.scopes)
        ? context.credential.scopes
        : [];
    const ownerAccountId = context?.owner_account_id || context?.account_id || context?.user_id || null;
    const email = context?.email || context?.user?.email || active.session?.email || browserSession.email || null;

    if (email) {
      patchBrowserSessionEmail(email, { env, home: options.home });
      browserSession = describeAccountSession({ env, home: options.home });
    }

    const cfConnected = context?.cloudflare?.ok === true
      || context?.cloudflare?.status === 'connected'
      || Boolean(context?.cloudflare?.connection);

    return {
      ...base,
      ok: true,
      exit_code: 0,
      loggedIn: true,
      authenticated: true,
      authType,
      authLabel: authLabelFor(activeKind, authType),
      identity: {
        user_id: context?.user_id || ownerAccountId || null,
        account_id: ownerAccountId,
        owner_account_id: ownerAccountId,
        email,
      },
      account: {
        id: ownerAccountId,
        display_name: email || ownerAccountId || null,
        email,
      },
      credential: context?.credential
        ? {
            id: context.credential.id || null,
            name: context.credential.name || null,
            prefix: context.credential.prefix || null,
            environment: context.credential.environment || null,
            status: context.credential.status || 'active',
            created_at: context.credential.created_at || null,
            expires_at: context.credential.expires_at || null,
            last_used_at: context.credential.last_used_at || null,
          }
        : activeKind === 'agentsam_api_key'
          ? { id: null, name: null, prefix: null, status: 'active' }
          : null,
      tokenPermissions,
      capabilities,
      active_auth: { ...base.active_auth, kind: activeKind, valid: true, error: null },
      api_key: activeKind === 'agentsam_api_key'
        ? { ...base.api_key, valid: true, error: null }
        : base.api_key,
      browser_session: {
        ...browserSession,
        kind: 'agentsam_browser_oauth',
        email: email || browserSession.email || null,
        user_id: browserSession.user_id || ownerAccountId || null,
        account_id: browserSession.account_id || ownerAccountId || null,
      },
      cf_browser_oauth: {
        kind: 'agentsam_cf_browser_oauth',
        configured: cfConnected,
        source: cfConnected ? 'user_oauth_tokens' : null,
        next: cfConnected
          ? 'agentsam cloudflare permissions --json'
          : 'agentsam cloudflare login --pack agentsam',
      },
      provider_credentials: attachOwnerAccountId(credentials, ownerAccountId),
      cloudflare_connected: cfConnected,
      byok: context?.byok && typeof context.byok === 'object'
        ? Object.fromEntries(Object.entries(context.byok).map(([key, value]) => [key, { configured: value?.configured === true }]))
        : {},
      terminal: safeTerminalContext(mergeTerminalContexts(context?.terminal, localTerminal)),
    };
  } catch (error) {
    const rawMessage = error?.message || String(error);
    const message = error?.status
      ? `${rawMessage} (HTTP ${error.status} from ${error.endpoint || 'server'})`
      : rawMessage;
    return {
      ...base,
      active_auth: {
        ...base.active_auth,
        valid: false,
        error: message,
        next: /IAM_OAUTH_ISSUER/i.test(message)
          ? 'source ~/.agentsam/load-agent-env.sh'
          : 'agentsam login  # or agentsam whoami --json for detail',
      },
      api_key: activeKind === 'agentsam_api_key' ? { ...base.api_key, valid: false, error: message } : base.api_key,
      terminal: safeTerminalContext(localTerminal),
    };
  }
}

export function renderWhoami(status) {
  const lines = ['', '  Agent Sam · whoami', ''];
  if (status.authenticated || status.loggedIn) {
    lines.push('  authenticated  yes');
    lines.push(`  authType       ${status.authLabel || status.authType || status.active_auth?.kind || 'unknown'}`);
    if (status.account?.display_name || status.identity?.email) {
      lines.push(`  account        ${status.account?.display_name || status.identity?.email}`);
    }
    if (status.account?.id || status.identity?.account_id) {
      lines.push(`  account id     ${status.account?.id || status.identity?.account_id}`);
    }
    if (status.credential?.name || status.credential?.prefix) {
      lines.push(`  credential     ${[status.credential.name, status.credential.prefix].filter(Boolean).join(' · ')}`);
    }
    if (status.tokenPermissions?.length) {
      lines.push(`  permissions    ${status.tokenPermissions.join(', ')}`);
    }
    lines.push(`  active auth    ${status.active_auth?.kind || 'unknown'} · ${status.active_auth?.source || 'runtime'}`);
  } else {
    lines.push('  authenticated  no');
    lines.push(`  API key        ${status.api_key?.configured ? status.api_key?.valid === false ? 'invalid' : 'configured' : 'not configured'}`);
    lines.push(`  browser login  ${status.browser_session?.configured ? 'stored' : 'not configured'}`);
    if (status.active_auth?.error) lines.push(`  error          ${status.active_auth.error}`);
    if (status.active_auth?.next) lines.push(`  next           ${status.active_auth.next}`);
    lines.push('');
    if (status.browser_session?.configured && status.active_auth?.error) {
      lines.push('  tip            A login session is saved locally, but the server rejected it on this');
      lines.push('                 request (see error above). Run `agentsam login` again, or');
      lines.push('                 `agentsam whoami --json` for the full response.');
    } else if (!status.api_key?.configured) {
      lines.push('  tip            Run `agentsam login` then `agentsam api-key create --store keychain --activate`.');
      lines.push('                 Then: source ~/.agentsam/load-agent-env.sh');
    } else if (status.active_auth?.next) {
      lines.push(`  tip            ${status.active_auth.next}`);
    }
  }

  const shadow = describeAuthShadow(status);
  if (shadow) {
    lines.push('');
    lines.push(...shadow);
  }

  lines.push('');
  lines.push('  Capabilities');
  const caps = status.capabilities || {};
  for (const [key, value] of Object.entries(caps)) {
    if (key === 'edit' || key === 'tools' || key === 'cloudflare') continue;
    const available = value?.available === true ? 'yes' : 'no';
    let extra = '';
    if (Array.isArray(value?.configuredProviders)) {
      extra = ` · providers ${value.configuredProviders.join(',') || 0}`;
    } else if (value?.configuredProviders != null) {
      extra = ` · providers ${value.configuredProviders}`;
    } else if (Array.isArray(value?.drivers)) {
      const ids = value.drivers.map((d) => (typeof d === 'string' ? d : d.id)).filter(Boolean);
      if (ids.length) extra = ` · ${ids.join(', ')}`;
    }
    lines.push(`  ${key.padEnd(14)} ${available}${extra}`);
  }
  if (status.capabilities?.edit) {
    lines.push('');
    lines.push('  Edit capabilities');
    for (const [key, cmd] of Object.entries(status.capabilities.edit)) {
      lines.push(`  ${key.padEnd(18)} ${cmd}`);
    }
  }
  lines.push('');
  lines.push('  Provider credentials');
  for (const row of status.provider_credentials || []) {
    const state = row.configured ? 'available' : row.error ? `blocked (${row.error})` : 'not configured';
    const source = row.source ? ` · ${row.source}` : '';
    const label = row.provider === 'inneranimalmedia' ? 'inneranimalmedia (API key)' : String(row.provider);
    lines.push(`  ${label.padEnd(28)} ${state}${source}`);
  }
  lines.push('');
  lines.push('  Secret values are never printed by whoami.');
  lines.push('');
  return lines.join('\n');
}

/**
 * When browser OAuth exists but API key won authority — explain, don't imply login failed.
 */
export function describeAuthShadow(status = {}) {
  const browser = status.browser_session || {};
  const active = status.active_auth || {};
  const apiKey = status.api_key || {};
  if (!browser.configured) return null;
  if (active.kind === 'agentsam_browser_oauth' || active.kind === 'browser_oauth') return null;
  if (!(active.kind === 'agentsam_api_key' || active.kind === 'api_key' || apiKey.configured)) return null;

  const lines = [
    '  Authority lanes',
    `  Current authoritative credential`,
    `    agentsam_api_key · ${apiKey.source || active.source || 'environment'}`,
    '',
    '  agentsam_browser_oauth',
    `    available${browser.expired ? ' · expired' : ''}${browser.refreshable ? ' · refreshable' : ''} but not currently authoritative`,
    browser.email ? `    email ${browser.email}` : '    email (resolve via agentsam whoami after login)',
    '',
    '  Why?',
    '    AGENTSAM_API_KEY (or an explicit aak_* token) has higher precedence than browser OAuth.',
    '',
    '  Options',
    '    keep API key   (default — no action)',
    '    prefer session unset AGENTSAM_API_KEY && agentsam whoami',
    '    details        agentsam whoami --json',
  ];
  return lines;
}

/**
 * Post-login human summary — never claim OAuth is authoritative when API key still wins.
 */
export function renderLoginResult(status = {}) {
  const lines = ['', '  ✓ Browser OAuth login saved', ''];
  const shadow = describeAuthShadow(status);
  if (shadow) {
    lines.push('  Current authoritative credential');
    lines.push(`    agentsam_api_key · ${status.api_key?.source || status.active_auth?.source || 'environment'}`);
    lines.push('');
    lines.push('  agentsam_browser_oauth');
    lines.push('    available but not currently authoritative');
    lines.push('');
    lines.push('  Why?');
    lines.push('    AGENTSAM_API_KEY has higher precedence.');
    lines.push('');
    lines.push('  [enter] keep API key');
    lines.push('  [s]     use OAuth session  →  unset AGENTSAM_API_KEY && agentsam whoami');
    lines.push('  [d]     details            →  agentsam whoami --json');
    lines.push('');
  } else if (status.active_auth?.kind === 'agentsam_browser_oauth' || status.active_auth?.kind === 'browser_oauth') {
    lines.push('  Current authoritative credential');
    lines.push('    agentsam_browser_oauth');
    lines.push('');
    lines.push('  Next');
    lines.push('    agentsam api-key create --store keychain --activate');
    lines.push('    agentsam whoami');
    lines.push('');
  } else {
    lines.push('  Current authoritative credential');
    lines.push(`    ${status.authLabel || status.active_auth?.kind || 'unknown'} · ${status.active_auth?.source || 'runtime'}`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function runWhoami(argv = [], options = {}) {
  const allowed = new Set(['--json']);
  const unknown = argv.filter((arg) => !allowed.has(arg));
  if (unknown.length) throw new Error(`unknown whoami option: ${unknown[0]}`);
  const status = await collectWhoami(options);
  const write = options.write || ((text) => process.stdout.write(text));
  if (argv.includes('--json')) writeLine(write, JSON.stringify(status, null, 2));
  else write(renderWhoami(status));
  return status;
}
