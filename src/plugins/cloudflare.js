import { normalizePluginManifest } from './contracts.js';

export const AGENTSAM_MCP_PLUGIN_MANIFEST = normalizePluginManifest({
  plugin_key: 'agentsam-mcp',
  provider_key: 'cloudflare',
  plugin_kind: 'oauth',
  category: 'developer_platform',
  display_name: 'AgentSam MCP',
  short_name: 'AgentSam MCP',
  description: 'Connect a Cloudflare account to AgentSam through the centralized OAuth approval flow.',
  mention_aliases: ['@agentsam-mcp', 'agentsam mcp'],
  endpoint_url: 'https://api.cloudflare.com/client/v4',
  transport: 'http_rest',
  auth_type: 'oauth',
  oauth_connect_url: '/api/connections/cloudflare/start',
  capabilities: [
    { capability_key: 'cloudflare.api.docs', domain: 'cloudflare', verb: 'read', description: 'Search Cloudflare developer documentation.', is_mutating: false },
    { capability_key: 'cloudflare.api.search', domain: 'cloudflare', verb: 'search', description: 'Search the Cloudflare OpenAPI operation catalog.', is_mutating: false },
    { capability_key: 'cloudflare.api.execute', domain: 'cloudflare', verb: 'execute', description: 'Execute a bounded Cloudflare API Code Mode program.', is_mutating: true },
  ],
  tool_lanes: ['typed', 'mcp', 'api', 'codemode'],
  resource_scope: { owner: 'account', oauth_connection_table: 'agentsam_cloudflare_connections' },
  config: {
    oauth_authority: 'cloudflare',
    oauth_client_id: 'c0704bd7a7aab7216b362603e1985499',
    authorization_endpoint: 'https://dash.cloudflare.com/oauth2/auth',
    token_endpoint: 'https://dash.cloudflare.com/oauth2/token',
    revoke_endpoint: 'https://dash.cloudflare.com/oauth2/revoke',
    userinfo_endpoint: 'https://dash.cloudflare.com/oauth2/userinfo',
    jwks_uri: 'https://dash.cloudflare.com/.well-known/jwks.json',
    openid_configuration: 'https://dash.cloudflare.com/.well-known/openid-configuration',
    disconnect_url: '/api/connections/cloudflare/disconnect',
    status_url: '/api/connections/cloudflare',
  },
  metadata: { execution_strategy: 'runtime_selected', code_mode_is_plugin: false },
  health_strategy: 'oauth_probe',
  tools: [
    {
      tool_key: 'agentsam-mcp.docs', tool_name: 'agentsam_mcp_docs', display_name: 'Cloudflare docs',
      description: 'Search Cloudflare developer documentation.', handler_type: 'cf', dispatch_target: 'mcp',
      capability_key: 'cloudflare.api.docs', handler_config: { server_url: 'https://mcp.cloudflare.com/mcp', remote_tool: 'docs' },
      input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
      risk_level: 'low', connector_access_class: 'read', intent_tags: ['cloudflare', 'docs', 'search'],
    },
    {
      tool_key: 'agentsam-mcp.search', tool_name: 'agentsam_mcp_search', display_name: 'Search Cloudflare API',
      description: 'Search Cloudflare’s current OpenAPI spec for operations before executing code.', handler_type: 'cf', dispatch_target: 'plugin',
      capability_key: 'cloudflare.api.search', handler_config: { server_url: 'https://mcp.cloudflare.com/mcp', remote_tool: 'search', network: 'none' },
      input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
      risk_level: 'low', connector_access_class: 'read', intent_tags: ['cloudflare', 'openapi', 'search'],
    },
    {
      tool_key: 'agentsam-mcp.execute', tool_name: 'agentsam_mcp_execute', display_name: 'Execute Cloudflare API',
      description: 'Run an approved AgentSam Cloudflare program with the connected OAuth token kept outside generated code.', handler_type: 'cf', dispatch_target: 'codemode',
      capability_key: 'cloudflare.api.execute', handler_config: { server_url: 'https://mcp.cloudflare.com/mcp', remote_tool: 'execute', network: 'cloudflare_api_only' },
      input_schema: { type: 'object', properties: { code: { type: 'string' }, account_id: { type: 'string' } }, required: ['code'], additionalProperties: false },
      risk_level: 'high', requires_approval: true, requires_confirmation: true, connector_access_class: 'write', intent_tags: ['cloudflare', 'api', 'execute'],
    },
  ],
});

// Backward-compatible export name for early SDK adopters. The installed
// identity is @agentsam-mcp; Cloudflare is the provider and OAuth authority.
export const CLOUDFLARE_PLUGIN_MANIFEST = AGENTSAM_MCP_PLUGIN_MANIFEST;
