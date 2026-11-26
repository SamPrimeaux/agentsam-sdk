import path from 'node:path';
import fs from 'node:fs';
import { listWranglerNativeCommands, runWranglerNative, summarizeCloudflareCpuProfileFile, WRANGLER_OPERATION_FAMILIES } from '../cloudflare/index.js';
import { renderDiagnosticError } from '../errors/index.js';
import { parseWhoami, renderCloudflareStatus } from './cloudflare-status.js';
import {
  CloudflareApiClient,
  CloudflareApiError,
  capabilityAuthorizationMatrix,
  workflows,
  scanner,
  tags,
  tagGateway,
  brandProtection,
  keyless,
  tokenValidation,
  pages,
  snippets,
} from '../../packages/connectors/cfoa/src/index.js';
import { AGENTSAM_TAG_VOCABULARY as TAG_VOCAB } from '../../packages/connectors/cfoa/src/families/tags.js';
import {
  isCloudflareLoginFamily,
  runCloudflareBrowserOAuthLogin,
} from './cloudflare-login.js';

function parse(argv = []) {
  const out = {
    family: argv[0] || 'status',
    // Never seed action from argv[1] — flags like `--json` would become the action
    // and `agentsam cloudflare status --json` would fall through to the help menu.
    action: '',
    rest: [],
    cwd: process.cwd(),
    json: false,
    name: '',
    account: '',
    config: '',
    env: '',
    profile: '',
    path: '',
    page: null,
    file: '',
    zone: '',
    url: '',
    id: '',
    version: '',
    instance: '',
    event: '',
    measurementId: '',
    endpoint: '/metrics',
    hideOriginalIp: true,
    setUpTag: true,
    capability: '',
    resource: '',
    tag: '',
    status: '',
    help: false,
    pack: '',
    probe: true,
  };

  // Legacy: cloudflare run <id> / cloudflare cpu analyze
  if (out.family === 'run' || out.family === 'cpu') {
    const maybeAction = argv[1] || '';
    out.action = maybeAction.startsWith('-') ? '' : maybeAction;
    let i = out.action ? 2 : 1;
    for (; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === '--json') out.json = true;
      else if (arg === '--cwd') out.cwd = argv[++i] || out.cwd;
      else if (arg === '--name') out.name = argv[++i] || '';
      else if (arg === '--account') out.account = argv[++i] || '';
      else if (arg === '--config') out.config = argv[++i] || '';
      else if (arg === '--env') out.env = argv[++i] || '';
      else if (arg === '--profile') out.profile = argv[++i] || '';
      else if (arg === '--path') out.path = argv[++i] || '';
      else if (arg === '--page') out.page = Number(argv[++i] || 1);
      else if (arg === '--file') out.file = argv[++i] || '';
      else if (arg === '--help' || arg === '-h') out.help = true;
      else if (!out.action && !arg.startsWith('-')) out.action = arg;
      else if (out.family === 'cpu' && out.action === 'analyze' && !out.file && !arg.startsWith('-')) out.file = arg;
      else out.rest.push(arg);
    }
    return out;
  }

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--no-probe') out.probe = false;
    else if (arg === '--cwd') out.cwd = argv[++i] || out.cwd;
    else if (arg === '--account') out.account = argv[++i] || '';
    else if (arg === '--zone') out.zone = argv[++i] || '';
    else if (arg === '--name') out.name = argv[++i] || '';
    else if (arg === '--url') out.url = argv[++i] || '';
    else if (arg === '--id') out.id = argv[++i] || '';
    else if (arg === '--version') out.version = argv[++i] || '';
    else if (arg === '--instance') out.instance = argv[++i] || '';
    else if (arg === '--event') out.event = argv[++i] || '';
    else if (arg === '--measurement-id') out.measurementId = argv[++i] || '';
    else if (arg === '--endpoint') out.endpoint = argv[++i] || '/metrics';
    else if (arg === '--hide-original-ip') out.hideOriginalIp = true;
    else if (arg === '--forward-original-ip') out.hideOriginalIp = false;
    else if (arg === '--no-setup-tag') out.setUpTag = false;
    else if (arg === '--capability') out.capability = argv[++i] || '';
    else if (arg === '--pack' || arg === '--packs') out.pack = argv[++i] || '';
    else if (arg === '--resource') out.resource = argv[++i] || '';
    else if (arg === '--tag') out.tag = argv[++i] || '';
    else if (arg === '--status') out.status = argv[++i] || '';
    else if (arg === '--file') out.file = argv[++i] || '';
    else if (arg === '--page') out.page = Number(argv[++i] || 1);
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (!out.action && !arg.startsWith('-')) out.action = arg;
    else if (!arg.startsWith('-')) out.rest.push(arg);
    else throw new Error(`unknown cloudflare option: ${arg}`);
  }
  return out;
}

