import { getMcpServerPreset } from './presets.js';

const DEFAULT_TOOLS = Object.freeze([
  {
    name: 'system.health',
    title: 'System health',
    description: 'Check the MCP server runtime and report its current health.',
    required_scopes: ['mcp:read'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'system.info',
    title: 'System information',
    description: 'Inspect the server manifest and its registered tool contracts.',
    required_scopes: ['mcp:read'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'text.transform',
    title: 'Transform text',
    description: 'Normalize text using trim, uppercase, lowercase, or slugify.',
    required_scopes: ['mcp:read'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'math.calculate',
    title: 'Calculate',
    description: 'Perform a validated arithmetic operation on two finite numbers.',
    required_scopes: ['mcp:read'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
]);

function slug(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized) throw new Error('mcp_project_name_required');
  return normalized;
}

function url(value, label) {
  let parsed;
  try { parsed = new URL(String(value || '').trim()); } catch { throw new Error(`mcp_${label}_must_be_absolute_url`); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`mcp_${label}_must_be_http_url`);
  }
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, parsed.pathname === '/' ? '' : '/');
}

function optionalUrl(value, label) {
  if (!String(value ?? '').trim()) return '';
  return url(value, label);
}

function normalizeScopes(input) {
  const scopes = Array.isArray(input) && input.length ? input : [{
    scope: 'mcp:read',
    label: 'MCP read access',
    description: 'Use read-only tools exposed by this MCP server.',
    category: 'mcp',
    sensitivity: 'normal',
    required: true,
  }];
  const seen = new Set();
  return scopes.map((item) => {
    const scope = String(item?.scope || '').trim();
    if (!/^[a-z][a-z0-9:_-]{0,127}$/.test(scope)) throw new Error('mcp_scope_name_invalid:' + scope);
    if (seen.has(scope)) throw new Error('mcp_scope_duplicate:' + scope);
    seen.add(scope);
    const sensitivity = ['normal', 'elevated', 'sensitive'].includes(item.sensitivity) ? item.sensitivity : 'normal';
    return {
      scope,
      label: String(item.label || scope),
      description: String(item.description || `Access ${scope}.`),
      category: String(item.category || 'general'),
      sensitivity,
      required: item.required !== false,
    };
  });
}

function buildManifest(config) {
  return {
    schema_version: 'agentsam.mcp.v1',
    name: config.projectName,
    display_name: config.displayName,
    version: config.version,
    runtime: { kind: 'cloudflare-worker', language: 'javascript' },
    transport: { kind: 'streamable_http', path: '/mcp', stateless: true },
    resource: {
      audience: config.audience,
      homepage_url: config.homepageUrl,
    },
    auth: {
      type: config.authMode,
      issuer: config.issuer,
      protected_resource_metadata: '/.well-known/oauth-protected-resource',
      verifier_env: 'MCP_TOKEN_VERIFY_URL',
      verifier_protocol: 'oauth-token-introspection-v1',
      fail_closed: config.authMode === 'oauth',
    },
    scopes: config.scopes,
    tools: DEFAULT_TOOLS,
  };
}

function workerSource(manifest) {
  return `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authorizeMcpRequest, protectedResourceMetadata } from './oauth.js';
import { registerTools } from './tools/index.js';

const manifest = ${JSON.stringify(manifest, null, 2)};

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function createServer(principal) {
  const server = new McpServer({ name: manifest.name, version: manifest.version });
  registerTools(server, { manifest, principal });
  return server;
}

export { manifest };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      const authMode = env.MCP_AUTH_MODE || manifest.auth.type;
      const issuerConfigured = Boolean(String(env.MCP_AUTH_ISSUER || manifest.auth.issuer || '').trim());
      const audienceConfigured = Boolean(String(env.MCP_RESOURCE_AUDIENCE || manifest.resource.audience || '').trim());
      const verifierConfigured = Boolean(String(env.MCP_TOKEN_VERIFY_URL || '').trim());
      const ready = authMode === 'public' || (authMode === 'oauth' && issuerConfigured && audienceConfigured && verifierConfigured);
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

    const authorization = await authorizeMcpRequest(request, manifest, env);
    if (!authorization.ok) return authorization.response;

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = createServer(authorization.principal);
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};
`;
}

function oauthSource() {
  return String.raw`function clean(value) {
  return value == null ? '' : String(value).trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value).split(/[\s,]+/).filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

function bearer(request) {
  const match = clean(request.headers.get('authorization')).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function jsonResponse(value, status, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

function unauthorized(request, error = 'invalid_token') {
  const metadataUrl = new URL('/.well-known/oauth-protected-resource', request.url).toString();
  return jsonResponse({ ok: false, error }, 401, {
    'www-authenticate': 'Bearer resource_metadata="' + metadataUrl + '"',
  });
}

function forbidden(error, details = {}) {
  return jsonResponse({ ok: false, error, ...details }, 403);
}

export function protectedResourceMetadata(manifest, env = {}) {
  const issuer = clean(env.MCP_AUTH_ISSUER) || clean(manifest.auth.issuer);
  const audience = clean(env.MCP_RESOURCE_AUDIENCE) || clean(manifest.resource.audience);
  return {
    resource: audience || undefined,
    authorization_servers: issuer ? [issuer] : [],
    scopes_supported: (manifest.scopes || []).map((item) => item.scope),
    bearer_methods_supported: ['header'],
    resource_documentation: manifest.resource.homepage_url || undefined,
  };
}

export async function authorizeMcpRequest(request, manifest, env = {}) {
  const mode = clean(env.MCP_AUTH_MODE) || clean(manifest.auth.type) || 'oauth';
  if (mode === 'public') {
    return {
      ok: true,
      principal: { kind: 'public', subject: 'public', scopes: (manifest.scopes || []).map((item) => item.scope) },
    };
  }
  if (mode !== 'oauth') {
    return { ok: false, response: jsonResponse({ ok: false, error: 'unsupported_auth_mode' }, 500) };
  }

  const issuer = clean(env.MCP_AUTH_ISSUER) || clean(manifest.auth.issuer);
  const expectedAudience = clean(env.MCP_RESOURCE_AUDIENCE) || clean(manifest.resource.audience);
  if (!issuer || !expectedAudience) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'oauth_resource_configuration_incomplete' }, 503) };
  }

  const token = bearer(request);
  if (!token) return { ok: false, response: unauthorized(request, 'bearer_token_required') };

  const verifier = clean(env.MCP_TOKEN_VERIFY_URL);
  if (!verifier) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'oauth_verifier_not_configured' }, 503) };
  }

  let verifierUrl;
  try { verifierUrl = new URL(verifier); } catch {
    return { ok: false, response: jsonResponse({ ok: false, error: 'oauth_verifier_url_invalid' }, 503) };
  }
  if (verifierUrl.protocol !== 'https:') {
    return { ok: false, response: jsonResponse({ ok: false, error: 'oauth_verifier_https_required' }, 503) };
  }

  let verified;
  try {
    const response = await fetch(verifierUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      headers: { authorization: 'Bearer ' + token, accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    verified = await response.json().catch(() => ({}));
    if (!response.ok || verified?.active !== true) {
      return { ok: false, response: unauthorized(request) };
    }
  } catch {
    return { ok: false, response: jsonResponse({ ok: false, error: 'oauth_verifier_unreachable' }, 503) };
  }

  const audiences = unique([
    ...list(verified?.aud),
    ...list(verified?.audience),
  ]);
  if (!expectedAudience || !audiences.includes(expectedAudience)) {
    return { ok: false, response: forbidden('token_audience_mismatch') };
  }

  const scopes = unique([
    ...list(verified?.scope),
    ...list(verified?.scopes),
  ]);
  const subject = clean(verified?.sub) || clean(verified?.user_id) || clean(verified?.account_id) || clean(verified?.client_id) || null;

  return {
    ok: true,
    principal: {
      kind: 'oauth',
      subject,
      account_id: clean(verified?.account_id) || null,
      user_id: clean(verified?.user_id) || null,
      client_id: clean(verified?.client_id) || null,
      scopes,
    },
  };
}
`;
}

function toolsSource() {
  return `import { z } from 'zod';

function textResult(value, structuredContent) {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    structuredContent,
  };
}

function toolError(error, details = {}) {
  return {
    isError: true,
    content: [{ type: 'text', text: error }],
    structuredContent: { error, ...details },
  };
}

function registerAuthorizedTool(server, manifest, principal, name, inputSchema, handler) {
  const definition = manifest.tools.find((item) => item.name === name);
  if (!definition) throw new Error('mcp_tool_manifest_entry_missing:' + name);

  server.registerTool(name, {
    title: definition.title,
    description: definition.description,
    inputSchema,
    annotations: definition.annotations,
  }, async (input) => {
    const granted = new Set(principal?.scopes || []);
    const required = definition.required_scopes || [];
    const missing = principal?.kind === 'public' ? [] : required.filter((scope) => !granted.has(scope));
    if (missing.length) return toolError('insufficient_scope', { missing_scopes: missing });
    return handler(input);
  });
}

export function registerTools(server, { manifest, principal }) {
  registerAuthorizedTool(server, manifest, principal, 'system.health', {}, async () => {
    const health = {
      ok: true,
      name: manifest.name,
      version: manifest.version,
      tool_count: manifest.tools.length,
      checked_at: new Date().toISOString(),
    };
    return textResult(health, health);
  });

  registerAuthorizedTool(server, manifest, principal, 'system.info', {}, async () => {
    const info = { manifest, tools: manifest.tools };
    return textResult(info, info);
  });

  registerAuthorizedTool(server, manifest, principal, 'text.transform', {
    text: z.string().max(10000),
    operation: z.enum(['trim', 'uppercase', 'lowercase', 'slugify']),
  }, async ({ text, operation }) => {
    let result = text;
    if (operation === 'trim') result = text.trim();
    if (operation === 'uppercase') result = text.toUpperCase();
    if (operation === 'lowercase') result = text.toLowerCase();
    if (operation === 'slugify') {
      result = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
    return textResult(result, { operation, result });
  });

  registerAuthorizedTool(server, manifest, principal, 'math.calculate', {
    left: z.number().finite(),
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    right: z.number().finite(),
  }, async ({ left, operation, right }) => {
    if (operation === 'divide' && right === 0) return toolError('division_by_zero');
    const result = operation === 'add' ? left + right
      : operation === 'subtract' ? left - right
        : operation === 'multiply' ? left * right
          : left / right;
    if (!Number.isFinite(result)) return toolError('calculation_result_out_of_range');
    return textResult(result, { left, operation, right, result });
  });
}
`;
}

function oauthTestSource() {
  return `import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeMcpRequest, protectedResourceMetadata } from '../src/oauth.js';

const manifest = {
  auth: { type: 'oauth', issuer: 'https://issuer.example.test' },
  resource: { audience: 'https://mcp.example.test/mcp', homepage_url: 'https://example.test' },
  scopes: [{ scope: 'mcp:read' }],
};

async function withVerifier(claims, run, status = 200) {
  const previousFetch = globalThis.fetch;
  let receivedAuthorization = null;
  globalThis.fetch = async (_url, init) => {
    receivedAuthorization = new Headers(init?.headers).get('authorization');
    return new Response(JSON.stringify(claims), { status, headers: { 'content-type': 'application/json' } });
  };
  try { await run(() => receivedAuthorization); } finally { globalThis.fetch = previousFetch; }
}

test('OAuth accepts a standard bearer header and requires an active matching audience', async () => {
  await withVerifier({ active: true, aud: ['https://mcp.example.test/mcp'], scope: 'mcp:read', sub: 'user-1' }, async (authorization) => {
    const request = new Request('https://mcp.example.test/mcp', { headers: { authorization: 'Bearer test-token' } });
    const result = await authorizeMcpRequest(request, manifest, { MCP_AUTH_MODE: 'oauth', MCP_TOKEN_VERIFY_URL: 'https://issuer.example.test/introspect' });
    assert.equal(result.ok, true);
    assert.equal(result.principal.subject, 'user-1');
    assert.deepEqual(result.principal.scopes, ['mcp:read']);
    assert.equal(authorization(), 'Bearer test-token');
  });
});

test('OAuth accepts string and array claim formats without weakening audience checks', async () => {
  await withVerifier({ active: true, audience: 'https://mcp.example.test/mcp', scopes: ['mcp:read', 'profile'], client_id: 'client-1' }, async () => {
    const request = new Request('https://mcp.example.test/mcp', { headers: { authorization: 'bEaReR token-2' } });
    const result = await authorizeMcpRequest(request, manifest, { MCP_TOKEN_VERIFY_URL: 'https://issuer.example.test/introspect' });
    assert.equal(result.ok, true);
    assert.equal(result.principal.subject, 'client-1');
    assert.deepEqual(result.principal.scopes, ['mcp:read', 'profile']);
  });
});

test('OAuth rejects missing bearer tokens before calling the verifier', async () => {
  const request = new Request('https://mcp.example.test/mcp');
  const result = await authorizeMcpRequest(request, manifest, { MCP_TOKEN_VERIFY_URL: 'https://issuer.example.test/introspect' });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
  assert.match(await result.response.text(), /bearer_token_required/);
});

test('OAuth refuses incomplete issuer and audience configuration before verifying a token', async () => {
  const request = new Request('https://mcp.example.test/mcp', { headers: { authorization: 'Bearer test-token' } });
  const unconfigured = {
    ...manifest,
    auth: { ...manifest.auth, issuer: '' },
    resource: { ...manifest.resource, audience: '' },
  };
  const result = await authorizeMcpRequest(request, unconfigured, {
    MCP_AUTH_MODE: 'oauth',
    MCP_TOKEN_VERIFY_URL: 'https://issuer.example.test/introspect',
  });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 503);
  assert.match(await result.response.text(), /oauth_resource_configuration_incomplete/);
});

test('OAuth verifier must use HTTPS', async () => {
  const request = new Request('https://mcp.example.test/mcp', { headers: { authorization: 'Bearer test-token' } });
  const result = await authorizeMcpRequest(request, manifest, { MCP_TOKEN_VERIFY_URL: 'http://issuer.example.test/introspect' });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 503);
  assert.match(await result.response.text(), /oauth_verifier_https_required/);
});

test('OAuth fails closed when the verifier is not configured', async () => {
  const request = new Request('https://mcp.example.test/mcp', { headers: { authorization: 'Bearer test-token' } });
  const result = await authorizeMcpRequest(request, manifest, {});
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 503);
  assert.match(await result.response.text(), /oauth_verifier_not_configured/);
});

test('OAuth rejects inactive tokens', async () => {
  await withVerifier({ active: false, aud: 'https://mcp.example.test/mcp', scope: 'mcp:read' }, async () => {
    const request = new Request('https://mcp.example.test/mcp', { headers: { authorization: 'Bearer revoked-token' } });
    const result = await authorizeMcpRequest(request, manifest, { MCP_TOKEN_VERIFY_URL: 'https://issuer.example.test/introspect' });
    assert.equal(result.ok, false);
    assert.equal(result.response.status, 401);
  });
});

test('OAuth rejects tokens minted for another resource', async () => {
  await withVerifier({ active: true, aud: 'https://other.example.test/mcp', scope: 'mcp:read' }, async () => {
    const request = new Request('https://mcp.example.test/mcp', { headers: { authorization: 'Bearer wrong-audience' } });
    const result = await authorizeMcpRequest(request, manifest, { MCP_TOKEN_VERIFY_URL: 'https://issuer.example.test/introspect' });
    assert.equal(result.ok, false);
    assert.equal(result.response.status, 403);
    assert.match(await result.response.text(), /token_audience_mismatch/);
  });
});

test('OAuth verifier transport failures are reported as unavailable', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network unavailable'); };
  try {
    const request = new Request('https://mcp.example.test/mcp', { headers: { authorization: 'Bearer test-token' } });
    const result = await authorizeMcpRequest(request, manifest, { MCP_TOKEN_VERIFY_URL: 'https://issuer.example.test/introspect' });
    assert.equal(result.ok, false);
    assert.equal(result.response.status, 503);
    assert.match(await result.response.text(), /oauth_verifier_unreachable/);
  } finally { globalThis.fetch = previousFetch; }
});

test('public mode is explicit and protected-resource metadata is complete', async () => {
  const request = new Request('https://mcp.example.test/mcp');
  const result = await authorizeMcpRequest(request, manifest, { MCP_AUTH_MODE: 'public' });
  assert.equal(result.ok, true);
  assert.equal(result.principal.kind, 'public');
  const metadata = protectedResourceMetadata(manifest, {});
  assert.equal(metadata.resource, 'https://mcp.example.test/mcp');
  assert.deepEqual(metadata.authorization_servers, ['https://issuer.example.test']);
  assert.deepEqual(metadata.scopes_supported, ['mcp:read']);
});
`;
}

function transportTestSource() {
  return `import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import worker, { manifest } from '../src/index.js';

async function connectClient(env, token = 'test-token') {
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp.example.test/mcp'), {
    requestInit: { headers: { authorization: 'Bearer ' + token } },
    fetch: (url, init) => worker.fetch(new Request(url, init), env),
  });
  const client = new Client({ name: 'agentsam-mcp-scaffold-test', version: '1.0.0' });
  await client.connect(transport);
  return { client, transport };
}

test('generated Worker reports readiness and resource metadata from its OAuth configuration', async () => {
  const unreadyHealth = await worker.fetch(new Request('https://mcp.example.test/health'), { MCP_AUTH_MODE: 'oauth' });
  assert.equal(unreadyHealth.status, 503);
  assert.equal((await unreadyHealth.json()).ok, false);

  const metadataWithoutVerifier = await worker.fetch(new Request('https://mcp.example.test/.well-known/oauth-protected-resource'), {});
  if (manifest.auth.issuer && manifest.resource.audience) {
    assert.equal(metadataWithoutVerifier.status, 200);
    assert.equal((await metadataWithoutVerifier.json()).resource, manifest.resource.audience);
  } else {
    assert.equal(metadataWithoutVerifier.status, 503);
  }

  const env = {
    MCP_AUTH_MODE: 'oauth',
    MCP_AUTH_ISSUER: 'https://issuer.example.test',
    MCP_RESOURCE_AUDIENCE: 'https://mcp.example.test/mcp',
    MCP_TOKEN_VERIFY_URL: 'https://issuer.example.test/introspect',
  };
  const health = await worker.fetch(new Request('https://mcp.example.test/health'), env);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).tool_count, 4);

  const metadata = await worker.fetch(new Request('https://mcp.example.test/.well-known/oauth-protected-resource'), env);
  assert.equal(metadata.status, 200);
  assert.equal((await metadata.json()).resource, 'https://mcp.example.test/mcp');
});

test('Streamable HTTP lists and executes real generated tools', async () => {
  const { client } = await connectClient({ MCP_AUTH_MODE: 'public' });
  try {
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    assert.deepEqual(names.sort(), ['math.calculate', 'system.health', 'system.info', 'text.transform']);

    const transformed = await client.callTool({ name: 'text.transform', arguments: { text: '  Inner Animal Media  ', operation: 'slugify' } });
    assert.equal(transformed.structuredContent.result, 'inner-animal-media');

    const calculated = await client.callTool({ name: 'math.calculate', arguments: { left: 7, operation: 'multiply', right: 6 } });
    assert.equal(calculated.structuredContent.result, 42);

    const health = await client.callTool({ name: 'system.health', arguments: {} });
    assert.equal(health.structuredContent.ok, true);
  } finally {
    await client.close();
  }
});

test('OAuth-authenticated tools enforce their declared scopes', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    active: true,
    aud: 'https://mcp.example.test/mcp',
    scope: 'profile',
    sub: 'user-without-mcp-read',
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const { client } = await connectClient({
      MCP_AUTH_MODE: 'oauth',
      MCP_AUTH_ISSUER: 'https://issuer.example.test',
      MCP_TOKEN_VERIFY_URL: 'https://issuer.example.test/introspect',
      MCP_RESOURCE_AUDIENCE: 'https://mcp.example.test/mcp',
    });
    try {
      const denied = await client.callTool({ name: 'math.calculate', arguments: { left: 2, operation: 'add', right: 3 } });
      assert.equal(denied.isError, true);
      assert.equal(denied.structuredContent.error, 'insufficient_scope');
      assert.deepEqual(denied.structuredContent.missing_scopes, ['mcp:read']);
    } finally {
      await client.close();
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});
`;
}

function readme(config) {
  return `# ${config.displayName}

A runnable AgentSam MCP server generated by the AgentSam SDK.

## Included tools

- \`system.health\` — runtime health and tool count.
- \`system.info\` — server manifest and tool contracts.
- \`text.transform\` — trim, uppercase, lowercase, and slugify.
- \`math.calculate\` — add, subtract, multiply, and divide with input validation.

## Run locally

\`\`\`bash
npm install
npm test
cp .dev.vars.example .dev.vars
npm run dev
\`\`\`

The local example deliberately enables public access for local protocol testing only. The Wrangler deployment configuration defaults to OAuth. Never deploy with \`MCP_AUTH_MODE=public\` for a private or customer-facing server.

## OAuth configuration

The server uses a fail-closed token introspection adapter. Set \`MCP_TOKEN_VERIFY_URL\` to an HTTPS endpoint you control that validates bearer tokens and returns an OAuth token-introspection response:

\`\`\`json
{
  "active": true,
  "aud": "${config.audience}",
  "scope": "mcp:read",
  "sub": "authenticated-subject"
}
\`\`\`

The verifier receives the incoming token in the \`Authorization: Bearer\` header. The Worker requires an active token and an exact resource audience match. Individual tools enforce their own \`required_scopes\` from \`agentsam.mcp.json\`.

Configure the verifier as a Worker secret before deploying:

\`\`\`bash
npx wrangler secret put MCP_TOKEN_VERIFY_URL
\`\`\`

Set \`MCP_AUTH_ISSUER\` and \`MCP_RESOURCE_AUDIENCE\` in \`wrangler.jsonc\` before deployment. The scaffold leaves them blank when you do not supply them, and OAuth fails closed until both are configured.

## Verify and deploy

\`\`\`bash
npm test
npm run dev
npm run deploy
\`\`\`

The generated test suite exercises OAuth failure paths, audience and scope enforcement, the Streamable HTTP handshake, tool discovery, and real tool execution.
`;
}

export function resolveMcpServerTemplateConfig(input = {}) {
  const projectName = slug(input.projectName || input.name || 'my-mcp-server');
  const preset = getMcpServerPreset(input.preset || 'heuristics');
  const authMode = String(input.authMode || preset.authMode || 'oauth').trim().toLowerCase();
  if (!['oauth', 'public'].includes(authMode)) throw new Error('mcp_auth_mode_invalid:' + authMode);
  const scopes = normalizeScopes(input.scopes || preset.scopes);
  return Object.freeze({
    projectName,
    displayName: String(input.displayName || projectName.split('-').map((part) => {
      const word = part.toLowerCase();
      return ['mcp', 'sdk', 'api', 'iam', 'cad', 'cms', 'oauth'].includes(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ')),
    preset: String(input.preset || 'heuristics'),
    version: String(input.version || '0.1.0'),
    homepageUrl: optionalUrl(input.homepageUrl ?? preset.homepageUrl, 'homepage'),
    audience: optionalUrl(input.audience ?? preset.audience, 'audience'),
    issuer: optionalUrl(input.issuer ?? preset.issuer, 'issuer'),
    authMode,
    scopes,
  });
}

export function mcpServerTemplates(input = {}) {
  const config = resolveMcpServerTemplateConfig(input);
  const manifest = buildManifest(config);
  const packageJson = {
    name: config.projectName,
    version: config.version,
    private: true,
    type: 'module',
    scripts: {
      dev: 'wrangler dev',
      deploy: 'wrangler deploy',
      test: 'node --test',
      check: 'node --check src/index.js && node --check src/oauth.js && node --check src/tools/index.js && npm test',
    },
    dependencies: {
      '@modelcontextprotocol/sdk': '1.32.1',
      zod: '4.6.7',
    },
    devDependencies: { wrangler: '4.157.0' },
  };

  return {
    'package.json': JSON.stringify(packageJson, null, 2) + '\n',
    'agentsam.mcp.json': JSON.stringify(manifest, null, 2) + '\n',
    'wrangler.jsonc': JSON.stringify({
      name: config.projectName,
      main: 'src/index.js',
      compatibility_date: '2026-11-10',
      vars: {
        MCP_AUTH_MODE: config.authMode,
        MCP_AUTH_ISSUER: config.issuer,
        MCP_RESOURCE_AUDIENCE: config.audience,
      },
    }, null, 2) + '\n',
    '.gitignore': [
      'node_modules/',
      '.wrangler/',
      '.dev.vars',
      '.dev.vars.*',
      '!.dev.vars.example',
      '.env',
      '.env.*',
      'npm-debug.log*',
      '.DS_Store',
      '',
    ].join('\n'),
    '.dev.vars.example': [
      '# LOCAL TESTING ONLY. Do not deploy a public MCP server.',
      'MCP_AUTH_MODE=public',
      '',
    ].join('\n'),
    'src/index.js': workerSource(manifest),
    'src/oauth.js': oauthSource(),
    'src/tools/index.js': toolsSource(),
    'test/oauth.test.js': oauthTestSource(),
    'test/transport.test.js': transportTestSource(),
    'README.md': readme(config),
  };
}
