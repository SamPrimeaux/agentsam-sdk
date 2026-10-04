/**
 * Inner Animal MCP client — service dispatch via AGENTSAM_BRIDGE_KEY.
 *
 * Service discovery SSOT: agentsam_plugins (D1).
 * agentsam_mcp_servers is a temporary compatibility projection only.
 * Production fails closed when the registry has no MCP endpoint — no baked-in URLs.
 */

import { fetchGithubContextForAgent, githubStatus } from "./github-client.js";
import { logToolCall } from "./tools-registry.js";
import { resolveGithubRepo } from "../lib/integration-config.js";
import { resolveApplicationAccountId } from "../lib/account-context.js";

const IAM_MCP_PLUGIN_KEY = "inneranimalmedia-mcp-server";

let endpointsCache = null;
let endpointsCacheAccountId = null;
let endpointsCachedAt = 0;
const ENDPOINTS_TTL_MS = 60_000;

function stripSlash(url) {
  return String(url || "").trim().replace(/\/$/, "");
}

/**
 * Resolve MCP resource endpoint + authorization-server origin from plugins.
 *
 * Hierarchy:
 *   1. agentsam_plugins.endpoint_url (+ metadata.authorization_server)
 *   2. agentsam_mcp_servers.url (legacy projection only)
 *   3. LOCAL_DEV_MCP_URL when ALLOW_MCP_DEV_FALLBACK=1
 *   4. fail closed — ok:false, error: mcp_endpoint_not_configured
 */
export async function resolveIamBridgeEndpoints(env, opts = {}) {
  const explicitAccountId =
    opts.accountId ||
    (env?.ALLOW_INTEGRATION_ENV_OVERRIDE === "1" ? env?.AGENTSAM_ACCOUNT_ID : null);
  const accountId = await resolveApplicationAccountId(env, explicitAccountId);
  if (!accountId) {
    return {
      ok: false,
      error: "application_account_not_configured",
      account_id: null,
      mcp_url: null,
      authorization_server: null,
      iam_origin: null,
      provider_home: null,
      docs_url: null,
      source: null,
      plugin_key: IAM_MCP_PLUGIN_KEY,
    };
  }

  const now = Date.now();
  if (
    endpointsCache &&
    endpointsCacheAccountId === accountId &&
    now - endpointsCachedAt < ENDPOINTS_TTL_MS
  ) {
    return endpointsCache;
  }

  let mcpUrlValue = null;
  let authorizationServer = null;
  let providerHome = null;
  let docsUrl = null;
  let source = null;

  if (env?.DB) {
    try {
      const plugin = await env.DB.prepare(
        `SELECT endpoint_url, metadata_json, config_json, oauth_connect_url
         FROM agentsam_plugins
         WHERE account_id = ? AND plugin_key = ? AND is_enabled = 1
         LIMIT 1`,
      )
        .bind(accountId, IAM_MCP_PLUGIN_KEY)
        .first();

      if (plugin?.endpoint_url) {
        mcpUrlValue = String(plugin.endpoint_url).trim();
        source = "agentsam_plugins";
      }

      if (plugin?.metadata_json) {
        try {
          const meta = JSON.parse(plugin.metadata_json);
          if (meta?.authorization_server) {
            authorizationServer = stripSlash(meta.authorization_server);
          }
          if (meta?.provider_home) {
            providerHome = stripSlash(meta.provider_home);
          }
          if (meta?.docs_url) {
            docsUrl = stripSlash(meta.docs_url);
          }
        } catch {
          /* ignore malformed meta */
        }
      }

      // Compatibility projection only — not a permanent second SSOT.
      if (!mcpUrlValue) {
        const server = await env.DB.prepare(
          `SELECT url FROM agentsam_mcp_servers
           WHERE account_id = ? AND server_key = ? AND is_active = 1
           LIMIT 1`,
        )
          .bind(accountId, IAM_MCP_PLUGIN_KEY)
          .first();
        if (server?.url) {
          mcpUrlValue = String(server.url).trim();
          source = "agentsam_mcp_servers";
        }
      }
    } catch (err) {
      console.error("[mcp-client] plugin endpoint resolve failed", err?.message || err);
    }
  }

  // Explicit local-dev bootstrap only — never silent production hardcoding.
  if (!mcpUrlValue && env?.ALLOW_MCP_DEV_FALLBACK === "1") {
    const devMcp = String(env.LOCAL_DEV_MCP_URL || "").trim();
    const devIssuer = String(env.LOCAL_DEV_IAM_ORIGIN || "").trim();
    if (devMcp) {
      mcpUrlValue = devMcp;
      authorizationServer = stripSlash(devIssuer) || authorizationServer;
      source = "local_dev_override";
    }
  }

  if (!mcpUrlValue) {
    endpointsCache = {
      ok: false,
      account_id: accountId,
      error: "mcp_endpoint_not_configured",
      mcp_url: null,
      authorization_server: null,
      iam_origin: null,
      provider_home: providerHome,
      docs_url: docsUrl,
      source: null,
      plugin_key: IAM_MCP_PLUGIN_KEY,
    };
    endpointsCacheAccountId = accountId;
    endpointsCachedAt = now;
    return endpointsCache;
  }

  // authorization_server is the OAuth issuer; provider_home is marketing/home only.
  const issuer = authorizationServer || providerHome || null;

  endpointsCache = {
    ok: true,
    account_id: accountId,
    error: null,
    mcp_url: mcpUrlValue,
    authorization_server: issuer,
    /** @deprecated prefer authorization_server */
    iam_origin: issuer,
    provider_home: providerHome,
    docs_url: docsUrl,
    source,
    plugin_key: IAM_MCP_PLUGIN_KEY,
  };
  endpointsCacheAccountId = accountId;
  endpointsCachedAt = now;
  return endpointsCache;
}