const help = `Agent Sam · Cloudflare

Account & access
  agentsam cloudflare status [--json]
  agentsam cloudflare login --pack agentsam   # agentsam_cf_browser_oauth (ENTER to open)
  agentsam cloudflare login --list-packs
  agentsam cloudflare authorize --pack data   # alias of login
  agentsam cloudflare permissions [--capability ID] [--json]
  agentsam cloudflare capabilities [--json]
  agentsam cloudflare commands [--json]

Compute
  agentsam cloudflare workflows status|list|inspect|versions|graph|run|instances|instance|step|pause|resume|terminate|event|delete …

Web & delivery
  agentsam cloudflare tag-gateway status|configure|disable --zone ZONE_ID …
  agentsam cloudflare scanner status|scan|result|search|har|dom|screenshot|bulk …

Organization
  agentsam cloudflare tags status|keys|values|summary|resources|list|vocabulary …

  agentsam cloudflare pages status|list|inspect|deployments|deployment|logs|domains …
  agentsam cloudflare snippets status|list|inspect|content|rules … --zone ZONE_ID

Security (eligibility-first)
  agentsam cloudflare brand status|queries|matches|logos|scan …
  agentsam cloudflare keyless status|list|inspect|enable|disable --zone ZONE_ID …
  agentsam cloudflare token-validation status|configs|rules --zone ZONE_ID …

Native (Wrangler reads)
  agentsam cloudflare run <whoami|…> [--json]
  agentsam cloudflare cpu analyze <profile.cpuprofile> [--json]

Auth lanes
  agentsam_api_key / agentsam_browser_oauth  → Inner Animal Media identity
  agentsam_cf_browser_oauth                  → Cloudflare OAuth scopes from plugin-owned permission packs
  CLOUDFLARE_API_TOKEN                       → optional direct token (still supported)

Scope mitigation: never dump 300+ CF permissions — authorize by pack
  (data | compute | ai | web | media | security | agentsam).
`;

function clientFromArgs(args, options = {}) {
  return new CloudflareApiClient({
    apiToken: options.apiToken || process.env.CLOUDFLARE_API_TOKEN,
    accountId: args.account || options.accountId || process.env.CLOUDFLARE_ACCOUNT_ID,
    fetchImpl: options.fetchImpl || globalThis.fetch,
  });
}

/**
 * Narrow, read-only Cloudflare API-token probes. Scope lists are not available
 * for raw API tokens, so use real endpoint evidence for the three core services.
 * Probe success authorizes the tested GET only; it never grants write privileges.
 */
export async function probeCloudflareCore(client) {
  if (!client?.apiToken || !client?.accountId) return {};
  const targets = [
    ['cloudflare.d1', 'd1/database'],
    ['cloudflare.r2', 'r2/buckets'],
    ['cloudflare.vectorize', 'vectorize/v2/indexes'],
  ];
  const results = await Promise.all(targets.map(async ([id, path]) => {
    try {
      const result = await client.request('GET', client.accountPath(path), {
        capabilityId: id, operation: 'cloudflare.status.read_probe',
        query: { per_page: 1 },
      });
      return [id, {
        status: 'authorized', operation: 'read', verified: true,
        http_status: result.http_status, source: 'live_cloudflare_api',
      }];
    } catch (error) {
      const httpStatus = error?.httpStatus ?? error?.status ?? null;
      const denied = httpStatus === 401 || httpStatus === 403;
      return [id, {
        status: denied ? 'needs_authorization' : 'unknown',
        operation: 'read', verified: false, http_status: httpStatus,
        source: 'live_cloudflare_api',
        error_code: denied ? 'cloudflare_permission_denied' : (error?.code || 'cloudflare_probe_unavailable'),
      }];
    }
  }));
  return Object.fromEntries(results);
}

