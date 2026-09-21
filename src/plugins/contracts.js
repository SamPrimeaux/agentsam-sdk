export const AGENTSAM_PLUGIN_SCHEMA_VERSION = 1;

const KINDS = new Set(['mcp', 'api', 'oauth', 'native', 'webhook', 'database', 'storage', 'ai']);
const TRANSPORTS = new Set(['remote_jsonrpc', 'iam_mcp_catalog', 'http_rest', 'http_graphql', 'webhook', 'workers_binding', 'native', 'none']);
const AUTH_TYPES = new Set(['none', 'bridge', 'oauth', 'oauth_via_iam', 'bearer_secret', 'api_key_secret', 'workers_binding']);
const DISPATCH_TARGETS = new Set(['native', 'plugin', 'mcp', 'codemode', 'workflow']);

function clean(value) { return value == null ? '' : String(value).trim(); }
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

export function normalizePluginKey(value) {
  const key = clean(value).toLowerCase().replace(/^@/, '').replace(/^inneranimalmedia\//, '').replace(/[^a-z0-9._-]+/g, '-');
  if (!key || key.length > 80) throw new Error('invalid_plugin_key');
  return key;
}

export function normalizePluginManifest(value) {
  if (!object(value)) throw new TypeError('plugin_manifest_object_required');
  const pluginKey = normalizePluginKey(value.plugin_key || value.key);
  const kind = clean(value.plugin_kind || 'api');
  const transport = clean(value.transport || 'none');
  const authType = clean(value.auth_type || 'none');
  if (!KINDS.has(kind)) throw new Error(`invalid_plugin_kind:${kind}`);
  if (!TRANSPORTS.has(transport)) throw new Error(`invalid_plugin_transport:${transport}`);
  if (!AUTH_TYPES.has(authType)) throw new Error(`invalid_plugin_auth_type:${authType}`);
  const tools = (value.tools || []).map((tool) => {
    const toolKey = clean(tool.tool_key || tool.tool_name);
    if (!toolKey.startsWith(`${pluginKey}.`)) throw new Error(`plugin_tool_key_must_start_with:${pluginKey}.`);
    const dispatchTarget = clean(tool.dispatch_target || 'plugin');
    if (!DISPATCH_TARGETS.has(dispatchTarget)) throw new Error(`invalid_dispatch_target:${dispatchTarget}`);
    return Object.freeze({
      tool_key: toolKey,
      tool_name: clean(tool.tool_name || toolKey.replaceAll('.', '_')),
      display_name: clean(tool.display_name || toolKey),
      description: clean(tool.description),
      tool_category: clean(tool.tool_category || 'integrations'),
      handler_type: clean(tool.handler_type || 'integrations'),
      handler_key: clean(tool.handler_key || toolKey),
      dispatch_target: dispatchTarget,
      capability_key: clean(tool.capability_key || toolKey),
      input_schema: object(tool.input_schema) ? structuredClone(tool.input_schema) : { type: 'object', properties: {}, required: [], additionalProperties: false },
      output_schema: object(tool.output_schema) ? structuredClone(tool.output_schema) : null,
      handler_config: object(tool.handler_config) ? structuredClone(tool.handler_config) : {},
      intent_tags: Array.isArray(tool.intent_tags) ? [...tool.intent_tags] : [],
      risk_level: clean(tool.risk_level || 'low'),
      requires_approval: tool.requires_approval === true,
      requires_confirmation: tool.requires_confirmation === true,
      connector_visible: tool.connector_visible !== false,
      connector_access_class: clean(tool.connector_access_class || 'read'),
      is_active: tool.is_active !== false,
    });
  });
  return Object.freeze({
    schema_version: AGENTSAM_PLUGIN_SCHEMA_VERSION,
    plugin_key: pluginKey,
    provider_key: clean(value.provider_key || pluginKey),
    installation_key: clean(value.installation_key || 'default'),
    plugin_kind: kind,
    category: clean(value.category || 'integration'),
    display_name: clean(value.display_name || pluginKey),
    short_name: clean(value.short_name) || null,
    description: clean(value.description) || null,
    mention_aliases: Object.freeze(Array.isArray(value.mention_aliases) ? [...value.mention_aliases] : [`@${pluginKey}`]),
    endpoint_url: clean(value.endpoint_url) || null,
    transport,
    auth_type: authType,
    secret_ref: clean(value.secret_ref) || null,
    oauth_connect_url: clean(value.oauth_connect_url) || null,
    capabilities: Object.freeze(Array.isArray(value.capabilities) ? value.capabilities.map((row) => Object.freeze({ ...row })) : []),
    tool_lanes: Object.freeze(Array.isArray(value.tool_lanes) ? [...value.tool_lanes] : []),
    resource_scope: Object.freeze(object(value.resource_scope) ? structuredClone(value.resource_scope) : {}),
    config: Object.freeze(object(value.config) ? structuredClone(value.config) : {}),
    metadata: Object.freeze(object(value.metadata) ? structuredClone(value.metadata) : {}),
    icon_url: clean(value.icon_url) || null,
    icon_dark_url: clean(value.icon_dark_url) || null,
    icon_alt: clean(value.icon_alt) || null,
    icon_fit: clean(value.icon_fit || 'contain'),
    composer_visible: value.composer_visible !== false,
    settings_visible: value.settings_visible !== false,
    sort_priority: Number.isFinite(Number(value.sort_priority)) ? Number(value.sort_priority) : 50,
    health_strategy: clean(value.health_strategy || 'adapter'),
    tools: Object.freeze(tools),
  });
}
