const EXPECTED_HASH = '2e60bba13dc2bc37d75dd2ce5deb25466f19cb2994e20889388948879875eae9';

export async function probeGoDeployment(origin, {
  fetchImpl = globalThis.fetch,
  expectedSource = null,
  expectedSourceCommit = null,
  expectedTarget = null,
  edge = true,
} = {}) {
  const base = String(origin).replace(/\/+$/, '');
  const results = {};
  const checks = {};
  const probedAt = new Date().toISOString();

  async function request(key, pathname, init = {}) {
    try {
      const res = await fetchImpl(base + pathname, init);
      let body = null;
      try { body = await res.json(); } catch {}
      results[key] = {
        path: pathname,
        status: res.status,
        ok: res.status >= 200 && res.status < 300,
        body,
      };
      return results[key];
    } catch (error) {
      results[key] = { path: pathname, status: 0, ok: false, error: error.message };
      return results[key];
    }
  }

  if (edge) {
    await request('edge_root', '/', { headers: { Accept: 'application/json' } });
    await request('edge_health', '/edge/health', { headers: { Accept: 'application/json' } });
  }
  await request('health', '/health', { headers: { Accept: 'application/json' } });
  await request('runtime', '/v1/runtime', { headers: { Accept: 'application/json' } });
  await request('capabilities', '/v1/capabilities', { headers: { Accept: 'application/json' } });
  await request('hash', '/v1/hash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ input: 'agentsam', algorithm: 'sha256' }),
  });
  await request('inspect', '/v1/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ files: [{ path: 'demo.css', content: '.button { color: #2563eb; }' }] }),
  });
  await request('malformed', '/v1/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ not_files: true }),
  });

  const health = results.health?.body;
  const runtime = results.runtime?.body;
  const caps = results.capabilities?.body;
  const malformed = results.malformed?.body;

  if (edge) {
    checks.edge_root = results.edge_root?.status === 200 && results.edge_root?.body?.edge === 'worker';
    checks.edge_health = results.edge_health?.status === 200 && results.edge_health?.body?.edge === 'worker';
    checks.edge_source = expectedSource
      ? results.edge_root?.body?.source === expectedSource
      : true;
  }
  checks.health = results.health?.status === 200
    && health?.ok === true
    && health?.runtime === 'go'
    && (!expectedTarget || health?.target === expectedTarget);
  checks.source_identity = expectedSource ? health?.build?.source === expectedSource : true;
  checks.source_commit = expectedSourceCommit ? health?.build?.commit === expectedSourceCommit : true;
  checks.runtime = results.runtime?.status === 200
    && runtime?.schema === 'agentsam.go-runtime.v1'
    && runtime?.os === 'linux';
  checks.capabilities = results.capabilities?.status === 200
    && caps?.schema === 'agentsam.go-capabilities.v1'
    && ['hash', 'inspect', 'runtime', 'capabilities'].every((name) => caps?.capabilities?.includes(name));
  checks.hash = results.hash?.status === 200 && results.hash?.body?.hash === EXPECTED_HASH;
  checks.inspect = results.inspect?.status === 200
    && results.inspect?.body?.findings?.some((finding) => finding.kind === 'hardcoded_color' && finding.value === '#2563eb');
  checks.error_envelope = results.malformed?.status === 400
    && malformed?.ok === false
    && malformed?.schema_version === 1
    && malformed?.reason === 'input_invalid'
    && malformed?.code === 'INVALID_ARGUMENT';

  results.deterministic_hash = { ok: checks.hash };
  results.deterministic_inspect = { ok: checks.inspect };
  results.malformed_rejected = { ok: checks.error_envelope };
  const ok = Object.values(checks).every(Boolean);
  return { origin: base, ok, checks, results, probed_at: probedAt };
}

export async function probeGoDeploymentWithRetry(origin, {
  attempts = 12,
  delayMs = 2500,
  ...options
} = {}) {
  let latest = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    latest = await probeGoDeployment(origin, options);
    latest.attempt = attempt;
    if (latest.ok) return latest;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return latest || { origin, ok: false, checks: {}, results: {}, probed_at: new Date().toISOString() };
}