function formatHuman(result) {
  if (result == null) return '';
  if (result.schema === 'agentsam.cloudflare.status.v1' && result.auth?.mode === 'api_token') {
    const lines = [
      'Agent Sam · Cloudflare status',
      `Account: ${result.auth.account_id || 'not configured'} · API token: ${result.auth.token_configured ? 'configured' : 'missing'}`,
    ];
    for (const [id, label] of [['cloudflare.d1','D1'],['cloudflare.r2','R2'],['cloudflare.vectorize','Vectorize']]) {
      const probe = result.probes?.[id];
      lines.push(`${(label + ' (read)').padEnd(18)} ${probe ? probe.status : 'not probed'}${probe?.http_status ? ' (HTTP ' + probe.http_status + ')' : ''}`);
    }
    lines.push('Only listed read operations are probed; API-token scope lists and write permissions remain unverified.');
    lines.push('Use --json for the full catalog and detailed results.');
    return lines.join('\n') + '\n';
  }
  if (typeof result === 'string') return result;
  const lines = [];
  if (result.capability_label || result.capability_id) {
    lines.push(`Agent Sam · ${result.capability_label || result.capability_id}`);
    lines.push('');
  }
  if (result.availability != null) {
    const mark = result.availability === 'available' || result.availability === 'generally_available'
      ? (result.authorized === false ? '○' : '✓')
      : '○';
    lines.push(`availability   ${mark} ${result.availability}`);
  }
  if (result.authorized === false && result.permission_required) {
    lines.push(`permission     ${result.permission_required}`);
  }
  if (result.remediation?.authorize_hint) {
    lines.push('');
    lines.push(`[Authorize]  ${result.remediation.authorize_hint}`);
  }
  if (result.learn) {
    lines.push('');
    lines.push(`Learn: ${result.learn}`);
  }
  if (result.message && result.ok === false) lines.push(result.message);
  if (lines.length <= 2) return `${JSON.stringify(result, null, 2)}\n`;
  return `${lines.join('\n')}\n\n${JSON.stringify(result, null, 2)}\n`;
}

