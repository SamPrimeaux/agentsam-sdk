import { getMcpServerPreset } from './presets.js';

function slug(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized) throw new Error('mcp_project_name_required');
  return normalized;
}

// Deterministic seed helpers for generated migrations. SQL literals only --
// no JS-generated timestamps (SQL unixepoch() is authoritative), no free
// text passed through unescaped.
function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
function sqlStringOrNull(value) {
  const v = value == null ? '' : String(value).trim();
  return v ? sqlString(v) : 'NULL';
}

function buildManifest(config) {
  return {
    schema_version: 'agentsam.mcp.v1',
    name: config.projectName,
    display_name: config.displayName,
    runtime: { kind: 'cloudflare-worker', language: 'javascript' },
    transport: { kind: 'streamable_http', path: '/mcp', stateless: true },
    resource: {
      audience: config.audience,
      homepage_url: config.homepageUrl,
      company_slug: config.companySlug,
    },
    auth: {
      type: config.authMode,
      issuer: config.issuer,
      protected_resource_metadata: '/.well-known/oauth-protected-resource',
      verifier_env: 'MCP_TOKEN_VERIFY_URL',
      fail_closed: config.authMode === 'oauth',
    },
    scopes: config.scopes,
  };
}

function workerSource(manifest) {
  const manifestLiteral = JSON.stringify(manifest, null, 2);
  return `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { authorizeMcpRequest, protectedResourceMetadata } from './oauth.js';

const manifest = ${manifestLiteral};

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

function createServer() {
  const server = new McpServer({ name: manifest.name, version: '0.1.0' });

  server.registerTool(
    'mcp_manifest',
    {
      title: 'MCP Manifest',
      description: 'Return this generated MCP server contract.',
      inputSchema: {},
    },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(manifest, null, 2) }],
    }),
  );

  return server;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return jsonResponse({
        ok: true,
        name: manifest.name,
        transport: manifest.transport.kind,
        auth: manifest.auth.type,
      });
    }

    if (url.pathname === '/.well-known/oauth-protected-resource') {
      return jsonResponse(protectedResourceMetadata(manifest, env));
    }

    if (url.pathname !== manifest.transport.path) {
      return new Response('Not found', { status: 404 });
    }

    const auth = await authorizeMcpRequest(request, manifest, env);
    if (!auth.ok) return auth.response;

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = createServer();
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};
`;
}

function oauthSource() {
  return `function clean(value) {
  return value == null ? '' : String(value).trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return clean(value).split(/[\\\\s,]+/).filter(Boolean);
}

function bearer(request) {
  const match = clean(request.headers.get('authorization')).match(/^Bearer\\\\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function unauthorized(request, error = 'invalid_token') {
  const metadataUrl = new URL('/.well-known/oauth-protected-resource', request.url).toString();
  return new Response(JSON.stringify({ ok: false, error }), {
    status: 401,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'www-authenticate': \`Bearer resource_metadata="\${metadataUrl}"\`,
    },
  });
}

export function protectedResourceMetadata(manifest, env = {}) {
  const issuer = clean(env.MCP_AUTH_ISSUER) || manifest.auth.issuer;
  const audience = clean(env.MCP_RESOURCE_AUDIENCE) || manifest.resource.audience;
  return {
    resource: audience,
    authorization_servers: issuer ? [issuer] : [],
    scopes_supported: (manifest.scopes || []).map((item) => item.scope),
    bearer_methods_supported: ['header'],
    resource_documentation: manifest.resource.homepage_url || undefined,
  };
}

export async function authorizeMcpRequest(request, manifest, env = {}) {
  const mode = clean(env.MCP_AUTH_MODE) || manifest.auth.type || 'oauth';
  if (mode === 'public') return { ok: true, principal: { kind: 'public' } };
  if (mode !== 'oauth') {
    return {
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'unsupported_auth_mode' }), {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    };
  }

  const token = bearer(request);
  if (!token) return { ok: false, response: unauthorized(request, 'bearer_token_required') };

  const verifier = clean(env.MCP_TOKEN_VERIFY_URL);
  if (!verifier) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'oauth_verifier_not_configured' }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    };
  }

  let verified;
  try {
    const response = await fetch(verifier, {
      headers: { authorization: \`Bearer \${token}\`, accept: 'application/json' },
    });
    verified = await response.json().catch(() => ({}));
    if (!response.ok || verified?.active === false || verified?.ok === false) {
      return { ok: false, response: unauthorized(request) };
    }
  } catch {
    return {
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'oauth_verifier_unreachable' }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    };
  }

  const expectedAudience = clean(env.MCP_RESOURCE_AUDIENCE) || manifest.resource.audience;
  const audiences = list(verified?.aud ?? verified?.audience);
  if (expectedAudience && !audiences.includes(expectedAudience)) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'token_audience_mismatch' }), {
        status: 403,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    };
  }

  return { ok: true, principal: verified };
}
`;
}

