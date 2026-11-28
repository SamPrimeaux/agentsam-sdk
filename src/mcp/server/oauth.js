function clean(value) {
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

export function isLoopbackRequest(request) {
  const url = new URL(request.url);
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

export async function authorizeMcpRequest(request, manifest, env = {}) {
  const mode = clean(env.MCP_AUTH_MODE) || clean(manifest.auth.type) || 'oauth';
  if (mode === 'public') {
    if (!isLoopbackRequest(request)) return { ok: false, response: forbidden('public_mcp_loopback_only') };
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

  if (clean(verified?.iss) !== issuer) {
    return { ok: false, response: forbidden('token_issuer_mismatch') };
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
