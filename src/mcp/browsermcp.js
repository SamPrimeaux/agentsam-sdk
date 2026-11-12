/**
 * Trust boundary for Browser MCP's user-hosted stdio process.
 *
 * A stored plugin manifest or remote catalog cannot supply an arbitrary
 * executable. The only accepted local command here is the reviewed,
 * documented Browser MCP entrypoint, launched on the user's own device.
 */
export const BROWSER_MCP_NAME = 'browsermcp';
export const BROWSER_MCP_COMMAND = 'npx';
export const BROWSER_MCP_ARGS = Object.freeze(['@browsermcp/mcp@latest']);

export function isApprovedBrowserMcpStdio(server = {}) {
  return server.name === BROWSER_MCP_NAME &&
    server.protocol === 'stdio' &&
    server.command === BROWSER_MCP_COMMAND &&
    Array.isArray(server.args) &&
    server.args.length === BROWSER_MCP_ARGS.length &&
    server.args.every((arg, index) => arg === BROWSER_MCP_ARGS[index]) &&
    !server.url &&
    !server.auth?.token;
}

export function assertApprovedBrowserMcpStdio(server = {}) {
  if (!isApprovedBrowserMcpStdio(server)) {
    throw new Error('untrusted_stdio_mcp_server: only the reviewed local Browser MCP command is supported');
  }
  return server;
}
