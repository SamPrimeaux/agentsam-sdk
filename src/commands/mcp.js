import {
  deleteMcpServer,
  detectInstalledClients,
  getCloudflareMcpBundle,
  inspectClientAdapter,
  listCloudflareMcpBundles,
  listKnownServers,
  listMcpServers,
  listMcpTools,
  listRegisteredClients,
  pingMcpServer,
  readMcpServer,
  removeServerFromClient,
  resolveServerPreset,
  scopesForCloudflareMcpBundle,
  syncServerToClient,
  writeMcpServer,
} from '../mcp/index.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function parseMcpArgs(argv = []) {
  let subcommand = clean(argv[0]);
  let help = false;
  if (subcommand === '--help' || subcommand === '-h') {
    help = true;
    subcommand = '';
  }
  const target = clean(argv[1]);
  let client = '';
  let url = '';
  let token = '';
  let json = false;
  let catalog = false;
  let bundles = false;
  let pack = '';

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--client') client = argv[++i] || '';
    else if (arg === '--url') url = argv[++i] || '';
    else if (arg === '--token') token = argv[++i] || '';
    else if (arg === '--pack') pack = argv[++i] || '';
    else if (arg === '--json') json = true;
    else if (arg === '--catalog' || arg === '--all') catalog = true;
    else if (arg === '--bundles' || arg === '--cloudflare') bundles = true;
    else if (arg === '--help' || arg === '-h') help = true;
  }

  return {
    subcommand,
    target: target.startsWith('--') ? '' : target,
    client: client.toLowerCase(),
    url,
    token,
    pack: pack.toLowerCase(),
    json,
    catalog,
    bundles,
    help,
  };
}

function renderHelp(options = {}) {
  const clients = listRegisteredClients(options);
  const servers = listKnownServers(options);
  const cfBundles = listCloudflareMcpBundles();

  const presetRows = servers.map((s) => {
    const key = (s.name || s.server_key || '').padEnd(28);
    const desc = s.description || s.display_name || '';
    return `    ${key} ${s.url}`;
  }).join('\n');

  const clientRows = clients.map((c) => {
    const key = c.client_key.padEnd(24);
    return `    ${key} ${c.display_name}`;
  }).join('\n');

  const bundleRows = cfBundles.map((b) => {
    const key = b.name.padEnd(28);
    const packs = (b.feature_packs || []).join(',') || '—';
    return `    ${key} packs=[${packs}]  manage=${(b.portal_manage_scopes || []).join(',')}`;
  }).join('\n');

  return `
  AgentSam · MCP Client Management

  Usage:
    agentsam mcp add <name> [--client <client>|all] [--url <url>] [--token <token>]
    agentsam mcp list [--catalog|--bundles] [--json]
    agentsam mcp status [<name>] [--json]
    agentsam mcp doctor [<name>] [--json]
    agentsam mcp remove <name> [--client <client>|all]
    agentsam mcp scopes <cloudflare-bundle> [--json]

  Notes:
    • Client adapters = IDE hosts (cursor, claude, chatgpt, agentsam) — not CF portals.
    • Cloudflare MCP portals are server bundles; OAuth stays pack-scoped (never all ~315 scopes).
    • CF-connected AgentSam users need mcp-portals.read/write to manage portals (agentsam pack).

  Known server catalog:
${presetRows}

  Cloudflare MCP bundles (granular packs):
${bundleRows}

  Recognized client adapters:
${clientRows}
`;
}

