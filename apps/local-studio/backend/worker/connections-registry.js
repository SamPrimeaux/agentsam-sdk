import {
  cloudflareConnectionSafeStatus,
  loadCloudflareConnectionRecord,
} from "../../../../packages/connectors/cfoa/src/index.js";
import { loadPluginRegistry, materializeCloudflarePlugin } from "./plugin-registry.js";
import { listAccountSideStages } from "./plugin-side-stages.js";

export const BYOK_PROVIDER_DEFINITIONS = Object.freeze([
  { provider: "openai", service: "openai", label: "OpenAI" },
  { provider: "anthropic", service: "anthropic", label: "Anthropic" },
  { provider: "gemini", service: "gemini", label: "Google Gemini" },
  { provider: "xai", service: "xai", label: "xAI" },
  { provider: "cursor", service: "cursor", label: "Cursor" },
  { provider: "cloudflare", service: "cloudflare", label: "Cloudflare API token" },
]);

function parseMetadata(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function canonicalByokProvider(serviceName) {
  const service = String(serviceName || "").trim().toLowerCase();
  return service === "grok" ? "xai" : service;
}


function safeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

const OAUTH_REF = /^oauth:([a-z0-9_]+):(.*)$/i;

export function parseOauthConnectionRef(secretRef) {
  const match = OAUTH_REF.exec(String(secretRef || ""));
  return match ? { provider: match[1].toLowerCase(), accountIdentifier: match[2] } : null;
}

/**
 * plugin_kind='oauth' plugins (Gmail, Drive, Calendar, GitHub) take their connection
 * state from the matching user_oauth_tokens row (via the install's secret_ref), never
 * from the catalog-v1 MCP flow.
 */
export function applyOauthPluginState(plugin, tokenRows = []) {
  // Cloudflare has its own connection and health authority. Only these
  // generic OAuth connectors should derive status from user_oauth_tokens.
  if (plugin?.plugin_kind !== "oauth" || !["google_gmail","google_drive","google_calendar","github"].includes(plugin.provider_key)) return plugin;
  const ref = parseOauthConnectionRef(plugin.secret_ref);
  const token = ref
    ? tokenRows.find((row) => String(row.provider).toLowerCase() === ref.provider
        && String(row.account_identifier) === ref.accountIdentifier)
    : null;
  const live = token && Number(token.is_active) === 1 && !token.revoked_at;
  const failing = live && token.last_refresh_error_code;
  return {
    ...plugin,
    connection_ref: ref ? ref.provider + ":" + ref.accountIdentifier : null,
    setup_status: failing ? "configured" : live ? "connected" : "unconfigured",
    health_status: failing ? "auth_error" : live ? "healthy" : "unknown",
    last_error_code: failing ? token.last_refresh_error_code : null,
  };
}

export function safePluginSettingsRecord(plugin, tools = []) {
  const pluginTools = tools.filter((tool) => tool.plugin_id === plugin.id);
  const disconnectUrl =
    typeof plugin.config?.disconnect_url === "string" &&
    plugin.config.disconnect_url.startsWith("/")
      ? plugin.config.disconnect_url
      : null;
  return {
    id: plugin.id,
    plugin_key: plugin.plugin_key,
    provider_key: plugin.provider_key,
    installation_key: plugin.installation_key,
    connection_ref: plugin.connection_ref || null,
    environment: plugin.environment,
    plugin_kind: plugin.plugin_kind,
    category: plugin.category,
    display_name: plugin.display_name,
    short_name: plugin.short_name || null,
    description: plugin.description || null,
    transport: plugin.transport,
    auth_type: plugin.auth_type,
    setup_url: plugin.oauth_connect_url || null,
    disconnect_url: disconnectUrl,
    icon_url: plugin.icon_url || null,
    icon_dark_url: plugin.icon_dark_url || null,
    icon_alt: plugin.icon_alt || null,
    icon_fit: plugin.icon_fit === "cover" ? "cover" : "contain",
    composer_visible: plugin.composer_visible === 1 || plugin.composer_visible === true,
    settings_visible: plugin.settings_visible === 1 || plugin.settings_visible === true,
    is_enabled: plugin.is_enabled === 1 || plugin.is_enabled === true,
    setup_status: plugin.setup_status || "unconfigured",
    health_strategy: plugin.health_strategy || "none",
    health_status: plugin.health_status || "unknown",
    last_health_at: plugin.last_health_at || null,
    last_healthy_at: plugin.last_healthy_at || null,
    consecutive_failures: Number(plugin.consecutive_failures || 0),
    avg_latency_ms:
      plugin.avg_latency_ms == null ? null : Number(plugin.avg_latency_ms),
    error_rate_24h: Number(plugin.error_rate_24h || 0),
    last_error_code: plugin.last_error_code || null,
    last_error_message: plugin.last_error_message || null,
    capabilities: safeStringArray(plugin.capabilities),
    tool_lanes: safeStringArray(plugin.tool_lanes),
    tool_count: pluginTools.length,
    mention_aliases: safeStringArray(plugin.mention_aliases),
  };
}

export async function loadConnectionsRegistry(env, userId) {
  const [cloudflareRow, secretsResult, oauthRecords, repositories, oauthTokenRows] = await Promise.all([
    loadCloudflareConnectionRecord(env, userId),
    env.DB.prepare(
      `SELECT id, secret_name, service_name, description, metadata_json,
              last_used_at, usage_count, created_at, updated_at
       FROM user_secrets
       WHERE account_id = ? AND is_active = 1
       ORDER BY updated_at DESC
       LIMIT 100`,
    )
      .bind(userId)
      .all(),
    env.DB.prepare(`SELECT LOWER(provider) AS provider,COUNT(*) AS active_count
      FROM user_oauth_tokens
      WHERE account_id=? AND is_active=1 AND LOWER(provider) IN ('github','google_drive','google_gmail')
      GROUP BY provider`).bind(userId).all().then(value=>({available:true,rows:value.results||[]}),
      ()=>({available:false,rows:[]})),
    env.DB.prepare(`SELECT id,provider,owner,name,repo_full_name,default_branch,is_active
      FROM code_repositories WHERE account_id=? AND is_active=1
      ORDER BY updated_at DESC LIMIT 75`).bind(userId).all().then(value=>({available:true,rows:value.results||[]}),
      ()=>({available:false,rows:[]})),
    env.DB.prepare(`SELECT LOWER(provider) AS provider,account_identifier,is_active,revoked_at,last_refresh_error_code
      FROM user_oauth_tokens WHERE account_id=?`).bind(userId).all()
      .then(value=>value.results||[],()=>[]),
  ]);

  const cloudflare = cloudflareConnectionSafeStatus(
    env,
    cloudflareRow,
    userId,
  );
  const oauthConnected = cloudflare.status === "connected";
  await materializeCloudflarePlugin(env, userId, {
    connected: oauthConnected,
    available: cloudflare.configured,
    checkSource: "page_load",
  });
  const allSideStages = await listAccountSideStages(env.DB, userId, {includeDisabled:true});
  const sideStages = allSideStages.filter(stage => stage.enabled);
  const pluginRegistry = await loadPluginRegistry(env, userId, { includeDisabled: true });
  pluginRegistry.plugins = pluginRegistry.plugins.map((row) => applyOauthPluginState(row, oauthTokenRows));
  const cloudflarePlugin = pluginRegistry.plugins.find((row) => row.plugin_key === "agentsam-mcp") || null;
  const nativeSideStage = row =>
    row.family_key === 'core' && row.plugin_kind === 'native' &&
    row.metadata?.side_stage?.renderer === 'builtin';
  const settingsPlugins = pluginRegistry.plugins
    .filter((row) => (row.settings_visible === 1 || row.settings_visible === true) && !nativeSideStage(row))
    .map((row) => safePluginSettingsRecord(row, pluginRegistry.tools));
  const composerPlugins = pluginRegistry.plugins
    .filter((row) => (row.composer_visible === 1 || row.composer_visible === true) && !nativeSideStage(row))
    .map((row) => safePluginSettingsRecord(row, pluginRegistry.tools));

  const latestByProvider = new Map();
  for (const row of secretsResult?.results || []) {
    const provider = canonicalByokProvider(row.service_name);
    if (!BYOK_PROVIDER_DEFINITIONS.some((entry) => entry.provider === provider)) continue;
    if (latestByProvider.has(provider)) continue;
    const metadata = parseMetadata(row.metadata_json);
    latestByProvider.set(provider, {
      id: row.id,
      name: row.secret_name,
      description: row.description || null,
      last4: typeof metadata.last4 === "string" ? metadata.last4 : null,
      last_used_at: row.last_used_at || null,
      usage_count: Number(row.usage_count || 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  return {
    plugins: settingsPlugins,
    // Independent views of the SAME registry, never a second authority.
    composer_plugins: composerPlugins,
    side_stages: sideStages,
    side_stage_catalog: allSideStages,
    // Non-secret OAuth evidence and registered repositories from the existing account SSOT.
    oauth_status: {
      available: oauthRecords.available,
      providers: oauthRecords.rows.map(row=>({
        provider:String(row.provider),activeCount:Number(row.active_count||0),
        status:"recorded", // token row is not proof of a successful provider API request
      })),
    },
    repositories: {
      available: repositories.available,
      items: repositories.rows.map(row=>({
        id:row.id,provider:row.provider,owner:row.owner,
        name:row.name,fullName:row.repo_full_name,defaultBranch:row.default_branch,
      })),
    },
    connections: [
      {
        provider: "cloudflare",
        plugin_key: "agentsam-mcp",
        display_name: "AgentSam MCP",
        kind: "oauth",
        status: oauthConnected ? "connected" : "not_configured",
        available: cloudflare.configured,
        client_status: cloudflare.status,
        callback_path: cloudflare.callbackPath,
        connection: cloudflare.connection,
        account_selection_required: Boolean(cloudflare.account_selection_required),
        preferred_connection_id: cloudflare.preferred_connection_id || null,
        accounts: Array.isArray(cloudflare.accounts) ? cloudflare.accounts : [],
        plugin: cloudflarePlugin ? {
          id: cloudflarePlugin.id,
          plugin_key: cloudflarePlugin.plugin_key,
          setup_status: cloudflarePlugin.setup_status,
          health_status: cloudflarePlugin.health_status,
          health_strategy: cloudflarePlugin.health_strategy,
          last_health_at: cloudflarePlugin.last_health_at,
          last_healthy_at: cloudflarePlugin.last_healthy_at,
          consecutive_failures: cloudflarePlugin.consecutive_failures,
          avg_latency_ms: cloudflarePlugin.avg_latency_ms,
          last_error_code: cloudflarePlugin.last_error_code,
        } : null,
      },
      ...BYOK_PROVIDER_DEFINITIONS.map((definition) => {
        const credential = latestByProvider.get(definition.provider) || null;
        return {
          provider: definition.provider,
          service: definition.service,
          label: definition.label,
          kind: "byok",
          status: credential ? "configured" : "missing",
          last4: credential?.last4 || null,
          credential,
        };
      }),
    ],
  };
}
