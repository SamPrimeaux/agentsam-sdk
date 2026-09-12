export const DEFAULT_HEALTH_ORIGIN = 'https://agentsam.inneranimalmedia.com';
export const HEALTH_USER_AGENT = 'AgentSam-deploy-health/1';

export function parseWranglerVersionId(output = '') {
  const text = String(output || '');
  const m = text.match(/Current Version ID:\s*([0-9a-f-]{36})/i)
    || text.match(/Version ID:\s*([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

export function resolveHealthOrigin({ env = process.env, wranglerConfigText = '' } = {}) {
  const fromEnv = String(env.PRODUCT_HOST || env.AGENTSAM_HEALTH_ORIGIN || '').trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const m = String(wranglerConfigText || '').match(/"pattern"\s*:\s*"([^"]+)"/);
  if (m) {
    const host = m[1].trim();
    if (host.startsWith('http://') || host.startsWith('https://')) return host.replace(/\/+$/, '');
    return `https://${host.replace(/\/+$/, '')}`;
  }
  return DEFAULT_HEALTH_ORIGIN;
}

export async function probeDeployHealth(origin, { fetchImpl = globalThis.fetch, paths = ['/health', '/'] } = {}) {
  const results = {};
  for (const p of paths) {
    const url = `${String(origin).replace(/\/+$/, '')}${p}`;
    try {
      const res = await fetchImpl(url, {
        redirect: 'manual',
        headers: {
          'User-Agent': HEALTH_USER_AGENT,
          Accept: 'application/json,text/html,*/*',
        },
      });
      let body = null;
      if (p === '/health') {
        try { body = await res.json(); } catch { body = null; }
      }
      const ok = res.status >= 200 && res.status < 400;
      results[p] = {
        status: res.status,
        ok,
        ...(body && typeof body === 'object' ? {
          appOk: body.ok === true,
          cloudflareConfigured: Boolean(body?.connections?.cloudflare?.configured),
        } : {}),
      };
    } catch (err) {
      results[p] = { status: 0, ok: false, error: err.message };
    }
  }
  return {
    origin,
    results,
    ok: Object.values(results).every((r) => r.ok),
  };
}
