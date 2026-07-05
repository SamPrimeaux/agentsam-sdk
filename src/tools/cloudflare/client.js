const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

export function readCloudflareEnv(env = process.env) {
  return {
    token: env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '',
    accountId: env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '',
  };
}

export function requireCloudflareEnv(env = process.env) {
  const cfg = readCloudflareEnv(env);
  const missing = [];
  if (!cfg.token) missing.push('CLOUDFLARE_API_TOKEN');
  if (!cfg.accountId) missing.push('CLOUDFLARE_ACCOUNT_ID');
  if (missing.length) {
    const error = new Error(`Missing Cloudflare environment: ${missing.join(', ')}`);
    error.code = 'cloudflare_env_missing';
    error.details = { missing };
    throw error;
  }
  return cfg;
}

export async function cfGet(path, token) {
  const res = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    const message = data?.errors?.[0]?.message || data?.message || `Cloudflare HTTP ${res.status}`;
    const error = new Error(message);
    error.code = 'cloudflare_api_error';
    error.details = { status: res.status, errors: data?.errors, path };
    throw error;
  }
  return data;
}
