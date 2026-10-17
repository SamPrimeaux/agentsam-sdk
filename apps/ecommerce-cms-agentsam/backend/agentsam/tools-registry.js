/**
 * AgentSam tools registry — D1-backed catalog (IAM parity, FNF scoped).
 */

import { requireApplicationAccountId } from "../lib/account-context.js";
import { resolveGithubRepo } from "../lib/integration-config.js";
import { isToolKeyAllowed } from "./feature-gates.js";
import { sanitizeAnalyticsText } from "./analytics.js";

function parseJson(raw, fallback = null) {
  try {
    if (raw == null || raw === "") return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function mapToolRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tool_name: row.tool_name,
    tool_key: row.tool_key,
    display_name: row.display_name,
    tool_category: row.tool_category,
    handler_type: row.handler_type,
    handler_key: row.handler_key || null,
    description: row.description,
    input_schema: parseJson(row.input_schema, {}),
    handler_config: parseJson(row.handler_config, {}),
    resource_scope: parseJson(row.resource_scope_json, {}),
    operations: parseJson(row.operations_json, []),
    intent_tags: parseJson(row.intent_tags, []),
    app_id: row.app_id || null,
    plugin_key: row.plugin_key || null,
    plugin_id: row.plugin_id || null,
    mcp_server_key: row.mcp_server_key,
    mcp_service_url: row.mcp_service_url,
    dispatch_target: row.dispatch_target,
    risk_level: row.risk_level,
    requires_approval: !!row.requires_approval,
    requires_confirmation: !!row.requires_confirmation,
    connector_access_class: row.connector_access_class || "read",
    route_key: row.route_key,
    workflow_key: row.workflow_key,
    task_type: row.task_type,
    domain: row.domain,
    capability_key: row.capability_key,
    sort_priority: row.sort_priority,
    is_active: !!row.is_active,
    is_degraded: !!row.is_degraded,
  };
}

function mapServerRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    server_key: row.server_key,
    display_name: row.display_name,
    description: row.description,
    url: row.url,
    auth_type: row.auth_type,
    transport: row.transport,
    tool_lanes: parseJson(row.tool_lanes_json, []),
    repos: parseJson(row.repos_json, []),
    is_active: !!row.is_active,
    health_status: row.health_status,
    metadata: parseJson(row.metadata_json, {}),
    source: row.source || null,
  };
}


/**
 * Validate a registered operation against this installation's actual bindings and
 * authenticated account. Resource names and repository authority come from the
 * installed runtime/D1 plugins, never merchant-specific constants in application JS.
 *
 * A scope error denies only the offending operation; it must not erase the catalog.
 */
async function matchesInstalledToolScope(env, tool, accountId) {
  const cfg = tool.handler_config || {};
  const scope = tool.resource_scope || {};
  if (scope.account_id && scope.account_id !== accountId) return false;

  if (cfg.binding) {
    const bindingName = String(cfg.binding);
    const binding = env?.[bindingName];
    if (!binding || (typeof binding !== "object" && typeof binding !== "function")) return false;
    if (tool.handler_type === "d1" && typeof binding.prepare !== "function") return false;
    if (tool.handler_type === "vectorize" && typeof binding.query !== "function") return false;
    if (tool.handler_type === "ai" && typeof binding.run !== "function") return false;
    if (tool.handler_type === "cf" && !(
      typeof binding.list === "function" ||
      typeof binding.get === "function" ||
      typeof binding.run === "function"
    )) return false;
  }

  const repos = cfg.repo_allowlist || scope.github_repos || [];
  if (repos && (!Array.isArray(repos) || repos.some(r => typeof r !== "string" || !r.trim()))) return false;
  if (repos.length) {
    const installed = await resolveGithubRepo(env, { accountId });
    if (!installed.ok || !installed.repo) return false;
    const authorizedRepo = installed.repo.toLowerCase();
    if (!repos.every(repo => repo.toLowerCase() === authorizedRepo)) return false;
  }
  return true;
}

