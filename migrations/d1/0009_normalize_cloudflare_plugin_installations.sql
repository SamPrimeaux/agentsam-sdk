-- Cloudflare OAuth is represented by two distinct account-scoped plugin
-- installations. Preserve the row IDs so historic health evidence remains
-- attached while normalizing the public plugin contract.

ALTER TABLE agentsam_cloudflare_oauth_state ADD COLUMN return_to TEXT;

-- Local Studio's public PKCE client is the executable AgentSam MCP plugin.
UPDATE agentsam_plugins
SET plugin_key = 'agentsam-mcp',
    provider_key = 'cloudflare',
    plugin_kind = 'oauth',
    category = 'developer_platform',
    display_name = 'AgentSam MCP',
    short_name = 'AgentSam MCP',
    description = 'Connect a Cloudflare account to AgentSam through the Local Studio PKCE approval flow.',
    mention_aliases_json = '["@agentsam-mcp","agentsam mcp"]',
    endpoint_url = 'https://api.cloudflare.com/client/v4',
    transport = 'http_rest',
    auth_type = 'oauth',
    oauth_connect_url = '/api/connections/cloudflare/start',
    capabilities_json = '["cloudflare.api.docs","cloudflare.api.search","cloudflare.api.execute"]',
    tool_lanes_json = '["typed","mcp","api","codemode"]',
    resource_scope_json = '{"owner":"account","oauth_connection_table":"agentsam_cloudflare_connections"}',
    config_json = '{"oauth_authority":"cloudflare","oauth_client_id":"c0704bd7a7aab7216b362603e1985499","authorization_endpoint":"https://dash.cloudflare.com/oauth2/auth","token_endpoint":"https://dash.cloudflare.com/oauth2/token","revoke_endpoint":"https://dash.cloudflare.com/oauth2/revoke","userinfo_endpoint":"https://dash.cloudflare.com/oauth2/userinfo","callback_url":"https://agentsam.inneranimalmedia.com/api/connections/cloudflare/callback","token_auth_method":"none_pkce"}',
    metadata_json = '{"execution_strategy":"runtime_selected","client_name":"AgentSam Local Studio","client_uri":"https://agentsam.inneranimalmedia.com"}',
    health_strategy = 'oauth_probe',
    updated_at = unixepoch()
WHERE plugin_key = 'cloudflare'
  AND provider_key = 'cloudflare'
  AND installation_key = 'local-studio-pkce'
  AND auth_type = 'oauth';

-- Inner Animal Media Platform uses its own confidential Cloudflare client and
-- host-owned token resolver. It is intentionally distinct from AgentSam MCP.
UPDATE agentsam_plugins
SET plugin_key = 'inneranimalmedia-cf-oauth',
    installation_key = 'default',
    provider_key = 'cloudflare',
    plugin_kind = 'oauth',
    category = 'developer_platform',
    display_name = 'Inner Animal Media Cloudflare OAuth',
    short_name = 'IAM Cloudflare',
    description = 'Inner Animal Media Platform confidential Cloudflare OAuth connection.',
    mention_aliases_json = '["@inneranimalmedia-cf-oauth"]',
    endpoint_url = 'https://dash.cloudflare.com/oauth2/auth',
    transport = 'http_rest',
    auth_type = 'oauth_via_iam',
    oauth_connect_url = 'https://inneranimalmedia.com/api/oauth/cloudflare/start',
    resource_scope_json = '{"owner":"account","token_authority":"inneranimalmedia_platform"}',
    config_json = '{"oauth_client_id":"0f2f3c826d800118b70863d8d59e12cc","client_name":"Inner Animal Media Platform","client_uri":"https://inneranimalmedia.com","callback_url":"https://inneranimalmedia.com/api/oauth/cloudflare/callback","authorization_endpoint":"https://dash.cloudflare.com/oauth2/auth","token_endpoint":"https://dash.cloudflare.com/oauth2/token","token_auth_method":"client_secret_basic","secret_authority":"inneranimalmedia_platform_vault"}',
    metadata_json = '{"execution_strategy":"host_owned","client_visibility":"public"}',
    health_strategy = 'oauth_probe',
    updated_at = unixepoch()
WHERE plugin_key = 'cloudflare'
  AND provider_key = 'cloudflare'
  AND installation_key = 'iam-oauth'
  AND auth_type = 'oauth_via_iam';

INSERT INTO agentsam_capabilities (capability_key, domain, verb, description, is_mutating, is_active, created_at, updated_at)
VALUES
  ('cloudflare.api.docs', 'cloudflare', 'read', 'Search Cloudflare developer documentation.', 0, 1, unixepoch(), unixepoch()),
  ('cloudflare.api.search', 'cloudflare', 'search', 'Search Cloudflare OpenAPI operations.', 0, 1, unixepoch(), unixepoch()),
  ('cloudflare.api.execute', 'cloudflare', 'execute', 'Execute an approved Cloudflare API program.', 1, 1, unixepoch(), unixepoch())
ON CONFLICT(capability_key) DO UPDATE SET
  domain=excluded.domain, verb=excluded.verb, description=excluded.description,
  is_mutating=excluded.is_mutating, is_active=1, updated_at=unixepoch();

