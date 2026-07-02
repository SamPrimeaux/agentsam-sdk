/**
 * IAM CORE client — SDK is a delivery mechanism; intelligence lives server-side.
 */

const DEFAULT_CORE = 'https://inneranimalmedia.com';

export function coreBaseUrl() {
  return (process.env.IAM_CORE_URL || process.env.AGENTSAM_CORE_URL || DEFAULT_CORE).replace(/\/$/, '');
}

export async function postJson(path, body, token) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${coreBaseUrl()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  return data;
}

export async function getJson(path, token) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${coreBaseUrl()}${path}`, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  return data;
}

/**
 * Stream NDJSON from POST /api/sdk/scaffold — calls onEvent for each line.
 */
export async function streamScaffold(body, token, onEvent) {
  const res = await fetch(`${coreBaseUrl()}/api/sdk/scaffold`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `scaffold HTTP ${res.status}`);
  }
  if (!res.body) throw new Error('scaffold stream missing');

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let evt;
      try {
        evt = JSON.parse(t);
      } catch {
        continue;
      }
      await onEvent(evt);
    }
  }
  const tail = buf.trim();
  if (tail) {
    try {
      await onEvent(JSON.parse(tail));
    } catch {
      /* ignore */
    }
  }
}