export async function mcpUrl(env) {
  const resolved = await resolveIamBridgeEndpoints(env);
  return resolved.ok ? resolved.mcp_url : null;
}

export async function iamOrigin(env) {
  const resolved = await resolveIamBridgeEndpoints(env);
  return resolved.ok ? resolved.authorization_server || resolved.iam_origin : null;
}

/**
 * Worker-to-Worker / service-trust key for MCP bridge dispatch (account-scoped cloud path).
 * Not AGENTSAM_API_KEY (account API auth for users/clients).
 * Manual asset/compaction ops use authenticated admin session — not secret-header endpoints.
 */
export function bridgeConfigured(env) {
  return Boolean(String(env.AGENTSAM_BRIDGE_KEY || "").trim());
}

function bridgeKey(env) {
  return String(env.AGENTSAM_BRIDGE_KEY || "").trim();
}

function bridgeHeaders(env, accountId, extra = {}) {
  return {
    Authorization: `Bearer ${bridgeKey(env)}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Tenant-Id": accountId,
    "X-Workspace-Id": accountId,
    ...extra,
  };
}

function parseToolText(result) {
  const text = result?.result?.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function mcpRpc(env, method, params = {}) {
  const key = bridgeKey(env);
  if (!key) return { ok: false, error: "bridge_not_configured" };

  const endpoints = await resolveIamBridgeEndpoints(env);
  if (!endpoints.ok || !endpoints.mcp_url) {
    return { ok: false, error: endpoints.error || "mcp_endpoint_not_configured" };
  }

  try {
    const res = await fetch(endpoints.mcp_url, {
      method: "POST",
      headers: bridgeHeaders(env, endpoints.account_id),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method,
        params,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error?.message || `mcp_http_${res.status}`, data };
    }
    if (data?.error) {
      return { ok: false, error: data.error.message || "mcp_rpc_error", data };
    }
    return { ok: true, result: data.result, data };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function probeBridge(env) {
  if (!bridgeConfigured(env)) {
    return { ok: false, configured: false, error: "bridge_not_configured" };
  }

  const endpoints = await resolveIamBridgeEndpoints(env);
  if (!endpoints.ok) {
    return {
      ok: false,
      configured: true,
      error: endpoints.error || "mcp_endpoint_not_configured",
      endpoint_source: endpoints.source,
    };
  }

  const init = await mcpRpc(env, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "agentsam-ecommerce-cms", version: "1.0.0" },
  });
  if (!init.ok) return { ok: false, configured: true, error: init.error, endpoint_source: endpoints.source };

  const tools = await mcpRpc(env, "tools/list", {});
  const toolCount = tools.ok ? (tools.result?.tools?.length ?? 0) : 0;

  return {
    ok: tools.ok,
    configured: true,
    tool_count: toolCount,
    endpoint_source: endpoints.source,
    mcp_url: endpoints.mcp_url,
    error: tools.ok ? null : tools.error,
  };
}

export async function callMcpTool(env, toolName, args = {}, logCtx = {}) {
  const started = Date.now();
  const result = await mcpRpc(env, "tools/call", { name: toolName, arguments: args });
  const durationMs = Date.now() - started;
  const body = parseToolText(result);

  const logResult = await logToolCall(
    env,
    {
      tool_key: toolName,
      tool_name: toolName,
      mcp_server_key: IAM_MCP_PLUGIN_KEY,
      handler_type: "mcp",
      tool_category: "mcp",
      status: result.ok ? "success" : "failed",
      duration_ms: durationMs,
      error_message: result.ok ? null : result.error,
      input_summary: JSON.stringify({ tool: toolName, args_keys: Object.keys(args || {}) }),
      output_summary: result.ok
        ? String(body?.raw || JSON.stringify(body || {})).slice(0, 240)
        : result.error,
    },
    logCtx,
  );

  return { ...result, tool_call_id: logResult.id || null, duration_ms: durationMs, parsed: body };
}

export async function probeGitHubViaBridge(env) {
  const listed = await callMcpTool(env, "agentsam_github_repo_list", {});
  const body = parseToolText(listed);
  if (!listed.ok) return { connected: false, error: listed.error };
  if (body?.ok === false && body?.error === "github_not_connected") {
    return { connected: false, needs_oauth: true, error: body.error };
  }
  const repos = body?.repos || body?.data?.repos;
  const hasCommerce = Array.isArray(repos)
    ? repos.some((r) => String(r?.full_name || r?.name || "").includes("ember"))
    : body?.ok === true;
  return { connected: body?.ok !== false, has_commerce_repo: hasCommerce, sample: body };
}

export async function fetchGithubContextForChat(env, message, userId = null, logCtx = {}) {
  const started = Date.now();
  const direct = await fetchGithubContextForAgent(env, message, userId);
  if (direct) {
    const repoResolved = await resolveGithubRepo(env);
    return {
      context: direct,
      meta: {
        success: !direct.startsWith("GITHUB:"),
        source: "direct",
        github_repo: repoResolved.repo,
        github_operation: "recent_commits",
        mcp_latency_ms: Date.now() - started,
      },
    };
  }

  if (!bridgeConfigured(env)) {
    return { context: null, meta: null };
  }

  const hay = message.toLowerCase();
  const repoResolved = await resolveGithubRepo(env);
  const repo = repoResolved.repo;

  if (/github|repo|commit|branch|pr|pull request|code|deploy|worker|migration/.test(hay)) {
    const listed = await callMcpTool(env, "agentsam_github_repo_list", {}, logCtx);
    const body = parseToolText(listed);
    const latency = Date.now() - started;

    if (body?.ok === false && body?.error === "github_not_connected") {
      return {
        context:
          "GITHUB MCP (bridge): not connected — set COMMERCE_GITHUB_TOKEN or connect GitHub OAuth in AgentSam.",
        meta: {
          success: false,
          source: "bridge",
          github_repo: repo,
          github_operation: "agentsam_github_repo_list",
          mcp_server: IAM_MCP_PLUGIN_KEY,
          mcp_tool: "agentsam_github_repo_list",
          mcp_success: false,
          mcp_latency_ms: latency,
          tool_call_id: listed.tool_call_id || null,
        },
      };
    }

    if (body?.ok !== false) {
      const hasCommerce = (body?.repos || []).some(
        (r) => String(r.full_name || "").toLowerCase() === repo.toLowerCase(),
      );
      return {
        context: `GITHUB MCP (bridge):\nRepo: ${repo}\nAccessible: ${hasCommerce ? "yes" : "check token scope"}`,
        meta: {
          success: true,
          source: "bridge",
          github_repo: repo,
          github_operation: "agentsam_github_repo_list",
          mcp_server: IAM_MCP_PLUGIN_KEY,
          mcp_tool: "agentsam_github_repo_list",
          mcp_success: true,
          mcp_latency_ms: latency,
          tool_call_id: listed.tool_call_id || null,
        },
      };
    }

    return {
      context: null,
      meta: {
        success: false,
        source: "bridge",
        github_repo: repo,
        github_operation: "agentsam_github_repo_list",
        mcp_server: IAM_MCP_PLUGIN_KEY,
        mcp_tool: "agentsam_github_repo_list",
        mcp_success: false,
        mcp_latency_ms: latency,
        error: listed.error || "mcp_failed",
        tool_call_id: listed.tool_call_id || null,
      },
    };
  }

  return { context: null, meta: null };
}

export async function probeGitHubConnection(env, userId = null) {
  const direct = await githubStatus(env, userId);
  if (direct.connected) return { ...direct, path: "direct" };

  if (!bridgeConfigured(env)) return { connected: false, path: "none" };
  const bridge = await probeGitHubViaBridge(env);
  return { ...bridge, path: "bridge" };
}

export async function mcpConnectUrls(env) {
  const endpoints = await resolveIamBridgeEndpoints(env);
  if (!endpoints.ok || !endpoints.mcp_url) {
    return {
      ok: false,
      error: endpoints.error || "mcp_endpoint_not_configured",
      github_oauth: "/api/admin/agentsam/github/start",
    };
  }

  const issuer = endpoints.authorization_server || endpoints.iam_origin;
  const mcpBase = endpoints.mcp_url.replace(/\/mcp\/?$/, "");
  return {
    ok: true,
    iam_mcp_connect: `${mcpBase}/auth/connect`,
    iam_mcp_authorize: `${mcpBase}/auth/authorize`,
    iam_github_oauth: issuer
      ? `${issuer}/api/oauth/github/start?return_to=${encodeURIComponent("/dashboard/settings/integrations")}`
      : null,
    github_oauth: "/api/admin/agentsam/github/start",
    iam_integrations: issuer ? `${issuer}/dashboard/settings/integrations` : null,
  };
}