INSERT INTO agentsam_tools (
  id, tool_name, display_name, tool_category, handler_type, description,
  input_schema, handler_config, intent_tags, risk_level, requires_approval,
  requires_confirmation, is_active, tool_key, capability_key, handler_key,
  domain, oauth_visible, dispatch_target, connector_visible, connector_priority,
  connector_access_class, account_id, plugin_key, plugin_id, created_at, updated_at
)
SELECT
  'ast_' || lower(hex(randomblob(8))),
  'agentsam_mcp_docs__' || p.id,
  'Cloudflare docs', 'integrations', 'cf', 'Search Cloudflare developer documentation.',
  '{"type":"object","properties":{"query":{"type":"string"}},"required":["query"],"additionalProperties":false}',
  '{"server_url":"https://mcp.cloudflare.com/mcp","remote_tool":"docs"}',
  '["cloudflare","docs","search"]', 'low', 0, 0, 1,
  'agentsam-mcp.docs', 'cloudflare.api.docs', 'agentsam-mcp.docs',
  'cloudflare', 1, 'mcp', 1, 50, 'read', p.account_id, p.plugin_key, p.id, unixepoch(), unixepoch()
FROM agentsam_plugins p
WHERE p.plugin_key = 'agentsam-mcp' AND p.installation_key = 'local-studio-pkce'
  AND NOT EXISTS (SELECT 1 FROM agentsam_tools t WHERE t.plugin_id = p.id AND t.tool_key = 'agentsam-mcp.docs');

INSERT INTO agentsam_tools (
  id, tool_name, display_name, tool_category, handler_type, description,
  input_schema, handler_config, intent_tags, risk_level, requires_approval,
  requires_confirmation, is_active, tool_key, capability_key, handler_key,
  domain, oauth_visible, dispatch_target, connector_visible, connector_priority,
  connector_access_class, account_id, plugin_key, plugin_id, created_at, updated_at
)
SELECT
  'ast_' || lower(hex(randomblob(8))),
  'agentsam_mcp_search__' || p.id,
  'Search Cloudflare API', 'integrations', 'cf', 'Search Cloudflare OpenAPI operations before executing code.',
  '{"type":"object","properties":{"query":{"type":"string"}},"required":["query"],"additionalProperties":false}',
  '{"server_url":"https://mcp.cloudflare.com/mcp","remote_tool":"search","network":"none"}',
  '["cloudflare","openapi","search"]', 'low', 0, 0, 1,
  'agentsam-mcp.search', 'cloudflare.api.search', 'agentsam-mcp.search',
  'cloudflare', 1, 'plugin', 1, 50, 'read', p.account_id, p.plugin_key, p.id, unixepoch(), unixepoch()
FROM agentsam_plugins p
WHERE p.plugin_key = 'agentsam-mcp' AND p.installation_key = 'local-studio-pkce'
  AND NOT EXISTS (SELECT 1 FROM agentsam_tools t WHERE t.plugin_id = p.id AND t.tool_key = 'agentsam-mcp.search');

INSERT INTO agentsam_tools (
  id, tool_name, display_name, tool_category, handler_type, description,
  input_schema, handler_config, intent_tags, risk_level, requires_approval,
  requires_confirmation, is_active, tool_key, capability_key, handler_key,
  domain, oauth_visible, dispatch_target, connector_visible, connector_priority,
  connector_access_class, account_id, plugin_key, plugin_id, created_at, updated_at
)
SELECT
  'ast_' || lower(hex(randomblob(8))),
  'agentsam_mcp_execute__' || p.id,
  'Execute Cloudflare API', 'integrations', 'cf', 'Run an approved AgentSam Cloudflare API program.',
  '{"type":"object","properties":{"code":{"type":"string"},"account_id":{"type":"string"}},"required":["code"],"additionalProperties":false}',
  '{"server_url":"https://mcp.cloudflare.com/mcp","remote_tool":"execute","network":"cloudflare_api_only"}',
  '["cloudflare","api","execute"]', 'high', 1, 1, 1,
  'agentsam-mcp.execute', 'cloudflare.api.execute', 'agentsam-mcp.execute',
  'cloudflare', 1, 'codemode', 1, 50, 'write', p.account_id, p.plugin_key, p.id, unixepoch(), unixepoch()
FROM agentsam_plugins p
WHERE p.plugin_key = 'agentsam-mcp' AND p.installation_key = 'local-studio-pkce'
  AND NOT EXISTS (SELECT 1 FROM agentsam_tools t WHERE t.plugin_id = p.id AND t.tool_key = 'agentsam-mcp.execute');

INSERT INTO agentsam_tool_capabilities (tool_id, capability_key, requirement_type, is_primary, operations_json, created_at)
SELECT t.id, t.capability_key, 'required', 1, json_array(t.handler_key), unixepoch()
FROM agentsam_tools t
JOIN agentsam_plugins p ON p.id = t.plugin_id
WHERE p.plugin_key = 'agentsam-mcp' AND p.installation_key = 'local-studio-pkce'
  AND t.tool_key IN ('agentsam-mcp.docs', 'agentsam-mcp.search', 'agentsam-mcp.execute')
  AND NOT EXISTS (
    SELECT 1 FROM agentsam_tool_capabilities c
    WHERE c.tool_id = t.id AND c.capability_key = t.capability_key
  );
