import { normalizePluginManifest } from './contracts.js';
import { BROWSER_MCP_ARGS, BROWSER_MCP_COMMAND } from '../mcp/browsermcp.js';

/**
 * Browser MCP is a device-local integration, not a remotely callable Worker.
 * Register the account-facing plugin without registering phantom executable
 * tools. The host discovers the real `browser` tool from its authorized
 * local stdio session after the user approves the Chrome extension.
 */
export const BROWSER_MCP_PLUGIN_MANIFEST = normalizePluginManifest({
  plugin_key: 'browsermcp',
  provider_key: 'browsermcp',
  plugin_kind: 'native',
  family_key: 'connections',
  category: 'browser',
  display_name: 'Browser MCP',
  short_name: 'Browser MCP',
  description: 'Use the Browser MCP extension in your existing Chrome profile through an approved local MCP server.',
  mention_aliases: ['@browsermcp', 'Browser MCP'],
  transport: 'native',
  auth_type: 'none',
  tool_lanes: ['mcp'],
  resource_scope: { owner: 'account', execution_host: 'user_device', local_only: true },
  config: {
    server_name: 'browsermcp',
    protocol: 'stdio',
    command: BROWSER_MCP_COMMAND,
    args: [...BROWSER_MCP_ARGS],
    minimum_node_major: 20,
    setup_command: 'agentsam mcp add browsermcp --client agentsam',
    status_command: 'agentsam mcp doctor browsermcp',
    documentation_url: 'https://browsermcp.io/docs',
  },
  metadata: {
    execution_strategy: 'user_hosted_stdio',
    runtime_tools_dynamic: true,
    user_approval: 'browser_extension_six_digit_pairing',
    cloud_worker_execution: false,
    browser_profile_access_requires_explicit_permission: true,
    vendor: 'Browser MCP',
    source_url: 'https://github.com/BrowserMCP/mcp',
  },
  health_strategy: 'adapter',
  composer_visible: false,
  settings_visible: true,
  tools: [],
});