/**
 * Convert D1 tool rows into Workers AI traditional function definitions.
 * Tool keys stay stable/provider-specific; capability keys remain domain-level policy.
 */
export function toolsForWorkersAi(tools = []) {
  return (tools || [])
    .filter((tool) => tool?.tool_key && tool?.is_active !== false)
    .map((tool) => ({
      name: tool.tool_key,
      description: tool.description || tool.display_name || tool.tool_key,
      parameters:
        tool.input_schema && typeof tool.input_schema === "object"
          ? tool.input_schema
          : { type: "object", properties: {} },
    }));
}

/** Prompt guidance; never insert hardcoded resource identities or trust this as ACL. */
export function formatScopeForPrompt() {
  return "TOOL ACCESS: Tools execute only against the authenticated installation's " +
    "authorized account, enabled provider integrations and runtime resource bindings. " +
    "Unregistered resources, unapproved writes and cross-account access must be denied. " +
    "Tool metadata does not grant permissions; the executor enforces them.";
}

export function scoreTool(
  tool,
  { intent, message, workflowKey, taskType, domain, appId, routeContext },
) {
  let score = 0;
  let matched = false;
  const hay =
    `${intent || ""} ${message || ""} ${workflowKey || ""} ${taskType || ""} ${routeContext || ""}`
      .toLowerCase();
  const tags = tool.intent_tags || [];

  for (const tag of tags) {
    const t = String(tag).toLowerCase();
    if (t && hay.includes(t)) {
      score += 3;
      matched = true;
    }
  }

  if (tool.app_id && appId && tool.app_id === appId) {
    score += 10;
    matched = true;
  }
  if (tool.route_key && intent && tool.route_key === intent) {
    score += 4;
    matched = true;
  }
  if (tool.workflow_key && workflowKey && tool.workflow_key === workflowKey) {
    score += 6;
    matched = true;
  }
  if (tool.task_type && taskType && tool.task_type === taskType) {
    score += 4;
    matched = true;
  }
  if (tool.domain && domain && tool.domain === domain) {
    score += 2;
    matched = true;
  }

  if (!matched) return 0;
  score += Math.max(0, 50 - (tool.sort_priority || 50)) / 10;
  return score;
}

export async function listAgentSamTools(env, options = {}) {
  if (!env?.DB) return [];

  const includeInactive = options.includeInactive === true;
  const clauses = ["account_id = ?", "(account_id IS NULL OR account_id = ?)"];
  const binds = [options.account_id || requireApplicationAccountId(), options.account_id || requireApplicationAccountId()];

  if (!includeInactive) clauses.push("is_active = 1");
  if (options.includeDegraded !== true) clauses.push("is_degraded = 0");
  if (options.handler_type) {
    clauses.push("handler_type = ?");
    binds.push(options.handler_type);
  }
  if (options.domain) {
    clauses.push("domain = ?");
    binds.push(options.domain);
  }
  if (options.workflow_key) {
    clauses.push("(workflow_key IS NULL OR workflow_key = ?)");
    binds.push(options.workflow_key);
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT *
       FROM agentsam_tools
       WHERE ${clauses.join(" AND ")}
       ORDER BY sort_priority ASC, display_name ASC`
    )
      .bind(...binds)
      .all();

    const accepted = [];
    const accountId = options.account_id || requireApplicationAccountId();
    for (const row of results || []) {
      try {
        const tool = mapToolRow(row);
        if (!tool || !isToolKeyAllowed(tool.tool_key, tool.display_name)) continue;
        if (await matchesInstalledToolScope(env, tool, accountId)) accepted.push(tool);
      } catch (error) {
        // Broken configuration never takes down discovery for otherwise valid tools.
        console.warn("agentsam tool scope denied", row?.tool_key, String(error?.message || error));
      }
    }
    return accepted;
  } catch (err) {
    console.error("agentsam tools list failed", err?.message || err);
    return [];
  }
}

export async function getAgentSamTool(env, toolKey) {
  if (!env?.DB || !toolKey) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT * FROM agentsam_tools
       WHERE account_id = ? AND tool_key = ? AND is_active = 1 AND is_degraded = 0
       LIMIT 1`
    )
      .bind(requireApplicationAccountId(), toolKey)
      .first();
    const tool = mapToolRow(row);
    if (!tool || tool.is_degraded || !tool.is_active || !isToolKeyAllowed(tool.tool_key, tool.display_name)) return null;
    return await matchesInstalledToolScope(env, tool, requireApplicationAccountId()) ? tool : null;
  } catch {
    return null;
  }
}

