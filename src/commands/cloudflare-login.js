/**
 * agentsam_cf_browser_oauth — authorize Cloudflare API scopes via browser OAuth.
 *
 * Feature packs expand to scoped OAuth requests so users never scroll 300+ CF
 * permissions. Flow: IAM-authenticated CLI → ENTER → open authorize URL → CF consent.
 */
import { resolveAccountAuthority } from '../lib/auth.js';
import { promptToOpenUrl } from '../lib/open-url.js';
import { createToolError } from '../errors/index.js';
import {
  LOCAL_STUDIO_APP_ID,
  resolveLocalStudioHostOrigin,
  resolvePlatformAccountIssuer,
} from '../lib/app-authority.js';
function cloudflareLoginError(reason, message, {
  domain = 'auth',
  stage = 'authorize',
  providerCode = null,
  details = null,
} = {}) {
  return createToolError({
    tool: 'cloudflare-login',
    domain,
    reason,
    message,
    stage,
    provider: 'cloudflare',
    provider_code: providerCode == null ? null : String(providerCode),
    details,
  });
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function writeLine(write, value = '') {
  write(`${value}\n`);
}

function parseLoginArgs(argv = []) {
  const out = {
    packs: [],
    capabilities: [],
    json: false,
    listPacks: false,
    help: false,
    open: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--list-packs' || arg === 'packs') out.listPacks = true;
    else if (arg === '--no-open') out.open = false;
    else if (arg === '--pack' || arg === '--packs') {
      const raw = argv[++i] || '';
      out.packs.push(...raw.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (arg.startsWith('--pack=')) {
      out.packs.push(...arg.slice('--pack='.length).split(',').map((s) => s.trim()).filter(Boolean));
    } else if (arg === '--capability' || arg === '--capabilities') {
      const raw = argv[++i] || '';
      out.capabilities.push(...raw.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (arg.startsWith('--capability=')) {
      out.capabilities.push(...arg.slice('--capability='.length).split(',').map((s) => s.trim()).filter(Boolean));
    } else if (!arg.startsWith('-')) {
      out.packs.push(arg);
    } else {
      throw cloudflareLoginError('input_invalid', `unknown cloudflare login option: ${arg}`, { stage: 'validate', details: { argument: arg } });
    }
  }
  return out;
}

const LOGIN_HELP = `Agent Sam · Cloudflare browser OAuth (agentsam_cf_browser_oauth)

Authorize Cloudflare features through permission packs registered on the Local Studio plugin.
The host resolves scopes; the CLI does not contain a second permission catalog.

Namespaces (do not collapse):
  APP.id              local-studio
  HOST.origin         from apps/local-studio/agentsam.app.json hosts[]
  PLATFORM issuer     IAM_OAUTH_ISSUER (account API — separate)

  agentsam cloudflare login --pack watch
  agentsam cloudflare login --pack store,build
  agentsam cloudflare login --pack create
  agentsam cloudflare login --pack publish
  agentsam cloudflare login --pack all  # explicit full-catalog opt-in, when enabled by the host
  agentsam cloudflare login --capability cloudflare.d1,cloudflare.hyperdrive
  agentsam cloudflare login --list-packs
  agentsam cloudflare authorize --pack data   # alias

Flow
  1. Account auth: AGENTSAM_API_KEY + IAM_OAUTH_ISSUER (PLATFORM).
  2. CLI prints Local Studio HOST authorize URL; press ENTER to open.
  3. Cloudflare consent for that pack only (AgentSam Local Studio OAuth client).
`;

/**
 * Build the OAuth start URL. Permission expansion and validation stay on the
 * Local Studio host; the CLI only forwards registered IDs.
 */
function expandPackAliases(ids, aliases = {}) {
  const out = new Set();
  const visiting = new Set();
  const visit = (raw) => {
    const id = String(raw || '').trim().toLowerCase();
    if (!id || visiting.has(id)) return;
    const targets = aliases[id];
    if (!Array.isArray(targets)) {
      out.add(id);
      return;
    }
    visiting.add(id);
    for (const target of targets) visit(target);
    visiting.delete(id);
  };
  for (const id of ids) visit(id);
  return [...out];
}

export function buildCloudflareBrowserOAuthStartUrl(options = {}) {
  const packs = (options.packs || []).map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  const capabilities = (options.capabilities || []).map((c) => String(c).trim()).filter(Boolean);
  const defaultPacks = (options.defaultPacks || []).map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  const defaultCapabilities = (options.defaultCapabilities || []).map((c) => String(c).trim()).filter(Boolean);
  const aliases = options.aliases || {};
  const effectivePacks = packs.length ? expandPackAliases(packs, aliases) : defaultPacks;
  const effectiveCapabilities = capabilities.length ? capabilities : (packs.length ? [] : defaultCapabilities);
  const packCatalog = Array.isArray(options.packCatalog) ? options.packCatalog : [];
  const byId = new Map(packCatalog.map((pack) => [pack.pack_id || pack.id, pack]));
  const hostOrigin = options.hostOrigin || resolveLocalStudioHostOrigin({
    root: options.root,
    role: options.hostRole || 'production',
    hostId: options.hostId,
  });
  const startPath = options.startPath || '/api/connections/cloudflare/start';
  const start = new URL(startPath, hostOrigin + '/');
  if (packs.length) start.searchParams.set('packs', packs.join(','));
  if (capabilities.length) start.searchParams.set('capabilities', capabilities.join(','));
  if (options.returnTo) start.searchParams.set('return_to', options.returnTo);

  return {
    kind: 'agentsam_cf_browser_oauth',
    app_id: LOCAL_STUDIO_APP_ID,
    host_origin: hostOrigin,
    platform_issuer: resolvePlatformAccountIssuer(options.env || process.env, options.issuer || ''),
    authorize_url: start.toString(),
    permissions_url: new URL('/api/connections/cloudflare/permissions', hostOrigin + '/').toString(),
    path_kind: 'app_host_connections',
    packs: effectivePacks,
    requested_packs: packs,
    capabilities: effectiveCapabilities,
    scope_count: null,
    scopes: [],
    packs_detail: effectivePacks.map((id) => {
      const pack = byId.get(id);
      return pack
        ? { id, label: pack.label, description: pack.description, capabilities: pack.capabilities || [] }
        : { id, label: id };
    }),
    note: 'OAuth permissions are resolved by the host from the registered provider plugin configuration.',
  };
}

async function fetchCloudflarePermissionCatalog(hostOrigin, accessToken, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw cloudflareLoginError('transport_not_configured', 'Cloudflare permission catalog fetch is unavailable.', { domain: 'transport', stage: 'connect', details: { legacy_code: 'cloudflare_permission_catalog_fetch_unavailable' } });
  const response = await fetchImpl(new URL('/api/connections/cloudflare/permissions', hostOrigin + '/'), {
    headers: {
      authorization: 'Bearer ' + accessToken,
      accept: 'application/json',
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    const reason = response.status === 401
      ? 'auth_missing'
      : response.status === 403
        ? 'provider_scope_insufficient'
        : response.status === 429
          ? 'provider_rate_limited'
          : response.status >= 500
            ? 'provider_unavailable'
            : 'provider_request_invalid';
    const legacyCode = payload?.error || 'cloudflare_permission_catalog_unavailable';
    throw cloudflareLoginError(
      reason,
      payload?.error || ('Cloudflare permission catalog unavailable (HTTP ' + response.status + ').'),
      {
        domain: response.status === 401 || response.status === 403 ? 'auth' : 'provider',
        stage: 'load',
        providerCode: legacyCode,
        details: { legacy_code: legacyCode, http_status: response.status },
      },
    );
  }
  return payload;
}

export async function runCloudflareBrowserOAuthLogin(argv = [], options = {}) {
  const args = parseLoginArgs(argv);
  const write = options.write || ((text) => process.stdout.write(text));
  const env = options.env || process.env;

  if (args.help) {
    write(LOGIN_HELP);
    return { ok: true, help: true };
  }

  const authority = await (options.authorityLoader || resolveAccountAuthority)({
    env,
    home: options.home,
    fetchImpl: options.fetchImpl,
    refreshImpl: options.refreshImpl,
  });
  if (!authority.value) {
    throw cloudflareLoginError(
      'auth_missing',
      authority.error || 'Sign in first: agentsam login (or export AGENTSAM_API_KEY)',
      { stage: 'authorize', details: { legacy_code: 'account_auth_required', authority_error: authority.error || null } },
    );
  }

  const hostOrigin = options.hostOrigin || resolveLocalStudioHostOrigin({
    root: options.root,
    role: options.hostRole || 'production',
    hostId: options.hostId,
  });
  const catalog = await fetchCloudflarePermissionCatalog(
    hostOrigin,
    authority.value,
    options.fetchImpl || globalThis.fetch,
  );

  if (args.listPacks) {
    const payload = {
      schema: 'agentsam.cloudflare.permission_packs.v1',
      kind: 'agentsam_cf_browser_oauth',
      provider: catalog.provider,
      default_packs: catalog.default_packs || [],
      default_capabilities: catalog.default_capabilities || [],
      full_catalog_opt_in: catalog.full_catalog_opt_in === true,
      aliases: catalog.aliases || {},
      packs: catalog.registered_packs || [],
      available_capabilities: catalog.available_capabilities || [],
      permissions_url: new URL('/api/connections/cloudflare/permissions', hostOrigin + '/').toString(),
    };
    write(args.json ? JSON.stringify(payload, null, 2) + '\n' : LOGIN_HELP + '\nRegistered packs are loaded from the Local Studio plugin catalog.\n');
    return payload;
  }

  const knownPacks = new Set((catalog.registered_packs || []).map((pack) => String(pack.pack_id || '').toLowerCase()));
  const aliases = catalog.aliases && typeof catalog.aliases === 'object' ? catalog.aliases : {};
  const unknownPacks = args.packs.map((id) => id.toLowerCase()).filter((id) =>
    id !== 'all' || catalog.full_catalog_opt_in !== true
  ).filter((id) => !knownPacks.has(id) && !Array.isArray(aliases[id]));
  if (unknownPacks.length) {
    throw cloudflareLoginError(
      'input_invalid',
      'Unknown Cloudflare permission pack: ' + unknownPacks.join(', '),
      { stage: 'validate', details: { legacy_code: 'cloudflare_permission_pack_unavailable', unknown_packs: unknownPacks } },
    );
  }
  const knownCapabilities = new Set((catalog.available_capabilities || []).map((capability) => capability.id));
  const unknownCapabilities = args.capabilities.filter((id) => !knownCapabilities.has(id));
  if (unknownCapabilities.length) {
    throw cloudflareLoginError(
      'input_invalid',
      'Unknown Cloudflare capability: ' + unknownCapabilities.join(', '),
      { stage: 'validate', details: { legacy_code: 'cloudflare_capability_unavailable', unknown_capabilities: unknownCapabilities } },
    );
  }

  const plan = buildCloudflareBrowserOAuthStartUrl({
    env,
    root: options.root,
    hostRole: options.hostRole,
    hostId: options.hostId,
    hostOrigin,
    packs: args.packs,
    capabilities: args.capabilities,
    defaultPacks: catalog.default_packs,
    defaultCapabilities: catalog.default_capabilities,
    aliases,
    packCatalog: catalog.registered_packs,
    issuer: options.issuer,
    returnTo: options.returnTo,
  });

  if (args.json && !args.open) {
    write(JSON.stringify(plan, null, 2) + '\n');
    return plan;
  }

  writeLine(write, '');
  writeLine(write, '  Agent Sam · Cloudflare browser OAuth');
  writeLine(write, '  kind           agentsam_cf_browser_oauth');
  writeLine(write, '  packs          ' + (plan.packs.join(', ') || '(host default)'));
  writeLine(write, '  scopes         resolved by the Local Studio plugin registry');
  for (const pack of plan.packs_detail) {
    writeLine(write, '  · ' + String(pack.id).padEnd(12) + ' ' + (pack.description || pack.label || ''));
  }
  writeLine(write, '');

  if (args.open !== false) {
    const promptImpl = options.promptToOpenUrlImpl || promptToOpenUrl;
    await promptImpl(plan.authorize_url, {
      heading: 'Authorize Cloudflare for AgentSam at:',
      prompt: 'Press ENTER to open Cloudflare consent in your browser.',
      input: options.input,
      output: options.output || process.stdout,
      openImpl: options.openImpl,
    });
    writeLine(write, '  After approving scopes in the browser, return here.');
    writeLine(write, '  Next: agentsam cloudflare status --json');
    writeLine(write, '        agentsam whoami --json');
    writeLine(write, '');
  }

  if (args.json) write(JSON.stringify(plan, null, 2) + '\n');
  return { ok: true, ...plan };
}

export function isCloudflareLoginFamily(family) {
  return family === 'login' || family === 'authorize' || family === 'oauth' || family === 'packs';
}
