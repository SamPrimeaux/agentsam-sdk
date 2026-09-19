import {
  MCP_PRESETS,
  deleteMcpServer,
  detectInstalledClients,
  inspectClientAdapter,
  listMcpServers,
  listMcpTools,
  pingMcpServer,
  readMcpServer,
  removeServerFromClient,
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

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--client') client = argv[++i] || '';
    else if (arg === '--url') url = argv[++i] || '';
    else if (arg === '--token') token = argv[++i] || '';
    else if (arg === '--json') json = true;
    else if (arg === '--help' || arg === '-h') help = true;
  }

  return {
    subcommand,
    target: target.startsWith('--') ? '' : target,
    client: client.toLowerCase(),
    url,
    token,
    json,
    help,
  };
}

function renderHelp() {
  return `
  AgentSam · MCP Client Management

  Usage:
    agentsam mcp add <name> [--client cursor|claude|all] [--url <url>] [--token <token>]
    agentsam mcp list [--json]
    agentsam mcp status [<name>] [--json]
    agentsam mcp doctor [<name>] [--json]
    agentsam mcp remove <name> [--client cursor|claude|all]

  Known presets:
    inneranimalmedia   https://mcp.inneranimalmedia.com/mcp (218 tools, D1 telemetry)

  Client adapters:
    cursor             ~/.cursor/mcp.json
    claude             ~/Library/Application Support/Claude/claude_desktop_config.json
`;
}

export async function runMcp(argv = [], options = {}) {
  const args = parseMcpArgs(argv);
  const write = options.write || ((text) => process.stdout.write(text));

  if (args.help || !args.subcommand) {
    write(renderHelp());
    return null;
  }

  const { subcommand, target } = args;

  if (subcommand === 'list') {
    const servers = listMcpServers(options);
    if (args.json) {
      write(JSON.stringify({ servers }, null, 2) + '\n');
      return servers;
    }
    if (servers.length === 0) {
      write('  No MCP servers configured yet. Add one with: agentsam mcp add inneranimalmedia\n');
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

  if (subcommand === 'add') {
    const name = target || 'inneranimalmedia';
    const preset = MCP_PRESETS[name];
    const url = args.url || preset?.url;

    if (!url) {
      throw new Error(`missing_url: specify --url for custom MCP server "${name}"`);
    }

    const requestedClients = args.client
      ? (args.client === 'all' ? ['cursor', 'claude'] : [args.client])
      : (preset?.defaultClients || ['cursor']);

    const serverConfig = {
      name,
      url,
      protocol: preset?.protocol || 'sse',
      auth: args.token ? { type: 'bearer', token: args.token } : null,
      clients: requestedClients,
      metadata: preset ? { preset: name, description: preset.description } : {},
    };

    // Store in AgentSam authority
    const written = writeMcpServer(name, serverConfig, options);

    // Materialize client adapters
    const syncedAdapters = [];
    for (const c of requestedClients) {
      const res = syncServerToClient(c, name, serverConfig, options);
      syncedAdapters.push(res);
    }

    // Ping to verify connectivity
    const ping = await pingMcpServer(serverConfig, options);

    if (args.json) {
      const payload = { ok: true, server: written, syncedAdapters, ping };
      write(JSON.stringify(payload, null, 2) + '\n');
      return payload;
    }

    write(`\n  ✓ Configured MCP server: ${name}\n`);
    write(`      Authority:   ~/.agentsam/mcp/${name}.json\n`);
    write(`      URL:         ${url}\n`);
    for (const a of syncedAdapters) {
      write(`      Adapter:     ${a.client} -> ${a.configPath}\n`);
    }
    if (ping.ok) {
      write(`      Ping:        ✓ Connected (${ping.latencyMs}ms)\n`);
    } else {
      write(`      Ping:        ⚠ Warning (${ping.error || 'unreachable'})\n`);
    }
    write('\n');
    return { server: written, syncedAdapters, ping };
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
      inspectClientAdapter(c, name, options)
    );

    const report = {
      name,
      url: server.url,
      ping,
      clients: clientStatuses,
      hasAuth: Boolean(server.auth?.token),
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

    const ping = await pingMcpServer(server, options);
    const clientStatuses = (server.clients || ['cursor']).map((c) =>
      inspectClientAdapter(c, name, options)
    );
    const toolsProbe = ping.ok ? await listMcpTools(server, options) : { count: 0, tools: [] };

    const detectedClients = detectInstalledClients(options);
    const diagnostics = {
      name,
      authorityPath: `~/.agentsam/mcp/${name}.json`,
      url: server.url,
      connectivity: ping.ok ? 'pass' : 'fail',
      latencyMs: ping.latencyMs,
      authConfigured: Boolean(server.auth?.token),
      discoveredTools: toolsProbe.count,
      clients: clientStatuses,
      detectedHostClients: detectedClients,
    };

    if (args.json) {
      write(JSON.stringify(diagnostics, null, 2) + '\n');
      return diagnostics;
    }

    write(`\n  AgentSam MCP Doctor · ${name}\n\n`);
    write(`  [1] Authority state:   ✓ Valid (~/.agentsam/mcp/${name}.json)\n`);
    write(`  [2] Endpoint ping:     ${ping.ok ? `✓ Reachable (${ping.latencyMs}ms)` : `✗ Unreachable (${ping.error})`}\n`);
    write(`  [3] Auth credential:   ${diagnostics.authConfigured ? '✓ Token configured' : '○ Unauthenticated / public'}\n`);
    write(`  [4] Tool discovery:    ${toolsProbe.count > 0 ? `✓ Found ${toolsProbe.count} tools` : '○ 0 tools discovered'}\n`);
    write(`  [5] Client adapters:\n`);
    for (const c of clientStatuses) {
      write(`        • ${c.client}: ${c.configured ? '✓ Synced' : '✗ Desynced'} (${c.path})\n`);
    }
    write('\n');
    return diagnostics;
  }

  if (subcommand === 'remove') {
    const name = target;
    if (!name) throw new Error('mcp_server_name_required');

    const server = readMcpServer(name, options);
    const targetClients = args.client
      ? (args.client === 'all' ? ['cursor', 'claude'] : [args.client])
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
