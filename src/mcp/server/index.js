import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authorizeMcpRequest, protectedResourceMetadata, isLoopbackRequest } from './oauth.js';
import { registerTools } from './tools/index.js';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function createMcpServer(manifest, principal, register = registerTools) {
  const server = new McpServer({ name: manifest.name, version: manifest.version });
  register(server, { manifest, principal });
  return server;
}

export function createMcpHttpHandler(manifest, { register = registerTools, authorize = authorizeMcpRequest } = {}) {
  return {
  async fetch(request, env = {}) {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      const authMode = env.MCP_AUTH_MODE || manifest.auth.type;
      const issuerConfigured = Boolean(String(env.MCP_AUTH_ISSUER || manifest.auth.issuer || '').trim());
      const audienceConfigured = Boolean(String(env.MCP_RESOURCE_AUDIENCE || manifest.resource.audience || '').trim());
      const verifierConfigured = Boolean(String(env.MCP_TOKEN_VERIFY_URL || '').trim());
      const ready = (authMode === 'public' && isLoopbackRequest(request)) || (authMode === 'oauth' && issuerConfigured && audienceConfigured && verifierConfigured);
      return jsonResponse({
        ok: ready,
        name: manifest.name,
        version: manifest.version,
        transport: manifest.transport.kind,
        auth: authMode,
        auth_configured: ready,
        issuer_configured: issuerConfigured,
        audience_configured: audienceConfigured,
        verifier_configured: authMode === 'public' || verifierConfigured,
        tool_count: manifest.tools.length,
      }, ready ? 200 : 503);
    }

    if (url.pathname === manifest.auth.protected_resource_metadata && request.method === 'GET') {
      const metadata = protectedResourceMetadata(manifest, env);
      if (!metadata.resource || !metadata.authorization_servers.length) {
        return jsonResponse({ ok: false, error: 'oauth_resource_configuration_incomplete' }, 503);
      }
      return jsonResponse(metadata);
    }

    if (url.pathname !== manifest.transport.path) {
      return new Response('Not found', { status: 404 });
    }

    const authorization = await authorize(request, manifest, env);
    if (!authorization.ok) return authorization.response;

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = createMcpServer(manifest, authorization.principal, register);
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};
}

export { authorizeMcpRequest, protectedResourceMetadata } from "./oauth.js";
export { registerTools, registerAuthorizedTool } from "./tools/index.js";
