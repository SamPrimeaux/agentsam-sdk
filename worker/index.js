function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function configured(value) {
  return value != null && String(value).trim().length > 0;
}

async function bindingHealth(env = {}) {
  const result = {
    DB: { configured: Boolean(env.DB), reachable: false },
    WEBSITE_ASSETS: { configured: Boolean(env.WEBSITE_ASSETS), reachable: false },
    AGENTSAM_WAI: { configured: Boolean(env.AGENTSAM_WAI), optional: true },
  };

  if (env.DB) {
    try {
      const row = await env.DB.prepare('SELECT 1 AS ok').first();
      result.DB.reachable = Number(row?.ok) === 1;
    } catch (error) {
      result.DB.error = error?.message || String(error);
    }
  }

  if (env.WEBSITE_ASSETS) {
    try {
      await env.WEBSITE_ASSETS.head('__agentsam_sdk_binding_probe__');
      result.WEBSITE_ASSETS.reachable = true;
    } catch (error) {
      result.WEBSITE_ASSETS.error = error?.message || String(error);
    }
  }

  return result;
}

export async function sdkWorkerHealth(env = {}) {
  const bindings = await bindingHealth(env);
  const auth = {
    iam_origin: configured(env.IAM_ORIGIN) ? String(env.IAM_ORIGIN).replace(/\/+$/, '') : null,
    iam_client_id: configured(env.IAM_CLIENT_ID),
    iam_client_secret: configured(env.IAM_CLIENT_SECRET),
    agentsam_sdk_key: configured(env.AGENTSAM_SDK_KEY),
    agentsam_bridge_key: configured(env.AGENTSAM_BRIDGE_KEY),
  };

  const storageReady = bindings.DB.reachable && bindings.WEBSITE_ASSETS.reachable;
  const authReady = Boolean(
    auth.iam_origin && auth.iam_client_id && auth.iam_client_secret && auth.agentsam_sdk_key && auth.agentsam_bridge_key,
  );

  return {
    ok: storageReady && authReady,
    service: 'agentsam-sdk',
    contract: 'sdk-identity-auth/v1',
    storage: {
      db: bindings.DB,
      website_assets: bindings.WEBSITE_ASSETS,
    },
    ai: {
      workers_ai: bindings.AGENTSAM_WAI,
      ollama: {
        edge_binding: false,
        local_cli: true,
      },
    },
    auth,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health' || url.pathname === '/api/sdk/health') {
      const health = await sdkWorkerHealth(env);
      return json(health, health.ok ? 200 : 503);
    }

    if (url.pathname === '/api/sdk/bindings') {
      return json({
        worker: 'agentsam-sdk',
        bindings: await bindingHealth(env),
        ollama: { edge_binding: false, local_cli: true },
      });
    }

    return json({
      error: 'not_found',
      worker: 'agentsam-sdk',
      routes: ['/', '/health', '/api/sdk/health', '/api/sdk/bindings'],
    }, 404);
  },
};