/**
 * MCP install list — prefer agentsam_plugins (plugin_kind=mcp).
 * agentsam_mcp_servers remains a temporary compatibility projection only.
 */
export async function listAgentSamMcpServers(env) {
  if (!env?.DB) return [];
  try {
    const { results: plugins } = await env.DB.prepare(
      `SELECT id, plugin_key, display_name, description, endpoint_url,
              transport, auth_type, is_enabled, health_status, metadata_json, config_json
       FROM agentsam_plugins
       WHERE account_id = ? AND is_enabled = 1
         AND (plugin_kind = 'mcp' OR plugin_key LIKE '%mcp%')
       ORDER BY display_name ASC`,
    )
      .bind(requireApplicationAccountId())
      .all();

    if (plugins?.length) {
      return plugins.map((p) =>
        mapServerRow({
          id: p.id,
          server_key: p.plugin_key,
          display_name: p.display_name || p.plugin_key,
          description: p.description,
          url: p.endpoint_url,
          transport: p.transport,
          auth_type: p.auth_type,
          is_active: p.is_enabled,
          health_status: p.health_status,
          metadata_json: p.metadata_json,
          config_json: p.config_json,
          source: "agentsam_plugins",
        }),
      );
    }

    // Compatibility projection — do not add new writers here.
    const { results } = await env.DB.prepare(
      `SELECT *
       FROM agentsam_mcp_servers
       WHERE account_id = ? AND is_active = 1
       ORDER BY display_name ASC`,
    )
      .bind(requireApplicationAccountId())
      .all();
    return (results || []).map((row) => mapServerRow({ ...row, source: "agentsam_mcp_servers" }));
  } catch (err) {
    console.error("agentsam mcp servers list failed", err?.message || err);
    return [];
  }
}

export async function listToolPolicyKeys(env, policyKind) {
  if (!env?.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT tool_key, sort_order, notes
       FROM agentsam_tool_policy_keys
       WHERE account_id = ? AND policy_kind = ? AND is_active = 1
       ORDER BY sort_order ASC`
    )
      .bind(requireApplicationAccountId(), policyKind)
      .all();
    return results || [];
  } catch {
    return [];
  }
}

export async function selectToolsForChat(env, routing = {}) {
  const tools = await listAgentSamTools(env);
  const essentialKeys = new Set(
    (await listToolPolicyKeys(env, "agent_chat_essential")).map((r) => r.tool_key)
  );

  const scored = tools
    .map((tool) => ({
      tool,
      score: scoreTool(tool, routing),
      essential: essentialKeys.has(tool.tool_key),
    }))
    .filter((entry) => entry.score > 0 || entry.essential)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.essential !== b.essential) return a.essential ? -1 : 1;
      return (a.tool.sort_priority || 50) - (b.tool.sort_priority || 50);
    });

  return scored.slice(0, routing.limit || 8).map((e) => e.tool);
}

export async function getToolsRegistryStatus(env) {
  let toolsCount = 0;
  let mcpServersCount = 0;
  let policyKeysCount = 0;

  try {
    if (env?.DB) {
      const t = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM agentsam_tools WHERE account_id = ? AND is_active = 1`
      )
        .bind(requireApplicationAccountId())
        .first();
      toolsCount = t?.n ?? 0;

      const s = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM agentsam_mcp_servers WHERE account_id = ? AND is_active = 1`
      )
        .bind(requireApplicationAccountId())
        .first();
      mcpServersCount = s?.n ?? 0;

      const p = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM agentsam_tool_policy_keys WHERE account_id = ? AND is_active = 1`
      )
        .bind(requireApplicationAccountId())
        .first();
      policyKeysCount = p?.n ?? 0;
    }
  } catch {
    /* tables may not exist yet */
  }

  return {
    tools_registry_count: toolsCount,
    mcp_servers_registered: mcpServersCount,
    tool_policy_keys_count: policyKeysCount,
  };
}

