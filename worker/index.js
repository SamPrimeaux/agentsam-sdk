function configured(value) {
  return value != null && String(value).trim().length > 0;
}

function health(env = {}) {
  return {
    ok: true,
    service: 'agentsam-sdk',
    contract: 'sdk-identity-auth/v1',
    storage: {
      db: Boolean(env.DB),
      website_assets: Boolean(env.WEBSITE_ASSETS),
    },
    auth: {
      iam_origin: configured(env.IAM_ORIGIN) ? String(env.IAM_ORIGIN).replace(/\/+$/, '') : null,
      iam_client_id: configured(env.IAM_CLIENT_ID),
      iam_client_secret: configured(env.IAM_CLIENT_SECRET),
      agentsam_sdk_key: configured(env.AGENTSAM_SDK_KEY),
      agentsam_bridge_key: configured(env.AGENTSAM_BRIDGE_KEY),
    },
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return Response.json(health(env), {
        headers: { 'cache-control': 'no-store' },
      });
    }
    return new Response('Not found', { status: 404 });
  },
};

export { health as sdkWorkerHealth };
