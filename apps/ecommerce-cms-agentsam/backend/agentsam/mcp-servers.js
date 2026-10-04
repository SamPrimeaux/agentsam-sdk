/**
 * MCP server registry — Inner Animal bridge + GitHub via IAM MCP.
 */

import {
  bridgeConfigured,
  mcpConnectUrls,
  probeBridge,
  probeGitHubConnection,
  resolveIamBridgeEndpoints,
} from "./mcp-client.js";
import { listAgentSamMcpServers } from "./tools-registry.js";

export const MCP_SERVERS = [
  {
    id: "mcp_inneranimalmedia",
    slug: "inneranimalmedia-mcp-server",
    display_name: "Inner Animal MCP",
    description: "Platform tools, D1, Workers, GitHub catalog, and cross-project dispatch.",
    /** URL resolved at runtime from agentsam_plugins — do not hardcode in wrangler. */
    transport: "remote_jsonrpc",
    auth_type: "bridge",
    tool_lanes: ["database", "terminal", "repo", "memory", "github"],
    env_secrets: ["AGENTSAM_BRIDGE_KEY"],
  },
  {
    id: "mcp_github",
    slug: "github",
    display_name: "GitHub",
    description: "Repo issues, PRs, file context, and code search for ember.",
    transport: "iam_mcp_catalog",
    auth_type: "oauth_via_iam",
    parent_server: "inneranimalmedia-mcp-server",
    tool_lanes: ["repo", "code"],
    repos: ["InnerAnimalMedia/commerce-demo"],
    env_secrets: ["AGENTSAM_BRIDGE_KEY"],
  },
];

export async function listMcpServersForUi(env, userId = null) {
  const bridge = bridgeConfigured(env);
  let bridgeReady = false;
  let githubReady = false;

  if (bridge) {
    const probe = await probeBridge(env);
    bridgeReady = probe.ok;
  }

  const gh = await probeGitHubConnection(env, userId);
  githubReady = gh.connected === true;

  const urls = await mcpConnectUrls(env);
  const endpoints = await resolveIamBridgeEndpoints(env);
  const registryOk = endpoints.ok === true;
  const dbServers = await listAgentSamMcpServers(env);

  if (dbServers.length) {
    return dbServers.map((s) => {
      const isGithub = s.server_key === "github";
      const isIam = s.server_key.includes("inneranimalmedia");
      let status = "needs_bridge";
      let connected = false;

      if (isIam && !registryOk) {
        status = "mcp_endpoint_not_configured";
      } else if (!bridge && s.auth_type !== "none") {
        status = "needs_bridge";
      } else if (isIam) {
        status = bridgeReady ? "ready" : "dev";
        connected = bridgeReady;
      } else if (isGithub) {
        status = githubReady ? "ready" : bridgeReady ? "needs_oauth" : "needs_bridge";
        connected = githubReady;
      } else if (s.auth_type === "none") {
        status = s.is_active ? "planned" : "disabled";
      }

      return {
        id: s.id,
        slug: s.server_key,
        display_name: s.display_name,
        description: s.description,
        url: s.url || (isIam && registryOk ? endpoints.mcp_url : undefined),
        status,
        tool_lanes: s.tool_lanes,
        connected,
        auth_type: s.auth_type,
        connect_urls: isGithub || isIam ? urls : undefined,
      };
    });
  }

  return MCP_SERVERS.map((s) => {
    const isGithub = s.slug === "github";
    const isIam = s.slug.includes("inneranimalmedia");
    let status = "needs_bridge";
    let connected = false;

    if (isIam && !registryOk) {
      status = "mcp_endpoint_not_configured";
    } else if (!bridge) {
      status = "needs_bridge";
    } else if (isIam) {
      status = bridgeReady ? "ready" : "dev";
      connected = bridgeReady;
    } else if (isGithub) {
      status = githubReady ? "ready" : bridgeReady ? "needs_oauth" : "needs_bridge";
      connected = githubReady;
    }

    return {
      id: s.id,
      slug: s.slug,
      display_name: s.display_name,
      description: s.description,
      url: isIam && registryOk ? endpoints.mcp_url : undefined,
      status,
      tool_lanes: s.tool_lanes,
      connected,
      auth_type: s.auth_type,
      connect_urls: isGithub || isIam ? urls : undefined,
    };
  });
}

export function selectMcpServers(intent, message) {
  const hay = `${intent} ${message}`.toLowerCase();
  const picked = [];

  for (const server of MCP_SERVERS) {
    let score = 0;
    if (intent === "code" || intent === "deploy") score += 3;
    if (/github|pr|pull request|commit|repo|branch|issue/.test(hay)) score += 5;
    if (/d1|worker|cloudflare|deploy|inneranimal|platform|mcp/.test(hay)) score += 4;
    if (server.tool_lanes.some((lane) => hay.includes(lane))) score += 1;
    if (score > 0) picked.push({ server, score });
  }

  picked.sort((a, b) => b.score - a.score);
  return picked.slice(0, 2).map((p) => p.server);
}

export function formatMcpForPrompt(servers, bridgeReady = false) {
  if (!servers?.length) return "";
  const lines = servers.map((s) => {
    const auth =
      s.auth_type === "bridge"
        ? "auth: AGENTSAM_BRIDGE_KEY service trust"
        : "auth: GitHub OAuth via IAM MCP (bridge dispatches catalog tools)";
    const live = bridgeReady ? "bridge: connected" : "bridge: configure AGENTSAM_BRIDGE_KEY";
    return `- ${s.display_name} (${s.slug}) — ${s.description} [${live}; ${auth}]`;
  });
  return `MCP TOOL LANES:\n${lines.join("\n")}`;
}

export async function mcpRuntimeConfig(env) {
  const endpoints = await resolveIamBridgeEndpoints(env);
  return {
    ok: endpoints.ok,
    error: endpoints.error,
    mcp_url: endpoints.mcp_url,
    authorization_server: endpoints.authorization_server,
    iam_origin: endpoints.authorization_server || endpoints.iam_origin,
    provider_home: endpoints.provider_home,
    docs_url: endpoints.docs_url,
    mcp_endpoint_source: endpoints.source,
    bridge_configured: bridgeConfigured(env),
    connect_urls: await mcpConnectUrls(env),
  };
}