export function formatToolsForPrompt(tools = []) {
  const scopeBlock = formatScopeForPrompt();
  if (!tools?.length) return scopeBlock;

  const lines = tools.map((t) => {
    const approval = t.requires_approval ? " [approval required]" : "";
    const lane = t.mcp_server_key ? ` via ${t.mcp_server_key}` : "";
    return `- ${t.display_name} (${t.tool_key}) — ${t.description}${lane}${approval}`;
  });
  return `${scopeBlock}\n\nAVAILABLE TOOLS:\n${lines.join("\n")}`;
}

/**
 * Log a tool invocation to agentsam_tool_call_log. Never throws.
 */
export async function logToolCall(env, event, options = {}) {
  try {
    if (!env?.DB || !event?.tool_key) return { logged: false };

    const id = event.id || `atcl_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

    const write = env.DB.prepare(
      `INSERT INTO agentsam_tool_call_log (
         id, account_id, session_id, conversation_id, message_id, run_id, user_id,
         tool_name, tool_key, agentsam_tools_id, tool_category, mcp_server_key, handler_type,
         status, duration_ms, error_message, cost_usd, input_tokens, output_tokens,
         input_summary, output_summary, retry_count
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        requireApplicationAccountId(),
        options.session_id ?? null,
        options.conversation_id ?? null,
        options.message_id ?? null,
        options.run_id ?? null,
        options.user_id ?? null,
        event.tool_name || event.tool_key,
        event.tool_key,
        event.agentsam_tools_id ?? null,
        event.tool_category ?? null,
        event.mcp_server_key ?? null,
        event.handler_type ?? null,
        event.status || "success",
        event.duration_ms ?? null,
        event.error_message ? sanitizeAnalyticsText(event.error_message, 500) : null,
        event.cost_usd ?? 0,
        event.input_tokens ?? 0,
        event.output_tokens ?? 0,
        event.input_summary ? sanitizeAnalyticsText(event.input_summary, 240) : null,
        event.output_summary ? sanitizeAnalyticsText(event.output_summary, 240) : null,
        event.retry_count ?? 0
      )
      .run()
      .catch((err) => console.error("tool call log insert failed", err?.message || err));

    const waitUntil = options.ctx?.waitUntil;
    if (typeof waitUntil === "function") {
      waitUntil(write);
      return { logged: true, id, async: true };
    }
    await write;
    return { logged: true, id, async: false };
  } catch (err) {
    console.error("logToolCall failed", err?.message || err);
    return { logged: false };
  }
}

export async function listToolsGrouped(env) {
  const tools = await listAgentSamTools(env);
  const grouped = {};

  for (const tool of tools) {
    const cat = tool.tool_category || "general";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({
      tool_key: tool.tool_key,
      display_name: tool.display_name,
      handler_type: tool.handler_type,
      domain: tool.domain,
      risk_level: tool.risk_level,
      requires_approval: tool.requires_approval,
      mcp_server_key: tool.mcp_server_key,
    });
  }

  return { grouped, total: tools.length };
}

export async function getActiveToolsHash(env) {
  try {
    const tools = await listAgentSamTools(env);
    const keys = tools
      .map((t) => t.tool_key)
      .filter(Boolean)
      .sort()
      .join(",");
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(keys));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "tools_unavailable";
  }
}
