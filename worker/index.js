function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function bindingHealth(env) {
  const result = {
    DB: { configured: Boolean(env.DB), reachable: false },
    WEBSITE_ASSETS: { configured: Boolean(env.WEBSITE_ASSETS), reachable: false },
    AGENTSAM_WAI: { configured: Boolean(env.AGENTSAM_WAI) },
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health' || url.pathname === '/api/sdk/health') {
      const bindings = await bindingHealth(env);
      const ok = bindings.DB.reachable && bindings.WEBSITE_ASSETS.reachable && bindings.AGENTSAM_WAI.configured;
      return json({
        ok,
        worker: 'agentsam-sdk',
        role: env.AGENTSAM_WORKER_ROLE || 'sdk-control-plane',
        iam_origin: env.IAM_ORIGIN || null,
        bindings,
      }, ok ? 200 : 503);
    }

    if (url.pathname === '/api/sdk/bindings') {
      return json({
        worker: 'agentsam-sdk',
        bindings: await bindingHealth(env),
      });
    }

    return json({
      error: 'not_found',
      worker: 'agentsam-sdk',
      routes: ['/', '/health', '/api/sdk/health', '/api/sdk/bindings'],
    }, 404);
  },
};