export async function runMcp(argv = [], options = {}) {
  const args = parseMcpArgs(argv);
  const write = options.write || ((text) => process.stdout.write(text));

  if (args.help || !args.subcommand) {
    write(renderHelp(options));
    return null;
  }

  const { subcommand, target } = args;

  if (subcommand === 'list') {
    if (args.bundles) {
      const bundles = listCloudflareMcpBundles().map((b) => ({
        ...b,
        suggested_oauth_scopes: scopesForCloudflareMcpBundle(b.name),
      }));
      if (args.json) {
        write(JSON.stringify({ bundles }, null, 2) + '\n');
        return bundles;
      }
      write('\n  Cloudflare MCP portal bundles\n\n');
      for (const b of bundles) {
        write(`  • ${b.name} — ${b.display_name}\n`);
        write(`      url:     ${b.url}\n`);
        write(`      packs:   ${(b.feature_packs || []).join(', ') || '(portal OAuth only)'}\n`);
        write(`      manage:  ${(b.portal_manage_scopes || []).join(', ')}\n`);
        write(`      scopes:  ${b.suggested_oauth_scopes.slice(0, 8).join(' ')}${b.suggested_oauth_scopes.length > 8 ? ' …' : ''}\n\n`);
      }
      return bundles;
    }

    if (args.catalog) {
      const catalog = listKnownServers(options);
      if (args.json) {
        write(JSON.stringify({ catalog }, null, 2) + '\n');
        return catalog;
      }
      write('\n  Known MCP Server Catalog\n\n');
      for (const s of catalog) {
        write(`  • ${s.name || s.server_key} (${s.display_name || s.name})\n`);
        write(`      url:       ${s.url}\n`);
        write(`      auth_type: ${s.auth_type || 'none'}\n`);
        write(`      protocol:  ${s.protocol || 'streamable_http'}\n\n`);
      }
      return catalog;
    }

    const servers = listMcpServers(options);
    if (args.json) {
      write(JSON.stringify({ servers }, null, 2) + '\n');
      return servers;
    }
    if (servers.length === 0) {
      write('  No MCP servers configured yet. Add one with: agentsam mcp add inneranimalmedia\n');
      write('  Cloudflare portals: agentsam mcp list --bundles\n');
      return servers;
    }
    write('\n  Configured MCP Servers (Authority: ~/.agentsam/mcp/)\n\n');
    for (const s of servers) {
      write(`  • ${s.name}\n`);
      write(`      url:     ${s.url}\n`);
      write(`      clients: ${(s.clients || []).join(', ') || 'none'}\n`);
      write(`      auth:    ${s.auth?.token ? 'bearer token configured' : 'none'}\n`);
      write(`      updated: ${s.updated_at || s.created_at || 'unknown'}\n\n`);
    }
    return servers;
  }

  if (subcommand === 'scopes') {
    const name = target;
    if (!name) throw new Error('mcp_bundle_name_required');
    const bundle = getCloudflareMcpBundle(name);
    if (!bundle) {
      throw new Error(`unknown_cloudflare_mcp_bundle:${name}`);
    }
    const scopes = scopesForCloudflareMcpBundle(name);
    const payload = {
      bundle: bundle.name,
      url: bundle.url,
      feature_packs: bundle.feature_packs,
      capability_ids: bundle.capability_ids,
      portal_manage_scopes: bundle.portal_manage_scopes,
      oauth_scopes: scopes,
      authorize_hint: `agentsam cloudflare permissions authorize --packs ${(bundle.feature_packs || ['agentsam']).join(',')}`,
      note: 'Never request CLOUDFLARE_ALL_SCOPES (~315) at once — upgrade by pack.',
    };
    if (args.json) {
      write(JSON.stringify(payload, null, 2) + '\n');
      return payload;
    }
    write(`\n  OAuth scopes for MCP bundle: ${name}\n`);
    write(`      URL:    ${bundle.url}\n`);
    write(`      Packs:  ${(bundle.feature_packs || []).join(', ') || '(none)'}\n`);
    write(`      Manage: ${(bundle.portal_manage_scopes || []).join(', ')}\n`);
    write(`      Scopes (${scopes.length}):\n`);
    for (const s of scopes) write(`        • ${s}\n`);
    write(`\n  ${payload.authorize_hint}\n\n`);
    return payload;
  }

  if (subcommand === 'add') {
    const name = target;
    if (!name) {
      throw new Error('mcp_server_name_required: agentsam mcp add <name> [--url <url>]');
    }

    const preset = resolveServerPreset(name, options);
    const url = args.url || preset?.url;

    if (!url) {
      throw new Error(`missing_url: specify --url for custom MCP server "${name}" (or use a catalog name from: agentsam mcp list --catalog)`);
    }

    let requestedClients = ['cursor'];
    if (args.client) {
      if (args.client === 'all') {
        const detected = detectInstalledClients(options);
        requestedClients = detected.length > 0 ? detected : ['cursor', 'claude'];
      } else {
        requestedClients = [args.client];
      }
    } else if (preset?.defaultClients?.length) {
      requestedClients = preset.defaultClients;
    }

    const cfBundle = getCloudflareMcpBundle(name);
    const packHint = args.pack || (cfBundle?.feature_packs || [])[0] || '';

    const serverConfig = {
      name,
      url,
      protocol: preset?.protocol || 'streamable_http',
      auth: args.token
        ? { type: preset?.auth_type === 'none' ? 'bearer' : (preset?.auth_type || 'bearer'), token: args.token }
        : null,
      clients: requestedClients,
      metadata: {
        ...(preset
          ? {
              preset: name,
              description: preset.description,
              provider: preset.provider || null,
              kind: preset.kind || null,
              feature_packs: preset.feature_packs || [],
              capability_ids: preset.capability_ids || [],
              portal_manage_scopes: preset.portal_manage_scopes || [],
            }
          : {}),
        pack_hint: packHint || null,
      },
    };

    const written = writeMcpServer(name, serverConfig, options);

    const syncedAdapters = [];
    for (const c of requestedClients) {
      const res = syncServerToClient(c, name, serverConfig, options);
      syncedAdapters.push(res);
    }

    const ping = await pingMcpServer(serverConfig, options);
    const scopePreview = cfBundle ? scopesForCloudflareMcpBundle(name) : null;

    if (args.json) {
      const payload = {
        ok: true,
        server: written,
        syncedAdapters,
        ping,
        cloudflare_bundle: cfBundle
          ? {
              feature_packs: cfBundle.feature_packs,
              portal_manage_scopes: cfBundle.portal_manage_scopes,
              suggested_oauth_scopes: scopePreview,
            }
          : null,
      };
      write(JSON.stringify(payload, null, 2) + '\n');
      return payload;
    }

    write(`\n  ✓ Configured MCP server: ${name}\n`);
    write(`      Authority:   ~/.agentsam/mcp/${name}.json\n`);
    write(`      URL:         ${url}\n`);
    write(`      Protocol:    ${serverConfig.protocol}\n`);
    for (const a of syncedAdapters) {
      write(`      Adapter:     ${a.client} -> ${a.configPath}\n`);
    }
    if (ping.ok) {
      write(`      Ping:        ✓ Connected (${ping.latencyMs}ms${ping.transport ? `, ${ping.transport}` : ''})\n`);
    } else {
      write(`      Ping:        ⚠ Warning (${ping.error || 'unreachable'})\n`);
    }
    if (cfBundle) {
      write(`      CF packs:    ${(cfBundle.feature_packs || []).join(', ') || '(portal-hosted OAuth)'}\n`);
      write(`      Portal:      ${(cfBundle.portal_manage_scopes || []).join(', ')}\n`);
      write(`      Upgrade:     agentsam mcp scopes ${name}\n`);
      write(`                  (CF-connected users: ensure agentsam pack includes mcp-portals.*)\n`);
    }
    write('\n');
    return { ok: true, server: written, syncedAdapters, ping };
  }

  if (subcommand === 'status') {
    const name = target || 'inneranimalmedia';
    const server = readMcpServer(name, options);
    if (!server) {
      if (args.json) {
        write(JSON.stringify({ ok: false, error: 'server_not_configured', name }) + '\n');
        return null;
      }
      write(`  MCP server "${name}" is not configured. Run: agentsam mcp add ${name}\n`);
      return null;
    }

    const ping = await pingMcpServer(server, options);
    const clientStatuses = (server.clients || ['cursor']).map((c) =>
      inspectClientAdapter(c, name, options),
    );

    const report = {
      name,
      url: server.url,
      protocol: server.protocol,
      ping,
      clients: clientStatuses,
      hasAuth: Boolean(server.auth?.token),
      metadata: server.metadata || {},
    };

    if (args.json) {
      write(JSON.stringify(report, null, 2) + '\n');
      return report;
    }

    write(`\n  MCP Server Status: ${name}\n`);
    write(`      URL:       ${server.url}\n`);
    write(`      Ping:      ${ping.ok ? `✓ Active (${ping.latencyMs}ms)` : `✗ Error: ${ping.error}`}\n`);
    write(`      Auth:      ${report.hasAuth ? '✓ Bearer token present' : '○ No auth token'}\n`);
    for (const c of clientStatuses) {
      write(`      ${c.client}:    ${c.configured ? '✓ Configured' : '○ Not configured'} (${c.path})\n`);
    }
    write('\n');
    return report;
  }

  if (subcommand === 'doctor') {
    const name = target || 'inneranimalmedia';
    const server = readMcpServer(name, options);

    if (!server) {
      const errPayload = { ok: false, error: 'server_not_configured', name };
      if (args.json) write(JSON.stringify(errPayload, null, 2) + '\n');
      else write(`  MCP server "${name}" is not configured.\n`);
      return errPayload;
    }

    const preset = resolveServerPreset(name, options);
    const ping = await pingMcpServer(server, options);
    const clientStatuses = (server.clients || ['cursor']).map((c) =>
      inspectClientAdapter(c, name, options),
    );
    const toolsProbe = ping.ok ? await listMcpTools(server, options) : { count: 0, tools: [] };

    const detectedClients = detectInstalledClients(options);
    const cfBundle = getCloudflareMcpBundle(name);
    const diagnostics = {
      name,
      authorityPath: `~/.agentsam/mcp/${name}.json`,
      url: server.url,
      connectivity: ping.ok ? 'pass' : 'fail',
      latencyMs: ping.latencyMs,
      transport: ping.transport || null,
      authConfigured: Boolean(server.auth?.token),
      discoveredTools: toolsProbe.count,
      clients: clientStatuses,
      detectedHostClients: detectedClients,
      catalog: preset
        ? {
            auth_type: preset.auth_type,
            protocol: preset.protocol,
            provider: preset.provider,
            feature_packs: preset.feature_packs || [],
            portal_manage_scopes: preset.portal_manage_scopes || [],
          }
        : null,
      cloudflare_oauth_hint: cfBundle
        ? {
            packs: cfBundle.feature_packs,
            scopes: scopesForCloudflareMcpBundle(name),
            note: 'Authorize packs via agentsam cloudflare permissions — not the full scope catalog.',
          }
        : null,
    };

    if (args.json) {
      write(JSON.stringify(diagnostics, null, 2) + '\n');
      return diagnostics;
    }

    write(`\n  AgentSam MCP Doctor · ${name}\n\n`);
    write(`  [1] Authority state:   ✓ Valid (~/.agentsam/mcp/${name}.json)\n`);
    write(`  [2] Endpoint ping:     ${ping.ok ? `✓ Reachable (${ping.latencyMs}ms)` : `✗ Unreachable (${ping.error})`}\n`);
    write(`  [3] Catalog:           ${preset ? `${preset.auth_type} / ${preset.protocol}` : 'custom'}\n`);
    write(`  [4] Auth credential:   ${diagnostics.authConfigured ? '✓ Token configured' : '○ Unauthenticated / public'}\n`);
    write(`  [5] Tool discovery:    ${toolsProbe.count > 0 ? `✓ Found ${toolsProbe.count} tools` : '○ 0 tools discovered'}\n`);
    write(`  [6] Client adapters:\n`);
    for (const c of clientStatuses) {
      write(`        • ${c.client}: ${c.configured ? '✓ Synced' : '✗ Desynced'} (${c.path})\n`);
    }
    if (cfBundle) {
      write(`  [7] CF portal packs:   ${(cfBundle.feature_packs || []).join(', ') || '—'}\n`);
      write(`      Portal manage:     ${(cfBundle.portal_manage_scopes || []).join(', ')}\n`);
    }
    write('\n');
    return diagnostics;
  }

  if (subcommand === 'remove') {
    const name = target;
    if (!name) throw new Error('mcp_server_name_required');

    const server = readMcpServer(name, options);
    const targetClients = args.client
      ? (args.client === 'all' ? (server?.clients || ['cursor', 'claude']) : [args.client])
      : (server?.clients || ['cursor', 'claude']);

    const removedAdapters = [];
    for (const c of targetClients) {
      const res = removeServerFromClient(c, name, options);
      removedAdapters.push(res);
    }

    let deletedAuthority = false;
    if (!args.client || args.client === 'all') {
      deletedAuthority = deleteMcpServer(name, options);
    }

    const result = { name, removedAdapters, deletedAuthority };
    if (args.json) {
      write(JSON.stringify(result, null, 2) + '\n');
      return result;
    }

    write(`\n  ✓ Removed MCP server: ${name}\n`);
    for (const r of removedAdapters) {
      if (r.removed) write(`      Removed from client adapter: ${r.client} (${r.configPath})\n`);
    }
    if (deletedAuthority) {
      write(`      Deleted authority: ~/.agentsam/mcp/${name}.json\n`);
    }
    write('\n');
    return result;
  }

  write(`  Unknown mcp subcommand: "${subcommand}". Use "agentsam mcp --help" for guidance.\n`);
  return null;
}