async function dispatchFamily(args, options) {
  const client = clientFromArgs(args, options);
  const family = args.family;
  const action = args.action || 'status';
  const name = args.name || args.rest[0] || '';
  const id = args.id || args.rest[1] || args.rest[0] || '';

  if (family === 'permissions' || family === 'capabilities') {
    const catalog = await runCloudflareBrowserOAuthLogin(['--list-packs', '--json'], options);
    const packs = catalog.packs || [];
    const capabilities = catalog.available_capabilities || [];
    if (family === 'capabilities' || action === 'list' || (!args.capability && !args.pack)) {
      return {
        schema: 'agentsam.cloudflare.plugin_permissions.v1',
        provider: catalog.provider || 'cloudflare',
        baseline_scopes: catalog.baseline_scopes || [],
        default_packs: catalog.default_packs || [],
        full_catalog_opt_in: catalog.full_catalog_opt_in === true,
        aliases: catalog.aliases || {},
        feature_packs: packs,
        capabilities,
        tag_vocabulary: TAG_VOCAB,
        source: 'agentsam_plugins.config_json.oauth_permissions',
      };
    }
    if (args.pack) {
      const requested = args.pack.split(',').map((id) => id.trim().toLowerCase()).filter(Boolean);
      if (requested.length === 1 && requested[0] === 'all' && catalog.full_catalog_opt_in === true) {
        const scopes = (catalog.available_permissions || []).map((permission) => permission.scope);
        return {
          pack: 'all',
          full_catalog_opt_in: true,
          scopes_to_request: scopes,
          scope_count: scopes.length,
          authorize: 'agentsam cloudflare login --pack all',
          authorize_url_hint: '/api/connections/cloudflare/start?packs=all',
        };
      }
      const aliases = catalog.aliases || {};
      const selectedIds = [];
      const visit = (id) => {
        if (Array.isArray(aliases[id])) {
          for (const target of aliases[id]) visit(target);
        } else if (!selectedIds.includes(id)) selectedIds.push(id);
      };
      requested.forEach(visit);
      const selected = selectedIds.map((id) => packs.find((pack) => pack.pack_id === id)).filter(Boolean);
      if (!selected.length) return { ok: false, error: 'cloudflare_permission_pack_unavailable', pack: args.pack };
      const scopes = [...new Set(selected.flatMap((pack) => pack.requested_scopes || []))];
      return {
        pack: args.pack,
        expanded_packs: selectedIds,
        packs: selected,
        scopes_to_request: scopes,
        scope_count: scopes.length,
        authorize: 'agentsam cloudflare login --pack ' + args.pack,
        authorize_url_hint: '/api/connections/cloudflare/start?packs=' + encodeURIComponent(args.pack),
      };
    }
    const capability = capabilities.find((item) => item.id === args.capability);
    if (!capability) return { ok: false, error: 'cloudflare_capability_unavailable', capability: args.capability };
    return {
      ...capability,
      scopes_to_request: capability.scopes || [],
      authorize: 'agentsam cloudflare login --capability ' + args.capability,
      authorize_url_hint: '/api/connections/cloudflare/start?capabilities=' + encodeURIComponent(args.capability),
    };
  }

  if (family === 'workflows' || family === 'workflow') {
    if (action === 'status') return workflows.workflowsStatus(client);
    if (action === 'list') return workflows.workflowsList(client, { page: args.page });
    if (action === 'inspect') return workflows.workflowsInspect(client, name);
    if (action === 'versions') return workflows.workflowsVersions(client, name);
    if (action === 'graph') return workflows.workflowsGraph(client, name, args.version || args.rest[1]);
    if (action === 'run') {
      let params;
      if (args.file) params = JSON.parse(fs.readFileSync(args.file, 'utf8'));
      return workflows.workflowsRun(client, name, { params });
    }
    if (action === 'instances') return workflows.workflowsInstances(client, name);
    if (action === 'instance') return workflows.workflowsInstance(client, name, args.instance || args.rest[1]);
    if (action === 'step') return workflows.workflowsStep(client, name, args.instance || args.rest[1]);
    if (action === 'pause') return workflows.workflowsSetStatus(client, name, args.instance || args.rest[1], 'paused');
    if (action === 'resume') return workflows.workflowsSetStatus(client, name, args.instance || args.rest[1], 'running');
    if (action === 'terminate') return workflows.workflowsSetStatus(client, name, args.instance || args.rest[1], 'terminated');
    if (action === 'event') {
      return workflows.workflowsEvent(client, name, args.instance || args.rest[1], args.event || args.rest[2], {});
    }
    if (action === 'delete') return workflows.workflowsDelete(client, name);
    throw new Error(`unknown workflows action: ${action}`);
  }

  if (family === 'scanner') {
    if (action === 'status') return scanner.scannerStatus(client);
    if (action === 'scan') return scanner.scannerScan(client, args.url || args.rest[0]);
    if (action === 'result' || action === 'status-scan') return scanner.scannerResult(client, args.id || args.rest[0]);
    if (action === 'search') return scanner.scannerSearch(client, { q: args.url || args.rest[0] });
    if (action === 'har') return scanner.scannerHar(client, args.id || args.rest[0]);
    if (action === 'dom') return scanner.scannerDom(client, args.id || args.rest[0]);
    if (action === 'screenshot') return scanner.scannerScreenshot(client, args.id || args.rest[0]);
    if (action === 'bulk') {
      const urls = args.file
        ? fs.readFileSync(args.file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        : args.rest;
      return scanner.scannerBulk(client, urls);
    }
    throw new Error(`unknown scanner action: ${action}`);
  }

  if (family === 'tags') {
    if (action === 'status') return tags.tagsStatus(client);
    if (action === 'keys') return tags.tagsKeys(client);
    if (action === 'values') return tags.tagsValues(client, args.tag || args.rest[0]);
    if (action === 'summary') return tags.tagsSummary(client);
    if (action === 'resources') return tags.tagsResources(client, args.tag ? { tag: args.tag } : {});
    if (action === 'list') return tags.tagsGet(client, args.resource || args.rest[0]);
    if (action === 'vocabulary') return { ok: true, vocabulary: TAG_VOCAB };
    throw new Error(`unknown tags action: ${action}`);
  }

  if (family === 'tag-gateway' || family === 'tag_gateway') {
    const zone = args.zone;
    if (!zone) throw new Error('--zone required');
    if (action === 'status') return tagGateway.tagGatewayStatus(client, zone);
    if (action === 'configure') {
      return tagGateway.tagGatewayConfigure(client, zone, {
        measurementId: args.measurementId,
        endpoint: args.endpoint,
        hideOriginalIp: args.hideOriginalIp,
        setUpTag: args.setUpTag,
        enabled: true,
      });
    }
    if (action === 'disable') return tagGateway.tagGatewayDisable(client, zone);
    throw new Error(`unknown tag-gateway action: ${action}`);
  }

  if (family === 'brand') {
    if (action === 'status') return brandProtection.brandProtectionStatus(client);
    if (action === 'queries') return brandProtection.brandQueries(client);
    if (action === 'matches') return brandProtection.brandMatches(client, args.id ? { query_id: args.id } : {});
    if (action === 'logos') return brandProtection.brandLogos(client);
    if (action === 'logo-matches') return brandProtection.brandLogoMatches(client, args.id || args.rest[0]);
    if (action === 'scan') return brandProtection.brandScanPage(client, args.url || args.rest[0]);
    if (action === 'query' && args.rest[0] === 'add') {
      return brandProtection.brandQueryAdd(client, { query: args.rest[1] || args.name });
    }
    throw new Error(`unknown brand action: ${action}`);
  }

  if (family === 'keyless') {
    const zone = args.zone;
    if (action === 'status') return keyless.keylessStatus(client, zone);
    if (!zone) throw new Error('--zone required');
    if (action === 'list') return keyless.keylessList(client, zone);
    if (action === 'inspect') return keyless.keylessInspect(client, zone, args.id || args.rest[0]);
    if (action === 'enable') return keyless.keylessEnable(client, zone, args.id || args.rest[0]);
    if (action === 'disable') return keyless.keylessDisable(client, zone, args.id || args.rest[0]);
    if (action === 'doctor') return keyless.keylessStatus(client, zone);
    throw new Error(`unknown keyless action: ${action}`);
  }

  if (family === 'pages') {
    const project = args.name || args.rest[0] || '';
    if (action === 'status') return pages.pagesStatus(client);
    if (action === 'list') return pages.pagesList(client, { page: args.page });
    if (action === 'inspect') return pages.pagesInspect(client, project);
    if (action === 'deployments') return pages.pagesDeployments(client, project);
    if (action === 'deployment') return pages.pagesDeployment(client, project, args.id || args.rest[1]);
    if (action === 'logs') return pages.pagesDeploymentLogs(client, project, args.id || args.rest[1]);
    if (action === 'domains') return pages.pagesDomains(client, project);
    if (action === 'purge-cache') return pages.pagesPurgeBuildCache(client, project);
    if (action === 'retry') return pages.pagesRetryDeployment(client, project, args.id || args.rest[1]);
    if (action === 'rollback') return pages.pagesRollbackDeployment(client, project, args.id || args.rest[1]);
    throw new Error(`unknown pages action: ${action}`);
  }

  if (family === 'snippets') {
    const zone = args.zone;
    if (!zone) throw new Error('--zone required');
    const name = args.name || args.rest[0] || '';
    const yes = args.rest.includes('--yes') || false;
    if (action === 'status') return snippets.snippetsStatus(client, zone);
    if (action === 'list') return snippets.snippetsList(client, zone);
    if (action === 'inspect') return snippets.snippetsInspect(client, zone, name);
    if (action === 'content') return snippets.snippetsContent(client, zone, name);
    if (action === 'rules' && (!args.rest[0] || args.rest[0] === 'list')) {
      return snippets.snippetsRulesList(client, zone);
    }
    if (action === 'rules' && args.rest[0] === 'plan') {
      return snippets.snippetsRulesPlan(client, zone, []);
    }
    throw new Error(`unknown snippets action: ${action}`);
  }

  if (family === 'token-validation' || family === 'token_validation') {
    const zone = args.zone;
    if (!zone) throw new Error('--zone required');
    if (action === 'status') return tokenValidation.tokenValidationStatus(client, zone);
    if (action === 'configs') return tokenValidation.tokenValidationListConfigs(client, zone);
    if (action === 'config') return tokenValidation.tokenValidationGetConfig(client, zone, args.id || args.rest[0]);
    if (action === 'rules') return tokenValidation.tokenValidationListRules(client, zone);
    throw new Error(`unknown token-validation action: ${action}`);
  }

  return null;
}

export async function runCloudflare(argv = [], options = {}) {
  const familyPeek = String(argv[0] || 'status').trim().toLowerCase();
  if (isCloudflareLoginFamily(familyPeek)) {
    const loginArgv = familyPeek === 'packs'
      ? ['--list-packs', ...argv.slice(1)]
      : argv.slice(1);
    return runCloudflareBrowserOAuthLogin(loginArgv, options);
  }

  const args = parse(argv);
  if (options.cwd && !argv.includes('--cwd')) args.cwd = path.resolve(options.cwd);
  const write = options.write || ((value) => process.stdout.write(value));
  if (args.help || args.family === 'help') {
    write(help);
    return null;
  }

  try {
    let result;

    if (args.family === 'status' && !args.action) {
      // Prefer API token probe when present; else Wrangler whoami
      if (process.env.CLOUDFLARE_API_TOKEN || options.apiToken) {
        const client = clientFromArgs(args, options);
        // API-token grants are not enumerable OAuth scopes. Start as unknown,
        // then upgrade only the exact read operations confirmed by live probes.
        const matrix = capabilityAuthorizationMatrix([]);
        const core = args.probe ? await probeCloudflareCore(client) : {};
        for (const row of matrix) {
          const verified = core[row.capability_id];
          if (!verified) continue;
          // An authorized GET must never authorize the family's write scope.
          // Keep the API-token scope status 'unknown'; attach read proof only.
          row.probe = verified;
        }
        result = {
          schema: 'agentsam.cloudflare.status.v1',
          provider: 'cloudflare',
          auth: {
            mode: 'api_token',
            token_configured: Boolean(client.apiToken),
            account_id: client.accountId || null,
          },
          capabilities: matrix,
          probes: core,          permission_catalog: 'agentsam cloudflare login --list-packs',
          note: 'OAuth scopes are configured on the Local Studio provider plugin; this raw API-token probe does not infer OAuth grants.',
        };
        // Live probes for key families when account present
        if (client.accountId && args.probe) {
          result.probes = { ...result.probes };
          for (const [key, fn] of [
            ['workflows', () => workflows.workflowsStatus(client)],
            ['scanner', () => scanner.scannerStatus(client)],
          ]) {
            try {
              result.probes[key] = await fn();
            } catch (err) {
              result.probes[key] = err instanceof CloudflareApiError ? err.toJSON() : { ok: false, error: String(err.message || err) };
            }
          }
        }
      } else {
        result = await runWranglerNative('whoami', args, options);
        if (!args.json) {
          const who = parseWhoami(result?.data ?? result?.stdout);
          if (who) { write(renderCloudflareStatus(who)); return result; }
        }
      }
    } else if (args.family === 'commands') {
      result = {
        schema_version: 1,
        native: listWranglerNativeCommands(),
        families: WRANGLER_OPERATION_FAMILIES,
        semantic: [
          'login', 'authorize', 'permissions', 'capabilities', 'workflows', 'scanner', 'tags',
          'tag-gateway', 'brand', 'keyless', 'token-validation', 'pages', 'snippets',
        ],
      };
    } else if (args.family === 'run') {
      if (!args.action) throw new Error('cloudflare native command id required');
      result = await runWranglerNative(args.action, args, options);
    } else if (args.family === 'cpu' && args.action === 'analyze') {
      result = summarizeCloudflareCpuProfileFile({ cwd: path.resolve(args.cwd), file: args.file });
    } else {
      result = await dispatchFamily(args, options);
      if (result == null) {
        write(help);
        return null;
      }
    }

    write(args.json ? `${JSON.stringify(result)}\n` : formatHuman(result));
    return result;
  } catch (error) {
    const payload = error instanceof CloudflareApiError
      ? error.toJSON()
      : { ok: false, error: error?.diagnostic || { code: error?.code || 'cloudflare_operation_failed', message: error?.message || String(error) } };
    if (args.json) write(`${JSON.stringify(payload)}\n`);
    else if (error?.remediation) write(`${formatHuman(payload)}`);
    else write(`${renderDiagnosticError(error)}\n`);
    error.reported = true;
    throw error;
  }
}