function companyMigration(config) {
  return `-- Portable identity issuer-brand SSOT.
CREATE TABLE IF NOT EXISTS company (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT,
  auth_bg_color TEXT,
  support_email TEXT,
  website_url TEXT,
  tagline TEXT,
  meta_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_slug ON company(slug);

INSERT OR IGNORE INTO company (
  id, slug, name, website_url, created_at, updated_at
) VALUES (
  ${sqlString(`co_${config.companySlug}`)},
  ${sqlString(config.companySlug)},
  ${sqlString(config.displayName)},
  ${sqlStringOrNull(config.homepageUrl)},
  unixepoch(),
  unixepoch()
);
`;
}

function consentCatalogMigration(config) {
  return `-- OAuth resource/scope semantics. Issuer branding remains in company.
CREATE TABLE IF NOT EXISTS identity_oauth_resources (
  id TEXT PRIMARY KEY NOT NULL,
  audience TEXT NOT NULL UNIQUE,
  resource_type TEXT NOT NULL DEFAULT 'mcp',
  display_name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  homepage_url TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_oauth_scopes (
  scope TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  sensitivity TEXT NOT NULL DEFAULT 'normal'
    CHECK (sensitivity IN ('normal','elevated','sensitive')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 50,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_oauth_resource_scopes (
  resource_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 50,
  PRIMARY KEY (resource_id, scope),
  FOREIGN KEY (resource_id) REFERENCES identity_oauth_resources(id) ON DELETE CASCADE,
  FOREIGN KEY (scope) REFERENCES identity_oauth_scopes(scope) ON DELETE CASCADE
);

INSERT OR IGNORE INTO identity_oauth_resources (
  id, audience, display_name, homepage_url, created_at, updated_at
) VALUES (
  ${sqlString(`res_${config.projectName}`)},
  ${sqlString(config.audience)},
  ${sqlString(config.displayName)},
  ${sqlStringOrNull(config.homepageUrl)},
  unixepoch(),
  unixepoch()
);
${(config.scopes || []).map((s) => `
INSERT OR IGNORE INTO identity_oauth_scopes (
  scope, label, description, category, sensitivity, created_at, updated_at
) VALUES (
  ${sqlString(s.scope)},
  ${sqlString(s.label)},
  ${sqlString(s.description)},
  ${sqlString(s.category)},
  ${sqlString(s.sensitivity)},
  unixepoch(),
  unixepoch()
);

INSERT OR IGNORE INTO identity_oauth_resource_scopes (
  resource_id, scope
) VALUES (
  ${sqlString(`res_${config.projectName}`)},
  ${sqlString(s.scope)}
);
`).join('')}
`;
}

export function resolveMcpServerTemplateConfig(input = {}) {
  const preset = getMcpServerPreset(input.preset || 'heuristics');
  const projectName = slug(input.projectName || input.name || 'my-mcp-server');
  return Object.freeze({
    preset: preset.key,
    projectName,
    displayName: String(input.displayName || preset.displayName || projectName),
    companyName: String(input.companyName || preset.companyName || 'Your Company'),
    companySlug: String(input.companySlug || preset.companySlug || 'default'),
    homepageUrl: String(input.homepageUrl || preset.homepageUrl),
    audience: String(input.audience || preset.audience),
    issuer: String(input.issuer || preset.issuer),
    authMode: String(input.authMode || preset.authMode || 'oauth'),
    scopes: Array.isArray(input.scopes) ? input.scopes : preset.scopes,
  });
}

export function mcpServerTemplates(input = {}) {
  const config = resolveMcpServerTemplateConfig(input);
  const manifest = buildManifest(config);

  return {
    'package.json': JSON.stringify({
      name: config.projectName,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: { dev: 'wrangler dev', deploy: 'wrangler deploy' },
      dependencies: {
        '@modelcontextprotocol/sdk': '1.30.0',
        zod: '4.6.5',
      },
      devDependencies: { wrangler: '4.141.0' },
    }, null, 2) + '\n',

    'agentsam.mcp.json': JSON.stringify(manifest, null, 2) + '\n',

    'wrangler.jsonc': JSON.stringify({
      name: config.projectName,
      main: 'src/index.js',
      compatibility_date: '2026-09-27',
      vars: {
        MCP_AUTH_MODE: config.authMode,
        MCP_AUTH_ISSUER: config.issuer,
        MCP_RESOURCE_AUDIENCE: config.audience,
      },
    }, null, 2) + '\n',

    '.dev.vars.example': [
      '# Local-only proof. Production remains fail-closed OAuth.',
      'MCP_AUTH_MODE=public',
      '# MCP_TOKEN_VERIFY_URL=https://your-issuer.example/api/oauth/token/verify',
      '',
    ].join('\n'),

    'src/index.js': workerSource(manifest),
    'src/oauth.js': oauthSource(),
    'migrations/001_identity_company.sql': companyMigration(config),
    'migrations/002_oauth_consent_catalog.sql': consentCatalogMigration(config),

    'README.md': `# ${config.displayName}

Generated by AgentSam MCP factory.

- MCP Streamable HTTP: \`/mcp\`
- Protected-resource metadata: \`/.well-known/oauth-protected-resource\`
- OAuth is fail-closed by default.
- Configure \`MCP_TOKEN_VERIFY_URL\` with a verifier that returns token audience and scope data.
- Issuer branding comes from the portable \`company\` table.
- OAuth resource and scope semantics are separate from issuer branding.

For local protocol testing only, copy \`.dev.vars.example\` to \`.dev.vars\`.
`,
  };
}
