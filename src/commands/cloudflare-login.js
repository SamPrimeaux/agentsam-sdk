/**
 * agentsam_cf_browser_oauth — authorize Cloudflare API scopes via browser OAuth.
 *
 * Feature packs expand to scoped OAuth requests so users never scroll 300+ CF
 * permissions. Flow: IAM-authenticated CLI → ENTER → open authorize URL → CF consent.
 */
import { resolveAccountAuthority } from '../lib/auth.js';
import { promptToOpenUrl } from '../lib/open-url.js';
import {
  LOCAL_STUDIO_APP_ID,
  resolveLocalStudioHostOrigin,
  resolvePlatformAccountIssuer,
} from '../lib/app-authority.js';
import {
  listCloudflareFeaturePacks,
  getCloudflareFeaturePack,
  scopesForFeaturePacks,
  scopesForCapabilities,
} from '../../packages/connectors/cloudflare/src/index.js';

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
    } else if (!arg.startsWith('-') && getCloudflareFeaturePack(arg)) {
      out.packs.push(arg);
    } else {
      throw new Error(`unknown cloudflare login option: ${arg}`);
    }
  }
  return out;
}

const LOGIN_HELP = `Agent Sam · Cloudflare browser OAuth (agentsam_cf_browser_oauth)

Authorize Cloudflare API access without picking from 300+ scopes.
Feature packs expand to OAuth scopes on the Local Studio APP host.

Namespaces (do not collapse):
  APP.id              local-studio
  HOST.origin         from apps/local-studio/agentsam.app.json hosts[]
  PLATFORM issuer     IAM_OAUTH_ISSUER (account API — separate)

  agentsam cloudflare login --pack agentsam
  agentsam cloudflare login --pack data,ai
  agentsam cloudflare login --capability cloudflare.d1,cloudflare.hyperdrive
  agentsam cloudflare login --list-packs
  agentsam cloudflare authorize --pack data   # alias

Flow
  1. Account auth: AGENTSAM_API_KEY + IAM_OAUTH_ISSUER (PLATFORM).
  2. CLI prints Local Studio HOST authorize URL; press ENTER to open.
  3. Cloudflare consent for that pack only (AgentSam Local Studio OAuth client).
`;

/**
 * Build Cloudflare connection OAuth start URL from local-studio APP HOST.
 * Packs expand client-side; HOST serves /api/connections/cloudflare/start.
 */
export function buildCloudflareBrowserOAuthStartUrl(options = {}) {
  const packs = (options.packs || []).map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  const capabilities = (options.capabilities || []).map((c) => String(c).trim()).filter(Boolean);

  for (const id of packs) {
    if (id !== 'baseline' && !getCloudflareFeaturePack(id)) {
      const err = new Error(`unknown Cloudflare feature pack: ${id}`);
      err.code = 'unknown_feature_pack';
      throw err;
    }
  }

  const effectivePacks = packs.length ? packs : ['agentsam'];
  const scopes = scopesForFeaturePacks(effectivePacks, capabilities);
  const hostOrigin = resolveLocalStudioHostOrigin({
    root: options.root,
    role: options.hostRole || 'production',
    hostId: options.hostId,
  });
  const startPath = options.startPath
    || '/api/connections/cloudflare/start';
  const start = new URL(startPath, `${hostOrigin}/`);
  start.searchParams.set('packs', effectivePacks.join(','));
  if (capabilities.length) start.searchParams.set('capabilities', capabilities.join(','));
  if (options.returnTo) start.searchParams.set('return_to', options.returnTo);

  return {
    kind: 'agentsam_cf_browser_oauth',
    app_id: LOCAL_STUDIO_APP_ID,
    host_origin: hostOrigin,
    platform_issuer: resolvePlatformAccountIssuer(options.env || process.env, options.issuer || ''),
    authorize_url: start.toString(),
    path_kind: 'app_host_connections',
    packs: effectivePacks,
    capabilities,
    scope_count: scopes.length,
    scopes,
    packs_detail: effectivePacks.map((id) => {
      const pack = getCloudflareFeaturePack(id);
      return pack
        ? { id: pack.id, label: pack.label, description: pack.description, capabilities: pack.capabilities }
        : { id, label: id };
    }),
    note: 'OAuth client + scopes authorize on local-studio HOST; account identity stays on PLATFORM IAM_OAUTH_ISSUER.',
  };
}

export async function runCloudflareBrowserOAuthLogin(argv = [], options = {}) {
  const args = parseLoginArgs(argv);
  const write = options.write || ((text) => process.stdout.write(text));
  const env = options.env || process.env;

  if (args.help) {
    write(LOGIN_HELP);
    return { ok: true, help: true };
  }

  if (args.listPacks) {
    const packs = listCloudflareFeaturePacks().map((pack) => ({
      id: pack.id,
      label: pack.label,
      description: pack.description,
      capabilities: pack.capabilities,
      scope_count: scopesForCapabilities({ capabilities: pack.capabilities, includeBaseline: true }).length,
    }));
    const payload = {
      schema: 'agentsam.cloudflare.feature_packs.v1',
      kind: 'agentsam_cf_browser_oauth',
      mitigation: 'Authorize by pack (product need), not by scrolling 300+ Cloudflare scopes. Upgrade later with another --pack.',
      packs,
    };
    write(args.json ? `${JSON.stringify(payload, null, 2)}\n` : LOGIN_HELP);
    return payload;
  }

  const authority = await (options.authorityLoader || resolveAccountAuthority)({
    env,
    home: options.home,
    fetchImpl: options.fetchImpl,
    refreshImpl: options.refreshImpl,
  });
  if (!authority.value) {
    const err = new Error(
      authority.error
        || 'Sign in first: agentsam login  (or export AGENTSAM_API_KEY)',
    );
    err.code = 'account_auth_required';
    throw err;
  }

  const plan = buildCloudflareBrowserOAuthStartUrl({
    env,
    packs: args.packs,
    capabilities: args.capabilities,
    issuer: options.issuer,
  });

  if (args.json && !args.open) {
    write(`${JSON.stringify(plan, null, 2)}\n`);
    return plan;
  }

  writeLine(write, '');
  writeLine(write, '  Agent Sam · Cloudflare browser OAuth');
  writeLine(write, `  kind           agentsam_cf_browser_oauth`);
  writeLine(write, `  packs          ${plan.packs.join(', ')}`);
  writeLine(write, `  scopes         ${plan.scope_count} (pack-expanded; not the full CF catalog)`);
  for (const pack of plan.packs_detail) {
    writeLine(write, `  · ${pack.id.padEnd(12)} ${pack.description || pack.label || ''}`);
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

  if (args.json) write(`${JSON.stringify(plan, null, 2)}\n`);
  return { ok: true, ...plan };
}

export function isCloudflareLoginFamily(family) {
  return family === 'login' || family === 'authorize' || family === 'oauth' || family === 'packs';
}
