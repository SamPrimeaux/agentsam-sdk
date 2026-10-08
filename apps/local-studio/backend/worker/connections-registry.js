import {
  cloudflareConnectionSafeStatus,
  loadCloudflareConnectionRecord,
} from "../../../../packages/connectors/cfoa/src/index.js";
import { loadPluginRegistry, materializeCloudflarePlugin } from "./plugin-registry.js";

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
  const [cloudflareRow, secretsResult] = await Promise.all([
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
  const pluginRegistry = await loadPluginRegistry(env, userId, { includeDisabled: true });
  const cloudflarePlugin = pluginRegistry.plugins.find((row) => row.plugin_key === "agentsam-mcp") || null;
  const settingsPlugins = pluginRegistry.plugins
    .filter((row) => row.settings_visible === 1 || row.settings_visible === true ||
      row.composer_visible === 1 || row.composer_visible === true)
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
