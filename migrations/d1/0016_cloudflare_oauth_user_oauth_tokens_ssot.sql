-- Point AgentSam MCP plugin resource_scope at user_oauth_tokens (SSOT).
-- Legacy agentsam_cloudflare_connections is no longer the connection store.

UPDATE agentsam_plugins
SET resource_scope_json = '{"owner":"account","oauth_connection_table":"user_oauth_tokens"}',
    updated_at = unixepoch()
WHERE plugin_key = 'agentsam-mcp'
  AND provider_key = 'cloudflare'
  AND auth_type = 'oauth'
  AND (
    resource_scope_json LIKE '%agentsam_cloudflare_connections%'
    OR resource_scope_json IS NULL
    OR TRIM(resource_scope_json) = ''
  );
