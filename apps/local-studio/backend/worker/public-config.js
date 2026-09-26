/**
 * Public non-secret Local Studio config for stock CLI / browser clients.
 * Never include secrets. Client ids are public OAuth identifiers (PKCE).
 */

function clean(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * @param {object} env Worker env (wrangler vars + secrets bindings)
 * @param {{ origin?: string }} [opts]
 */
export function buildPublicConfig(env = {}, opts = {}) {
  const origin = clean(opts.origin) || clean(env.PUBLIC_ORIGIN) || '';
  return {
    schema: 'agentsam.public-config.v1',
    app_id: 'local-studio',
    origin: origin || null,
    iam_oauth_issuer: clean(env.IAM_OAUTH_ISSUER) || null,
    iam_client_id: clean(env.IAM_CLIENT_ID) || null,
    google_client_id: clean(env.GOOGLE_CLIENT_ID) || null,
    google_desktop_client_id: clean(env.GOOGLE_DESKTOP_CLIENT_ID) || null,
    google_desktop_exchange_path: '/api/oauth/google/desktop-exchange',
    runtime_protocol: 'agentsam.runtime.v1',
    bindings_declared: {
      DB: true,
      EXECOS: true,
      PTY_SERVICE: true,
      AGENTSAM_WAI: true,
      HYPERDRIVE: true,
      WEBSITE_ASSETS: true,
      LOADER: true,
    },
  };
}

export function handlePublicConfigRequest(request, env) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8', allow: 'GET' },
    });
  }
  const url = new URL(request.url);
  const body = buildPublicConfig(env, { origin: url.origin });
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
